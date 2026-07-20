#!/usr/bin/env python3
"""Build index-enhancement research results from real AkShare OHLCV data.

This is a research kernel, not a production trading claim. With the current
available data it uses static index constituents and an equal-weight benchmark.
It does not synthesize market caps, industries, index weights, amount, turnover,
or future returns.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
BASE_DIR = ROOT / "outputs" / "sources" / "akshare" / "index_enhancement"
PROCESSED_DIR = BASE_DIR / "processed"
RESULTS_DIR = BASE_DIR / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"


FACTOR_COLUMNS = [
    "f_medium_momentum",
    "f_long_momentum",
    "f_active_momentum",
    "f_active_reversal",
    "f_risk_adjusted_momentum",
    "f_consistent_momentum",
    "f_momentum_exhaustion",
    "f_short_reversal",
    "f_low_volatility",
    "f_residual_low_volatility",
    "f_downside_resilience",
    "f_tail_risk_control",
    "f_drawdown_control",
    "f_recovery_potential",
    "f_beta_stability",
    "f_gap_risk_control",
    "f_volume_stability",
    "f_volume_confirmation",
    "f_volume_dry_up_rebound",
    "f_close_strength",
    "f_intraday_accumulation",
    "f_intraday_distribution_reversal",
    "f_pullback_support",
    "f_orderly_trend",
    "f_breakout_quality",
    "f_anti_crowding",
    "f_market_regime_fit",
]

FACTOR_GATES = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.015,
    "min_rank_ic_t": 2.0,
    "min_long_short": 0.0,
    "min_long_short_positive_ratio": 0.53,
}


@dataclass
class Metrics:
    total_return: float | None
    annual_return: float | None
    annual_vol: float | None
    sharpe: float | None
    annual_downside_vol: float | None
    sortino: float | None
    calmar: float | None
    max_drawdown: float | None
    win_rate: float | None
    mean_period_return: float | None
    period_count: int


def clean_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def pct(value: float | None) -> str:
    if value is None:
        return "NA"
    return f"{value * 100:.2f}%"


def number(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "NA"
    return f"{value:.{digits}f}"


def rank_ic(left: pd.Series, right: pd.Series) -> float | None:
    """Spearman rank correlation without requiring scipy."""
    pair = pd.concat([left, right], axis=1).replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < 30:
        return None
    x = pair.iloc[:, 0].rank(method="average")
    y = pair.iloc[:, 1].rank(method="average")
    if x.nunique() < 2 or y.nunique() < 2:
        return None
    value = x.corr(y)
    return clean_float(value)


def daily_rank_ic(day: pd.DataFrame, columns: list[str], target: str, min_count: int = 30) -> dict[str, float | None]:
    ranked = day[columns + [target]].replace([np.inf, -np.inf], np.nan).rank(method="average")
    target_rank = ranked[target].to_numpy(dtype=float)
    out: dict[str, float | None] = {}
    for col in columns:
        x = ranked[col].to_numpy(dtype=float)
        mask = np.isfinite(x) & np.isfinite(target_rank)
        if mask.sum() < min_count:
            out[col] = None
            continue
        x = x[mask]
        y = target_rank[mask]
        x_std = x.std()
        y_std = y.std()
        if x_std <= 0 or y_std <= 0:
            out[col] = None
            continue
        out[col] = clean_float(np.mean((x - x.mean()) * (y - y.mean())) / (x_std * y_std))
    return out


def matrix_rank_ic(ranked: pd.DataFrame, factor_cols: list[str], target: str, min_count: int = 30) -> tuple[dict[str, float | None], pd.Series]:
    """Column-wise rank correlation against one target without pandas apply."""
    x = ranked[factor_cols].to_numpy(dtype=float)
    y = ranked[target].to_numpy(dtype=float)
    valid = np.isfinite(x) & np.isfinite(y)[:, None]
    counts = valid.sum(axis=0)
    safe_counts = np.where(counts > 0, counts, 1)

    x_zero = np.where(valid, x, 0.0)
    y_matrix = np.where(valid, y[:, None], 0.0)
    x_mean = x_zero.sum(axis=0) / safe_counts
    y_mean = y_matrix.sum(axis=0) / safe_counts
    x_centered = np.where(valid, x - x_mean, 0.0)
    y_centered = np.where(valid, y[:, None] - y_mean, 0.0)
    cov = (x_centered * y_centered).sum(axis=0) / safe_counts
    x_std = np.sqrt((x_centered * x_centered).sum(axis=0) / safe_counts)
    y_std = np.sqrt((y_centered * y_centered).sum(axis=0) / safe_counts)
    corr = np.divide(cov, x_std * y_std, out=np.full_like(cov, np.nan, dtype=float), where=(x_std > 0) & (y_std > 0) & (counts >= min_count))

    return {col: clean_float(value) for col, value in zip(factor_cols, corr)}, pd.Series(counts, index=factor_cols)


def rolling_beta(asset_ret: pd.Series, bench_ret: pd.Series, window: int) -> pd.Series:
    covariance = asset_ret.rolling(window, min_periods=max(20, window // 2)).cov(bench_ret)
    variance = bench_ret.rolling(window, min_periods=max(20, window // 2)).var()
    return covariance / variance.replace(0, np.nan)


def rolling_corr(asset_ret: pd.Series, bench_ret: pd.Series, window: int) -> pd.Series:
    return asset_ret.rolling(window, min_periods=max(20, window // 2)).corr(bench_ret)


def robust_z(series: pd.Series) -> pd.Series:
    x = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    if x.notna().sum() < 20:
        return pd.Series(0.0, index=series.index)
    lo, hi = x.quantile([0.01, 0.99])
    x = x.clip(lo, hi)
    median = x.median()
    mad = (x - median).abs().median()
    if not mad or np.isnan(mad):
        std = x.std(ddof=0)
        if not std or np.isnan(std):
            return pd.Series(0.0, index=series.index)
        z = (x - x.mean()) / std
    else:
        z = (x - median) / (1.4826 * mad)
    return z.clip(-5, 5).fillna(0.0)


def max_drawdown(returns: pd.Series) -> float | None:
    if returns.empty:
        return None
    nav = (1 + returns.fillna(0)).cumprod()
    dd = nav / nav.cummax() - 1
    return clean_float(dd.min())


def metric_summary(returns: pd.Series, periods_per_year: float = 252 / 20) -> Metrics:
    r = pd.to_numeric(returns, errors="coerce").dropna()
    if r.empty:
        return Metrics(None, None, None, None, None, None, None, None, None, None, 0)
    total = float((1 + r).prod() - 1)
    annual = float((1 + total) ** (periods_per_year / len(r)) - 1) if total > -1 else -1.0
    vol = float(r.std(ddof=0) * math.sqrt(periods_per_year)) if len(r) > 1 else None
    sharpe = float(annual / vol) if vol and vol > 0 else None
    downside = r.clip(upper=0)
    downside_vol = float(downside.std(ddof=0) * math.sqrt(periods_per_year)) if len(r) > 1 else None
    sortino = float(annual / downside_vol) if downside_vol and downside_vol > 0 else None
    mdd = max_drawdown(r)
    calmar = float(annual / abs(mdd)) if mdd and mdd < 0 else None
    return Metrics(
        total_return=total,
        annual_return=annual,
        annual_vol=vol,
        sharpe=sharpe,
        annual_downside_vol=downside_vol,
        sortino=sortino,
        calmar=calmar,
        max_drawdown=mdd,
        win_rate=float((r > 0).mean()),
        mean_period_return=float(r.mean()),
        period_count=int(len(r)),
    )


def read_price_data(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"code": str})
    required = {"date", "code", "open", "high", "low", "close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise SystemExit(f"{path} 缺少字段：{sorted(missing)}")
    df["date"] = pd.to_datetime(df["date"])
    df["code"] = df["code"].map(lambda x: str(x).zfill(6))
    if "name" not in df.columns:
        df["name"] = df["code"]
    for col in ["open", "high", "low", "close", "volume", "amount", "turnover"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["date", "code", "close"]).sort_values(["code", "date"])
    return df


def add_time_series_features(df: pd.DataFrame, horizons: list[int]) -> pd.DataFrame:
    out = df.copy()
    out["_code"] = out["code"]
    out["_name"] = out["name"]
    group = out.groupby("code", group_keys=False)
    out["ret_1"] = group["close"].pct_change(1)
    out["benchmark_ret_1"] = out.groupby("date")["ret_1"].transform("mean")
    for window in [5, 10, 20, 40, 60, 120, 240]:
        out[f"ret_{window}"] = group["close"].pct_change(window)
        out[f"vol_{window}"] = group["ret_1"].transform(lambda x, w=window: x.rolling(w, min_periods=max(5, w // 2)).std())
        out[f"ma_{window}"] = group["close"].transform(lambda x, w=window: x.rolling(w, min_periods=max(5, w // 2)).mean())
        out[f"volume_ma_{window}"] = group["volume"].transform(lambda x, w=window: x.rolling(w, min_periods=max(5, w // 2)).mean())
        out[f"positive_ratio_{window}"] = group["ret_1"].transform(lambda x, w=window: (x > 0).rolling(w, min_periods=max(5, w // 2)).mean())
    out["downside_vol_20"] = group["ret_1"].transform(lambda x: x.clip(upper=0).rolling(20, min_periods=10).std())
    out["downside_vol_60"] = group["ret_1"].transform(lambda x: x.clip(upper=0).rolling(60, min_periods=30).std())
    out["tail_loss_20"] = group["ret_1"].transform(lambda x: x.rolling(20, min_periods=15).quantile(0.05))
    out["tail_loss_60"] = group["ret_1"].transform(lambda x: x.rolling(60, min_periods=30).quantile(0.05))
    out["skew_20"] = group["ret_1"].transform(lambda x: x.rolling(20, min_periods=15).skew())
    out["prev_close"] = group["close"].shift(1)
    out["gap_abs"] = (out["open"] / out["prev_close"] - 1).abs()
    out["gap_abs_20"] = group["gap_abs"].transform(lambda x: x.rolling(20, min_periods=10).mean())
    out["drawdown_60"] = out["close"] / group["close"].transform(lambda x: x.rolling(60, min_periods=30).max()) - 1
    out["drawdown_120"] = out["close"] / group["close"].transform(lambda x: x.rolling(120, min_periods=60).max()) - 1
    out["ma20_gap"] = out["close"] / out["ma_20"] - 1
    out["ma60_gap"] = out["close"] / out["ma_60"] - 1
    out["ma_structure"] = out["ma_20"] / out["ma_60"] - 1
    out["ma120_structure"] = out["ma_60"] / out["ma_120"] - 1
    daily_range = (out["high"] - out["low"]).replace(0, np.nan)
    out["close_position"] = (out["close"] - out["low"]) / daily_range
    out["body_ratio"] = (out["close"] - out["open"]) / daily_range
    out["upper_shadow_ratio"] = (out["high"] - out[["open", "close"]].max(axis=1)) / daily_range
    out["lower_shadow_ratio"] = (out[["open", "close"]].min(axis=1) - out["low"]) / daily_range
    out["volume_ratio_20_60"] = out["volume_ma_20"] / out["volume_ma_60"] - 1
    out["volume_cv_20"] = group["volume"].transform(lambda x: x.rolling(20, min_periods=10).std()) / out["volume_ma_20"]
    out["volume_cv_60"] = group["volume"].transform(lambda x: x.rolling(60, min_periods=30).std()) / out["volume_ma_60"]
    out["intraday_return"] = out["close"] / out["open"] - 1
    out["intraday_accumulation_20"] = group["intraday_return"].transform(lambda x: x.rolling(20, min_periods=10).mean())
    out["breakout_120"] = out["close"] / group["close"].transform(lambda x: x.rolling(120, min_periods=60).max()) - 1

    def add_relative_features(one: pd.DataFrame) -> pd.DataFrame:
        one = one.sort_values("date").copy()
        beta = rolling_beta(one["ret_1"], one["benchmark_ret_1"], 60)
        corr = rolling_corr(one["ret_1"], one["benchmark_ret_1"], 60)
        residual = one["ret_1"] - beta.fillna(1.0) * one["benchmark_ret_1"]
        one["beta_60"] = beta
        one["corr_60"] = corr
        one["residual_ret_1"] = residual
        one["residual_vol_60"] = residual.rolling(60, min_periods=30).std()
        for window in [20, 60, 120]:
            bench_compound = (1 + one["benchmark_ret_1"]).rolling(window, min_periods=max(10, window // 2)).apply(np.prod, raw=True) - 1
            one[f"active_ret_{window}"] = one[f"ret_{window}"] - bench_compound
        one["residual_positive_ratio_60"] = (residual > 0).rolling(60, min_periods=30).mean()
        return one

    out = out.groupby("code", group_keys=False).apply(add_relative_features, include_groups=False)
    out["code"] = out.pop("_code")
    out["name"] = out.pop("_name")
    group = out.groupby("code", group_keys=False)
    for horizon in horizons:
        out[f"fwd_ret_{horizon}"] = group["close"].shift(-horizon) / out["close"] - 1
    return out


def add_cross_sectional_factors(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    raw = pd.DataFrame(index=out.index)
    raw["f_medium_momentum"] = out["ret_60"] - 0.35 * out["ret_5"].clip(lower=0)
    raw["f_long_momentum"] = out["ret_120"] - 0.50 * out["vol_60"].fillna(0)
    raw["f_active_momentum"] = 0.55 * out["active_ret_60"] + 0.35 * out["active_ret_120"] + 0.10 * out["active_ret_20"]
    raw["f_active_reversal"] = -(0.55 * out["active_ret_60"] + 0.35 * out["active_ret_120"] + 0.10 * out["active_ret_20"])
    raw["f_risk_adjusted_momentum"] = out["ret_60"] / (out["vol_60"].replace(0, np.nan) * np.sqrt(60))
    raw["f_consistent_momentum"] = out["positive_ratio_60"] + out["residual_positive_ratio_60"] - out["vol_60"].fillna(0) * 5
    raw["f_momentum_exhaustion"] = -(
        out["ret_60"].clip(lower=0).fillna(0)
        + out["ret_120"].clip(lower=0).fillna(0) * 0.6
        + out["intraday_accumulation_20"].clip(lower=0).fillna(0) * 3.0
    )
    raw["f_short_reversal"] = -out["ret_5"]
    raw["f_low_volatility"] = -out["vol_20"]
    raw["f_residual_low_volatility"] = -out["residual_vol_60"]
    raw["f_downside_resilience"] = -out["downside_vol_60"]
    raw["f_tail_risk_control"] = out["tail_loss_60"] + out["skew_20"].clip(upper=0).fillna(0) * 0.01
    raw["f_drawdown_control"] = out["drawdown_120"]
    raw["f_recovery_potential"] = -out["drawdown_120"].abs() + out["lower_shadow_ratio"].fillna(0) * 0.08 + out["volume_ratio_20_60"].clip(upper=0).abs() * 0.04
    raw["f_beta_stability"] = -(out["beta_60"] - 1.0).abs() - out["corr_60"].fillna(0).abs() * 0.05
    raw["f_gap_risk_control"] = -out["gap_abs_20"]
    raw["f_volume_stability"] = -out["volume_cv_20"]
    raw["f_volume_confirmation"] = out["ret_20"].clip(-0.2, 0.4) * np.sign(out["volume_ratio_20_60"].fillna(0))
    raw["f_volume_dry_up_rebound"] = -out["volume_ratio_20_60"].clip(upper=0).abs() + out["ret_5"].clip(lower=0) - out["ma20_gap"].clip(lower=0)
    raw["f_close_strength"] = out["close_position"] - out["upper_shadow_ratio"].fillna(0)
    raw["f_intraday_accumulation"] = out["intraday_accumulation_20"] - out["upper_shadow_ratio"].fillna(0) * 0.02
    raw["f_intraday_distribution_reversal"] = -out["intraday_accumulation_20"] - out["upper_shadow_ratio"].fillna(0) * 0.02 + out["lower_shadow_ratio"].fillna(0) * 0.02
    raw["f_pullback_support"] = out["ma_structure"].clip(lower=0) - out["ma20_gap"].abs() + out["lower_shadow_ratio"].fillna(0) * 0.25
    raw["f_orderly_trend"] = out["ret_60"] + out["ma_structure"] + out["ma120_structure"] - 2.0 * out["vol_60"].fillna(0) - out["ma60_gap"].clip(lower=0) * 0.30
    raw["f_breakout_quality"] = out["breakout_120"] + out["close_position"] * 0.05 - out["volume_ratio_20_60"].clip(lower=0) * 0.05
    raw["f_anti_crowding"] = -(
        out["ret_20"].clip(lower=0).fillna(0)
        + out["volume_ratio_20_60"].clip(lower=0).fillna(0) * 0.35
        + out["ma20_gap"].clip(lower=0).fillna(0) * 0.50
    )
    market_trend = out.groupby("date")["ret_60"].transform("mean")
    raw["f_market_regime_fit"] = np.where(
        market_trend >= 0,
        raw["f_risk_adjusted_momentum"] + raw["f_orderly_trend"],
        raw["f_downside_resilience"] + raw["f_tail_risk_control"] + raw["f_short_reversal"],
    )
    out[FACTOR_COLUMNS] = raw[FACTOR_COLUMNS]
    # Cross-sectional percentile scores are fast, robust to extreme OHLCV prints,
    # and aligned with the rank-IC objective used to validate the factors.
    ranks = out.groupby("date")[FACTOR_COLUMNS].rank(pct=True)
    zscores = (ranks - 0.5) * 2.0
    for col in FACTOR_COLUMNS:
        out[f"z_{col}"] = zscores[col].fillna(0.0)
    return out


def factor_ic_table(df: pd.DataFrame, horizons: list[int], step: int, factors: list[str] | None = None) -> list[dict]:
    rows = []
    factors = factors or FACTOR_COLUMNS
    factor_cols = [f"z_{factor}" if factor in FACTOR_COLUMNS else factor for factor in factors]
    values_by_key: dict[tuple[str, int], list[float]] = {(factor, horizon): [] for factor in factors for horizon in horizons}
    long_short_by_key: dict[tuple[str, int], list[float]] = {(factor, horizon): [] for factor in factors for horizon in horizons}
    col_to_factor = dict(zip(factor_cols, factors))
    for horizon in horizons:
        target = f"fwd_ret_{horizon}"
        for idx, (_, day) in enumerate(df.groupby("date")):
            if step > 1 and idx % step:
                continue
            clean_day = day[factor_cols + [target]].replace([np.inf, -np.inf], np.nan)
            if clean_day[target].notna().sum() < 30:
                continue
            # Rank all columns once per day/horizon. This keeps strict step=1
            # audits practical while preserving the same Spearman objective.
            ranked = clean_day.rank(method="average")
            ic_by_col, valid_counts = matrix_rank_ic(ranked, factor_cols, target)

            factor_rank_pct = clean_day[factor_cols].rank(method="first", pct=True)
            valid_return = clean_day[target].notna()
            top_mask = factor_rank_pct.gt(0.8).mul(valid_return, axis=0).astype(bool)
            bottom_mask = factor_rank_pct.le(0.2).mul(valid_return, axis=0).astype(bool)
            top_counts = top_mask.sum()
            bottom_counts = bottom_mask.sum()
            top_returns = top_mask.mul(clean_day[target], axis=0).sum() / top_counts.replace(0, np.nan)
            bottom_returns = bottom_mask.mul(clean_day[target], axis=0).sum() / bottom_counts.replace(0, np.nan)

            for col, ic in ic_by_col.items():
                factor = col_to_factor[col]
                if valid_counts.get(col, 0) >= 30:
                    clean_ic = clean_float(ic)
                    if clean_ic is not None:
                        values_by_key[(factor, horizon)].append(clean_ic)
                if top_counts.get(col, 0) >= 5 and bottom_counts.get(col, 0) >= 5:
                    long_short = clean_float(top_returns.get(col) - bottom_returns.get(col))
                    if long_short is not None:
                        long_short_by_key[(factor, horizon)].append(long_short)
    for factor in factors:
        for horizon in horizons:
            values = values_by_key[(factor, horizon)]
            series = pd.Series(values, dtype=float)
            mean = clean_float(series.mean())
            std = clean_float(series.std(ddof=0))
            long_short_series = pd.Series(long_short_by_key[(factor, horizon)], dtype=float)
            long_short_mean = clean_float(long_short_series.mean())
            rank_ic_t = clean_float(mean / (std / math.sqrt(len(series)))) if mean is not None and std and len(series) > 1 else None
            rows.append({
                "factor": factor,
                "horizon": horizon,
                "sample_dates": int(series.count()),
                "rank_ic_mean": mean,
                "rank_ic_std": std,
                "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
                "rank_ic_t": rank_ic_t,
                "long_short_mean": long_short_mean,
                "long_short_positive_ratio": clean_float((long_short_series > 0).mean()) if not long_short_series.empty else None,
                "positive_ratio": clean_float((series > 0).mean()) if not series.empty else None,
            })
    return rows


def rebalance_dates(df: pd.DataFrame, step: int, min_date: pd.Timestamp | None = None) -> list[pd.Timestamp]:
    dates = sorted(df["date"].dropna().unique())
    if min_date is not None:
        dates = [d for d in dates if d >= min_date]
    return dates[::step]


def turnover(prev: dict[str, float], current: dict[str, float]) -> float:
    keys = set(prev) | set(current)
    return 0.5 * sum(abs(current.get(k, 0.0) - prev.get(k, 0.0)) for k in keys)


def build_alpha_sleeve(
    day: pd.DataFrame,
    score_col: str,
    top_n: int,
    prev_weights: dict[str, float],
    buffer_multiple: float,
    risk_penalty: float,
) -> pd.DataFrame:
    work = day.copy()
    risk_cols = ["z_f_low_volatility", "z_f_residual_low_volatility", "z_f_tail_risk_control", "z_f_gap_risk_control"]
    risk_score = pd.Series(0.0, index=work.index)
    for col in risk_cols:
        if col in work.columns:
            risk_score += work[col].fillna(0.0)
    work["portfolio_score"] = work[score_col].fillna(0.0) + risk_penalty * risk_score / max(1, len(risk_cols))
    work = work.sort_values("portfolio_score", ascending=False).reset_index(drop=True)
    work["rank"] = np.arange(1, len(work) + 1)

    keep_limit = max(top_n, int(round(top_n * buffer_multiple)))
    previous_codes = set(prev_weights)
    keep_prev = work[(work["code"].isin(previous_codes)) & (work["rank"] <= keep_limit)]
    needed = max(0, top_n - len(keep_prev))
    additions = work[~work["code"].isin(set(keep_prev["code"]))].head(needed)
    selected = pd.concat([keep_prev, additions], ignore_index=True).head(top_n)
    if selected.empty:
        return selected
    selected["raw_weight"] = selected["portfolio_score"].rank(method="first", ascending=True)
    selected["weight"] = selected["raw_weight"] / selected["raw_weight"].sum()
    return selected


def portfolio_backtest(
    df: pd.DataFrame,
    score_col: str,
    horizon: int,
    top_n: int,
    core_weight: float,
    cost: float,
    min_stocks: int,
    buffer_multiple: float,
    risk_penalty: float,
) -> tuple[pd.DataFrame, dict]:
    records = []
    prev_alpha_weights: dict[str, float] = {}
    min_date = df["date"].min() + pd.Timedelta(days=260)
    for date in rebalance_dates(df, horizon, min_date=min_date):
        day = df[df["date"] == date].copy()
        day = day.dropna(subset=[score_col, f"fwd_ret_{horizon}", "close"])
        day = day[day["close"] > 0]
        if len(day) < max(min_stocks, top_n * 2):
            continue
        benchmark_return = float(day[f"fwd_ret_{horizon}"].mean())
        alpha = build_alpha_sleeve(day, score_col, top_n, prev_alpha_weights, buffer_multiple, risk_penalty)
        if alpha.empty:
            continue
        alpha_return = float((alpha[f"fwd_ret_{horizon}"] * alpha["weight"]).sum())
        alpha_weights = dict(zip(alpha["code"], alpha["weight"]))
        to = turnover(prev_alpha_weights, alpha_weights)
        prev_alpha_weights = alpha_weights
        gross = core_weight * benchmark_return + (1 - core_weight) * alpha_return
        # Charge turnover only on the active sleeve; benchmark core is treated as passive.
        net = gross - to * cost * (1 - core_weight)
        active = net - benchmark_return
        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "score_col": score_col,
            "eligible_count": int(len(day)),
            "selected_count": int(len(alpha)),
            "benchmark_return": benchmark_return,
            "alpha_sleeve_return": alpha_return,
            "strategy_return": net,
            "active_return": active,
            "turnover": to,
            "buffer_multiple": buffer_multiple,
            "risk_penalty": risk_penalty,
            "selected_codes": ",".join(alpha["code"].tolist()),
        })
    frame = pd.DataFrame(records)
    metrics = {
        "strategy": metric_summary(frame["strategy_return"] if not frame.empty else pd.Series(dtype=float)).__dict__,
        "benchmark": metric_summary(frame["benchmark_return"] if not frame.empty else pd.Series(dtype=float)).__dict__,
        "active": metric_summary(frame["active_return"] if not frame.empty else pd.Series(dtype=float)).__dict__,
        "avg_turnover": clean_float(frame["turnover"].mean()) if not frame.empty else None,
        "avg_eligible_count": clean_float(frame["eligible_count"].mean()) if not frame.empty else None,
        "worst_period_active": clean_float(frame["active_return"].min()) if not frame.empty else None,
    }
    return frame, metrics


def yearly_table(trades: pd.DataFrame) -> list[dict]:
    if trades.empty:
        return []
    work = trades.copy()
    work["year"] = pd.to_datetime(work["date"]).dt.year
    rows = []
    for year, group in work.groupby("year"):
        rows.append({
            "year": int(year),
            "periods": int(len(group)),
            "strategy_return": clean_float((1 + group["strategy_return"]).prod() - 1),
            "benchmark_return": clean_float((1 + group["benchmark_return"]).prod() - 1),
            "active_return": clean_float((1 + group["active_return"]).prod() - 1),
            "active_win_rate": clean_float((group["active_return"] > 0).mean()),
        })
    return rows


def stability_score(portfolio: dict) -> float:
    metrics = portfolio["metrics"]
    active = metrics["active"]
    sharpe = active.get("sharpe") or -5.0
    total = active.get("total_return") or -1.0
    drawdown = abs(active.get("max_drawdown") or 0.0)
    turnover_value = metrics.get("avg_turnover") or 1.0
    yearly = portfolio.get("yearly", [])
    yearly_win = np.mean([1 if (row.get("active_return") or 0) > 0 else 0 for row in yearly]) if yearly else 0.0
    worst_year = min([row.get("active_return") or 0 for row in yearly], default=0.0)
    return float(sharpe + total * 0.40 + yearly_win * 0.35 + worst_year * 0.20 - drawdown * 0.60 - turnover_value * 0.15)


def factor_passes_gate(row: dict) -> bool:
    return (
        (row.get("sample_dates") or 0) >= FACTOR_GATES["min_sample_dates"]
        and (row.get("rank_ic_mean") is not None and row["rank_ic_mean"] >= FACTOR_GATES["min_rank_ic"])
        and (row.get("rank_ic_t") is not None and row["rank_ic_t"] >= FACTOR_GATES["min_rank_ic_t"])
        and (row.get("long_short_mean") is not None and row["long_short_mean"] > FACTOR_GATES["min_long_short"])
        and (row.get("long_short_positive_ratio") is not None and row["long_short_positive_ratio"] >= FACTOR_GATES["min_long_short_positive_ratio"])
    )


def best_primary_factor_rows(ic_rows: list[dict], primary_horizon: int) -> dict[str, dict]:
    primary_rows = [row for row in ic_rows if row.get("horizon") == primary_horizon]
    return {row["factor"]: row for row in primary_rows if row.get("factor")}


def score_cols_after_factor_gate(args: argparse.Namespace, score_cols: list[str], ic_rows: list[dict]) -> tuple[list[str], list[dict]]:
    best_rows = best_primary_factor_rows(ic_rows, args.primary_horizon)
    passed_factor_ids = {factor for factor, row in best_rows.items() if factor_passes_gate(row)}
    allowed = []
    audit_rows = []
    for score_col in score_cols:
        factor_id = score_col[2:] if score_col.startswith("z_") else score_col
        row = best_rows.get(factor_id, {})
        passed = factor_id in passed_factor_ids
        audit_rows.append({
            "score_col": score_col,
            "factor": factor_id,
            "gate_passed": passed,
            "best_primary_result": row or None,
            "blocked_reason": None if passed else "factor_gate_not_passed",
        })
        if passed:
            allowed.append(score_col)
    if args.force_strategy_backtest_without_factor_gate:
        return score_cols, audit_rows
    return allowed, audit_rows


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_report(path: Path, result: dict) -> None:
    passed_gate_rows = [row for row in result.get("factor_gate_audit", []) if row.get("gate_passed")]
    blocked_gate_rows = [row for row in result.get("factor_gate_audit", []) if not row.get("gate_passed")]
    portfolio_count = len(result.get("portfolios", []))
    lines = [
        "# 指数增强研究内核报告",
        "",
        f"生成时间：{result['generated_at']}",
        "",
        "## 直接结论",
        "",
        f"- 严格因子门禁通过：{len(passed_gate_rows)} / {len(result.get('factor_gate_audit', []))}。",
        f"- 准入型策略组合回测数量：{portfolio_count}。",
        "- 本轮按 1/5/10/20 日逐日 RankIC 和日度 Top20%-Bottom20% 多空收益重做后，没有 score_col 通过 20 日主周期门禁。" if not passed_gate_rows else "- 已有 score_col 通过门禁，可进入后续交易回测和 JoinQuant 复核。",
        "- 未通过门禁前，不使用旧的强制绕门禁组合收益作为准入证据。" if not passed_gate_rows else "- 策略回测仍需补 JoinQuant 市值、行业、流动性、停牌涨跌停和成本复核。",
        "",
        "## 数据边界",
        "",
        "- 使用真实 AkShare OHLCV 数据。",
        "- 当前版本使用静态指数成分池和等权基准，不使用历史成分、真实指数权重、市值、行业或基本面。",
        "- 腾讯日线源缺成交额和换手率；本报告不伪造成交额、换手率或市值。",
        "- v2 内核加入主动动量、残差低波、尾部风险、跳空风险、量价确认、趋势一致性、反拥挤和市场状态适配。",
        "- 组合构建加入持仓缓冲、风险惩罚、主动袖口换手成本和稳定性评分。",
        "- 标准流程：先做因子回测门禁，再做策略回测；因子未过门禁的 score_col 不进入策略回测。",
        "- 结果用于研究筛选，不等同于可实盘指数增强产品。",
        "",
        "## 因子门禁",
        "",
        f"- 样本日 >= {result['factor_gate']['min_sample_dates']}",
        f"- RankIC >= {result['factor_gate']['min_rank_ic']}",
        f"- RankIC t >= {result['factor_gate']['min_rank_ic_t']}",
        f"- 多空收益 > {pct(result['factor_gate']['min_long_short'])}",
        f"- 多空胜率 >= {pct(result['factor_gate']['min_long_short_positive_ratio'])}",
        f"- 策略回测准入：{'必须通过因子门禁' if result['strategy_backtest_policy']['strategy_backtest_requires_factor_gate'] else '诊断模式，允许绕过因子门禁但不得用于准入'}",
        f"- RankIC 方法：{result.get('factor_backtest_policy', {}).get('rank_ic_method', '-')}",
        f"- 多空方法：{result.get('factor_backtest_policy', {}).get('long_short_method', '-')}",
        "",
        "## 数据概况",
        "",
        "| 指数 | 股票数 | 行数 | 日期数 | 起止日期 |",
        "| --- | ---: | ---: | ---: | --- |",
    ]
    for dataset in result["datasets"]:
        lines.append(
            f"| {dataset['index_name']} | {dataset['stocks']} | {dataset['rows']} | {dataset['dates']} | {dataset['start_date']} ~ {dataset['end_date']} |"
        )
    lines += ["", "## 因子 RankIC Top", "", "| 数据集 | 因子 | 期限 | 样本日 | RankIC | ICIR | 正IC比例 |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for row in result["factor_ic_top"]:
        lines.append(
            f"| {row['dataset']} | {row['factor']} | {row['horizon']} | {row['sample_dates']} | {number(row['rank_ic_mean'],4)} | {number(row['rank_ic_ir'],2)} | {pct(row['positive_ratio'])} |"
        )

    lines += ["", "## 因子门禁审计", "", "| 数据集 | score_col | 通过 | 20日RankIC | t值 | 多空收益 | 多空胜率 | 阻塞原因 |", "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |"]
    for row in result.get("factor_gate_audit", []):
        primary = row.get("best_primary_result") or {}
        lines.append(
            f"| {row['dataset']} | {row['score_col']} | {'是' if row.get('gate_passed') else '否'} | {number(primary.get('rank_ic_mean'),4)} | {number(primary.get('rank_ic_t'),2)} | {pct(primary.get('long_short_mean'))} | {pct(primary.get('long_short_positive_ratio'))} | {row.get('blocked_reason') or '-'} |"
        )
    lines += ["", "## 组合回测 Top", "", "| 数据集 | 策略 | 调仓 | TopN | 核心权重 | 缓冲 | 风险惩罚 | 稳定分 | 主动收益 | 主动年化 | 主动Sharpe | Sortino | Calmar | 主动回撤 | 均换手 | 最差单期主动 | 策略收益 | 基准收益 |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in result["portfolio_top"]:
        active = row["metrics"]["active"]
        strategy = row["metrics"]["strategy"]
        benchmark = row["metrics"]["benchmark"]
        lines.append(
            f"| {row['dataset']} | {row['score_col']} | {row['horizon']} | {row['top_n']} | {row['core_weight']:.0%} | {row['buffer_multiple']:.1f} | {row['risk_penalty']:.2f} | {number(row.get('stability_score'),2)} | {pct(active['total_return'])} | {pct(active['annual_return'])} | {number(active['sharpe'],2)} | {number(active.get('sortino'),2)} | {number(active.get('calmar'),2)} | {pct(active['max_drawdown'])} | {pct(row['metrics'].get('avg_turnover'))} | {pct(row['metrics'].get('worst_period_active'))} | {pct(strategy['total_return'])} | {pct(benchmark['total_return'])} |"
        )
    if not result["portfolio_top"]:
        lines.append("| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |")
    if result["portfolio_top"]:
        best = result["portfolio_top"][0]
        lines += [
            "",
            "## 当前首选研究组合",
            "",
            f"- 数据集：{best['dataset']}",
            f"- 评分：{best['score_col']}",
            f"- 参数：{best['horizon']}日调仓，Top{best['top_n']}，核心权重{best['core_weight']:.0%}，缓冲{best['buffer_multiple']:.1f}，风险惩罚{best['risk_penalty']:.2f}",
            f"- 交易明细：{best['trade_path']}",
        ]
    lines += ["", "## 下一步", "", "1. 补真实历史成分、指数权重、市值和行业，升级为严格指数增强。", "2. 使用成交额/换手率/财务数据扩展估值、质量、流动性和基本面因子。", "3. 对候选策略做年度分段、成本压力、涨跌停/停牌、容量和 JoinQuant 复核。", "4. 将首选组合接入 BigQuant/JoinQuant 做独立复核，确认停牌、涨跌停、滑点和容量约束后的表现。", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def run_for_dataset(path: Path, index_name: str, args: argparse.Namespace) -> tuple[dict, pd.DataFrame, list[dict]]:
    print(f"[{index_name}] read data: {path.relative_to(ROOT)}", flush=True)
    raw = read_price_data(path)
    print(f"[{index_name}] build time-series features rows={len(raw)} stocks={raw['code'].nunique()}", flush=True)
    features = add_time_series_features(raw, args.horizons)
    print(f"[{index_name}] build cross-sectional factors", flush=True)
    factors = add_cross_sectional_factors(features)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    factor_path = RESULTS_DIR / f"{index_name}_factor_values.csv"
    keep = ["date", "code", "name", "close"] + FACTOR_COLUMNS + [f"z_{c}" for c in FACTOR_COLUMNS] + [f"fwd_ret_{h}" for h in args.horizons]
    if args.write_factor_csv:
        print(f"[{index_name}] write factor csv: {factor_path.relative_to(ROOT)}", flush=True)
        factors[keep].to_csv(factor_path, index=False, encoding="utf-8-sig")
        factor_path_text = str(factor_path.relative_to(ROOT))
    else:
        factor_path_text = None
    requested_score_cols = resolve_score_cols(args)
    audit_factor_ids = factor_ids_from_score_cols(requested_score_cols) if args.score_cols else None
    print(f"[{index_name}] compute rank ic step={args.ic_step} factors={len(audit_factor_ids) if audit_factor_ids else 'all'}", flush=True)
    ic_rows = factor_ic_table(factors, args.horizons, args.ic_step, audit_factor_ids)
    for row in ic_rows:
        row["dataset"] = index_name

    portfolio_rows = []
    all_trades = []
    score_cols, factor_gate_rows = score_cols_after_factor_gate(args, requested_score_cols, ic_rows)
    for row in factor_gate_rows:
        row["dataset"] = index_name
    print(f"[{index_name}] factor gate allowed_score_cols={len(score_cols)}/{len(requested_score_cols)}", flush=True)
    for score_col in score_cols:
        for top_n in args.top_n:
            for core_weight in args.core_weight:
                for buffer_multiple in args.buffer_multiple:
                    for risk_penalty in args.risk_penalty:
                        trades, metrics = portfolio_backtest(
                            factors,
                            score_col=score_col,
                            horizon=args.primary_horizon,
                            top_n=top_n,
                            core_weight=core_weight,
                            cost=args.cost,
                            min_stocks=args.min_stocks,
                            buffer_multiple=buffer_multiple,
                            risk_penalty=risk_penalty,
                        )
                        suffix = f"top{top_n}_core{int(core_weight*100)}_buf{int(buffer_multiple*100)}_risk{int(risk_penalty*100)}"
                        trade_path = RESULTS_DIR / f"{index_name}_{score_col}_{suffix}_trades.csv"
                        trades.to_csv(trade_path, index=False, encoding="utf-8-sig")
                        row = {
                            "dataset": index_name,
                            "score_col": score_col,
                            "horizon": args.primary_horizon,
                            "top_n": top_n,
                            "core_weight": core_weight,
                            "cost": args.cost,
                            "buffer_multiple": buffer_multiple,
                            "risk_penalty": risk_penalty,
                            "metrics": metrics,
                            "yearly": yearly_table(trades),
                            "trade_path": str(trade_path.relative_to(ROOT)),
                        }
                        row["stability_score"] = stability_score(row)
                        portfolio_rows.append(row)
                        if not trades.empty:
                            tagged = trades.copy()
                            tagged["dataset"] = index_name
                            tagged["portfolio_id"] = f"{score_col}_{suffix}"
                            all_trades.append(tagged)
    dataset_summary = {
        "index_name": index_name,
        "source_path": str(path.relative_to(ROOT)),
        "factor_path": factor_path_text,
        "stocks": int(raw["code"].nunique()),
        "rows": int(len(raw)),
        "dates": int(raw["date"].nunique()),
        "start_date": raw["date"].min().strftime("%Y-%m-%d"),
        "end_date": raw["date"].max().strftime("%Y-%m-%d"),
    }
    trades_frame = pd.concat(all_trades, ignore_index=True) if all_trades else pd.DataFrame()
    return dataset_summary, trades_frame, ic_rows + portfolio_rows + factor_gate_rows


def parse_float_list(text: str) -> list[float]:
    return [float(item) for item in text.split(",") if item.strip()]


def parse_int_list(text: str) -> list[int]:
    return [int(item) for item in text.split(",") if item.strip()]


def parse_str_list(text: str) -> list[str]:
    return [item.strip() for item in text.split(",") if item.strip()]


def resolve_score_cols(args: argparse.Namespace) -> list[str]:
    if args.score_cols:
        resolved = []
        for item in parse_str_list(args.score_cols):
            if item.startswith("z_"):
                resolved.append(item)
            elif item in FACTOR_COLUMNS:
                resolved.append(f"z_{item}")
            else:
                raise SystemExit(f"未知 score_col: {item}")
        return resolved
    score_cols = []
    if args.include_factor_portfolios:
        score_cols += [f"z_{factor}" for factor in FACTOR_COLUMNS]
    return score_cols


def factor_ids_from_score_cols(score_cols: list[str]) -> list[str]:
    return [score_col[2:] if score_col.startswith("z_") else score_col for score_col in score_cols]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", default="", help="逗号分隔 daily CSV；默认读取 index_enhancement/processed/*_daily_*.csv")
    parser.add_argument("--horizons", type=parse_int_list, default=[1, 5, 10, 20])
    parser.add_argument("--primary-horizon", type=int, default=20)
    parser.add_argument("--top-n", type=parse_int_list, default=[30, 50, 80])
    parser.add_argument("--core-weight", type=parse_float_list, default=[0.70, 0.80, 0.90])
    parser.add_argument("--cost", type=float, default=0.001)
    parser.add_argument("--min-stocks", type=int, default=120)
    parser.add_argument("--buffer-multiple", type=parse_float_list, default=[1.2, 1.5])
    parser.add_argument("--risk-penalty", type=parse_float_list, default=[0.0, 0.20])
    parser.add_argument("--write-factor-csv", action="store_true", help="写出完整因子明细 CSV；默认跳过以加快研究迭代")
    parser.add_argument("--ic-step", type=int, default=5, help="RankIC 采样步长；1 为逐日完整审计，默认 5 用于快速研究迭代")
    parser.add_argument("--include-factor-portfolios", action="store_true", help="同时回测单因子 TopN 组合，用于诊断复合因子是否掩盖了有效信号")
    parser.add_argument("--score-cols", default="", help="只回测指定评分列，逗号分隔；因子名可省略 z_ 前缀")
    parser.add_argument("--force-strategy-backtest-without-factor-gate", action="store_true", help="研究诊断专用：允许未过因子门禁的 score_col 进入策略回测，结果不得用于准入")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    if args.inputs:
        paths = [Path(item).expanduser() for item in args.inputs.split(",") if item.strip()]
        paths = [p if p.is_absolute() else ROOT / p for p in paths]
    else:
        paths = sorted(PROCESSED_DIR.glob("*_daily_*_qfq.csv"))
    if not paths:
        raise SystemExit("没有找到可用 daily CSV，请先运行 fetch_index_enhancement_data.py")

    datasets = []
    all_ic = []
    all_portfolios = []
    all_factor_gates = []
    for path in paths:
        index_name = path.name.split("_daily_", 1)[0]
        dataset_summary, _, mixed_rows = run_for_dataset(path, index_name, args)
        datasets.append(dataset_summary)
        for row in mixed_rows:
            if "gate_passed" in row:
                all_factor_gates.append(row)
            elif "factor" in row:
                all_ic.append(row)
            else:
                all_portfolios.append(row)

    factor_ic_top = sorted(
        [row for row in all_ic if row.get("horizon") == args.primary_horizon and row.get("rank_ic_mean") is not None],
        key=lambda row: (row["rank_ic_mean"] or -999),
        reverse=True,
    )[:30]
    portfolio_top = sorted(
        all_portfolios,
        key=lambda row: (row.get("stability_score") or -999, (row["metrics"]["active"].get("sharpe") or -999), (row["metrics"]["active"].get("total_return") or -999)),
        reverse=True,
    )[:20]
    result = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "method_boundary": "static constituents, equal-weight benchmark, real OHLCV only",
        "data_policy": "本地 AkShare 真实 OHLCV 严格诊断回测；覆盖 1/5/10/20 日因子检验；静态指数成分、等权基准，未使用 JoinQuant 市值、行业、停牌涨跌停、换手率或真实指数权重；未通过因子门禁的评分列不进入准入型策略回测。",
        "factor_backtest_policy": {
            "horizons": args.horizons,
            "ic_step": args.ic_step,
            "primary_horizon": args.primary_horizon,
            "rank_ic_method": "daily_spearman_rank_correlation",
            "long_short_method": "daily_top_20pct_minus_bottom_20pct_by_factor_rank",
            "requires_all_primary_gate_checks": True,
        },
        "factor_gate": FACTOR_GATES,
        "factor_gate_audit": all_factor_gates,
        "strategy_backtest_policy": {
            "sequence": "factor_backtest_first_strategy_backtest_second",
            "strategy_backtest_requires_factor_gate": not args.force_strategy_backtest_without_factor_gate,
            "forced_strategy_backtest_without_factor_gate": bool(args.force_strategy_backtest_without_factor_gate),
        },
        "datasets": datasets,
        "factor_ic": all_ic,
        "factor_ic_top": factor_ic_top,
        "portfolios": all_portfolios,
        "portfolio_top": portfolio_top,
    }
    json_path = RESULTS_DIR / "index_enhancement_research_results.json"
    report_path = DOCS_DIR / "akshare-index-enhancement-research.md"
    write_json(json_path, result)
    write_report(report_path, result)
    print(json.dumps({
        "result": str(json_path.relative_to(ROOT)),
        "report": str(report_path.relative_to(ROOT)),
        "datasets": datasets,
        "top_portfolio": portfolio_top[:1],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
