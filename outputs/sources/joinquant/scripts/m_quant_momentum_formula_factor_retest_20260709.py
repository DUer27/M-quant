# M-quant JoinQuant momentum factor retest: MACD/KDJ
# Policy: only real JoinQuant OHLCV; MACD/KDJ are formula rebuilds from close/high/low.

import json
import math
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


def clip01(series):
    return series.clip(0, 1).fillna(0.5)


def corr(a, b, method="pearson"):
    pair = pd.DataFrame({"a": a, "b": b}).replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < 5 or pair["a"].nunique() < 2 or pair["b"].nunique() < 2:
        return np.nan
    return pair["a"].corr(pair["b"], method=method)


def evaluate_factor_table(table, factor_col, direction, note):
    records = []
    for horizon in HORIZONS:
        ret_col = "future_return_%d" % horizon
        daily = []
        for day, part in table.groupby("date"):
            part = part[["code", factor_col, ret_col]].replace([np.inf, -np.inf], np.nan).dropna().drop_duplicates("code")
            if len(part) < MIN_CROSS_SECTION:
                continue
            signal = part[factor_col].copy()
            if direction == "negative":
                signal = -signal
            part["_signal"] = signal
            part["_group"] = pd.qcut(part["_signal"].rank(method="first"), QUANTILES, labels=False, duplicates="drop")
            if part["_group"].nunique() < QUANTILES:
                continue
            part["_group"] = part["_group"].astype(int) + 1
            group_ret = part.groupby("_group")[ret_col].mean()
            daily.append({
                "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
                "ic": corr(part["_signal"], part[ret_col], "pearson"),
                "rank_ic": corr(part["_signal"].rank(), part[ret_col].rank(), "pearson"),
                "long_short": float(group_ret.loc[QUANTILES] - group_ret.loc[1]),
                "coverage": int(len(part)),
            })
        if not daily:
            continue
        daily = pd.DataFrame(daily)
        rank_ic_series = daily["rank_ic"].dropna()
        rank_ic_mean = rank_ic_series.mean()
        rank_ic_std = rank_ic_series.std(ddof=1)
        rank_ic_t = np.nan
        if pd.notna(rank_ic_std) and rank_ic_std > 0 and len(rank_ic_series) > 1:
            rank_ic_t = rank_ic_mean / rank_ic_std * math.sqrt(len(rank_ic_series))
        records.append({
            "source": "joinquant_momentum_formula_retest_20260709",
            "factor_name": factor_col,
            "factor_variant": factor_col + "_ohlcv_formula",
            "horizon": int(horizon),
            "direction": direction,
            "sample_dates": int(daily["date"].nunique()),
            "coverage_mean": float(daily["coverage"].mean()),
            "ic_mean": None if pd.isna(daily["ic"].dropna().mean()) else float(daily["ic"].dropna().mean()),
            "rank_ic_mean": None if pd.isna(rank_ic_mean) else float(rank_ic_mean),
            "rank_ic_t": None if pd.isna(rank_ic_t) else float(rank_ic_t),
            "rank_ic_positive_ratio": float((rank_ic_series > 0).mean()) if len(rank_ic_series) else None,
            "long_short_mean": float(daily["long_short"].mean()),
            "long_short_positive_ratio": float((daily["long_short"] > 0).mean()),
            "note": note,
        })
    return records


def build_factor_table():
    all_days = pd.to_datetime(get_trade_days(start_date=FACTOR_START, end_date=END_LIMIT))
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
    price = get_price(securities, start_date=PRICE_START, end_date=latest_trade_day.strftime("%Y-%m-%d"), frequency="daily", fields=["open", "high", "low", "close", "volume", "money"], panel=False, fq="pre")
    price = normalize_price_frame(price)
    if price.empty:
        raise ValueError("get_price 返回空数据")
    price = price.sort_values(["code", "date"]).copy()
    group = price.groupby("code", group_keys=False)
    price["ema12"] = group["close"].transform(lambda s: s.ewm(span=12, adjust=False, min_periods=12).mean())
    price["ema26"] = group["close"].transform(lambda s: s.ewm(span=26, adjust=False, min_periods=26).mean())
    price["diff"] = price["ema12"] - price["ema26"]
    price["dea"] = price.groupby("code")["diff"].transform(lambda s: s.ewm(span=9, adjust=False, min_periods=9).mean())
    price["macd_hist"] = 2 * (price["diff"] - price["dea"])
    price["macd_hist_delta"] = price.groupby("code")["macd_hist"].diff()
    low9 = group["low"].rolling(9, min_periods=9).min().reset_index(level=0, drop=True)
    high9 = group["high"].rolling(9, min_periods=9).max().reset_index(level=0, drop=True)
    price["rsv"] = (price["close"] - low9) / (high9 - low9).replace(0, np.nan) * 100
    price["kdj_k"] = price.groupby("code")["rsv"].transform(lambda s: s.ewm(alpha=1.0/3.0, adjust=False, min_periods=3).mean())
    price["kdj_d"] = price.groupby("code")["kdj_k"].transform(lambda s: s.ewm(alpha=1.0/3.0, adjust=False, min_periods=3).mean())
    price["kdj_j"] = 3 * price["kdj_k"] - 2 * price["kdj_d"]
    for horizon in HORIZONS:
        price["future_return_%d" % horizon] = group["close"].shift(-horizon) / price["close"] - 1
    rows = []
    for day, universe in universe_by_date.items():
        part = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        if len(part) < MIN_CROSS_SECTION:
            continue
        macd_acceleration = clip01(
            0.34 * rank01(part["macd_hist"], True)
            + 0.26 * rank01(part["macd_hist_delta"], True)
            + 0.20 * (part["diff"] > part["dea"]).astype(float)
            + 0.20 * (part["diff"] > 0).astype(float)
        )
        j_moderate = clip01(1 - (part["kdj_j"] - 65).abs() / 85)
        kdj_momentum = clip01(
            0.34 * rank01(part["kdj_k"] - part["kdj_d"], True)
            + 0.24 * rank01(part["kdj_j"], True)
            + 0.22 * j_moderate
            + 0.20 * (part["kdj_k"] > part["kdj_d"]).astype(float)
        )
        out = part[["date", "code"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["macd_acceleration"] = macd_acceleration
        out["kdj_momentum"] = kdj_momentum
        rows.append(out)
    if not rows:
        raise ValueError("未形成动能因子表")
    return pd.concat(rows, ignore_index=True), {"index_code": INDEX_CODE, "price_start": PRICE_START, "factor_start": FACTOR_START, "end_limit": END_LIMIT, "test_dates": int(len(test_days)), "unique_securities": int(len(securities))}


def run():
    table, config = build_factor_table()
    records = []
    records.extend(evaluate_factor_table(table, "macd_acceleration", "positive", "真实 JoinQuant OHLCV 按标准EMA计算MACD代理版；非 Yiwan 原字段。"))
    records.extend(evaluate_factor_table(table, "kdj_momentum", "positive", "真实 JoinQuant OHLCV 按9日RSV与K/D/J递推计算KDJ代理版；非 Yiwan 原字段。"))
    output = {"result_type":"factor_backtest_pack", "source":"joinquant_momentum_formula_retest_20260709", "data_policy":"真实 JoinQuant OHLCV公式重建；未生成任何虚构绩效。", "config":config, "sample":{"factor_rows":int(table.shape[0]), "records":int(len(records))}, "records":records}
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output

result_json = run()
