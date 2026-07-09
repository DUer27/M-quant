# M-quant JoinQuant strategy backtest: 主力资金广度K线确认策略 v0
# Policy: only uses JoinQuant research-environment money_flow/OHLCV/valuation data.
# No fabricated metrics. Yiwan-specific dark-pool fields are not recreated.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = "money_flow_kline_confirmation_v0"
STRATEGY_NAME = "主力资金广度K线确认策略 v0"
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
    "main_force_alignment": 0.25,
    "capital_source_count": 0.20,
    "capital_follow_signal": 0.20,
    "institutional_contra_divergence": 0.15,
    "kline_event_score": 0.10,
    "active_large_order_accumulation": 0.10,
    "capital_overheat_risk": -0.20,
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

        day_range = (part["high"] - part["low"]).replace(0, np.nan)
        signed_return = (part["close"] - part["open"]) / part["open"].replace(0, np.nan)
        body_ratio = ((part["close"] - part["open"]).abs() / day_range).clip(0, 1).fillna(0)
        upper_ratio = ((part["high"] - np.maximum(part["open"], part["close"])) / day_range).clip(0, 1).fillna(0)
        lower_ratio = ((np.minimum(part["open"], part["close"]) - part["low"]) / day_range).clip(0, 1).fillna(0)
        close_position = ((part["close"] - part["low"]) / day_range).clip(0, 1).fillna(0.5)
        kline_event_score = pd.Series(0.0, index=part.index)
        kline_event_score += ((part["close"] > part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * 2
        kline_event_score += ((part["close"] < part["open"]) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * -2
        kline_event_score += ((signed_return >= 0.05) & (body_ratio >= 0.65)).astype(float) * 2
        kline_event_score += ((signed_return <= -0.05) & (body_ratio >= 0.65)).astype(float) * -2
        kline_event_score += ((lower_ratio >= 0.55) & (upper_ratio <= 0.18) & (body_ratio <= 0.35) & (close_position >= 0.55)).astype(float) * 2
        kline_event_score += ((upper_ratio >= 0.55) & (lower_ratio <= 0.18) & (body_ratio <= 0.35) & (close_position < 0.55)).astype(float) * -2
        institutional_contra_divergence = (
            0.40 * rank01(part["main_pct_5d"], True)
            + 0.25 * rank01(-part["net_pct_s"], True)
            + 0.20 * rank01(part["net_pct_xl"], True)
            + 0.15 * (part["net_pct_main"] > 0).astype(float)
        ).clip(0, 1)
        capital_source_count = (
            (part["net_pct_main"] > 0).astype(int)
            + (part["net_pct_xl"] > 0).astype(int)
            + (part["net_pct_l"] > 0).astype(int)
            + (part["main_pct_5d"] > 0).astype(int)
        )

        out = part[["date", "code", "close"] + ["future_return_%d" % h for h in HORIZONS]].copy()
        out["capital_follow_signal"] = capital_follow_signal
        out["active_large_order_accumulation"] = active_large_order_accumulation
        out["main_force_alignment"] = main_force_alignment
        out["capital_persistence_5d"] = capital_persistence_5d
        out["capital_overheat_risk"] = capital_overheat_risk
        out["kline_event_score"] = kline_event_score
        out["institutional_contra_divergence"] = institutional_contra_divergence
        out["capital_source_count"] = capital_source_count
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
            (frame["main_force_alignment"] >= 0.55)
            & (frame["capital_source_count"] >= 2)
            & (frame["capital_follow_signal"] >= 0.55)
            & (frame["capital_overheat_risk"] <= 0.72)
            & (frame["kline_event_score"] >= 0)
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
            "source": "joinquant_money_flow_money_flow_kline_confirmation_v0",
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
        "main_force_alignment",
        "capital_source_count",
        "capital_follow_signal",
        "institutional_contra_divergence",
        "kline_event_score",
        "capital_overheat_risk",
    ]
    preview = candidates[preview_cols].head(50).copy() if not candidates.empty else pd.DataFrame(columns=preview_cols)
    if "date" in preview.columns:
        preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")
    output = {
        "result_type": "strategy_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_money_flow_money_flow_kline_confirmation_v0",
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



# --- M-quant trading net-value simulation package ---
# 口径：复用上方同一套真实 JoinQuant 因子和候选池逻辑，按5个交易日等权调仓。
# 输出：事件回测 + 未分层交易净值 + 高/中/低波动 + 大/中/小市值 + 9个交叉层。

TRADING_REBALANCE_DAYS = 5
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002
TRADING_TOP_N = TOP_N
TRADING_SOURCE = 'joinquant_money_flow_kline_confirmation_v0_trading_simulation_v1'


def mq_normalize_index_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns:
        df = df.reset_index()
        if "index" in df.columns and "time" not in df.columns:
            df = df.rename(columns={"index": "time"})
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()
    return df[["date", "close"]].dropna().sort_values("date")


def mq_build_base_factor_table():
    try:
        built = build_factor_table()
    except NameError:
        built = build_historical_factor_table()
    if isinstance(built, tuple):
        return built[0], built[1] if len(built) > 1 and isinstance(built[1], dict) else {}
    return built, {}


def mq_build_market_regimes():
    index_price = get_price(
        "000300.XSHG",
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = mq_normalize_index_price_frame(index_price)
    if index_price.empty:
        return pd.DataFrame(columns=["date", "market_vol_20d", "market_regime", "market_regime_name"])
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


def mq_build_market_cap_buckets(factor_table):
    rows = []
    for day, frame in factor_table.groupby("date"):
        codes = sorted(frame["code"].dropna().unique().tolist())
        if len(codes) < MIN_CROSS_SECTION:
            continue
        fundamentals = get_fundamentals(
            query(valuation.code, valuation.market_cap).filter(valuation.code.in_(codes)),
            date=pd.Timestamp(day).strftime("%Y-%m-%d"),
        )
        if fundamentals is None or fundamentals.empty:
            continue
        cap = fundamentals[["code", "market_cap"]].dropna().copy()
        if len(cap) < MIN_CROSS_SECTION:
            continue
        cap["date"] = pd.Timestamp(day).normalize()
        cap["market_cap_rank_pct"] = cap["market_cap"].rank(pct=True, method="average")
        cap["market_cap_bucket"] = "mid_cap"
        cap.loc[cap["market_cap_rank_pct"] >= 0.67, "market_cap_bucket"] = "large_cap"
        cap.loc[cap["market_cap_rank_pct"] <= 0.33, "market_cap_bucket"] = "small_cap"
        cap["market_cap_bucket_name"] = cap["market_cap_bucket"].map({
            "large_cap": "大市值",
            "mid_cap": "中市值",
            "small_cap": "小市值",
        })
        rows.append(cap[["date", "code", "market_cap", "market_cap_rank_pct", "market_cap_bucket", "market_cap_bucket_name"]])
    if not rows:
        return pd.DataFrame(columns=["date", "code", "market_cap", "market_cap_bucket", "market_cap_bucket_name"])
    return pd.concat(rows, ignore_index=True)


def mq_max_drawdown(values):
    if not values:
        return None
    peak = values[0]
    max_dd = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            max_dd = min(max_dd, value / peak - 1)
    return float(max_dd)


def mq_simulate_portfolio(candidates, label, layer_meta=None):
    layer_meta = layer_meta or {}
    if candidates is None or candidates.empty:
        return None
    if "future_return_5" not in candidates.columns:
        return None

    nav = 1.0
    previous_weights = {}
    period_returns = []
    gross_returns = []
    turnover_values = []
    curve = []
    sample_trades = 0

    for day, frame in candidates.sort_values(["date", "strategy_score"], ascending=[True, False]).groupby("date"):
        picked = frame.dropna(subset=["future_return_5"]).sort_values("strategy_score", ascending=False).head(TRADING_TOP_N).copy()
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
        "strategy_id": "money_flow_kline_confirmation_v0",
        "strategy_name": "主力资金广度K线确认策略 v0",
        "horizon": "5日调仓交易",
        "layer": label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(sample_trades),
        "strategy_return": float(nav - 1),
        "strategy_annual_return": annual_return,
        "annual_return": annual_return,
        "final_net_value": float(nav),
        "max_drawdown": mq_max_drawdown([item["net_value"] for item in curve]),
        "sharpe": sharpe,
        "daily_win_rate": float(np.mean([ret > 0 for ret in period_returns])),
        "period_mean_return": float(np.mean(period_returns)),
        "gross_mean_return": float(np.mean(gross_returns)),
        "avg_turnover": float(np.mean(turnover_values)),
        "total_turnover": float(np.sum(turnover_values)),
        "cost_rate": TRADING_COST_RATE,
        "slippage_rate": TRADING_SLIPPAGE_RATE,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "source": TRADING_SOURCE,
        "data_policy": "真实 JoinQuant 数据生成候选池；5日等权调仓净值由真实未来5日收益扣交易成本和滑点计算；未生成任何虚构绩效。",
        "net_value_curve": curve[-80:],
    }
    record.update(layer_meta)
    return record


def mq_trading_records(factor_table, candidates):
    records = []
    base = mq_simulate_portfolio(candidates, "未分层")
    if base:
        records.append(base)

    regimes = mq_build_market_regimes()
    caps = mq_build_market_cap_buckets(factor_table)
    layered = candidates.copy()
    if not regimes.empty:
        layered = layered.merge(regimes, on="date", how="left")
    if not caps.empty:
        layered = layered.merge(caps, on=["date", "code"], how="left")

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

    if "market_regime" in layered.columns:
        for regime_id, regime_name in regime_order:
            part = layered[layered["market_regime"] == regime_id].copy()
            item = mq_simulate_portfolio(part, regime_name, {
                "market_regime": regime_id,
                "market_regime_name": regime_name,
                "market_vol_mean": None if part.empty or part["market_vol_20d"].dropna().empty else float(part["market_vol_20d"].mean()),
            })
            if item:
                records.append(item)

    if "market_cap_bucket" in layered.columns:
        for bucket_id, bucket_name in bucket_order:
            part = layered[layered["market_cap_bucket"] == bucket_id].copy()
            item = mq_simulate_portfolio(part, bucket_name, {
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": bucket_name,
                "market_cap_mean": None if part.empty or part["market_cap"].dropna().empty else float(part["market_cap"].mean()),
            })
            if item:
                records.append(item)

    if "market_regime" in layered.columns and "market_cap_bucket" in layered.columns:
        for regime_id, regime_name in regime_order:
            for bucket_id, bucket_name in bucket_order:
                part = layered[(layered["market_regime"] == regime_id) & (layered["market_cap_bucket"] == bucket_id)].copy()
                item = mq_simulate_portfolio(part, "%s/%s" % (regime_name, bucket_name), {
                    "market_regime": regime_id,
                    "market_regime_name": regime_name,
                    "market_cap_bucket": bucket_id,
                    "market_cap_bucket_name": bucket_name,
                    "market_vol_mean": None if part.empty or part["market_vol_20d"].dropna().empty else float(part["market_vol_20d"].mean()),
                    "market_cap_mean": None if part.empty or part["market_cap"].dropna().empty else float(part["market_cap"].mean()),
                })
                if item:
                    records.append(item)

    return records


def run_m_quant_trading_package():
    factor_table, base_config = mq_build_base_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    event_summary = summarize_strategy(candidates)
    trading = mq_trading_records(factor_table, candidates)
    records = []
    records.extend(event_summary)
    records.extend(trading)
    output = {
        "result_type": "strategy_trading_package",
        "strategy_id": "money_flow_kline_confirmation_v0",
        "strategy_name": "主力资金广度K线确认策略 v0",
        "source": TRADING_SOURCE,
        "data_policy": "真实 JoinQuant 数据；同一候选池同时输出事件收益和5日调仓交易净值；含未分层、市值分层、波动分层、波动×市值交叉层。",
        "config": {
            "rebalance_days": TRADING_REBALANCE_DAYS,
            "top_n": TRADING_TOP_N,
            "cost_rate": TRADING_COST_RATE,
            "slippage_rate": TRADING_SLIPPAGE_RATE,
            "base_config": base_config,
        },
        "sample": {
            "factor_rows": int(factor_table.shape[0]),
            "candidate_rows": int(candidates.shape[0]) if candidates is not None else 0,
            "test_dates": int(factor_table["date"].nunique()),
            "selected_dates": int(candidates["date"].nunique()) if candidates is not None and not candidates.empty else 0,
            "records": int(len(records)),
        },
        "diagnostics_tail": diagnostics[-20:],
        "records": records,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run_m_quant_trading_package()
