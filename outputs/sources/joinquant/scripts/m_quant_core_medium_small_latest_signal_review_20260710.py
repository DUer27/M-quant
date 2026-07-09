# M-quant JoinQuant latest signal review: core volume-price medium-vol/small-cap sleeve
# Policy: compute the latest signal from JoinQuant real OHLCV and valuation data.
# No fabricated prices, returns, market regime, market caps, candidates, or tradeability.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Run the cell.
# 3. Copy the printed JSON back to M-quant 回测中心 -> 结果回填 after import support is enabled.
#
# Boundary:
# - This is not a backtest and does not create future returns.
# - This only checks whether the latest market state is medium_volatility and
#   whether enough small-cap candidates pass the core volume-price entry rules.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "core_volume_price_trend_v1"
STRATEGY_NAME = "核心量价趋势策略 v1"
SLEEVE_ID = "jq_medium_vol_small_cap_core"
INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
SIGNAL_END_DATE = None
SIGNAL_LOOKBACK_DAYS = 10
TOP_N = 30
MIN_CROSS_SECTION = 80
MIN_SELECTED_COUNT = 10

FACTOR_WEIGHTS = {
    "technical_composite": 0.30,
    "volume_price_confirmation": 0.35,
    "trend_alignment": 0.25,
    "crowding_risk": -0.20,
    "volume_price_divergence_risk": -0.15,
    "trend_extension_risk": -0.05,
}


def safe_float(value):
    try:
        number = float(value)
    except Exception:
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def clip01(value):
    return value.clip(lower=0, upper=1)


def bounded_peak_score(series, target, width):
    return clip01(1 - (series - target).abs() / width)


def safe_ratio(a, b):
    return a / b.replace(0, np.nan)


def rank_pct(series):
    return series.rank(pct=True).fillna(0.5)


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


def latest_trade_day():
    if SIGNAL_END_DATE:
        days = list(get_trade_days(end_date=SIGNAL_END_DATE, count=1))
    else:
        days = list(get_trade_days(count=1))
    if not days:
        raise ValueError("无法取得最新交易日。")
    return pd.Timestamp(days[-1]).normalize()


def candidate_signal_days():
    if SIGNAL_END_DATE:
        days = list(get_trade_days(end_date=SIGNAL_END_DATE, count=SIGNAL_LOOKBACK_DAYS))
    else:
        days = list(get_trade_days(count=SIGNAL_LOOKBACK_DAYS))
    if not days:
        raise ValueError("无法取得候选交易日。")
    return [pd.Timestamp(day).normalize() for day in reversed(days)]


def classify_market_regime(signal_date):
    start = (pd.Timestamp(signal_date) - pd.Timedelta(days=900)).strftime("%Y-%m-%d")
    index_price = get_price(
        INDEX_CODE,
        start_date=start,
        end_date=pd.Timestamp(signal_date).strftime("%Y-%m-%d"),
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    df = normalize_price_frame(index_price)
    if df.empty or len(df) < 260:
        raise ValueError("指数历史不足，无法判断市场波动状态。")
    df = df.sort_values("date").copy()
    df["ret"] = df["close"].pct_change()
    df["market_vol_20d"] = df["ret"].rolling(20, min_periods=15).std() * np.sqrt(252)
    df["vol_p30"] = df["market_vol_20d"].rolling(250, min_periods=120).quantile(0.30)
    df["vol_p70"] = df["market_vol_20d"].rolling(250, min_periods=120).quantile(0.70)
    latest = df.dropna(subset=["market_vol_20d", "vol_p30", "vol_p70"]).iloc[-1]
    regime = "medium_volatility"
    if latest["market_vol_20d"] >= latest["vol_p70"]:
        regime = "high_volatility"
    elif latest["market_vol_20d"] <= latest["vol_p30"]:
        regime = "low_volatility"
    return {
        "market_regime": regime,
        "market_vol_20d": safe_float(latest["market_vol_20d"]),
        "vol_p30": safe_float(latest["vol_p30"]),
        "vol_p70": safe_float(latest["vol_p70"]),
    }


def fetch_valuation(universe, signal_date):
    data = get_fundamentals(
        query(
            valuation.code,
            valuation.market_cap,
            valuation.circulating_market_cap,
            valuation.turnover_ratio,
        ).filter(valuation.code.in_(sorted(universe))),
        date=pd.Timestamp(signal_date).strftime("%Y-%m-%d"),
    )
    if data is None or data.empty:
        raise ValueError("valuation 未返回可用数据。")
    return data.copy()


def fetch_price_history(universe, signal_date):
    price = get_price(
        sorted(universe),
        start_date=PRICE_START,
        end_date=pd.Timestamp(signal_date).strftime("%Y-%m-%d"),
        frequency="daily",
        fields=["open", "high", "low", "close", "volume", "money", "paused", "high_limit", "low_limit"],
        panel=False,
        fq="pre",
    )
    frame = normalize_price_frame(price)
    if frame.empty:
        raise ValueError("get_price 未返回可用价格数据。")
    return frame.sort_values(["code", "date"]).copy()


def build_factor_table(signal_date):
    universe = set(get_index_stocks(INDEX_CODE, date=pd.Timestamp(signal_date).strftime("%Y-%m-%d")))
    if len(universe) < MIN_CROSS_SECTION:
        raise ValueError("沪深300成分股数量不足。")
    price = fetch_price_history(universe, signal_date)
    fundamentals = fetch_valuation(universe, signal_date)
    group = price.groupby("code", group_keys=False)
    price["prev_close"] = group["close"].shift(1)
    price["change_pct"] = (price["close"] / price["prev_close"] - 1) * 100
    price["amplitude"] = (price["high"] - price["low"]) / price["prev_close"].replace(0, np.nan) * 100
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_ratio"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)

    for window in [5, 10, 13, 20, 30, 60, 120, 250]:
        price["ma%d" % window] = group["close"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["ma%d_dir" % window] = price.groupby("code")["ma%d" % window].transform(lambda s: s.diff())
    for window in [5, 10]:
        price["mavol%d" % window] = group["volume"].rolling(window, min_periods=max(3, window // 2)).mean().reset_index(level=0, drop=True)
        price["mavol%d_dir" % window] = price.groupby("code")["mavol%d" % window].transform(lambda s: s.diff())

    part = price[(price["date"] == pd.Timestamp(signal_date)) & (price["code"].isin(universe))].copy()
    part = part.merge(fundamentals, on="code", how="left")
    part = part.replace([np.inf, -np.inf], np.nan)
    if len(part) < MIN_CROSS_SECTION:
        raise ValueError("最新截面不足，无法计算候选池。")

    day_range = (part["high"] - part["low"]).replace(0, np.nan)
    signed_body = (part["close"] - part["open"]) / day_range
    body_ratio = ((part["close"] - part["open"]).abs() / day_range).clip(0, 1).fillna(0)
    upper_ratio = ((part["high"] - np.maximum(part["open"], part["close"])) / day_range).clip(0, 1).fillna(0)
    lower_ratio = ((np.minimum(part["open"], part["close"]) - part["low"]) / day_range).clip(0, 1).fillna(0)
    close_position = ((part["close"] - part["low"]) / day_range).clip(0, 1).fillna(0.5)

    change_rank = rank_pct(part["change_pct"])
    amplitude_rank = rank_pct(part["amplitude"])
    volume_ratio_rank = rank_pct(part["volume_ratio"])
    amount_rank = rank_pct(part["money"])

    bullish_body_score = clip01((signed_body + 1) / 2).fillna(0.5)
    candle_quality = clip01(0.45 * close_position + 0.25 * bullish_body_score + 0.20 * lower_ratio + 0.10 * (1 - upper_ratio))
    upper_shadow_pressure = clip01(0.65 * upper_ratio + 0.35 * (((upper_ratio > lower_ratio) & (close_position < 0.55)).astype(float)))

    trend_dir_score = (
        0.22 * (part["ma5_dir"] > 0).astype(float)
        + 0.18 * (part["ma13_dir"] > 0).astype(float)
        + 0.16 * (part["ma20_dir"] > 0).astype(float)
        + 0.14 * (part["ma30_dir"] > 0).astype(float)
        + 0.12 * (part["ma60_dir"] > 0).astype(float)
        + 0.10 * (part["ma120_dir"] > 0).astype(float)
        + 0.08 * (part["ma250_dir"] > 0).astype(float)
    )
    trend_position_score = (
        0.24 * (part["close"] > part["ma5"]).astype(float)
        + 0.20 * (part["close"] > part["ma13"]).astype(float)
        + 0.17 * (part["close"] > part["ma20"]).astype(float)
        + 0.14 * (part["close"] > part["ma30"]).astype(float)
        + 0.11 * (part["close"] > part["ma60"]).astype(float)
        + 0.08 * (part["close"] > part["ma120"]).astype(float)
        + 0.06 * (part["close"] > part["ma250"]).astype(float)
    )
    trend_stack_score = (
        0.35 * (part["ma5"] > part["ma20"]).astype(float)
        + 0.30 * (part["ma20"] > part["ma60"]).astype(float)
        + 0.20 * (part["ma60"] > part["ma120"]).astype(float)
        + 0.15 * (part["ma120"] > part["ma250"]).astype(float)
    )
    trend_maturity = clip01(
        0.55 * bounded_peak_score(safe_ratio(part["ma5"], part["ma20"]), 1.035, 0.11)
        + 0.45 * bounded_peak_score(safe_ratio(part["ma20"], part["ma60"]), 1.045, 0.13)
    )
    trend_extension_risk = clip01(((safe_ratio(part["close"], part["ma20"]) - 1).abs() - 0.035) / 0.14).fillna(0.5)
    trend_alignment = clip01(0.30 * trend_dir_score + 0.25 * trend_position_score + 0.20 * trend_stack_score + 0.15 * trend_maturity + 0.10 * (1 - trend_extension_risk))

    volume_quality = bounded_peak_score(part["volume_ratio"], 1.8, 2.2)
    volume_support = clip01(0.36 * (part["mavol5_dir"] > 0).astype(float) + 0.28 * (part["mavol10_dir"] > 0).astype(float) + 0.20 * volume_quality + 0.16 * amount_rank)
    price_action_quality = clip01(0.34 * change_rank + 0.30 * close_position + 0.22 * bullish_body_score + 0.14 * (1 - upper_shadow_pressure))
    volume_price_sync = clip01(
        0.35 * ((part["change_pct"] > 0) & (close_position >= 0.62)).astype(float)
        + 0.25 * ((part["volume_ratio"] >= 0.8) & (part["volume_ratio"] <= 3.2)).astype(float)
        + 0.20 * amount_rank
        + 0.20 * ((part["mavol5_dir"] > 0) | (part["mavol10_dir"] > 0)).astype(float)
    )
    volume_price_divergence_risk = clip01(
        0.30 * ((part["change_pct"] <= 0) & (volume_ratio_rank >= 0.65)).astype(float)
        + 0.25 * ((close_position <= 0.42) & (volume_ratio_rank >= 0.65)).astype(float)
        + 0.22 * upper_shadow_pressure
        + 0.13 * ((part["volume_ratio"] > 3.5) & (part["change_pct"] < 2)).astype(float)
        + 0.10 * ((part["amplitude"] > 10) & (close_position < 0.55)).astype(float)
    )
    blowoff_penalty = clip01(
        0.50 * (part["volume_ratio"] > 4).astype(float)
        + 0.25 * (upper_ratio > 0.45).astype(float)
        + 0.25 * (part["amplitude"] > 12).astype(float)
    )
    volume_price_confirmation = clip01(
        0.24 * volume_support
        + 0.22 * price_action_quality
        + 0.20 * volume_price_sync
        + 0.18 * trend_alignment
        + 0.08 * amount_rank
        + 0.08 * candle_quality
        - 0.22 * volume_price_divergence_risk
        - 0.10 * blowoff_penalty
    )

    transaction_crowding_risk = clip01(0.46 * volume_ratio_rank + 0.42 * amount_rank + 0.12 * (part["volume_ratio"] >= 3).astype(float))
    price_heat_risk = clip01(0.34 * change_rank + 0.26 * amplitude_rank + 0.22 * trend_extension_risk + 0.18 * (close_position >= 0.9).astype(float))
    candle_distribution_risk = clip01(
        0.45 * upper_shadow_pressure
        + 0.22 * ((close_position < 0.45) & (volume_ratio_rank > 0.65)).astype(float)
        + 0.18 * ((body_ratio <= 0.18) & (amplitude_rank > 0.65)).astype(float)
        + 0.15 * ((lower_ratio < 0.12) & (close_position < 0.35)).astype(float)
    )
    crowding_risk = clip01(0.34 * transaction_crowding_risk + 0.24 * price_heat_risk + 0.20 * candle_distribution_risk + 0.16 * volume_price_divergence_risk + 0.06 * (part["change_pct"] >= 9.5).astype(float))

    signed_return = (part["close"] - part["open"]) / part["open"].replace(0, np.nan)
    up_context = (part["close"] > part["ma20"]) & (part["ma20_dir"] > 0)
    spinning_top = (body_ratio > 0.08) & (body_ratio <= 0.35) & (upper_ratio >= 0.20) & (lower_ratio >= 0.20)
    high_volume = (part["volume_ratio"] >= 1.5) | (volume_ratio_rank >= 0.80)
    long_lower = (lower_ratio >= 0.55) & (upper_ratio <= 0.18) & (body_ratio <= 0.35)
    long_upper = (upper_ratio >= 0.55) & (lower_ratio <= 0.18) & (body_ratio <= 0.35)
    kline_event_score = pd.Series(0.0, index=part.index)
    kline_event_score += ((part["close"] > part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * 2
    kline_event_score += ((part["close"] < part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * -2
    kline_event_score += ((signed_return >= 0.05) & (body_ratio >= 0.65)).astype(float) * 2
    kline_event_score += ((signed_return <= -0.05) & (body_ratio >= 0.65)).astype(float) * 2
    kline_event_score += (long_lower & ~up_context).astype(float) * -3
    kline_event_score += (spinning_top & high_volume).astype(float) * -1
    kline_event_score += (long_lower & up_context).astype(float) * 2
    kline_event_score += (long_upper & up_context).astype(float) * 2
    doji = body_ratio <= 0.08
    kline_event_score += doji.astype(float) * 1
    kline_event_score += (doji & (lower_ratio >= 0.60) & (upper_ratio <= 0.12)).astype(float) * 2
    kline_event_score += (doji & (upper_ratio >= 0.60) & (lower_ratio <= 0.12)).astype(float) * -2

    intraday_strength = clip01(0.34 * change_rank + 0.26 * candle_quality + 0.16 * volume_quality + 0.14 * amount_rank + 0.10 * (1 - upper_ratio))
    technical_composite = clip01(0.30 * trend_alignment + 0.27 * volume_price_confirmation + 0.18 * intraday_strength + 0.10 * rank_pct(kline_event_score) - 0.15 * crowding_risk)

    part["technical_composite"] = technical_composite
    part["trend_alignment"] = trend_alignment
    part["volume_price_confirmation"] = volume_price_confirmation
    part["crowding_risk"] = crowding_risk
    part["volume_price_divergence_risk"] = volume_price_divergence_risk
    part["trend_extension_risk"] = trend_extension_risk
    part["kline_event_score"] = kline_event_score
    return part


def score_strategy(frame):
    scored = frame.copy()
    score = pd.Series(0.0, index=scored.index)
    for factor, weight in FACTOR_WEIGHTS.items():
        score += abs(weight) * rank_pct(scored[factor]) if weight >= 0 else abs(weight) * rank_pct(-scored[factor])
    scored["strategy_score"] = score
    return scored.sort_values("strategy_score", ascending=False)


def market_cap_bucketize(frame):
    out = frame.copy()
    out["market_cap_pct"] = out["market_cap"].rank(pct=True)
    out["market_cap_bucket"] = "mid_cap"
    out.loc[out["market_cap_pct"] >= 0.67, "market_cap_bucket"] = "large_cap"
    out.loc[out["market_cap_pct"] <= 0.33, "market_cap_bucket"] = "small_cap"
    return out


def review_for_signal_date(signal_date):
    regime = classify_market_regime(signal_date)
    factors = market_cap_bucketize(build_factor_table(signal_date))
    entry = factors[
        (factors["trend_alignment"] >= 0.60)
        & (factors["volume_price_confirmation"] >= 0.60)
        & (factors["crowding_risk"] <= 0.55)
        & (factors["volume_price_divergence_risk"] <= 0.45)
        & (factors["trend_extension_risk"] <= 0.75)
    ].copy()
    target_pool = entry[entry["market_cap_bucket"] == "small_cap"].copy()
    selected = score_strategy(target_pool).head(TOP_N)
    regime_ok = regime["market_regime"] == "medium_volatility"
    capacity_ok = len(selected) >= MIN_SELECTED_COUNT
    decision = "promotion_signal_ready" if regime_ok and capacity_ok else "promotion_signal_not_ready"
    records = []
    for _, row in selected.iterrows():
        close = safe_float(row.get("close"))
        high_limit = safe_float(row.get("high_limit"))
        low_limit = safe_float(row.get("low_limit"))
        paused = bool(row.get("paused", False))
        at_high_limit = bool(close is not None and high_limit is not None and close >= high_limit * 0.999)
        at_low_limit = bool(close is not None and low_limit is not None and close <= low_limit * 1.001)
        records.append({
            "code": row.get("code"),
            "date": str(pd.Timestamp(signal_date).date()),
            "close": close,
            "market_cap": safe_float(row.get("market_cap")),
            "market_cap_pct": safe_float(row.get("market_cap_pct")),
            "market_cap_bucket": row.get("market_cap_bucket"),
            "strategy_score": safe_float(row.get("strategy_score")),
            "technical_composite": safe_float(row.get("technical_composite")),
            "trend_alignment": safe_float(row.get("trend_alignment")),
            "volume_price_confirmation": safe_float(row.get("volume_price_confirmation")),
            "crowding_risk": safe_float(row.get("crowding_risk")),
            "volume_price_divergence_risk": safe_float(row.get("volume_price_divergence_risk")),
            "trend_extension_risk": safe_float(row.get("trend_extension_risk")),
            "paused": paused,
            "high_limit": high_limit,
            "low_limit": low_limit,
            "at_high_limit": at_high_limit,
            "at_low_limit": at_low_limit,
            "tradable_proxy": not paused and not at_high_limit and not at_low_limit,
        })
    return {
        "source": "joinquant_core_medium_small_latest_signal_review",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "sleeve_id": SLEEVE_ID,
        "signal_date": str(pd.Timestamp(signal_date).date()),
        "target_market_regime": "medium_volatility",
        "target_market_cap_bucket": "small_cap",
        "market_regime": regime["market_regime"],
        "market_vol_20d": regime["market_vol_20d"],
        "vol_p30": regime["vol_p30"],
        "vol_p70": regime["vol_p70"],
        "universe_count": int(len(factors)),
        "entry_candidate_count": int(len(entry)),
        "target_candidate_count": int(len(target_pool)),
        "selected_count": int(len(selected)),
        "min_selected_count": MIN_SELECTED_COUNT,
        "decision": decision,
        "decision_reason": "市场状态为中波动且小市值候选不少于10只。" if decision == "promotion_signal_ready" else "市场状态或候选容量暂未满足晋级观察条件。",
        "records": records,
        "data_policy": "JoinQuant 真实 OHLCV、沪深300成分股、valuation.market_cap 和当日交易状态代理；不生成未来收益或模拟盘结果。",
    }


def review_latest_signal():
    attempts = []
    for signal_date in candidate_signal_days():
        try:
            output = review_for_signal_date(signal_date)
            output["latest_available_signal_date"] = output["signal_date"]
            output["attempted_signal_dates"] = attempts + [{
                "signal_date": str(pd.Timestamp(signal_date).date()),
                "status": "used",
            }]
            if SIGNAL_END_DATE is None and output["attempted_signal_dates"][0]["signal_date"] != output["signal_date"]:
                output["decision_reason"] = (
                    output["decision_reason"]
                    + " 最新交易日数据不完整，已回退到 JoinQuant valuation/OHLCV 均可用的最近交易日。"
                )
            return output
        except Exception as exc:
            attempts.append({
                "signal_date": str(pd.Timestamp(signal_date).date()),
                "status": "skipped",
                "reason": str(exc),
            })
    raise ValueError("最近 %d 个交易日都无法形成核心量价最新信号复核：%s" % (SIGNAL_LOOKBACK_DAYS, attempts))


print(json.dumps(review_latest_signal(), ensure_ascii=False, indent=2))
