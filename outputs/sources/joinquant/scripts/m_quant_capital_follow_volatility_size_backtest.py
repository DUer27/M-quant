# M-quant JoinQuant strategy backtest: 资金跟随策略 v0
# Policy: only uses JoinQuant research-environment money_flow/OHLCV/valuation data.
# No fabricated metrics. Yiwan-specific dark-pool fields are not recreated.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "capital_follow_v0"
STRATEGY_NAME = "资金跟随策略 v0"
INDEX_CODE = "000300.XSHG"
PRICE_START = "2022-12-01"
FACTOR_START = "2024-01-01"
END_LIMIT = "2026-07-07"
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
TOP_N = 30
MONEY_FLOW_BATCH = 80

FACTOR_WEIGHTS = {
    "capital_follow_signal": 0.40,
    "active_large_order_accumulation": 0.25,
    "main_force_alignment": 0.20,
    "capital_persistence_5d": 0.15,
    "capital_overheat_risk": -0.25,
}


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
    price["prev_close"] = group["close"].shift(1)
    price["change_pct"] = (price["close"] / price["prev_close"] - 1) * 100
    price["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_ratio"] = price["volume"] / price["volume_ma20"].replace(0, np.nan)
    price["money_ma20"] = group["money"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)

    for horizon in HORIZONS:
        price["future_return_%d" % horizon] = group["close"].shift(-horizon) / price["close"] - 1

    return price, universe_by_date, test_days, securities


def fetch_money_flow(securities):
    rows = []
    for start in range(0, len(securities), MONEY_FLOW_BATCH):
        batch = securities[start:start + MONEY_FLOW_BATCH]
        flow = get_money_flow(batch, start_date=PRICE_START, end_date=END_LIMIT)
        if flow is None or flow.empty:
            continue
        rows.append(flow.copy())
    if not rows:
        raise ValueError("get_money_flow 未返回可用资金流数据。")

    df = pd.concat(rows, ignore_index=True)
    if "sec_code" in df.columns and "code" not in df.columns:
        df = df.rename(columns={"sec_code": "code"})
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    df = df.sort_values(["code", "date"]).copy()
    for field in ["net_pct_main", "net_pct_xl", "net_pct_l", "net_pct_m", "net_pct_s"]:
        if field not in df.columns:
            df[field] = np.nan
    for field in ["net_amount_main", "net_amount_xl", "net_amount_l", "net_amount_m", "net_amount_s"]:
        if field not in df.columns:
            df[field] = np.nan

    group = df.groupby("code", group_keys=False)
    df["main_pct_2d"] = group["net_pct_main"].rolling(2, min_periods=2).mean().reset_index(level=0, drop=True)
    df["main_pct_5d"] = group["net_pct_main"].rolling(5, min_periods=3).mean().reset_index(level=0, drop=True)
    df["xl_pct_5d"] = group["net_pct_xl"].rolling(5, min_periods=3).mean().reset_index(level=0, drop=True)
    df["main_amount_5d"] = group["net_amount_main"].rolling(5, min_periods=3).sum().reset_index(level=0, drop=True)
    df["main_positive_5d"] = group["net_pct_main"].transform(lambda s: (s > 0).rolling(5, min_periods=3).mean())
    return df


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
    flow = fetch_money_flow(securities)
    fundamentals = fetch_fundamentals_for_days(universe_by_date)
    rows = []

    for day, universe in universe_by_date.items():
        p = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        f = flow[(flow["date"] == day) & (flow["code"].isin(universe))].copy()
        v = fundamentals[fundamentals["date"] == day].copy()
        part = p.merge(f, on=["date", "code"], how="left", suffixes=("", "_flow"))
        part = part.merge(v, on=["date", "code"], how="left")
        part = part.replace([np.inf, -np.inf], np.nan)
        if len(part) < MIN_CROSS_SECTION:
            continue

        main_strength = (
            0.34 * rank01(part["net_pct_main"], True)
            + 0.22 * rank01(part["main_pct_5d"], True)
            + 0.18 * rank01(part["net_amount_main"], True)
            + 0.16 * rank01(part["main_amount_5d"], True)
            + 0.10 * rank01(part["main_positive_5d"], True)
        ).clip(0, 1)

        active_large_order_accumulation = (
            0.38 * rank01(part["net_pct_xl"], True)
            + 0.24 * rank01(part["xl_pct_5d"], True)
            + 0.20 * rank01(part["net_amount_xl"], True)
            + 0.18 * rank01(part["net_pct_l"], True)
        ).clip(0, 1)

        main_force_alignment = (
            0.36 * (part["net_pct_main"] > 0).astype(float)
            + 0.22 * (part["net_pct_xl"] > 0).astype(float)
            + 0.18 * (part["net_pct_l"] > 0).astype(float)
            + 0.14 * rank01(part["main_pct_2d"], True)
            + 0.10 * rank01(-part["net_pct_s"], True)
        ).clip(0, 1)

        capital_persistence_5d = (
            0.45 * rank01(part["main_pct_5d"], True)
            + 0.35 * rank01(part["main_positive_5d"], True)
            + 0.20 * rank01(part["main_amount_5d"], True)
        ).clip(0, 1)

        overheat_from_price = rank01(part["change_pct"], True)
        overheat_from_volume = rank01(part["volume_ratio"], True)
        overheat_from_turnover = rank01(part["turnover_ratio"], True)
        extreme_flow = rank01(part["net_pct_main"].abs(), True)
        capital_overheat_risk = (
            0.28 * overheat_from_price
            + 0.24 * overheat_from_volume
            + 0.20 * overheat_from_turnover
            + 0.18 * extreme_flow
            + 0.10 * (part["change_pct"] >= 8).astype(float)
        ).clip(0, 1)

        capital_follow_signal = (
            0.38 * main_strength
            + 0.26 * active_large_order_accumulation
            + 0.20 * main_force_alignment
            + 0.16 * capital_persistence_5d
            - 0.18 * capital_overheat_risk
        ).clip(0, 1)

        out = part[["date", "code", "close"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["capital_follow_signal"] = capital_follow_signal
        out["active_large_order_accumulation"] = active_large_order_accumulation
        out["main_force_alignment"] = main_force_alignment
        out["capital_persistence_5d"] = capital_persistence_5d
        out["capital_overheat_risk"] = capital_overheat_risk
        rows.append(out)

    if not rows:
        raise ValueError("未形成可回测资金策略样本。")

    return pd.concat(rows, ignore_index=True), {
        "index_code": INDEX_CODE,
        "price_start": PRICE_START,
        "factor_start": FACTOR_START,
        "end_limit": END_LIMIT,
        "horizons": HORIZONS,
        "factor_day_step": FACTOR_DAY_STEP,
        "top_n": TOP_N,
        "factor_weights": FACTOR_WEIGHTS,
        "money_flow_fields": [
            "net_amount_main",
            "net_pct_main",
            "net_amount_xl",
            "net_pct_xl",
            "net_amount_l",
            "net_pct_l",
            "net_amount_s",
            "net_pct_s",
        ],
    }


def score_strategy(frame):
    required = list(FACTOR_WEIGHTS.keys())
    scored = frame.dropna(subset=required).copy()
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
        filtered = frame[
            (frame["capital_follow_signal"] >= 0.58)
            & (frame["active_large_order_accumulation"] >= 0.55)
            & (frame["main_force_alignment"] >= 0.50)
            & (frame["capital_overheat_risk"] <= 0.78)
        ].copy()
        scored = score_strategy(filtered)
        picked = scored.head(TOP_N).copy()
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
            "source": "joinquant_money_flow_capital_follow_v0",
            "note": "真实 JoinQuant money_flow/OHLCV/valuation 资金跟随事件回测；未复刻 Yiwan 暗盘字段；不含虚构绩效。",
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
        "capital_follow_signal",
        "active_large_order_accumulation",
        "main_force_alignment",
        "capital_persistence_5d",
        "capital_overheat_risk",
    ]
    preview = candidates[preview_cols].head(50).copy() if not candidates.empty else pd.DataFrame(columns=preview_cols)
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")
    output = {
        "result_type": "strategy_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_money_flow_capital_follow_v0",
        "data_policy": "真实 JoinQuant money_flow、OHLCV、valuation 计算；未生成任何虚构收益；未复刻 Yiwan 暗盘字段。",
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
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


REGIME_INDEX_CODE = "000300.XSHG"
REGIME_WINDOW = 20
REGIME_LOOKBACK = 252
REGIME_MIN_PERIODS = 60
LARGE_CAP_QUANTILE = 0.67
SMALL_CAP_QUANTILE = 0.33


def normalize_index_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns:
        df = df.reset_index()
        if "index" in df.columns and "time" not in df.columns:
            df = df.rename(columns={"index": "time"})
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()
    return df[["date", "close"]].dropna().sort_values("date")


def build_market_regimes():
    index_price = get_price(
        REGIME_INDEX_CODE,
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = normalize_index_price_frame(index_price)
    if index_price.empty:
        raise ValueError("市场指数 get_price 返回空数据，无法做波动率分层。")

    index_price["index_return"] = index_price["close"].pct_change()
    index_price["market_vol_20d"] = (
        index_price["index_return"].rolling(REGIME_WINDOW, min_periods=REGIME_WINDOW).std()
        * math.sqrt(252)
    )
    index_price["vol_p30"] = (
        index_price["market_vol_20d"]
        .rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS)
        .quantile(0.30)
        .shift(1)
    )
    index_price["vol_p70"] = (
        index_price["market_vol_20d"]
        .rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS)
        .quantile(0.70)
        .shift(1)
    )

    valid = index_price.dropna(subset=["market_vol_20d", "vol_p30", "vol_p70"]).copy()
    if valid.empty:
        raise ValueError("市场波动率有效样本不足，无法划分高/中/低波动。")

    valid["market_regime"] = "medium_volatility"
    valid.loc[valid["market_vol_20d"] >= valid["vol_p70"], "market_regime"] = "high_volatility"
    valid.loc[valid["market_vol_20d"] <= valid["vol_p30"], "market_regime"] = "low_volatility"
    valid["market_regime_name"] = valid["market_regime"].map({
        "high_volatility": "高波动",
        "medium_volatility": "中波动",
        "low_volatility": "低波动",
    })
    return valid[["date", "market_vol_20d", "vol_p30", "vol_p70", "market_regime", "market_regime_name"]]


def build_market_cap_buckets(factor_table):
    rows = []
    for day, frame in factor_table.groupby("date"):
        part = frame[["date", "code"]].dropna().copy()
        if len(part) < MIN_CROSS_SECTION:
            continue
        fundamentals = get_fundamentals(
            query(valuation.code, valuation.market_cap).filter(valuation.code.in_(sorted(part["code"].unique()))),
            date=pd.Timestamp(day).strftime("%Y-%m-%d"),
        )
        if fundamentals is None or fundamentals.empty:
            continue
        cap = fundamentals[["code", "market_cap"]].dropna().copy()
        cap["date"] = pd.Timestamp(day).normalize()
        if len(cap) < MIN_CROSS_SECTION:
            continue
        cap["market_cap_rank_pct"] = cap["market_cap"].rank(pct=True, method="average")
        cap["market_cap_bucket"] = "mid_cap"
        cap.loc[cap["market_cap_rank_pct"] >= LARGE_CAP_QUANTILE, "market_cap_bucket"] = "large_cap"
        cap.loc[cap["market_cap_rank_pct"] <= SMALL_CAP_QUANTILE, "market_cap_bucket"] = "small_cap"
        cap["market_cap_bucket_name"] = cap["market_cap_bucket"].map({
            "large_cap": "大市值",
            "mid_cap": "中市值",
            "small_cap": "小市值",
        })
        rows.append(cap[["date", "code", "market_cap", "market_cap_rank_pct", "market_cap_bucket", "market_cap_bucket_name"]])
    if not rows:
        raise ValueError("JoinQuant fundamentals 未返回足够市值数据，无法做市值分层。")
    return pd.concat(rows, ignore_index=True)


def summarize_strategy_by_regime_and_market_cap(candidates):
    summaries = []
    if candidates.empty:
        return summaries
    regime_order = [
        ("high_volatility", "高波动"),
        ("medium_volatility", "中波动"),
        ("low_volatility", "低波动"),
    ]
    bucket_order = [
        ("large_cap", "大市值"),
        ("mid_cap", "中市值"),
        ("small_cap", "小市值"),
    ]
    for regime_id, regime_name in regime_order:
        regime_candidates = candidates[candidates["market_regime"] == regime_id].copy()
        for bucket_id, bucket_name in bucket_order:
            bucket_candidates = regime_candidates[regime_candidates["market_cap_bucket"] == bucket_id].copy()
            if bucket_candidates.empty:
                continue
            for horizon in HORIZONS:
                col = "future_return_%d" % horizon
                values = bucket_candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
                daily = bucket_candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
                summaries.append({
                    "result_type": "strategy_regime_size_backtest",
                    "strategy_id": STRATEGY_ID,
                    "strategy_name": STRATEGY_NAME,
                    "horizon": horizon,
                    "market_regime": regime_id,
                    "market_regime_name": regime_name,
                    "market_cap_bucket": bucket_id,
                    "market_cap_bucket_name": bucket_name,
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
                    "market_vol_mean": None if bucket_candidates["market_vol_20d"].dropna().empty else float(bucket_candidates["market_vol_20d"].mean()),
                    "market_cap_mean": None if bucket_candidates["market_cap"].dropna().empty else float(bucket_candidates["market_cap"].mean()),
                    "source": "joinquant_money_flow_capital_follow_volatility_size_v1",
                    "note": "真实 JoinQuant money_flow/OHLCV、沪深300指数行情与 valuation.market_cap 交叉分层；未复刻 Yiwan 暗盘字段；未生成任何虚构绩效。",
                })
    return summaries


def run_regime_market_cap_cross():
    base = build_factor_table()
    if isinstance(base, tuple):
        factor_table, config = base
    else:
        factor_table = base
        config = config
    candidates, diagnostics = select_candidates(factor_table)
    market_regimes = build_market_regimes()
    market_caps = build_market_cap_buckets(factor_table)
    if candidates.empty:
        merged = candidates.copy()
    else:
        merged = candidates.merge(market_regimes, on="date", how="left")
        merged = merged.merge(market_caps, on=["date", "code"], how="left")
        merged = merged.dropna(subset=["market_regime", "market_cap_bucket"]).copy()

    summary = summarize_strategy_by_regime_and_market_cap(merged)
    cross_counts = []
    if not merged.empty:
        for (regime_id, bucket_id), part in merged.groupby(["market_regime", "market_cap_bucket"]):
            cross_counts.append({
                "market_regime": regime_id,
                "market_regime_name": str(part["market_regime_name"].dropna().iloc[0]) if not part["market_regime_name"].dropna().empty else regime_id,
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": str(part["market_cap_bucket_name"].dropna().iloc[0]) if not part["market_cap_bucket_name"].dropna().empty else bucket_id,
                "sample_dates": int(part["date"].nunique()),
                "sample_trades": int(part["code"].count()),
                "market_vol_mean": None if part["market_vol_20d"].dropna().empty else float(part["market_vol_20d"].mean()),
                "market_cap_mean": None if part["market_cap"].dropna().empty else float(part["market_cap"].mean()),
            })

    preview_cols = [
        "date",
        "code",
        "strategy_score",
        "market_regime_name",
        "market_vol_20d",
        "market_cap_bucket_name",
        "market_cap",
        "capital_follow_signal",
        "active_large_order_accumulation",
        "main_force_alignment",
        "capital_persistence_5d",
        "capital_overheat_risk",
    ]
    preview = merged[preview_cols].head(50).copy() if not merged.empty else pd.DataFrame(columns=preview_cols)
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")

    output = {
        "result_type": "strategy_regime_size_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_money_flow_capital_follow_volatility_size_v1",
        "data_policy": "真实 JoinQuant money_flow、OHLCV、沪深300指数行情与 valuation.market_cap 计算；未生成任何虚构收益；未复刻 Yiwan 暗盘字段。",
        "config": {
            **config,
            "regime_index_code": REGIME_INDEX_CODE,
            "regime_window": REGIME_WINDOW,
            "regime_lookback": REGIME_LOOKBACK,
            "high_volatility_rule": "market_vol_20d >= trailing 70% quantile",
            "low_volatility_rule": "market_vol_20d <= trailing 30% quantile",
            "large_cap_rule": "market_cap_rank_pct >= 0.67 within daily index universe",
            "small_cap_rule": "market_cap_rank_pct <= 0.33 within daily index universe",
        },
        "sample": {
            "factor_rows": int(factor_table.shape[0]),
            "candidate_rows_before_cross": int(candidates.shape[0]) if candidates is not None else 0,
            "candidate_rows_after_cross": int(merged.shape[0]) if merged is not None else 0,
            "test_dates": int(factor_table["date"].nunique()),
            "selected_dates_after_cross": int(merged["date"].nunique()) if merged is not None and not merged.empty else 0,
        },
        "cross_counts": cross_counts,
        "summary": summary,
        "diagnostics_tail": diagnostics[-20:],
        "candidate_preview": preview.to_dict(orient="records"),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run_regime_market_cap_cross()
