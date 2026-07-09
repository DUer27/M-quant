#!/usr/bin/env python3
"""
M-Quant AkShare OHLCV 因子回测脚本。

数据原则：
- 输入必须是 fetch_a_share_history.py 落地的真实 AkShare 日线 CSV。
- 因子只使用当日及之前 OHLCV/turnover 数据。
- 未来收益只用于验证 IC、RankIC、多空收益和简单组合净值。
- 不填补缺失股票、不生成虚构收益、不把小样本结果包装成正式结论。
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
AK_DIR = ROOT / "outputs" / "sources" / "akshare"
RESULTS_DIR = AK_DIR / "results"

FACTOR_DEFS = [
    {
        "id": "ak_volume_price_confirmation",
        "name": "AkShare量价确认",
        "direction": "positive",
        "description": "20日价格趋势、成交量/成交额放大和当日收盘质量共同确认。",
    },
    {
        "id": "ak_trend_quality",
        "name": "AkShare趋势质量",
        "direction": "positive",
        "description": "20日收益、MA20/MA60结构和价格相对MA20位置共同衡量趋势。",
    },
    {
        "id": "ak_low_volatility_quality",
        "name": "AkShare低波动质量",
        "direction": "positive",
        "description": "20日波动、60日回撤越低，防守质量越高。",
    },
    {
        "id": "ak_kline_confirmation",
        "name": "AkShareK线确认",
        "direction": "positive",
        "description": "阳线实体、收盘位置和上影压力衡量单日K线确认度。",
    },
    {
        "id": "ak_crowding_risk",
        "name": "AkShare拥挤风险",
        "direction": "negative",
        "description": "高换手、高量比、短期涨幅和均线过伸共同识别拥挤风险。",
    },
    {
        "id": "ak_volume_trend_quality_combo",
        "name": "AkShare量价趋势质量组合",
        "direction": "positive",
        "description": "量价确认、趋势质量、低波动质量、K线确认减拥挤风险。",
    },
    {
        "id": "ak_defensive_quality_combo",
        "name": "AkShare防守质量确认组合",
        "direction": "positive",
        "description": "低波动质量为核心，叠加趋势和量价确认并扣除拥挤风险。",
    },
    {
        "id": "ak_mean_reversion_quality_combo",
        "name": "AkShare均值回归质量组合",
        "direction": "positive",
        "description": "在核心流动性样本中反向检验趋势/量价过热，寻找低趋势延伸、低量价追高且K线不过强的回归机会。",
    },
    {
        "id": "ak_anti_crowding_reversal_combo",
        "name": "AkShare反拥挤回归组合",
        "direction": "positive",
        "description": "低拥挤、低短线追涨和不过度强K线的反向确认组合。",
    },
]


def pct_rank_by_date(df: pd.DataFrame, column: str) -> pd.Series:
    return df.groupby("date")[column].rank(pct=True, method="average")


def safe_div(left: pd.Series, right: pd.Series) -> pd.Series:
    return left / right.replace(0, np.nan)


def max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return math.nan
    peak = equity.cummax()
    drawdown = equity / peak - 1
    return float(drawdown.min())


def annualized_return(total_return: float, periods: int, periods_per_year: int = 252) -> float:
    if periods <= 0 or total_return <= -1:
        return math.nan
    return float((1 + total_return) ** (periods_per_year / periods) - 1)


def sharpe_ratio(returns: pd.Series, periods_per_year: int = 252) -> float:
    clean = returns.replace([np.inf, -np.inf], np.nan).dropna()
    if clean.empty or clean.std(ddof=1) == 0:
        return math.nan
    return float(clean.mean() / clean.std(ddof=1) * math.sqrt(periods_per_year))


def prepare_frame(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"code": str})
    required = {"date", "code", "open", "high", "low", "close", "volume", "amount", "turnover"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise SystemExit(f"输入文件缺字段：{missing}")

    df["code"] = df["code"].str.zfill(6)
    df["date"] = pd.to_datetime(df["date"])
    numeric_cols = ["open", "high", "low", "close", "volume", "amount", "turnover"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["date", "code", "open", "high", "low", "close"]).sort_values(["code", "date"])
    return df


def add_factor_columns(df: pd.DataFrame) -> pd.DataFrame:
    frames = []
    for _, group in df.groupby("code", sort=False):
        g = group.sort_values("date").copy()
        g["ret_1"] = g["close"].pct_change()
        g["ret_5"] = g["close"].pct_change(5)
        g["ret_20"] = g["close"].pct_change(20)
        g["ma20"] = g["close"].rolling(20, min_periods=20).mean()
        g["ma60"] = g["close"].rolling(60, min_periods=60).mean()
        g["vol20"] = g["ret_1"].rolling(20, min_periods=20).std()
        g["volume_ma20"] = g["volume"].rolling(20, min_periods=20).mean()
        g["amount_ma20"] = g["amount"].rolling(20, min_periods=20).mean()
        g["rolling_high60"] = g["close"].rolling(60, min_periods=60).max()
        g["drawdown60"] = safe_div(g["close"], g["rolling_high60"]) - 1
        for horizon in [5, 10, 20]:
            g[f"future_return_{horizon}"] = g["close"].shift(-horizon) / g["close"] - 1
        frames.append(g)

    out = pd.concat(frames, ignore_index=True)
    day_range = (out["high"] - out["low"]).replace(0, np.nan)
    out["close_position"] = (out["close"] - out["low"]) / day_range
    out["upper_shadow_ratio"] = (out["high"] - out[["open", "close"]].max(axis=1)) / day_range
    out["body_return"] = out["close"] / out["open"] - 1
    out["volume_ratio20"] = safe_div(out["volume"], out["volume_ma20"])
    out["amount_ratio20"] = safe_div(out["amount"], out["amount_ma20"])
    out["activity_ratio20"] = out["amount_ratio20"].where(out["amount_ratio20"].notna(), out["volume_ratio20"])
    out["liquidity_metric20"] = out["amount_ma20"].where(out["amount_ma20"].notna(), out["volume_ma20"])
    out["ma20_ma60_gap"] = safe_div(out["ma20"], out["ma60"]) - 1
    out["close_ma20_gap"] = safe_div(out["close"], out["ma20"]) - 1

    out["raw_volume_price"] = (
        0.35 * out["ret_20"]
        + 0.25 * np.log(out["volume_ratio20"].clip(lower=0.2, upper=5))
        + 0.20 * np.log(out["activity_ratio20"].clip(lower=0.2, upper=5))
        + 0.20 * out["close_position"]
    )
    out["raw_trend_quality"] = (
        0.45 * out["ret_20"]
        + 0.35 * out["ma20_ma60_gap"]
        + 0.20 * out["close_ma20_gap"].clip(lower=-0.20, upper=0.20)
    )
    out["raw_low_volatility_quality"] = -0.65 * out["vol20"] + 0.35 * out["drawdown60"]
    out["raw_kline_confirmation"] = (
        0.45 * out["body_return"].clip(lower=-0.08, upper=0.08)
        + 0.35 * out["close_position"]
        - 0.20 * out["upper_shadow_ratio"].fillna(0)
    )
    out["raw_crowding_risk"] = (
        0.30 * np.log(out["volume_ratio20"].clip(lower=0.2, upper=8))
        + 0.25 * out["turnover"].fillna(0) / 100
        + 0.25 * out["ret_5"].clip(lower=-0.2, upper=0.5)
        + 0.20 * out["close_ma20_gap"].clip(lower=-0.2, upper=0.5)
    )

    out["ak_volume_price_confirmation"] = pct_rank_by_date(out, "raw_volume_price")
    out["ak_trend_quality"] = pct_rank_by_date(out, "raw_trend_quality")
    out["ak_low_volatility_quality"] = pct_rank_by_date(out, "raw_low_volatility_quality")
    out["ak_kline_confirmation"] = pct_rank_by_date(out, "raw_kline_confirmation")
    out["ak_crowding_risk"] = pct_rank_by_date(out, "raw_crowding_risk")
    out["ak_volume_trend_quality_combo"] = (
        0.32 * out["ak_volume_price_confirmation"]
        + 0.28 * out["ak_trend_quality"]
        + 0.20 * out["ak_low_volatility_quality"]
        + 0.12 * out["ak_kline_confirmation"]
        - 0.18 * out["ak_crowding_risk"]
    )
    out["ak_defensive_quality_combo"] = (
        0.42 * out["ak_low_volatility_quality"]
        + 0.22 * out["ak_trend_quality"]
        + 0.18 * out["ak_volume_price_confirmation"]
        + 0.08 * out["ak_kline_confirmation"]
        - 0.15 * out["ak_crowding_risk"]
    )
    out["ak_mean_reversion_quality_combo"] = (
        0.34 * (1 - out["ak_trend_quality"])
        + 0.26 * (1 - out["ak_volume_price_confirmation"])
        + 0.18 * out["ak_low_volatility_quality"]
        + 0.12 * (1 - out["ak_kline_confirmation"])
        + 0.10 * (1 - out["ak_crowding_risk"])
    )
    out["ak_anti_crowding_reversal_combo"] = (
        0.38 * (1 - out["ak_crowding_risk"])
        + 0.24 * (1 - out["ak_volume_price_confirmation"])
        + 0.18 * (1 - out["ak_trend_quality"])
        + 0.12 * out["ak_low_volatility_quality"]
        + 0.08 * (1 - out["ak_kline_confirmation"])
    )

    market = out.groupby("date", as_index=False)["ret_1"].mean().rename(columns={"ret_1": "market_ret_1"})
    market["market_vol_20"] = market["market_ret_1"].rolling(20, min_periods=20).std()
    market["market_vol_regime"] = pd.qcut(
        market["market_vol_20"].rank(method="first"),
        3,
        labels=["low_volatility", "medium_volatility", "high_volatility"],
    )
    out = out.merge(market[["date", "market_ret_1", "market_vol_20", "market_vol_regime"]], on="date", how="left")

    liquidity_rank = out.groupby("date")["liquidity_metric20"].rank(pct=True, method="average")
    out["liquidity_bucket"] = pd.cut(
        liquidity_rank,
        bins=[0, 1 / 3, 2 / 3, 1],
        labels=["low_liquidity", "mid_liquidity", "high_liquidity"],
        include_lowest=True,
    )
    return out


def summarize_factor(df: pd.DataFrame, factor: dict, horizon: int, min_stocks: int) -> dict | None:
    factor_id = factor["id"]
    future_col = f"future_return_{horizon}"
    direction = -1 if factor["direction"] == "negative" else 1
    work = df[["date", "code", factor_id, future_col]].dropna().copy()
    if work.empty:
        return None
    work["score"] = work[factor_id] * direction

    daily = []
    for date, group in work.groupby("date"):
        if group["code"].nunique() < min_stocks:
            continue
        ic = group["score"].corr(group[future_col], method="pearson")
        rank_ic = group["score"].rank(method="average").corr(group[future_col].rank(method="average"))
        low_cut = group["score"].quantile(0.2)
        high_cut = group["score"].quantile(0.8)
        top = group[group["score"] >= high_cut][future_col].mean()
        bottom = group[group["score"] <= low_cut][future_col].mean()
        daily.append({
            "date": date.strftime("%Y-%m-%d"),
            "ic": ic,
            "rank_ic": rank_ic,
            "long_short": top - bottom,
            "top_return": top,
            "bottom_return": bottom,
            "stock_count": int(group["code"].nunique()),
        })

    daily_df = pd.DataFrame(daily).replace([np.inf, -np.inf], np.nan).dropna(subset=["rank_ic", "long_short"])
    if daily_df.empty:
        return None

    rank_ic_std = daily_df["rank_ic"].std(ddof=1)
    return {
        "factor_name": factor_id,
        "factor_display_name": factor["name"],
        "direction": factor["direction"],
        "horizon": horizon,
        "sample_dates": int(daily_df["date"].nunique()),
        "avg_stocks": float(daily_df["stock_count"].mean()),
        "ic_mean": float(daily_df["ic"].mean()),
        "rank_ic_mean": float(daily_df["rank_ic"].mean()),
        "rank_ic_t": None if not rank_ic_std or math.isnan(rank_ic_std) else float(daily_df["rank_ic"].mean() / rank_ic_std * math.sqrt(len(daily_df))),
        "long_short_mean": float(daily_df["long_short"].mean()),
        "long_short_positive_ratio": float((daily_df["long_short"] > 0).mean()),
        "top_return_mean": float(daily_df["top_return"].mean()),
        "bottom_return_mean": float(daily_df["bottom_return"].mean()),
        "data_source": "akshare.stock_zh_a_hist",
        "result_type": "local_factor_backtest",
    }


def simulate_strategy(
    df: pd.DataFrame,
    score_col: str,
    name: str,
    top_n: int,
    cost: float,
    layer: dict | None = None,
) -> dict:
    layer = layer or {}
    cols = [
        "date",
        "code",
        "name",
        score_col,
        "future_return_5",
        "market_vol_regime",
        "liquidity_bucket",
        "market_vol_20",
        "liquidity_metric20",
    ]
    work = df[cols].dropna(subset=["date", "code", score_col, "future_return_5"]).copy()
    if layer.get("market_vol_regime"):
        work = work[work["market_vol_regime"].astype(str) == layer["market_vol_regime"]]
    if layer.get("liquidity_bucket"):
        work = work[work["liquidity_bucket"].astype(str) == layer["liquidity_bucket"]]

    trade_dates = sorted(work["date"].unique())[::5]
    rows = []
    for date in trade_dates:
        day = work[work["date"] == date].sort_values(score_col, ascending=False).head(top_n)
        if day.empty:
            continue
        gross = float(day["future_return_5"].mean())
        net = gross - cost
        rows.append({
            "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
            "gross_return_5d": gross,
            "net_return_5d": net,
            "stock_count": int(len(day)),
            "codes": ",".join(day["code"].tolist()),
            "market_vol_20": None if day["market_vol_20"].dropna().empty else float(day["market_vol_20"].mean()),
            "liquidity_metric20": None if day["liquidity_metric20"].dropna().empty else float(day["liquidity_metric20"].mean()),
        })

    returns = pd.DataFrame(rows)
    if returns.empty:
        return {
            "strategy_id": score_col,
            "strategy_name": name,
            "result_type": "local_strategy_backtest",
            "sample_trades": 0,
            **layer,
        }
    equity = (1 + returns["net_return_5d"]).cumprod()
    total_return = float(equity.iloc[-1] - 1)
    # 5日调仓，按每次交易约5个交易日折算。
    trading_days = len(returns) * 5
    return {
        "strategy_id": score_col,
        "strategy_name": name,
        "result_type": "local_strategy_backtest",
        "data_source": "akshare.stock_zh_a_hist",
        "sample_trades": int(len(returns)),
        "top_n": int(top_n),
        "cost_per_rebalance": float(cost),
        "strategy_return": total_return,
        "strategy_annual_return": annualized_return(total_return, trading_days),
        "max_drawdown": max_drawdown(equity),
        "sharpe": sharpe_ratio(returns["net_return_5d"], periods_per_year=252 / 5),
        "positive_trade_ratio": float((returns["net_return_5d"] > 0).mean()),
        "first_trade_date": returns["date"].iloc[0],
        "last_trade_date": returns["date"].iloc[-1],
        "market_vol_mean": None if returns["market_vol_20"].dropna().empty else float(returns["market_vol_20"].mean()),
        "liquidity_metric20_mean": None if returns["liquidity_metric20"].dropna().empty else float(returns["liquidity_metric20"].mean()),
        **layer,
        "daily_records_preview": rows[:20],
    }


def strategy_layers() -> list[dict]:
    regimes = ["low_volatility", "medium_volatility", "high_volatility"]
    liquidity_buckets = ["low_liquidity", "mid_liquidity", "high_liquidity"]
    layers = [{"layer_type": "unsegmented"}]
    layers.extend({"layer_type": "market_volatility", "market_vol_regime": regime} for regime in regimes)
    layers.extend({"layer_type": "liquidity", "liquidity_bucket": bucket} for bucket in liquidity_buckets)
    layers.extend(
        {
            "layer_type": "volatility_liquidity_cross",
            "market_vol_regime": regime,
            "liquidity_bucket": bucket,
        }
        for regime in regimes
        for bucket in liquidity_buckets
    )
    return layers


def main() -> int:
    parser = argparse.ArgumentParser(description="Backtest OHLCV factors from AkShare local history.")
    parser.add_argument("--input", default="outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv")
    parser.add_argument("--min-stocks", type=int, default=30)
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--cost", type=float, default=0.001)
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = ROOT / input_path
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    raw = prepare_frame(input_path)
    factors = add_factor_columns(raw)
    eligible = factors.groupby("code")["date"].count()
    factor_rows = factors.dropna(subset=["ak_volume_trend_quality_combo", "future_return_5"]).copy()

    factor_results = []
    for factor in FACTOR_DEFS:
        for horizon in [5, 10, 20]:
            result = summarize_factor(factors, factor, horizon, args.min_stocks)
            if result:
                factor_results.append(result)

    strategy_specs = [
        ("ak_volume_trend_quality_combo", "AkShare量价趋势质量策略 v0"),
        ("ak_defensive_quality_combo", "AkShare防守质量确认策略 v0"),
        ("ak_mean_reversion_quality_combo", "AkShare均值回归质量策略 v0"),
        ("ak_anti_crowding_reversal_combo", "AkShare反拥挤回归策略 v0"),
    ]
    strategy_results = [
        simulate_strategy(factors, strategy_id, name, args.top_n, args.cost, layer)
        for strategy_id, name in strategy_specs
        for layer in strategy_layers()
    ]

    summary = {
        "source": "akshare_ohlcv_factor_backtest",
        "data_policy": "真实 AkShare OHLCV 本地回测；不填补缺失股票；不生成虚构绩效；当前本地样本不足以直接实盘。",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(input_path.relative_to(ROOT)) if input_path.is_relative_to(ROOT) else str(input_path),
        "rows": int(len(raw)),
        "source_counts": raw["source"].value_counts(dropna=False).to_dict() if "source" in raw.columns else {},
        "factor_rows": int(len(factor_rows)),
        "unique_stocks": int(raw["code"].nunique()),
        "unique_dates": int(raw["date"].nunique()),
        "min_stock_history_rows": int(eligible.min()),
        "max_stock_history_rows": int(eligible.max()),
        "min_stocks_per_day_required": int(args.min_stocks),
        "factor_count": len(FACTOR_DEFS),
        "factor_result_count": len(factor_results),
        "strategy_result_count": len(strategy_results),
        "strategy_layer_policy": "本地分层只使用真实OHLCV可得字段：市场等权20日波动、20日成交额；成交额缺失时用真实成交量兜底；不伪造市值。",
        "factor_definitions": FACTOR_DEFS,
        "factor_results": factor_results,
        "strategy_results": strategy_results,
    }

    factor_output = RESULTS_DIR / "akshare_ohlcv_factor_backtest_results.json"
    factor_csv = RESULTS_DIR / "akshare_ohlcv_factor_values.csv"
    summary_output = RESULTS_DIR / "akshare_ohlcv_factor_backtest_summary.json"
    factor_output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_output.write_text(json.dumps({
        key: value for key, value in summary.items()
        if key not in {"factor_results", "strategy_results"}
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    export_cols = [
        "date",
        "code",
        "name",
        "source",
        "close",
        "liquidity_metric20",
        "ak_volume_price_confirmation",
        "ak_trend_quality",
        "ak_low_volatility_quality",
        "ak_kline_confirmation",
        "ak_crowding_risk",
        "ak_volume_trend_quality_combo",
        "ak_defensive_quality_combo",
        "ak_mean_reversion_quality_combo",
        "ak_anti_crowding_reversal_combo",
        "future_return_5",
        "future_return_10",
        "future_return_20",
    ]
    factors[export_cols].dropna(subset=["ak_volume_trend_quality_combo"]).to_csv(factor_csv, index=False, encoding="utf-8-sig")
    console_summary = {
        key: value for key, value in summary.items()
        if key not in {"factor_definitions", "factor_results", "strategy_results"}
    }
    print(json.dumps(console_summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
