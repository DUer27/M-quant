# M-quant JoinQuant notebook batch runner for structured reversal slices.
# Paste this into a JoinQuant Python3 research notebook. It writes one small
# batch script and one JSON/status pair per run to avoid the 1.0G memory ceiling.

from pathlib import Path
import contextlib
import io
import json
import runpy
import traceback


# Change only these parameters in JoinQuant.
SLICE_START = "2024-10-01"
SLICE_END = "2024-12-31"
SECURITY_BATCH_OFFSET = 560
SECURITY_BATCH_LIMIT = 80
TAG = "2024q4_b560_640"


BASE_SCRIPT = r'''
#!/usr/bin/env python3
"""JoinQuant structured reversal factor research kernel.

This script implements the Changjiang Securities structured reversal factor:
low-volume bars are treated as the momentum segment, high-volume bars as the
reversal segment, and ``Rev_struct = Rev_rev - Rev_mom``. Lower raw values are
better, so the exported score is ``1 - rank_pct(rev_struct)``.

Policy: use real JoinQuant 10m/1m data only. Do not fabricate high-frequency
structure from daily bars.
"""

import argparse
import json
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd


from jqdata import *  # type: ignore  # noqa: F401,F403

JOINQUANT_API_READY = True
JOINQUANT_AUTH_READY = True


def ensure_joinquant_auth() -> None:
    return None


try:
    _source_path = Path(__file__).resolve()
    ROOT = _source_path.parents[4] if len(_source_path.parents) > 4 else Path.cwd()
except NameError:
    ROOT = Path.cwd()
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"

INDEX_OPTIONS = {
    "csi500": {"index_code": "000905.XSHG", "index_name": "中证500"},
    "csi800": {"index_code": "000906.XSHG", "index_name": "中证800"},
    "all_a": {"index_code": "all_a", "index_name": "全A"},
}

DATASET = "csi500"
INDEX_CODE = INDEX_OPTIONS[DATASET]["index_code"]
INDEX_NAME = INDEX_OPTIONS[DATASET]["index_name"]
STRATEGY_ID = "structured_reversal_csi500_v1"
STRATEGY_NAME = "长江结构化反转因子指数增强策略 v1"
SOURCE = "joinquant_structured_reversal_csi500_v1"

FACTOR_START = "2019-01-01"
END_LIMIT = "2026-07-15"
RUN_MODE = "full_package"
SLICE_START = ""
SLICE_END = ""
HIGH_FREQ = "10m"
LOW_VOLUME_RATIO = 0.10
LOOKBACK_TRADE_DAYS = 21
FACTOR_DAY_STEP = 5
HORIZONS = [1, 5, 10, 20]
PRIMARY_HORIZON = 20
MIN_BAR_COUNT = 300
MIN_MOM_BAR_COUNT = 20
MIN_REV_BAR_COUNT = 100
MIN_CROSS_SECTION = 180
PRICE_FETCH_BATCH_SIZE = 80
HIGH_FREQ_BATCH_SIZE = 30
SECURITY_BATCH_OFFSET = 0
SECURITY_BATCH_LIMIT = 0
TOP_N = 100
BUFFER_N = 150
BUY_RANK_CUTOFF = 80
MIN_LISTED_DAYS = 120
MIN_MONEY_MA20 = 50_000_000
EXTREME_DROP_21D = -0.35
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002

FACTOR_GATE = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.025,
    "min_rank_ic_t": 2.0,
    "min_long_short_annual": 0.08,
    "min_top_excess_annual": 0.03,
}


def ensure_joinquant_auth() -> None:
    global JOINQUANT_AUTH_READY
    if not JOINQUANT_API_READY:
        raise RuntimeError("缺少 jqdata/jqdatasdk，无法拉取 JoinQuant 高频数据。")
    if JOINQUANT_AUTH_READY:
        return
    account = os.getenv("JQ_ACCOUNT") or os.getenv("JOINQUANT_ACCOUNT")
    password = os.getenv("JQ_PASSWORD") or os.getenv("JOINQUANT_PASSWORD")
    if not account or not password:
        raise RuntimeError("本地运行需要设置 JQ_ACCOUNT/JQ_PASSWORD；JoinQuant 研究环境不需要。")
    auth(account, password)  # type: ignore[name-defined]
    JOINQUANT_AUTH_READY = True


def clean_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def date_text(value: Any) -> str:
    return pd.Timestamp(value).strftime("%Y-%m-%d")


def jsonable_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].dt.strftime("%Y-%m-%d")
    out = out.replace([np.inf, -np.inf], np.nan)
    return json.loads(out.to_json(orient="records", force_ascii=False, date_format="iso"))


def rank01(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = s.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def normalize_price_frame(price: Any, datetime_col: str = "datetime") -> pd.DataFrame:
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns and datetime_col not in df.columns:
        df = df.reset_index()
        if "index" in df.columns:
            df = df.rename(columns={"index": "time"})
    if datetime_col not in df.columns and "time" in df.columns:
        df = df.rename(columns={"time": datetime_col})
    if "code" not in df.columns and "security" in df.columns:
        df = df.rename(columns={"security": "code"})
    if datetime_col in df.columns:
        df[datetime_col] = pd.to_datetime(df[datetime_col])
        df["date"] = df[datetime_col].dt.normalize()
    return df


def configured_factor_bounds() -> Tuple[pd.Timestamp, pd.Timestamp]:
    start = pd.Timestamp(SLICE_START or FACTOR_START).normalize()
    end = pd.Timestamp(SLICE_END or END_LIMIT).normalize()
    if end < start:
        raise ValueError("SLICE_END 不能早于 SLICE_START。")
    return start, end


def get_universe(day: pd.Timestamp) -> List[str]:
    if INDEX_CODE != "all_a":
        return sorted(get_index_stocks(INDEX_CODE, date=date_text(day)))  # type: ignore[name-defined]
    securities = get_all_securities(["stock"], date=date_text(day))  # type: ignore[name-defined]
    return sorted(securities.index.tolist())


def build_trade_plan() -> Tuple[List[pd.Timestamp], Dict[pd.Timestamp, Set[str]], List[str], List[pd.Timestamp]]:
    factor_start, factor_end = configured_factor_bounds()
    all_days = pd.to_datetime(get_trade_days(start_date=date_text(factor_start - pd.Timedelta(days=90)), end_date=END_LIMIT))  # type: ignore[name-defined]
    if len(all_days) <= LOOKBACK_TRADE_DAYS + max(HORIZONS) + 1:
        raise ValueError("交易日不足，无法形成高频窗口和未来收益标签。")
    usable_end = all_days[-max(HORIZONS) - 1]
    candidate_days = all_days[(all_days >= factor_start) & (all_days <= factor_end) & (all_days <= usable_end)]
    factor_days = [pd.Timestamp(day).normalize() for day in candidate_days[::FACTOR_DAY_STEP]]
    if not factor_days:
        raise ValueError("当前窗口没有足够交易日形成因子。")
    universe_by_date: Dict[pd.Timestamp, Set[str]] = {}
    securities: Set[str] = set()
    for day in factor_days:
        universe = set(get_universe(day))
        universe_by_date[day] = universe
        securities.update(universe)
    securities_list = sorted(securities)
    if SECURITY_BATCH_LIMIT and SECURITY_BATCH_LIMIT > 0:
        start = max(0, int(SECURITY_BATCH_OFFSET or 0))
        end = start + int(SECURITY_BATCH_LIMIT)
        securities_list = securities_list[start:end]
        securities_set = set(securities_list)
        universe_by_date = {day: universe & securities_set for day, universe in universe_by_date.items()}
    return factor_days, universe_by_date, securities_list, list(all_days)


def fetch_daily_price(securities: List[str], start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    frames = []
    fields = ["open", "high", "low", "close", "volume", "money", "high_limit", "low_limit", "paused"]
    for idx in range(0, len(securities), PRICE_FETCH_BATCH_SIZE):
        batch = securities[idx : idx + PRICE_FETCH_BATCH_SIZE]
        price = get_price(  # type: ignore[name-defined]
            batch,
            start_date=date_text(start),
            end_date=date_text(end),
            frequency="daily",
            fields=fields,
            panel=False,
            fq="pre",
        )
        frame = normalize_price_frame(price, datetime_col="time")
        if not frame.empty:
            frames.append(frame)
    if not frames:
        return pd.DataFrame()
    daily = pd.concat(frames, ignore_index=True).sort_values(["code", "date"]).copy()
    group = daily.groupby("code", group_keys=False)
    daily["ret_1"] = group["close"].pct_change()
    daily["ret_21"] = group["close"].pct_change(LOOKBACK_TRADE_DAYS)
    daily["prev_close"] = group["close"].shift(1)
    daily["money_ma20"] = group["money"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    daily["volume_ma20"] = group["volume"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    daily["money_cv_20"] = group["money"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True) / daily["money_ma20"].replace(0, np.nan)
    daily["volume_cv_20"] = group["volume"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True) / daily["volume_ma20"].replace(0, np.nan)
    daily["vol_20"] = group["ret_1"].rolling(20, min_periods=10).std().reset_index(level=0, drop=True)
    daily["vol_60"] = group["ret_1"].rolling(60, min_periods=30).std().reset_index(level=0, drop=True)
    daily["gap_abs"] = (daily["open"] / daily["prev_close"].replace(0, np.nan) - 1).abs()
    daily["gap_abs_20"] = group["gap_abs"].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    daily["near_limit_down"] = daily["close"] <= daily["low_limit"] * 1.005
    daily["limit_down_count_5"] = group["near_limit_down"].rolling(5, min_periods=1).sum().reset_index(level=0, drop=True)
    daily["limit_up"] = daily["close"] >= daily["high_limit"] * 0.999
    daily["limit_down"] = daily["close"] <= daily["low_limit"] * 1.001
    for horizon in HORIZONS:
        daily[f"future_return_{horizon}"] = group["close"].shift(-horizon) / daily["close"] - 1
    return daily


def fetch_st_table(securities: List[str], start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    rows = []
    for idx in range(0, len(securities), PRICE_FETCH_BATCH_SIZE):
        batch = securities[idx : idx + PRICE_FETCH_BATCH_SIZE]
        try:
            st = get_extras("is_st", batch, start_date=date_text(start), end_date=date_text(end), df=True)  # type: ignore[name-defined]
        except Exception:
            continue
        if st is None or st.empty:
            continue
        long = st.stack().reset_index()
        long.columns = ["date", "code", "is_st"]
        long["date"] = pd.to_datetime(long["date"]).dt.normalize()
        rows.append(long)
    if not rows:
        return pd.DataFrame(columns=["date", "code", "is_st"])
    return pd.concat(rows, ignore_index=True)


def listed_days_cache(securities: List[str], factor_days: List[pd.Timestamp]) -> Dict[Tuple[str, str], Optional[int]]:
    cache: Dict[Tuple[str, str], Optional[int]] = {}
    start_dates: Dict[str, Optional[pd.Timestamp]] = {}
    for code in securities:
        try:
            info = get_security_info(code)  # type: ignore[name-defined]
            start_dates[code] = pd.Timestamp(info.start_date).normalize() if info and info.start_date else None
        except Exception:
            start_dates[code] = None
    for day in factor_days:
        for code, start_date in start_dates.items():
            cache[(code, date_text(day))] = None if start_date is None else int((day - start_date).days)
    return cache


def fetch_10m_price(securities: List[str], start: pd.Timestamp, end: pd.Timestamp, frequency: str = HIGH_FREQ) -> pd.DataFrame:
    frames = []
    fields = ["open", "high", "low", "close", "volume", "money"]
    for idx in range(0, len(securities), HIGH_FREQ_BATCH_SIZE):
        batch = securities[idx : idx + HIGH_FREQ_BATCH_SIZE]
        price = get_price(  # type: ignore[name-defined]
            batch,
            start_date=date_text(start),
            end_date=date_text(end),
            frequency=frequency,
            fields=fields,
            panel=False,
            fq="pre",
        )
        frame = normalize_price_frame(price, datetime_col="datetime")
        if not frame.empty:
            frames.append(frame)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True).sort_values(["code", "datetime"]).copy()


def aggregate_1m_to_10m(minute_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate 1m bars to 10m without crossing the A-share lunch break."""
    if minute_df.empty:
        return minute_df
    df = minute_df.copy()
    df["datetime"] = pd.to_datetime(df["datetime"])
    minute_of_day = df["datetime"].dt.hour * 60 + df["datetime"].dt.minute
    morning = minute_of_day < 12 * 60
    session_start = np.where(morning, 9 * 60 + 30, 13 * 60)
    bucket = ((minute_of_day - session_start) // 10).astype(int)
    df = df[(bucket >= 0) & (bucket < 12)].copy()
    df["bar_time"] = df["datetime"].dt.normalize() + pd.to_timedelta(session_start + bucket * 10, unit="m")
    grouped = df.sort_values("datetime").groupby(["code", "bar_time"], as_index=False)
    out = grouped.agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
        "money": "sum",
    })
    return out.rename(columns={"bar_time": "datetime"}).sort_values(["code", "datetime"])


def calc_structured_reversal(minute_df: pd.DataFrame, low_volume_ratio: float = LOW_VOLUME_RATIO) -> Optional[Dict[str, Any]]:
    required = {"datetime", "close", "volume"}
    if minute_df.empty or not required.issubset(minute_df.columns):
        return None
    df = minute_df.sort_values("datetime").copy()
    df["ret"] = np.log(df["close"] / df["close"].shift(1))
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=["ret", "volume", "close"])
    df = df[(df["volume"] > 0) & (df["close"] > 0)]
    if len(df) < MIN_BAR_COUNT:
        return None
    cutoff = df["volume"].quantile(low_volume_ratio)
    mom = df[df["volume"] <= cutoff].copy()
    rev = df[df["volume"] > cutoff].copy()
    if len(mom) < MIN_MOM_BAR_COUNT or len(rev) < MIN_REV_BAR_COUNT:
        return None
    mom_weight = (1.0 / mom["volume"]) / (1.0 / mom["volume"]).sum()
    rev_weight = rev["volume"] / rev["volume"].sum()
    rev_mom = float((mom_weight * mom["ret"]).sum())
    rev_rev = float((rev_weight * rev["ret"]).sum())
    return {
        "rev_struct_10m": clean_float(rev_rev - rev_mom),
        "rev_rev_10m": clean_float(rev_rev),
        "rev_mom_10m": clean_float(rev_mom),
        "liquidity_impact_10m": clean_float((df["ret"].abs() * 10000).sum() / df["money"].sum()) if "money" in df.columns and df["money"].sum() > 0 else None,
        "bar_count": int(len(df)),
        "mom_bar_count": int(len(mom)),
        "rev_bar_count": int(len(rev)),
        "volume_cutoff": clean_float(cutoff),
    }


def market_regime_table(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    if INDEX_CODE == "all_a":
        return pd.DataFrame(columns=["date", "market_vol_20d", "market_regime", "market_regime_name"])
    index_price = get_price(  # type: ignore[name-defined]
        INDEX_CODE,
        start_date=date_text(start),
        end_date=date_text(end),
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    df = normalize_price_frame(index_price, datetime_col="time")
    if df.empty:
        return pd.DataFrame(columns=["date", "market_vol_20d", "market_regime", "market_regime_name"])
    df = df.sort_values("date").copy()
    df["index_return"] = df["close"].pct_change()
    df["market_vol_20d"] = df["index_return"].rolling(20, min_periods=20).std() * math.sqrt(252)
    df["vol_p30"] = df["market_vol_20d"].rolling(252, min_periods=60).quantile(0.30).shift(1)
    df["vol_p70"] = df["market_vol_20d"].rolling(252, min_periods=60).quantile(0.70).shift(1)
    valid = df.dropna(subset=["market_vol_20d", "vol_p30", "vol_p70"]).copy()
    valid["market_regime"] = "medium_volatility"
    valid.loc[valid["market_vol_20d"] >= valid["vol_p70"], "market_regime"] = "high_volatility"
    valid.loc[valid["market_vol_20d"] <= valid["vol_p30"], "market_regime"] = "low_volatility"
    valid["market_regime_name"] = valid["market_regime"].map({
        "high_volatility": "高波动",
        "medium_volatility": "中波动",
        "low_volatility": "低波动",
    })
    return valid[["date", "market_vol_20d", "market_regime", "market_regime_name"]]


def tradability_filter(part: pd.DataFrame) -> pd.DataFrame:
    work = part.replace([np.inf, -np.inf], np.nan).copy()
    work = work[work["close"].gt(0) & work["money"].gt(0)]
    if "paused" in work.columns:
        work = work[work["paused"].fillna(0).eq(0)]
    if "is_st" in work.columns:
        work = work[~work["is_st"].fillna(False)]
    work = work[work["listed_days"].fillna(0) >= MIN_LISTED_DAYS]
    work = work[work["money_ma20"].fillna(0) >= MIN_MONEY_MA20]
    work = work[~work["limit_up"].fillna(False)]
    work = work[work["limit_down_count_5"].fillna(0) < 3]
    liquidity_recovered = work["money"].fillna(0) >= work["money_ma20"].fillna(np.inf)
    work = work[(work["ret_21"].fillna(0) > EXTREME_DROP_21D) | liquidity_recovered]
    return work


def high_freq_window(all_days: List[pd.Timestamp], day: pd.Timestamp) -> Tuple[pd.Timestamp, pd.Timestamp]:
    days = [pd.Timestamp(item).normalize() for item in all_days if pd.Timestamp(item).normalize() <= day]
    if len(days) < LOOKBACK_TRADE_DAYS:
        raise ValueError(f"{date_text(day)} 之前交易日不足 {LOOKBACK_TRADE_DAYS} 天。")
    return days[-LOOKBACK_TRADE_DAYS], days[-1]


def build_factor_panel() -> Tuple[pd.DataFrame, Dict[str, Any]]:
    ensure_joinquant_auth()
    factor_days, universe_by_date, securities, all_days = build_trade_plan()
    fetch_start = min(high_freq_window(all_days, day)[0] for day in factor_days) - pd.Timedelta(days=10)
    fetch_end = max(factor_days) + pd.Timedelta(days=max(HORIZONS) + 10)
    daily = fetch_daily_price(securities, fetch_start, fetch_end)
    if daily.empty:
        raise ValueError("日频行情为空，无法过滤和生成未来收益。")
    st = fetch_st_table(securities, min(factor_days), max(factor_days))
    if not st.empty:
        daily = daily.merge(st, on=["date", "code"], how="left")
    else:
        daily["is_st"] = False
    listed_cache = listed_days_cache(securities, factor_days)
    regimes = market_regime_table(fetch_start, fetch_end)
    rows = []

    for day in factor_days:
        universe = universe_by_date[day]
        part = daily[(daily["date"] == day) & (daily["code"].isin(universe))].copy()
        if part.empty:
            continue
        part["listed_days"] = [listed_cache.get((code, date_text(day))) for code in part["code"]]
        part = tradability_filter(part)
        if len(part) < MIN_CROSS_SECTION:
            continue
        hf_start, hf_end = high_freq_window(all_days, day)
        hf = fetch_10m_price(part["code"].tolist(), hf_start, hf_end, frequency=HIGH_FREQ)
        if HIGH_FREQ == "1m":
            hf = aggregate_1m_to_10m(hf)
        if hf.empty:
            continue
        factor_rows = []
        for code, frame in hf.groupby("code"):
            result = calc_structured_reversal(frame, low_volume_ratio=LOW_VOLUME_RATIO)
            if result is None:
                continue
            factor_rows.append({"date": day, "code": code, **result})
        if not factor_rows:
            continue
        factor_part = pd.DataFrame(factor_rows)
        factor_part["structured_reversal_score"] = rank01(factor_part["rev_struct_10m"], higher_is_better=False)
        factor_part["high_volume_reversal_score"] = rank01(factor_part["rev_rev_10m"], higher_is_better=False)
        factor_part["liquidity_premium_proxy_score"] = rank01(-factor_part["liquidity_impact_10m"]) if "liquidity_impact_10m" in factor_part.columns else 0.5
        enrich_cols = [
            "date", "code", "close", "money", "money_ma20", "ret_21", "limit_up", "limit_down",
            "vol_20", "vol_60", "money_cv_20", "volume_cv_20", "gap_abs_20",
            "future_return_1", "future_return_5", "future_return_10", "future_return_20",
        ]
        factor_part = factor_part.merge(part[enrich_cols], on=["date", "code"], how="left")
        factor_part["low_volatility_score"] = rank01(-0.65 * factor_part["vol_20"] - 0.35 * factor_part["vol_60"])
        factor_part["liquidity_quality_score"] = rank01(factor_part["money_ma20"])
        factor_part["volume_stability_score"] = rank01(-0.55 * factor_part["money_cv_20"] - 0.45 * factor_part["volume_cv_20"])
        factor_part["gap_risk_control_score"] = rank01(-factor_part["gap_abs_20"])
        factor_part["structured_reversal_enhanced_score"] = rank01(
            0.55 * factor_part["structured_reversal_score"]
            + 0.15 * factor_part["low_volatility_score"]
            + 0.10 * factor_part["liquidity_quality_score"]
            + 0.05 * factor_part["liquidity_premium_proxy_score"]
            + 0.10 * factor_part["volume_stability_score"]
            + 0.05 * factor_part["gap_risk_control_score"]
        )
        factor_part["structured_reversal_confirmed_score"] = rank01(
            0.70 * factor_part["structured_reversal_score"]
            + 0.20 * factor_part["high_volume_reversal_score"]
            + 0.10 * factor_part["volume_stability_score"]
        )
        factor_part["structured_reversal_tradeable_score"] = rank01(
            0.65 * factor_part["structured_reversal_score"]
            + 0.15 * factor_part["high_volume_reversal_score"]
            + 0.10 * factor_part["volume_stability_score"]
            + 0.05 * factor_part["gap_risk_control_score"]
            + 0.05 * factor_part["low_volatility_score"]
        )
        if not regimes.empty:
            factor_part = factor_part.merge(regimes, on="date", how="left")
        rows.append(factor_part)

    if not rows:
        raise ValueError("未形成结构化反转因子截面；请检查 10m 数据权限、分片日期和过滤条件。")
    table = pd.concat(rows, ignore_index=True).sort_values(["date", "structured_reversal_score"], ascending=[True, False])
    config = {
        "dataset": DATASET,
        "index_code": INDEX_CODE,
        "index_name": INDEX_NAME,
        "factor_start": date_text(configured_factor_bounds()[0]),
        "end_limit": date_text(configured_factor_bounds()[1]),
        "run_mode": RUN_MODE,
        "slice_start": SLICE_START or None,
        "slice_end": SLICE_END or None,
        "high_freq": HIGH_FREQ,
        "low_volume_ratio": LOW_VOLUME_RATIO,
        "lookback_trade_days": LOOKBACK_TRADE_DAYS,
        "factor_day_step": FACTOR_DAY_STEP,
        "horizons": HORIZONS,
        "primary_horizon": PRIMARY_HORIZON,
        "top_n": TOP_N,
        "buffer_n": BUFFER_N,
        "buy_rank_cutoff": BUY_RANK_CUTOFF,
        "min_bar_count": MIN_BAR_COUNT,
        "min_cross_section": MIN_CROSS_SECTION,
        "min_money_ma20": MIN_MONEY_MA20,
        "security_batch_offset": SECURITY_BATCH_OFFSET,
        "security_batch_limit": SECURITY_BATCH_LIMIT,
        "factor_dates": int(table["date"].nunique()),
        "factor_rows": int(len(table)),
        "unique_securities": int(table["code"].nunique()),
    }
    return table, config


def build_factor_package(table: pd.DataFrame, config: Dict[str, Any], emit: bool = True) -> Dict[str, Any]:
    output = {
        "result_type": "structured_reversal_factor_panel",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "data_policy": "真实 JoinQuant 高频行情：默认10分钟K线；Rev_struct越低越好；不使用日线伪造高频结构。",
        "config": config,
        "factor_formula": {
            "ret": "log(close_i / close_{i-1})",
            "rev_mom": "sum((1/volume_i)/sum(1/volume_i) * ret_i) on lowest-volume 10% bars",
            "rev_rev": "sum(volume_i/sum(volume_i) * ret_i) on remaining bars",
            "rev_struct": "rev_rev - rev_mom",
            "score": "1 - rank_pct(rev_struct)",
            "liquidity_reference": "参考长江证券《高频因子（一）：流动性溢价因子》；JoinQuant get_price 无五档盘口时，用10m成交冲击 liquidity_impact_10m 作可审计代理，仍由真实回测门禁决定是否保留。",
            "enhanced_score": "0.55*结构化反转 + 0.15*低波动 + 0.10*流动性质量 + 0.05*高频流动性溢价代理 + 0.10*量能稳定 + 0.05*跳空风险控制",
            "confirmed_score": "0.70*结构化反转 + 0.20*高成交量反转确认 + 0.10*量能稳定；用于诊断流动性体量偏置是否稀释核心反转。",
            "tradeable_score": "0.65*结构化反转 + 0.15*高成交量反转确认 + 0.10*量能稳定 + 0.05*跳空风险控制 + 0.05*低波动；不使用成交额体量和低冲击作为正向 alpha。",
        },
        "factor_specs": [
            {"factor": "structured_reversal_score", "display_name": "结构化反转因子（structured_reversal_score）", "direction": "positive", "weight": 0.55},
            {"factor": "high_volume_reversal_score", "display_name": "高成交量反转确认因子（high_volume_reversal_score）", "direction": "positive", "weight": 0.20},
            {"factor": "low_volatility_score", "display_name": "低波动控制因子（low_volatility_score）", "direction": "positive", "weight": 0.15},
            {"factor": "liquidity_quality_score", "display_name": "流动性质量因子（liquidity_quality_score）", "direction": "positive", "weight": 0.10},
            {"factor": "liquidity_premium_proxy_score", "display_name": "高频流动性溢价代理因子（liquidity_premium_proxy_score）", "direction": "positive", "weight": 0.05},
            {"factor": "volume_stability_score", "display_name": "量能稳定因子（volume_stability_score）", "direction": "positive", "weight": 0.10},
            {"factor": "gap_risk_control_score", "display_name": "跳空风险控制因子（gap_risk_control_score）", "direction": "positive", "weight": 0.05},
            {"factor": "structured_reversal_confirmed_score", "display_name": "结构化反转确认总分（structured_reversal_confirmed_score）", "direction": "positive", "weight": 1.00},
            {"factor": "structured_reversal_tradeable_score", "display_name": "结构化反转可交易总分（structured_reversal_tradeable_score）", "direction": "positive", "weight": 1.00},
        ],
        "factor_gate": FACTOR_GATE,
        "sample": {
            "factor_rows": int(table.shape[0]),
            "factor_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "date_range": "%s 至 %s" % (date_text(table["date"].min()), date_text(table["date"].max())),
        },
        "factor_rows": jsonable_records(table),
        "jq_import_hint": {
            "analysis_command": "python3 outputs/sources/joinquant/scripts/analyze_structured_reversal_factor.py /path/to/structured_reversal_factor_panel.json",
            "strategy_command": "python3 outputs/sources/joinquant/scripts/m_quant_structured_reversal_index_enhancement.py /path/to/structured_reversal_factor_panel.json",
            "records_policy": "先导出因子截面；本地复算 IC、分组收益和 Top100 组合，不对缺失数据补造收益。",
        },
    }
    if emit:
        print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def run() -> Dict[str, Any]:
    table, config = build_factor_panel()
    return build_factor_package(table, config)


def configure_from_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build JoinQuant structured reversal 10m factor panel.")
    parser.add_argument("--dataset", choices=sorted(INDEX_OPTIONS), default=DATASET)
    parser.add_argument("--factor-start", default=FACTOR_START)
    parser.add_argument("--end-limit", default=END_LIMIT)
    parser.add_argument("--run-mode", choices=["full_package", "slice"], default=RUN_MODE)
    parser.add_argument("--slice-start", default=SLICE_START)
    parser.add_argument("--slice-end", default=SLICE_END)
    parser.add_argument("--high-freq", choices=["10m", "1m"], default=HIGH_FREQ)
    parser.add_argument("--security-batch-offset", type=int, default=SECURITY_BATCH_OFFSET)
    parser.add_argument("--security-batch-limit", type=int, default=SECURITY_BATCH_LIMIT)
    parser.add_argument("--output", default="", help="Optional local JSON output path.")
    args, _unknown = parser.parse_known_args(argv)
    globals()["DATASET"] = args.dataset
    globals()["INDEX_CODE"] = INDEX_OPTIONS[args.dataset]["index_code"]
    globals()["INDEX_NAME"] = INDEX_OPTIONS[args.dataset]["index_name"]
    suffix = "csi500" if args.dataset == "csi500" else args.dataset
    globals()["STRATEGY_ID"] = f"structured_reversal_{suffix}_v1"
    globals()["SOURCE"] = f"joinquant_structured_reversal_{suffix}_v1"
    globals()["FACTOR_START"] = args.factor_start
    globals()["END_LIMIT"] = args.end_limit
    globals()["RUN_MODE"] = args.run_mode
    globals()["SLICE_START"] = args.slice_start
    globals()["SLICE_END"] = args.slice_end
    globals()["HIGH_FREQ"] = args.high_freq
    globals()["SECURITY_BATCH_OFFSET"] = args.security_batch_offset
    globals()["SECURITY_BATCH_LIMIT"] = args.security_batch_limit
    return args


def main(argv: Optional[List[str]] = None) -> int:
    args = configure_from_args(argv)
    try:
        table, config = build_factor_panel()
        package = build_factor_package(table, config, emit=not bool(args.output))
    except Exception as exc:
        package = {
            "result_type": "structured_reversal_factor_panel",
            "source": SOURCE,
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "status": "blocked_missing_real_joinquant_data",
            "message": str(exc),
            "data_policy": "未获取真实 JoinQuant 10m/1m 高频数据时，不输出回测指标。",
            "config": {
                "dataset": DATASET,
                "index_code": INDEX_CODE,
                "index_name": INDEX_NAME,
                "factor_start": FACTOR_START,
                "end_limit": END_LIMIT,
                "high_freq": HIGH_FREQ,
            },
        }
        if not args.output:
            print(json.dumps(package, ensure_ascii=False, indent=2, default=str))
    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = ROOT / output_path
        write_json(output_path, package)
        print(json.dumps({"ok": True, "output_path": str(output_path), "status": package.get("status", "ok")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    main()

'''


def extract_json_object(text):
    stripped = text.strip().lstrip('\ufeff')
    decoder = json.JSONDecoder()
    for start, char in enumerate(stripped):
        if char not in '[{':
            continue
        try:
            obj, _end = decoder.raw_decode(stripped[start:])
        except ValueError:
            continue
        return obj
    return None


def summarize_payload(text):
    payload = extract_json_object(text)
    if not isinstance(payload, dict):
        return {'payload_found': False}
    sample = payload.get('sample') or {}
    rows = payload.get('factor_rows') or []
    return {
        'payload_found': True,
        'payload_result_type': payload.get('result_type'),
        'payload_status': payload.get('status') or 'ok',
        'payload_strategy_id': payload.get('strategy_id'),
        'factor_rows': sample.get('factor_rows') or len(rows),
        'factor_dates': sample.get('factor_dates'),
        'unique_securities': sample.get('unique_securities'),
    }


def main():
    src = BASE_SCRIPT
    src = src.replace('RUN_MODE = "full_package"', 'RUN_MODE = "slice"')
    src = src.replace('SLICE_START = ""', 'SLICE_START = "{}"'.format(SLICE_START))
    src = src.replace('SLICE_END = ""', 'SLICE_END = "{}"'.format(SLICE_END))
    src = src.replace('SECURITY_BATCH_OFFSET = 0', 'SECURITY_BATCH_OFFSET = {}'.format(int(SECURITY_BATCH_OFFSET)))
    src = src.replace('SECURITY_BATCH_LIMIT = 0', 'SECURITY_BATCH_LIMIT = {}'.format(int(SECURITY_BATCH_LIMIT)))
    src = src.replace('PRICE_FETCH_BATCH_SIZE = 80', 'PRICE_FETCH_BATCH_SIZE = 40')
    src = src.replace('HIGH_FREQ_BATCH_SIZE = 30', 'HIGH_FREQ_BATCH_SIZE = 10')
    src = src.replace('raise SystemExit(main())', 'main()')

    script_path = Path('m_quant_structured_reversal_slice_{}.py'.format(TAG))
    out_path = Path('joinquant_structured_reversal_slice_{}.json'.format(TAG))
    err_path = Path('joinquant_structured_reversal_slice_{}_stderr.txt'.format(TAG))
    status_path = Path('joinquant_structured_reversal_slice_{}_status.json'.format(TAG))
    script_path.write_text(src, encoding='utf-8')

    buf = io.StringIO()
    err = ''
    try:
        with contextlib.redirect_stdout(buf):
            runpy.run_path(str(script_path), run_name='__main__')
        status = {
            'ok': True,
            'exit_code': 0,
            'stdout_chars': len(buf.getvalue()),
            'output_file': str(out_path),
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }
        status.update(summarize_payload(buf.getvalue()))
    except SystemExit as exc:
        code = exc.code if exc.code is not None else 0
        ok = code == 0
        if not ok:
            err = traceback.format_exc()
        status = {
            'ok': ok,
            'exit_code': code,
            'stdout_chars': len(buf.getvalue()),
            'output_file': str(out_path),
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }
        status.update(summarize_payload(buf.getvalue()))
        if err:
            status['error_tail'] = err[-3000:]
    except BaseException:
        err = traceback.format_exc()
        status = {
            'ok': False,
            'exit_code': 1,
            'stdout_chars': len(buf.getvalue()),
            'error_tail': err[-3000:],
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }

    out_path.write_text(buf.getvalue(), encoding='utf-8')
    err_path.write_text(err, encoding='utf-8')
    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(status, ensure_ascii=False, indent=2))


main()
