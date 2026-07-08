# M-quant JoinQuant strategy backtest: K线辅助确认策略
# Policy: only uses JoinQuant OHLCV data. No fabricated metrics.
# This is an OHLCV rebuild of emotion-weighted single-candle scoring.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "kline_assisted_confirmation"
STRATEGY_NAME = "K线辅助确认策略"
INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-01-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
TOP_N = 30


def rank01(series, higher_is_better=True):
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def clip01(series):
    return series.clip(0, 1).fillna(0.5)


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


def build_factor_table():
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
    price["prev_close"] = group["close"].shift(1)
    price["change_pct"] = (price["close"] / price["prev_close"] - 1) * 100
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_ma240"] = group["volume"].rolling(240, min_periods=120).mean().reset_index(level=0, drop=True)
    price["volume_ratio20"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)
    price["volume_ratio240"] = price["volume"] / price["volume_ma240"].replace(0, np.nan)
    price["money_ma20"] = group["money"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["money_ma240"] = group["money"].rolling(240, min_periods=120).mean().reset_index(level=0, drop=True)
    price["money_ratio240"] = price["money"] / price["money_ma240"].replace(0, np.nan)

    for window in [5, 20, 60, 120, 240]:
        price["ma%d" % window] = group["close"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["ma%d_dir" % window] = price.groupby("code")["ma%d" % window].transform(lambda s: s.diff())
    for horizon in HORIZONS:
        price["future_return_%d" % horizon] = group["close"].shift(-horizon) / price["close"] - 1

    rows = []
    for day, universe in universe_by_date.items():
        part = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        if len(part) < MIN_CROSS_SECTION:
            continue

        day_range = (part["high"] - part["low"]).replace(0, np.nan)
        signed_body = (part["close"] - part["open"]) / day_range
        body_ratio = ((part["close"] - part["open"]).abs() / day_range).clip(0, 1).fillna(0)
        upper_ratio = ((part["high"] - np.maximum(part["open"], part["close"])) / day_range).clip(0, 1).fillna(0)
        lower_ratio = ((np.minimum(part["open"], part["close"]) - part["low"]) / day_range).clip(0, 1).fillna(0)
        close_position = ((part["close"] - part["low"]) / day_range).clip(0, 1).fillna(0.5)

        trend_context = (
            0.25 * (part["close"] > part["ma20"]).astype(float)
            + 0.20 * (part["ma20_dir"] > 0).astype(float)
            + 0.20 * (part["close"] > part["ma60"]).astype(float)
            + 0.15 * (part["ma60_dir"] > 0).astype(float)
            + 0.10 * (part["ma120_dir"] > 0).astype(float)
            + 0.10 * (part["ma240_dir"] > 0).astype(float)
        ).clip(0, 1)

        bullish_body_score = clip01((signed_body + 1) / 2).fillna(0.5)
        candle_quality = clip01(
            0.42 * close_position
            + 0.24 * bullish_body_score
            + 0.20 * lower_ratio
            + 0.14 * (1 - upper_ratio)
        )
        upper_shadow_pressure = clip01(
            0.65 * upper_ratio
            + 0.35 * (((upper_ratio > lower_ratio) & (close_position < 0.55)).astype(float))
        )

        signed_return = (part["close"] - part["open"]) / part["open"].replace(0, np.nan)
        up_context = (part["close"] > part["ma20"]) & (part["ma20_dir"] > 0)
        high_volume = (part["volume_ratio20"] >= 1.5) | (rank01(part["volume_ratio20"]) >= 0.80)
        spinning_top = (body_ratio > 0.08) & (body_ratio <= 0.35) & (upper_ratio >= 0.20) & (lower_ratio >= 0.20)
        long_lower = (lower_ratio >= 0.55) & (upper_ratio <= 0.18) & (body_ratio <= 0.35)
        long_upper = (upper_ratio >= 0.55) & (lower_ratio <= 0.18) & (body_ratio <= 0.35)
        doji = body_ratio <= 0.08

        kline_event_score = pd.Series(0.0, index=part.index)
        kline_event_score += ((part["close"] > part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * 2
        kline_event_score += ((part["close"] < part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * -2
        kline_event_score += ((signed_return >= 0.05) & (body_ratio >= 0.65)).astype(float) * 2
        kline_event_score += ((signed_return <= -0.05) & (body_ratio >= 0.65)).astype(float) * -2
        kline_event_score += (long_lower & ~up_context).astype(float) * -2
        kline_event_score += (long_lower & up_context).astype(float) * 2
        kline_event_score += (long_upper & up_context).astype(float) * 1
        kline_event_score += (spinning_top & high_volume).astype(float) * -1
        kline_event_score += doji.astype(float) * 0.5
        kline_event_score += (doji & (lower_ratio >= 0.60) & (upper_ratio <= 0.12)).astype(float) * 1.5
        kline_event_score += (doji & (upper_ratio >= 0.60) & (lower_ratio <= 0.12)).astype(float) * -1.5

        emotion_coefficient = clip01(
            0.35 * rank01(part["volume_ratio240"], True)
            + 0.25 * rank01(part["money_ratio240"], True)
            + 0.20 * rank01(part["volume_ratio20"], True)
            + 0.20 * rank01(part["money"], True)
        )
        distribution_risk = clip01(
            0.42 * upper_shadow_pressure
            + 0.22 * ((close_position < 0.45) & (rank01(part["volume_ratio20"]) > 0.65)).astype(float)
            + 0.18 * ((body_ratio <= 0.18) & (rank01((part["high"] - part["low"]) / part["prev_close"].replace(0, np.nan)) > 0.65)).astype(float)
            + 0.18 * ((part["volume_ratio20"] > 3.8) & (part["change_pct"] < 2)).astype(float)
        )
        weighted_kline_score = clip01(
            0.36 * rank01(kline_event_score, True)
            + 0.28 * candle_quality
            + 0.22 * trend_context
            + 0.18 * emotion_coefficient
            - 0.26 * distribution_risk
        )

        out = part[["date", "code", "close"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["kline_event_score"] = kline_event_score
        out["emotion_coefficient_240d"] = emotion_coefficient
        out["weighted_kline_score"] = weighted_kline_score
        out["trend_context"] = trend_context
        out["distribution_risk"] = distribution_risk
        rows.append(out)

    if not rows:
        raise ValueError("未形成可回测K线策略样本。")
    return pd.concat(rows, ignore_index=True)


def select_candidates(factor_table):
    selected = []
    diagnostics = []
    for day, frame in factor_table.groupby("date"):
        filtered = frame[
            (frame["weighted_kline_score"] >= 0.62)
            & (frame["trend_context"] >= 0.45)
            & (frame["distribution_risk"] <= 0.62)
        ].copy()
        filtered["strategy_score"] = (
            0.48 * rank01(filtered["weighted_kline_score"], True)
            + 0.24 * rank01(filtered["emotion_coefficient_240d"], True)
            + 0.18 * rank01(filtered["trend_context"], True)
            - 0.18 * rank01(filtered["distribution_risk"], True)
        )
        picked = filtered.sort_values("strategy_score", ascending=False).head(TOP_N).copy()
        diagnostics.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "universe": int(frame.shape[0]),
            "after_entry_rules": int(filtered.shape[0]),
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
            "source": "joinquant_emotion_weighted_kline_ohlcv_v1",
            "note": "真实 JoinQuant OHLCV 的情绪系数加权K线事件回测；未使用研报不可得字段；不含虚构绩效。",
        })
    return summaries


def run():
    factor_table = build_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    summary = summarize_strategy(candidates)
    preview_cols = [
        "date",
        "code",
        "strategy_score",
        "weighted_kline_score",
        "kline_event_score",
        "emotion_coefficient_240d",
        "trend_context",
        "distribution_risk",
    ]
    preview = candidates[preview_cols].head(50).copy() if not candidates.empty else pd.DataFrame(columns=preview_cols)
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")
    output = {
        "result_type": "strategy_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_emotion_weighted_kline_ohlcv_v1",
        "data_policy": "真实 JoinQuant OHLCV 计算；240日量能情绪系数来自 volume/money rolling 240；未生成任何虚构收益。",
        "config": {
            "index_code": INDEX_CODE,
            "price_start": PRICE_START,
            "factor_start": FACTOR_START,
            "end_limit": END_LIMIT,
            "horizons": HORIZONS,
            "factor_day_step": FACTOR_DAY_STEP,
            "top_n": TOP_N,
        },
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
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run()
