#!/usr/bin/env python3
"""Build CSI500 low-crowding reversal index-enhancement v1 candidate.

v1 is deliberately conservative:

1. Run an auditable factor gate on all available CSI500 LCR slice factors.
2. Keep only factors that pass the 20-day gate and are positive on 5-day checks.
3. Rebuild the strategy with Top20 / Buffer60 / cap-neutral selection.
4. Use true non-overlapping rebalance steps for 5/10/20-day trading tests.

Inputs are JoinQuant factor slice files. The script does not infer missing rows
or fabricate results from summary packages.
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

sys.path.insert(0, str(SCRIPT_DIR))
import optimize_csi500_lcr_candidates as optimizer  # noqa: E402


STRATEGY_ID = "csi500_low_crowding_reversal_index_enhancement_v1"
STRATEGY_NAME = "中证500低拥挤反转指数增强候选策略 v1"
SOURCE = "joinquant_csi500_lcr_v1_true_rebalance_candidate"
DATASET = "csi500"
EVENT_HORIZONS = [1, 5, 10, 20]
TRADING_HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
TOP_N = 15
BUFFER_N = 80
LIQUIDITY_QUANTILE = 0.25
COST_MULTIPLIERS = [1.0, 1.5, 2.0]
ALLOWED_LAYER_SET = {
    ("high_volatility", "large_cap"),
    ("medium_volatility", "mid_cap"),
    ("low_volatility", "large_cap"),
    ("low_volatility", "mid_cap"),
    ("low_volatility", "small_cap"),
}
ALLOWED_LAYER_NAMES = {
    "high_volatility|large_cap": "高波动/大市值",
    "high_volatility|mid_cap": "高波动/中市值",
    "medium_volatility|mid_cap": "中波动/中市值",
    "low_volatility|large_cap": "低波动/大市值",
    "low_volatility|mid_cap": "低波动/中市值",
    "low_volatility|small_cap": "低波动/小市值",
}

V1_WEIGHTS = {
    "jq_lcr_volume_liquidity_balance": 0.35,
    "jq_lcr_volume_stability": 0.25,
    "jq_lcr_volume_stability_cap_neutral": 0.25,
    "jq_lcr_volume_stability_residual": 0.15,
}

V1_VARIANT = optimizer.CandidateVariant(
    variant_id="v1_top15_buffer80_liq25_no_high_mid_volume_quality",
    name="v1 Top15 Buffer80 流动性25%去高波动中市值",
    description="只保留通过门禁的量能稳定、流动性均衡、市值中性量稳和残差量稳因子；过滤拖累分层，Top15/Buffer80 与25%流动性过滤控制组合质量。",
    weights=V1_WEIGHTS,
    top_n=TOP_N,
    buffer_n=BUFFER_N,
    cap_neutral=True,
    liquidity_quantile=LIQUIDITY_QUANTILE,
)


def allowed_layer_keys() -> list[str]:
    return [f"{regime}|{bucket}" for regime, bucket in sorted(ALLOWED_LAYER_SET)]


def apply_allowed_layers(table: pd.DataFrame) -> pd.DataFrame:
    mask = table.apply(lambda row: (row.get("market_regime"), row.get("market_cap_bucket")) in ALLOWED_LAYER_SET, axis=1)
    return table[mask].copy()


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


def factor_pass_reason(row: dict[str, Any], h5: dict[str, Any] | None) -> str:
    if row.get("gate_passed") is True and h5 and (h5.get("long_short_mean") or -999) > 0 and (h5.get("rank_ic_mean") or -999) > 0:
        return "保留：20日门禁通过，5日同向为正。"
    failures = []
    if row.get("gate_passed") is not True:
        failures.append("20日门禁未通过")
    if h5 and (h5.get("long_short_mean") or -999) <= 0:
        failures.append("5日多空不为正")
    if h5 and (h5.get("rank_ic_mean") or -999) <= 0:
        failures.append("5日IC不为正")
    return "剔除：" + "；".join(failures)


def run_factor_gate(table: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    factors = [col for col in table.columns if col.startswith("jq_lcr_")]
    audit_variant = optimizer.CandidateVariant("v1_factor_gate_audit", "v1 因子门禁审计", "全因子门禁", {factor: 1.0 for factor in factors})
    records, _gate_rows = optimizer.factor_backtest(table, factors, audit_variant)
    gate_summary = []
    kept = []
    for factor in factors:
        by_horizon = {int(row["horizon"]): row for row in records if row.get("factor") == factor}
        h20 = by_horizon.get(20, {})
        h5 = by_horizon.get(5)
        keep = h20.get("gate_passed") is True and h5 is not None and (h5.get("long_short_mean") or -999) > 0 and (h5.get("rank_ic_mean") or -999) > 0
        if keep:
            kept.append(factor)
        gate_summary.append({
            "factor": factor,
            "kept_for_v1": bool(keep),
            "reason": factor_pass_reason(h20, h5),
            "sample_dates_20d": h20.get("sample_dates"),
            "rank_ic_20d": h20.get("rank_ic_mean"),
            "rank_ic_t_20d": h20.get("rank_ic_t"),
            "long_short_20d": h20.get("long_short_mean"),
            "long_short_positive_ratio_20d": h20.get("long_short_positive_ratio"),
            "rank_ic_5d": h5.get("rank_ic_mean") if h5 else None,
            "rank_ic_t_5d": h5.get("rank_ic_t") if h5 else None,
            "long_short_5d": h5.get("long_short_mean") if h5 else None,
            "long_short_positive_ratio_5d": h5.get("long_short_positive_ratio") if h5 else None,
        })
    gate_summary = sorted(gate_summary, key=lambda item: (item["kept_for_v1"], item.get("rank_ic_20d") or -999), reverse=True)
    return records, gate_summary, kept


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


def rebalance_stride(rebalance_days: int) -> int:
    return max(1, int(round(float(rebalance_days) / FACTOR_DAY_STEP)))


def select_rebalance_dates(work: pd.DataFrame, rebalance_days: int) -> list[pd.Timestamp]:
    dates = sorted(pd.to_datetime(work["date"].dropna().unique()))
    stride = rebalance_stride(rebalance_days)
    return [pd.Timestamp(day) for idx, day in enumerate(dates) if idx % stride == 0]


def simulate_true_rebalance(
    table: pd.DataFrame,
    variant: optimizer.CandidateVariant,
    rebalance_days: int,
    cost_multiplier: float,
    layer_label: str,
    layer_meta: dict[str, Any],
    benchmark_table: pd.DataFrame | None = None,
) -> dict[str, Any] | None:
    future_col = f"future_return_{rebalance_days}"
    if future_col not in table.columns:
        return None
    work = table.dropna(subset=["lcr_enhancement_score", future_col]).copy()
    if work.empty:
        return None
    dates = set(select_rebalance_dates(work, rebalance_days))
    if not dates:
        return None
    benchmark_work = None
    if benchmark_table is not None:
        benchmark_work = benchmark_table.dropna(subset=[future_col]).copy()
        benchmark_work = {pd.Timestamp(day): frame for day, frame in benchmark_work.groupby("date")}

    base_cost = optimizer.kernel.TRADING_COST_RATE + optimizer.kernel.TRADING_SLIPPAGE_RATE
    nav = 1.0
    bench_nav = 1.0
    active_nav = 1.0
    previous_weights: dict[str, float] = {}
    previous_codes: set[str] = set()
    period_returns = []
    benchmark_returns = []
    active_returns = []
    turnover_values = []
    selected_counts = []
    curve = []
    sample_trades = 0

    grouped = work.sort_values(["date", "lcr_enhancement_score"], ascending=[True, False]).groupby("date")
    for day, frame in grouped:
        day_ts = pd.Timestamp(day)
        if day_ts not in dates:
            continue
        picked = optimizer.select_target(frame, variant, previous_codes=previous_codes)
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = {code: weight for code in picked["code"].tolist()}
        all_codes = set(previous_weights.keys()) | set(current_weights.keys())
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked[future_col] * weight).sum())
        benchmark_frame = benchmark_work.get(day_ts) if benchmark_work is not None else frame
        benchmark_return = clean_float(benchmark_frame[future_col].mean()) or 0.0
        cost = traded_notional * base_cost * float(cost_multiplier)
        net_return = gross_return - cost
        active_return = net_return - benchmark_return

        nav *= 1 + net_return
        bench_nav *= 1 + benchmark_return
        active_nav *= 1 + active_return
        sample_trades += int(len(picked))
        period_returns.append(net_return)
        benchmark_returns.append(benchmark_return)
        active_returns.append(active_return)
        turnover_values.append(traded_notional)
        selected_counts.append(int(len(picked)))
        curve.append({
            "date": day_ts.strftime("%Y-%m-%d"),
            "net_value": clean_float(nav),
            "benchmark_net_value": clean_float(bench_nav),
            "active_net_value": clean_float(active_nav),
            "period_return": clean_float(net_return),
            "benchmark_return": clean_float(benchmark_return),
            "active_return": clean_float(active_return),
            "gross_return": clean_float(gross_return),
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
        "dataset": DATASET,
        "horizon": int(rebalance_days),
        "horizon_label": f"{rebalance_days}日真实调仓交易",
        "rebalance_days": int(rebalance_days),
        "rebalance_stride_factor_dates": int(rebalance_stride(rebalance_days)),
        "layer": layer_label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(periods),
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
        "cost_rate": optimizer.kernel.TRADING_COST_RATE,
        "slippage_rate": optimizer.kernel.TRADING_SLIPPAGE_RATE,
        "cost_multiplier": clean_float(cost_multiplier),
        "effective_cost_rate": clean_float(base_cost * float(cost_multiplier)),
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "score_col": "lcr_enhancement_score",
        "selection_policy": f"Top{variant.top_n} / Buffer{variant.buffer_n} / allowed regime-cap layers / cap-neutral / liquidity quantile {variant.liquidity_quantile:.0%} / true rebalance stride",
        "benchmark_scope": "full_csi500_pool" if benchmark_work is not None else "current_layer_or_filtered_pool",
        "net_value_curve": curve[-100:],
    }
    record.update(layer_meta)
    return record


def event_backtest(
    table: pd.DataFrame,
    variant: optimizer.CandidateVariant,
    layer_label: str,
    layer_meta: dict[str, Any],
    benchmark_table: pd.DataFrame | None = None,
) -> list[dict[str, Any]]:
    records = []
    selected_by_day = []
    previous_codes: set[str] = set()
    for _day, frame in table.groupby("date"):
        picked = optimizer.select_target(frame, variant, previous_codes=previous_codes)
        if picked.empty:
            continue
        selected_by_day.append(picked)
        previous_codes = set(picked["code"])
    if not selected_by_day:
        return records
    candidates = pd.concat(selected_by_day, ignore_index=True)
    for horizon in EVENT_HORIZONS:
        col = f"future_return_{horizon}"
        daily = candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        bench_source = benchmark_table if benchmark_table is not None else table
        bench = bench_source.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        merged = pd.concat([daily.rename("strategy"), bench.rename("benchmark")], axis=1).dropna()
        active = merged["strategy"] - merged["benchmark"]
        record = {
            "source": SOURCE,
            "result_type": "strategy_backtest" if not layer_meta else "strategy_regime_size_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "variant_id": variant.variant_id,
            "variant_name": variant.name,
            "dataset": DATASET,
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
            "note": "事件收益检验；1日不作为连续交易回测。",
            "benchmark_scope": "full_csi500_pool" if benchmark_table is not None else "current_layer_or_filtered_pool",
        }
        record.update(layer_meta)
        records.append(record)
    return records


def build_strategy_records(scored: pd.DataFrame, variant: optimizer.CandidateVariant, benchmark_table: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    records.extend(event_backtest(scored, variant, "整体", {}, benchmark_table=benchmark_table))
    for cost_multiplier in COST_MULTIPLIERS:
        for horizon in TRADING_HORIZONS:
            trading = simulate_true_rebalance(scored, variant, horizon, cost_multiplier, "整体", {}, benchmark_table=benchmark_table)
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
            trading = simulate_true_rebalance(part, variant, 5, 1.0, f"{regime_name}/{bucket_name}", meta)
            if trading:
                    records.append(trading)
    return records


def build_daily_selections(scored: pd.DataFrame, variant: optimizer.CandidateVariant) -> list[dict[str, Any]]:
    selections: list[dict[str, Any]] = []
    previous_codes: set[str] = set()
    for day, frame in scored.groupby("date", sort=True):
        picked = optimizer.select_target(frame, variant, previous_codes=previous_codes)
        if picked.empty:
            continue
        previous_codes = set(picked["code"])
        items = []
        for _, row in picked.sort_values("lcr_enhancement_score", ascending=False).iterrows():
            items.append({
                "code": str(row.get("code"))[:6],
                "security": row.get("security"),
                "name": row.get("name"),
                "score": clean_float(row.get("lcr_enhancement_score")),
                "close": clean_float(row.get("close")),
                "money_ma_20": clean_float(row.get("money_ma_20")),
                "market_regime": row.get("market_regime"),
                "market_regime_name": row.get("market_regime_name"),
                "market_cap_bucket": row.get("market_cap_bucket"),
                "market_cap_bucket_name": row.get("market_cap_bucket_name"),
            })
        selections.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "selected_count": int(len(items)),
            "codes": [item["code"] for item in items],
            "items": items,
        })
    return selections


def write_latest_symbols_csv(path: Path, latest_selection: dict[str, Any]) -> None:
    rows = []
    for item in latest_selection.get("items") or []:
        rows.append({
            "code": item.get("code"),
            "name": item.get("name") or item.get("code"),
            "security": item.get("security"),
            "score": item.get("score"),
            "market_regime": item.get("market_regime"),
            "market_cap_bucket": item.get("market_cap_bucket"),
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False, encoding="utf-8-sig")


def status_label(records: list[dict[str, Any]], kept_factors: list[str]) -> tuple[str, str, dict[str, bool]]:
    primary = next(
        (
            row for row in records
            if row.get("result_type") == "strategy_trading_backtest"
            and not row.get("market_regime")
            and int(row.get("rebalance_days") or 0) == 5
            and abs(float(row.get("cost_multiplier") or 0) - 1.0) < 1e-9
        ),
        None,
    )
    stress = next(
        (
            row for row in records
            if row.get("result_type") == "strategy_trading_backtest"
            and not row.get("market_regime")
            and int(row.get("rebalance_days") or 0) == 5
            and abs(float(row.get("cost_multiplier") or 0) - 1.5) < 1e-9
        ),
        None,
    )
    layer_keys = set(
        f"{row.get('market_regime')}|{row.get('market_cap_bucket')}"
        for row in records
        if row.get("result_type") == "strategy_trading_backtest"
        and int(row.get("rebalance_days") or 0) == 5
        and abs(float(row.get("cost_multiplier") or 0) - 1.0) < 1e-9
        and row.get("market_regime")
        and row.get("market_cap_bucket")
    )
    checks = {
        "kept_factor_count": len(kept_factors) >= 2,
        "primary_exists": primary is not None,
        "primary_positive_return": primary is not None and (primary.get("strategy_return") or -999) > 0,
        "primary_positive_excess": primary is not None and (primary.get("excess_return") or -999) > 0,
        "primary_active_sharpe_positive": primary is not None and (primary.get("active_sharpe") or -999) > 0,
        "primary_drawdown_within_floor": primary is not None and (primary.get("max_drawdown") or -999) >= -0.25,
        "stress_1_5x_excess_nonnegative": stress is not None and (stress.get("excess_return") or -999) >= 0,
        "layer_count_nonempty": len(layer_keys) >= len(ALLOWED_LAYER_SET),
    }
    if all(checks.values()):
        return "candidate_for_pressure_test", "可进入压力测试候选", checks
    if primary is not None and checks["primary_positive_excess"]:
        return "research_candidate_needs_pressure", "研究候选，需压力测试确认", checks
    return "not_ready", "未达候选标准", checks


def build_report(package: dict[str, Any], output_path: Path, csv_path: Path) -> str:
    primary = package.get("primary_trading") or {}
    stress = package.get("stress_trading_1_5x") or {}
    lines = [
        "# 中证500低拥挤反转指数增强候选策略 v1",
        "",
        f"生成时间：{package.get('generated_at')}",
        f"结果文件：`{display_path(output_path)}`",
        f"CSV：`{display_path(csv_path)}`",
        f"最新选股池：`{package.get('latest_symbols_csv')}`" if package.get("latest_symbols_csv") else "",
        "",
        "## 结论",
        "",
        f"- 状态：{package.get('strategy_status_name')}",
        f"- 主配置：Top{TOP_N} / Buffer{BUFFER_N} / 分层过滤 / 5日真实调仓 / 成本1.0x。",
        f"- 主动收益：{pct(primary.get('excess_return'))}，主动Sharpe：{num(primary.get('active_sharpe'))}，最大回撤：{pct(primary.get('max_drawdown'))}，平均换手：{num(primary.get('avg_turnover'))}。",
        f"- 1.5x成本压力主动收益：{pct(stress.get('excess_return'))}，主动Sharpe：{num(stress.get('active_sharpe'))}。",
        "",
        "## 因子过滤",
        "",
        "| 因子 | v1处理 | 20日IC | 20日t | 20日多空 | 20日多空正比 | 5日IC | 5日多空 | 原因 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in package.get("factor_gate_summary") or []:
        lines.append(
            "| `%s` | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                row.get("factor"),
                "保留" if row.get("kept_for_v1") else "剔除",
                num(row.get("rank_ic_20d"), 4),
                num(row.get("rank_ic_t_20d"), 2),
                pct(row.get("long_short_20d")),
                pct(row.get("long_short_positive_ratio_20d")),
                num(row.get("rank_ic_5d"), 4),
                pct(row.get("long_short_5d")),
                row.get("reason"),
            )
        )
    lines.extend([
        "",
        "## 分层过滤",
        "",
        "v1 只开放以下市场状态/市值层。整体交易回测选股只来自开放分层，benchmark 仍使用完整中证500池。",
        "",
    ])
    for key in package.get("allowed_layer_names") or []:
        lines.append(f"- {key}")
    lines.extend([
        "",
        "## 交易回测",
        "",
        "| 持有 | 成本 | 调仓期数 | 策略收益 | 基准收益 | 主动收益 | 年化主动 | 主动Sharpe | 回撤 | 胜率 | 平均换手 |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])
    trading_rows = [row for row in package.get("records") or [] if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime")]
    trading_rows = sorted(trading_rows, key=lambda row: (row.get("rebalance_days") or 0, row.get("cost_multiplier") or 0))
    for row in trading_rows:
        lines.append(
            "| %d日 | %.1fx | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                row.get("rebalance_days"),
                row.get("cost_multiplier"),
                row.get("sample_dates"),
                pct(row.get("strategy_return")),
                pct(row.get("benchmark_return")),
                pct(row.get("excess_return")),
                pct(row.get("active_annual_return")),
                num(row.get("active_sharpe")),
                pct(row.get("max_drawdown")),
                pct(row.get("active_win_rate")),
                num(row.get("avg_turnover")),
            )
        )
    lines.extend([
        "",
        "## 检查项",
        "",
    ])
    for key, value in (package.get("strategy_checks") or {}).items():
        lines.append(f"- `{key}`：{value}")
    lines.extend([
        "",
        "## 最新压力测试输入",
        "",
    ])
    latest = package.get("latest_selection") or {}
    lines.extend([
        f"- 最新信号日：{latest.get('date')}",
        f"- 最新选股数：{latest.get('selected_count')}",
        f"- 最新代码：{', '.join(latest.get('codes') or [])}",
        "",
        "| 代码 | 名称 | 分数 | 市场层 | 市值层 |",
        "| --- | --- | ---: | --- | --- |",
    ])
    for item in latest.get("items") or []:
        lines.append(
            "| `%s` | %s | %s | %s | %s |" % (
                item.get("code"),
                item.get("name"),
                num(item.get("score"), 4),
                item.get("market_regime_name") or item.get("market_regime"),
                item.get("market_cap_bucket_name") or item.get("market_cap_bucket"),
            )
        )
    lines.extend([
        "",
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
    parser = argparse.ArgumentParser(description="Build CSI500 LCR v1 candidate from JoinQuant factor slices.")
    parser.add_argument("inputs", nargs="+", help="Slice JSON/TXT/LOG files or glob patterns with factor_rows.")
    parser.add_argument("--output", default="")
    parser.add_argument("--report", default="")
    parser.add_argument("--csv", default="")
    parser.add_argument("--latest-symbols-csv", default="")
    args = parser.parse_args()

    files = optimizer.expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到 slice 输入文件。")
    table, audit = optimizer.build_table(files)
    audit["slice_count"] = len(files)

    factor_records, factor_gate_summary, kept_factors = run_factor_gate(table)
    missing_kept = [factor for factor in V1_WEIGHTS if factor not in kept_factors]
    if missing_kept:
        raise SystemExit("v1 权重包含未通过过滤的因子：" + ", ".join(missing_kept))

    variant = replace(V1_VARIANT, weights={factor: V1_WEIGHTS[factor] for factor in kept_factors if factor in V1_WEIGHTS})
    scored_full = optimizer.score_table(table, variant)
    scored = apply_allowed_layers(scored_full)
    daily_selections = build_daily_selections(scored, variant)
    latest_selection = daily_selections[-1] if daily_selections else {}
    records = build_strategy_records(scored, variant, benchmark_table=scored_full)
    status, status_name, checks = status_label(records, kept_factors)

    for record in factor_records + records:
        record["strategy_id"] = STRATEGY_ID
        record["strategy_name"] = STRATEGY_NAME
        record["source"] = SOURCE
        record["strategy_status"] = status
        record["strategy_status_name"] = status_name
        record["variant_config"] = {
            "weights": variant.weights,
            "top_n": variant.top_n,
            "buffer_n": variant.buffer_n,
            "cap_neutral": variant.cap_neutral,
            "liquidity_quantile": variant.liquidity_quantile,
            "allowed_layers": allowed_layer_keys(),
            "true_rebalance": True,
            "trading_horizons": TRADING_HORIZONS,
            "cost_multipliers": COST_MULTIPLIERS,
        }
        record["data_policy"] = "JoinQuant factor slice 原始截面合并复算；交易回测使用真实调仓步长，不使用重叠未来收益连续复利。"

    primary = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime") and row.get("rebalance_days") == 5 and abs(float(row.get("cost_multiplier") or 0) - 1.0) < 1e-9), None)
    stress = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime") and row.get("rebalance_days") == 5 and abs(float(row.get("cost_multiplier") or 0) - 1.5) < 1e-9), None)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"csi500_low_crowding_reversal_index_enhancement_v1_candidate_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-csi500-lcr-v1-candidate-{stamp}.md"
    csv_path = Path(args.csv) if args.csv else RESULT_DIR / f"csi500_low_crowding_reversal_index_enhancement_v1_records_{stamp}.csv"
    latest_symbols_path = Path(args.latest_symbols_csv) if args.latest_symbols_csv else ROOT / "outputs" / "sources" / "joinquant" / "symbols" / f"csi500_lcr_v1_latest_symbols_{stamp}.csv"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    if not csv_path.is_absolute():
        csv_path = ROOT / csv_path
    if not latest_symbols_path.is_absolute():
        latest_symbols_path = ROOT / latest_symbols_path

    package = {
        "result_type": "index_enhancement_research_package",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "variant_id": variant.variant_id,
        "variant_name": variant.name,
        "variant_description": variant.description,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": f"真实 JoinQuant factor slice 合并复算；v1 先做因子门禁，剔除未通过因子，再用 Top{TOP_N}/Buffer{BUFFER_N}/分层过滤/市值中性/{LIQUIDITY_QUANTILE:.0%}流动性过滤构造策略；5/10/20日交易回测使用非重叠真实调仓步长。",
        "slice_audit": audit,
        "factor_gate": optimizer.FACTOR_GATE,
        "factor_gate_summary": factor_gate_summary,
        "kept_factors": kept_factors,
        "dropped_factors": [row["factor"] for row in factor_gate_summary if not row.get("kept_for_v1")],
        "v1_config": {
            "weights": variant.weights,
            "top_n": variant.top_n,
            "buffer_n": variant.buffer_n,
            "cap_neutral": variant.cap_neutral,
            "liquidity_quantile": variant.liquidity_quantile,
            "allowed_layers": allowed_layer_keys(),
            "allowed_layer_names": [ALLOWED_LAYER_NAMES[key] for key in allowed_layer_keys()],
            "event_horizons": EVENT_HORIZONS,
            "trading_horizons": TRADING_HORIZONS,
            "cost_multipliers": COST_MULTIPLIERS,
        },
        "strategy_status": status,
        "strategy_status_name": status_name,
        "strategy_checks": checks,
        "allowed_layers": allowed_layer_keys(),
        "allowed_layer_names": [ALLOWED_LAYER_NAMES[key] for key in allowed_layer_keys()],
        "filtered_slice_audit": {
            "factor_rows": int(len(scored)),
            "factor_dates": int(scored["date"].nunique()),
            "unique_securities": int(scored["code"].nunique()),
            "retained_row_ratio": clean_float(len(scored) / len(scored_full)) if len(scored_full) else None,
        },
        "primary_trading": primary,
        "stress_trading_1_5x": stress,
        "daily_selections": daily_selections,
        "latest_selection": latest_selection,
        "latest_symbols_csv": display_path(latest_symbols_path),
        "pressure_test_hint": {
            "strategy_adapter": "selected_codes_mean_reversion",
            "symbols_file": display_path(latest_symbols_path),
            "top_n": TOP_N,
            "selected_codes": latest_selection.get("codes") or [],
            "note": "现有建仓压力测试模块使用 OHLCV 代理/选股名单运行；该 CSV 是 v1 最新信号池，可作为压力测试股票池输入。",
        },
        "sample": {
            "factor_rows": audit.get("merged_factor_rows"),
            "factor_dates": audit.get("factor_dates"),
            "unique_securities": audit.get("unique_securities"),
            "records": len(factor_records) + len(records),
        },
        "records": factor_records + records,
    }

    write_json(output_path, package)
    pd.DataFrame(package["records"]).to_csv(csv_path, index=False, encoding="utf-8-sig")
    write_latest_symbols_csv(latest_symbols_path, latest_selection)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path, csv_path), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "csv_path": display_path(csv_path),
        "latest_symbols_csv": display_path(latest_symbols_path),
        "strategy_status": status,
        "strategy_status_name": status_name,
        "kept_factors": kept_factors,
        "primary_trading": primary,
        "stress_trading_1_5x": stress,
        "latest_selection": latest_selection,
        "slice_audit": audit,
    }, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
