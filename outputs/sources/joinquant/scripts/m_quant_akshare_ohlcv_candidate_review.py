# M-quant JoinQuant review: AkShare OHLCV candidate strategies
# Policy: only uses JoinQuant research-environment OHLCV, CSI300 index data,
# valuation.market_cap and valuation.turnover_ratio. No fabricated metrics.
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


INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-09"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 180
TOP_N = 20
TRADING_REBALANCE_DAYS = 5
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002

CANDIDATES = [
    {
        "strategy_id": "ak_high_vol_mean_reversion_mid_liquidity",
        "strategy_name": "AkShare高波动均值回归-中流动性复核策略",
        "score_col": "ak_mean_reversion_quality_combo",
        "target_market_regime": "high_volatility",
        "target_liquidity_bucket": "mid_liquidity",
        "route": "高波动回归路线",
    },
    {
        "strategy_id": "ak_low_vol_defensive_mid_liquidity",
        "strategy_name": "AkShare低波动防守确认-中流动性复核策略",
        "score_col": "ak_defensive_quality_combo",
        "target_market_regime": "low_volatility",
        "target_liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
    {
        "strategy_id": "ak_low_vol_volume_trend_mid_liquidity",
        "strategy_name": "AkShare低波动量价趋势-中流动性复核策略",
        "score_col": "ak_volume_trend_quality_combo",
        "target_market_regime": "low_volatility",
        "target_liquidity_bucket": "mid_liquidity",
        "route": "低波动确认路线",
    },
    {
        "strategy_id": "ak_high_vol_anti_crowding_mid_liquidity",
        "strategy_name": "AkShare高波动反拥挤-中流动性复核策略",
        "score_col": "ak_anti_crowding_reversal_combo",
        "target_market_regime": "high_volatility",
        "target_liquidity_bucket": "mid_liquidity",
        "route": "高波动回归路线",
    },
]


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


def safe_div(left, right):
    return left / right.replace(0, np.nan)


def clipped_log_ratio(series, lower, upper):
    return np.log(pd.to_numeric(series, errors="coerce").clip(lower=lower, upper=upper))


def build_market_regime_table():
    index_price = get_price(
        INDEX_CODE,
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = normalize_price_frame(index_price)
    if index_price.empty:
        raise ValueError("沪深300指数行情为空，无法做市场波动分层。")
    index_price = index_price.sort_values("date").copy()
    index_price["index_return"] = index_price["close"].pct_change()
    index_price["market_vol_20d"] = index_price["index_return"].rolling(20, min_periods=20).std() * math.sqrt(252)
    index_price["vol_p30"] = index_price["market_vol_20d"].rolling(252, min_periods=60).quantile(0.30).shift(1)
    index_price["vol_p70"] = index_price["market_vol_20d"].rolling(252, min_periods=60).quantile(0.70).shift(1)
    valid = index_price.dropna(subset=["market_vol_20d", "vol_p30", "vol_p70"]).copy()
    valid["market_regime"] = "medium_volatility"
    valid.loc[valid["market_vol_20d"] >= valid["vol_p70"], "market_regime"] = "high_volatility"
    valid.loc[valid["market_vol_20d"] <= valid["vol_p30"], "market_regime"] = "low_volatility"
    valid["market_regime_name"] = valid["market_regime"].map({
        "high_volatility": "高波动",
        "medium_volatility": "中波动",
        "low_volatility": "低波动",
    })
    return valid[["date", "market_vol_20d", "market_regime", "market_regime_name"]]


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
    price["ret_1"] = group["close"].pct_change()
    price["ret_5"] = group["close"].pct_change(5)
    price["ret_20"] = group["close"].pct_change(20)
    price["ma20"] = group["close"].rolling(20, min_periods=20).mean().reset_index(level=0, drop=True)
    price["ma60"] = group["close"].rolling(60, min_periods=60).mean().reset_index(level=0, drop=True)
    price["vol20"] = price.groupby("code")["ret_1"].rolling(20, min_periods=20).std().reset_index(level=0, drop=True)
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=20).mean().reset_index(level=0, drop=True)
    price["money_ma20"] = group["money"].rolling(20, min_periods=20).mean().reset_index(level=0, drop=True)
    price["rolling_high60"] = group["close"].rolling(60, min_periods=60).max().reset_index(level=0, drop=True)
    price["drawdown60"] = safe_div(price["close"], price["rolling_high60"]) - 1
    price["volume_ratio20"] = safe_div(price["volume"], price["volume_ma20"])
    price["money_ratio20"] = safe_div(price["money"], price["money_ma20"])
    price["activity_ratio20"] = price["money_ratio20"].where(price["money_ratio20"].notna(), price["volume_ratio20"])
    price["ma20_ma60_gap"] = safe_div(price["ma20"], price["ma60"]) - 1
    price["close_ma20_gap"] = safe_div(price["close"], price["ma20"]) - 1
    for horizon in HORIZONS:
        price["future_return_%d" % horizon] = group["close"].shift(-horizon) / price["close"] - 1

    return price, universe_by_date, test_days, securities


def fetch_fundamentals_for_days(universe_by_date):
    rows = []
    for day, universe in universe_by_date.items():
        fundamentals = get_fundamentals(
            query(
                valuation.code,
                valuation.market_cap,
                valuation.turnover_ratio,
            ).filter(valuation.code.in_(sorted(universe))),
            date=pd.Timestamp(day).strftime("%Y-%m-%d"),
        )
        if fundamentals is None or fundamentals.empty:
            continue
        f = fundamentals.copy()
        f["date"] = pd.Timestamp(day).normalize()
        rows.append(f)
    if not rows:
        raise ValueError("get_fundamentals 未返回可用 valuation 数据。")
    return pd.concat(rows, ignore_index=True)


def build_factor_table():
    price, universe_by_date, test_days, securities = build_price_base()
    fundamentals = fetch_fundamentals_for_days(universe_by_date)
    regimes = build_market_regime_table()
    rows = []

    for day, universe in universe_by_date.items():
        part = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        vals = fundamentals[fundamentals["date"] == day].copy()
        part = part.merge(vals, on=["date", "code"], how="left")
        part = part.merge(regimes, on="date", how="left")
        part = part.replace([np.inf, -np.inf], np.nan)
        if len(part) < MIN_CROSS_SECTION:
            continue
        if part["market_regime"].dropna().empty:
            continue

        day_range = (part["high"] - part["low"]).replace(0, np.nan)
        part["close_position"] = ((part["close"] - part["low"]) / day_range).clip(0, 1).fillna(0.5)
        part["upper_shadow_ratio"] = ((part["high"] - np.maximum(part["open"], part["close"])) / day_range).clip(0, 1).fillna(0)
        part["body_return"] = part["close"] / part["open"].replace(0, np.nan) - 1

        raw_volume_price = (
            0.35 * part["ret_20"]
            + 0.25 * clipped_log_ratio(part["volume_ratio20"], 0.2, 5)
            + 0.20 * clipped_log_ratio(part["activity_ratio20"], 0.2, 5)
            + 0.20 * part["close_position"]
        )
        raw_trend_quality = (
            0.45 * part["ret_20"]
            + 0.35 * part["ma20_ma60_gap"]
            + 0.20 * part["close_ma20_gap"].clip(lower=-0.20, upper=0.20)
        )
        raw_low_volatility_quality = -0.65 * part["vol20"] + 0.35 * part["drawdown60"]
        raw_kline_confirmation = (
            0.45 * part["body_return"].clip(lower=-0.08, upper=0.08)
            + 0.35 * part["close_position"]
            - 0.20 * part["upper_shadow_ratio"].fillna(0)
        )
        raw_crowding_risk = (
            0.30 * clipped_log_ratio(part["volume_ratio20"], 0.2, 8)
            + 0.25 * part["turnover_ratio"].fillna(0) / 100
            + 0.25 * part["ret_5"].clip(lower=-0.2, upper=0.5)
            + 0.20 * part["close_ma20_gap"].clip(lower=-0.2, upper=0.5)
        )

        part["ak_volume_price_confirmation"] = rank01(raw_volume_price, True)
        part["ak_trend_quality"] = rank01(raw_trend_quality, True)
        part["ak_low_volatility_quality"] = rank01(raw_low_volatility_quality, True)
        part["ak_kline_confirmation"] = rank01(raw_kline_confirmation, True)
        part["ak_crowding_risk"] = rank01(raw_crowding_risk, True)
        part["ak_volume_trend_quality_combo"] = (
            0.32 * part["ak_volume_price_confirmation"]
            + 0.28 * part["ak_trend_quality"]
            + 0.20 * part["ak_low_volatility_quality"]
            + 0.12 * part["ak_kline_confirmation"]
            - 0.18 * part["ak_crowding_risk"]
        )
        part["ak_defensive_quality_combo"] = (
            0.42 * part["ak_low_volatility_quality"]
            + 0.22 * part["ak_trend_quality"]
            + 0.18 * part["ak_volume_price_confirmation"]
            + 0.08 * part["ak_kline_confirmation"]
            - 0.15 * part["ak_crowding_risk"]
        )
        part["ak_mean_reversion_quality_combo"] = (
            0.34 * (1 - part["ak_trend_quality"])
            + 0.26 * (1 - part["ak_volume_price_confirmation"])
            + 0.18 * part["ak_low_volatility_quality"]
            + 0.12 * (1 - part["ak_kline_confirmation"])
            + 0.10 * (1 - part["ak_crowding_risk"])
        )
        part["ak_anti_crowding_reversal_combo"] = (
            0.38 * (1 - part["ak_crowding_risk"])
            + 0.24 * (1 - part["ak_volume_price_confirmation"])
            + 0.18 * (1 - part["ak_trend_quality"])
            + 0.12 * part["ak_low_volatility_quality"]
            + 0.08 * (1 - part["ak_kline_confirmation"])
        )

        liquidity_rank = part["money_ma20"].rank(pct=True, method="average")
        part["liquidity_bucket"] = "mid_liquidity"
        part.loc[liquidity_rank <= 1.0 / 3.0, "liquidity_bucket"] = "low_liquidity"
        part.loc[liquidity_rank >= 2.0 / 3.0, "liquidity_bucket"] = "high_liquidity"

        cap_rank = part["market_cap"].rank(pct=True, method="average")
        part["market_cap_bucket"] = "mid_cap"
        part.loc[cap_rank <= 0.33, "market_cap_bucket"] = "small_cap"
        part.loc[cap_rank >= 0.67, "market_cap_bucket"] = "large_cap"
        part["market_cap_bucket_name"] = part["market_cap_bucket"].map({
            "large_cap": "大市值",
            "mid_cap": "中市值",
            "small_cap": "小市值",
        })

        keep = [
            "date", "code", "close", "money_ma20", "market_cap", "turnover_ratio",
            "market_vol_20d", "market_regime", "market_regime_name",
            "liquidity_bucket", "market_cap_bucket", "market_cap_bucket_name",
            "future_return_5", "future_return_10", "future_return_20",
            "ak_volume_price_confirmation", "ak_trend_quality", "ak_low_volatility_quality",
            "ak_kline_confirmation", "ak_crowding_risk", "ak_volume_trend_quality_combo",
            "ak_defensive_quality_combo", "ak_mean_reversion_quality_combo",
            "ak_anti_crowding_reversal_combo",
        ]
        rows.append(part[keep].copy())

    if not rows:
        raise ValueError("未形成可复核的 AkShare OHLCV 候选因子表。")
    table = pd.concat(rows, ignore_index=True)
    return table, {
        "index_code": INDEX_CODE,
        "price_start": PRICE_START,
        "factor_start": FACTOR_START,
        "end_limit": END_LIMIT,
        "horizons": HORIZONS,
        "factor_day_step": FACTOR_DAY_STEP,
        "top_n": TOP_N,
        "min_cross_section": MIN_CROSS_SECTION,
        "test_dates": int(len(test_days)),
        "unique_securities": int(len(securities)),
        "market_regime_policy": "沪深30020日年化波动率；使用过去252日滚动30/70分位且shift(1)，避免未来函数。",
        "liquidity_policy": "当日截面20日成交额money_ma20分位；不使用AkShare腾讯源成交量兜底。",
        "market_cap_policy": "JoinQuant valuation.market_cap 当日截面分位。",
    }


def max_drawdown(values):
    if not values:
        return None
    peak = values[0]
    result = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            result = min(result, value / peak - 1)
    return float(result)


def simulate_portfolio(rows, candidate, label, layer_meta):
    if rows is None or rows.empty:
        return None
    score_col = candidate["score_col"]
    required = [score_col, "future_return_5"]
    work = rows.dropna(subset=required).copy()
    if work.empty:
        return None

    nav = 1.0
    previous_weights = {}
    period_returns = []
    gross_returns = []
    turnover_values = []
    curve = []
    sample_trades = 0

    for day, frame in work.sort_values(["date", score_col], ascending=[True, False]).groupby("date"):
        picked = frame.sort_values(score_col, ascending=False).head(TOP_N).copy()
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = dict((code, weight) for code in picked["code"].tolist())
        all_codes = set(previous_weights.keys()) | set(current_weights.keys())
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked["future_return_5"] * weight).sum())
        cost = traded_notional * (TRADING_COST_RATE + TRADING_SLIPPAGE_RATE)
        net_return = gross_return - cost
        nav *= (1 + net_return)
        sample_trades += int(len(picked))
        period_returns.append(net_return)
        gross_returns.append(gross_return)
        turnover_values.append(traded_notional)
        curve.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "net_value": float(nav),
            "period_return": float(net_return),
            "gross_return": float(gross_return),
            "cost": float(cost),
            "turnover": float(traded_notional),
            "selected_count": int(len(picked)),
        })
        previous_weights = current_weights

    if not period_returns:
        return None

    periods = len(period_returns)
    annual_scale = 252.0 / float(TRADING_REBALANCE_DAYS)
    annual_return = float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    sharpe = None
    if period_std > 0:
        sharpe = float(np.mean(period_returns) / period_std * math.sqrt(annual_scale))

    record = {
        "result_type": "strategy_trading_backtest",
        "strategy_id": candidate["strategy_id"],
        "strategy_name": candidate["strategy_name"],
        "horizon": "5日调仓交易",
        "layer": label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(sample_trades),
        "strategy_return": float(nav - 1),
        "strategy_annual_return": annual_return,
        "annual_return": annual_return,
        "final_net_value": float(nav),
        "max_drawdown": max_drawdown([item["net_value"] for item in curve]),
        "sharpe": sharpe,
        "daily_win_rate": float(np.mean([ret > 0 for ret in period_returns])),
        "period_mean_return": float(np.mean(period_returns)),
        "gross_mean_return": float(np.mean(gross_returns)),
        "avg_turnover": float(np.mean(turnover_values)),
        "total_turnover": float(np.sum(turnover_values)),
        "cost_rate": TRADING_COST_RATE,
        "slippage_rate": TRADING_SLIPPAGE_RATE,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "source": "joinquant_akshare_ohlcv_candidate_review",
        "data_policy": "真实 JoinQuant OHLCV/valuation 重建 AkShare 候选；5日等权调仓净值由真实未来5日收益扣交易成本和滑点计算；未生成任何虚构绩效。",
        "route": candidate["route"],
        "score_col": score_col,
        "net_value_curve": curve[-80:],
    }
    record.update(layer_meta)
    return record


def summarize_events(rows, candidate, label, layer_meta):
    summaries = []
    score_col = candidate["score_col"]
    work = rows.dropna(subset=[score_col]).copy()
    if work.empty:
        return summaries
    selected = []
    for day, frame in work.groupby("date"):
        picked = frame.sort_values(score_col, ascending=False).head(TOP_N).copy()
        if not picked.empty:
            selected.append(picked)
    if not selected:
        return summaries
    candidates = pd.concat(selected, ignore_index=True)

    for horizon in HORIZONS:
        col = "future_return_%d" % horizon
        values = candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
        daily = candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        item = {
            "result_type": "strategy_backtest",
            "strategy_id": candidate["strategy_id"],
            "strategy_name": candidate["strategy_name"],
            "horizon": int(horizon),
            "layer": label,
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
            "source": "joinquant_akshare_ohlcv_candidate_review",
            "note": "真实 JoinQuant OHLCV/valuation 对 AkShare 本地候选做事件收益复核；不含虚构绩效。",
            "route": candidate["route"],
            "score_col": score_col,
        }
        item.update(layer_meta)
        summaries.append(item)
    return summaries


def candidate_records(table, candidate):
    records = []
    score_col = candidate["score_col"]
    base = table.dropna(subset=[score_col]).copy()

    exact = base[
        (base["market_regime"] == candidate["target_market_regime"])
        & (base["liquidity_bucket"] == candidate["target_liquidity_bucket"])
    ].copy()
    exact_meta = {
        "review_layer_type": "target_volatility_liquidity_route",
        "market_regime": candidate["target_market_regime"],
        "liquidity_bucket": candidate["target_liquidity_bucket"],
    }
    records.extend(summarize_events(exact, candidate, "目标路线", exact_meta))
    exact_trading = simulate_portfolio(exact, candidate, "目标路线", exact_meta)
    if exact_trading:
        records.append(exact_trading)

    bucket_order = [
        ("large_cap", "大市值"),
        ("mid_cap", "中市值"),
        ("small_cap", "小市值"),
    ]
    for bucket_id, bucket_name in bucket_order:
        part = exact[exact["market_cap_bucket"] == bucket_id].copy()
        meta = dict(exact_meta)
        meta.update({
            "review_layer_type": "target_route_market_cap_bucket",
            "market_cap_bucket": bucket_id,
            "market_cap_bucket_name": bucket_name,
        })
        item = simulate_portfolio(part, candidate, "目标路线/%s" % bucket_name, meta)
        if item:
            records.append(item)

    regime_order = [
        ("high_volatility", "高波动"),
        ("medium_volatility", "中波动"),
        ("low_volatility", "低波动"),
    ]
    for regime_id, regime_name in regime_order:
        for bucket_id, bucket_name in bucket_order:
            part = base[(base["market_regime"] == regime_id) & (base["market_cap_bucket"] == bucket_id)].copy()
            meta = {
                "review_layer_type": "volatility_market_cap_cross",
                "market_regime": regime_id,
                "market_regime_name": regime_name,
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": bucket_name,
            }
            item = simulate_portfolio(part, candidate, "%s/%s" % (regime_name, bucket_name), meta)
            if item:
                records.append(item)

    return records


def run():
    table, config = build_factor_table()
    records = []
    for candidate in CANDIDATES:
        records.extend(candidate_records(table, candidate))

    output = {
        "result_type": "strategy_trading_package",
        "source": "joinquant_akshare_ohlcv_candidate_review",
        "data_policy": "真实 JoinQuant OHLCV、沪深300指数行情、valuation.market_cap 与 valuation.turnover_ratio 复核 AkShare 本地强候选；未生成任何虚构绩效。",
        "config": config,
        "sample": {
            "factor_rows": int(table.shape[0]),
            "test_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "candidate_count": int(len(CANDIDATES)),
            "records": int(len(records)),
        },
        "candidates": CANDIDATES,
        "records": records,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run()
