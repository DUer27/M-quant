#!/usr/bin/env python3
"""Analyze a structured reversal factor panel exported from JoinQuant."""

from __future__ import annotations

import argparse
import glob
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"
STRATEGY_ID = "structured_reversal_csi500_v1"
STRATEGY_NAME = "长江结构化反转因子指数增强策略 v1"
SOURCE = "joinquant_structured_reversal_csi500_v1"
DATASET = "csi500"
HORIZONS = [1, 5, 10, 20]
PRIMARY_HORIZON = 20
MIN_CROSS_SECTION = 120
FACTOR_GATE = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.025,
    "min_rank_ic_t": 2.0,
    "min_long_short_annual": 0.08,
    "min_top_excess_annual": 0.03,
}
FACTOR_SPECS = [
    {"factor": "structured_reversal_score", "display_name": "结构化反转因子（structured_reversal_score）", "weight": 0.55},
    {"factor": "high_volume_reversal_score", "display_name": "高成交量反转确认因子（high_volume_reversal_score）", "weight": 0.20},
    {"factor": "low_volatility_score", "display_name": "低波动控制因子（low_volatility_score）", "weight": 0.15},
    {"factor": "liquidity_quality_score", "display_name": "流动性质量因子（liquidity_quality_score）", "weight": 0.10},
    {"factor": "liquidity_premium_proxy_score", "display_name": "高频流动性溢价代理因子（liquidity_premium_proxy_score）", "weight": 0.05},
    {"factor": "volume_stability_score", "display_name": "量能稳定因子（volume_stability_score）", "weight": 0.10},
    {"factor": "gap_risk_control_score", "display_name": "跳空风险控制因子（gap_risk_control_score）", "weight": 0.05},
    {"factor": "structured_reversal_enhanced_score", "display_name": "结构化反转增强总分（structured_reversal_enhanced_score）", "weight": 1.00},
    {"factor": "structured_reversal_confirmed_score", "display_name": "结构化反转确认总分（structured_reversal_confirmed_score）", "weight": 1.00},
    {"factor": "structured_reversal_tradeable_score", "display_name": "结构化反转可交易总分（structured_reversal_tradeable_score）", "weight": 1.00},
]
CORE_SCORE_FACTORS = {
    "structured_reversal_enhanced_score",
    "structured_reversal_confirmed_score",
    "structured_reversal_tradeable_score",
}


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def extract_json_object(text: str) -> Any:
    stripped = text.strip().lstrip("\ufeff")
    if not stripped:
        raise ValueError("输入文件为空。")
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
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
    paths: list[Path] = []
    for pattern in patterns:
        matches = glob.glob(pattern) if any(ch in pattern for ch in "*?[") else [pattern]
        paths.extend(Path(item).resolve() for item in matches if Path(item).is_file())
    return sorted(dict.fromkeys(paths))


def load_factor_rows(path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    payload = extract_json_object(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} 不是 JSON 对象。")
    rows = payload.get("factor_rows") or []
    if not rows:
        raise ValueError(f"{path} 缺少 factor_rows。")
    table = pd.DataFrame(rows)
    table["date"] = pd.to_datetime(table["date"]).dt.normalize()
    return table, payload


def load_table(paths: list[Path]) -> tuple[pd.DataFrame, dict[str, Any]]:
    frames = []
    configs = []
    for path in paths:
        frame, payload = load_factor_rows(path)
        frames.append(frame)
        configs.append(payload.get("config") or {})
    table = pd.concat(frames, ignore_index=True).sort_values(["date", "code"])
    table = table.drop_duplicates(["date", "code"], keep="last")
    config = configs[0] if configs else {}
    config.update({
        "analysis_input_count": len(paths),
        "analysis_rows": int(len(table)),
        "analysis_dates": int(table["date"].nunique()),
        "analysis_at": datetime.now().isoformat(timespec="milliseconds") + "Z",
    })
    return table, config


def rank_ic(day: pd.DataFrame, factor: str, target: str) -> float | None:
    pair = day[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < MIN_CROSS_SECTION:
        return None
    x = pair[factor].rank(method="average")
    y = pair[target].rank(method="average")
    if x.nunique() < 2 or y.nunique() < 2:
        return None
    return clean_float(x.corr(y))


def annualize_period_return(mean_return: Any, horizon: int) -> float | None:
    value = clean_float(mean_return)
    if value is None or value <= -1:
        return None
    return clean_float((1 + value) ** (252.0 / horizon) - 1)


def factor_backtest(table: pd.DataFrame, factor: str, display_name: str) -> list[dict[str, Any]]:
    records = []
    for horizon in HORIZONS:
        target = f"future_return_{horizon}"
        if target not in table.columns or factor not in table.columns:
            continue
        daily_ic = []
        daily_top = []
        daily_bottom = []
        daily_bench = []
        daily_ls = []
        for day, part in table.groupby("date"):
            ic = rank_ic(part, factor, target)
            pair = part[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
            if ic is None or len(pair) < MIN_CROSS_SECTION:
                continue
            ranked = pair[factor].rank(method="first", pct=True)
            top = pair.loc[ranked > 0.8, target]
            bottom = pair.loc[ranked <= 0.2, target]
            if len(top) < 10 or len(bottom) < 10:
                continue
            daily_ic.append(ic)
            daily_top.append(float(top.mean()))
            daily_bottom.append(float(bottom.mean()))
            daily_bench.append(float(pair[target].mean()))
            daily_ls.append(float(top.mean() - bottom.mean()))
        ic_series = pd.Series(daily_ic, dtype=float)
        ls_series = pd.Series(daily_ls, dtype=float)
        top_series = pd.Series(daily_top, dtype=float)
        bench_series = pd.Series(daily_bench, dtype=float)
        mean = clean_float(ic_series.mean())
        std = clean_float(ic_series.std(ddof=0))
        top_excess = clean_float((top_series - bench_series).mean()) if not top_series.empty else None
        row = {
            "source": SOURCE,
            "result_type": "factor_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "dataset": DATASET,
            "factor": factor,
            "factor_name": display_name,
            "factor_display_name": display_name,
            "horizon": int(horizon),
            "direction": "positive",
            "sample_dates": int(ic_series.count()),
            "rank_ic_mean": mean,
            "rank_ic_std": std,
            "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
            "rank_ic_t": clean_float(mean / (std / math.sqrt(len(ic_series)))) if mean is not None and std and len(ic_series) > 1 else None,
            "positive_ratio": clean_float((ic_series > 0).mean()) if not ic_series.empty else None,
            "top_group_mean": clean_float(top_series.mean()),
            "bottom_group_mean": clean_float(pd.Series(daily_bottom, dtype=float).mean()),
            "long_short_mean": clean_float(ls_series.mean()),
            "long_short_annual": annualize_period_return(ls_series.mean(), horizon),
            "long_short_positive_ratio": clean_float((ls_series > 0).mean()) if not ls_series.empty else None,
            "top_excess_mean": top_excess,
            "top_excess_annual": annualize_period_return(top_excess, horizon),
            "factor_gate": FACTOR_GATE,
            "data_policy": "基于 JoinQuant 高频结构化反转因子截面复算 RankIC、Top20%-Bottom20% 与 Top20% 相对等权基准，不补造缺失未来收益。",
        }
        row["gate_passed"] = bool(
            horizon == PRIMARY_HORIZON
            and row["sample_dates"] >= FACTOR_GATE["min_sample_dates"]
            and (row["rank_ic_mean"] or -999) >= FACTOR_GATE["min_rank_ic"]
            and (row["rank_ic_t"] or -999) >= FACTOR_GATE["min_rank_ic_t"]
            and (row["long_short_annual"] or -999) >= FACTOR_GATE["min_long_short_annual"]
            and (row["top_excess_annual"] or -999) >= FACTOR_GATE["min_top_excess_annual"]
        )
        records.append(row)
    return records


def group_backtest(table: pd.DataFrame, score_col: str = "structured_reversal_score") -> list[dict[str, Any]]:
    records = []
    for horizon in HORIZONS:
        target = f"future_return_{horizon}"
        if target not in table.columns or score_col not in table.columns:
            continue
        rows = []
        for day, part in table[["date", score_col, target]].replace([np.inf, -np.inf], np.nan).dropna().groupby("date"):
            if len(part) < MIN_CROSS_SECTION:
                continue
            labels = pd.qcut(part[score_col].rank(method="first"), 10, labels=False, duplicates="drop")
            item = {"date": day}
            for group in range(10):
                item[f"g{group + 1}"] = clean_float(part.loc[labels == group, target].mean())
            rows.append(item)
        if not rows:
            continue
        frame = pd.DataFrame(rows)
        record = {
            "source": SOURCE,
            "result_type": "factor_group_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "dataset": DATASET,
            "factor": score_col,
            "factor_name": "结构化反转因子（structured_reversal_score）",
            "horizon": int(horizon),
            "sample_dates": int(len(frame)),
            "groups": {f"G{idx}": clean_float(frame[f"g{idx}"].mean()) for idx in range(1, 11) if f"g{idx}" in frame.columns},
            "top_bottom_mean": clean_float(frame.get("g10", pd.Series(dtype=float)).mean() - frame.get("g1", pd.Series(dtype=float)).mean()),
            "data_policy": "按结构化反转分数从低到高十组；G10 为最高分组。",
        }
        records.append(record)
    return records


def primary_factor_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        row for row in records
        if row.get("result_type") == "factor_backtest" and row.get("horizon") == PRIMARY_HORIZON
    ]


def build_drag_diagnostic(records: list[dict[str, Any]]) -> dict[str, Any]:
    rows = primary_factor_rows(records)
    ranked = sorted(
        rows,
        key=lambda row: (
            row.get("gate_passed") is True,
            row.get("rank_ic_mean") if row.get("rank_ic_mean") is not None else -999,
            row.get("top_excess_annual") if row.get("top_excess_annual") is not None else -999,
        ),
        reverse=True,
    )
    by_factor = {row.get("factor"): row for row in rows}
    blockers = []
    for factor in [
        "structured_reversal_score",
        "high_volume_reversal_score",
        "liquidity_quality_score",
        "liquidity_premium_proxy_score",
        "structured_reversal_enhanced_score",
        "structured_reversal_confirmed_score",
        "structured_reversal_tradeable_score",
    ]:
        row = by_factor.get(factor)
        if not row:
            blockers.append({"factor": factor, "reason": "真实 slice 中没有该因子列。"})
            continue
        misses = []
        if (row.get("sample_dates") or 0) < FACTOR_GATE["min_sample_dates"]:
            misses.append("sample_dates")
        if (row.get("rank_ic_mean") or -999) < FACTOR_GATE["min_rank_ic"]:
            misses.append("rank_ic_mean")
        if (row.get("rank_ic_t") or -999) < FACTOR_GATE["min_rank_ic_t"]:
            misses.append("rank_ic_t")
        if (row.get("long_short_annual") or -999) < FACTOR_GATE["min_long_short_annual"]:
            misses.append("long_short_annual")
        if (row.get("top_excess_annual") or -999) < FACTOR_GATE["min_top_excess_annual"]:
            misses.append("top_excess_annual")
        blockers.append({
            "factor": factor,
            "factor_name": row.get("factor_name"),
            "gate_passed": bool(row.get("gate_passed")),
            "misses": misses,
            "rank_ic_mean": row.get("rank_ic_mean"),
            "rank_ic_t": row.get("rank_ic_t"),
            "long_short_annual": row.get("long_short_annual"),
            "top_excess_annual": row.get("top_excess_annual"),
        })
    core_ranked = [row for row in ranked if row.get("factor") in CORE_SCORE_FACTORS]
    return {
        "primary_horizon": PRIMARY_HORIZON,
        "best_factor": ranked[0] if ranked else None,
        "best_core_score": core_ranked[0] if core_ranked else None,
        "blockers": blockers,
        "suspected_drag_factors": [
            "liquidity_quality_score",
            "liquidity_premium_proxy_score",
        ],
        "diagnosis_policy": "只基于真实 JoinQuant slice 复算后的20日 RankIC、Top-Bottom和Top超额判断拖累项；没有真实 slice 时只列待检项。",
    }


def regime_year_backtest(table: pd.DataFrame, score_col: str = "structured_reversal_score") -> list[dict[str, Any]]:
    records = []
    target = f"future_return_{PRIMARY_HORIZON}"
    if target not in table.columns or score_col not in table.columns:
        return records
    work = table.replace([np.inf, -np.inf], np.nan).dropna(subset=[score_col, target]).copy()
    work["year"] = pd.to_datetime(work["date"]).dt.year
    for key, label, frame in [("year", "分年度", work)] + ([ ("market_regime", "波动环境", work.dropna(subset=["market_regime"])) ] if "market_regime" in work.columns else []):
        for bucket, part in frame.groupby(key):
            daily_ls = []
            daily_ic = []
            for _day, day_part in part.groupby("date"):
                pair = day_part[[score_col, target]].dropna()
                if len(pair) < 50:
                    continue
                ranked = pair[score_col].rank(method="first", pct=True)
                top = pair.loc[ranked > 0.8, target]
                bottom = pair.loc[ranked <= 0.2, target]
                if len(top) < 5 or len(bottom) < 5:
                    continue
                daily_ls.append(float(top.mean() - bottom.mean()))
                daily_ic.append(float(pair[score_col].rank().corr(pair[target].rank())))
            if not daily_ls:
                continue
            records.append({
                "source": SOURCE,
                "result_type": "factor_layer_backtest",
                "strategy_id": STRATEGY_ID,
                "strategy_name": STRATEGY_NAME,
                "dataset": DATASET,
                "factor": score_col,
                "factor_name": "结构化反转因子（structured_reversal_score）",
                "horizon": PRIMARY_HORIZON,
                "layer_type": label,
                "layer": str(bucket),
                "sample_dates": int(len(daily_ls)),
                "rank_ic_mean": clean_float(pd.Series(daily_ic, dtype=float).mean()),
                "long_short_mean": clean_float(pd.Series(daily_ls, dtype=float).mean()),
                "long_short_positive_ratio": clean_float((pd.Series(daily_ls, dtype=float) > 0).mean()),
            })
    return records


def build_package(table: pd.DataFrame, config: dict[str, Any], emit: bool = True) -> dict[str, Any]:
    records = []
    available_specs = [spec for spec in FACTOR_SPECS if spec["factor"] in table.columns]
    for spec in available_specs:
        records.extend(factor_backtest(table, spec["factor"], spec["display_name"]))
    records.extend(group_backtest(table))
    records.extend(regime_year_backtest(table))
    primary = [row for row in records if row.get("result_type") == "factor_backtest" and row.get("factor") == "structured_reversal_score" and row.get("horizon") == PRIMARY_HORIZON]
    enhanced = [row for row in records if row.get("result_type") == "factor_backtest" and row.get("factor") == "structured_reversal_enhanced_score" and row.get("horizon") == PRIMARY_HORIZON]
    drag_diagnostic = build_drag_diagnostic(records)
    output = {
        "result_type": "structured_reversal_factor_analysis",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "data_policy": "所有指标来自 JoinQuant 高频因子截面和真实未来收益标签；未导入真实因子截面时不生成分析指标。",
        "config": config,
        "factor_gate": FACTOR_GATE,
        "factor_specs": available_specs,
        "primary_factor_gate": primary[0] if primary else None,
        "enhanced_factor_gate": enhanced[0] if enhanced else None,
        "drag_diagnostic": drag_diagnostic,
        "sample": {
            "factor_rows": int(len(table)),
            "factor_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "records": int(len(records)),
        },
        "records": records,
    }
    if emit:
        print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def build_report(package: dict[str, Any], output_path: Path) -> str:
    primary = package.get("primary_factor_gate") or {}
    enhanced = package.get("enhanced_factor_gate") or {}
    diagnostic = package.get("drag_diagnostic") or {}
    best_core = diagnostic.get("best_core_score") or {}
    lines = [
        "# 长江结构化反转因子分析审计",
        "",
        f"生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"结果文件：`{display_path(output_path)}`",
        "",
        "## 因子活性门禁",
        "",
        f"- 结构化反转因子：RankIC={primary.get('rank_ic_mean')}，t={primary.get('rank_ic_t')}，Top-Bottom年化={primary.get('long_short_annual')}，通过={primary.get('gate_passed')}",
        f"- 结构化反转增强总分：RankIC={enhanced.get('rank_ic_mean')}，t={enhanced.get('rank_ic_t')}，Top-Bottom年化={enhanced.get('long_short_annual')}，通过={enhanced.get('gate_passed')}",
        f"- 最强核心候选：{best_core.get('factor')}，RankIC={best_core.get('rank_ic_mean')}，t={best_core.get('rank_ic_t')}，Top-Bottom年化={best_core.get('long_short_annual')}，通过={best_core.get('gate_passed')}",
        "- 默认重点排查：`liquidity_quality_score` 与 `liquidity_premium_proxy_score` 是否稀释核心反转。",
        "",
        "## 数据边界",
        "",
        "只接受 JoinQuant 高频因子截面；没有真实 10m/1m 数据时不输出 IC、分组收益或准入结论。",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze JoinQuant structured reversal factor panel.")
    parser.add_argument("inputs", nargs="+", help="Factor panel JSON files or glob patterns.")
    parser.add_argument("--output", default="", help="Analysis package output path.")
    parser.add_argument("--report", default="", help="Markdown audit report path.")
    args = parser.parse_args(argv)

    files = expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到因子截面输入文件。")
    table, config = load_table(files)
    package = build_package(table, config, emit=False)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"{STRATEGY_ID}_factor_analysis_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-structured-reversal-factor-analysis-{stamp}.md"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    write_json(output_path, package)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path), encoding="utf-8")
    print(json.dumps({"ok": True, "output_path": display_path(output_path), "report_path": display_path(report_path), "sample": package["sample"], "primary_factor_gate": package.get("primary_factor_gate"), "enhanced_factor_gate": package.get("enhanced_factor_gate")}, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
