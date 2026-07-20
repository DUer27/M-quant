# M-quant JoinQuant strategy backtest: 市场资金状态仓位模块
# Policy: only uses JoinQuant index OHLCV data. No fabricated metrics.
# This is a market-level position overlay test, not a stock-selection alpha test.

import json

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "market_capital_regime_position"
STRATEGY_NAME = "市场资金状态仓位模块"
INDEX_CODE = "000300.XSHG"
PRICE_START = "2021-01-01"
FACTOR_START = "2022-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5


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
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()
    return df


def volatility_bucket(volatility):
    if pd.isna(volatility):
        return "unknown"
    if volatility >= 0.23:
        return "high_volatility"
    if volatility >= 0.16:
        return "mid_volatility"
    return "low_volatility"


def position_bucket(multiplier):
    if multiplier >= 1.05:
        return "aggressive"
    if multiplier >= 0.75:
        return "normal"
    if multiplier >= 0.35:
        return "defensive"
    return "cash_like"


def build_market_table():
    all_days = pd.to_datetime(get_trade_days(start_date=FACTOR_START, end_date=END_LIMIT))
    if len(all_days) <= max(HORIZONS) + 1:
        raise ValueError("交易日不足，无法形成未来收益标签。")
    latest_trade_day = all_days[-1]
    usable_end = all_days[-max(HORIZONS) - 1]
    test_days = all_days[all_days <= usable_end][::FACTOR_DAY_STEP]

    price = get_price(
        INDEX_CODE,
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

    price = price.sort_values("date").copy()
    price["ret_1d"] = price["close"].pct_change()
    for window in [5, 20, 60, 120, 240]:
        price["ma%d" % window] = price["close"].rolling(window, min_periods=max(5, window // 2)).mean()
        price["ma%d_dir" % window] = price["ma%d" % window].diff()
    price["volume_ma20"] = price["volume"].rolling(20, min_periods=10).mean()
    price["volume_ma120"] = price["volume"].rolling(120, min_periods=60).mean()
    price["money_ma20"] = price["money"].rolling(20, min_periods=10).mean()
    price["money_ma120"] = price["money"].rolling(120, min_periods=60).mean()
    price["volume_ratio20"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)
    price["volume_ratio120"] = price["volume"] / price["volume_ma120"].replace(0, np.nan)
    price["money_ratio20"] = price["money"] / price["money_ma20"].replace(0, np.nan)
    price["money_ratio120"] = price["money"] / price["money_ma120"].replace(0, np.nan)
    price["realized_vol_20d"] = price["ret_1d"].rolling(20, min_periods=10).std() * np.sqrt(252)
    price["realized_vol_60d"] = price["ret_1d"].rolling(60, min_periods=30).std() * np.sqrt(252)
    price["high_60d"] = price["close"].rolling(60, min_periods=30).max()
    price["drawdown_60d"] = price["close"] / price["high_60d"].replace(0, np.nan) - 1

    for horizon in HORIZONS:
        price["future_index_return_%d" % horizon] = price["close"].shift(-horizon) / price["close"] - 1

    frame = price[price["date"].isin(test_days)].copy()
    trend_score = (
        0.25 * (frame["close"] > frame["ma20"]).astype(float)
        + 0.20 * (frame["ma20_dir"] > 0).astype(float)
        + 0.20 * (frame["close"] > frame["ma60"]).astype(float)
        + 0.15 * (frame["ma60_dir"] > 0).astype(float)
        + 0.10 * (frame["ma120_dir"] > 0).astype(float)
        + 0.10 * (frame["ma240_dir"] > 0).astype(float)
    )
    capital_heat = clip01(
        0.35 * (frame["money_ratio20"] - 0.75) / 0.75
        + 0.25 * (frame["money_ratio120"] - 0.75) / 0.75
        + 0.20 * (frame["volume_ratio20"] - 0.75) / 0.75
        + 0.20 * (frame["volume_ratio120"] - 0.75) / 0.75
    )
    volatility_risk = clip01((frame["realized_vol_20d"] - 0.12) / 0.22)
    drawdown_risk = clip01((-frame["drawdown_60d"] - 0.02) / 0.10)

    frame["market_capital_regime"] = clip01(
        0.46 * trend_score
        + 0.24 * capital_heat
        - 0.18 * volatility_risk
        - 0.12 * drawdown_risk
        + 0.30
    )
    frame["position_multiplier"] = np.select(
        [
            frame["market_capital_regime"] >= 0.72,
            frame["market_capital_regime"] >= 0.55,
            frame["market_capital_regime"] >= 0.38,
        ],
        [1.15, 0.85, 0.45],
        default=0.15,
    )
    frame["volatility_bucket"] = frame["realized_vol_20d"].apply(volatility_bucket)
    frame["position_bucket"] = frame["position_multiplier"].apply(position_bucket)
    frame["trend_score"] = trend_score
    frame["capital_heat"] = capital_heat
    frame["volatility_risk"] = volatility_risk
    frame["drawdown_risk"] = drawdown_risk
    return frame


def summarize(frame):
    summaries = []
    for horizon in HORIZONS:
        base_col = "future_index_return_%d" % horizon
        positioned = frame[base_col] * frame["position_multiplier"]
        valid = pd.DataFrame({
            "date": frame["date"],
            "base_return": frame[base_col],
            "positioned_return": positioned,
            "position_multiplier": frame["position_multiplier"],
            "volatility_bucket": frame["volatility_bucket"],
            "position_bucket": frame["position_bucket"],
        }).replace([np.inf, -np.inf], np.nan).dropna(subset=["base_return", "positioned_return"])
        if valid.empty:
            continue
        summaries.append({
            "result_type": "strategy_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "horizon": horizon,
            "sample_dates": int(valid.shape[0]),
            "mean_return": float(valid["positioned_return"].mean()),
            "benchmark_mean_return": float(valid["base_return"].mean()),
            "excess_mean_return": float((valid["positioned_return"] - valid["base_return"]).mean()),
            "positive_ratio": float((valid["positioned_return"] > 0).mean()),
            "benchmark_positive_ratio": float((valid["base_return"] > 0).mean()),
            "avg_position_multiplier": float(valid["position_multiplier"].mean()),
            "best_return": float(valid["positioned_return"].max()),
            "worst_return": float(valid["positioned_return"].min()),
            "source": "joinquant_hs300_market_regime_position_v1",
            "note": "真实 JoinQuant 沪深300指数 OHLCV 仓位模块回测；只验证市场仓位开关，不代表个股选股alpha。",
        })

        for vol_bucket, bucket_frame in valid.groupby("volatility_bucket"):
            summaries.append({
                "result_type": "strategy_regime_backtest",
                "strategy_id": STRATEGY_ID,
                "strategy_name": STRATEGY_NAME,
                "horizon": horizon,
                "regime": vol_bucket,
                "sample_dates": int(bucket_frame.shape[0]),
                "mean_return": float(bucket_frame["positioned_return"].mean()),
                "benchmark_mean_return": float(bucket_frame["base_return"].mean()),
                "excess_mean_return": float((bucket_frame["positioned_return"] - bucket_frame["base_return"]).mean()),
                "positive_ratio": float((bucket_frame["positioned_return"] > 0).mean()),
                "avg_position_multiplier": float(bucket_frame["position_multiplier"].mean()),
                "source": "joinquant_hs300_market_regime_position_v1",
                "note": "按真实20日年化波动率分层：high/mid/low volatility。",
            })

        for pos_bucket, bucket_frame in valid.groupby("position_bucket"):
            summaries.append({
                "result_type": "strategy_position_bucket_backtest",
                "strategy_id": STRATEGY_ID,
                "strategy_name": STRATEGY_NAME,
                "horizon": horizon,
                "position_bucket": pos_bucket,
                "sample_dates": int(bucket_frame.shape[0]),
                "mean_return": float(bucket_frame["positioned_return"].mean()),
                "benchmark_mean_return": float(bucket_frame["base_return"].mean()),
                "excess_mean_return": float((bucket_frame["positioned_return"] - bucket_frame["base_return"]).mean()),
                "positive_ratio": float((bucket_frame["positioned_return"] > 0).mean()),
                "avg_position_multiplier": float(bucket_frame["position_multiplier"].mean()),
                "source": "joinquant_hs300_market_regime_position_v1",
                "note": "按仓位乘数分层，验证仓位开关在不同市场状态下的真实历史表现。",
            })
    return summaries


def run():
    frame = build_market_table()
    summary = summarize(frame)
    preview_cols = [
        "date",
        "close",
        "market_capital_regime",
        "position_multiplier",
        "volatility_bucket",
        "position_bucket",
        "trend_score",
        "capital_heat",
        "volatility_risk",
        "drawdown_risk",
    ]
    preview = frame[preview_cols].tail(50).copy()
    preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")
    output = {
        "result_type": "strategy_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_hs300_market_regime_position_v1",
        "data_policy": "真实 JoinQuant 沪深300指数 OHLCV 计算；不生成虚构收益；该模块只验证仓位开关。",
        "config": {
            "index_code": INDEX_CODE,
            "price_start": PRICE_START,
            "factor_start": FACTOR_START,
            "end_limit": END_LIMIT,
            "horizons": HORIZONS,
            "factor_day_step": FACTOR_DAY_STEP,
        },
        "sample": {
            "market_rows": int(frame.shape[0]),
            "test_dates": int(frame["date"].nunique()),
            "latest_date": frame["date"].max().strftime("%Y-%m-%d"),
        },
        "summary": summary,
        "market_preview": preview.to_dict(orient="records"),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run()
