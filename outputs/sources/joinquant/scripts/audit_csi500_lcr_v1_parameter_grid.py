#!/usr/bin/env python3
"""Audit CSI500 LCR v1 parameter ranges with true-rebalance backtests.

The script reuses the existing JoinQuant factor-slice optimizer and v1
simulation engine. It searches conservative parameter ranges, records why each
combination passes or fails, and writes a ranked report. It does not fetch data
or fabricate missing rows.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"
SYMBOL_DIR = ROOT / "outputs" / "sources" / "joinquant" / "symbols"

sys.path.insert(0, str(SCRIPT_DIR))
import build_csi500_lcr_v1_candidate as v1  # noqa: E402
import optimize_csi500_lcr_candidates as optimizer  # noqa: E402


BASE_WEIGHTS = {
    "jq_lcr_volume_liquidity_balance": 0.35,
    "jq_lcr_volume_stability": 0.25,
    "jq_lcr_volume_stability_cap_neutral": 0.25,
    "jq_lcr_volume_stability_residual": 0.15,
}

WEIGHT_POLICIES: dict[str, dict[str, float]] = {
    "v1_current": BASE_WEIGHTS,
    "equal_four_factor": {
        "jq_lcr_volume_liquidity_balance": 0.25,
        "jq_lcr_volume_stability": 0.25,
        "jq_lcr_volume_stability_cap_neutral": 0.25,
        "jq_lcr_volume_stability_residual": 0.25,
    },
    "liquidity_balance_heavy": {
        "jq_lcr_volume_liquidity_balance": 0.45,
        "jq_lcr_volume_stability": 0.20,
        "jq_lcr_volume_stability_cap_neutral": 0.25,
        "jq_lcr_volume_stability_residual": 0.10,
    },
    "cap_neutral_heavy": {
        "jq_lcr_volume_liquidity_balance": 0.20,
        "jq_lcr_volume_stability": 0.25,
        "jq_lcr_volume_stability_cap_neutral": 0.45,
        "jq_lcr_volume_stability_residual": 0.10,
    },
    "residual_heavy": {
        "jq_lcr_volume_liquidity_balance": 0.25,
        "jq_lcr_volume_stability": 0.20,
        "jq_lcr_volume_stability_cap_neutral": 0.20,
        "jq_lcr_volume_stability_residual": 0.35,
    },
    "volume_dual_plus_liquidity": {
        "jq_lcr_volume_liquidity_balance": 0.20,
        "jq_lcr_volume_stability": 0.45,
        "jq_lcr_volume_stability_cap_neutral": 0.35,
        "jq_lcr_volume_stability_residual": 0.00,
    },
}

LAYER_POLICIES: dict[str, set[tuple[str, str]]] = {
    "v1_current_layers": {
        ("high_volatility", "large_cap"),
        ("high_volatility", "mid_cap"),
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
        ("low_volatility", "small_cap"),
    },
    "no_high_mid": {
        ("high_volatility", "large_cap"),
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
        ("low_volatility", "small_cap"),
    },
    "no_high_large": {
        ("high_volatility", "mid_cap"),
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
        ("low_volatility", "small_cap"),
    },
    "no_low_small": {
        ("high_volatility", "large_cap"),
        ("high_volatility", "mid_cap"),
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
    },
    "low_medium_only": {
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
        ("low_volatility", "small_cap"),
    },
    "defensive_core": {
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
    },
    "high_large_low_medium": {
        ("high_volatility", "large_cap"),
        ("medium_volatility", "mid_cap"),
        ("low_volatility", "large_cap"),
        ("low_volatility", "mid_cap"),
    },
    "high_only_large_mid": {
        ("high_volatility", "large_cap"),
        ("high_volatility", "mid_cap"),
    },
}

TOP_N_VALUES = [10, 15, 20, 30, 40, 50]
BUFFER_N_VALUES = [40, 60, 80, 100, 120]
LIQUIDITY_QUANTILES = [0.10, 0.15, 0.20, 0.25, 0.30]

COARSE_WEIGHT_POLICIES = [
    "v1_current",
    "equal_four_factor",
    "liquidity_balance_heavy",
    "cap_neutral_heavy",
]
COARSE_LAYER_POLICIES = [
    "v1_current_layers",
    "no_high_mid",
    "low_medium_only",
    "defensive_core",
    "high_large_low_medium",
]
COARSE_TOP_N_VALUES = [10, 15, 20, 30]
COARSE_BUFFER_N_VALUES = [40, 60, 80, 100]
COARSE_LIQUIDITY_QUANTILES = [0.15, 0.20, 0.25]

TARGETED_WEIGHT_POLICIES = [
    "v1_current",
    "liquidity_balance_heavy",
]
TARGETED_LAYER_POLICIES = [
    "v1_current_layers",
    "no_high_mid",
    "low_medium_only",
    "defensive_core",
]
TARGETED_TOP_N_VALUES = [15, 20]
TARGETED_BUFFER_N_VALUES = [60, 80]
TARGETED_LIQUIDITY_QUANTILES = [0.20, 0.25]
PRIMARY_REBALANCE_DAYS = 5
PRIMARY_COST = 1.0
STRESS_COST = 1.5
HARD_STRESS_COST = 2.0

QUALIFICATION_RULES = {
    "min_strategy_return": 0.0,
    "min_excess_return": 0.0,
    "min_active_sharpe": 0.0,
    "max_drawdown_floor": -0.25,
    "min_stress_1_5x_excess_return": 0.0,
    "min_validation_strategy_return": 0.0,
    "min_validation_excess_return": 0.0,
}


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def pct(value: Any) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.2%}"


def num(value: Any, digits: int = 3) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.{digits}f}"


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def layer_names(layers: set[tuple[str, str]]) -> list[str]:
    keys = [f"{regime}|{bucket}" for regime, bucket in sorted(layers)]
    return [v1.ALLOWED_LAYER_NAMES.get(key, key) for key in keys]


def apply_layer_policy(table: pd.DataFrame, layers: set[tuple[str, str]]) -> pd.DataFrame:
    allowed = {f"{regime}|{bucket}" for regime, bucket in layers}
    keys = table["market_regime"].astype(str) + "|" + table["market_cap_bucket"].astype(str)
    return table[keys.isin(allowed)].copy()


def date_window(table: pd.DataFrame, dates: set[pd.Timestamp]) -> pd.DataFrame:
    return table[pd.to_datetime(table["date"]).isin(dates)].copy()


def split_dates(table: pd.DataFrame) -> dict[str, set[pd.Timestamp]]:
    dates = [pd.Timestamp(day) for day in sorted(pd.to_datetime(table["date"].dropna().unique()))]
    if not dates:
        return {"all": set(), "train": set(), "validation": set(), "recent": set()}
    validation_start = max(1, int(len(dates) * 0.75))
    recent_start = max(1, int(len(dates) * 0.85))
    return {
        "all": set(dates),
        "train": set(dates[:validation_start]),
        "validation": set(dates[validation_start:]),
        "recent": set(dates[recent_start:]),
    }


def scalar_metrics(record: dict[str, Any] | None, prefix: str) -> dict[str, Any]:
    fields = [
        "strategy_return",
        "benchmark_return",
        "excess_return",
        "strategy_annual_return",
        "active_annual_return",
        "max_drawdown",
        "active_max_drawdown",
        "sharpe",
        "active_sharpe",
        "active_win_rate",
        "avg_turnover",
        "avg_selected_count",
        "sample_dates",
    ]
    if not record:
        return {f"{prefix}_{field}": None for field in fields}
    return {f"{prefix}_{field}": clean_float(record.get(field)) for field in fields}


def failure_reasons(row: dict[str, Any], require_validation: bool = True) -> list[str]:
    rules = QUALIFICATION_RULES
    reasons = []
    if (row.get("all_strategy_return") or -999) <= rules["min_strategy_return"]:
        reasons.append("主回测收益不为正")
    if (row.get("all_excess_return") or -999) <= rules["min_excess_return"]:
        reasons.append("主回测主动收益不为正")
    if (row.get("all_active_sharpe") or -999) <= rules["min_active_sharpe"]:
        reasons.append("主回测主动Sharpe不为正")
    if (row.get("all_max_drawdown") or -999) < rules["max_drawdown_floor"]:
        reasons.append("主回测最大回撤超限")
    if (row.get("stress15_excess_return") or -999) < rules["min_stress_1_5x_excess_return"]:
        reasons.append("1.5x成本主动收益为负")
    if require_validation:
        if (row.get("validation_strategy_return") or -999) <= rules["min_validation_strategy_return"]:
            reasons.append("验证段收益不为正")
        if (row.get("validation_excess_return") or -999) <= rules["min_validation_excess_return"]:
            reasons.append("验证段主动收益不为正")
    return reasons


def score_row(row: dict[str, Any]) -> float:
    values = {
        "all_excess": row.get("all_excess_return") or -1.0,
        "stress15_excess": row.get("stress15_excess_return") or -1.0,
        "validation_excess": row.get("validation_excess_return") or -1.0,
        "recent_excess": row.get("recent_excess_return") or -1.0,
        "active_sharpe": row.get("all_active_sharpe") or -3.0,
        "drawdown": row.get("all_max_drawdown") or -1.0,
        "turnover": row.get("all_avg_turnover") or 2.0,
    }
    drawdown_penalty = max(0.0, -0.18 - values["drawdown"]) * 2.0
    turnover_penalty = max(0.0, values["turnover"] - 0.75) * 0.15
    return clean_float(
        values["all_excess"]
        + 0.60 * values["stress15_excess"]
        + 0.90 * values["validation_excess"]
        + 0.30 * values["recent_excess"]
        + 0.08 * values["active_sharpe"]
        - drawdown_penalty
        - turnover_penalty
    ) or -999.0


def build_variant(weight_policy_id: str, weights: dict[str, float], top_n: int, buffer_n: int, liquidity_quantile: float) -> optimizer.CandidateVariant:
    return replace(
        v1.V1_VARIANT,
        variant_id=f"v1_grid_{weight_policy_id}_top{top_n}_buf{buffer_n}_liq{int(liquidity_quantile * 100):02d}",
        name=f"v1 grid {weight_policy_id} Top{top_n} Buffer{buffer_n} Liq{liquidity_quantile:.0%}",
        description="参数网格审计候选。",
        weights=weights,
        top_n=top_n,
        buffer_n=buffer_n,
        liquidity_quantile=liquidity_quantile,
        cap_neutral=True,
    )


def fast_select_target(frame: pd.DataFrame, variant: optimizer.CandidateVariant) -> pd.DataFrame:
    work = frame[(frame["close"] > 0) & (frame["money"] > 0)]
    if work.empty:
        return work
    if "money_ma_20" in work.columns and variant.liquidity_quantile > 0:
        liquidity_floor = work["money_ma_20"].quantile(variant.liquidity_quantile)
        work = work[work["money_ma_20"] >= liquidity_floor]
    if work.empty:
        return work
    work = work.sort_values("lcr_enhancement_score", ascending=False)
    if not variant.cap_neutral or "market_cap_bucket" not in work.columns:
        return work.head(variant.top_n)
    targets = optimizer.cap_bucket_targets(work, variant.top_n)
    parts = []
    for bucket, quota in targets.items():
        if quota <= 0:
            continue
        part = work[work["market_cap_bucket"] == bucket].head(quota)
        if not part.empty:
            parts.append(part)
    if not parts:
        return work.head(variant.top_n)
    selected = pd.concat(parts, ignore_index=True).sort_values("lcr_enhancement_score", ascending=False)
    if len(selected) < variant.top_n:
        selected_codes = set(selected["code"])
        extra = work[~work["code"].isin(selected_codes)].head(variant.top_n - len(selected))
        selected = pd.concat([selected, extra], ignore_index=True)
    return selected.head(variant.top_n)


def simulate_fast_rebalance(scored: pd.DataFrame, benchmark: pd.DataFrame, variant: optimizer.CandidateVariant, dates: set[pd.Timestamp], cost_multiplier: float) -> dict[str, Any] | None:
    future_col = f"future_return_{PRIMARY_REBALANCE_DAYS}"
    if future_col not in scored.columns or not dates:
        return None
    work = date_window(scored, dates).dropna(subset=["lcr_enhancement_score", future_col]).copy()
    if work.empty:
        return None
    benchmark_work = date_window(benchmark, dates).dropna(subset=[future_col]).copy()
    benchmark_by_day = {pd.Timestamp(day): frame for day, frame in benchmark_work.groupby("date")}
    selected_dates = set(v1.select_rebalance_dates(work, PRIMARY_REBALANCE_DAYS))
    if not selected_dates:
        return None
    base_cost = optimizer.kernel.TRADING_COST_RATE + optimizer.kernel.TRADING_SLIPPAGE_RATE
    nav = 1.0
    bench_nav = 1.0
    active_nav = 1.0
    previous_weights: dict[str, float] = {}
    period_returns: list[float] = []
    benchmark_returns: list[float] = []
    active_returns: list[float] = []
    turnovers: list[float] = []
    selected_counts: list[int] = []
    curve: list[dict[str, Any]] = []
    sample_trades = 0

    for day, frame in work.groupby("date", sort=True):
        day_ts = pd.Timestamp(day)
        if day_ts not in selected_dates:
            continue
        picked = fast_select_target(frame, variant)
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = {code: weight for code in picked["code"].tolist()}
        all_codes = set(previous_weights) | set(current_weights)
        turnover = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked[future_col] * weight).sum())
        bench_frame = benchmark_by_day.get(day_ts)
        benchmark_return = clean_float(bench_frame[future_col].mean()) if bench_frame is not None else 0.0
        benchmark_return = benchmark_return or 0.0
        cost = turnover * base_cost * cost_multiplier
        net_return = gross_return - cost
        active_return = net_return - benchmark_return
        nav *= 1 + net_return
        bench_nav *= 1 + benchmark_return
        active_nav *= 1 + active_return
        previous_weights = current_weights
        period_returns.append(net_return)
        benchmark_returns.append(benchmark_return)
        active_returns.append(active_return)
        turnovers.append(turnover)
        selected_counts.append(int(len(picked)))
        sample_trades += int(len(picked))
        curve.append({
            "date": day_ts.strftime("%Y-%m-%d"),
            "net_value": clean_float(nav),
            "benchmark_net_value": clean_float(bench_nav),
            "active_net_value": clean_float(active_nav),
        })
    if not period_returns:
        return None
    periods = len(period_returns)
    annual_scale = 252.0 / float(PRIMARY_REBALANCE_DAYS)
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    active_std = float(np.std(active_returns, ddof=1)) if periods > 1 else 0.0
    strategy_annual = float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    benchmark_annual = float(bench_nav ** (annual_scale / periods) - 1) if bench_nav > 0 else None
    active_annual = float(active_nav ** (annual_scale / periods) - 1) if active_nav > 0 else None
    return {
        "strategy_return": clean_float(nav - 1),
        "benchmark_return": clean_float(bench_nav - 1),
        "excess_return": clean_float(active_nav - 1),
        "strategy_annual_return": clean_float(strategy_annual),
        "benchmark_annual_return": clean_float(benchmark_annual),
        "active_annual_return": clean_float(active_annual),
        "max_drawdown": v1.max_drawdown([item["net_value"] for item in curve]),
        "active_max_drawdown": v1.max_drawdown([item["active_net_value"] for item in curve]),
        "sharpe": clean_float(np.mean(period_returns) / period_std * math.sqrt(annual_scale)) if period_std > 0 else None,
        "active_sharpe": clean_float(np.mean(active_returns) / active_std * math.sqrt(annual_scale)) if active_std > 0 else None,
        "active_win_rate": clean_float(np.mean([ret > 0 for ret in active_returns])),
        "avg_turnover": clean_float(np.mean(turnovers)),
        "avg_selected_count": clean_float(np.mean(selected_counts)),
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "cost_multiplier": clean_float(cost_multiplier),
        "engine": "fast_direct_cap_neutral_no_buffer",
    }


def simulate_window(scored: pd.DataFrame, benchmark: pd.DataFrame, variant: optimizer.CandidateVariant, dates: set[pd.Timestamp], cost_multiplier: float) -> dict[str, Any] | None:
    return simulate_fast_rebalance(scored, benchmark, variant, dates, cost_multiplier)


def ranges_for_mode(mode: str) -> tuple[dict[str, dict[str, float]], dict[str, set[tuple[str, str]]], list[int], list[int], list[float]]:
    if mode == "full":
        return WEIGHT_POLICIES, LAYER_POLICIES, TOP_N_VALUES, BUFFER_N_VALUES, LIQUIDITY_QUANTILES
    if mode == "targeted":
        weights = {key: WEIGHT_POLICIES[key] for key in TARGETED_WEIGHT_POLICIES}
        layers = {key: LAYER_POLICIES[key] for key in TARGETED_LAYER_POLICIES}
        return weights, layers, TARGETED_TOP_N_VALUES, TARGETED_BUFFER_N_VALUES, TARGETED_LIQUIDITY_QUANTILES
    weights = {key: WEIGHT_POLICIES[key] for key in COARSE_WEIGHT_POLICIES}
    layers = {key: LAYER_POLICIES[key] for key in COARSE_LAYER_POLICIES}
    return weights, layers, COARSE_TOP_N_VALUES, COARSE_BUFFER_N_VALUES, COARSE_LIQUIDITY_QUANTILES


def latest_selection(scored: pd.DataFrame, variant: optimizer.CandidateVariant) -> dict[str, Any]:
    selections = v1.build_daily_selections(scored, variant)
    return selections[-1] if selections else {}


def flatten_latest_selection(selection: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for item in selection.get("items") or []:
        rows.append({
            "code": item.get("code"),
            "name": item.get("name") or item.get("code"),
            "security": item.get("security"),
            "score": item.get("score"),
            "market_regime": item.get("market_regime"),
            "market_cap_bucket": item.get("market_cap_bucket"),
        })
    return rows


def summarize_dimension(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return []
    summaries = []
    for value, group in frame.groupby(key, dropna=False):
        failure_counts: dict[str, int] = {}
        for reasons in group["failure_reasons"].fillna(""):
            for reason in str(reasons).split("; "):
                if reason:
                    failure_counts[reason] = failure_counts.get(reason, 0) + 1
        summaries.append({
            "dimension": key,
            "value": value,
            "tested_count": int(len(group)),
            "qualified_count": int((group["qualified_strict"] == True).sum()),
            "qualified_in_sample_count": int((group["qualified_in_sample"] == True).sum()),
            "best_score": clean_float(group["selection_score"].max()),
            "mean_all_excess_return": clean_float(group["all_excess_return"].mean()),
            "mean_validation_excess_return": clean_float(group["validation_excess_return"].mean()),
            "top_failure_reasons": sorted(failure_counts.items(), key=lambda item: item[1], reverse=True)[:3],
        })
    return sorted(summaries, key=lambda item: (item["qualified_count"], item["best_score"] or -999), reverse=True)


def build_report(package: dict[str, Any], output_path: Path, csv_path: Path, symbol_path: Path) -> str:
    best = package.get("best_strict") or package.get("best_in_sample") or package.get("best_overall") or {}
    rows = package.get("top_rows") or []
    lines = [
        "# 中证500 LCR v1 参数网格回测审计",
        "",
        f"生成时间：{package.get('generated_at')}",
        f"结果文件：`{display_path(output_path)}`",
        f"CSV：`{display_path(csv_path)}`",
        f"最佳参数最新选股：`{display_path(symbol_path)}`",
        "",
        "## 结论",
        "",
        f"- 测试组合数：{package.get('tested_count')}；严格合格：{package.get('qualified_strict_count')}；样本内合格：{package.get('qualified_in_sample_count')}。",
        f"- 最佳严格参数：`{best.get('variant_id') or '-'}` / 分层 `{best.get('layer_policy_id') or '-'}`。",
        f"- 主回测收益：{pct(best.get('all_strategy_return'))}，主动收益：{pct(best.get('all_excess_return'))}，主动Sharpe：{num(best.get('all_active_sharpe'))}，回撤：{pct(best.get('all_max_drawdown'))}。",
        f"- 1.5x成本主动收益：{pct(best.get('stress15_excess_return'))}；验证段收益：{pct(best.get('validation_strategy_return'))}，验证段主动收益：{pct(best.get('validation_excess_return'))}。",
        "",
        "## 参数范围",
        "",
        f"- TopN：{package.get('parameter_ranges', {}).get('top_n')}",
        f"- BufferN：{package.get('parameter_ranges', {}).get('buffer_n')}",
        f"- 流动性分位过滤：{package.get('parameter_ranges', {}).get('liquidity_quantile')}",
        f"- 权重策略：{', '.join(package.get('parameter_ranges', {}).get('weight_policy_ids') or [])}",
        f"- 分层策略：{', '.join(package.get('parameter_ranges', {}).get('layer_policy_ids') or [])}",
        "",
        "## 前十组合",
        "",
        "| 排名 | 严格合格 | 参数 | 分层 | 主收益 | 主动收益 | 1.5x主动 | 验证收益 | 验证主动 | Sharpe | 回撤 | 失败原因 |",
        "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for idx, row in enumerate(rows[:10], start=1):
        param = f"{row.get('weight_policy_id')} Top{row.get('top_n')}/B{row.get('buffer_n')}/Liq{row.get('liquidity_quantile')}"
        lines.append(
            "| %d | %s | `%s` | `%s` | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                idx,
                "是" if row.get("qualified_strict") else "否",
                param,
                row.get("layer_policy_id"),
                pct(row.get("all_strategy_return")),
                pct(row.get("all_excess_return")),
                pct(row.get("stress15_excess_return")),
                pct(row.get("validation_strategy_return")),
                pct(row.get("validation_excess_return")),
                num(row.get("all_active_sharpe")),
                pct(row.get("all_max_drawdown")),
                row.get("failure_reasons") or "-",
            )
        )
    lines.extend([
        "",
        "## 参数问题定位",
        "",
    ])
    for section in package.get("dimension_summaries") or []:
        lines.extend([
            f"### {section.get('dimension')}",
            "",
            "| 值 | 测试数 | 严格合格 | 样本内合格 | 最佳分 | 平均主动 | 平均验证主动 | 主要失败原因 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ])
        for item in section.get("items") or []:
            failures = "; ".join(f"{name}({count})" for name, count in item.get("top_failure_reasons") or [])
            lines.append(
                "| `%s` | %d | %d | %d | %s | %s | %s | %s |" % (
                    item.get("value"),
                    item.get("tested_count"),
                    item.get("qualified_count"),
                    item.get("qualified_in_sample_count"),
                    num(item.get("best_score")),
                    pct(item.get("mean_all_excess_return")),
                    pct(item.get("mean_validation_excess_return")),
                    failures or "-",
                )
            )
        lines.append("")
    lines.extend([
        "## 数据边界",
        "",
        package.get("data_policy") or "",
        "",
    ])
    return "\n".join(lines)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit CSI500 LCR v1 parameter ranges.")
    parser.add_argument("inputs", nargs="+", help="Slice JSON files or glob patterns with factor_rows.")
    parser.add_argument("--mode", choices=["targeted", "coarse", "full"], default="targeted")
    parser.add_argument("--output", default="")
    parser.add_argument("--csv", default="")
    parser.add_argument("--report", default="")
    parser.add_argument("--latest-symbols-csv", default="")
    args = parser.parse_args()

    files = optimizer.expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到 slice 输入文件。")
    table, audit = optimizer.build_table(files)
    audit["slice_count"] = len(files)
    factor_records, factor_gate_summary, kept_factors = v1.run_factor_gate(table)
    required_factors = set(BASE_WEIGHTS)
    missing = sorted(required_factors - set(kept_factors))
    if missing:
        raise SystemExit("v1 参数网格需要的因子未通过门禁：" + ", ".join(missing))

    dates = split_dates(table)
    weight_policies, layer_policies, top_n_values, buffer_n_values, liquidity_quantiles = ranges_for_mode(args.mode)
    rows: list[dict[str, Any]] = []
    detail_records: list[dict[str, Any]] = []
    latest_by_key: dict[str, dict[str, Any]] = {}

    for weight_policy_id, weights in weight_policies.items():
        valid_weights = {factor: weight for factor, weight in weights.items() if factor in kept_factors and abs(weight) > 1e-12}
        for top_n in top_n_values:
            for buffer_n in buffer_n_values:
                if buffer_n < top_n:
                    continue
                for liquidity_quantile in liquidity_quantiles:
                    variant = build_variant(weight_policy_id, valid_weights, top_n, buffer_n, liquidity_quantile)
                    scored_full = optimizer.score_table(table, variant)
                    for layer_policy_id, layers in layer_policies.items():
                        scored = apply_layer_policy(scored_full, layers)
                        if scored.empty:
                            continue
                        all_primary = simulate_window(scored, scored_full, variant, dates["all"], PRIMARY_COST)
                        stress15 = simulate_window(scored, scored_full, variant, dates["all"], STRESS_COST)
                        row = {
                            "variant_id": variant.variant_id,
                            "weight_policy_id": weight_policy_id,
                            "layer_policy_id": layer_policy_id,
                            "layer_names": "; ".join(layer_names(layers)),
                            "top_n": top_n,
                            "buffer_n": buffer_n,
                            "liquidity_quantile": liquidity_quantile,
                            "retained_factor_rows": int(len(scored)),
                            "retained_factor_dates": int(scored["date"].nunique()),
                            "retained_unique_securities": int(scored["code"].nunique()),
                            "weights_json": json.dumps(valid_weights, ensure_ascii=False, sort_keys=True),
                        }
                        row.update(scalar_metrics(all_primary, "all"))
                        row.update(scalar_metrics(stress15, "stress15"))
                        preliminary_reasons = failure_reasons(row, require_validation=False)
                        run_validation = not preliminary_reasons or (
                            (row.get("all_excess_return") or -999) > -0.02
                            and (row.get("stress15_excess_return") or -999) > -0.02
                        )
                        stress20 = None
                        validation = None
                        recent = None
                        if run_validation:
                            stress20 = simulate_window(scored, scored_full, variant, dates["all"], HARD_STRESS_COST)
                            validation = simulate_window(scored, scored_full, variant, dates["validation"], PRIMARY_COST)
                            recent = simulate_window(scored, scored_full, variant, dates["recent"], PRIMARY_COST)
                        row.update(scalar_metrics(stress20, "stress20"))
                        row.update(scalar_metrics(validation, "validation"))
                        row.update(scalar_metrics(recent, "recent"))
                        reasons = failure_reasons(row, require_validation=run_validation)
                        if preliminary_reasons and not run_validation:
                            reasons = preliminary_reasons
                        row["failure_reasons"] = "; ".join(reasons)
                        row["qualified_strict"] = not reasons
                        row["qualified_in_sample"] = (
                            (row.get("all_strategy_return") or -999) > 0
                            and (row.get("all_excess_return") or -999) > 0
                            and (row.get("all_active_sharpe") or -999) > 0
                            and (row.get("all_max_drawdown") or -999) >= QUALIFICATION_RULES["max_drawdown_floor"]
                            and (row.get("stress15_excess_return") or -999) >= 0
                        )
                        row["selection_score"] = score_row(row)
                        rows.append(row)
                        for label, record in [
                            ("all_primary", all_primary),
                            ("stress15", stress15),
                            ("stress20", stress20),
                            ("validation", validation),
                            ("recent", recent),
                        ]:
                            if record:
                                trimmed = {key: value for key, value in record.items() if key != "net_value_curve"}
                                trimmed.update({
                                    "audit_window": label,
                                    "weight_policy_id": weight_policy_id,
                                    "layer_policy_id": layer_policy_id,
                                    "top_n": top_n,
                                    "buffer_n": buffer_n,
                                    "liquidity_quantile": liquidity_quantile,
                                })
                                detail_records.append(trimmed)
                        latest_by_key[f"{variant.variant_id}|{layer_policy_id}"] = latest_selection(scored, variant)

    if not rows:
        raise SystemExit("参数网格没有生成任何结果。")

    rows = sorted(rows, key=lambda item: (bool(item.get("qualified_strict")), item.get("selection_score") or -999), reverse=True)
    best_strict = next((row for row in rows if row.get("qualified_strict")), None)
    best_in_sample = next((row for row in rows if row.get("qualified_in_sample")), None)
    best_overall = rows[0]
    best = best_strict or best_in_sample or best_overall
    best_selection = latest_by_key.get(f"{best['variant_id']}|{best['layer_policy_id']}") or {}

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"csi500_lcr_v1_parameter_grid_audit_{stamp}.json"
    csv_path = Path(args.csv) if args.csv else RESULT_DIR / f"csi500_lcr_v1_parameter_grid_audit_{stamp}.csv"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-csi500-lcr-v1-parameter-grid-audit-{stamp}.md"
    symbol_path = Path(args.latest_symbols_csv) if args.latest_symbols_csv else SYMBOL_DIR / f"csi500_lcr_v1_parameter_grid_best_symbols_{stamp}.csv"
    for path_name in ["output_path", "csv_path", "report_path", "symbol_path"]:
        path = locals()[path_name]
        if not path.is_absolute():
            locals()[path_name] = ROOT / path

    dimension_summaries = [
        {"dimension": key, "items": summarize_dimension(rows, key)}
        for key in ["weight_policy_id", "layer_policy_id", "top_n", "buffer_n", "liquidity_quantile"]
    ]

    package = {
        "result_type": "csi500_lcr_v1_parameter_grid_audit",
        "source": "joinquant_csi500_lcr_v1_parameter_grid_audit",
        "strategy_id": v1.STRATEGY_ID,
        "strategy_name": v1.STRATEGY_NAME,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "真实 JoinQuant factor slice 合并复算；参数网格只复用已通过门禁的 v1 因子，不联网、不补造缺失收益；5日交易使用真实非重叠调仓步长，并单独检查后25%验证段。",
        "slice_audit": audit,
        "factor_gate_summary": factor_gate_summary,
        "kept_factors": kept_factors,
        "qualification_rules": QUALIFICATION_RULES,
        "parameter_ranges": {
            "mode": args.mode,
            "top_n": top_n_values,
            "buffer_n": buffer_n_values,
            "liquidity_quantile": liquidity_quantiles,
            "weight_policy_ids": list(weight_policies.keys()),
            "layer_policy_ids": list(layer_policies.keys()),
        },
        "date_windows": {
            key: {
                "count": len(value),
                "start": min(value).strftime("%Y-%m-%d") if value else None,
                "end": max(value).strftime("%Y-%m-%d") if value else None,
            }
            for key, value in dates.items()
        },
        "tested_count": len(rows),
        "qualified_strict_count": int(sum(1 for row in rows if row.get("qualified_strict"))),
        "qualified_in_sample_count": int(sum(1 for row in rows if row.get("qualified_in_sample"))),
        "best_strict": best_strict,
        "best_in_sample": best_in_sample,
        "best_overall": best_overall,
        "top_rows": rows[:50],
        "dimension_summaries": dimension_summaries,
        "best_latest_selection": best_selection,
        "detail_records": detail_records,
    }

    write_json(output_path, package)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(csv_path, index=False, encoding="utf-8-sig")
    symbol_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(flatten_latest_selection(best_selection)).to_csv(symbol_path, index=False, encoding="utf-8-sig")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path, csv_path, symbol_path), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "tested_count": package["tested_count"],
        "qualified_strict_count": package["qualified_strict_count"],
        "qualified_in_sample_count": package["qualified_in_sample_count"],
        "best": best,
        "output_path": display_path(output_path),
        "csv_path": display_path(csv_path),
        "report_path": display_path(report_path),
        "latest_symbols_csv": display_path(symbol_path),
    }, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
