# M-quant JoinQuant strategy backtest: JQ质量利润流动性策略 v1
# Policy: only uses JoinQuant research-environment data; no fabricated metrics.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Run the cell.
# 3. Copy the printed JSON back to M-quant 回测中心 -> 结果回填.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "jq_quality_profit_liquidity_v1"
STRATEGY_NAME = "JQ质量利润流动性策略 v1"
INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
TOP_N = 30

FACTOR_WEIGHTS = {
    "profit_growth_jq": 0.40,
    "quality_growth_jq": 0.35,
    "liquidity_quality_jq": 0.25,
}


def normalize_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns:
        df = df.reset_index()
        if "index" in df.columns and "time" not in df.columns:
            df = df.rename(columns={"index": "time"})
    if "code" not in df.columns and "security" in df.columns:
        df = df.rename(columns={"security": "code"})
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()
    return df


def rank01(series, higher_is_better=True):
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def bounded_peak_score(series, target, width):
    s = pd.to_numeric(series, errors="coerce")
    return (1 - (s - target).abs() / width).clip(0, 1).fillna(0.5)


def build_price_base():
    all_days = pd.to_datetime(get_trade_days(start_date=FACTOR_START, end_date=END_LIMIT))
    if len(all_days) <= max(HORIZONS) + 1:
        raise ValueError("交易日不足，无法形成未来收益标签。")

    latest_trade_day = all_days[-1]
    usable_end = all_days[-max(HORIZONS) - 1]
    test_days = all_days[all_days <= usable_end][::FACTOR_DAY_STEP]
    universe_by_date = {}
    securities = set()

    for day in test_days:
        stocks = get_index_stocks(INDEX_CODE, date=day.strftime("%Y-%m-%d"))
        universe_by_date[pd.Timestamp(day).normalize()] = set(stocks)
        securities.update(stocks)

    securities = sorted(securities)
    price = get_price(
        securities,
        start_date=PRICE_START,
        end_date=latest_trade_day.strftime("%Y-%m-%d"),
        frequency="daily",
        fields=["open", "high", "low", "close", "volume", "money"],
        panel=False,
        fq="pre",
    )
    price = normalize_price_frame(price)
    if price.empty:
        raise ValueError("get_price 返回空数据。")

    price = price.sort_values(["code", "date"]).copy()
    group = price.groupby("code", group_keys=False)
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_ratio"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)
    price["money_ma20"] = group["money"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["money_ma60"] = group["money"].rolling(60, min_periods=20).mean().reset_index(level=0, drop=True)
    price["money_std60"] = group["money"].rolling(60, min_periods=20).std().reset_index(level=0, drop=True)
    price["money_stability"] = 1 / (1 + price["money_std60"] / price["money_ma60"].replace(0, np.nan))

    for horizon in HORIZONS:
        price["future_return_%d" % horizon] = group["close"].shift(-horizon) / price["close"] - 1

    return price, universe_by_date, test_days, securities


def fetch_fundamentals_for_days(universe_by_date):
    rows = []
    for day, universe in universe_by_date.items():
        codes = sorted(universe)
        fundamentals = get_fundamentals(
            query(
                valuation.code,
                valuation.market_cap,
                valuation.turnover_ratio,
                indicator.roe,
                indicator.roa,
                indicator.net_profit_margin,
                indicator.gross_profit_margin,
                indicator.inc_total_revenue_year_on_year,
                indicator.inc_net_profit_year_on_year,
                indicator.eps,
                indicator.ocf_to_revenue,
            ).filter(valuation.code.in_(codes)),
            date=pd.Timestamp(day).strftime("%Y-%m-%d"),
        )
        if fundamentals is None or fundamentals.empty:
            continue
        f = fundamentals.copy()
        f["date"] = pd.Timestamp(day).normalize()
        rows.append(f)

    if not rows:
        raise ValueError("get_fundamentals 未返回可用 valuation/indicator 数据。")
    return pd.concat(rows, ignore_index=True)


def build_factor_table():
    price, universe_by_date, test_days, securities = build_price_base()
    fundamentals = fetch_fundamentals_for_days(universe_by_date)
    rows = []

    for day, universe in universe_by_date.items():
        p = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        f = fundamentals[fundamentals["date"] == day].copy()
        part = p.merge(f, on=["date", "code"], how="left")
        part = part.replace([np.inf, -np.inf], np.nan)
        if len(part) < MIN_CROSS_SECTION:
            continue

        quality_growth = (
            0.22 * rank01(part["roe"], True)
            + 0.14 * rank01(part["roa"], True)
            + 0.16 * rank01(part["gross_profit_margin"], True)
            + 0.14 * rank01(part["net_profit_margin"], True)
            + 0.18 * rank01(part["inc_total_revenue_year_on_year"], True)
            + 0.16 * rank01(part["inc_net_profit_year_on_year"], True)
        ).clip(0, 1)

        profit_growth = (
            0.34 * rank01(part["inc_net_profit_year_on_year"], True)
            + 0.24 * rank01(part["inc_total_revenue_year_on_year"], True)
            + 0.18 * rank01(part["eps"], True)
            + 0.16 * rank01(part["roe"], True)
            + 0.08 * rank01(part["ocf_to_revenue"], True)
        ).clip(0, 1)

        liquidity_quality = (
            0.30 * rank01(np.log1p(part["money_ma20"]), True)
            + 0.24 * rank01(part["money_stability"], True)
            + 0.18 * bounded_peak_score(part["turnover_ratio"], 1.5, 3.0)
            + 0.16 * bounded_peak_score(part["volume_ratio"], 1.2, 1.8)
            + 0.12 * rank01(part["market_cap"], True)
        ).clip(0, 1)

        out = part[["date", "code", "close"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["profit_growth_jq"] = profit_growth
        out["quality_growth_jq"] = quality_growth
        out["liquidity_quality_jq"] = liquidity_quality
        rows.append(out)

    if not rows:
        raise ValueError("未形成可回测策略样本。")

    factor_table = pd.concat(rows, ignore_index=True)
    return factor_table, {
        "index_code": INDEX_CODE,
        "price_start": PRICE_START,
        "factor_start": FACTOR_START,
        "end_limit": END_LIMIT,
        "horizons": HORIZONS,
        "factor_day_step": FACTOR_DAY_STEP,
        "top_n": TOP_N,
        "factor_weights": FACTOR_WEIGHTS,
        "test_dates": int(len(test_days)),
        "unique_securities": int(len(securities)),
    }


def score_strategy(frame):
    scored = frame.dropna(subset=list(FACTOR_WEIGHTS.keys())).copy()
    if scored.empty:
        return scored

    score = pd.Series(0.0, index=scored.index)
    for factor, weight in FACTOR_WEIGHTS.items():
        score += abs(weight) * rank01(scored[factor], higher_is_better=(weight >= 0))
    scored["strategy_score"] = score
    return scored.sort_values("strategy_score", ascending=False)


def select_candidates(factor_table):
    selected = []
    diagnostics = []

    for day, frame in factor_table.groupby("date"):
        scored = score_strategy(frame)
        picked = scored.head(TOP_N).copy()
        diagnostics.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "universe": int(frame.shape[0]),
            "scorable": int(scored.shape[0]),
            "selected": int(picked.shape[0]),
        })
        if not picked.empty:
            selected.append(picked)

    if not selected:
        return pd.DataFrame(), diagnostics
    return pd.concat(selected, ignore_index=True), diagnostics


def summarize_strategy(candidates):
    summaries = []
    if candidates.empty:
        return summaries

    for horizon in HORIZONS:
        col = "future_return_%d" % horizon
        values = candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
        daily = candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        summaries.append({
            "result_type": "strategy_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "horizon": horizon,
            "sample_dates": int(daily.shape[0]),
            "sample_trades": int(values.shape[0]),
            "mean_return": None if values.empty else float(values.mean()),
            "median_return": None if values.empty else float(values.median()),
            "positive_ratio": None if values.empty else float((values > 0).mean()),
            "daily_mean_return": None if daily.empty else float(daily.mean()),
            "daily_positive_ratio": None if daily.empty else float((daily > 0).mean()),
            "best_daily_return": None if daily.empty else float(daily.max()),
            "worst_daily_return": None if daily.empty else float(daily.min()),
            "avg_candidates_per_date": None if daily.empty else float(values.shape[0] / daily.shape[0]),
            "source": "joinquant_jq_quality_profit_liquidity_strategy_v1",
            "note": "真实 JoinQuant valuation/indicator/OHLCV 策略级事件回测；不含虚构绩效。",
        })
    return summaries


def run():
    factor_table, config = build_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    summary = summarize_strategy(candidates)

    preview_cols = [
        "date",
        "code",
        "strategy_score",
        "profit_growth_jq",
        "quality_growth_jq",
        "liquidity_quality_jq",
    ]
    preview = candidates[preview_cols].head(50).copy() if not candidates.empty else pd.DataFrame(columns=preview_cols)
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")

    output = {
        "result_type": "strategy_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_jq_quality_profit_liquidity_strategy_v1",
        "data_policy": "真实 JoinQuant valuation、indicator、OHLCV 计算；未生成任何虚构收益。",
        "config": config,
        "sample": {
            "factor_rows": int(factor_table.shape[0]),
            "candidate_rows": int(candidates.shape[0]) if candidates is not None else 0,
            "test_dates": int(factor_table["date"].nunique()),
            "selected_dates": int(candidates["date"].nunique()) if candidates is not None and not candidates.empty else 0,
        },
        "summary": summary,
        "diagnostics_tail": diagnostics[-20:],
        "candidate_preview": preview.to_dict(orient="records"),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run()
