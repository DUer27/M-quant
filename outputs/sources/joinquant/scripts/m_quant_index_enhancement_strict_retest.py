# M-quant JoinQuant strict retest: index growth strategies
# Policy: only uses JoinQuant research-environment OHLCV, index constituents,
# valuation.market_cap and valuation.turnover_ratio. No fabricated metrics.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Set INDEX_CODE to 000300.XSHG or 000905.XSHG.
# 3. Run the cell.
# 4. Copy the printed JSON back to M-quant 回测中心 -> 结果回填.

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


INDEX_CODE = "000905.XSHG"
INDEX_NAME = "中证500"
STRATEGY_ID = "jq_index_growth_strict_v1"
STRATEGY_NAME = "JoinQuant指数增长严格复测 v1"
PRICE_START = "2019-01-01"
FACTOR_START = "2020-01-01"
END_LIMIT = "2026-07-15"
HORIZONS = [1, 5, 10, 20]
PRIMARY_HORIZON = 20
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 120
TOP_N = 80
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002
FACTOR_GATE = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.015,
    "min_rank_ic_t": 2.0,
    "min_long_short": 0.0,
    "min_long_short_positive_ratio": 0.53,
}

STRATEGY_SPECS = [
    {
        "strategy_id": "jq_index_growth_trend_v1",
        "strategy_name": "JoinQuant指数增长趋势策略 v1",
        "score_col": "index_growth_trend_score",
        "description": "中期趋势、长期趋势、量价确认、收盘强度和反拥挤合成。",
    },
    {
        "strategy_id": "jq_index_growth_stable_v1",
        "strategy_name": "JoinQuant指数增长稳健策略 v1",
        "score_col": "index_growth_stable_score",
        "description": "低波动、量能稳定、回撤控制、跳空风险、反拥挤和短期反转合成。",
    },
    {
        "strategy_id": "jq_index_growth_combined_v1",
        "strategy_name": "JoinQuant指数增长综合策略 v1",
        "score_col": "index_growth_composite_score",
        "description": "趋势增长和稳健增长综合合成，用于判断是否适合综合。",
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


def clean_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


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
    for window in [5, 10, 20, 60, 120]:
        price["ret_%d" % window] = group["close"].pct_change(window)
        price["ma_%d" % window] = group["close"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["vol_%d" % window] = group["ret_1"].rolling(window, min_periods=max(5, window // 2)).std().reset_index(level=0, drop=True)
        price["volume_ma_%d" % window] = group["volume"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price["money_ma_%d" % window] = group["money"].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
    price["prev_close"] = group["close"].shift(1)
    daily_range = (price["high"] - price["low"]).replace(0, np.nan)
    price["gap_abs"] = (price["open"] / price["prev_close"] - 1).abs()
    price["gap_abs_20"] = group["gap_abs"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price["close_position"] = (price["close"] - price["low"]) / daily_range
    price["volume_ratio_20_60"] = price["volume_ma_20"] / price["volume_ma_60"].replace(0, np.nan) - 1
    price["money_ratio_20_60"] = price["money_ma_20"] / price["money_ma_60"].replace(0, np.nan) - 1
    price["volume_cv_20"] = group["volume"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True) / price["volume_ma_20"].replace(0, np.nan)
    price["drawdown_120"] = price["close"] / group["close"].rolling(120, min_periods=60).max().reset_index(level=0, drop=True) - 1
    price["ma_structure"] = price["ma_20"] / price["ma_60"].replace(0, np.nan) - 1
    price["ma120_structure"] = price["ma_60"] / price["ma_120"].replace(0, np.nan) - 1
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
    for day, universe in universe_by_date.items():
        p = price[(price["date"] == day) & (price["code"].isin(universe))].copy()
        f = fundamentals[fundamentals["date"] == day].copy()
        part = p.merge(f, on=["date", "code"], how="left")
        part = part.merge(regimes, on="date", how="left")
        part = part.replace([np.inf, -np.inf], np.nan)
        if len(part) < MIN_CROSS_SECTION:
            continue

        part["market_cap_rank_pct"] = part["market_cap"].rank(pct=True, method="average")
        part["market_cap_bucket"] = "mid_cap"
        part.loc[part["market_cap_rank_pct"] >= 0.67, "market_cap_bucket"] = "large_cap"
        part.loc[part["market_cap_rank_pct"] <= 0.33, "market_cap_bucket"] = "small_cap"
        part["market_cap_bucket_name"] = part["market_cap_bucket"].map({"large_cap": "大市值", "mid_cap": "中市值", "small_cap": "小市值"})

        part["f_volume_confirmation"] = part["ret_20"].clip(-0.2, 0.4) * np.sign(part["volume_ratio_20_60"].fillna(0))
        part["f_medium_momentum"] = part["ret_60"] - 0.35 * part["ret_5"].clip(lower=0)
        part["f_long_momentum"] = part["ret_120"] - 0.50 * part["vol_60"].fillna(0)
        part["f_orderly_trend"] = part["ret_60"] + part["ma_structure"] + part["ma120_structure"] - 2.0 * part["vol_60"].fillna(0) - part["ma20_gap"].clip(lower=0) * 0.30
        part["f_short_reversal"] = -part["ret_5"]
        part["f_low_volatility"] = -part["vol_20"]
        part["f_volume_stability"] = -part["volume_cv_20"]
        part["f_gap_risk_control"] = -part["gap_abs_20"]
        part["f_drawdown_control"] = part["drawdown_120"]
        part["f_anti_crowding"] = -(part["ret_20"].clip(lower=0).fillna(0) + part["volume_ratio_20_60"].clip(lower=0).fillna(0) * 0.35 + part["ma20_gap"].clip(lower=0).fillna(0) * 0.50 + part["turnover_ratio"].clip(lower=0).fillna(0) * 0.02)
        part["f_residual_low_volatility"] = -part["vol_60"]
        part["f_close_strength"] = part["close_position"]
        part["f_market_regime_fit"] = np.where(
            part["market_regime"] == "high_volatility",
            rank01(part["f_short_reversal"]) + rank01(part["f_anti_crowding"]),
            rank01(part["f_volume_confirmation"]) + rank01(part["f_orderly_trend"]),
        )

        factor_cols = [
            "f_volume_confirmation",
            "f_medium_momentum",
            "f_long_momentum",
            "f_orderly_trend",
            "f_market_regime_fit",
            "f_short_reversal",
            "f_low_volatility",
            "f_volume_stability",
            "f_gap_risk_control",
            "f_drawdown_control",
            "f_anti_crowding",
            "f_residual_low_volatility",
            "f_close_strength",
        ]
        for col in factor_cols:
            part["z_" + col] = rank01(part[col]) * 2 - 1
        part["index_growth_trend_score"] = (
            0.30 * part["z_f_medium_momentum"]
            + 0.25 * part["z_f_long_momentum"]
            + 0.25 * part["z_f_volume_confirmation"]
            + 0.12 * part["z_f_close_strength"]
            + 0.08 * part["z_f_anti_crowding"]
        )
        part["index_growth_stable_score"] = (
            0.24 * part["z_f_low_volatility"]
            + 0.20 * part["z_f_volume_stability"]
            + 0.20 * part["z_f_drawdown_control"]
            + 0.16 * part["z_f_gap_risk_control"]
            + 0.12 * part["z_f_anti_crowding"]
            + 0.08 * part["z_f_short_reversal"]
        )
        part["index_growth_composite_score"] = (
            0.58 * part["index_growth_trend_score"]
            + 0.42 * part["index_growth_stable_score"]
        )
        keep = [
            "date", "code", "close", "money", "market_cap", "market_cap_rank_pct", "market_cap_bucket", "market_cap_bucket_name",
            "market_regime", "market_regime_name", "market_vol_20d", "turnover_ratio",
            "index_growth_trend_score", "index_growth_stable_score", "index_growth_composite_score",
        ] + ["future_return_%d" % h for h in HORIZONS]
        rows.append(part[keep].copy())
    if not rows:
        raise ValueError("未形成可复测样本。")
    return pd.concat(rows, ignore_index=True), {
        "index_code": INDEX_CODE,
        "index_name": INDEX_NAME,
        "price_start": PRICE_START,
        "factor_start": FACTOR_START,
        "end_limit": END_LIMIT,
        "horizons": HORIZONS,
        "factor_day_step": FACTOR_DAY_STEP,
        "top_n": TOP_N,
        "test_dates": int(len(test_days)),
        "unique_securities": int(len(securities)),
    }


def rank_ic(day, score_col, target_col):
    pair = day[[score_col, target_col]].replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < MIN_CROSS_SECTION:
        return None
    x = pair[score_col].rank(method="average")
    y = pair[target_col].rank(method="average")
    if x.nunique() < 2 or y.nunique() < 2:
        return None
    return clean_float(x.corr(y))


def factor_backtest(frame, spec):
    rows = []
    score_col = spec["score_col"]
    for horizon in HORIZONS:
        target = "future_return_%d" % horizon
        daily = []
        long_short = []
        for day, part in frame.groupby("date"):
            ic = rank_ic(part, score_col, target)
            if ic is None:
                continue
            pair = part[[score_col, target]].replace([np.inf, -np.inf], np.nan).dropna()
            ranked = pair[score_col].rank(method="first", pct=True)
            top = pair.loc[ranked > 0.8, target]
            bottom = pair.loc[ranked <= 0.2, target]
            if len(top) < 5 or len(bottom) < 5:
                continue
            daily.append(ic)
            long_short.append(float(top.mean() - bottom.mean()))
        ic_series = pd.Series(daily, dtype=float)
        ls_series = pd.Series(long_short, dtype=float)
        mean = clean_float(ic_series.mean())
        std = clean_float(ic_series.std(ddof=0))
        rows.append({
            "result_type": "factor_backtest",
            "factor_name": score_col,
            "factor_display_name": spec["strategy_name"].replace("策略", "评分"),
            "horizon": horizon,
            "direction": "positive",
            "sample_dates": int(ic_series.count()),
            "rank_ic_mean": mean,
            "rank_ic_std": std,
            "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
            "rank_ic_t": clean_float(mean / (std / math.sqrt(len(ic_series)))) if mean is not None and std and len(ic_series) > 1 else None,
            "long_short_mean": clean_float(ls_series.mean()),
            "long_short_positive_ratio": clean_float((ls_series > 0).mean()) if not ls_series.empty else None,
            "positive_ratio": clean_float((ic_series > 0).mean()) if not ic_series.empty else None,
            "source": "joinquant_index_growth_strict_retest_v1",
            "note": "真实 JoinQuant OHLCV、指数成分、valuation.market_cap 与 turnover_ratio 指数增长评分门禁复测。",
        })
    return rows


def passes_gate(row):
    return (
        (row.get("sample_dates") or 0) >= FACTOR_GATE["min_sample_dates"]
        and (row.get("rank_ic_mean") is not None and row["rank_ic_mean"] >= FACTOR_GATE["min_rank_ic"])
        and (row.get("rank_ic_t") is not None and row["rank_ic_t"] >= FACTOR_GATE["min_rank_ic_t"])
        and (row.get("long_short_mean") is not None and row["long_short_mean"] > FACTOR_GATE["min_long_short"])
        and (row.get("long_short_positive_ratio") is not None and row["long_short_positive_ratio"] >= FACTOR_GATE["min_long_short_positive_ratio"])
    )


def event_summary(candidates, spec, result_type="strategy_regime_size_backtest"):
    rows = []
    for (regime, cap_bucket), part in candidates.groupby(["market_regime", "market_cap_bucket"]):
        for horizon in HORIZONS:
            col = "future_return_%d" % horizon
            values = part[col].replace([np.inf, -np.inf], np.nan).dropna()
            daily = part.groupby("date")[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
            rows.append({
                "result_type": result_type,
                "strategy_id": spec["strategy_id"],
                "strategy_name": spec["strategy_name"],
                "horizon": horizon,
                "market_regime": regime,
                "market_regime_name": str(part["market_regime_name"].dropna().iloc[0]) if not part["market_regime_name"].dropna().empty else regime,
                "market_cap_bucket": cap_bucket,
                "market_cap_bucket_name": str(part["market_cap_bucket_name"].dropna().iloc[0]) if not part["market_cap_bucket_name"].dropna().empty else cap_bucket,
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
                "market_vol_mean": clean_float(part["market_vol_20d"].mean()),
                "market_cap_mean": clean_float(part["market_cap"].mean()),
                "source": "joinquant_index_growth_strict_retest_v1",
                "note": "真实 JoinQuant 高/中/低波动 × 大/中/小市值交叉分层事件收益。",
            })
    return rows


def select_candidates(frame, score_col):
    selected = []
    diagnostics = []
    for day, part in frame.groupby("date"):
        work = part.dropna(subset=[score_col, "close", "money", "market_cap", "market_regime", "market_cap_bucket"]).copy()
        work = work[(work["close"] > 0) & (work["money"] > 0)]
        picked = work.sort_values(score_col, ascending=False).head(TOP_N).copy()
        diagnostics.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "scorable": int(work.shape[0]),
            "selected": int(picked.shape[0]),
        })
        if not picked.empty:
            selected.append(picked)
    if not selected:
        return pd.DataFrame(), diagnostics
    return pd.concat(selected, ignore_index=True), diagnostics


def run():
    frame, config = build_factor_table()
    factor_rows = []
    gate_results = []
    summary = []
    diagnostics_by_strategy = {}
    cross_counts = []
    for spec in STRATEGY_SPECS:
        spec_factor_rows = factor_backtest(frame, spec)
        factor_rows.extend(spec_factor_rows)
        primary = next((row for row in spec_factor_rows if row.get("horizon") == PRIMARY_HORIZON), None)
        gate_passed = passes_gate(primary or {})
        candidates, diagnostics = select_candidates(frame, spec["score_col"])
        diagnostics_by_strategy[spec["strategy_id"]] = diagnostics[-20:]
        strategy_summary = event_summary(candidates, spec) if not candidates.empty else []
        summary.extend(strategy_summary)
        gate_results.append({
            "strategy_id": spec["strategy_id"],
            "strategy_name": spec["strategy_name"],
            "score_col": spec["score_col"],
            "primary_horizon": PRIMARY_HORIZON,
            "gate_passed": gate_passed,
            "primary_result": primary,
            "blocked_reason": None if gate_passed else "factor_gate_not_passed",
            "note": "即使门禁未通过，也输出交叉分层供诊断；不得直接作为准入证据。" if not gate_passed else "门禁通过，仍需交易约束复核。",
        })
        for (regime, cap_bucket), part in candidates.groupby(["market_regime", "market_cap_bucket"]):
            cross_counts.append({
                "strategy_id": spec["strategy_id"],
                "strategy_name": spec["strategy_name"],
                "market_regime": regime,
                "market_regime_name": str(part["market_regime_name"].dropna().iloc[0]) if not part["market_regime_name"].dropna().empty else regime,
                "market_cap_bucket": cap_bucket,
                "market_cap_bucket_name": str(part["market_cap_bucket_name"].dropna().iloc[0]) if not part["market_cap_bucket_name"].dropna().empty else cap_bucket,
                "sample_dates": int(part["date"].nunique()),
                "sample_trades": int(part["code"].count()),
            })
    output = {
        "result_type": "index_growth_strict_retest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "source": "joinquant_index_growth_strict_retest_v1",
        "data_policy": "真实 JoinQuant OHLCV、指数成分、valuation.market_cap、valuation.turnover_ratio 与指数行情；输出高/中/低波动 × 大/中/小市值交叉分层；未生成任何虚构收益。",
        "config": config,
        "factor_gate": FACTOR_GATE,
        "factor_gate_result": gate_results,
        "factor_summary": factor_rows,
        "summary": summary,
        "cross_counts": cross_counts,
        "sample": {
            "factor_rows": int(frame.shape[0]),
            "factor_dates": int(frame["date"].nunique()),
            "strategy_count": len(STRATEGY_SPECS),
            "summary_rows": len(summary),
        },
        "diagnostics_tail": diagnostics_by_strategy,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run()
