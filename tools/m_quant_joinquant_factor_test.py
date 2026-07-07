import glob
import json
import math
import os

import numpy as np
import pandas as pd

from jqdata import *


INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [1, 5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
QUANTILES = 5


FACTOR_META = {
    "technical_composite_jq": {"name": "技术综合强度_JQ重建", "direction": "positive"},
    "trend_alignment_jq": {"name": "趋势质量专业版_JQ重建", "direction": "positive"},
    "volume_price_confirmation_jq": {"name": "量价确认专业版_JQ重建", "direction": "positive"},
    "crowding_risk_jq": {"name": "拥挤风险专业版_JQ重建", "direction": "negative"},
    "volume_price_divergence_risk_jq": {"name": "量价背离风险_JQ重建", "direction": "negative"},
    "trend_extension_risk_jq": {"name": "趋势过伸风险_JQ重建", "direction": "negative"},
    "kline_event_score_jq": {"name": "单根K线评分_JQ重建", "direction": "positive"},
}


def clip01(value):
    return value.clip(lower=0, upper=1)


def bounded_peak_score(series, target, width):
    return clip01(1 - (series - target).abs() / width)


def safe_ratio(a, b):
    return a / b.replace(0, np.nan)


def rank_pct(series):
    return series.rank(pct=True)


def corr(a, b, method="pearson"):
    pair = pd.DataFrame({"a": a, "b": b}).replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < 5 or pair["a"].nunique() < 2 or pair["b"].nunique() < 2:
        return np.nan
    return pair["a"].corr(pair["b"], method=method)


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


def evaluate_factor_table(table, factor_col, direction, horizons, source):
    daily_records = []
    group_records = []

    for horizon in horizons:
        ret_col = "future_return_%d" % horizon
        if ret_col not in table.columns:
            continue

        for date, part in table.groupby("date"):
            part = part[["code", factor_col, ret_col]].replace([np.inf, -np.inf], np.nan).dropna()
            part = part.drop_duplicates("code")
            if len(part) < MIN_CROSS_SECTION:
                continue

            signal = part[factor_col].copy()
            if direction == "negative":
                signal = -signal

            part["_signal"] = signal
            part["_group"] = pd.qcut(
                part["_signal"].rank(method="first"),
                QUANTILES,
                labels=False,
                duplicates="drop",
            )
            if part["_group"].nunique() < QUANTILES:
                continue
            part["_group"] = part["_group"].astype(int) + 1

            group_ret = part.groupby("_group")[ret_col].mean()
            long_short = group_ret.loc[QUANTILES] - group_ret.loc[1]
            rank_ic = corr(part["_signal"].rank(), part[ret_col].rank(), "pearson")
            ic = corr(part["_signal"], part[ret_col], "pearson")

            daily_records.append(
                {
                    "source": source,
                    "factor_name": factor_col,
                    "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
                    "horizon": horizon,
                    "direction": direction,
                    "ic": float(ic) if pd.notna(ic) else None,
                    "rank_ic": float(rank_ic) if pd.notna(rank_ic) else None,
                    "long_short": float(long_short),
                    "coverage": int(len(part)),
                }
            )
            for group, value in group_ret.items():
                group_records.append(
                    {
                        "source": source,
                        "factor_name": factor_col,
                        "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
                        "horizon": horizon,
                        "group": int(group),
                        "return": float(value),
                    }
                )

    if not daily_records:
        return []

    daily = pd.DataFrame(daily_records)
    summaries = []
    for (factor_name, horizon), part in daily.groupby(["factor_name", "horizon"]):
        ic_mean = part["ic"].dropna().mean()
        rank_ic_mean = part["rank_ic"].dropna().mean()
        long_short_mean = part["long_short"].mean()
        rank_ic_std = part["rank_ic"].dropna().std(ddof=1)
        rank_ic_t = np.nan
        if pd.notna(rank_ic_std) and rank_ic_std > 0:
            rank_ic_t = rank_ic_mean / rank_ic_std * math.sqrt(part["rank_ic"].dropna().shape[0])
        summaries.append(
            {
                "source": source,
                "factor_name": factor_name,
                "factor_display_name": FACTOR_META.get(factor_name, {}).get("name", factor_name),
                "horizon": int(horizon),
                "direction": FACTOR_META.get(factor_name, {}).get("direction", part["direction"].iloc[0]),
                "ic_mean": None if pd.isna(ic_mean) else float(ic_mean),
                "rank_ic_mean": None if pd.isna(rank_ic_mean) else float(rank_ic_mean),
                "rank_ic_t": None if pd.isna(rank_ic_t) else float(rank_ic_t),
                "rank_ic_positive_ratio": float((part["rank_ic"].dropna() > 0).mean()),
                "long_short_mean": float(long_short_mean),
                "long_short_positive_ratio": float((part["long_short"] > 0).mean()),
                "coverage_mean": float(part["coverage"].mean()),
                "sample_dates": int(part["date"].nunique()),
            }
        )

    return summaries


def build_historical_rebuild_factors():
    all_days = pd.to_datetime(get_trade_days(start_date=FACTOR_START, end_date=END_LIMIT))
    if len(all_days) <= max(HORIZONS) + 1:
        print("历史交易日不足，无法测试。")
        return pd.DataFrame(), []

    latest_trade_day = all_days[-1]
    usable_end = all_days[-max(HORIZONS) - 1]
    test_days = all_days[all_days <= usable_end][::FACTOR_DAY_STEP]
    print("JoinQuant latest_trade_day =", latest_trade_day.strftime("%Y-%m-%d"))
    print("factor test days =", len(test_days), "from", test_days[0].strftime("%Y-%m-%d"), "to", test_days[-1].strftime("%Y-%m-%d"))

    universe_by_date = {}
    securities = set()
    for day in test_days:
        stocks = get_index_stocks(INDEX_CODE, date=day.strftime("%Y-%m-%d"))
        universe_by_date[pd.Timestamp(day).normalize()] = set(stocks)
        securities.update(stocks)

    securities = sorted(securities)
    print("universe =", INDEX_CODE, "unique securities =", len(securities))

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
        print("get_price returned empty data.")
        return pd.DataFrame(), []

    price = price.sort_values(["code", "date"]).copy()
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
        short_medium_spread = safe_ratio(part["ma5"], part["ma20"])
        medium_long_spread = safe_ratio(part["ma20"], part["ma60"])
        trend_maturity = clip01(0.55 * bounded_peak_score(short_medium_spread, 1.035, 0.11) + 0.45 * bounded_peak_score(medium_long_spread, 1.045, 0.13))
        price_ma_distance = safe_ratio(part["close"], part["ma20"]) - 1
        trend_extension_risk = clip01(((price_ma_distance.abs() - 0.035) / 0.14).fillna(0.5))
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
        technical_composite = clip01(0.30 * trend_alignment + 0.27 * volume_price_confirmation + 0.18 * intraday_strength + 0.10 * (kline_event_score.rank(pct=True)) - 0.15 * crowding_risk)

        out = part[["date", "code"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["technical_composite_jq"] = technical_composite
        out["trend_alignment_jq"] = trend_alignment
        out["volume_price_confirmation_jq"] = volume_price_confirmation
        out["crowding_risk_jq"] = crowding_risk
        out["volume_price_divergence_risk_jq"] = volume_price_divergence_risk
        out["trend_extension_risk_jq"] = trend_extension_risk
        out["kline_event_score_jq"] = kline_event_score
        rows.append(out)

    if not rows:
        return pd.DataFrame(), []

    factor_table = pd.concat(rows, ignore_index=True)
    summaries = []
    for factor_name, meta in FACTOR_META.items():
        summaries.extend(evaluate_factor_table(factor_table, factor_name, meta["direction"], HORIZONS, "joinquant_historical_ohlcv_rebuild"))
    return factor_table, summaries


def test_uploaded_csv_files():
    csv_files = sorted(glob.glob("m-quant-joinquant-*.csv"))
    if not csv_files:
        print("未发现 m-quant-joinquant-*.csv 文件，跳过CSV单日因子测试。")
        return []

    all_days = pd.to_datetime(get_trade_days(start_date="2026-01-01", end_date=END_LIMIT))
    if len(all_days) == 0:
        return []
    latest_trade_day = all_days[-1]
    summaries = []

    for path in csv_files:
        df = pd.read_csv(path)
        df["date"] = pd.to_datetime(df["date"]).dt.normalize()
        print("CSV file =", path, "rows =", len(df), "factors =", sorted(df["factor_name"].unique()))
        for (factor_name, date), part in df.groupby(["factor_name", "date"]):
            securities = sorted(part["security"].dropna().unique())
            if not securities:
                continue
            available_days = pd.to_datetime(get_trade_days(start_date=date.strftime("%Y-%m-%d"), end_date=latest_trade_day.strftime("%Y-%m-%d")))
            if len(available_days) <= min(HORIZONS):
                print("CSV", factor_name, date.strftime("%Y-%m-%d"), "未来收益不足，latest =", latest_trade_day.strftime("%Y-%m-%d"))
                continue
            end = available_days[min(len(available_days) - 1, max(HORIZONS))]
            price = get_price(
                securities,
                start_date=date.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                frequency="daily",
                fields=["close"],
                panel=False,
                fq="pre",
            )
            price = normalize_price_frame(price)
            if price.empty:
                continue
            close = price.pivot(index="date", columns="code", values="close").sort_index()
            table = part[["security", "factor_value"]].rename(columns={"security": "code", "factor_value": factor_name}).copy()
            table["date"] = date
            for horizon in HORIZONS:
                if len(close) <= horizon:
                    continue
                fwd = close.iloc[horizon] / close.iloc[0] - 1
                table["future_return_%d" % horizon] = table["code"].map(fwd)
            direction = str(part["factor_direction"].iloc[0])
            summaries.extend(evaluate_factor_table(table, factor_name, direction, HORIZONS, "m_quant_uploaded_csv"))
    return summaries


csv_summaries = test_uploaded_csv_files()
factor_table, historical_summaries = build_historical_rebuild_factors()
all_summaries = csv_summaries + historical_summaries

if not all_summaries:
    print("没有得到可验证结果。请检查未来收益可用性、CSV文件和研究环境权限。")
else:
    summary_df = pd.DataFrame(all_summaries)
    cols = [
        "source",
        "factor_name",
        "horizon",
        "direction",
        "sample_dates",
        "coverage_mean",
        "rank_ic_mean",
        "rank_ic_t",
        "long_short_mean",
        "long_short_positive_ratio",
    ]
    print(summary_df[cols].sort_values(["source", "factor_name", "horizon"]).to_string(index=False))
    result_path = "m_quant_joinquant_results.json"
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(all_summaries, f, ensure_ascii=False, indent=2)
    print("saved:", result_path)
