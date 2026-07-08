# M-quant JoinQuant key factor mining v1
# Policy: only uses JoinQuant official research-environment data; no fabricated metrics.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Run the cell.
# 3. Copy the final JSON output or saved m_quant_key_factor_mining_v1.json back to M-quant.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
QUANTILES = 5


FACTOR_META = {
    "valuation_safety_jq": {
        "display_name": "估值安全垫_JQ",
        "direction": "positive",
        "note": "低PE、低PB、低PS、低换手且市值不过小的综合安全垫，全部来自 JoinQuant valuation。",
    },
    "quality_growth_jq": {
        "display_name": "质量成长_JQ",
        "direction": "positive",
        "note": "ROE、ROA、毛利率、净利率、营收同比、净利同比的综合质量成长分，来自 JoinQuant indicator。",
    },
    "profit_growth_jq": {
        "display_name": "利润增长_JQ",
        "direction": "positive",
        "note": "净利润同比、营收同比、EPS和ROE共同确认盈利扩张，来自 JoinQuant indicator。",
    },
    "liquidity_quality_jq": {
        "display_name": "流动性质量_JQ",
        "direction": "positive",
        "note": "成交额水平、成交额稳定性、温和换手和非极端放量的综合交易质量，来自 JoinQuant OHLCV/valuation。",
    },
    "low_volatility_quality_jq": {
        "display_name": "低波动质量_JQ",
        "direction": "positive",
        "note": "低20/60日波动、低回撤、走势稳定和流动性共同形成的防守质量，来自 JoinQuant OHLCV。",
    },
    "market_sensitivity_risk_jq": {
        "display_name": "市场敏感风险_JQ",
        "direction": "negative",
        "note": "高Beta、高波动和高回撤代表市场敏感风险，来自个股收益对沪深300收益的滚动估计。",
    },
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


def normalize_index_frame(price):
    df = normalize_price_frame(price)
    if df.empty:
        return df
    return df[["date", "close"]].dropna().sort_values("date")


def corr(a, b, method="pearson"):
    pair = pd.DataFrame({"a": a, "b": b}).replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < 5 or pair["a"].nunique() < 2 or pair["b"].nunique() < 2:
        return np.nan
    return pair["a"].corr(pair["b"], method=method)


def rank01(series, higher_is_better=True):
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def bounded_peak_score(series, target, width):
    s = pd.to_numeric(series, errors="coerce")
    return (1 - (s - target).abs() / width).clip(0, 1).fillna(0.5)


def max_drawdown(close):
    rolling_max = close.rolling(60, min_periods=20).max()
    drawdown = close / rolling_max.replace(0, np.nan) - 1
    return drawdown.rolling(60, min_periods=20).min()


def rolling_beta(stock_return, index_return):
    cov = stock_return.rolling(60, min_periods=40).cov(index_return)
    var = index_return.rolling(60, min_periods=40).var()
    return cov / var.replace(0, np.nan)


def safe_qcut_groups(signal, quantiles):
    return pd.qcut(signal.rank(method="first"), quantiles, labels=False, duplicates="drop")


def evaluate_factor_table(table, factor_col, direction, horizons, source):
    daily_records = []
    for horizon in horizons:
        ret_col = "future_return_%d" % horizon
        if ret_col not in table.columns:
            continue

        for day, part in table.groupby("date"):
            part = part[["code", factor_col, ret_col]].replace([np.inf, -np.inf], np.nan).dropna()
            part = part.drop_duplicates("code")
            if len(part) < MIN_CROSS_SECTION:
                continue

            signal = part[factor_col].copy()
            if direction == "negative":
                signal = -signal
            part["_signal"] = signal
            part["_group"] = safe_qcut_groups(part["_signal"], QUANTILES)
            if part["_group"].nunique() < QUANTILES:
                continue
            part["_group"] = part["_group"].astype(int) + 1

            group_ret = part.groupby("_group")[ret_col].mean()
            long_short = group_ret.loc[QUANTILES] - group_ret.loc[1]
            rank_ic = corr(part["_signal"].rank(), part[ret_col].rank(), "pearson")
            ic = corr(part["_signal"], part[ret_col], "pearson")
            daily_records.append({
                "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
                "factor_name": factor_col,
                "horizon": horizon,
                "direction": direction,
                "ic": float(ic) if pd.notna(ic) else None,
                "rank_ic": float(rank_ic) if pd.notna(rank_ic) else None,
                "long_short": float(long_short),
                "coverage": int(len(part)),
            })

    if not daily_records:
        return []

    daily = pd.DataFrame(daily_records)
    summaries = []
    for (factor_name, horizon), part in daily.groupby(["factor_name", "horizon"]):
        rank_ic_series = part["rank_ic"].dropna()
        rank_ic_mean = rank_ic_series.mean()
        rank_ic_std = rank_ic_series.std(ddof=1)
        rank_ic_t = np.nan
        if pd.notna(rank_ic_std) and rank_ic_std > 0 and len(rank_ic_series) > 1:
            rank_ic_t = rank_ic_mean / rank_ic_std * math.sqrt(len(rank_ic_series))
        ic_mean = part["ic"].dropna().mean()
        long_short_mean = part["long_short"].mean()
        meta = FACTOR_META.get(factor_name, {})
        summaries.append({
            "source": source,
            "factor_name": factor_name,
            "factor_variant": factor_name,
            "factor_display_name": meta.get("display_name", factor_name),
            "horizon": int(horizon),
            "direction": meta.get("direction", direction),
            "sample_dates": int(part["date"].nunique()),
            "coverage_mean": float(part["coverage"].mean()),
            "ic_mean": None if pd.isna(ic_mean) else float(ic_mean),
            "rank_ic_mean": None if pd.isna(rank_ic_mean) else float(rank_ic_mean),
            "rank_ic_t": None if pd.isna(rank_ic_t) else float(rank_ic_t),
            "rank_ic_positive_ratio": float((rank_ic_series > 0).mean()) if len(rank_ic_series) else None,
            "long_short_mean": float(long_short_mean),
            "long_short_positive_ratio": float((part["long_short"] > 0).mean()),
            "note": meta.get("note", "JoinQuant real data factor test."),
        })
    return summaries


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

    index_price = get_price(
        INDEX_CODE,
        start_date=PRICE_START,
        end_date=latest_trade_day.strftime("%Y-%m-%d"),
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = normalize_index_frame(index_price)
    if index_price.empty:
        raise ValueError("指数行情为空，无法计算 Beta。")

    index_price["index_return"] = index_price["close"].pct_change()
    price = price.sort_values(["code", "date"]).copy()
    price = price.merge(index_price[["date", "index_return"]], on="date", how="left")
    group = price.groupby("code", group_keys=False)
    price["stock_return"] = group["close"].pct_change()
    price["money_ma20"] = group["money"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["money_ma60"] = group["money"].rolling(60, min_periods=20).mean().reset_index(level=0, drop=True)
    price["money_std60"] = group["money"].rolling(60, min_periods=20).std().reset_index(level=0, drop=True)
    price["money_stability"] = 1 / (1 + price["money_std60"] / price["money_ma60"].replace(0, np.nan))
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_ratio"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)
    price["volatility_20d"] = group["stock_return"].rolling(20, min_periods=15).std().reset_index(level=0, drop=True) * math.sqrt(252)
    price["volatility_60d"] = group["stock_return"].rolling(60, min_periods=40).std().reset_index(level=0, drop=True) * math.sqrt(252)
    price["max_drawdown_60d"] = group["close"].transform(max_drawdown)
    price["beta_60d"] = group.apply(lambda g: rolling_beta(g["stock_return"], g["index_return"])).reset_index(level=0, drop=True)

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
                valuation.pe_ratio,
                valuation.pb_ratio,
                valuation.ps_ratio,
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
        f = f.rename(columns={"code": "code"})
        rows.append(f)
    if not rows:
        raise ValueError("get_fundamentals 未返回可用估值/财务数据。")
    return pd.concat(rows, ignore_index=True)


def build_key_factor_table():
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

        positive_pe = part["pe_ratio"].where(part["pe_ratio"] > 0)
        positive_pb = part["pb_ratio"].where(part["pb_ratio"] > 0)
        positive_ps = part["ps_ratio"].where(part["ps_ratio"] > 0)

        valuation_safety = (
            0.28 * rank01(positive_pe, higher_is_better=False)
            + 0.25 * rank01(positive_pb, higher_is_better=False)
            + 0.18 * rank01(positive_ps, higher_is_better=False)
            + 0.14 * rank01(part["market_cap"], higher_is_better=True)
            + 0.15 * bounded_peak_score(part["turnover_ratio"], 1.2, 2.8)
        ).clip(0, 1)

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

        low_volatility_quality = (
            0.30 * rank01(part["volatility_20d"], False)
            + 0.25 * rank01(part["volatility_60d"], False)
            + 0.22 * rank01(part["max_drawdown_60d"].abs(), False)
            + 0.13 * rank01(part["money_stability"], True)
            + 0.10 * rank01(np.log1p(part["money_ma20"]), True)
        ).clip(0, 1)

        market_sensitivity_risk = (
            0.40 * rank01(part["beta_60d"], True)
            + 0.24 * rank01(part["volatility_60d"], True)
            + 0.20 * rank01(part["max_drawdown_60d"].abs(), True)
            + 0.16 * rank01(part["turnover_ratio"], True)
        ).clip(0, 1)

        out_cols = ["date", "code"] + ["future_return_%d" % h for h in HORIZONS]
        out = part[out_cols].copy()
        out["valuation_safety_jq"] = valuation_safety
        out["quality_growth_jq"] = quality_growth
        out["profit_growth_jq"] = profit_growth
        out["liquidity_quality_jq"] = liquidity_quality
        out["low_volatility_quality_jq"] = low_volatility_quality
        out["market_sensitivity_risk_jq"] = market_sensitivity_risk
        rows.append(out)

    if not rows:
        raise ValueError("未形成可评估因子表。")
    factor_table = pd.concat(rows, ignore_index=True)
    return factor_table, {
        "index_code": INDEX_CODE,
        "price_start": PRICE_START,
        "factor_start": FACTOR_START,
        "end_limit": END_LIMIT,
        "horizons": HORIZONS,
        "factor_day_step": FACTOR_DAY_STEP,
        "test_dates": int(len(test_days)),
        "unique_securities": int(len(securities)),
    }


def run():
    factor_table, config = build_key_factor_table()
    summaries = []
    for factor_name, meta in FACTOR_META.items():
        summaries.extend(
            evaluate_factor_table(
                factor_table,
                factor_name,
                meta["direction"],
                HORIZONS,
                "joinquant_key_factor_mining_v1",
            )
        )

    preview = factor_table.head(30).copy()
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")

    output = {
        "result_type": "factor_research_pack",
        "source": "joinquant_key_factor_mining_v1",
        "data_policy": "真实 JoinQuant OHLCV、valuation 和 indicator 数据；未生成任何虚构绩效。",
        "config": config,
        "sample": {
            "factor_rows": int(factor_table.shape[0]),
            "sample_dates": int(factor_table["date"].nunique()),
            "factor_count": int(len(FACTOR_META)),
        },
        "summary": summaries,
        "factor_preview": preview.to_dict(orient="records"),
    }
    with open("m_quant_key_factor_mining_v1.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run()
