#!/usr/bin/env python3
"""Search auditable CSI500 LCR index-enhancement candidate variants.

Inputs must be JoinQuant factor slice files produced by
``m_quant_csi500_low_crowding_reversal_index_enhancement.py --run-mode slice``.
The script merges raw factor rows, rebuilds scores for several conservative
candidate variants, and writes a ranked optimization report. It does not infer
or fabricate missing factor rows from summary packages.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"

sys.path.insert(0, str(SCRIPT_DIR))
import m_quant_csi500_low_crowding_reversal_index_enhancement as kernel  # noqa: E402


PRIMARY_HORIZON = kernel.PRIMARY_HORIZON
PRIMARY_REBALANCE_DAYS = kernel.PRIMARY_TRADING_REBALANCE_DAYS
HORIZONS = kernel.HORIZONS
TRADING_REBALANCE_DAYS_LIST = kernel.TRADING_REBALANCE_DAYS_LIST
FACTOR_GATE = kernel.FACTOR_GATE
PAPER_WATCH_GATE = kernel.PAPER_WATCH_GATE
STRATEGY_ID = kernel.STRATEGY_ID
STRATEGY_NAME = kernel.STRATEGY_NAME
SOURCE = kernel.SOURCE + "_candidate_optimizer"


@dataclass(frozen=True)
class CandidateVariant:
    variant_id: str
    name: str
    description: str
    weights: dict[str, float]
    top_n: int = 100
    buffer_n: int = 140
    cap_neutral: bool = False
    liquidity_quantile: float = 0.10
    min_score_quantile: float = 0.0
    max_turnover_ratio: float | None = None
    risk_block_factors: tuple[str, ...] = ()
    risk_block_quantile: float = 0.08


CANDIDATE_VARIANTS = [
    CandidateVariant(
        variant_id="v0_baseline_rebuilt",
        name="v0 基线复算",
        description="沿用 v0 固定权重，作为优化对照组。",
        weights={
            "jq_lcr_active_reversal": 0.30,
            "jq_lcr_low_crowding_resilience": 0.22,
            "jq_lcr_residual_low_volatility": 0.18,
            "jq_lcr_volume_stability": 0.15,
            "jq_lcr_gap_risk_control": 0.10,
            "jq_lcr_short_reversal": 0.05,
        },
    ),
    CandidateVariant(
        variant_id="v1_volume_active_short",
        name="量稳 + 主动/短反转",
        description="以已通过快测的量能稳定为核心，叠加主动反转和短期反转。",
        weights={
            "jq_lcr_volume_stability": 0.46,
            "jq_lcr_active_reversal": 0.34,
            "jq_lcr_short_reversal": 0.20,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
        risk_block_factors=("jq_lcr_gap_risk_control",),
    ),
    CandidateVariant(
        variant_id="v1_volume_active_anti_heat",
        name="量稳 + 主动反转 + 反过热",
        description="保留低拥挤主题，但改为惩罚过热而非简单追求低弹性。",
        weights={
            "jq_lcr_volume_stability": 0.44,
            "jq_lcr_active_reversal": 0.34,
            "jq_lcr_anti_heat_reversal": 0.22,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
        risk_block_factors=("jq_lcr_gap_risk_control",),
    ),
    CandidateVariant(
        variant_id="v1_volume_downside_active",
        name="量稳 + 下行韧性 + 主动反转",
        description="把低波/跳空从直接加分改为防守过滤，核心关注稳定成交和跌后修复。",
        weights={
            "jq_lcr_volume_stability": 0.42,
            "jq_lcr_downside_resilience": 0.25,
            "jq_lcr_active_reversal": 0.23,
            "jq_lcr_short_reversal": 0.10,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
        risk_block_factors=("jq_lcr_gap_risk_control",),
    ),
    CandidateVariant(
        variant_id="v1_volume_only_cap_neutral",
        name="量稳单核市值中性",
        description="只验证量能稳定是否能在市值桶中性后独立产生超额。",
        weights={"jq_lcr_volume_stability": 1.00},
        cap_neutral=True,
        liquidity_quantile=0.15,
    ),
    CandidateVariant(
        variant_id="v1_compact_top80",
        name="精简 Top80 缓冲组合",
        description="提高入选门槛，使用 Top80/Top120 buffer 降低低质量尾部和换手。",
        weights={
            "jq_lcr_volume_stability": 0.50,
            "jq_lcr_active_reversal": 0.30,
            "jq_lcr_short_reversal": 0.20,
        },
        top_n=80,
        buffer_n=120,
        cap_neutral=True,
        liquidity_quantile=0.20,
        risk_block_factors=("jq_lcr_gap_risk_control",),
    ),
    CandidateVariant(
        variant_id="v2_volume_dual_gate_cap_neutral",
        name="量稳双因子市值中性",
        description="把有效的量能稳定核心拆成原始量稳和市值桶内量稳两个可审计因子，组合仍保持市值桶中性。",
        weights={
            "jq_lcr_volume_stability": 0.55,
            "jq_lcr_volume_stability_cap_neutral": 0.45,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
    ),
    CandidateVariant(
        variant_id="v2_volume_turnover_balance",
        name="量稳 + 低换手均衡",
        description="用成交稳定、低换手和流动性均衡构造第二支柱，避免反转因子拖累主动收益。",
        weights={
            "jq_lcr_volume_stability": 0.50,
            "jq_lcr_low_turnover_quality": 0.30,
            "jq_lcr_volume_liquidity_balance": 0.20,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
    ),
    CandidateVariant(
        variant_id="v2_volume_residual_balance",
        name="量稳 + 残差量稳均衡",
        description="剥离市值和换手暴露后的残差量稳，验证量能稳定是否有独立截面信息。",
        weights={
            "jq_lcr_volume_stability": 0.45,
            "jq_lcr_volume_stability_residual": 0.35,
            "jq_lcr_volume_liquidity_balance": 0.20,
        },
        cap_neutral=True,
        liquidity_quantile=0.15,
    ),
]


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def rank01(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_json_object(text: str) -> Any:
    stripped = text.strip().lstrip("\ufeff")
    if not stripped:
        raise ValueError("输入文件为空。")
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        last_error: Exception | None = None
        for start, char in enumerate(stripped):
            if char not in "[{":
                continue
            try:
                obj, _end = decoder.raw_decode(stripped[start:])
            except json.JSONDecodeError as exc:
                last_error = exc
                continue
            return obj
        raise ValueError(f"没有在输入中找到可解析 JSON：{last_error}")


def expand_inputs(patterns: list[str]) -> list[Path]:
    files: list[Path] = []
    for pattern in patterns:
        matches = [Path(item) for item in sorted(glob.glob(pattern))] if any(ch in pattern for ch in "*?[") else [Path(pattern)]
        files.extend(path for path in matches if path.is_file())
    unique: dict[str, Path] = {}
    for path in files:
        unique[str(path.resolve())] = path.resolve()
    return sorted(unique.values())


def load_factor_rows(path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    payload = extract_json_object(read_text(path))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} 不是 JSON 对象。")
    rows = payload.get("factor_rows") or []
    if payload.get("result_type") != "index_enhancement_factor_slice" or not isinstance(rows, list) or not rows:
        raise ValueError(f"{path} 不是包含 factor_rows 的 CSI500 LCR slice。")
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"]).dt.normalize()
    meta = {
        "path": display_path(path),
        "slice_start": payload.get("slice_start") or (payload.get("config") or {}).get("factor_start"),
        "slice_end": payload.get("slice_end") or (payload.get("config") or {}).get("end_limit"),
        "factor_rows": int(len(frame)),
        "factor_dates": int(frame["date"].nunique()),
        "unique_securities": int(frame["code"].nunique()),
    }
    return frame, meta


def build_table(files: list[Path]) -> tuple[pd.DataFrame, dict[str, Any]]:
    frames = []
    metas = []
    for path in files:
        frame, meta = load_factor_rows(path)
        frames.append(frame)
        metas.append(meta)
    table = pd.concat(frames, ignore_index=True)
    before = len(table)
    table = table.sort_values(["date", "code"]).drop_duplicates(["date", "code"], keep="last")
    for col in table.columns:
        if col.startswith("future_return_") or col.startswith("jq_lcr_") or col in ["close", "money", "money_ma_20", "market_cap", "turnover_ratio"]:
            table[col] = pd.to_numeric(table[col], errors="coerce")
    audit = {
        "input_files": [item["path"] for item in metas],
        "slice_meta": metas,
        "input_factor_rows": int(before),
        "merged_factor_rows": int(len(table)),
        "dropped_duplicate_date_code_rows": int(before - len(table)),
        "factor_dates": int(table["date"].nunique()),
        "unique_securities": int(table["code"].nunique()),
        "date_range": "%s 至 %s" % (table["date"].min().strftime("%Y-%m-%d"), table["date"].max().strftime("%Y-%m-%d")),
    }
    table = add_engineered_factors(table)
    return table, audit


def residual_rank(frame: pd.DataFrame, target: str, exposures: list[str]) -> pd.Series:
    y = pd.to_numeric(frame[target], errors="coerce")
    cols = []
    for col in exposures:
        if col in frame.columns:
            cols.append(pd.to_numeric(frame[col], errors="coerce"))
    if not cols or y.notna().sum() < 30:
        return rank01(y)
    x = pd.concat(cols, axis=1).replace([np.inf, -np.inf], np.nan)
    valid = y.notna() & x.notna().all(axis=1)
    if valid.sum() < 30:
        return rank01(y)
    matrix = np.column_stack([np.ones(int(valid.sum())), x.loc[valid].to_numpy(dtype=float)])
    values = y.loc[valid].to_numpy(dtype=float)
    try:
        beta = np.linalg.lstsq(matrix, values, rcond=None)[0]
        residual = pd.Series(np.nan, index=frame.index, dtype=float)
        residual.loc[valid] = values - matrix.dot(beta)
        return rank01(residual)
    except Exception:
        return rank01(y)


def add_engineered_factors(table: pd.DataFrame) -> pd.DataFrame:
    out = table.copy()
    engineered = []
    for _day, part in out.groupby("date", sort=False):
        work = part.copy()
        if "market_cap_bucket" in work.columns:
            work["jq_lcr_volume_stability_cap_neutral"] = work.groupby("market_cap_bucket", group_keys=False)["jq_lcr_volume_stability"].transform(rank01)
        else:
            work["jq_lcr_volume_stability_cap_neutral"] = rank01(work["jq_lcr_volume_stability"])
        low_turnover = rank01(-pd.to_numeric(work.get("turnover_ratio"), errors="coerce")) if "turnover_ratio" in work.columns else pd.Series(0.5, index=work.index)
        liquidity_rank = rank01(work["money_ma_20"]) if "money_ma_20" in work.columns else pd.Series(0.5, index=work.index)
        work["jq_lcr_low_turnover_quality"] = rank01(0.65 * work["jq_lcr_volume_stability"].fillna(0.5) + 0.35 * low_turnover.fillna(0.5))
        work["jq_lcr_volume_liquidity_balance"] = rank01(
            0.55 * work["jq_lcr_volume_stability"].fillna(0.5)
            + 0.25 * liquidity_rank.fillna(0.5)
            + 0.20 * low_turnover.fillna(0.5)
        )
        work["jq_lcr_volume_stability_residual"] = residual_rank(work, "jq_lcr_volume_stability", ["market_cap_rank_pct", "turnover_ratio"])
        engineered.append(work)
    return pd.concat(engineered, ignore_index=True) if engineered else out


def rank_ic(day: pd.DataFrame, factor: str, target: str) -> float | None:
    pair = day[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < kernel.MIN_CROSS_SECTION:
        return None
    x = pair[factor].rank(method="average")
    y = pair[target].rank(method="average")
    if x.nunique() < 2 or y.nunique() < 2:
        return None
    return clean_float(x.corr(y))


def passes_factor_gate(row: dict[str, Any]) -> bool:
    return (
        (row.get("sample_dates") or 0) >= FACTOR_GATE["min_sample_dates"]
        and row.get("rank_ic_mean") is not None and row["rank_ic_mean"] >= FACTOR_GATE["min_rank_ic"]
        and row.get("rank_ic_t") is not None and row["rank_ic_t"] >= FACTOR_GATE["min_rank_ic_t"]
        and row.get("long_short_mean") is not None and row["long_short_mean"] > FACTOR_GATE["min_long_short"]
        and row.get("long_short_positive_ratio") is not None and row["long_short_positive_ratio"] >= FACTOR_GATE["min_long_short_positive_ratio"]
    )


def factor_backtest(table: pd.DataFrame, factors: list[str], variant: CandidateVariant) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records = []
    gate_rows = []
    for factor in factors:
        factor_records = []
        for horizon in HORIZONS:
            target = f"future_return_{horizon}"
            daily_ic = []
            daily_ls = []
            for _day, part in table.groupby("date"):
                ic = rank_ic(part, factor, target)
                if ic is None:
                    continue
                pair = part[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
                ranked = pair[factor].rank(method="first", pct=True)
                top = pair.loc[ranked > 0.8, target]
                bottom = pair.loc[ranked <= 0.2, target]
                if len(top) < 10 or len(bottom) < 10:
                    continue
                daily_ic.append(ic)
                daily_ls.append(float(top.mean() - bottom.mean()))
            ic_series = pd.Series(daily_ic, dtype=float)
            ls_series = pd.Series(daily_ls, dtype=float)
            mean = clean_float(ic_series.mean())
            std = clean_float(ic_series.std(ddof=0))
            row = {
                "source": SOURCE,
                "result_type": "factor_backtest",
                "strategy_id": STRATEGY_ID,
                "strategy_name": STRATEGY_NAME,
                "variant_id": variant.variant_id,
                "variant_name": variant.name,
                "factor_name": factor,
                "factor": factor,
                "dataset": "csi500",
                "horizon": int(horizon),
                "direction": "positive",
                "sample_dates": int(ic_series.count()),
                "rank_ic_mean": mean,
                "rank_ic_std": std,
                "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
                "rank_ic_t": clean_float(mean / (std / math.sqrt(len(ic_series)))) if mean is not None and std and len(ic_series) > 1 else None,
                "long_short_mean": clean_float(ls_series.mean()),
                "long_short_positive_ratio": clean_float((ls_series > 0).mean()) if not ls_series.empty else None,
                "positive_ratio": clean_float((ic_series > 0).mean()) if not ic_series.empty else None,
                "gate_passed": None,
                "factor_gate": FACTOR_GATE,
            }
            if horizon == PRIMARY_HORIZON:
                row["gate_passed"] = passes_factor_gate(row)
            factor_records.append(row)
            records.append(row)
        primary = next((item for item in factor_records if item["horizon"] == PRIMARY_HORIZON), None)
        gate_rows.append({
            "factor_name": factor,
            "weight": variant.weights.get(factor, 0.0),
            "gate_passed": bool(primary and primary.get("gate_passed")),
            "primary_result": primary,
        })
    return records, gate_rows


def score_table(table: pd.DataFrame, variant: CandidateVariant) -> pd.DataFrame:
    out = table.copy()
    score = pd.Series(0.0, index=out.index)
    total = sum(abs(value) for value in variant.weights.values()) or 1.0
    for factor, weight in variant.weights.items():
        if factor not in out.columns:
            raise ValueError(f"缺少候选因子列：{factor}")
        score = score + (float(weight) / total) * (out[factor].fillna(0.5) * 2 - 1)
    out["lcr_enhancement_score"] = score
    return out


def apply_trade_filters(frame: pd.DataFrame, variant: CandidateVariant) -> pd.DataFrame:
    work = frame.copy()
    work = work[(work["close"] > 0) & (work["money"] > 0)]
    if "money_ma_20" in work.columns and variant.liquidity_quantile > 0:
        liquidity_floor = work["money_ma_20"].quantile(variant.liquidity_quantile)
        work = work[work["money_ma_20"] >= liquidity_floor]
    if variant.max_turnover_ratio is not None and "turnover_ratio" in work.columns:
        work = work[work["turnover_ratio"] <= variant.max_turnover_ratio]
    if variant.min_score_quantile > 0:
        score_floor = work["lcr_enhancement_score"].quantile(variant.min_score_quantile)
        work = work[work["lcr_enhancement_score"] >= score_floor]
    for factor in variant.risk_block_factors:
        if factor in work.columns:
            risk_floor = work[factor].quantile(variant.risk_block_quantile)
            work = work[work[factor] >= risk_floor]
    return work


def cap_bucket_targets(frame: pd.DataFrame, top_n: int) -> dict[str, int]:
    if "market_cap_bucket" not in frame.columns:
        return {}
    counts = frame["market_cap_bucket"].value_counts(normalize=True).to_dict()
    buckets = ["large_cap", "mid_cap", "small_cap"]
    raw = {bucket: int(round(top_n * counts.get(bucket, 0.0))) for bucket in buckets}
    for bucket in buckets:
        if counts.get(bucket, 0.0) > 0 and raw[bucket] == 0:
            raw[bucket] = 1
    diff = top_n - sum(raw.values())
    ordered = sorted(buckets, key=lambda item: counts.get(item, 0.0), reverse=True)
    while diff != 0 and ordered:
        for bucket in ordered:
            if diff == 0:
                break
            if diff > 0:
                raw[bucket] += 1
                diff -= 1
            elif raw[bucket] > 1:
                raw[bucket] -= 1
                diff += 1
    return raw


def select_target(frame: pd.DataFrame, variant: CandidateVariant, previous_codes: set[str] | None = None) -> pd.DataFrame:
    work = apply_trade_filters(frame, variant)
    if work.empty:
        return work
    work = work.sort_values("lcr_enhancement_score", ascending=False).copy()
    previous_codes = previous_codes or set()
    if not variant.cap_neutral:
        buffered = work.head(variant.buffer_n)
        keep = buffered[buffered["code"].isin(previous_codes)]
        fresh = work[~work["code"].isin(set(keep["code"]))]
        return pd.concat([keep, fresh], ignore_index=True).head(variant.top_n)

    targets = cap_bucket_targets(work, variant.top_n)
    picked = []
    for bucket, quota in targets.items():
        bucket_frame = work[work["market_cap_bucket"] == bucket].copy()
        if bucket_frame.empty or quota <= 0:
            continue
        buffered = bucket_frame.head(max(quota, int(math.ceil(variant.buffer_n * quota / max(variant.top_n, 1)))))
        keep = buffered[buffered["code"].isin(previous_codes)]
        fresh = bucket_frame[~bucket_frame["code"].isin(set(keep["code"]))]
        picked.append(pd.concat([keep, fresh], ignore_index=True).head(quota))
    if not picked:
        return work.head(variant.top_n)
    selected = pd.concat(picked, ignore_index=True).sort_values("lcr_enhancement_score", ascending=False)
    if len(selected) < variant.top_n:
        extra = work[~work["code"].isin(set(selected["code"]))].head(variant.top_n - len(selected))
        selected = pd.concat([selected, extra], ignore_index=True)
    return selected.head(variant.top_n)


def max_drawdown(values: list[float]) -> float | None:
    if not values:
        return None
    peak = values[0]
    result = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            result = min(result, value / peak - 1)
    return clean_float(result)


def simulate_trading(table: pd.DataFrame, variant: CandidateVariant, rebalance_days: int, layer_label: str, layer_meta: dict[str, Any]) -> dict[str, Any] | None:
    future_col = f"future_return_{rebalance_days}"
    if future_col not in table.columns:
        return None
    work = table.dropna(subset=["lcr_enhancement_score", future_col]).copy()
    if work.empty:
        return None
    nav = 1.0
    bench_nav = 1.0
    active_nav = 1.0
    previous_weights: dict[str, float] = {}
    period_returns = []
    benchmark_returns = []
    active_returns = []
    turnover_values = []
    curve = []
    sample_trades = 0
    previous_codes: set[str] = set()
    selected_counts = []

    for day, frame in work.sort_values(["date", "lcr_enhancement_score"], ascending=[True, False]).groupby("date"):
        picked = select_target(frame, variant, previous_codes=previous_codes)
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = {code: weight for code in picked["code"].tolist()}
        all_codes = set(previous_weights.keys()) | set(current_weights.keys())
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked[future_col] * weight).sum())
        benchmark_return = clean_float(frame[future_col].mean()) or 0.0
        cost = traded_notional * (kernel.TRADING_COST_RATE + kernel.TRADING_SLIPPAGE_RATE)
        net_return = gross_return - cost
        active_return = net_return - benchmark_return
        nav *= 1 + net_return
        bench_nav *= 1 + benchmark_return
        active_nav *= 1 + active_return
        sample_trades += int(len(picked))
        selected_counts.append(int(len(picked)))
        period_returns.append(net_return)
        benchmark_returns.append(benchmark_return)
        active_returns.append(active_return)
        turnover_values.append(traded_notional)
        curve.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "net_value": clean_float(nav),
            "benchmark_net_value": clean_float(bench_nav),
            "active_net_value": clean_float(active_nav),
            "period_return": clean_float(net_return),
            "benchmark_return": clean_float(benchmark_return),
            "active_return": clean_float(active_return),
            "cost": clean_float(cost),
            "turnover": clean_float(traded_notional),
            "selected_count": int(len(picked)),
        })
        previous_weights = current_weights
        previous_codes = set(current_weights.keys())

    if not period_returns:
        return None
    periods = len(period_returns)
    annual_scale = 252.0 / float(rebalance_days)
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    active_std = float(np.std(active_returns, ddof=1)) if periods > 1 else 0.0
    strategy_annual = float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    benchmark_annual = float(bench_nav ** (annual_scale / periods) - 1) if bench_nav > 0 else None
    active_annual = float(active_nav ** (annual_scale / periods) - 1) if active_nav > 0 else None
    record = {
        "source": SOURCE,
        "result_type": "strategy_trading_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "variant_id": variant.variant_id,
        "variant_name": variant.name,
        "dataset": "csi500",
        "horizon": int(rebalance_days),
        "horizon_label": f"{rebalance_days}日调仓交易",
        "rebalance_days": int(rebalance_days),
        "layer": layer_label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(sample_trades),
        "strategy_return": clean_float(nav - 1),
        "benchmark_return": clean_float(bench_nav - 1),
        "excess_return": clean_float(active_nav - 1),
        "strategy_annual_return": clean_float(strategy_annual),
        "benchmark_annual_return": clean_float(benchmark_annual),
        "active_annual_return": clean_float(active_annual),
        "annual_return": clean_float(strategy_annual),
        "final_net_value": clean_float(nav),
        "max_drawdown": max_drawdown([item["net_value"] for item in curve]),
        "active_max_drawdown": max_drawdown([item["active_net_value"] for item in curve]),
        "sharpe": clean_float(np.mean(period_returns) / period_std * math.sqrt(annual_scale)) if period_std > 0 else None,
        "active_sharpe": clean_float(np.mean(active_returns) / active_std * math.sqrt(annual_scale)) if active_std > 0 else None,
        "daily_win_rate": clean_float(np.mean([ret > 0 for ret in period_returns])),
        "active_win_rate": clean_float(np.mean([ret > 0 for ret in active_returns])),
        "period_mean_return": clean_float(np.mean(period_returns)),
        "active_period_mean_return": clean_float(np.mean(active_returns)),
        "avg_turnover": clean_float(np.mean(turnover_values)),
        "total_turnover": clean_float(np.sum(turnover_values)),
        "avg_selected_count": clean_float(np.mean(selected_counts)),
        "cost_rate": kernel.TRADING_COST_RATE,
        "slippage_rate": kernel.TRADING_SLIPPAGE_RATE,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "score_col": "lcr_enhancement_score",
        "net_value_curve": curve[-100:],
    }
    record.update(layer_meta)
    return record


def event_backtest(table: pd.DataFrame, variant: CandidateVariant, layer_label: str, layer_meta: dict[str, Any]) -> list[dict[str, Any]]:
    records = []
    selected_by_day = []
    previous_codes: set[str] = set()
    for day, frame in table.groupby("date"):
        picked = select_target(frame, variant, previous_codes=previous_codes)
        if picked.empty:
            continue
        selected_by_day.append(picked)
        previous_codes = set(picked["code"])
    if not selected_by_day:
        return records
    candidates = pd.concat(selected_by_day, ignore_index=True)
    for horizon in HORIZONS:
        col = f"future_return_{horizon}"
        daily = candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        bench = table.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        merged = pd.concat([daily.rename("strategy"), bench.rename("benchmark")], axis=1).dropna()
        active = merged["strategy"] - merged["benchmark"]
        record = {
            "source": SOURCE,
            "result_type": "strategy_backtest" if not layer_meta else "strategy_regime_size_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "variant_id": variant.variant_id,
            "variant_name": variant.name,
            "dataset": "csi500",
            "horizon": int(horizon),
            "layer": layer_label,
            "sample_dates": int(merged.shape[0]),
            "sample_trades": int(candidates[col].dropna().shape[0]),
            "mean_return": clean_float(merged["strategy"].mean()),
            "benchmark_mean_return": clean_float(merged["benchmark"].mean()),
            "active_mean_return": clean_float(active.mean()),
            "active_positive_ratio": clean_float((active > 0).mean()) if not active.empty else None,
            "positive_ratio": clean_float((merged["strategy"] > 0).mean()) if not merged.empty else None,
            "avg_candidates_per_date": clean_float(candidates.shape[0] / merged.shape[0]) if not merged.empty else None,
            "score_col": "lcr_enhancement_score",
        }
        record.update(layer_meta)
        records.append(record)
    return records


def build_strategy_records(scored: pd.DataFrame, variant: CandidateVariant) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    records.extend(event_backtest(scored, variant, "整体", {}))
    trading_horizons = [PRIMARY_REBALANCE_DAYS] + [days for days in TRADING_REBALANCE_DAYS_LIST if days != PRIMARY_REBALANCE_DAYS]
    for rebalance_days in trading_horizons:
        trading = simulate_trading(scored, variant, rebalance_days, "整体", {})
        if trading:
            records.append(trading)
    regimes = [("high_volatility", "高波动"), ("medium_volatility", "中波动"), ("low_volatility", "低波动")]
    buckets = [("large_cap", "大市值"), ("mid_cap", "中市值"), ("small_cap", "小市值")]
    for regime_id, regime_name in regimes:
        for bucket_id, bucket_name in buckets:
            part = scored[(scored["market_regime"] == regime_id) & (scored["market_cap_bucket"] == bucket_id)].copy()
            if part.empty:
                continue
            meta = {
                "market_regime": regime_id,
                "market_regime_name": regime_name,
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": bucket_name,
                "review_layer_type": "volatility_market_cap_cross",
            }
            records.extend(event_backtest(part, variant, f"{regime_name}/{bucket_name}", meta))
            for rebalance_days in trading_horizons:
                trading = simulate_trading(part, variant, rebalance_days, f"{regime_name}/{bucket_name}", meta)
                if trading:
                    records.append(trading)
    return records


def paper_watch_label(records: list[dict[str, Any]], factor_gate_pass_count: int) -> tuple[str, str, dict[str, bool]]:
    overall = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime") and not row.get("market_cap_bucket") and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS), None)
    layer_keys = set(
        f"{row.get('market_regime')}|{row.get('market_cap_bucket')}"
        for row in records
        if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS and row.get("market_regime") and row.get("market_cap_bucket")
    )
    checks = {
        "factor_gate_pass_count": factor_gate_pass_count >= PAPER_WATCH_GATE["min_factor_gate_pass_count"],
        "overall_strategy_return": overall is not None and (overall.get("strategy_return") or -999) >= PAPER_WATCH_GATE["min_strategy_return"],
        "overall_annual_return": overall is not None and (overall.get("strategy_annual_return") or -999) >= PAPER_WATCH_GATE["min_annual_return"],
        "overall_active_return": overall is not None and (overall.get("excess_return") or -999) >= PAPER_WATCH_GATE["min_active_return"],
        "overall_active_sharpe": overall is not None and (overall.get("active_sharpe") or -999) >= PAPER_WATCH_GATE["min_active_sharpe"],
        "overall_drawdown": overall is not None and (overall.get("max_drawdown") or -999) >= PAPER_WATCH_GATE["max_drawdown_floor"],
        "layer_count": len(layer_keys) >= PAPER_WATCH_GATE["min_layer_count"],
    }
    if all(checks.values()):
        return "paper_trade_candidate", "达到准模拟盘候选标准", checks
    if factor_gate_pass_count >= 1 and overall is not None:
        return "real_strategy_backtested", "已有真实策略回测，未达准模拟盘标准", checks
    return "factor_gate_not_passed", "因子门禁或策略回测未达标", checks


def variant_rank_score(summary: dict[str, Any]) -> float:
    overall = summary.get("primary_trading") or {}
    active = overall.get("excess_return") or -1.0
    sharpe = overall.get("active_sharpe") or -10.0
    drawdown = overall.get("max_drawdown") or -1.0
    gate_count = summary.get("factor_gate_pass_count") or 0
    return float(active * 100 + sharpe * 2 + drawdown * 5 + gate_count)


def evaluate_variant(table: pd.DataFrame, variant: CandidateVariant) -> dict[str, Any]:
    scored = score_table(table, variant)
    factors = list(variant.weights.keys())
    factor_records, gate_rows = factor_backtest(scored, factors, variant)
    factor_gate_pass_count = sum(1 for row in gate_rows if row.get("gate_passed"))
    strategy_records = build_strategy_records(scored, variant)
    status, status_name, checks = paper_watch_label(strategy_records, factor_gate_pass_count)
    for record in factor_records + strategy_records:
        record["strategy_status"] = status
        record["strategy_status_name"] = status_name
        record["paper_watch_checks"] = checks
        record["paper_watch_gate"] = PAPER_WATCH_GATE
        record["variant_config"] = {
            "weights": variant.weights,
            "top_n": variant.top_n,
            "buffer_n": variant.buffer_n,
            "cap_neutral": variant.cap_neutral,
            "liquidity_quantile": variant.liquidity_quantile,
            "risk_block_factors": list(variant.risk_block_factors),
            "risk_block_quantile": variant.risk_block_quantile,
        }
    primary = next((row for row in strategy_records if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime") and not row.get("market_cap_bucket") and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS), None)
    layer_keys = set(
        f"{row.get('market_regime')}|{row.get('market_cap_bucket')}"
        for row in strategy_records
        if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS and row.get("market_regime") and row.get("market_cap_bucket")
    )
    summary = {
        "variant_id": variant.variant_id,
        "variant_name": variant.name,
        "description": variant.description,
        "strategy_status": status,
        "strategy_status_name": status_name,
        "paper_watch_checks": checks,
        "factor_gate_pass_count": int(factor_gate_pass_count),
        "primary_trading": primary,
        "layer_count": int(len(layer_keys)),
        "records": factor_records + strategy_records,
        "factor_gate_result": gate_rows,
    }
    summary["rank_score"] = clean_float(variant_rank_score(summary))
    return summary


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def pct(value: Any) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.2%}"


def num(value: Any) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.4f}"


def build_report(package: dict[str, Any], output_path: Path) -> str:
    summaries = package.get("variant_summaries") or []
    lines = [
        "# 中证500低拥挤反转指数增强候选优化审计",
        "",
        f"生成时间：{package.get('generated_at')}",
        f"结果文件：`{display_path(output_path)}`",
        "",
        "## 数据边界",
        "",
        "本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。",
        "",
        "## 样本",
        "",
        f"- 分片数量：{package.get('slice_audit', {}).get('slice_count')}",
        f"- 合并截面行：{package.get('slice_audit', {}).get('merged_factor_rows')}",
        f"- 因子日期：{package.get('slice_audit', {}).get('factor_dates')}",
        f"- 日期范围：{package.get('slice_audit', {}).get('date_range')}",
        f"- 股票数量：{package.get('slice_audit', {}).get('unique_securities')}",
        "",
        "## 候选排名",
        "",
        "| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for index, item in enumerate(summaries, start=1):
        primary = item.get("primary_trading") or {}
        lines.append(
            "| %d | `%s` | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                index,
                item.get("variant_id"),
                item.get("strategy_status_name") or item.get("strategy_status"),
                item.get("factor_gate_pass_count"),
                pct(primary.get("strategy_return")),
                pct(primary.get("excess_return")),
                num(primary.get("active_sharpe")),
                pct(primary.get("max_drawdown")),
                num(primary.get("avg_turnover")),
                item.get("layer_count"),
            )
        )
    best = summaries[0] if summaries else {}
    lines.extend([
        "",
        "## 最优候选",
        "",
        f"- 版本：`{best.get('variant_id', '-')}` / {best.get('variant_name', '-')}",
        f"- 结论：{best.get('strategy_status_name') or best.get('strategy_status') or '-'}",
        f"- 说明：{best.get('description', '-')}",
        "",
        "## 准模拟盘检查",
        "",
    ])
    for key, value in (best.get("paper_watch_checks") or {}).items():
        lines.append(f"- `{key}`：{value}")
    lines.extend([
        "",
        "## 下一步",
        "",
        "若没有版本达到准模拟盘候选标准，应优先增加完整历史分片覆盖，再根据年度/波动/市值分层失败项继续缩小因子组合，不应直接放宽门禁。",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize CSI500 LCR candidate variants from JoinQuant factor slices.")
    parser.add_argument("inputs", nargs="+", help="Slice JSON/TXT/LOG files or glob patterns with factor_rows.")
    parser.add_argument("--output", default="", help="Optimization JSON output path.")
    parser.add_argument("--report", default="", help="Markdown report output path.")
    args = parser.parse_args()

    files = expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到 slice 输入文件。")
    table, audit = build_table(files)
    audit["slice_count"] = len(files)
    if audit["factor_dates"] < FACTOR_GATE["min_sample_dates"]:
        sample_warning = "样本日期低于因子门禁样本数，结果只能用于冒烟或方向诊断。"
    else:
        sample_warning = "样本日期满足因子门禁样本数。"

    variants = [evaluate_variant(table, variant) for variant in CANDIDATE_VARIANTS]
    variants = sorted(variants, key=lambda item: item.get("rank_score") or -999999, reverse=True)
    package = {
        "result_type": "csi500_lcr_candidate_optimization",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "真实 JoinQuant factor slice 合并复算；候选版本统一使用相同截面、成本、滑点和准模拟盘门禁。",
        "sample_warning": sample_warning,
        "factor_gate": FACTOR_GATE,
        "paper_watch_gate": PAPER_WATCH_GATE,
        "slice_audit": audit,
        "variant_summaries": variants,
    }

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"{STRATEGY_ID}_candidate_optimization_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-csi500-lcr-candidate-optimization-{stamp}.md"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path

    write_json(output_path, package)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path), encoding="utf-8")

    best = variants[0] if variants else {}
    print(json.dumps({
        "ok": True,
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "sample_warning": sample_warning,
        "best_variant_id": best.get("variant_id"),
        "best_status": best.get("strategy_status"),
        "best_status_name": best.get("strategy_status_name"),
        "slice_audit": audit,
    }, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
