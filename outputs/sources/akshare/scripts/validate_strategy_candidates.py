#!/usr/bin/env python3
"""
Validate AkShare local strategy candidates with segment and out-of-sample checks.

The script reuses the real AkShare OHLCV factor pipeline and does not create
synthetic prices, returns, market caps, industries, or liquidity fields.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_ohlcv_factor_backtest import (
    ROOT,
    add_factor_columns,
    annualized_return,
    max_drawdown,
    prepare_frame,
    sharpe_ratio,
)


AK_DIR = ROOT / "outputs" / "sources" / "akshare"
RESULTS_DIR = AK_DIR / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

CANDIDATES = [
    {
        "id": "ak_high_vol_mean_reversion_mid_liquidity",
        "name": "AkShare高波动均值回归-中流动性观察策略",
        "strategy_id": "ak_mean_reversion_quality_combo",
        "score_col": "ak_mean_reversion_quality_combo",
        "market_vol_regime": "high_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "高波动回归路线",
    },
    {
        "id": "ak_low_vol_defensive_mid_liquidity",
        "name": "AkShare低波动防守确认-中流动性观察策略",
        "strategy_id": "ak_defensive_quality_combo",
        "score_col": "ak_defensive_quality_combo",
        "market_vol_regime": "low_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
    {
        "id": "ak_low_vol_volume_trend_mid_liquidity",
        "name": "AkShare低波动量价趋势-中流动性观察策略",
        "strategy_id": "ak_volume_trend_quality_combo",
        "score_col": "ak_volume_trend_quality_combo",
        "market_vol_regime": "low_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
    {
        "id": "ak_high_vol_anti_crowding_mid_liquidity",
        "name": "AkShare高波动反拥挤-中流动性观察策略",
        "strategy_id": "ak_anti_crowding_reversal_combo",
        "score_col": "ak_anti_crowding_reversal_combo",
        "market_vol_regime": "high_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "高波动回归路线",
    },
    {
        "id": "ak_low_vol_contraction_breakout_mid_liquidity",
        "name": "AkShare低波动收缩突破-中流动性观察策略",
        "strategy_id": "ak_contraction_breakout_combo",
        "score_col": "ak_contraction_breakout_combo",
        "market_vol_regime": "low_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
    {
        "id": "ak_low_vol_trend_pullback_mid_liquidity",
        "name": "AkShare低波动趋势回踩-中流动性观察策略",
        "strategy_id": "ak_trend_pullback_reversal_combo",
        "score_col": "ak_trend_pullback_reversal_combo",
        "market_vol_regime": "low_volatility",
        "liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
]


def metric_summary(rows: pd.DataFrame) -> dict:
    if rows.empty:
        return {
            "sample_trades": 0,
            "strategy_return": None,
            "strategy_annual_return": None,
            "max_drawdown": None,
            "sharpe": None,
            "positive_trade_ratio": None,
        }

    returns = rows["net_return_5d"].astype(float)
    equity = (1 + returns).cumprod()
    total_return = float(equity.iloc[-1] - 1)
    trading_days = len(rows) * 5
    return {
        "sample_trades": int(len(rows)),
        "strategy_return": total_return,
        "strategy_annual_return": annualized_return(total_return, trading_days),
        "max_drawdown": max_drawdown(equity),
        "sharpe": sharpe_ratio(returns, periods_per_year=252 / 5),
        "positive_trade_ratio": float((returns > 0).mean()),
        "first_trade_date": str(rows["date"].iloc[0].date()),
        "last_trade_date": str(rows["date"].iloc[-1].date()),
    }


def simulate_candidate(factors: pd.DataFrame, candidate: dict, top_n: int, cost: float) -> pd.DataFrame:
    cols = [
        "date",
        "code",
        "name",
        candidate["score_col"],
        "future_return_5",
        "market_vol_regime",
        "liquidity_bucket",
        "market_vol_20",
        "liquidity_metric20",
    ]
    work = factors[cols].dropna(subset=["date", "code", candidate["score_col"], "future_return_5"]).copy()
    work = work[work["market_vol_regime"].astype(str) == candidate["market_vol_regime"]]
    work = work[work["liquidity_bucket"].astype(str) == candidate["liquidity_bucket"]]

    rows = []
    for date in sorted(work["date"].unique())[::5]:
        day = work[work["date"] == date].sort_values(candidate["score_col"], ascending=False).head(top_n)
        if day.empty:
            continue
        gross = float(day["future_return_5"].mean())
        rows.append({
            "date": pd.Timestamp(date),
            "gross_return_5d": gross,
            "net_return_5d": gross - cost,
            "stock_count": int(len(day)),
            "codes": ",".join(day["code"].tolist()),
            "market_vol_20": None if day["market_vol_20"].dropna().empty else float(day["market_vol_20"].mean()),
            "liquidity_metric20": None if day["liquidity_metric20"].dropna().empty else float(day["liquidity_metric20"].mean()),
        })
    return pd.DataFrame(rows).sort_values("date")


def split_segments(rows: pd.DataFrame) -> dict:
    if rows.empty:
        return {}
    years = {
        f"year_{year}": metric_summary(group)
        for year, group in rows.groupby(rows["date"].dt.year)
    }
    midpoint = len(rows) // 2
    halves = {
        "first_half": metric_summary(rows.iloc[:midpoint]),
        "second_half": metric_summary(rows.iloc[midpoint:]),
    }
    cutoff = pd.Timestamp("2025-07-01")
    oos = {
        "before_2025_07_01": metric_summary(rows[rows["date"] < cutoff]),
        "from_2025_07_01": metric_summary(rows[rows["date"] >= cutoff]),
    }
    return {**years, **halves, **oos}


def candidate_verdict(overall: dict, segments: dict) -> dict:
    valid_segments = [
        value for key, value in segments.items()
        if key.startswith("year_") and value.get("sample_trades", 0) >= 5
    ]
    checks = {
        "overall_min_trades_30": overall.get("sample_trades", 0) >= 30,
        "overall_positive_return": (overall.get("strategy_return") or 0) > 0,
        "overall_sharpe_above_1": (overall.get("sharpe") or -math.inf) >= 1,
        "overall_drawdown_better_than_minus_15pct": (overall.get("max_drawdown") or -math.inf) >= -0.15,
        "second_half_positive": (segments.get("second_half", {}).get("strategy_return") or 0) > 0,
        "oos_positive": (segments.get("from_2025_07_01", {}).get("strategy_return") or 0) > 0,
        "year_segments_all_positive": bool(valid_segments) and all((item.get("strategy_return") or 0) > 0 for item in valid_segments),
    }
    passed = sum(1 for value in checks.values() if value)
    if all(checks.values()):
        status = "joinquant_review_candidate"
    elif passed >= 5:
        status = "strong_observation"
    elif passed >= 4:
        status = "observation"
    else:
        status = "not_ready"
    return {
        "status": status,
        "passed_checks": passed,
        "total_checks": len(checks),
        "checks": checks,
    }


def pct(value: float | None) -> str:
    if value is None or pd.isna(value):
        return "NA"
    return f"{value * 100:.2f}%"


def number(value: float | None) -> str:
    if value is None or pd.isna(value):
        return "NA"
    return f"{value:.2f}"


def write_markdown(result: dict, path: Path) -> None:
    lines = [
        "# AkShare 策略候选稳定性验证",
        "",
        f"生成时间：{result['generated_at']}",
        "",
        "## 数据口径",
        "",
        f"- 输入：`{result['input']}`",
        f"- 股票数：{result['unique_stocks']} 只",
        f"- 行数：{result['rows']} 行",
        f"- 交易日：{result['unique_dates']} 日",
        f"- 组合：Top{result['top_n']}，5日调仓，单次成本 {pct(result['cost_per_rebalance'])}",
        "- 数据原则：只使用真实 AkShare OHLCV；腾讯源缺成交额/换手率，不做伪造填充。",
        "",
        "## 候选结论",
        "",
    ]

    for candidate in result["candidates"]:
        overall = candidate["overall"]
        verdict = candidate["verdict"]
        lines.extend([
            f"### {candidate['name']}",
            "",
            f"- 路线：{candidate['route']}",
            f"- 状态：{verdict['status']}（{verdict['passed_checks']}/{verdict['total_checks']}）",
            f"- 总收益：{pct(overall.get('strategy_return'))}",
            f"- 年化：{pct(overall.get('strategy_annual_return'))}",
            f"- 最大回撤：{pct(overall.get('max_drawdown'))}",
            f"- Sharpe：{number(overall.get('sharpe'))}",
            f"- 胜率：{pct(overall.get('positive_trade_ratio'))}",
            f"- 交易次数：{overall.get('sample_trades')}",
            "",
            "| 分段 | 交易数 | 总收益 | 最大回撤 | Sharpe | 胜率 |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ])
        for key, segment in candidate["segments"].items():
            lines.append(
                f"| {key} | {segment.get('sample_trades', 0)} | "
                f"{pct(segment.get('strategy_return'))} | "
                f"{pct(segment.get('max_drawdown'))} | "
                f"{number(segment.get('sharpe'))} | "
                f"{pct(segment.get('positive_trade_ratio'))} |"
            )
        lines.append("")

    lines.extend([
        "## 使用边界",
        "",
        "- 这是本地 AkShare OHLCV 验证，不等同于 JoinQuant 交易回测。",
        "- 通过 `joinquant_review_candidate` 只代表可进入下一轮 JoinQuant 复核，不代表已经可实盘。",
        "- 下一步必须补真实成交额/换手率/行业/市值约束，并做 JoinQuant 复测。",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate AkShare strategy candidates.")
    parser.add_argument("--input", default="outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv")
    parser.add_argument("--top-n", type=int, default=20)
    parser.add_argument("--cost", type=float, default=0.001)
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = ROOT / input_path

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    raw = prepare_frame(input_path)
    factors = add_factor_columns(raw)

    candidates = []
    for candidate in CANDIDATES:
        rows = simulate_candidate(factors, candidate, args.top_n, args.cost)
        overall = metric_summary(rows)
        segments = split_segments(rows)
        verdict = candidate_verdict(overall, segments)
        candidates.append({
            **candidate,
            "overall": overall,
            "segments": segments,
            "verdict": verdict,
            "trade_records": [
                {
                    **record,
                    "date": record["date"].strftime("%Y-%m-%d"),
                }
                for record in rows.to_dict(orient="records")
            ],
        })

    result = {
        "source": "akshare_strategy_candidate_validation",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(input_path.relative_to(ROOT)) if input_path.is_relative_to(ROOT) else str(input_path),
        "rows": int(len(raw)),
        "unique_stocks": int(raw["code"].nunique()),
        "unique_dates": int(raw["date"].nunique()),
        "source_counts": raw["source"].value_counts(dropna=False).to_dict() if "source" in raw.columns else {},
        "top_n": int(args.top_n),
        "cost_per_rebalance": float(args.cost),
        "data_policy": "真实 AkShare OHLCV；不填补缺失股票；腾讯源缺成交额/换手率时用真实成交量作本地流动性兜底。",
        "candidate_count": len(candidates),
        "joinquant_review_candidate_count": sum(1 for item in candidates if item["verdict"]["status"] == "joinquant_review_candidate"),
        "candidates": candidates,
    }

    json_path = RESULTS_DIR / "akshare_strategy_candidate_validation.json"
    md_path = DOCS_DIR / "akshare-strategy-candidate-validation-20260709.md"
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(result, md_path)

    console = {key: value for key, value in result.items() if key != "candidates"}
    console["candidate_status"] = [
        {
            "id": item["id"],
            "status": item["verdict"]["status"],
            "passed": item["verdict"]["passed_checks"],
            "trades": item["overall"].get("sample_trades"),
            "return": item["overall"].get("strategy_return"),
            "drawdown": item["overall"].get("max_drawdown"),
            "sharpe": item["overall"].get("sharpe"),
        }
        for item in candidates
    ]
    print(json.dumps(console, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
