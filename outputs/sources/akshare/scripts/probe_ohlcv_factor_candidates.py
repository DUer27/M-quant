#!/usr/bin/env python3
"""Probe new OHLCV factor candidates with real AkShare local history."""

from __future__ import annotations

import importlib.util
import json
import math
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
AK_DIR = ROOT / "outputs" / "sources" / "akshare"
SCRIPT_PATH = AK_DIR / "scripts" / "build_ohlcv_factor_backtest.py"
INPUT_PATH = AK_DIR / "processed" / "a_share_daily_20240101_20260709_qfq.csv"
RESULT_PATH = AK_DIR / "results" / "akshare_new_factor_probe_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "akshare-new-factor-probe-20260709.md"
HORIZONS = [5, 10, 20]
GATES = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.015,
    "min_rank_ic_t": 2.0,
    "min_long_short": 0.0,
    "min_long_short_positive_ratio": 0.53,
}


def load_backtest_module():
    spec = importlib.util.spec_from_file_location("ak_ohlcv_backtest", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def clean_float(value):
    if value is None:
        return None
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def add_candidate_columns(df: pd.DataFrame, bt) -> tuple[pd.DataFrame, list[dict]]:
    out = df.copy()
    out["raw_vol_adj_momentum"] = out["ret_20"] / (out["vol20"] * np.sqrt(20)).replace(0, np.nan)
    out["raw_volume_dry_up_reversal"] = (
        -out["ret_5"].clip(-0.2, 0.2)
        + 0.70 * (1 - out["activity_ratio20"].clip(0.2, 5) / 5)
        + 0.30 * out["lower_shadow_ratio"].fillna(0)
    )
    out["raw_price_volume_elasticity"] = out["ret_20"].clip(-0.3, 0.5) / np.log(
        out["activity_ratio20"].clip(1.0, 8)
    ).replace(0, np.nan)
    out["raw_orderly_trend"] = (
        out["ret_20"].clip(-0.3, 0.5)
        - 1.50 * out["vol20"].fillna(0)
        - 0.50 * out["close_ma20_gap"].clip(lower=0).fillna(0)
    )
    out["raw_gap_repair_quality"] = (
        out["close_position"].fillna(0)
        + out["lower_shadow_ratio"].fillna(0)
        - out["upper_shadow_ratio"].fillna(0)
        - out["ret_1"].clip(lower=0).fillna(0)
    )
    candidates = [
        {
            "factor_id": "ak_vol_adj_momentum",
            "name": "AkShare波动调整动量",
            "raw_column": "raw_vol_adj_momentum",
            "hypothesis": "20日趋势若能用更低波动实现，持续性应更高。",
        },
        {
            "factor_id": "ak_volume_dry_up_reversal",
            "name": "AkShare缩量回撤反转",
            "raw_column": "raw_volume_dry_up_reversal",
            "hypothesis": "短线回撤、缩量和下影承接共同刻画抛压衰减后的反转。",
        },
        {
            "factor_id": "ak_price_volume_elasticity",
            "name": "AkShare价量弹性",
            "raw_column": "raw_price_volume_elasticity",
            "hypothesis": "同等成交活跃度下更高价格推进代表更高趋势效率。",
        },
        {
            "factor_id": "ak_orderly_trend",
            "name": "AkShare有序趋势",
            "raw_column": "raw_orderly_trend",
            "hypothesis": "趋势收益扣除波动和过度乖离后，筛出更稳的上行结构。",
        },
        {
            "factor_id": "ak_gap_repair_quality",
            "name": "AkShare日内修复质量",
            "raw_column": "raw_gap_repair_quality",
            "hypothesis": "高收盘位置、下影承接和低上影压力代表日内修复质量。",
        },
    ]
    for candidate in candidates:
        out[candidate["factor_id"]] = bt.pct_rank_by_date(out, candidate["raw_column"])
    return out, candidates


def summarize_candidate(df: pd.DataFrame, factor_id: str, horizon: int) -> dict | None:
    future_col = f"future_return_{horizon}"
    work = df[["date", "code", factor_id, future_col]].dropna().copy()
    if work.empty:
        return None
    daily = []
    for date, group in work.groupby("date"):
        if group["code"].nunique() < 30:
            continue
        rank_ic = group[factor_id].rank(method="average").corr(group[future_col].rank(method="average"))
        high_cut = group[factor_id].quantile(0.8)
        low_cut = group[factor_id].quantile(0.2)
        top = group[group[factor_id] >= high_cut][future_col].mean()
        bottom = group[group[factor_id] <= low_cut][future_col].mean()
        daily.append({
            "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
            "rank_ic": rank_ic,
            "long_short": top - bottom,
            "stock_count": int(group["code"].nunique()),
        })
    daily_df = pd.DataFrame(daily).replace([np.inf, -np.inf], np.nan).dropna(subset=["rank_ic", "long_short"])
    if daily_df.empty:
        return None
    rank_ic_std = daily_df["rank_ic"].std(ddof=1)
    rank_ic_t = None
    if rank_ic_std and not math.isnan(rank_ic_std):
        rank_ic_t = daily_df["rank_ic"].mean() / rank_ic_std * math.sqrt(len(daily_df))
    return {
        "horizon": horizon,
        "sample_dates": int(daily_df["date"].nunique()),
        "avg_stocks": clean_float(daily_df["stock_count"].mean()),
        "rank_ic_mean": clean_float(daily_df["rank_ic"].mean()),
        "rank_ic_t": clean_float(rank_ic_t),
        "long_short_mean": clean_float(daily_df["long_short"].mean()),
        "long_short_positive_ratio": clean_float((daily_df["long_short"] > 0).mean()),
    }


def classify(best: dict) -> tuple[str, str]:
    if not best:
        return "reject_no_result", "没有可用回测结果。"
    has_signal = (
        best["sample_dates"] >= GATES["min_sample_dates"]
        and best["rank_ic_mean"] is not None
        and abs(best["rank_ic_mean"]) >= GATES["min_rank_ic"]
        and best["rank_ic_t"] is not None
        and abs(best["rank_ic_t"]) >= GATES["min_rank_ic_t"]
    )
    tradeable = (
        best["long_short_mean"] is not None
        and best["long_short_mean"] > GATES["min_long_short"]
        and best["long_short_positive_ratio"] is not None
        and best["long_short_positive_ratio"] >= GATES["min_long_short_positive_ratio"]
    )
    if has_signal and tradeable and best["rank_ic_mean"] > 0:
        return "candidate_for_formal_backtest", "统计方向和多空收益同时通过，允许进入正式脚本复核。"
    if has_signal and not tradeable:
        return "reject_direction_conflict", "RankIC 有信号，但多空收益或胜率不支持交易方向。"
    if tradeable:
        return "watch_long_short_only", "多空收益为正，但 RankIC 稳定性不足，只能继续观察。"
    return "reject_weak_signal", "RankIC 和多空收益均未达到入库门槛。"


def write_doc(pack: dict) -> None:
    lines = [
        "# AkShare 新因子探测审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 输入：`{pack['input']}`",
        "",
        "## 结论",
        "",
    ]
    for item in pack["candidates"]:
        best = item["best_result"] or {}
        lines.extend([
            f"### {item['name']}",
            "",
            f"- 决策：{item['decision_name']}",
            f"- 依据：{item['decision_reason']}",
            f"- 最佳周期：{best.get('horizon', '-')}",
            f"- RankIC：{best.get('rank_ic_mean', '-')}",
            f"- RankIC t：{best.get('rank_ic_t', '-')}",
            f"- 多空收益：{best.get('long_short_mean', '-')}",
            "",
        ])
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    bt = load_backtest_module()
    raw = bt.prepare_frame(INPUT_PATH)
    factors = bt.add_factor_columns(raw)
    probed, candidates = add_candidate_columns(factors, bt)
    results = []
    for candidate in candidates:
        all_results = [
            summarize_candidate(probed, candidate["factor_id"], horizon)
            for horizon in HORIZONS
        ]
        all_results = [item for item in all_results if item]
        best = None
        if all_results:
            best = sorted(
                all_results,
                key=lambda item: (
                    item["long_short_mean"] or -999,
                    abs(item["rank_ic_t"] or 0),
                    item["long_short_positive_ratio"] or 0,
                ),
                reverse=True,
            )[0]
        decision, reason = classify(best)
        results.append({
            **{k: candidate[k] for k in ["factor_id", "name", "hypothesis"]},
            "decision": decision,
            "decision_name": {
                "candidate_for_formal_backtest": "可进入正式回测",
                "watch_long_short_only": "仅多空观察",
                "reject_direction_conflict": "方向冲突拒绝",
                "reject_weak_signal": "弱信号拒绝",
                "reject_no_result": "无结果拒绝",
            }[decision],
            "decision_reason": reason,
            "best_result": best,
            "all_results": all_results,
        })
    pack = {
        "source": "akshare_new_factor_probe",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(INPUT_PATH.relative_to(ROOT)),
        "data_policy": "只使用本地已落地 AkShare 真实 OHLCV 历史；候选因子只用当日及以前数据；未通过门槛不入正式因子库。",
        "gates": GATES,
        "candidate_count": len(results),
        "decision_counts": {
            str(key): int(value)
            for key, value in pd.Series([item["decision"] for item in results]).value_counts().items()
        },
        "candidates": results,
    }
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "source": pack["source"],
        "candidate_count": pack["candidate_count"],
        "decision_counts": pack["decision_counts"],
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
