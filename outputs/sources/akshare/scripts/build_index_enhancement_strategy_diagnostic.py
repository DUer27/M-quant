#!/usr/bin/env python3
"""Build readable index-growth diagnostic strategy backtests.

This intentionally writes a separate diagnostic result file. It does not change
the strict factor gate result and does not promote any route to paper watch.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_index_enhancement_research import (
    ROOT,
    PROCESSED_DIR,
    RESULTS_DIR,
    add_cross_sectional_factors,
    add_time_series_features,
    clean_float,
    metric_summary,
    portfolio_backtest,
    read_price_data,
    yearly_table,
)


SOURCE = "akshare_index_growth_strategy_diagnostic_20260715"
OLD_SOURCE = "akshare_index_enhancement_strategy_diagnostic_20260715"
OUT_JSON = RESULTS_DIR / "index_growth_strategy_diagnostic_results.json"
PLATFORM_IMPORTED = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
HORIZONS = [1, 5, 10, 20]
PRIMARY_HORIZON = 20
COST_RATE = 0.0015

STRATEGY_SPECS = [
    {
        "id": "trend_growth",
        "name": "指数增长趋势策略 v1",
        "score_col": "index_growth_trend_score",
        "role": "primary",
        "description": "用中期趋势、长期趋势、量价确认和收盘强度寻找增长更强的指数成分股。",
    },
    {
        "id": "stable_growth",
        "name": "指数增长稳健策略 v1",
        "score_col": "index_growth_stable_score",
        "role": "primary",
        "description": "用低波动、量能稳定、回撤控制、跳空风险和反拥挤过滤增长中的脆弱样本。",
    },
    {
        "id": "combined_growth",
        "name": "指数增长综合策略 v1",
        "score_col": "index_growth_composite_score",
        "role": "combination_check",
        "description": "把趋势增长和稳健增长合成一个综合评分，用来判断两条策略是否适合合并。",
    },
]

DATASET_CONFIG = {
    "csi300": {
        "display": "沪深300",
        "top_n": [30, 50],
        "core_weight": [0.75, 0.85],
        "min_stocks": 120,
    },
    "csi500": {
        "display": "中证500",
        "top_n": [80, 100],
        "core_weight": [0.75, 0.85],
        "min_stocks": 180,
    },
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def active_total(row: dict) -> float:
    return row.get("excess_return") if row.get("excess_return") is not None else -999.0


def active_sharpe(row: dict) -> float:
    return row.get("active_sharpe") if row.get("active_sharpe") is not None else -999.0


def diagnostic_verdict(row: dict) -> tuple[str, str]:
    total = row.get("excess_return")
    sharpe = row.get("active_sharpe")
    if total is not None and total > 0 and sharpe is not None and sharpe >= 0.8:
        return "diagnostic_positive_needs_joinquant", "诊断偏正，仍需 JoinQuant 复核"
    if total is not None and total > 0:
        return "diagnostic_watch", "诊断可观察"
    return "diagnostic_not_passed", "诊断未通过"


def add_index_growth_scores(factors: pd.DataFrame) -> pd.DataFrame:
    out = factors.copy()
    out["index_growth_trend_score"] = (
        0.30 * out["z_f_medium_momentum"]
        + 0.25 * out["z_f_long_momentum"]
        + 0.25 * out["z_f_volume_confirmation"]
        + 0.12 * out["z_f_close_strength"]
        + 0.08 * out["z_f_anti_crowding"]
    )
    out["index_growth_stable_score"] = (
        0.24 * out["z_f_low_volatility"]
        + 0.20 * out["z_f_volume_stability"]
        + 0.20 * out["z_f_drawdown_control"]
        + 0.16 * out["z_f_gap_risk_control"]
        + 0.12 * out["z_f_anti_crowding"]
        + 0.08 * out["z_f_short_reversal"]
    )
    out["index_growth_composite_score"] = (
        0.58 * out["index_growth_trend_score"]
        + 0.42 * out["index_growth_stable_score"]
    )
    return out


def run_dataset(path: Path) -> tuple[dict, list[dict]]:
    dataset = path.name.split("_daily_", 1)[0]
    config = DATASET_CONFIG.get(dataset, DATASET_CONFIG["csi500"])
    raw = read_price_data(path)
    features = add_time_series_features(raw, HORIZONS)
    factors = add_index_growth_scores(add_cross_sectional_factors(features))

    rows = []
    for spec in STRATEGY_SPECS:
        for top_n in config["top_n"]:
            for core_weight in config["core_weight"]:
                trades, metrics = portfolio_backtest(
                    factors,
                    score_col=spec["score_col"],
                    horizon=PRIMARY_HORIZON,
                    top_n=top_n,
                    core_weight=core_weight,
                    cost=COST_RATE,
                    min_stocks=config["min_stocks"],
                    buffer_multiple=1.5,
                    risk_penalty=0.0,
                )
                suffix = f"{spec['id']}_top{top_n}_core{int(core_weight * 100)}"
                trade_path = RESULTS_DIR / f"{dataset}_diagnostic_{suffix}_trades.csv"
                trades.to_csv(trade_path, index=False, encoding="utf-8-sig")
                row = {
                    "source": SOURCE,
                    "result_type": "local_strategy_backtest",
                    "strategy_id": f"index_growth_{dataset}_{spec['id']}_v1",
                    "strategy_name": f"{config['display']}{spec['name']}",
                    "strategy_family": "index_growth_diagnostic",
                    "strategy_role": spec["role"],
                    "dataset": dataset,
                    "score_col": spec["score_col"],
                    "score_name": spec["name"].replace("策略 v1", ""),
                    "factor_inputs": {
                        "trend_growth": ["中期趋势", "长期趋势", "量价确认", "收盘强度", "反拥挤"],
                        "stable_growth": ["低波动", "量能稳定", "回撤控制", "跳空风险控制", "反拥挤", "短期反转"],
                    },
                    "description": spec["description"],
                    "horizon": "20日调仓",
                    "rebalance_days": PRIMARY_HORIZON,
                    "top_n": top_n,
                    "core_weight": core_weight,
                    "buffer_multiple": 1.5,
                    "risk_penalty": 0.0,
                    "cost_rate": COST_RATE,
                    "sample_dates": metrics["strategy"].get("period_count"),
                    "trade_count": metrics["strategy"].get("period_count"),
                    "strategy_return": metrics["strategy"].get("total_return"),
                    "strategy_annual_return": metrics["strategy"].get("annual_return"),
                    "annual_return": metrics["strategy"].get("annual_return"),
                    "benchmark_return": metrics["benchmark"].get("total_return"),
                    "benchmark_annual_return": metrics["benchmark"].get("annual_return"),
                    "excess_return": metrics["active"].get("total_return"),
                    "active_annual_return": metrics["active"].get("annual_return"),
                    "active_sharpe": metrics["active"].get("sharpe"),
                    "max_drawdown": metrics["strategy"].get("max_drawdown"),
                    "active_max_drawdown": metrics["active"].get("max_drawdown"),
                    "sharpe": metrics["strategy"].get("sharpe"),
                    "daily_win_rate": metrics["active"].get("win_rate"),
                    "period_mean_return": metrics["strategy"].get("mean_period_return"),
                    "active_period_mean_return": metrics["active"].get("mean_period_return"),
                    "avg_turnover": metrics.get("avg_turnover"),
                    "avg_eligible_count": metrics.get("avg_eligible_count"),
                    "worst_period_active": metrics.get("worst_period_active"),
                    "date_range": f"{raw['date'].min().strftime('%Y-%m-%d')} 至 {raw['date'].max().strftime('%Y-%m-%d')}",
                    "trade_path": str(trade_path.relative_to(ROOT)),
                    "yearly": yearly_table(trades),
                    "data_policy": "本地 AkShare 真实 OHLCV 指数增长诊断策略回测；静态指数成分、等权基准、未处理真实指数权重/行业市值/停牌涨跌停/冲击成本；仅用于诊断，不作为正式准入。",
                    "note": "由中文指数增长因子合成策略并回测；仍需 JoinQuant 交易约束复核后才能进入准入判断。",
                }
                decision, decision_name = diagnostic_verdict(row)
                row["decision"] = decision
                row["decision_name"] = decision_name
                rows.append(row)

    dataset_summary = {
        "dataset": dataset,
        "display": config["display"],
        "rows": int(len(raw)),
        "stocks": int(raw["code"].nunique()),
        "dates": int(raw["date"].nunique()),
        "start_date": raw["date"].min().strftime("%Y-%m-%d"),
        "end_date": raw["date"].max().strftime("%Y-%m-%d"),
    }
    return dataset_summary, rows


def read_trade_frame(row: dict) -> pd.DataFrame:
    path = ROOT / row["trade_path"]
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def best_by_role(rows: list[dict], dataset: str, role_id: str) -> dict | None:
    scoped = [row for row in rows if row["dataset"] == dataset and row["strategy_id"].endswith(f"_{role_id}_v1")]
    if not scoped:
        return None
    return sorted(scoped, key=lambda row: (row.get("excess_return") or -999, row.get("active_sharpe") or -999), reverse=True)[0]


def selected_overlap(left_codes: str, right_codes: str) -> float | None:
    left = set(str(left_codes or "").split(",")) - {""}
    right = set(str(right_codes or "").split(",")) - {""}
    if not left or not right:
        return None
    return len(left & right) / len(left | right)


def assess_combination(rows: list[dict]) -> list[dict]:
    assessments = []
    for dataset in sorted({row["dataset"] for row in rows}):
        trend = best_by_role(rows, dataset, "trend_growth")
        stable = best_by_role(rows, dataset, "stable_growth")
        combined = best_by_role(rows, dataset, "combined_growth")
        if not trend or not stable or not combined:
            continue
        trend_trades = read_trade_frame(trend)
        stable_trades = read_trade_frame(stable)
        merged = trend_trades[["date", "active_return", "selected_codes"]].merge(
            stable_trades[["date", "active_return", "selected_codes"]],
            on="date",
            suffixes=("_trend", "_stable"),
        )
        active_corr = clean_float(merged["active_return_trend"].corr(merged["active_return_stable"])) if len(merged) >= 10 else None
        overlaps = [
            selected_overlap(row["selected_codes_trend"], row["selected_codes_stable"])
            for _, row in merged.iterrows()
        ]
        overlaps = [value for value in overlaps if value is not None]
        avg_overlap = clean_float(pd.Series(overlaps, dtype=float).mean()) if overlaps else None
        can_combine = (
            (combined.get("excess_return") or -1) > 0
            and (combined.get("active_sharpe") or -1) >= 0.8
            and (active_corr is None or active_corr < 0.85)
        )
        assessments.append({
            "dataset": dataset,
            "trend_strategy": trend["strategy_name"],
            "stable_strategy": stable["strategy_name"],
            "combined_strategy": combined["strategy_name"],
            "trend_excess_return": trend.get("excess_return"),
            "stable_excess_return": stable.get("excess_return"),
            "combined_excess_return": combined.get("excess_return"),
            "combined_active_sharpe": combined.get("active_sharpe"),
            "active_return_correlation": active_corr,
            "avg_selected_overlap": avg_overlap,
            "can_combine": can_combine,
            "decision": "can_combine_after_joinquant_review" if can_combine else "do_not_combine_yet",
            "decision_name": "可以综合，但需 JoinQuant 复核" if can_combine else "暂不建议综合",
        })
    return assessments


def import_to_platform(rows: list[dict]) -> dict:
    existing = read_json(PLATFORM_IMPORTED)
    kept = [row for row in existing if row.get("source") not in {SOURCE, OLD_SOURCE}]
    stamped = []
    imported_at = datetime.now().isoformat(timespec="milliseconds") + "Z"
    for row in rows:
        item = dict(row)
        item["importedAt"] = imported_at
        stamped.append(item)
    write_json(PLATFORM_IMPORTED, stamped + kept)
    return {
        "removed_old_diagnostic_rows": len(existing) - len(kept),
        "imported_diagnostic_rows": len(stamped),
        "total_rows": len(stamped) + len(kept),
    }


def main() -> int:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    paths = sorted(PROCESSED_DIR.glob("*_daily_*_qfq.csv"))
    if not paths:
        raise SystemExit("没有找到指数增强日线数据。")

    datasets = []
    rows = []
    for path in paths:
        dataset_summary, dataset_rows = run_dataset(path)
        datasets.append(dataset_summary)
        rows.extend(dataset_rows)

    top = sorted(rows, key=lambda row: (active_total(row), active_sharpe(row)), reverse=True)[:20]
    combination_assessment = assess_combination(rows)
    result = {
        "source": SOURCE,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "本地 AkShare 真实 OHLCV 指数增长诊断策略回测；静态指数成分、等权基准，不作为正式准入。",
        "strategy_name_policy": "中文指数名 + 指数增长趋势/稳健/综合策略 v1",
        "factor_framework": {
            "trend_growth": ["中期趋势", "长期趋势", "量价确认", "收盘强度", "反拥挤"],
            "stable_growth": ["低波动", "量能稳定", "回撤控制", "跳空风险控制", "反拥挤", "短期反转"],
        },
        "datasets": datasets,
        "strategies": rows,
        "top_strategies": top,
        "combination_assessment": combination_assessment,
    }
    write_json(OUT_JSON, result)
    import_summary = import_to_platform(rows)
    print(json.dumps({
        "result": str(OUT_JSON.relative_to(ROOT)),
        "strategy_count": len(rows),
        "top_strategy": top[:1],
        "import": import_summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
