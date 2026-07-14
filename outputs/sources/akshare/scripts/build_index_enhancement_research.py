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

COMPOSITES = {
    "ie_balanced_alpha_v1": {
        "name": "指数增强均衡Alpha v1",
        "weights": {
            "f_medium_momentum": 0.12,
            "f_long_momentum": 0.08,
            "f_active_momentum": 0.10,
            "f_risk_adjusted_momentum": 0.08,
            "f_consistent_momentum": 0.08,
            "f_short_reversal": 0.06,
            "f_low_volatility": 0.08,
            "f_residual_low_volatility": 0.08,
            "f_downside_resilience": 0.08,
            "f_tail_risk_control": 0.06,
            "f_drawdown_control": 0.08,
            "f_beta_stability": 0.05,
            "f_gap_risk_control": 0.04,
            "f_volume_stability": 0.06,
            "f_volume_confirmation": 0.06,
            "f_volume_dry_up_rebound": 0.04,
            "f_close_strength": 0.04,
            "f_intraday_accumulation": 0.04,
            "f_pullback_support": 0.04,
            "f_orderly_trend": 0.07,
            "f_breakout_quality": 0.04,
            "f_anti_crowding": 0.05,
            "f_market_regime_fit": 0.04,
        },
    },
    "ie_defensive_quality_v1": {
        "name": "指数增强防守质量 v1",
        "weights": {
            "f_low_volatility": 0.24,
            "f_residual_low_volatility": 0.16,
            "f_downside_resilience": 0.18,
            "f_tail_risk_control": 0.12,
            "f_drawdown_control": 0.14,
            "f_beta_stability": 0.10,
            "f_gap_risk_control": 0.08,
            "f_volume_stability": 0.10,
            "f_orderly_trend": 0.06,
            "f_pullback_support": 0.04,
            "f_anti_crowding": 0.04,
        },
    },
    "ie_momentum_quality_v1": {
        "name": "指数增强动量质量 v1",
        "weights": {
            "f_medium_momentum": 0.24,
            "f_long_momentum": 0.14,
            "f_active_momentum": 0.16,
            "f_risk_adjusted_momentum": 0.12,
            "f_consistent_momentum": 0.12,
            "f_orderly_trend": 0.12,
            "f_breakout_quality": 0.08,
            "f_volume_confirmation": 0.08,
            "f_intraday_accumulation": 0.06,
            "f_close_strength": 0.06,
            "f_low_volatility": 0.04,
            "f_drawdown_control": 0.04,
            "f_anti_crowding": 0.04,
        },
    },
    "ie_reversal_resilience_v1": {
        "name": "指数增强反转韧性 v1",
        "weights": {
            "f_short_reversal": 0.24,
            "f_pullback_support": 0.16,
            "f_downside_resilience": 0.16,
            "f_tail_risk_control": 0.10,
            "f_volume_stability": 0.10,
            "f_volume_dry_up_rebound": 0.08,
            "f_low_volatility": 0.10,
            "f_close_strength": 0.08,
            "f_gap_risk_control": 0.06,
            "f_anti_crowding": 0.12,
        },
    },
    "ie_apex_ohlcv_alpha_v2": {
        "name": "指数增强 OHLCV 极致Alpha v2",
        "weights": {
            "f_active_momentum": 0.13,
            "f_risk_adjusted_momentum": 0.11,
            "f_consistent_momentum": 0.09,
            "f_orderly_trend": 0.09,
            "f_residual_low_volatility": 0.09,
            "f_downside_resilience": 0.08,
            "f_tail_risk_control": 0.07,
            "f_drawdown_control": 0.07,
            "f_volume_stability": 0.06,
            "f_volume_confirmation": 0.06,
            "f_intraday_accumulation": 0.05,
            "f_breakout_quality": 0.05,
            "f_short_reversal": 0.04,
            "f_anti_crowding": 0.06,
            "f_market_regime_fit": 0.05,
        },
    },
    "ie_low_turnover_resilience_v2": {
        "name": "指数增强低换手韧性 v2",
        "weights": {
            "f_active_momentum": 0.10,
            "f_consistent_momentum": 0.12,
            "f_low_volatility": 0.12,
            "f_residual_low_volatility": 0.12,
            "f_downside_resilience": 0.12,
            "f_tail_risk_control": 0.10,
            "f_drawdown_control": 0.10,
            "f_beta_stability": 0.08,
            "f_gap_risk_control": 0.06,
            "f_volume_stability": 0.08,
            "f_orderly_trend": 0.06,
            "f_anti_crowding": 0.04,
        },
    },
    "ie_low_crowding_resilience_v3": {
        "name": "指数增强低拥挤韧性 v3",
        "weights": {
            "f_residual_low_volatility": 0.18,
            "f_anti_crowding": 0.18,
            "f_volume_stability": 0.16,
            "f_gap_risk_control": 0.12,
            "f_low_volatility": 0.10,
            "f_short_reversal": 0.10,
            "f_downside_resilience": 0.06,
            "f_tail_risk_control": 0.05,
            "f_beta_stability": 0.03,
            "f_close_strength": 0.02,
        },
    },
    "ie_reversal_recovery_v3": {
        "name": "指数增强反转修复 v3",
        "weights": {
            "f_active_reversal": 0.18,
            "f_momentum_exhaustion": 0.16,
            "f_recovery_potential": 0.14,
            "f_short_reversal": 0.12,
            "f_intraday_distribution_reversal": 0.10,
            "f_anti_crowding": 0.10,
            "f_volume_stability": 0.08,
            "f_residual_low_volatility": 0.08,
            "f_gap_risk_control": 0.04,
        },
    },
    "ie_volume_confirmed_alpha_v4": {
        "name": "指数增强量价确认 Alpha v4",
        "weights": {
            "f_volume_confirmation": 0.34,
            "f_medium_momentum": 0.14,
            "f_orderly_trend": 0.12,
            "f_market_regime_fit": 0.10,
            "f_short_reversal": 0.10,
            "f_volume_stability": 0.06,
            "f_gap_risk_control": 0.05,
            "f_anti_crowding": 0.04,
            "f_residual_low_volatility": 0.03,
            "f_close_strength": 0.02,
        },
    },
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
    for composite_id, config in COMPOSITES.items():
        score = pd.Series(0.0, index=out.index)
        weight_sum = 0.0
        for factor, weight in config["weights"].items():
            score += out[f"z_{factor}"] * weight
            weight_sum += abs(weight)
        out[composite_id] = score / weight_sum if weight_sum else score
    out["ie_dynamic_icir_v1"] = dynamic_icir_score(out, horizon=20)
    return out


def dynamic_icir_score(df: pd.DataFrame, horizon: int, lookback_dates: int = 126) -> pd.Series:
    dates = sorted(df["date"].dropna().unique())
    ic_rows = []
    for date, day in df.groupby("date"):
        if day[f"fwd_ret_{horizon}"].notna().sum() < 30:
            continue
        row = {"date": date}
        ic_by_factor = daily_rank_ic(day, [f"z_{factor}" for factor in FACTOR_COLUMNS], f"fwd_ret_{horizon}")
        for factor in FACTOR_COLUMNS:
            row[factor] = ic_by_factor.get(f"z_{factor}")
        ic_rows.append(row)
    ic = pd.DataFrame(ic_rows).sort_values("date")
    weights_by_date: dict[pd.Timestamp, dict[str, float]] = {}
    fallback = COMPOSITES["ie_balanced_alpha_v1"]["weights"]
    if not ic.empty:
        ic = ic.set_index("date")
        for date in dates:
            hist = ic[ic.index < date].tail(lookback_dates)
            weights: dict[str, float] = {}
            for factor in FACTOR_COLUMNS:
                values = hist[factor].dropna() if factor in hist else pd.Series(dtype=float)
                if len(values) < 30:
                    weights[factor] = fallback.get(factor, 0.0)
                else:
                    std = values.std(ddof=0)
                    icir = values.mean() / std if std and not np.isnan(std) else 0.0
                    weights[factor] = float(np.clip(icir, -0.4, 1.2))
            if sum(weights.values()) <= 0:
                weights = dict(fallback)
            weights_by_date[date] = weights
    score = pd.Series(0.0, index=df.index)
    for date, idx in df.groupby("date").groups.items():
        weights = weights_by_date.get(date, fallback)
        denom = sum(abs(v) for v in weights.values()) or 1.0
        part = pd.Series(0.0, index=idx)
        for factor, weight in weights.items():
            if weight:
                part += df.loc[idx, f"z_{factor}"] * weight
        score.loc[idx] = part / denom
    return score


def factor_ic_table(df: pd.DataFrame, horizons: list[int], step: int) -> list[dict]:
    rows = []
    factors = FACTOR_COLUMNS + list(COMPOSITES) + ["ie_dynamic_icir_v1"]
    factor_cols = [f"z_{factor}" if factor in FACTOR_COLUMNS else factor for factor in factors]
    values_by_key: dict[tuple[str, int], list[float]] = {(factor, horizon): [] for factor in factors for horizon in horizons}
    col_to_factor = dict(zip(factor_cols, factors))
    for horizon in horizons:
        target = f"fwd_ret_{horizon}"
        for idx, (_, day) in enumerate(df.groupby("date")):
            if step > 1 and idx % step:
                continue
            if day[target].notna().sum() < 30:
                continue
            ic_by_col = daily_rank_ic(day, factor_cols, target)
            for col, ic in ic_by_col.items():
                if ic is not None:
                    values_by_key[(col_to_factor[col], horizon)].append(ic)
    for factor in factors:
        for horizon in horizons:
            values = values_by_key[(factor, horizon)]
            series = pd.Series(values, dtype=float)
            mean = clean_float(series.mean())
            std = clean_float(series.std(ddof=0))
            rows.append({
                "factor": factor,
                "horizon": horizon,
                "sample_dates": int(series.count()),
                "rank_ic_mean": mean,
                "rank_ic_std": std,
                "rank_ic_ir": clean_float(mean / std) if mean is not None and std else None,
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


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_report(path: Path, result: dict) -> None:
    lines = [
        "# 指数增强研究内核报告",
        "",
        f"生成时间：{result['generated_at']}",
        "",
        "## 数据边界",
        "",
        "- 使用真实 AkShare OHLCV 数据。",
        "- 当前版本使用静态指数成分池和等权基准，不使用历史成分、真实指数权重、市值、行业或基本面。",
        "- 腾讯日线源缺成交额和换手率；本报告不伪造成交额、换手率或市值。",
        "- v2 内核加入主动动量、残差低波、尾部风险、跳空风险、量价确认、趋势一致性、反拥挤和市场状态适配。",
        "- 组合构建加入持仓缓冲、风险惩罚、主动袖口换手成本和稳定性评分。",
        "- 结果用于研究筛选，不等同于可实盘指数增强产品。",
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
    lines += ["", "## 组合回测 Top", "", "| 数据集 | 策略 | 调仓 | TopN | 核心权重 | 缓冲 | 风险惩罚 | 稳定分 | 主动收益 | 主动年化 | 主动Sharpe | Sortino | Calmar | 主动回撤 | 均换手 | 最差单期主动 | 策略收益 | 基准收益 |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in result["portfolio_top"]:
        active = row["metrics"]["active"]
        strategy = row["metrics"]["strategy"]
        benchmark = row["metrics"]["benchmark"]
        lines.append(
            f"| {row['dataset']} | {row['score_col']} | {row['horizon']} | {row['top_n']} | {row['core_weight']:.0%} | {row['buffer_multiple']:.1f} | {row['risk_penalty']:.2f} | {number(row.get('stability_score'),2)} | {pct(active['total_return'])} | {pct(active['annual_return'])} | {number(active['sharpe'],2)} | {number(active.get('sortino'),2)} | {number(active.get('calmar'),2)} | {pct(active['max_drawdown'])} | {pct(row['metrics'].get('avg_turnover'))} | {pct(row['metrics'].get('worst_period_active'))} | {pct(strategy['total_return'])} | {pct(benchmark['total_return'])} |"
        )
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
    keep = ["date", "code", "name", "close"] + FACTOR_COLUMNS + [f"z_{c}" for c in FACTOR_COLUMNS] + list(COMPOSITES) + ["ie_dynamic_icir_v1"] + [f"fwd_ret_{h}" for h in args.horizons]
    if args.write_factor_csv:
        print(f"[{index_name}] write factor csv: {factor_path.relative_to(ROOT)}", flush=True)
        factors[keep].to_csv(factor_path, index=False, encoding="utf-8-sig")
        factor_path_text = str(factor_path.relative_to(ROOT))
    else:
        factor_path_text = None
    print(f"[{index_name}] compute rank ic step={args.ic_step}", flush=True)
    ic_rows = factor_ic_table(factors, args.horizons, args.ic_step)
    for row in ic_rows:
        row["dataset"] = index_name

    portfolio_rows = []
    all_trades = []
    score_cols = resolve_score_cols(args)
    print(f"[{index_name}] portfolio grid score_cols={len(score_cols)}", flush=True)
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
    return dataset_summary, trades_frame, ic_rows + portfolio_rows


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
            if item in COMPOSITES or item == "ie_dynamic_icir_v1" or item.startswith("z_"):
                resolved.append(item)
            elif item in FACTOR_COLUMNS:
                resolved.append(f"z_{item}")
            else:
                raise SystemExit(f"未知 score_col: {item}")
        return resolved
    score_cols = list(COMPOSITES) + ["ie_dynamic_icir_v1"]
    if args.include_factor_portfolios:
        score_cols += [f"z_{factor}" for factor in FACTOR_COLUMNS]
    return score_cols


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", default="", help="逗号分隔 daily CSV；默认读取 index_enhancement/processed/*_daily_*.csv")
    parser.add_argument("--horizons", type=parse_int_list, default=[5, 10, 20])
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
    for path in paths:
        index_name = path.name.split("_daily_", 1)[0]
        dataset_summary, _, mixed_rows = run_for_dataset(path, index_name, args)
        datasets.append(dataset_summary)
        for row in mixed_rows:
            if "factor" in row:
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
