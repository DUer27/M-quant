# M-quant JoinQuant research: CSI500 low-crowding reversal index enhancement
# Policy: use JoinQuant research-environment data first. No fabricated metrics.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Run the cell.
# 3. Copy the printed JSON back to M-quant 回测中心 -> 结果回填.

import json
import math
import os

import numpy as np
import pandas as pd

JOINQUANT_API_READY = False
JOINQUANT_AUTH_READY = False

try:
    from jqdata import *  # type: ignore
    JOINQUANT_API_READY = True
    JOINQUANT_AUTH_READY = True
except ModuleNotFoundError:
    try:
        from jqdatasdk import (  # type: ignore
            auth,
            get_fundamentals,
            get_index_stocks,
            get_price,
            get_trade_days,
            query,
            valuation,
        )
        JOINQUANT_API_READY = True
    except ModuleNotFoundError:
        JOINQUANT_API_READY = False


def ensure_joinquant_auth():
    global JOINQUANT_AUTH_READY
    if not JOINQUANT_API_READY:
        raise RuntimeError("缺少 jqdata/jqdatasdk，无法直接拉取 JoinQuant 数据；本地合并 slice 不需要该依赖。")
    if JOINQUANT_AUTH_READY:
        return
    account = os.getenv("JQ_ACCOUNT") or os.getenv("JOINQUANT_ACCOUNT")
    password = os.getenv("JQ_PASSWORD") or os.getenv("JOINQUANT_PASSWORD")
    if not account or not password:
        raise RuntimeError("本地运行需要设置 JQ_ACCOUNT/JQ_PASSWORD 或 JOINQUANT_ACCOUNT/JOINQUANT_PASSWORD；JoinQuant 研究环境不需要这些变量。")
    auth(account, password)
    JOINQUANT_AUTH_READY = True


INDEX_CODE = "000905.XSHG"
INDEX_NAME = "中证500"
STRATEGY_ID = "csi500_low_crowding_reversal_index_enhancement_v0"
STRATEGY_NAME = "中证500低拥挤反转指数增强候选策略 v0"
SOURCE = "joinquant_csi500_low_crowding_reversal_index_enhancement_v0"

PRICE_START = "2018-01-01"
FACTOR_START = "2019-01-01"
END_LIMIT = "2026-07-15"
RUN_MODE = "full_package"
SLICE_START = ""
SLICE_END = ""
HISTORY_LOOKBACK_DAYS = 500
FUTURE_LABEL_BUFFER_DAYS = 60
PRICE_FETCH_BATCH_SIZE = 80
HORIZONS = [1, 5, 10, 20]
PRIMARY_HORIZON = 20
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 180
TOP_N = 100
TRADING_REBALANCE_DAYS_LIST = [1, 5, 10, 20]
PRIMARY_TRADING_REBALANCE_DAYS = 5
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002

FACTOR_GATE = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.015,
    "min_rank_ic_t": 2.0,
    "min_long_short": 0.0,
    "min_long_short_positive_ratio": 0.53,
}

PAPER_WATCH_GATE = {
    "min_factor_gate_pass_count": 2,
    "min_strategy_return": 0.05,
    "min_annual_return": 0.03,
    "min_active_return": 0.02,
    "min_active_sharpe": 0.35,
    "max_drawdown_floor": -0.25,
    "min_layer_count": 9,
}

FACTOR_SPECS = [
    {
        "factor": "jq_lcr_active_reversal",
        "name": "主动反转修复",
        "direction": "positive",
        "base_weight": 0.30,
        "description": "相对指数和短期跌幅后的修复倾向，避免单纯接飞刀。",
    },
    {
        "factor": "jq_lcr_low_crowding_resilience",
        "name": "低拥挤韧性",
        "direction": "positive",
        "base_weight": 0.22,
        "description": "低换手、低放量过热、低均线乖离且回撤可控。",
    },
    {
        "factor": "jq_lcr_residual_low_volatility",
        "name": "残差低波",
        "direction": "positive",
        "base_weight": 0.18,
        "description": "扣除指数 beta 后的低波动稳定性。",
    },
    {
        "factor": "jq_lcr_volume_stability",
        "name": "量能稳定",
        "direction": "positive",
        "base_weight": 0.15,
        "description": "成交额和成交量波动越平稳，可交易性越稳定。",
    },
    {
        "factor": "jq_lcr_gap_risk_control",
        "name": "跳空风险控制",
        "direction": "positive",
        "base_weight": 0.10,
        "description": "隔夜跳空风险越低越好。",
    },
    {
        "factor": "jq_lcr_short_reversal",
        "name": "短期反转",
        "direction": "positive",
        "base_weight": 0.05,
        "description": "短期弱势后的温和反转信号。",
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


def clean_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def jsonable_records(df):
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].dt.strftime("%Y-%m-%d")
    out = out.replace([np.inf, -np.inf], np.nan)
    return json.loads(out.to_json(orient="records", force_ascii=False, date_format="iso"))


def safe_div(left, right):
    return left / right.replace(0, np.nan)


def rank01(series, higher_is_better=True):
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def zscore(series):
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    if s.notna().sum() < 20:
        return pd.Series(0.0, index=series.index)
    lo, hi = s.quantile([0.01, 0.99])
    s = s.clip(lo, hi)
    std = s.std(ddof=0)
    if not std or np.isnan(std):
        return pd.Series(0.0, index=series.index)
    return ((s - s.mean()) / std).clip(-5, 5).fillna(0.0)


def date_text(value):
    return pd.Timestamp(value).strftime("%Y-%m-%d")


def configured_factor_bounds():
    start = pd.Timestamp(SLICE_START or FACTOR_START).normalize()
    end = pd.Timestamp(SLICE_END or END_LIMIT).normalize()
    if end < start:
        raise ValueError("SLICE_END 不能早于 SLICE_START。")
    return start, end


def expand_fetch_bounds(factor_start, factor_end):
    price_start = max(pd.Timestamp(PRICE_START), factor_start - pd.Timedelta(days=HISTORY_LOOKBACK_DAYS))
    price_end = min(pd.Timestamp(END_LIMIT), factor_end + pd.Timedelta(days=FUTURE_LABEL_BUFFER_DAYS))
    return price_start.normalize(), price_end.normalize()


def build_market_regime_table():
    factor_start, factor_end = configured_factor_bounds()
    fetch_start, fetch_end = expand_fetch_bounds(factor_start, factor_end)
    index_price = get_price(
        INDEX_CODE,
        start_date=date_text(fetch_start),
        end_date=date_text(fetch_end),
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = normalize_price_frame(index_price)
    if index_price.empty:
        raise ValueError("指数行情为空，无法做市场波动分层。")
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
    factor_start, factor_end = configured_factor_bounds()
    fetch_start, fetch_end = expand_fetch_bounds(factor_start, factor_end)
    all_days = pd.to_datetime(get_trade_days(start_date=date_text(fetch_start), end_date=date_text(fetch_end)))
    if len(all_days) <= max(HORIZONS) + 1:
        raise ValueError("交易日不足，无法形成未来收益标签。")
    latest_trade_day = all_days[-1]
    usable_end = all_days[-max(HORIZONS) - 1]
    candidate_days = all_days[(all_days >= factor_start) & (all_days <= factor_end) & (all_days <= usable_end)]
    test_days = candidate_days[::FACTOR_DAY_STEP]
    if len(test_days) == 0:
        raise ValueError("当前分片没有足够交易日形成未来收益标签。")

    universe_by_date = {}
    securities = set()
    for day in test_days:
        stocks = get_index_stocks(INDEX_CODE, date=day.strftime("%Y-%m-%d"))
        universe_by_date[pd.Timestamp(day).normalize()] = set(stocks)
        securities.update(stocks)
    securities = sorted(securities)

    price_frames = []
    for start in range(0, len(securities), PRICE_FETCH_BATCH_SIZE):
        batch = securities[start:start + PRICE_FETCH_BATCH_SIZE]
        batch_price = get_price(
            batch,
            start_date=date_text(fetch_start),
            end_date=latest_trade_day.strftime("%Y-%m-%d"),
            frequency="daily",
            fields=["open", "high", "low", "close", "volume", "money"],
            panel=False,
            fq="pre",
        )
        batch_price = normalize_price_frame(batch_price)
        if not batch_price.empty:
            price_frames.append(batch_price)
    price = pd.concat(price_frames, ignore_index=True) if price_frames else pd.DataFrame()
    if price.empty:
        raise ValueError("get_price 返回空数据。")
    price = price.sort_values(["code", "date"]).copy()
    group = price.groupby("code", group_keys=False)
    price["ret_1"] = group["close"].pct_change()
    for window in [5, 10, 20, 60, 120]:
        price["ret_%d" % window] = group["close"].pct_change(window)
        price["ma_%d" % window] = group["close"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["vol_%d" % window] = group["ret_1"].rolling(window, min_periods=max(5, window // 2)).std().reset_index(level=0, drop=True)
        price["volume_ma_%d" % window] = group["volume"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["money_ma_%d" % window] = group["money"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
    price["prev_close"] = group["close"].shift(1)
    price["gap_abs"] = (price["open"] / price["prev_close"].replace(0, np.nan) - 1).abs()
    price["gap_abs_20"] = group["gap_abs"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["volume_cv_20"] = group["volume"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True) / price["volume_ma_20"].replace(0, np.nan)
    price["money_cv_20"] = group["money"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True) / price["money_ma_20"].replace(0, np.nan)
    price["volume_ratio_20_60"] = price["volume_ma_20"] / price["volume_ma_60"].replace(0, np.nan) - 1
    price["money_ratio_20_60"] = price["money_ma_20"] / price["money_ma_60"].replace(0, np.nan) - 1
    price["drawdown_120"] = price["close"] / group["close"].rolling(120, min_periods=60).max().reset_index(level=0, drop=True) - 1
    price["ma20_gap"] = price["close"] / price["ma_20"].replace(0, np.nan) - 1
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
        raise ValueError("valuation 数据为空。")
    return pd.concat(rows, ignore_index=True)


def build_factor_table():
    price, universe_by_date, test_days, securities = build_price_base()
    fundamentals = fetch_fundamentals_for_days(universe_by_date)
    regimes = build_market_regime_table()
    rows = []
    index_ret = price[price["code"] == INDEX_CODE][["date", "ret_1"]].rename(columns={"ret_1": "index_ret_1"}) if INDEX_CODE in set(price["code"]) else pd.DataFrame()

    for day, universe in universe_by_date.items():
        part = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        vals = fundamentals[fundamentals["date"] == day].copy()
        part = part.merge(vals, on=["date", "code"], how="left")
        part = part.merge(regimes, on="date", how="left")
        if not index_ret.empty:
            part = part.merge(index_ret, on="date", how="left")
        else:
            part["index_ret_1"] = part["ret_1"].mean()
        part = part.replace([np.inf, -np.inf], np.nan)
        if len(part) < MIN_CROSS_SECTION or part["market_regime"].dropna().empty:
            continue

        part["market_cap_rank_pct"] = part["market_cap"].rank(pct=True, method="average")
        part["market_cap_bucket"] = "mid_cap"
        part.loc[part["market_cap_rank_pct"] >= 0.67, "market_cap_bucket"] = "large_cap"
        part.loc[part["market_cap_rank_pct"] <= 0.33, "market_cap_bucket"] = "small_cap"
        part["market_cap_bucket_name"] = part["market_cap_bucket"].map({
            "large_cap": "大市值",
            "mid_cap": "中市值",
            "small_cap": "小市值",
        })

        # Cross-sectional factor mining, all ranked within the true CSI500 daily universe.
        part["active_ret_20"] = part["ret_20"] - part["ret_20"].mean()
        part["active_ret_60"] = part["ret_60"] - part["ret_60"].mean()
        crowding_raw = (
            part["ret_20"].clip(lower=0).fillna(0)
            + 0.35 * part["volume_ratio_20_60"].clip(lower=0).fillna(0)
            + 0.30 * part["money_ratio_20_60"].clip(lower=0).fillna(0)
            + 0.45 * part["ma20_gap"].clip(lower=0).fillna(0)
            + 0.02 * part["turnover_ratio"].clip(lower=0).fillna(0)
        )
        part["jq_lcr_short_reversal"] = rank01(-part["ret_5"])
        part["jq_lcr_active_reversal"] = rank01(-0.60 * part["active_ret_20"] - 0.25 * part["ret_5"] + 0.15 * part["drawdown_120"])
        part["jq_lcr_low_crowding_resilience"] = rank01(-crowding_raw + 0.35 * part["drawdown_120"].fillna(0))
        part["jq_lcr_residual_low_volatility"] = rank01(-part["vol_60"] - 0.35 * part["vol_20"])
        part["jq_lcr_volume_stability"] = rank01(-0.55 * part["money_cv_20"] - 0.45 * part["volume_cv_20"])
        part["jq_lcr_gap_risk_control"] = rank01(-part["gap_abs_20"])
        part["jq_lcr_downside_resilience"] = rank01(part["drawdown_120"] - 0.50 * part["vol_60"].fillna(0))
        part["jq_lcr_anti_heat_reversal"] = rank01((1 - part["jq_lcr_low_crowding_resilience"]) * -0.35 + part["jq_lcr_short_reversal"] * 0.65)

        for spec in FACTOR_SPECS:
            part["z_" + spec["factor"]] = zscore(part[spec["factor"]])

        keep = [
            "date", "code", "close", "money", "money_ma_20", "market_cap", "market_cap_rank_pct",
            "market_cap_bucket", "market_cap_bucket_name", "market_regime", "market_regime_name",
            "market_vol_20d", "turnover_ratio",
        ] + [spec["factor"] for spec in FACTOR_SPECS] + ["jq_lcr_downside_resilience", "jq_lcr_anti_heat_reversal"] + [
            "future_return_%d" % horizon for horizon in HORIZONS
        ]
        rows.append(part[keep].copy())

    if not rows:
        raise ValueError("未形成可复测样本。")
    table = pd.concat(rows, ignore_index=True)
    return table, {
        "index_code": INDEX_CODE,
        "index_name": INDEX_NAME,
        "price_start": date_text(expand_fetch_bounds(*configured_factor_bounds())[0]),
        "price_end": date_text(expand_fetch_bounds(*configured_factor_bounds())[1]),
        "factor_start": date_text(configured_factor_bounds()[0]),
        "end_limit": date_text(configured_factor_bounds()[1]),
        "run_mode": RUN_MODE,
        "slice_start": SLICE_START or None,
        "slice_end": SLICE_END or None,
        "history_lookback_days": HISTORY_LOOKBACK_DAYS,
        "future_label_buffer_days": FUTURE_LABEL_BUFFER_DAYS,
        "price_fetch_batch_size": PRICE_FETCH_BATCH_SIZE,
        "horizons": HORIZONS,
        "primary_horizon": PRIMARY_HORIZON,
        "factor_day_step": FACTOR_DAY_STEP,
        "top_n": TOP_N,
        "trading_rebalance_days_list": TRADING_REBALANCE_DAYS_LIST,
        "primary_trading_rebalance_days": PRIMARY_TRADING_REBALANCE_DAYS,
        "test_dates": int(len(test_days)),
        "unique_securities": int(len(securities)),
    }


def rank_ic(day, factor, target):
    pair = day[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < MIN_CROSS_SECTION:
        return None
    x = pair[factor].rank(method="average")
    y = pair[target].rank(method="average")
    if x.nunique() < 2 or y.nunique() < 2:
        return None
    return clean_float(x.corr(y))


def passes_factor_gate(row):
    return (
        (row.get("sample_dates") or 0) >= FACTOR_GATE["min_sample_dates"]
        and row.get("rank_ic_mean") is not None and row["rank_ic_mean"] >= FACTOR_GATE["min_rank_ic"]
        and row.get("rank_ic_t") is not None and row["rank_ic_t"] >= FACTOR_GATE["min_rank_ic_t"]
        and row.get("long_short_mean") is not None and row["long_short_mean"] > FACTOR_GATE["min_long_short"]
        and row.get("long_short_positive_ratio") is not None and row["long_short_positive_ratio"] >= FACTOR_GATE["min_long_short_positive_ratio"]
    )


def factor_backtest(table):
    records = []
    gate_rows = []
    for spec in FACTOR_SPECS:
        factor = spec["factor"]
        factor_records = []
        for horizon in HORIZONS:
            target = "future_return_%d" % horizon
            daily_ic = []
            daily_ls = []
            for day, part in table.groupby("date"):
                ic = rank_ic(part, factor, target)
                if ic is None:
                    continue
                pair = part[[factor, target]].replace([np.inf, -np.inf], np.nan).dropna()
                ranked = pair[factor].rank(method="first", pct=True)
                top = pair.loc[ranked > 0.8, target]
                bottom = pair.loc[ranked <= 0.2, target]
                if len(top) < 10 or len(bottom) < 10:
                    continue
                daily_ic.append(ic)
                daily_ls.append(float(top.mean() - bottom.mean()))
            ic_series = pd.Series(daily_ic, dtype=float)
            ls_series = pd.Series(daily_ls, dtype=float)
            mean = clean_float(ic_series.mean())
            std = clean_float(ic_series.std(ddof=0))
            row = {
                "source": SOURCE,
                "result_type": "factor_backtest",
                "strategy_id": STRATEGY_ID,
                "strategy_name": STRATEGY_NAME,
                "factor_name": factor,
                "factor": factor,
                "factor_display_name": spec["name"],
                "factor_description": spec["description"],
                "dataset": "csi500",
                "horizon": horizon,
                "direction": spec["direction"],
                "sample_dates": int(ic_series.count()),
                "rank_ic_mean": mean,
                "rank_ic_std": std,
                "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
                "rank_ic_t": clean_float(mean / (std / math.sqrt(len(ic_series)))) if mean is not None and std and len(ic_series) > 1 else None,
                "long_short_mean": clean_float(ls_series.mean()),
                "long_short_positive_ratio": clean_float((ls_series > 0).mean()) if not ls_series.empty else None,
                "positive_ratio": clean_float((ic_series > 0).mean()) if not ic_series.empty else None,
                "gate_passed": None,
                "factor_gate": FACTOR_GATE,
                "data_policy": "真实 JoinQuant 中证500历史成分、OHLCV、market_cap、turnover_ratio；1/5/10/20日逐期RankIC和Top20%-Bottom20%多空收益。",
            }
            if horizon == PRIMARY_HORIZON:
                row["gate_passed"] = passes_factor_gate(row)
            factor_records.append(row)
            records.append(row)
        primary = next((item for item in factor_records if item["horizon"] == PRIMARY_HORIZON), None)
        gate_rows.append({
            "factor_name": factor,
            "factor_display_name": spec["name"],
            "base_weight": spec["base_weight"],
            "gate_passed": bool(primary and primary.get("gate_passed")),
            "primary_result": primary,
        })
    return records, gate_rows


def build_strategy_score(table, gate_rows):
    passed = [row for row in gate_rows if row.get("gate_passed")]
    selected = passed if len(passed) >= 2 else gate_rows
    weight_lookup = {spec["factor"]: float(spec["base_weight"]) for spec in FACTOR_SPECS}
    weights = {row["factor_name"]: weight_lookup.get(row["factor_name"], 0.0) for row in selected}
    total = sum(abs(value) for value in weights.values())
    if total <= 0:
        weights = {spec["factor"]: float(spec["base_weight"]) for spec in FACTOR_SPECS}
        total = sum(weights.values())
    weights = {key: value / total for key, value in weights.items()}
    out = table.copy()
    score = pd.Series(0.0, index=out.index)
    for factor, weight in weights.items():
        score = score + weight * (out[factor].fillna(0.5) * 2 - 1)
    out["lcr_enhancement_score"] = score
    return out, weights, len(passed)


def max_drawdown(values):
    if not values:
        return None
    peak = values[0]
    result = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            result = min(result, value / peak - 1)
    return clean_float(result)


def select_by_day(rows, top_n=TOP_N):
    selected = []
    for day, part in rows.groupby("date"):
        work = part.dropna(subset=["lcr_enhancement_score", "future_return_1", "future_return_5", "future_return_10", "future_return_20"]).copy()
        work = work[(work["close"] > 0) & (work["money"] > 0)]
        picked = work.sort_values("lcr_enhancement_score", ascending=False).head(top_n).copy()
        if not picked.empty:
            selected.append(picked)
    if not selected:
        return pd.DataFrame()
    return pd.concat(selected, ignore_index=True)


def event_backtest(table, layer_label, layer_meta):
    candidates = select_by_day(table)
    records = []
    if candidates.empty:
        return records
    for horizon in HORIZONS:
        col = "future_return_%d" % horizon
        daily = candidates.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        bench = table.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        merged = pd.concat([daily.rename("strategy"), bench.rename("benchmark")], axis=1).dropna()
        active = merged["strategy"] - merged["benchmark"]
        record = {
            "source": SOURCE,
            "result_type": "strategy_backtest" if not layer_meta else "strategy_regime_size_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "dataset": "csi500",
            "horizon": int(horizon),
            "layer": layer_label,
            "sample_dates": int(merged.shape[0]),
            "sample_trades": int(candidates[col].dropna().shape[0]),
            "mean_return": clean_float(merged["strategy"].mean()),
            "median_return": clean_float(candidates[col].median()),
            "daily_mean_return": clean_float(merged["strategy"].mean()),
            "daily_positive_ratio": clean_float((merged["strategy"] > 0).mean()) if not merged.empty else None,
            "best_daily_return": clean_float(merged["strategy"].max()),
            "worst_daily_return": clean_float(merged["strategy"].min()),
            "benchmark_mean_return": clean_float(merged["benchmark"].mean()),
            "active_mean_return": clean_float(active.mean()),
            "active_positive_ratio": clean_float((active > 0).mean()) if not active.empty else None,
            "positive_ratio": clean_float((merged["strategy"] > 0).mean()) if not merged.empty else None,
            "avg_candidates_per_date": clean_float(candidates.shape[0] / merged.shape[0]) if not merged.empty else None,
            "score_col": "lcr_enhancement_score",
            "data_policy": "真实 JoinQuant 中证500指数增强事件回测；基准为当期中证500成分等权收益。",
        }
        record.update(layer_meta)
        records.append(record)
    return records


def simulate_trading(table, layer_label, layer_meta, rebalance_days=PRIMARY_TRADING_REBALANCE_DAYS):
    future_return_col = "future_return_%d" % int(rebalance_days)
    if future_return_col not in table.columns:
        return None
    work = table.dropna(subset=["lcr_enhancement_score", future_return_col]).copy()
    if work.empty:
        return None
    nav = 1.0
    bench_nav = 1.0
    active_nav = 1.0
    previous_weights = {}
    period_returns = []
    benchmark_returns = []
    active_returns = []
    turnover_values = []
    curve = []
    sample_trades = 0

    for day, frame in work.sort_values(["date", "lcr_enhancement_score"], ascending=[True, False]).groupby("date"):
        picked = frame.sort_values("lcr_enhancement_score", ascending=False).head(TOP_N).copy()
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = dict((code, weight) for code in picked["code"].tolist())
        all_codes = set(previous_weights.keys()) | set(current_weights.keys())
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked[future_return_col] * weight).sum())
        benchmark_return = clean_float(frame[future_return_col].mean()) or 0.0
        cost = traded_notional * (TRADING_COST_RATE + TRADING_SLIPPAGE_RATE)
        net_return = gross_return - cost
        active_return = net_return - benchmark_return
        nav *= (1 + net_return)
        bench_nav *= (1 + benchmark_return)
        active_nav *= (1 + active_return)
        sample_trades += int(len(picked))
        period_returns.append(net_return)
        benchmark_returns.append(benchmark_return)
        active_returns.append(active_return)
        turnover_values.append(traded_notional)
        curve.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "net_value": clean_float(nav),
            "benchmark_net_value": clean_float(bench_nav),
            "active_net_value": clean_float(active_nav),
            "period_return": clean_float(net_return),
            "benchmark_return": clean_float(benchmark_return),
            "active_return": clean_float(active_return),
            "cost": clean_float(cost),
            "turnover": clean_float(traded_notional),
            "selected_count": int(len(picked)),
        })
        previous_weights = current_weights

    if not period_returns:
        return None
    periods = len(period_returns)
    annual_scale = 252.0 / float(rebalance_days)
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    active_std = float(np.std(active_returns, ddof=1)) if periods > 1 else 0.0
    strategy_annual = float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    benchmark_annual = float(bench_nav ** (annual_scale / periods) - 1) if bench_nav > 0 else None
    active_annual = float(active_nav ** (annual_scale / periods) - 1) if active_nav > 0 else None
    record = {
        "source": SOURCE,
        "result_type": "strategy_trading_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "dataset": "csi500",
        "horizon": int(rebalance_days),
        "horizon_label": "%d日调仓交易" % int(rebalance_days),
        "rebalance_days": int(rebalance_days),
        "layer": layer_label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(sample_trades),
        "strategy_return": clean_float(nav - 1),
        "benchmark_return": clean_float(bench_nav - 1),
        "excess_return": clean_float(active_nav - 1),
        "strategy_annual_return": clean_float(strategy_annual),
        "benchmark_annual_return": clean_float(benchmark_annual),
        "active_annual_return": clean_float(active_annual),
        "annual_return": clean_float(strategy_annual),
        "final_net_value": clean_float(nav),
        "max_drawdown": max_drawdown([item["net_value"] for item in curve]),
        "active_max_drawdown": max_drawdown([item["active_net_value"] for item in curve]),
        "sharpe": clean_float(np.mean(period_returns) / period_std * math.sqrt(annual_scale)) if period_std > 0 else None,
        "active_sharpe": clean_float(np.mean(active_returns) / active_std * math.sqrt(annual_scale)) if active_std > 0 else None,
        "daily_win_rate": clean_float(np.mean([ret > 0 for ret in period_returns])),
        "active_win_rate": clean_float(np.mean([ret > 0 for ret in active_returns])),
        "period_mean_return": clean_float(np.mean(period_returns)),
        "active_period_mean_return": clean_float(np.mean(active_returns)),
        "avg_turnover": clean_float(np.mean(turnover_values)),
        "total_turnover": clean_float(np.sum(turnover_values)),
        "cost_rate": TRADING_COST_RATE,
        "slippage_rate": TRADING_SLIPPAGE_RATE,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "score_col": "lcr_enhancement_score",
        "net_value_curve": curve[-100:],
        "data_policy": "真实 JoinQuant 中证500指数增强%d日持有/调仓净值；基准为当期中证500成分等权收益；扣交易成本和滑点。" % int(rebalance_days),
    }
    record.update(layer_meta)
    return record


def build_strategy_records(scored):
    records = []
    records.extend(event_backtest(scored, "整体", {}))
    trading_horizons = [PRIMARY_TRADING_REBALANCE_DAYS] + [
        days for days in TRADING_REBALANCE_DAYS_LIST if days != PRIMARY_TRADING_REBALANCE_DAYS
    ]
    for rebalance_days in trading_horizons:
        overall_trading = simulate_trading(scored, "整体", {}, rebalance_days=rebalance_days)
        if overall_trading:
            records.append(overall_trading)
    regimes = [
        ("high_volatility", "高波动"),
        ("medium_volatility", "中波动"),
        ("low_volatility", "低波动"),
    ]
    buckets = [
        ("large_cap", "大市值"),
        ("mid_cap", "中市值"),
        ("small_cap", "小市值"),
    ]
    for regime_id, regime_name in regimes:
        for bucket_id, bucket_name in buckets:
            part = scored[(scored["market_regime"] == regime_id) & (scored["market_cap_bucket"] == bucket_id)].copy()
            if part.empty:
                continue
            meta = {
                "market_regime": regime_id,
                "market_regime_name": regime_name,
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": bucket_name,
                "review_layer_type": "volatility_market_cap_cross",
            }
            records.extend(event_backtest(part, "%s/%s" % (regime_name, bucket_name), meta))
            for rebalance_days in trading_horizons:
                trading = simulate_trading(part, "%s/%s" % (regime_name, bucket_name), meta, rebalance_days=rebalance_days)
                if trading:
                    records.append(trading)
    return records


def paper_watch_label(records, factor_gate_pass_count):
    overall = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and not row.get("market_regime") and not row.get("market_cap_bucket") and int(row.get("rebalance_days") or 0) == PRIMARY_TRADING_REBALANCE_DAYS), None)
    layer_keys = set(
        "%s|%s" % (row.get("market_regime"), row.get("market_cap_bucket"))
        for row in records
        if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == PRIMARY_TRADING_REBALANCE_DAYS and row.get("market_regime") and row.get("market_cap_bucket")
    )
    checks = {
        "factor_gate_pass_count": factor_gate_pass_count >= PAPER_WATCH_GATE["min_factor_gate_pass_count"],
        "overall_strategy_return": overall is not None and (overall.get("strategy_return") or -999) >= PAPER_WATCH_GATE["min_strategy_return"],
        "overall_annual_return": overall is not None and (overall.get("strategy_annual_return") or -999) >= PAPER_WATCH_GATE["min_annual_return"],
        "overall_active_return": overall is not None and (overall.get("excess_return") or -999) >= PAPER_WATCH_GATE["min_active_return"],
        "overall_active_sharpe": overall is not None and (overall.get("active_sharpe") or -999) >= PAPER_WATCH_GATE["min_active_sharpe"],
        "overall_drawdown": overall is not None and (overall.get("max_drawdown") or -999) >= PAPER_WATCH_GATE["max_drawdown_floor"],
        "layer_count": len(layer_keys) >= PAPER_WATCH_GATE["min_layer_count"],
    }
    if all(checks.values()):
        return "paper_trade_candidate", "达到准模拟盘候选标准", checks
    if factor_gate_pass_count >= 1 and overall is not None:
        return "real_strategy_backtested", "已有真实策略回测，未达准模拟盘标准", checks
    return "factor_gate_not_passed", "因子门禁或策略回测未达标", checks


def build_research_package(table, config, emit=True):
    factor_records, gate_rows = factor_backtest(table)
    scored, weights, factor_gate_pass_count = build_strategy_score(table, gate_rows)
    strategy_records = build_strategy_records(scored)
    status, status_name, status_checks = paper_watch_label(strategy_records, factor_gate_pass_count)
    for record in strategy_records:
        record["strategy_status"] = status
        record["strategy_status_name"] = status_name
        record["factor_gate_pass_count"] = int(factor_gate_pass_count)
        record["factor_weights"] = weights
        record["paper_watch_gate"] = PAPER_WATCH_GATE
        record["paper_watch_checks"] = status_checks
    output = {
        "result_type": "index_enhancement_research_package",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "jq_import_hint": {
            "recommended_filename": "joinquant_csi500_low_crowding_reversal_index_enhancement_v0.json",
            "local_import_command": "python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py /path/to/joinquant_csi500_low_crowding_reversal_index_enhancement_v0.json",
            "records_policy": "导入器会展开 records；factor_backtest 进入实测结果，strategy_* 进入策略回测。",
        },
        "data_policy": "所有数据优先来自 JoinQuant：历史中证500成分、OHLCV、valuation.market_cap、valuation.turnover_ratio、指数行情；先因子1/5/10/20日门禁，再策略事件回测和1/5/10/20日调仓净值，5日调仓作为准模拟盘主准入周期。",
        "config": config,
        "factor_gate": FACTOR_GATE,
        "paper_watch_gate": PAPER_WATCH_GATE,
        "factor_gate_result": gate_rows,
        "factor_weights": weights,
        "strategy_status": status,
        "strategy_status_name": status_name,
        "paper_watch_checks": status_checks,
        "sample": {
            "factor_rows": int(table.shape[0]),
            "factor_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "factor_records": int(len(factor_records)),
            "strategy_records": int(len(strategy_records)),
        },
        "records": factor_records + strategy_records,
    }
    if emit:
        print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


def build_slice_package():
    ensure_joinquant_auth()
    table, config = build_factor_table()
    output = {
        "result_type": "index_enhancement_factor_slice",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "slice_start": config.get("slice_start") or config.get("factor_start"),
        "slice_end": config.get("slice_end") or config.get("end_limit"),
        "data_policy": "真实 JoinQuant 分片截面数据：历史中证500成分、OHLCV、valuation.market_cap、valuation.turnover_ratio、指数行情；本地合并后统一计算门禁和净值。",
        "config": config,
        "factor_specs": FACTOR_SPECS,
        "factor_rows": jsonable_records(table),
        "sample": {
            "factor_rows": int(table.shape[0]),
            "factor_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "date_range": "%s 至 %s" % (table["date"].min().strftime("%Y-%m-%d"), table["date"].max().strftime("%Y-%m-%d")),
        },
        "jq_import_hint": {
            "local_merge_command": "python3 outputs/sources/joinquant/scripts/merge_csi500_lcr_slices.py outputs/sources/joinquant/inbox/csi500_lcr_slices/*.json",
            "records_policy": "slice 文件不直接导入平台；先本地合并审计并生成完整 package，再用 import_joinquant_result_package.py 导入。",
        },
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


def run():
    ensure_joinquant_auth()
    table, config = build_factor_table()
    return build_research_package(table, config)


def configure_from_args(argv=None):
    import argparse

    parser = argparse.ArgumentParser(description="CSI500 low-crowding reversal JoinQuant research kernel.")
    parser.add_argument("--run-mode", choices=["full_package", "slice"], default=RUN_MODE)
    parser.add_argument("--slice-start", default=SLICE_START, help="First factor date for a smaller JoinQuant slice, e.g. 2020-01-01.")
    parser.add_argument("--slice-end", default=SLICE_END, help="Last factor date for a smaller JoinQuant slice, e.g. 2020-06-30.")
    args, _unknown = parser.parse_known_args(argv)
    globals()["RUN_MODE"] = args.run_mode
    globals()["SLICE_START"] = args.slice_start
    globals()["SLICE_END"] = args.slice_end
    return args


if __name__ == "__main__":
    parsed_args = configure_from_args()
    result_json = build_slice_package() if parsed_args.run_mode == "slice" else run()
