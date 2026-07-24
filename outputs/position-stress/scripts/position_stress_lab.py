#!/usr/bin/env python3
"""
M-Quant 建仓压力测试数据包。

用途：
- 优先尝试从 JoinQuant / jqdatasdk 拉取指定交易日 OHLCV。
- 如果本地没有 JoinQuant 环境或授权，则只使用项目已有真实 AkShare 缓存，不补造缺失行情。
- 生成页面可读取的 K 线、行情表、建仓模拟和压力测试报告。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
AKSHARE_RAW_DIR = ROOT / "outputs" / "sources" / "akshare" / "raw" / "a_share_daily"
DEFAULT_SYMBOLS_FILE = ROOT / "outputs" / "sources" / "akshare" / "symbols" / "position_stress_core_3000.csv"
OUT_DIR = ROOT / "outputs" / "position-stress"
DATA_DIR = OUT_DIR / "data"
RESULTS_DIR = OUT_DIR / "results"


@dataclass(frozen=True)
class RunConfig:
    start: str
    end: str
    symbols_file: Path
    top_n: int
    capital: float
    source: str
    import_file: Path | None = None
    selected_codes: tuple[str, ...] = ()
    strategy_adapter: str = "ohlcv_core_volume_price"
    strategy_id: str = "m_quant_trend_volume_pressure_v1"
    strategy_name: str = "趋势量价建仓压力测试 v1"
    lot_size: int = 100
    commission_bps: float = 2.5
    min_commission: float = 5.0
    stamp_duty_bps: float = 5.0
    slippage_bps: float = 5.0
    cash_buffer_pct: float = 0.01
    holding_policy: str = "next_day"
    min_holding_days: int = 1
    base_holding_days: int = 5
    max_holding_days: int = 20
    hard_max_holding_days: int = 60
    signal_buffer_n: int = 80
    trend_extend_buffer_n: int = 40
    trend_extend_min_return: float = 0.03
    stop_loss_pct: float = 0.08
    take_profit_pct: float = 0.12
    trailing_stop_pct: float = 0.06
    score_drop_pct: float = 0.30
    execution_model: str = "constrained_liquidity"
    max_participation_pct: float = 0.05
    capital_sweep: tuple[float, ...] = ()


def normalize_code(value: str) -> str:
    text = str(value).strip()
    if "." in text:
        text = text.split(".", 1)[0]
    return text.zfill(6)


def jq_security(code: str) -> str:
    code = normalize_code(code)
    return f"{code}.XSHG" if code.startswith("6") else f"{code}.XSHE"


def read_symbol_pool(path: Path) -> pd.DataFrame:
    if str(path) == "auto_cache_all":
        return read_cache_symbol_pool()
    if not path.exists():
        raise SystemExit(f"股票池文件不存在：{path}")
    pool = pd.read_csv(path, dtype={"code": str})
    if "code" not in pool.columns:
        raise SystemExit("股票池文件必须包含 code 列。")
    if "name" not in pool.columns:
        pool["name"] = pool["code"]
    pool = pool[["code", "name"]].copy()
    pool["code"] = pool["code"].map(normalize_code)
    pool["security"] = pool["code"].map(jq_security)
    return pool.drop_duplicates("code").sort_values("code")


def narrow_pool_to_selected_codes(pool: pd.DataFrame, selected_codes: tuple[str, ...]) -> pd.DataFrame:
    selected = [normalize_code(code) for code in selected_codes if str(code).strip()]
    if not selected:
        return pool
    names = dict(zip(pool["code"], pool["name"])) if "name" in pool.columns else {}
    rows = [{"code": code, "name": names.get(code, code), "security": jq_security(code)} for code in selected]
    return pd.DataFrame(rows).drop_duplicates("code").sort_values("code")


def read_cache_symbol_pool() -> pd.DataFrame:
    rows = []
    for path in sorted(AKSHARE_RAW_DIR.glob("*.csv")):
        code = normalize_code(path.stem)
        name = code
        try:
            sample = pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig", nrows=1)
            if not sample.empty and "name" in sample.columns and pd.notna(sample.iloc[0].get("name")):
                name = str(sample.iloc[0].get("name"))
        except Exception:
            pass
        rows.append({"code": code, "name": name, "pool_source": "akshare_raw_cache_all"})
    if not rows:
        raise SystemExit(f"全缓存股票池为空：{AKSHARE_RAW_DIR}")
    pool = pd.DataFrame(rows)
    pool["security"] = pool["code"].map(jq_security)
    return pool[["code", "name", "security"]].drop_duplicates("code").sort_values("code")


def try_fetch_joinquant(pool: pd.DataFrame, config: RunConfig) -> tuple[pd.DataFrame, str]:
    if config.source not in {"auto", "joinquant"}:
        return pd.DataFrame(), "未请求 JoinQuant。"

    securities = pool["security"].tolist()
    name_by_security = dict(zip(pool["security"], pool["name"]))
    code_by_security = dict(zip(pool["security"], pool["code"]))

    try:
        try:
            from jqdata import get_price  # type: ignore
        except ModuleNotFoundError:
            from jqdatasdk import auth, get_price  # type: ignore

            account = os.getenv("JQ_ACCOUNT") or os.getenv("JOINQUANT_ACCOUNT")
            password = os.getenv("JQ_PASSWORD") or os.getenv("JOINQUANT_PASSWORD")
            if account and password:
                auth(account, password)

        raw = get_price(
            securities,
            start_date=config.start,
            end_date=config.end,
            frequency="daily",
            fields=["open", "high", "low", "close", "volume", "money"],
            panel=False,
            fq="pre",
        )
    except Exception as exc:  # noqa: BLE001 - 报告里要保留真实失败原因
        return pd.DataFrame(), f"JoinQuant 拉取不可用：{exc}"

    if raw is None or len(raw) == 0:
        return pd.DataFrame(), "JoinQuant 返回空数据。"

    df = raw.copy().reset_index()
    if "time" not in df.columns:
        time_col = "index" if "index" in df.columns else df.columns[0]
        df = df.rename(columns={time_col: "time"})
    if "code" not in df.columns and "security" in df.columns:
        df = df.rename(columns={"security": "code"})
    df["security"] = df["code"].astype(str)
    df["code"] = df["security"].map(code_by_security).fillna(df["security"].str.slice(0, 6))
    df["name"] = df["security"].map(name_by_security).fillna(df["code"])
    df["date"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
    df = df.rename(columns={"money": "amount"})
    keep = ["date", "code", "security", "name", "open", "high", "low", "close", "volume", "amount"]
    df = df[[col for col in keep if col in df.columns]].copy()
    df["source"] = "joinquant.get_price"
    df["adjust"] = "pre"
    return normalize_ohlcv(df), "JoinQuant 拉取成功。"


def fetch_akshare_one(code: str, start: str, end: str, name: str) -> pd.DataFrame:
    import akshare as ak  # type: ignore

    raw = ak.stock_zh_a_hist(
        symbol=normalize_code(code),
        period="daily",
        start_date=start.replace("-", ""),
        end_date=end.replace("-", ""),
        adjust="qfq",
    )
    if raw is None or raw.empty:
        return pd.DataFrame()
    mapping = {
        "日期": "date",
        "股票代码": "code",
        "开盘": "open",
        "收盘": "close",
        "最高": "high",
        "最低": "low",
        "成交量": "volume",
        "成交额": "amount",
        "振幅": "amplitude",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amount",
        "换手率": "turnover",
    }
    df = raw.rename(columns=mapping).copy()
    df["code"] = normalize_code(code)
    df["security"] = jq_security(code)
    df["source"] = "akshare.stock_zh_a_hist"
    df["adjust"] = "qfq"
    df["name"] = name
    return normalize_ohlcv(df)


def eastmoney_secid(code: str) -> str:
    code = normalize_code(code)
    market = "1" if code.startswith("6") else "0"
    return f"{market}.{code}"


def fetch_eastmoney_one(code: str, start: str, end: str, name: str) -> pd.DataFrame:
    params = {
        "secid": eastmoney_secid(code),
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116",
        "klt": "101",
        "fqt": "1",
        "beg": start.replace("-", ""),
        "end": end.replace("-", ""),
    }
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 M-Quant"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    klines = (payload.get("data") or {}).get("klines") or []
    rows = []
    for line in klines:
        parts = str(line).split(",")
        if len(parts) < 11:
            continue
        rows.append({
            "date": parts[0],
            "code": normalize_code(code),
            "open": parts[1],
            "close": parts[2],
            "high": parts[3],
            "low": parts[4],
            "volume": parts[5],
            "amount": parts[6],
            "amplitude": parts[7],
            "change_pct": parts[8],
            "change_amount": parts[9],
            "turnover": parts[10],
            "security": jq_security(code),
            "source": "eastmoney.push2his.kline",
            "adjust": "qfq",
            "name": name,
        })
    return normalize_ohlcv(pd.DataFrame(rows)) if rows else pd.DataFrame()


def tencent_symbol(code: str) -> str:
    code = normalize_code(code)
    prefix = "sh" if code.startswith("6") else "sz"
    return f"{prefix}{code}"


def fetch_tencent_one(code: str, start: str, end: str, name: str) -> pd.DataFrame:
    symbol = tencent_symbol(code)
    params = {"param": f"{symbol},day,{start},{end},10,qfq"}
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 M-Quant"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    data = (payload.get("data") or {}).get(symbol) or {}
    klines = data.get("qfqday") or data.get("day") or []
    rows = []
    for item in klines:
        if not isinstance(item, list) or len(item) < 6:
            continue
        rows.append({
            "date": item[0],
            "code": normalize_code(code),
            "open": item[1],
            "close": item[2],
            "high": item[3],
            "low": item[4],
            "volume": item[5],
            "amount": np.nan,
            "security": jq_security(code),
            "source": "tencent.ifzq.fqkline",
            "adjust": "qfq",
            "name": name,
        })
    return normalize_ohlcv(pd.DataFrame(rows)) if rows else pd.DataFrame()


def merge_raw_cache(df: pd.DataFrame) -> None:
    AKSHARE_RAW_DIR.mkdir(parents=True, exist_ok=True)
    for code, part in df.groupby("code"):
        path = AKSHARE_RAW_DIR / f"{code}.csv"
        if path.exists():
            old = pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig")
            frames = [frame for frame in [old, part] if not frame.empty]
            merged = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        else:
            merged = part.copy()
        merged = normalize_ohlcv(merged)
        merged.to_csv(path, index=False, encoding="utf-8-sig")


def read_manual_import(path: Path, pool: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    if not path or not path.exists():
        return pd.DataFrame(), "未提供手动行情导入文件。"

    text = path.read_text(encoding="utf-8-sig").strip()
    if not text:
        return pd.DataFrame(), "手动行情导入文件为空。"
    if text[0] in "[{":
        payload = json.loads(text)
        rows = payload.get("rows") if isinstance(payload, dict) else payload
        df = pd.DataFrame(rows)
    else:
        df = pd.read_csv(path, dtype={"code": str, "股票代码": str}, encoding="utf-8-sig")

    if df.empty:
        return pd.DataFrame(), "手动行情导入没有解析到行。"

    mapping = {
        "日期": "date",
        "时间": "date",
        "股票代码": "code",
        "证券代码": "code",
        "代码": "code",
        "证券": "security",
        "聚宽代码": "security",
        "名称": "name",
        "股票名称": "name",
        "开盘": "open",
        "最高": "high",
        "最低": "low",
        "收盘": "close",
        "成交量": "volume",
        "成交额": "amount",
        "money": "amount",
        "涨跌幅": "change_pct",
        "换手率": "turnover",
    }
    df = df.rename(columns=mapping).copy()
    if "code" not in df.columns and "security" in df.columns:
        df["code"] = df["security"].astype(str).str.slice(0, 6)
    required = {"date", "code", "open", "high", "low", "close"}
    missing = required - set(df.columns)
    if missing:
        raise SystemExit(f"手动行情导入缺少字段：{', '.join(sorted(missing))}")

    name_by_code = dict(zip(pool["code"], pool["name"]))
    df["code"] = df["code"].map(normalize_code)
    df = df[df["code"].isin(set(pool["code"]))].copy()
    if "security" not in df.columns:
        df["security"] = df["code"].map(jq_security)
    if "name" not in df.columns:
        df["name"] = df["code"].map(name_by_code).fillna(df["code"])
    df["source"] = df.get("source", "manual_real_ohlcv_import")
    df["adjust"] = df.get("adjust", "unknown")
    imported = normalize_ohlcv(df)
    if not imported.empty:
        merge_raw_cache(imported)
    return imported, f"手动导入真实行情 {len(imported)} 行，覆盖 {imported['date'].nunique() if not imported.empty else 0} 天。"


def try_fetch_akshare_network(pool: pd.DataFrame, config: RunConfig) -> tuple[pd.DataFrame, list[str]]:
    if config.source not in {"auto", "akshare"}:
        return pd.DataFrame(), ["未请求 AkShare 联网补齐。"]

    frames: list[pd.DataFrame] = []
    failures: list[str] = []
    for row in pool.itertuples():
        try:
            df = fetch_akshare_one(row.code, config.start, config.end, row.name)
        except Exception as exc:  # noqa: BLE001
            try:
                df = fetch_eastmoney_one(row.code, config.start, config.end, row.name)
                time.sleep(0.04)
            except Exception as direct_exc:  # noqa: BLE001
                try:
                    df = fetch_tencent_one(row.code, config.start, config.end, row.name)
                    time.sleep(0.04)
                    failures.append(f"{row.code}: AkShare/东方财富失败，已用腾讯真实K线补齐；成交额为空。")
                except Exception as tencent_exc:  # noqa: BLE001
                    failures.append(f"{row.code}: AkShare 拉取失败 {exc}; 东方财富直连失败 {direct_exc}; 腾讯直连失败 {tencent_exc}")
                    continue
        if df.empty:
            try:
                df = fetch_tencent_one(row.code, config.start, config.end, row.name)
                time.sleep(0.04)
                failures.append(f"{row.code}: 主接口返回空，已用腾讯真实K线补齐；成交额为空。")
            except Exception as tencent_exc:  # noqa: BLE001
                failures.append(f"{row.code}: 联网行情返回空，腾讯直连失败 {tencent_exc}")
                continue
        frames.append(df)

    if not frames:
        return pd.DataFrame(), failures
    data = normalize_ohlcv(pd.concat(frames, ignore_index=True))
    merge_raw_cache(data)
    return data, failures


def read_akshare_cache(pool: pd.DataFrame, config: RunConfig) -> tuple[pd.DataFrame, list[str]]:
    frames: list[pd.DataFrame] = []
    failures: list[str] = []
    name_by_code = dict(zip(pool["code"], pool["name"]))

    for code in pool["code"]:
        path = AKSHARE_RAW_DIR / f"{code}.csv"
        if not path.exists():
            failures.append(f"{code}: 本地缓存不存在")
            continue
        try:
            df = pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{code}: 读取失败 {exc}")
            continue
        if df.empty or "date" not in df.columns:
            failures.append(f"{code}: 缓存为空或缺少 date")
            continue
        df["code"] = df.get("code", code).map(normalize_code) if "code" in df.columns else code
        if "security" not in df.columns:
            df["security"] = df["code"].map(jq_security)
        if "name" not in df.columns:
            df["name"] = df["code"].map(name_by_code).fillna(df["code"])
        else:
            df["name"] = df["name"].fillna(df["code"].map(name_by_code))
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        frames.append(df)

    if not frames:
        return pd.DataFrame(), failures

    history = normalize_ohlcv(pd.concat(frames, ignore_index=True))
    return history[(history["date"] >= config.start) & (history["date"] <= config.end)].copy(), failures


def combine_real_sources(*frames: pd.DataFrame) -> pd.DataFrame:
    valid = [frame for frame in frames if frame is not None and not frame.empty]
    if not valid:
        return pd.DataFrame()
    combined = pd.concat(valid, ignore_index=True)
    combined = normalize_ohlcv(combined)
    priority = {
        "joinquant.get_price": 5,
        "akshare.stock_zh_a_hist": 4,
        "eastmoney.push2his.kline": 3,
        "tencent.ifzq.fqkline": 2,
    }
    combined["_source_priority"] = combined["source"].map(priority).fillna(1)
    combined["_has_amount"] = combined["amount"].notna().astype(int)
    combined = combined.sort_values(["code", "date", "_has_amount", "_source_priority"])
    combined = combined.drop_duplicates(["code", "date"], keep="last")
    return combined.drop(columns=["_source_priority", "_has_amount"])


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    rename = {"money": "amount"}
    out = out.rename(columns=rename)
    for col in ["open", "high", "low", "close", "volume", "amount", "turnover", "change_pct"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    for col in ["amount", "turnover", "change_pct"]:
        if col not in out.columns:
            out[col] = np.nan
    out["code"] = out["code"].map(normalize_code)
    out["date"] = pd.to_datetime(out["date"]).dt.strftime("%Y-%m-%d")
    out["security"] = out.get("security", out["code"].map(jq_security))
    out["name"] = out.get("name", out["code"])
    out = out.dropna(subset=["date", "open", "high", "low", "close"])
    out = out.sort_values(["code", "date"]).drop_duplicates(["code", "date"], keep="last")
    return out


def load_history_for_indicators(pool: pd.DataFrame, data: pd.DataFrame) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for code in pool["code"]:
        path = AKSHARE_RAW_DIR / f"{code}.csv"
        if not path.exists():
            continue
        df = pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig")
        frames.append(df)
    if frames:
        history = normalize_ohlcv(pd.concat(frames, ignore_index=True))
        combined = pd.concat([history, data], ignore_index=True)
        return normalize_ohlcv(combined)
    return data.copy()


def rank_pct(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    ranked = series.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5)


def clip01(value: pd.Series) -> pd.Series:
    return value.clip(lower=0, upper=1)


def add_strategy_scores(data: pd.DataFrame, history: pd.DataFrame) -> pd.DataFrame:
    history = history.sort_values(["code", "date"]).copy()
    grouped = history.groupby("code", group_keys=False)
    history["prev_close"] = grouped["close"].shift(1)
    history["change_pct_calc"] = (history["close"] / history["prev_close"] - 1) * 100
    history["change_pct"] = history["change_pct"].fillna(history["change_pct_calc"])
    raw_amount = history["amount"].where(history["amount"].notna() & (history["amount"] > 0))
    estimated_amount = history["close"] * history["volume"] * 100
    history["capacity_amount"] = raw_amount.fillna(estimated_amount)
    history["capacity_amount_source"] = np.where(raw_amount.notna(), "amount", "close_volume_100_estimate")
    history.loc[history["capacity_amount"].isna() | (history["capacity_amount"] <= 0), "capacity_amount_source"] = "missing"
    history["amount"] = history["amount"].fillna(history["close"] * history["volume"])
    history["ma5"] = grouped["close"].rolling(5, min_periods=3).mean().reset_index(level=0, drop=True)
    history["ma20"] = grouped["close"].rolling(20, min_periods=8).mean().reset_index(level=0, drop=True)
    history["ma60"] = grouped["close"].rolling(60, min_periods=20).mean().reset_index(level=0, drop=True)
    history["volume_ma20"] = grouped["volume"].rolling(20, min_periods=8).mean().reset_index(level=0, drop=True)
    history["amount_ma20"] = grouped["amount"].rolling(20, min_periods=8).mean().reset_index(level=0, drop=True)
    history["ma20_slope"] = grouped["ma20"].diff(5)
    history["volume_ratio"] = history["volume"] / history["volume_ma20"].replace(0, np.nan)

    keys = data[["code", "date"]].drop_duplicates()
    scored = keys.merge(history, on=["code", "date"], how="left")
    result_frames: list[pd.DataFrame] = []
    for _, part in scored.groupby("date", sort=True):
        part = part.copy()
        day_range = (part["high"] - part["low"]).replace(0, np.nan)
        close_position = ((part["close"] - part["low"]) / day_range).clip(0, 1).fillna(0.5)
        body_strength = ((part["close"] - part["open"]) / part["open"].replace(0, np.nan)).fillna(0)
        upper_shadow = ((part["high"] - np.maximum(part["open"], part["close"])) / day_range).clip(0, 1).fillna(0)

        trend_alignment = clip01(
            0.35 * (part["close"] > part["ma20"]).astype(float)
            + 0.25 * (part["ma5"] > part["ma20"]).astype(float)
            + 0.20 * (part["ma20"] > part["ma60"]).astype(float)
            + 0.20 * (part["ma20_slope"] > 0).astype(float)
        )
        volume_price_confirmation = clip01(
            0.30 * rank_pct(part["volume_ratio"])
            + 0.25 * rank_pct(part["amount_ma20"])
            + 0.25 * close_position
            + 0.20 * rank_pct(body_strength)
        )
        crowding_risk = clip01(
            0.45 * rank_pct(part["volume_ratio"])
            + 0.30 * rank_pct(part["change_pct"])
            + 0.25 * upper_shadow
        )
        mean_reversion_score = clip01(
            0.36 * rank_pct(part["change_pct"], higher_is_better=False)
            + 0.26 * (1 - trend_alignment)
            + 0.22 * rank_pct(part["volume_ratio"])
            + 0.16 * (1 - crowding_risk)
        )
        kline_confirmation_score = clip01(
            0.32 * close_position
            + 0.26 * rank_pct(body_strength)
            + 0.24 * trend_alignment
            + 0.18 * volume_price_confirmation
            - 0.18 * upper_shadow
        )
        liquidity_quality_proxy = clip01(
            0.34 * rank_pct(part["amount_ma20"])
            + 0.24 * trend_alignment
            + 0.22 * volume_price_confirmation
            + 0.20 * (1 - crowding_risk)
        )
        low_crowding_reversal_score = clip01(
            0.34 * mean_reversion_score
            + 0.26 * (1 - crowding_risk)
            + 0.18 * rank_pct(part["amount_ma20"])
            + 0.14 * rank_pct(part["volume_ratio"], higher_is_better=False)
            + 0.08 * close_position
        )
        strategy_score = clip01(
            0.42 * trend_alignment
            + 0.38 * volume_price_confirmation
            + 0.20 * rank_pct(part["change_pct"])
            - 0.22 * crowding_risk
        )
        part["trend_alignment"] = trend_alignment
        part["volume_price_confirmation"] = volume_price_confirmation
        part["crowding_risk"] = crowding_risk
        part["mean_reversion_score"] = mean_reversion_score
        part["kline_confirmation_score"] = kline_confirmation_score
        part["liquidity_quality_proxy"] = liquidity_quality_proxy
        part["low_crowding_reversal_score"] = low_crowding_reversal_score
        part["strategy_score"] = strategy_score
        part["tradable"] = (part["volume"].fillna(0) > 0) & part[["open", "high", "low", "close"]].notna().all(axis=1)
        result_frames.append(part)
    out = pd.concat(result_frames, ignore_index=True) if result_frames else scored
    return out.sort_values(["date", "strategy_score"], ascending=[True, False])


def apply_strategy_adapter(scored: pd.DataFrame, config: RunConfig) -> pd.DataFrame:
    out = scored.copy()
    adapter = config.strategy_adapter or "ohlcv_core_volume_price"
    if adapter == "selected_codes_mean_reversion":
        selected = {normalize_code(code) for code in config.selected_codes}
        out["strategy_score"] = np.where(
            out["code"].isin(selected),
            out["mean_reversion_score"] + 1.0,
            out["mean_reversion_score"] * 0.15,
        )
    elif adapter == "ohlcv_mean_reversion":
        out["strategy_score"] = out["mean_reversion_score"]
    elif adapter == "ohlcv_kline_confirmation":
        out["strategy_score"] = out["kline_confirmation_score"]
    elif adapter == "ohlcv_liquidity_quality_proxy":
        out["strategy_score"] = out["liquidity_quality_proxy"]
    elif adapter == "ohlcv_structured_reversal_proxy":
        out["strategy_score"] = 0.65 * out["low_crowding_reversal_score"] + 0.35 * out["liquidity_quality_proxy"]
    elif adapter == "ohlcv_low_crowding_reversal_proxy":
        out["strategy_score"] = out["low_crowding_reversal_score"]
    else:
        out["strategy_score"] = out["strategy_score"]
    return out.sort_values(["date", "strategy_score"], ascending=[True, False])


def finite_float(value: object, digits: int | None = None) -> float | None:
    try:
        number = float(value)
    except Exception:  # noqa: BLE001
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits) if digits is not None else number


def safe_ratio(numerator: float | None, denominator: float | None, digits: int = 4) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return finite_float(numerator / denominator, digits)


def row_dict(row: pd.Series, fields: Iterable[str]) -> dict[str, object]:
    item: dict[str, object] = {}
    for field in fields:
        value = row.get(field)
        if isinstance(value, (float, np.floating)):
            item[field] = finite_float(value, 6)
        elif isinstance(value, (int, np.integer)):
            item[field] = int(value)
        elif pd.isna(value):
            item[field] = None
        else:
            item[field] = value
    return item


def build_signals(scored: pd.DataFrame, top_n: int) -> pd.DataFrame:
    picks: list[pd.DataFrame] = []
    for date, part in scored.groupby("date", sort=True):
        eligible = part[part["tradable"]].copy()
        eligible = eligible.sort_values("strategy_score", ascending=False).head(top_n)
        eligible["target_weight"] = 1 / max(len(eligible), 1)
        eligible["signal_date"] = date
        picks.append(eligible)
    return pd.concat(picks, ignore_index=True) if picks else pd.DataFrame()


def strategy_adapter_note(config: RunConfig) -> str:
    notes = {
        "ohlcv_core_volume_price": "使用 OHLCV 可复现的核心量价代理分数。",
        "ohlcv_kline_confirmation": "使用 OHLCV 可复现的K线确认代理分数。",
        "ohlcv_mean_reversion": "使用 OHLCV 可复现的高波动均值回归代理分数。",
        "selected_codes_mean_reversion": "优先使用准模拟盘最新选股名单，并在名单内按均值回归代理分数排序。",
        "ohlcv_liquidity_quality_proxy": "使用 OHLCV 成交额、趋势和量价确认构造 JQ质量流动性代理；不等价于 JoinQuant 基本面原策略。",
        "ohlcv_structured_reversal_proxy": "使用 OHLCV 低拥挤反转与流动性质量代理构造长江结构化反转执行链路压测分数；不等价于 JoinQuant 10m 高频结构化反转正式回测。",
        "ohlcv_low_crowding_reversal_proxy": "使用 OHLCV 低拥挤、反转修复、成交活跃和收盘强度构造中证500低拥挤反转代理；用于建仓链路压测，不等价于 JoinQuant 原生指数增强回测。",
    }
    return notes.get(config.strategy_adapter, notes["ohlcv_core_volume_price"])


def trade_commission(notional: float, config: RunConfig) -> float:
    if notional <= 0:
        return 0.0
    return max(notional * config.commission_bps / 10000, config.min_commission)


def lot_shares(target_notional: float, price: float, lot_size: int) -> int:
    if target_notional <= 0 or price <= 0:
        return 0
    lot = max(1, int(lot_size or 1))
    return int(math.floor(target_notional / price / lot) * lot)


def available_trade_amount(row: object) -> tuple[float | None, str]:
    capacity_amount = finite_float(getattr(row, "capacity_amount", None))
    capacity_source = str(getattr(row, "capacity_amount_source", "") or "")
    if capacity_amount is not None and capacity_amount > 0:
        return capacity_amount, capacity_source or "capacity_amount"
    amount = finite_float(getattr(row, "amount", None))
    if amount is not None and amount > 0:
        return amount, "amount"
    close = finite_float(getattr(row, "close", None))
    volume = finite_float(getattr(row, "volume", None))
    if close is not None and volume is not None and close > 0 and volume > 0:
        return close * volume * 100, "close_volume_100_estimate"
    return None, "missing"


def clip_order_by_liquidity(
    order_notional: float,
    price: float,
    cash_or_shares: float,
    capacity_left: float | None,
    side: str,
    config: RunConfig,
) -> dict[str, object]:
    target = max(float(order_notional or 0), 0.0)
    if target <= 0 or price <= 0:
        return {"shares": 0, "notional": 0.0, "unfilledNotional": target, "fillRatio": 0.0, "liquidityLimited": False}
    if capacity_left is None or capacity_left <= 0:
        return {"shares": 0, "notional": 0.0, "unfilledNotional": target, "fillRatio": 0.0, "liquidityLimited": True}

    if side == "buy":
        max_notional = min(target, float(cash_or_shares or 0), capacity_left)
    else:
        max_notional = min(target, max(float(cash_or_shares or 0), 0.0) * price, capacity_left)
    shares = lot_shares(max_notional, price, config.lot_size)
    notional = shares * price
    unfilled = max(target - notional, 0.0)
    return {
        "shares": int(shares),
        "notional": float(notional),
        "unfilledNotional": float(unfilled),
        "fillRatio": float(notional / target) if target > 0 else 0.0,
        "liquidityLimited": bool(capacity_left < target and unfilled > 0),
    }


def initial_curve(dates: list[str], initial_capital: float) -> list[dict[str, object]]:
    return [{
        "date": dates[0],
        "equity": 1.0,
        "nav": 1.0,
        "portfolioValue": finite_float(initial_capital, 2),
        "cash": finite_float(initial_capital, 2),
        "marketValue": 0.0,
        "tradedNotional": 0.0,
        "dailyPnl": 0.0,
        "dailyReturn": 0.0,
        "drawdown": 0.0,
        "costAmount": 0.0,
    }] if dates else []


def summarize_equity(
    curve: list[dict[str, object]],
    trades: list[dict[str, object]],
    returns: list[float],
    daily_costs: list[float],
    dates: list[str],
    initial_capital: float,
    ending_value: float,
    total_buy_notional: float,
    total_sell_notional: float,
    total_cost_amount: float,
    total_order_notional: float,
    total_filled_notional: float,
    avg_holding_count: float | None = None,
    holding_days: list[int] | None = None,
    exit_reasons: dict[str, int] | None = None,
) -> dict[str, object]:
    max_drawdown = 0.0
    peak = 1.0
    for point in curve:
        value = float(point["equity"] or 0)
        peak = max(peak, value)
        max_drawdown = min(max_drawdown, value / peak - 1)
    trade_return_values = [float(trade["return"]) for trade in trades if trade.get("return") is not None]
    positive_trades = [value for value in trade_return_values if value > 0]
    negative_trades = [value for value in trade_return_values if value < 0]
    trade_contributions = [float(trade.get("contribution") or 0) for trade in trades if trade.get("return") is not None]
    positive_contributions = [value for value in trade_contributions if value > 0]
    negative_contributions = [value for value in trade_contributions if value < 0]
    profit_contribution = float(np.sum(positive_contributions)) if positive_contributions else 0.0
    loss_contribution = float(np.sum(negative_contributions)) if negative_contributions else 0.0
    return_concentration = (
        float(np.sum(np.square(positive_contributions)) / (profit_contribution ** 2))
        if profit_contribution > 0
        else None
    )
    filled_trades = [trade for trade in trades if float(trade.get("filledNotional") or 0) > 0]
    unique_signal_dates = len(set(trade.get("signalDate") for trade in filled_trades))
    unique_codes = len(set(trade.get("code") for trade in filled_trades))
    if avg_holding_count is None:
        avg_holding_count = (len(filled_trades) / unique_signal_dates) if unique_signal_dates else 0
    best_trade = max(filled_trades, key=lambda item: item.get("return") if item.get("return") is not None else -999) if filled_trades else None
    worst_trade = min(filled_trades, key=lambda item: item.get("return") if item.get("return") is not None else 999) if filled_trades else None
    best_day = max(curve[1:], key=lambda item: item.get("dailyReturn") if item.get("dailyReturn") is not None else -999) if len(curve) > 1 else None
    worst_day = min(curve[1:], key=lambda item: item.get("dailyReturn") if item.get("dailyReturn") is not None else 999) if len(curve) > 1 else None
    daily_volatility = float(np.std(returns, ddof=0)) if returns else None
    average_daily_return = float(np.mean(returns)) if returns else None
    total_return = ending_value / initial_capital - 1 if initial_capital > 0 else 0.0
    drawdown_abs = abs(max_drawdown) if max_drawdown else None
    ending_nav = ending_value / initial_capital if initial_capital > 0 else None
    annualized_return = (ending_nav ** (252 / len(returns)) - 1) if returns and ending_nav and ending_nav > 0 else None
    single_stock_contribution = None
    if filled_trades:
        best_contribution_trade = max(
            filled_trades,
            key=lambda item: float(item.get("contribution") or 0),
        )
        single_stock_contribution = float(best_contribution_trade.get("contribution") or 0)
    else:
        best_contribution_trade = None
    avg_fill_ratio = float(np.mean([float(trade.get("fillRatio") or 0) for trade in trades])) if trades else None
    turnover = (total_buy_notional + total_sell_notional) / initial_capital if initial_capital > 0 else None
    cash_ratio = ending_value / ending_value if ending_value > 0 else None
    avg_holding_days = float(np.mean(holding_days)) if holding_days else None
    median_holding_days = float(np.median(holding_days)) if holding_days else None
    metrics = {
        "totalReturn": finite_float(total_return, 6),
        "maxDrawdown": finite_float(max_drawdown, 6),
        "initialCapital": finite_float(initial_capital, 2),
        "endingValue": finite_float(ending_value, 2),
        "totalPnl": finite_float(ending_value - initial_capital, 2),
        "totalCostAmount": finite_float(total_cost_amount, 2),
        "averageDailyCost": finite_float(np.mean(daily_costs), 2) if daily_costs else None,
        "totalBuyNotional": finite_float(total_buy_notional, 2),
        "totalSellNotional": finite_float(total_sell_notional, 2),
        "totalOrderNotional": finite_float(total_order_notional, 2),
        "totalFilledNotional": finite_float(total_filled_notional, 2),
        "averageFillRatio": finite_float(avg_fill_ratio, 4) if avg_fill_ratio is not None else None,
        "endingCash": finite_float(ending_value, 2),
        "endingCashRatio": finite_float(cash_ratio, 4) if cash_ratio is not None else None,
        "turnover": finite_float(turnover, 4) if turnover is not None else None,
        "dailyWinRate": finite_float(np.mean([ret > 0 for ret in returns]), 4) if returns else None,
        "averageDailyReturn": finite_float(average_daily_return, 6) if average_daily_return is not None else None,
        "dailyVolatility": finite_float(daily_volatility, 6) if daily_volatility is not None else None,
        "returnDrawdownRatio": safe_ratio(total_return, drawdown_abs),
        "annualizedReturn": finite_float(annualized_return, 6) if annualized_return is not None else None,
        "calmarLike": safe_ratio(annualized_return, drawdown_abs),
        "returnVolatilityRatio": safe_ratio(total_return, daily_volatility),
        "simplifiedSharpe": safe_ratio((average_daily_return or 0) * math.sqrt(252), daily_volatility) if daily_volatility else None,
        "averageWinReturn": finite_float(np.mean(positive_trades), 6) if positive_trades else None,
        "averageLossReturn": finite_float(np.mean(negative_trades), 6) if negative_trades else None,
        "profitLossRatio": finite_float(abs(np.mean(positive_trades) / np.mean(negative_trades)), 4) if positive_trades and negative_trades else None,
        "profitContribution": finite_float(profit_contribution, 6),
        "lossContribution": finite_float(loss_contribution, 6),
        "returnConcentration": finite_float(return_concentration, 4) if return_concentration is not None else None,
        "maxDailyContribution": finite_float(best_day.get("dailyReturn"), 6) if best_day else None,
        "maxSingleStockContribution": finite_float(single_stock_contribution, 6) if single_stock_contribution is not None else None,
        "maxSingleStockContributionTrade": best_contribution_trade,
        "tradeWinRate": finite_float(np.mean([ret > 0 for ret in trade_return_values]), 4) if trade_return_values else None,
        "averageTradeReturn": finite_float(np.mean(trade_return_values), 6) if trade_return_values else None,
        "bestTradeReturn": finite_float(max(trade_return_values), 6) if trade_return_values else None,
        "worstTradeReturn": finite_float(min(trade_return_values), 6) if trade_return_values else None,
        "bestTrade": best_trade,
        "worstTrade": worst_trade,
        "bestDay": best_day,
        "worstDay": worst_day,
        "uniqueHeldStocks": unique_codes,
        "averageHoldingCount": finite_float(avg_holding_count, 2),
        "averageHoldingDays": finite_float(avg_holding_days, 2) if avg_holding_days is not None else None,
        "medianHoldingDays": finite_float(median_holding_days, 2) if median_holding_days is not None else None,
        "exitReasonCounts": exit_reasons or {},
        "rebalanceCount": unique_signal_dates,
        "tradingDays": len(dates),
        "simulatedReturnDays": len(returns),
        "tradeCount": len(filled_trades),
        "orderCount": len(trades),
    }
    return metrics


def simulate_equity(scored: pd.DataFrame, signals: pd.DataFrame, config: RunConfig, delay_days: int = 0) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    if config.execution_model == "constrained_liquidity" and delay_days == 0:
        return simulate_constrained_liquidity_equity(scored, signals, config)
    if config.holding_policy == "dynamic_signal" and delay_days == 0:
        return simulate_dynamic_signal_equity(scored, signals, config)
    price = scored[["date", "code", "security", "name", "close"]].dropna().copy()
    dates = sorted(price["date"].unique())
    close_map = {(row.date, row.code): row.close for row in price.itertuples()}
    initial_capital = max(float(config.capital or 0), 0.0)
    cash = initial_capital
    curve = initial_curve(dates, initial_capital)
    trades: list[dict[str, object]] = []
    returns: list[float] = []
    daily_costs: list[float] = []
    total_buy_notional = 0.0
    total_sell_notional = 0.0
    total_cost_amount = 0.0
    total_order_notional = 0.0
    total_filled_notional = 0.0
    peak_value = initial_capital if initial_capital > 0 else 1.0

    for i in range(len(dates) - 1):
        date = dates[i]
        entry_index = i + delay_days
        exit_index = entry_index + 1
        next_date = dates[i + 1]
        picks = signals[signals["date"] == date].copy()
        portfolio_before = cash
        day_cost = 0.0
        day_pnl = 0.0
        traded_notional = 0.0
        if picks.empty or entry_index >= len(dates) or exit_index >= len(dates) or portfolio_before <= 0:
            daily_return = 0.0
        else:
            entry_date = dates[entry_index]
            exit_date = dates[exit_index]
            investable_value = portfolio_before * max(0.0, 1 - config.cash_buffer_pct)
            available_buy_cash = cash
            exit_proceeds = 0.0
            for row in picks.itertuples():
                start_close = close_map.get((entry_date, row.code))
                end_close = close_map.get((exit_date, row.code))
                if start_close and end_close and start_close > 0:
                    target_weight = float(row.target_weight or 0)
                    target_notional = investable_value * target_weight
                    buy_price = float(start_close) * (1 + config.slippage_bps / 10000)
                    sell_price = float(end_close) * (1 - config.slippage_bps / 10000)
                    shares = lot_shares(target_notional, buy_price, config.lot_size)
                    buy_notional = shares * buy_price
                    buy_commission = trade_commission(buy_notional, config)
                    while shares > 0 and buy_notional + buy_commission > available_buy_cash:
                        shares -= max(1, int(config.lot_size or 1))
                        buy_notional = shares * buy_price
                        buy_commission = trade_commission(buy_notional, config)
                    if shares <= 0:
                        fill_ratio = 0.0
                        trades.append({
                            "signalDate": date,
                            "entryDate": entry_date,
                            "exitDate": exit_date,
                            "code": row.code,
                            "security": row.security,
                            "name": row.name,
                            "entryClose": finite_float(start_close, 4),
                            "exitClose": finite_float(end_close, 4),
                            "entryPrice": finite_float(buy_price, 4),
                            "exitPrice": finite_float(sell_price, 4),
                            "targetWeight": finite_float(target_weight, 4),
                            "actualWeight": 0.0,
                            "shares": 0,
                            "orderNotional": finite_float(target_notional, 2),
                            "filledNotional": 0.0,
                            "notional": 0.0,
                            "unfilledNotional": finite_float(target_notional, 2),
                            "fillRatio": fill_ratio,
                            "return": None,
                            "pnl": 0.0,
                            "costAmount": 0.0,
                            "strategyScore": finite_float(row.strategy_score, 4),
                            "portfolioValueBefore": finite_float(portfolio_before, 2),
                            "portfolioValueAfter": finite_float(portfolio_before, 2),
                            "cashAfterTrade": finite_float(available_buy_cash, 2),
                        })
                        total_order_notional += target_notional
                        continue

                    available_buy_cash -= buy_notional + buy_commission
                    sell_notional = shares * sell_price
                    sell_commission = trade_commission(sell_notional, config)
                    stamp_duty = sell_notional * config.stamp_duty_bps / 10000
                    sell_cost = sell_commission + stamp_duty
                    proceeds = sell_notional - sell_cost
                    exit_proceeds += proceeds
                    cost_amount = buy_commission + sell_cost
                    pnl = proceeds - buy_notional - buy_commission
                    ret = pnl / (buy_notional + buy_commission) if (buy_notional + buy_commission) > 0 else None
                    contribution = pnl / portfolio_before if portfolio_before > 0 else 0.0
                    day_pnl += pnl
                    day_cost += cost_amount
                    total_buy_notional += buy_notional
                    total_sell_notional += sell_notional
                    total_cost_amount += cost_amount
                    total_order_notional += target_notional
                    total_filled_notional += buy_notional
                    traded_notional += buy_notional + sell_notional
                    fill_ratio = buy_notional / target_notional if target_notional > 0 else None
                    trades.append({
                        "signalDate": date,
                        "entryDate": entry_date,
                        "exitDate": exit_date,
                        "code": row.code,
                        "security": row.security,
                        "name": row.name,
                        "entryClose": finite_float(start_close, 4),
                        "exitClose": finite_float(end_close, 4),
                        "entryPrice": finite_float(buy_price, 4),
                        "exitPrice": finite_float(sell_price, 4),
                        "targetWeight": finite_float(target_weight, 4),
                        "actualWeight": finite_float(buy_notional / portfolio_before, 6) if portfolio_before > 0 else None,
                        "shares": int(shares),
                        "orderNotional": finite_float(target_notional, 2),
                        "filledNotional": finite_float(buy_notional, 2),
                        "notional": finite_float(buy_notional, 2),
                        "unfilledNotional": finite_float(max(target_notional - buy_notional, 0), 2),
                        "fillRatio": finite_float(fill_ratio, 4) if fill_ratio is not None else None,
                        "return": finite_float(ret, 6) if ret is not None else None,
                        "pnl": finite_float(pnl, 2),
                        "contribution": finite_float(contribution, 6),
                        "buyCost": finite_float(buy_commission, 2),
                        "sellCost": finite_float(sell_cost, 2),
                        "costAmount": finite_float(cost_amount, 2),
                        "strategyScore": finite_float(row.strategy_score, 4),
                        "portfolioValueBefore": finite_float(portfolio_before, 2),
                        "portfolioValueAfter": finite_float(available_buy_cash + exit_proceeds, 2),
                        "cashAfterTrade": finite_float(available_buy_cash, 2),
                    })
            cash = available_buy_cash + exit_proceeds
            portfolio_after = cash
            daily_return = (portfolio_after / portfolio_before - 1) if portfolio_before > 0 else 0.0
        returns.append(daily_return)
        daily_costs.append(day_cost)
        peak_value = max(peak_value, cash)
        drawdown = cash / peak_value - 1 if peak_value > 0 else 0.0
        curve.append({
            "date": dates[exit_index] if (not picks.empty and exit_index < len(dates)) else next_date,
            "equity": finite_float(cash / initial_capital, 6) if initial_capital > 0 else None,
            "nav": finite_float(cash / initial_capital, 6) if initial_capital > 0 else None,
            "portfolioValue": finite_float(cash, 2),
            "cash": finite_float(cash, 2),
            "marketValue": 0.0,
            "tradedNotional": finite_float(traded_notional, 2),
            "dailyPnl": finite_float(day_pnl, 2),
            "dailyReturn": finite_float(daily_return, 6),
            "drawdown": finite_float(drawdown, 6),
            "costAmount": finite_float(day_cost, 2),
        })

    metrics = summarize_equity(
        curve,
        trades,
        returns,
        daily_costs,
        dates,
        initial_capital,
        cash,
        total_buy_notional,
        total_sell_notional,
        total_cost_amount,
        total_order_notional,
        total_filled_notional,
        holding_days=[1 for trade in trades if float(trade.get("filledNotional") or 0) > 0],
        exit_reasons={"next_day": len([trade for trade in trades if float(trade.get("filledNotional") or 0) > 0])},
    )
    return curve, trades, metrics


def signal_maps(scored: pd.DataFrame, buffer_n: int) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], int], dict[str, pd.DataFrame]]:
    score_map: dict[tuple[str, str], float] = {}
    rank_map: dict[tuple[str, str], int] = {}
    ranked_by_date: dict[str, pd.DataFrame] = {}
    for date, part in scored.groupby("date", sort=True):
        eligible = part[part["tradable"]].sort_values("strategy_score", ascending=False).copy()
        eligible["rank"] = range(1, len(eligible) + 1)
        ranked_by_date[date] = eligible.head(max(int(buffer_n), 1)).copy()
        for row in eligible.itertuples():
            score_map[(date, row.code)] = float(row.strategy_score or 0)
            rank_map[(date, row.code)] = int(row.rank)
    return score_map, rank_map, ranked_by_date


def dynamic_exit_reason(
    holding: dict[str, object],
    date: str,
    price_now: float,
    score_now: float | None,
    rank_now: int | None,
    holding_days: int,
    config: RunConfig,
    force_close: bool = False,
) -> str | None:
    if force_close:
        return "sample_end"
    entry_price = float(holding.get("entryPriceRaw") or 0)
    entry_score = float(holding.get("entryScore") or 0)
    peak_price = max(float(holding.get("peakPrice") or entry_price), price_now)
    if entry_price <= 0:
        return None
    ret_now = price_now / entry_price - 1
    peak_ret = peak_price / entry_price - 1
    drawdown_from_peak = price_now / peak_price - 1 if peak_price > 0 else 0.0
    if holding_days >= max(int(config.hard_max_holding_days), int(config.max_holding_days), 1):
        return "hard_max_holding_days"
    if holding_days >= max(int(config.min_holding_days), 1) and ret_now <= -abs(float(config.stop_loss_pct)):
        return "stop_loss"
    if (
        holding_days >= max(int(config.min_holding_days), 1)
        and peak_ret >= abs(float(config.take_profit_pct))
        and drawdown_from_peak <= -abs(float(config.trailing_stop_pct))
    ):
        return "take_profit_trailing"
    if holding_days < max(int(config.base_holding_days), int(config.min_holding_days), 1):
        return None
    if rank_now is None or rank_now > max(int(config.signal_buffer_n), 1):
        return "signal_buffer_exit"
    trend_rank_ok = rank_now <= max(int(config.trend_extend_buffer_n), 1)
    trend_return_ok = ret_now >= float(config.trend_extend_min_return)
    trend_drawdown_ok = drawdown_from_peak > -abs(float(config.trailing_stop_pct))
    trend_extend_ok = trend_rank_ok and trend_return_ok and trend_drawdown_ok
    if entry_score > 0 and score_now is not None:
        score_drop = 1 - float(score_now) / entry_score
        if score_drop >= max(float(config.score_drop_pct), 0.0) and not trend_extend_ok:
            return "score_decay_exit"
    if holding_days >= max(int(config.max_holding_days), 1):
        if trend_extend_ok:
            return None
        return "trend_health_timeout"
    return None


def simulate_dynamic_signal_equity(scored: pd.DataFrame, signals: pd.DataFrame, config: RunConfig) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    price = scored[["date", "code", "security", "name", "close"]].dropna().copy()
    dates = sorted(price["date"].unique())
    close_map = {(row.date, row.code): float(row.close) for row in price.itertuples()}
    meta_map = {(row.date, row.code): row for row in price.itertuples()}
    score_map, rank_map, ranked_by_date = signal_maps(scored, config.signal_buffer_n)
    initial_capital = max(float(config.capital or 0), 0.0)
    cash = initial_capital
    holdings: dict[str, dict[str, object]] = {}
    curve = initial_curve(dates, initial_capital)
    trades: list[dict[str, object]] = []
    returns: list[float] = []
    daily_costs: list[float] = []
    holding_count_samples: list[int] = []
    holding_days_done: list[int] = []
    exit_reasons: dict[str, int] = {}
    total_buy_notional = 0.0
    total_sell_notional = 0.0
    total_cost_amount = 0.0
    total_order_notional = 0.0
    total_filled_notional = 0.0
    peak_value = initial_capital if initial_capital > 0 else 1.0

    for i, date in enumerate(dates):
        previous_value = curve[-1]["portfolioValue"] if curve else initial_capital
        portfolio_before = float(previous_value or cash or initial_capital)
        day_cost = 0.0
        day_pnl = 0.0
        traded_notional = 0.0

        for code in list(holdings.keys()):
            holding = holdings[code]
            price_now = close_map.get((date, code))
            if price_now is None:
                continue
            holding["peakPrice"] = max(float(holding.get("peakPrice") or price_now), price_now)
            entry_index_value = holding.get("entryIndex")
            entry_index = int(entry_index_value) if entry_index_value is not None else i
            holding_days = max(0, i - entry_index)
            score_now = score_map.get((date, code))
            rank_now = rank_map.get((date, code))
            reason = dynamic_exit_reason(
                holding,
                date,
                price_now,
                score_now,
                rank_now,
                holding_days,
                config,
                force_close=(i == len(dates) - 1),
            )
            if not reason:
                continue
            shares = int(holding.get("shares") or 0)
            sell_price = price_now * (1 - config.slippage_bps / 10000)
            sell_notional = shares * sell_price
            sell_commission = trade_commission(sell_notional, config)
            stamp_duty = sell_notional * config.stamp_duty_bps / 10000
            sell_cost = sell_commission + stamp_duty
            proceeds = sell_notional - sell_cost
            buy_notional = float(holding.get("buyNotional") or 0)
            buy_commission = float(holding.get("buyCommission") or 0)
            pnl = proceeds - buy_notional - buy_commission
            ret = pnl / (buy_notional + buy_commission) if (buy_notional + buy_commission) > 0 else None
            contribution = pnl / portfolio_before if portfolio_before > 0 else 0.0
            cash += proceeds
            day_pnl += pnl
            day_cost += sell_cost
            total_sell_notional += sell_notional
            total_cost_amount += sell_cost
            traded_notional += sell_notional
            holding_days_done.append(holding_days)
            exit_reasons[reason] = exit_reasons.get(reason, 0) + 1
            trades.append({
                "signalDate": holding.get("signalDate"),
                "entryDate": holding.get("entryDate"),
                "exitDate": date,
                "code": code,
                "security": holding.get("security"),
                "name": holding.get("name"),
                "entryClose": finite_float(holding.get("entryClose"), 4),
                "exitClose": finite_float(price_now, 4),
                "entryPrice": finite_float(holding.get("entryPriceRaw"), 4),
                "exitPrice": finite_float(sell_price, 4),
                "targetWeight": finite_float(holding.get("targetWeight"), 4),
                "actualWeight": finite_float(buy_notional / portfolio_before, 6) if portfolio_before > 0 else None,
                "shares": shares,
                "orderNotional": finite_float(holding.get("orderNotional"), 2),
                "filledNotional": finite_float(buy_notional, 2),
                "notional": finite_float(buy_notional, 2),
                "unfilledNotional": finite_float(max(float(holding.get("orderNotional") or 0) - buy_notional, 0), 2),
                "fillRatio": finite_float(holding.get("fillRatio"), 4),
                "return": finite_float(ret, 6) if ret is not None else None,
                "pnl": finite_float(pnl, 2),
                "contribution": finite_float(contribution, 6),
                "buyCost": finite_float(buy_commission, 2),
                "sellCost": finite_float(sell_cost, 2),
                "costAmount": finite_float(buy_commission + sell_cost, 2),
                "strategyScore": finite_float(holding.get("entryScore"), 4),
                "exitScore": finite_float(score_now, 4) if score_now is not None else None,
                "entryRank": holding.get("entryRank"),
                "exitRank": rank_now,
                "holdingDays": int(holding_days),
                "exitReason": reason,
                "maxReturnDuringHold": finite_float(float(holding.get("peakPrice") or price_now) / float(holding.get("entryPriceRaw") or price_now) - 1, 6),
                "scoreDropPct": finite_float(1 - (float(score_now) / float(holding.get("entryScore") or score_now or 1)), 6) if score_now is not None and float(holding.get("entryScore") or 0) > 0 else None,
                "portfolioValueBefore": finite_float(portfolio_before, 2),
                "portfolioValueAfter": None,
                "cashAfterTrade": finite_float(cash, 2),
            })
            del holdings[code]

        if i < len(dates) - 1 and len(holdings) < max(int(config.top_n), 1):
            current_value = cash + sum(int(item.get("shares") or 0) * close_map.get((date, code), float(item.get("entryPriceRaw") or 0)) for code, item in holdings.items())
            target_weight = 1 / max(int(config.top_n), 1)
            slots = max(int(config.top_n) - len(holdings), 0)
            candidates = ranked_by_date.get(date, pd.DataFrame()).copy()
            for row in candidates.itertuples():
                if slots <= 0:
                    break
                code = row.code
                if code in holdings:
                    continue
                start_close = close_map.get((date, code))
                if not start_close or start_close <= 0:
                    continue
                buy_price = start_close * (1 + config.slippage_bps / 10000)
                target_notional = current_value * max(0.0, 1 - config.cash_buffer_pct) * target_weight
                shares = lot_shares(target_notional, buy_price, config.lot_size)
                buy_notional = shares * buy_price
                buy_commission = trade_commission(buy_notional, config)
                while shares > 0 and buy_notional + buy_commission > cash:
                    shares -= max(1, int(config.lot_size or 1))
                    buy_notional = shares * buy_price
                    buy_commission = trade_commission(buy_notional, config)
                total_order_notional += target_notional
                if shares <= 0:
                    continue
                cash -= buy_notional + buy_commission
                day_cost += buy_commission
                total_buy_notional += buy_notional
                total_cost_amount += buy_commission
                total_filled_notional += buy_notional
                traded_notional += buy_notional
                fill_ratio = buy_notional / target_notional if target_notional > 0 else None
                meta = meta_map.get((date, code))
                holdings[code] = {
                    "signalDate": date,
                    "entryDate": date,
                    "entryIndex": i,
                    "code": code,
                    "security": getattr(meta, "security", jq_security(code)),
                    "name": getattr(meta, "name", code),
                    "entryClose": start_close,
                    "entryPriceRaw": buy_price,
                    "targetWeight": target_weight,
                    "shares": int(shares),
                    "orderNotional": target_notional,
                    "buyNotional": buy_notional,
                    "buyCommission": buy_commission,
                    "fillRatio": fill_ratio,
                    "entryScore": float(row.strategy_score or 0),
                    "entryRank": int(getattr(row, "rank", rank_map.get((date, code), 0))),
                    "peakPrice": start_close,
                }
                slots -= 1

        market_value = sum(int(item.get("shares") or 0) * close_map.get((date, code), float(item.get("entryPriceRaw") or 0)) for code, item in holdings.items())
        portfolio_after = cash + market_value
        daily_return = (portfolio_after / portfolio_before - 1) if portfolio_before > 0 and i > 0 else 0.0
        returns.append(daily_return)
        daily_costs.append(day_cost)
        holding_count_samples.append(len(holdings))
        peak_value = max(peak_value, portfolio_after)
        drawdown = portfolio_after / peak_value - 1 if peak_value > 0 else 0.0
        for trade in reversed(trades):
            if trade.get("exitDate") != date or trade.get("portfolioValueAfter") is not None:
                break
            trade["portfolioValueAfter"] = finite_float(portfolio_after, 2)
        curve.append({
            "date": date,
            "equity": finite_float(portfolio_after / initial_capital, 6) if initial_capital > 0 else None,
            "nav": finite_float(portfolio_after / initial_capital, 6) if initial_capital > 0 else None,
            "portfolioValue": finite_float(portfolio_after, 2),
            "cash": finite_float(cash, 2),
            "marketValue": finite_float(market_value, 2),
            "tradedNotional": finite_float(traded_notional, 2),
            "dailyPnl": finite_float(day_pnl, 2),
            "dailyReturn": finite_float(daily_return, 6),
            "drawdown": finite_float(drawdown, 6),
            "costAmount": finite_float(day_cost, 2),
        })

    ending_value = float(curve[-1]["portfolioValue"] or cash) if curve else cash
    metrics = summarize_equity(
        curve,
        trades,
        returns,
        daily_costs,
        dates,
        initial_capital,
        ending_value,
        total_buy_notional,
        total_sell_notional,
        total_cost_amount,
        total_order_notional,
        total_filled_notional,
        avg_holding_count=float(np.mean(holding_count_samples)) if holding_count_samples else 0.0,
        holding_days=holding_days_done,
        exit_reasons=exit_reasons,
    )
    return curve, trades, metrics


def simulate_constrained_liquidity_equity(scored: pd.DataFrame, signals: pd.DataFrame, config: RunConfig) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    price_fields = ["date", "code", "security", "name", "close", "volume", "amount", "capacity_amount", "capacity_amount_source"]
    price = scored[[field for field in price_fields if field in scored.columns]].dropna(subset=["date", "code", "close"]).copy()
    dates = sorted(price["date"].unique())
    close_map = {(row.date, row.code): float(row.close) for row in price.itertuples()}
    meta_map = {(row.date, row.code): row for row in price.itertuples()}
    score_map, rank_map, ranked_by_date = signal_maps(scored, config.signal_buffer_n)
    initial_capital = max(float(config.capital or 0), 0.0)
    cash = initial_capital
    holdings: dict[str, dict[str, object]] = {}
    curve = initial_curve(dates, initial_capital)
    trades: list[dict[str, object]] = []
    returns: list[float] = []
    daily_costs: list[float] = []
    holding_count_samples: list[int] = []
    holding_days_done: list[int] = []
    exit_reasons: dict[str, int] = {}
    liquidity_events: list[dict[str, object]] = []
    missing_capacity_events: list[dict[str, object]] = []
    participation_values: list[float] = []
    linger_days_values: list[int] = []
    total_buy_notional = 0.0
    total_sell_notional = 0.0
    total_cost_amount = 0.0
    total_order_notional = 0.0
    total_filled_notional = 0.0
    total_target_buy_notional = 0.0
    total_actual_buy_notional = 0.0
    total_unfilled_buy_notional = 0.0
    total_target_sell_notional = 0.0
    total_actual_sell_notional = 0.0
    total_unfilled_sell_notional = 0.0
    max_linger_notional = 0.0
    max_linger_days = 0
    peak_value = initial_capital if initial_capital > 0 else 1.0

    for i, date in enumerate(dates):
        previous_value = curve[-1]["portfolioValue"] if curve else initial_capital
        portfolio_before = float(previous_value or cash or initial_capital)
        day_cost = 0.0
        day_pnl = 0.0
        traded_notional = 0.0
        daily_capacity_used: dict[str, float] = {}
        daily_capacity_limit: dict[str, float | None] = {}
        daily_capacity_source: dict[str, str] = {}

        def capacity_left(code: str) -> float | None:
            if code not in daily_capacity_limit:
                meta = meta_map.get((date, code))
                raw_amount, source = available_trade_amount(meta) if meta is not None else (None, "missing")
                daily_capacity_source[code] = source
                daily_capacity_limit[code] = raw_amount * max(float(config.max_participation_pct), 0.0) if raw_amount is not None else None
            limit = daily_capacity_limit.get(code)
            if limit is None:
                return None
            return max(float(limit) - daily_capacity_used.get(code, 0.0), 0.0)

        for code in list(holdings.keys()):
            holding = holdings[code]
            price_now = close_map.get((date, code))
            if price_now is None:
                continue
            holding["peakPrice"] = max(float(holding.get("peakPrice") or price_now), price_now)
            if holding.get("exitPending"):
                first_exit_index = int(holding.get("firstExitIndex") or i)
                holding["lingerDays"] = max(1, i - first_exit_index + 1)
                entry_price = float(holding.get("entryPriceRaw") or price_now)
                linger_drawdown = price_now / entry_price - 1 if entry_price > 0 else 0.0
                holding["lingerMaxLoss"] = min(float(holding.get("lingerMaxLoss") or 0.0), linger_drawdown)
            entry_index_value = holding.get("entryIndex")
            entry_index = int(entry_index_value) if entry_index_value is not None else i
            holding_days = max(0, i - entry_index)
            score_now = score_map.get((date, code))
            rank_now = rank_map.get((date, code))
            reason = str(holding.get("pendingExitReason") or "") if holding.get("exitPending") else ""
            if not reason:
                maybe_reason = dynamic_exit_reason(
                    holding,
                    date,
                    price_now,
                    score_now,
                    rank_now,
                    holding_days,
                    config,
                    force_close=(i == len(dates) - 1),
                )
                if maybe_reason:
                    reason = maybe_reason
            if not reason:
                continue

            shares_before = int(holding.get("shares") or 0)
            sell_price = price_now * (1 - config.slippage_bps / 10000)
            target_sell_notional = shares_before * sell_price
            left = capacity_left(code)
            clipped = clip_order_by_liquidity(target_sell_notional, sell_price, shares_before, left, "sell", config)
            shares_sold = int(clipped["shares"] or 0)
            sell_notional = float(clipped["notional"] or 0.0)
            total_target_sell_notional += target_sell_notional
            total_unfilled_sell_notional += float(clipped["unfilledNotional"] or 0.0)

            if shares_sold <= 0:
                holding["exitPending"] = True
                holding["pendingExitReason"] = reason
                holding.setdefault("firstExitDate", date)
                holding.setdefault("firstExitIndex", i)
                linger_days = int(holding.get("lingerDays") or 1)
                linger_notional = shares_before * price_now
                max_linger_days = max(max_linger_days, linger_days)
                max_linger_notional = max(max_linger_notional, linger_notional)
                event = {
                    "date": date,
                    "code": code,
                    "name": holding.get("name"),
                    "side": "sell",
                    "targetNotional": finite_float(target_sell_notional, 2),
                    "filledNotional": 0.0,
                    "unfilledNotional": finite_float(target_sell_notional, 2),
                    "capacityLimit": finite_float(daily_capacity_limit.get(code), 2),
                    "capacityLeft": finite_float(left, 2) if left is not None else None,
                    "capacitySource": daily_capacity_source.get(code),
                    "lingerDays": linger_days,
                    "reason": reason,
                }
                liquidity_events.append(event)
                if left is None:
                    missing_capacity_events.append(event)
                continue

            daily_capacity_used[code] = daily_capacity_used.get(code, 0.0) + sell_notional
            if daily_capacity_limit.get(code):
                participation_values.append(sell_notional / float(daily_capacity_limit[code]) * max(float(config.max_participation_pct), 0.0))
            sell_commission = trade_commission(sell_notional, config)
            stamp_duty = sell_notional * config.stamp_duty_bps / 10000
            sell_cost = sell_commission + stamp_duty
            proceeds = sell_notional - sell_cost
            fraction = shares_sold / shares_before if shares_before > 0 else 0.0
            buy_notional_part = float(holding.get("buyNotional") or 0) * fraction
            buy_commission_part = float(holding.get("buyCommission") or 0) * fraction
            pnl = proceeds - buy_notional_part - buy_commission_part
            ret = pnl / (buy_notional_part + buy_commission_part) if (buy_notional_part + buy_commission_part) > 0 else None
            contribution = pnl / portfolio_before if portfolio_before > 0 else 0.0
            remaining_shares = shares_before - shares_sold
            cash += proceeds
            day_pnl += pnl
            day_cost += sell_cost
            total_sell_notional += sell_notional
            total_actual_sell_notional += sell_notional
            total_cost_amount += sell_cost
            traded_notional += sell_notional
            exit_reasons[reason] = exit_reasons.get(reason, 0) + 1
            if remaining_shares <= 0:
                holding_days_done.append(holding_days)
                if holding.get("exitPending"):
                    linger_days_values.append(int(holding.get("lingerDays") or 0))
            else:
                holding["shares"] = int(remaining_shares)
                holding["buyNotional"] = float(holding.get("buyNotional") or 0) - buy_notional_part
                holding["buyCommission"] = float(holding.get("buyCommission") or 0) - buy_commission_part
                holding["exitPending"] = True
                holding["pendingExitReason"] = reason
                holding.setdefault("firstExitDate", date)
                holding.setdefault("firstExitIndex", i)
                linger_days = int(holding.get("lingerDays") or 1)
                linger_days_values.append(linger_days)
                max_linger_days = max(max_linger_days, linger_days)
                max_linger_notional = max(max_linger_notional, remaining_shares * price_now)

            fill_ratio = float(clipped["fillRatio"] or 0.0)
            trade_record = {
                "side": "sell",
                "liquidityConstrained": bool(clipped.get("liquidityLimited")),
                "exitStatus": "full" if remaining_shares <= 0 else "partial_lingering",
                "signalDate": holding.get("signalDate"),
                "entryDate": holding.get("entryDate"),
                "exitDate": date,
                "code": code,
                "security": holding.get("security"),
                "name": holding.get("name"),
                "entryClose": finite_float(holding.get("entryClose"), 4),
                "exitClose": finite_float(price_now, 4),
                "entryPrice": finite_float(holding.get("entryPriceRaw"), 4),
                "exitPrice": finite_float(sell_price, 4),
                "targetWeight": finite_float(holding.get("targetWeight"), 4),
                "actualWeight": finite_float(buy_notional_part / portfolio_before, 6) if portfolio_before > 0 else None,
                "shares": shares_sold,
                "remainingShares": int(max(remaining_shares, 0)),
                "orderNotional": finite_float(target_sell_notional, 2),
                "filledNotional": finite_float(sell_notional, 2),
                "notional": finite_float(sell_notional, 2),
                "unfilledNotional": finite_float(float(clipped["unfilledNotional"] or 0.0), 2),
                "fillRatio": finite_float(fill_ratio, 4),
                "return": finite_float(ret, 6) if ret is not None else None,
                "pnl": finite_float(pnl, 2),
                "contribution": finite_float(contribution, 6),
                "buyCost": finite_float(buy_commission_part, 2),
                "sellCost": finite_float(sell_cost, 2),
                "costAmount": finite_float(buy_commission_part + sell_cost, 2),
                "strategyScore": finite_float(holding.get("entryScore"), 4),
                "exitScore": finite_float(score_now, 4) if score_now is not None else None,
                "entryRank": holding.get("entryRank"),
                "exitRank": rank_now,
                "holdingDays": int(holding_days),
                "exitReason": reason,
                "capacityLimit": finite_float(daily_capacity_limit.get(code), 2),
                "capacityUsedAfter": finite_float(daily_capacity_used.get(code), 2),
                "capacitySource": daily_capacity_source.get(code),
                "lingerDays": int(holding.get("lingerDays") or 0),
                "lingerMaxLoss": finite_float(holding.get("lingerMaxLoss"), 6),
                "portfolioValueBefore": finite_float(portfolio_before, 2),
                "portfolioValueAfter": None,
                "cashAfterTrade": finite_float(cash, 2),
            }
            trades.append(trade_record)
            if bool(clipped.get("liquidityLimited")) or remaining_shares > 0:
                liquidity_events.append(trade_record)
            if remaining_shares <= 0:
                del holdings[code]

        if i < len(dates) - 1 and len(holdings) < max(int(config.top_n), 1):
            current_value = cash + sum(int(item.get("shares") or 0) * close_map.get((date, code), float(item.get("entryPriceRaw") or 0)) for code, item in holdings.items())
            target_weight = 1 / max(int(config.top_n), 1)
            slots = max(int(config.top_n) - len(holdings), 0)
            candidates = ranked_by_date.get(date, pd.DataFrame()).copy()
            for row in candidates.itertuples():
                if slots <= 0:
                    break
                code = row.code
                if code in holdings:
                    continue
                start_close = close_map.get((date, code))
                if not start_close or start_close <= 0:
                    continue
                buy_price = start_close * (1 + config.slippage_bps / 10000)
                target_notional = current_value * max(0.0, 1 - config.cash_buffer_pct) * target_weight
                left = capacity_left(code)
                clipped = clip_order_by_liquidity(target_notional, buy_price, cash, left, "buy", config)
                shares = int(clipped["shares"] or 0)
                buy_notional = float(clipped["notional"] or 0.0)
                buy_commission = trade_commission(buy_notional, config)
                while shares > 0 and buy_notional + buy_commission > cash:
                    shares -= max(1, int(config.lot_size or 1))
                    buy_notional = shares * buy_price
                    buy_commission = trade_commission(buy_notional, config)
                unfilled_buy = max(target_notional - buy_notional, 0.0)
                total_order_notional += target_notional
                total_target_buy_notional += target_notional
                total_unfilled_buy_notional += unfilled_buy
                if shares <= 0:
                    event = {
                        "side": "buy",
                        "liquidityConstrained": True,
                        "signalDate": date,
                        "entryDate": date,
                        "exitDate": None,
                        "code": code,
                        "security": row.security,
                        "name": row.name,
                        "entryClose": finite_float(start_close, 4),
                        "entryPrice": finite_float(buy_price, 4),
                        "targetWeight": finite_float(target_weight, 4),
                        "actualWeight": 0.0,
                        "shares": 0,
                        "orderNotional": finite_float(target_notional, 2),
                        "filledNotional": 0.0,
                        "notional": 0.0,
                        "unfilledNotional": finite_float(target_notional, 2),
                        "fillRatio": 0.0,
                        "return": None,
                        "pnl": 0.0,
                        "costAmount": 0.0,
                        "strategyScore": finite_float(row.strategy_score, 4),
                        "capacityLimit": finite_float(daily_capacity_limit.get(code), 2),
                        "capacityLeft": finite_float(left, 2) if left is not None else None,
                        "capacitySource": daily_capacity_source.get(code),
                        "portfolioValueBefore": finite_float(portfolio_before, 2),
                        "portfolioValueAfter": None,
                        "cashAfterTrade": finite_float(cash, 2),
                    }
                    trades.append(event)
                    liquidity_events.append(event)
                    if left is None:
                        missing_capacity_events.append(event)
                    continue

                daily_capacity_used[code] = daily_capacity_used.get(code, 0.0) + buy_notional
                if daily_capacity_limit.get(code):
                    participation_values.append(buy_notional / float(daily_capacity_limit[code]) * max(float(config.max_participation_pct), 0.0))
                cash -= buy_notional + buy_commission
                day_cost += buy_commission
                total_buy_notional += buy_notional
                total_actual_buy_notional += buy_notional
                total_cost_amount += buy_commission
                total_filled_notional += buy_notional
                traded_notional += buy_notional
                fill_ratio = buy_notional / target_notional if target_notional > 0 else None
                meta = meta_map.get((date, code))
                holdings[code] = {
                    "signalDate": date,
                    "entryDate": date,
                    "entryIndex": i,
                    "code": code,
                    "security": getattr(meta, "security", jq_security(code)),
                    "name": getattr(meta, "name", code),
                    "entryClose": start_close,
                    "entryPriceRaw": buy_price,
                    "targetWeight": target_weight,
                    "shares": int(shares),
                    "orderNotional": target_notional,
                    "buyNotional": buy_notional,
                    "buyCommission": buy_commission,
                    "fillRatio": fill_ratio,
                    "entryScore": float(row.strategy_score or 0),
                    "entryRank": int(getattr(row, "rank", rank_map.get((date, code), 0))),
                    "peakPrice": start_close,
                    "exitPending": False,
                    "lingerDays": 0,
                    "lingerMaxLoss": 0.0,
                }
                if bool(clipped.get("liquidityLimited")) or unfilled_buy > 0:
                    liquidity_events.append({
                        "side": "buy",
                        "liquidityConstrained": bool(clipped.get("liquidityLimited")),
                        "signalDate": date,
                        "entryDate": date,
                        "code": code,
                        "security": getattr(meta, "security", jq_security(code)),
                        "name": getattr(meta, "name", code),
                        "orderNotional": finite_float(target_notional, 2),
                        "filledNotional": finite_float(buy_notional, 2),
                        "unfilledNotional": finite_float(unfilled_buy, 2),
                        "fillRatio": finite_float(fill_ratio, 4) if fill_ratio is not None else None,
                        "capacityLimit": finite_float(daily_capacity_limit.get(code), 2),
                        "capacityUsedAfter": finite_float(daily_capacity_used.get(code), 2),
                        "capacitySource": daily_capacity_source.get(code),
                    })
                slots -= 1

        market_value = sum(int(item.get("shares") or 0) * close_map.get((date, code), float(item.get("entryPriceRaw") or 0)) for code, item in holdings.items())
        portfolio_after = cash + market_value
        daily_return = (portfolio_after / portfolio_before - 1) if portfolio_before > 0 and i > 0 else 0.0
        returns.append(daily_return)
        daily_costs.append(day_cost)
        holding_count_samples.append(len(holdings))
        peak_value = max(peak_value, portfolio_after)
        drawdown = portfolio_after / peak_value - 1 if peak_value > 0 else 0.0
        for trade in reversed(trades):
            if trade.get("exitDate") != date or trade.get("portfolioValueAfter") is not None:
                break
            trade["portfolioValueAfter"] = finite_float(portfolio_after, 2)
        curve.append({
            "date": date,
            "equity": finite_float(portfolio_after / initial_capital, 6) if initial_capital > 0 else None,
            "nav": finite_float(portfolio_after / initial_capital, 6) if initial_capital > 0 else None,
            "portfolioValue": finite_float(portfolio_after, 2),
            "cash": finite_float(cash, 2),
            "marketValue": finite_float(market_value, 2),
            "tradedNotional": finite_float(traded_notional, 2),
            "dailyPnl": finite_float(day_pnl, 2),
            "dailyReturn": finite_float(daily_return, 6),
            "drawdown": finite_float(drawdown, 6),
            "costAmount": finite_float(day_cost, 2),
            "liquidityCapacityUsed": finite_float(sum(daily_capacity_used.values()), 2),
        })

    ending_value = float(curve[-1]["portfolioValue"] or cash) if curve else cash
    metrics = summarize_equity(
        curve,
        trades,
        returns,
        daily_costs,
        dates,
        initial_capital,
        ending_value,
        total_buy_notional,
        total_sell_notional,
        total_cost_amount,
        total_order_notional,
        total_filled_notional,
        avg_holding_count=float(np.mean(holding_count_samples)) if holding_count_samples else 0.0,
        holding_days=holding_days_done,
        exit_reasons=exit_reasons,
    )
    metrics.update({
        "executionModel": "constrained_liquidity",
        "maxParticipationPct": finite_float(config.max_participation_pct, 4),
        "targetBuyNotional": finite_float(total_target_buy_notional, 2),
        "actualBuyNotional": finite_float(total_actual_buy_notional, 2),
        "unfilledBuyNotional": finite_float(total_unfilled_buy_notional, 2),
        "targetSellNotional": finite_float(total_target_sell_notional, 2),
        "actualSellNotional": finite_float(total_actual_sell_notional, 2),
        "unfilledSellNotional": finite_float(total_unfilled_sell_notional, 2),
        "maxSingleStockParticipation": finite_float(max(participation_values), 4) if participation_values else None,
        "averageParticipation": finite_float(np.mean(participation_values), 4) if participation_values else None,
        "p95Participation": finite_float(np.percentile(participation_values, 95), 4) if participation_values else None,
        "maxLingeringNotional": finite_float(max_linger_notional, 2),
        "maxLingeringDays": int(max_linger_days),
        "liquidityEventCount": len(liquidity_events),
        "missingCapacityEventCount": len(missing_capacity_events),
        "openLingeringPositionCount": len([item for item in holdings.values() if item.get("exitPending")]),
        "liquidityEvents": liquidity_events[:300],
        "missingCapacityEvents": missing_capacity_events[:100],
    })
    return curve, trades, metrics


def stress_item(category: str, name: str, result_return: float | None, impact: str, metrics: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "category": category,
        "name": name,
        "resultReturn": finite_float(result_return, 6),
        "maxDrawdown": finite_float(metrics.get("maxDrawdown"), 6) if metrics else None,
        "tradeCount": metrics.get("tradeCount") if metrics else None,
        "endingValue": finite_float(metrics.get("endingValue"), 2) if metrics else None,
        "totalCostAmount": finite_float(metrics.get("totalCostAmount"), 2) if metrics else None,
        "averageFillRatio": finite_float(metrics.get("averageFillRatio"), 4) if metrics else None,
        "unfilledBuyNotional": finite_float(metrics.get("unfilledBuyNotional"), 2) if metrics else None,
        "unfilledSellNotional": finite_float(metrics.get("unfilledSellNotional"), 2) if metrics else None,
        "maxLingeringNotional": finite_float(metrics.get("maxLingeringNotional"), 2) if metrics else None,
        "maxLingeringDays": metrics.get("maxLingeringDays") if metrics else None,
        "impact": impact,
    }


def build_stress(metrics: dict[str, object], trades: list[dict[str, object]], scored: pd.DataFrame, config: RunConfig) -> list[dict[str, object]]:
    base_return = float(metrics.get("totalReturn") or 0)
    trade_returns = [float(trade["return"]) for trade in trades if trade.get("return") is not None]
    worst_trade = min(trade_returns) if trade_returns else 0.0
    filled_trades = [trade for trade in trades if float(trade.get("filledNotional") or 0) > 0]
    avg_weight = float(np.mean([float(trade.get("actualWeight") or 0) for trade in filled_trades])) if filled_trades else 0.0
    rebalance_count = max(1, len(set(t.get("signalDate") for t in trades)))
    if config.execution_model == "constrained_liquidity":
        base_name = "真实成交约束动态持仓"
        base_impact = f"先卖后买逐日重跑资金账本，单票单日成交不超过真实成交额的 {config.max_participation_pct:.2%}；未买成保留现金，未卖完继续滞留持仓。"
    else:
        base_name = "信号驱动动态持仓" if config.holding_policy == "dynamic_signal" else "收盘建仓次日观察"
        base_impact = "按信号缓冲、分数衰减、止盈止损和最长持仓约束逐日重跑资金账本。" if config.holding_policy == "dynamic_signal" else "按当前缓存数据直接计算。"
    items = [stress_item("基准", base_name, base_return, base_impact, metrics)]

    cost_bps_values = [20, 50] if config.holding_policy == "dynamic_signal" else [10, 20, 50, 100]
    for bps in cost_bps_values:
        cost_config = replace(config, commission_bps=bps / 2, slippage_bps=bps / 2)
        _, _, cost_metrics = simulate_equity(scored, build_signals(scored, config.top_n), cost_config)
        items.append(stress_item("成本阶梯", f"佣金+滑点 {bps}bp", cost_metrics.get("totalReturn"), f"用真实资金账本重跑：佣金 {bps / 2:g}bp、滑点 {bps / 2:g}bp，累计成本 {cost_metrics.get('totalCostAmount')} 元。", cost_metrics))

    top_n_values = [config.top_n, 20] if config.holding_policy == "dynamic_signal" else [5, 10, 20, 30]
    for top_n in sorted(set(int(value) for value in top_n_values)):
        if top_n > int(scored["code"].nunique()):
            continue
        _, top_trades, top_metrics = simulate_equity(scored, build_signals(scored, top_n), config)
        items.append(stress_item("持仓数量", f"Top{top_n} 等权", top_metrics.get("totalReturn"), f"每期取分数前 {top_n} 只，观察集中度敏感性。", top_metrics))

    for shock in [-0.02, -0.05, -0.08]:
        items.append(stress_item("近似冲击", f"全组合 {format_percent_label(shock)}", base_return + shock, "近似情景：在基准收益上叠加组合整体下跌冲击，未重跑资金账本。", metrics))

    for shock in [-0.05, -0.10, -0.20]:
        items.append(stress_item("近似冲击", f"单票隔夜 {format_percent_label(shock)}", base_return + shock * avg_weight, "近似情景：按实际成交平均权重估算单票跳空影响，未重跑资金账本。", metrics))

    if config.execution_model != "constrained_liquidity":
        for fill_ratio in [0.8, 0.5, 0.2]:
            items.append(stress_item("近似流动性", f"只成交 {int(fill_ratio * 100)}%", base_return * fill_ratio, "近似情景：按基准收益乘成交比例估算，容量模型阶段会改为逐笔重跑。", metrics))

    if config.holding_policy != "dynamic_signal":
        for delay in [1, 2]:
            _, delay_trades, delay_metrics = simulate_equity(scored, build_signals(scored, config.top_n), config, delay_days=delay)
            items.append(stress_item("延迟成交", f"T+{delay} 执行", delay_metrics.get("totalReturn"), f"信号出现后延迟 {delay} 个交易日执行，短窗口样本会减少。", delay_metrics))

    items.append(stress_item("近似冲击", "最差成交重复一次", base_return + worst_trade * avg_weight, "近似情景：按实际成交平均权重额外叠加样本内最差单票结果。", metrics))
    return items


def run_capital_sweep(scored: pd.DataFrame, signals: pd.DataFrame, base_config: RunConfig, capital_values: tuple[float, ...]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for capital in capital_values:
        constrained_config = replace(base_config, capital=float(capital), execution_model="constrained_liquidity", holding_policy="dynamic_signal")
        _, constrained_trades, constrained_metrics = simulate_equity(scored, signals, constrained_config)
        ideal_config = replace(base_config, capital=float(capital), execution_model="idealized", holding_policy="dynamic_signal")
        _, _, ideal_metrics = simulate_equity(scored, signals, ideal_config)
        constrained_return = finite_float(constrained_metrics.get("totalReturn"), 6) or 0.0
        ideal_return = finite_float(ideal_metrics.get("totalReturn"), 6) or 0.0
        rows.append({
            "初始资金": finite_float(capital, 2),
            "执行模型": "真实成交约束",
            "总收益率": constrained_metrics.get("totalReturn"),
            "旧模型总收益率": ideal_metrics.get("totalReturn"),
            "成交约束收益损失": finite_float(constrained_return - ideal_return, 6),
            "年化收益": constrained_metrics.get("annualizedReturn"),
            "最大回撤": constrained_metrics.get("maxDrawdown"),
            "成交笔数": constrained_metrics.get("tradeCount"),
            "订单数": constrained_metrics.get("orderCount"),
            "平均持仓天数": constrained_metrics.get("averageHoldingDays"),
            "平均仓位数": constrained_metrics.get("averageHoldingCount"),
            "平均成交率": constrained_metrics.get("averageFillRatio"),
            "目标买入金额": constrained_metrics.get("targetBuyNotional"),
            "实际买入金额": constrained_metrics.get("actualBuyNotional"),
            "未成交买入金额": constrained_metrics.get("unfilledBuyNotional"),
            "目标卖出金额": constrained_metrics.get("targetSellNotional"),
            "实际卖出金额": constrained_metrics.get("actualSellNotional"),
            "未卖出金额": constrained_metrics.get("unfilledSellNotional"),
            "最大单票参与率": constrained_metrics.get("maxSingleStockParticipation"),
            "平均参与率": constrained_metrics.get("averageParticipation"),
            "95分位参与率": constrained_metrics.get("p95Participation"),
            "最大滞留金额": constrained_metrics.get("maxLingeringNotional"),
            "最大滞留天数": constrained_metrics.get("maxLingeringDays"),
            "流动性事件数": constrained_metrics.get("liquidityEventCount"),
            "缺成交额事件数": constrained_metrics.get("missingCapacityEventCount"),
            "样例瓶颈": (constrained_metrics.get("liquidityEvents") or [])[:10],
            "成交明细样本数": len(constrained_trades),
        })
    return rows


def capacity_recommendation(capital_sweep: list[dict[str, object]]) -> dict[str, object]:
    acceptable = []
    for row in capital_sweep:
        unfilled_buy = float(row.get("未成交买入金额") or 0)
        unfilled_sell = float(row.get("未卖出金额") or 0)
        max_linger_days = int(row.get("最大滞留天数") or 0)
        capital = float(row.get("初始资金") or 0)
        unfilled_ratio = (unfilled_buy + unfilled_sell) / capital if capital > 0 else 0.0
        if unfilled_ratio <= 0.02 and max_linger_days <= 2:
            acceptable.append(row)
    if not capital_sweep:
        return {"recommendedCapital": None, "reason": "未运行资金阶梯扫描。"}
    if acceptable:
        best = acceptable[-1]
        return {
            "recommendedCapital": best.get("初始资金"),
            "reason": "按未成交买卖合计不超过初始资金 2%、最大卖出滞留不超过 2 个交易日的保守规则给出。",
        }
    first = capital_sweep[0]
    return {
        "recommendedCapital": first.get("初始资金"),
        "reason": "最低资金阶梯已经触发明显成交约束，只能把最低阶梯作为观察上限，建议降低单票权重或扩大股票池后复测。",
    }


def write_constrained_liquidity_markdown(report: dict[str, object], output_path: Path) -> None:
    strategy = report.get("strategy") or {}
    metrics = strategy.get("metrics") or {}
    params = strategy.get("parameters") or {}
    sweep = report.get("capitalSweep") or []
    recommendation = report.get("capacityRecommendation") or {}
    rows = [
        "# 中证500低拥挤反转 v2 真实成交压力测试报告",
        "",
        f"生成时间：{report.get('generatedAt')}",
        f"策略：{strategy.get('name')}（{strategy.get('id')}）",
        f"区间：{(report.get('requestedDateRange') or {}).get('start')} 至 {(report.get('requestedDateRange') or {}).get('end')}",
        "",
        "## 核心结论",
        "",
        f"- 执行模型：{params.get('executionModel')}。",
        f"- 单票单日成交参与率上限：{float(params.get('maxParticipationPct') or 0):.2%}。",
        f"- 基准资金总收益率：{float(metrics.get('totalReturn') or 0):.2%}，最大回撤：{float(metrics.get('maxDrawdown') or 0):.2%}。",
        f"- 未成交买入金额：{float(metrics.get('unfilledBuyNotional') or 0):,.2f} 元；未卖出金额：{float(metrics.get('unfilledSellNotional') or 0):,.2f} 元。",
        f"- 最大滞留金额：{float(metrics.get('maxLingeringNotional') or 0):,.2f} 元；最大滞留天数：{int(metrics.get('maxLingeringDays') or 0)} 天。",
        f"- 建议最大承受资金：{float(recommendation.get('recommendedCapital') or 0):,.0f} 元。{recommendation.get('reason') or ''}",
        "",
        "## 模型规则说明",
        "",
        "- 每只股票每天最大成交额 = 当日真实成交额 × 单票参与率上限。",
        "- 成交额优先使用行情字段 amount；缺失时使用 close × volume × 100 估算，因为本项目缓存的成交量按手计。仍不可估算时，新买入为 0，卖出进入无法估算容量的滞留事件。",
        "- 每天先处理退出卖单，卖出占用当日该股票成交容量；同一股票当天买入只能使用剩余容量。",
        "- 买入不足时未成交金额留在现金，不补足目标仓位。",
        "- 卖出不足时剩余股数继续留在持仓中，后续按真实收盘价重估，并继续尝试按原退出原因卖出。",
        "- 本轮不加入盘口冲击成本、分钟级成交路径或无法解释的黑箱成本。",
        "",
        "## 资金阶梯结果",
        "",
        "| 初始资金 | 总收益率 | 旧模型总收益率 | 收益差 | 最大回撤 | 未成交买入 | 未卖出 | 最大滞留天数 | 最大参与率 | 事件数 |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in sweep:
        rows.append(
            f"| {float(row.get('初始资金') or 0):,.0f} | {float(row.get('总收益率') or 0):.2%} | {float(row.get('旧模型总收益率') or 0):.2%} | {float(row.get('成交约束收益损失') or 0):.2%} | {float(row.get('最大回撤') or 0):.2%} | {float(row.get('未成交买入金额') or 0):,.0f} | {float(row.get('未卖出金额') or 0):,.0f} | {int(row.get('最大滞留天数') or 0)} | {float(row.get('最大单票参与率') or 0):.2%} | {int(row.get('流动性事件数') or 0)} |"
        )
    bottlenecks = []
    for event in metrics.get("liquidityEvents") or []:
        bottlenecks.append(event)
        if len(bottlenecks) >= 20:
            break
    rows.extend([
        "",
        "## 容量瓶颈明细",
        "",
        "| 日期 | 方向 | 股票 | 目标金额 | 成交金额 | 未成交金额 | 容量来源 | 滞留天数 |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | ---: |",
    ])
    for event in bottlenecks:
        rows.append(
            f"| {event.get('signalDate') or event.get('date') or ''} | {event.get('side') or ''} | {event.get('name') or event.get('code') or ''} | {float(event.get('orderNotional') or event.get('targetNotional') or 0):,.0f} | {float(event.get('filledNotional') or 0):,.0f} | {float(event.get('unfilledNotional') or 0):,.0f} | {event.get('capacitySource') or ''} | {int(event.get('lingerDays') or 0)} |"
        )
    rows.extend([
        "",
        "## 与旧模型对比",
        "",
        "旧模型假设买卖可以按目标金额成交，资金放大主要影响手数取整和成本；真实成交约束模型让成交容量进入每日账本，因此资金变大后买入不足、卖出滞留、现金闲置和持仓路径都会改变。这个结果更适合判断大资金容量边界，但仍是日线级容量模型。",
        "",
        "## 后续改进",
        "",
        "- 接入分钟级成交分布或盘口深度后，可进一步估计日内冲击和排队成交。",
        "- 对缺 amount 的数据源继续补齐真实成交额，减少 close × volume × 100 的估算占比。",
        "- 用正式 JoinQuant 信号替换 OHLCV 代理分数后，保留同一成交约束账本重跑。",
        "",
    ])
    output_path.write_text("\n".join(rows), encoding="utf-8")


def write_constrained_liquidity_reports(report: dict[str, object]) -> tuple[Path, Path | None]:
    docs_path = ROOT / "outputs" / "_docs" / "csi500-lcr-v2-constrained-liquidity-stress-report-20260724.md"
    docs_path.parent.mkdir(parents=True, exist_ok=True)
    write_constrained_liquidity_markdown(report, docs_path)
    desktop_path = Path.home() / "Desktop" / "中证500低拥挤反转v2真实成交压力测试" / "真实成交压力测试报告.md"
    try:
        desktop_path.parent.mkdir(parents=True, exist_ok=True)
        write_constrained_liquidity_markdown(report, desktop_path)
    except OSError:
        desktop_path = None
    return docs_path, desktop_path


def format_percent_label(value: float) -> str:
    return f"{value * 100:.0f}%"


def build_report(config: RunConfig) -> dict[str, object]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    pool = narrow_pool_to_selected_codes(read_symbol_pool(config.symbols_file), config.selected_codes)
    manual_data, manual_message = read_manual_import(config.import_file, pool) if config.import_file else (pd.DataFrame(), "")

    jq_data, jq_message = try_fetch_joinquant(pool, config)
    if not jq_data.empty:
        cache_data, cache_failures = read_akshare_cache(pool, config)
        raw_data = combine_real_sources(cache_data, jq_data, manual_data)
        source_mode = "joinquant"
        fallback_failures: list[str] = cache_failures
    else:
        akshare_data, akshare_failures = try_fetch_akshare_network(pool, config)
        cache_data, cache_failures = read_akshare_cache(pool, config)
        raw_data = combine_real_sources(cache_data, akshare_data, manual_data)
        if not akshare_data.empty:
            source_mode = "akshare_network_fallback"
            fallback_failures = [*akshare_failures, *cache_failures]
        else:
            source_mode = "akshare_cache_fallback"
            fallback_failures = [*akshare_failures, *cache_failures]

    if raw_data.empty:
        raise SystemExit("没有可用行情数据：JoinQuant 不可用，且本地缓存没有覆盖请求窗口。")

    history = load_history_for_indicators(pool, raw_data)
    scored = apply_strategy_adapter(add_strategy_scores(raw_data, history), config)
    signals = build_signals(scored, config.top_n)
    curve, trades, metrics = simulate_equity(scored, signals, config)
    stress = build_stress(metrics, trades, scored, config)
    capital_sweep = run_capital_sweep(scored, signals, config, config.capital_sweep) if config.capital_sweep else []
    capacity_advice = capacity_recommendation(capital_sweep) if capital_sweep else {}

    requested_dates = sorted(raw_data["date"].dropna().unique().tolist())
    actual_dates = sorted(scored["date"].dropna().unique().tolist())
    expected_codes = set(pool["code"].tolist())
    is_auto_cache_pool = str(config.symbols_file) == "auto_cache_all"
    is_selected_code_pool = bool(config.selected_codes)
    missing_coverage = []
    coverage_rows = []
    for day in requested_dates:
        day_codes = set(scored.loc[scored["date"] == day, "code"].dropna().astype(str).tolist())
        missing_codes = sorted(expected_codes - day_codes)
        tradable_count = int(scored.loc[(scored["date"] == day) & (scored["tradable"]), "code"].nunique())
        selected_available = len(set(config.selected_codes) & day_codes) if config.selected_codes else tradable_count
        coverage_rows.append({
            "date": day,
            "coveredCount": len(day_codes),
            "tradableCount": tradable_count,
            "selectedAvailableCount": selected_available,
            "coverageRatio": finite_float(len(day_codes) / len(expected_codes), 4) if expected_codes else None,
        })
        if missing_codes:
            missing_coverage.append({
                "date": day,
                "missingCount": len(missing_codes),
                "missingCodes": missing_codes[:30],
            })
    strict_missing_dates = [item["date"] for item in missing_coverage]
    selected_min_available = min(int(config.top_n), len(config.selected_codes) or int(config.top_n))
    min_tradable = selected_min_available if is_selected_code_pool else max(int(config.top_n) * 20, int(config.top_n))
    weak_coverage_dates = [row["date"] for row in coverage_rows if row["tradableCount"] < min_tradable or row["selectedAvailableCount"] < selected_min_available]
    relaxed_coverage = is_auto_cache_pool or is_selected_code_pool
    missing_dates = weak_coverage_dates if relaxed_coverage else strict_missing_dates
    is_complete = len(weak_coverage_dates) == 0 if relaxed_coverage else len(missing_coverage) == 0
    latest_date = actual_dates[-1] if actual_dates else ""

    model_suffix = "_constrained_liquidity" if config.execution_model == "constrained_liquidity" else ""
    data_csv = DATA_DIR / f"position_stress{model_suffix}_{config.start.replace('-', '')}_{config.end.replace('-', '')}_daily.csv"
    scored.to_csv(data_csv, index=False, encoding="utf-8-sig")
    sweep_csv = None
    if capital_sweep:
        sweep_csv = DATA_DIR / f"position_stress_{config.strategy_id}_constrained_liquidity_sweep_{config.start.replace('-', '')}_{config.end.replace('-', '')}.csv"
        pd.DataFrame(capital_sweep).to_csv(sweep_csv, index=False, encoding="utf-8-sig")

    display_fields = [
        "date", "code", "security", "name", "open", "high", "low", "close", "volume", "amount",
        "change_pct", "trend_alignment", "volume_price_confirmation", "crowding_risk", "mean_reversion_score", "kline_confirmation_score", "liquidity_quality_proxy", "low_crowding_reversal_score", "strategy_score", "tradable",
    ]
    table_rows = [row_dict(row, display_fields) for _, row in scored.sort_values(["date", "strategy_score"], ascending=[False, False]).head(300).iterrows()]

    kline_items = []
    latest_signal_date = sorted(signals["date"].dropna().unique().tolist())[-1] if not signals.empty else latest_date
    latest_selected = signals[signals["date"] == latest_signal_date].sort_values("strategy_score", ascending=False).head(config.top_n)
    for row in latest_selected.itertuples():
        stock_rows = scored[scored["code"] == row.code].sort_values("date")
        kline_items.append({
            "code": row.code,
            "security": row.security,
            "name": row.name,
            "latestScore": finite_float(row.strategy_score, 4),
            "rows": [row_dict(item, ["date", "open", "high", "low", "close", "volume", "amount", "strategy_score"]) for _, item in stock_rows.iterrows()],
        })

    daily_selections = []
    for date, part in signals.groupby("date", sort=True):
        daily_selections.append({
            "date": date,
            "selectedCount": int(len(part)),
            "names": [f"{r.name}({r.code})" for r in part.itertuples()],
            "items": [row_dict(row, ["code", "security", "name", "close", "target_weight", "strategy_score", "trend_alignment", "volume_price_confirmation", "crowding_risk"]) for _, row in part.iterrows()],
        })

    report = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "status": "ready" if is_complete and len(actual_dates) >= 2 else "incomplete_data",
        "complete": is_complete,
        "runGate": {
            "formalRunAllowed": bool(is_complete and len(actual_dates) >= 2),
            "reason": (
                "名单股票池采用覆盖检查：每日可交易样本和目标名单覆盖足够，可以运行动态持仓压力测试；不作为正式策略收益结论。"
                if is_complete and is_selected_code_pool else
                "全缓存股票池采用宽松覆盖检查：每日可交易样本和目标名单覆盖足够，可以运行动态持仓压力测试；不作为正式策略收益结论。"
                if is_complete and is_auto_cache_pool else
                "短窗口数据完整，可以运行建仓链路压力测试；不作为策略有效性结论。"
                if is_complete else
                f"缺少真实行情覆盖：{', '.join(weak_coverage_dates or missing_dates)}。正式运行已阻断。"
            ),
        },
        "sourceMode": source_mode,
        "sourceMessage": "；".join([item for item in [manual_message, jq_message] if item]),
        "dataPolicy": "优先使用 JoinQuant get_price 前复权日线；若本机未配置 JoinQuant，则尝试 AkShare 联网真实行情补齐；仍失败时只使用项目已有 AkShare 真实缓存。全流程不生成、不补造缺失交易日；完整性按真实源返回的交易日覆盖检查，不推测节假日行情。组合结果使用真实资金账本计算，初始资金会影响股数取整、成交金额、现金闲置、交易成本、净值和回撤。",
        "requestedDateRange": {"start": config.start, "end": config.end},
        "actualDates": actual_dates,
        "missingDates": missing_dates,
        "missingCoverage": missing_coverage,
        "coverage": {
            "mode": "selected_codes_relaxed" if is_selected_code_pool else "auto_cache_all_relaxed" if is_auto_cache_pool else "strict_pool_full_coverage",
            "minTradablePerDate": min_tradable,
            "weakCoverageDates": weak_coverage_dates,
            "daily": coverage_rows[:500],
        },
        "stockCount": int(scored["code"].nunique()),
        "rowCount": int(len(scored)),
        "universe": {
            "sourceFile": str(config.symbols_file.relative_to(ROOT)) if config.symbols_file.is_relative_to(ROOT) else str(config.symbols_file),
            "size": int(len(pool)),
        },
        "artifacts": {
            "dailyCsv": str(data_csv.relative_to(ROOT)),
            "capitalSweepCsv": str(sweep_csv.relative_to(ROOT)) if sweep_csv else None,
            "latestReportJson": "outputs/position-stress/results/position_stress_latest.json",
        },
        "dataTable": table_rows,
        "kline": kline_items,
        "strategy": {
            "id": config.strategy_id,
            "name": config.strategy_name,
            "adapter": config.strategy_adapter,
            "adapterNote": strategy_adapter_note(config),
            "selectedCodes": list(config.selected_codes),
            "runStatus": "complete_short_window" if is_complete else "preview_only_incomplete_data",
            "parameters": {
                "topN": config.top_n,
                "capital": config.capital,
                "rebalance": "signal_driven_dynamic" if config.holding_policy == "dynamic_signal" else "daily_close",
                "holdingPolicy": config.holding_policy,
                "minHoldingDays": config.min_holding_days,
                "baseHoldingDays": config.base_holding_days,
                "maxHoldingDays": config.max_holding_days,
                "hardMaxHoldingDays": config.hard_max_holding_days,
                "signalBufferN": config.signal_buffer_n,
                "trendExtendBufferN": config.trend_extend_buffer_n,
                "trendExtendMinReturn": config.trend_extend_min_return,
                "stopLossPct": config.stop_loss_pct,
                "takeProfitPct": config.take_profit_pct,
                "trailingStopPct": config.trailing_stop_pct,
                "scoreDropPct": config.score_drop_pct,
                "lotSize": config.lot_size,
                "commissionBps": config.commission_bps,
                "minCommission": config.min_commission,
                "stampDutyBps": config.stamp_duty_bps,
                "slippageBps": config.slippage_bps,
                "cashBufferPct": config.cash_buffer_pct,
                "executionModel": config.execution_model,
                "maxParticipationPct": config.max_participation_pct,
                "capitalSweep": list(config.capital_sweep),
            },
            "dailySelections": daily_selections,
            "equityCurve": curve,
            "trades": trades,
            "tradePreviewLimit": 80,
            "tradeStoredCount": len(trades),
            "metrics": metrics,
        },
        "stress": stress,
        "capitalSweep": capital_sweep,
        "capacityRecommendation": capacity_advice,
        "warnings": [
            *( ["数据不完整：正式建仓运行已阻断，当前收益、成交和压力测试只作为链路预览。"] if not is_complete else [] ),
            *( ["请求窗口末日行情当前没有覆盖完整股票池，页面会标为缺失。"] if config.end in missing_dates else [] ),
            *( ["当前报告使用 AkShare 联网真实行情补齐，不等同于已成功拉取 JoinQuant 数据。"] if source_mode == "akshare_network_fallback" else [] ),
            *( ["当前报告使用 AkShare 本地缓存回退，不等同于已成功拉取 JoinQuant 数据。"] if source_mode == "akshare_cache_fallback" else [] ),
            *( ["已合并手动导入真实行情文件。"] if not manual_data.empty else [] ),
            f"资金账本口径：{config.lot_size} 股一手，佣金 {config.commission_bps}bp，最低佣金 {config.min_commission} 元，卖出印花税 {config.stamp_duty_bps}bp，滑点 {config.slippage_bps}bp，现金缓冲 {config.cash_buffer_pct:.2%}。",
            *( [f"真实成交约束口径：单票单日成交上限为当日成交额的 {config.max_participation_pct:.2%}；先卖后买，买卖共享同一股票当日容量，买入不足保留现金，卖出不足继续滞留。"] if config.execution_model == "constrained_liquidity" else [] ),
            *fallback_failures[:10],
        ],
        "nextActions": [
            f"配置 JoinQuant/jqdatasdk 授权后重新点击一键导入运行，补齐 {config.end} 数据。",
            "把 strategy_score 替换为你的正式策略信号，保留同一份行情缓存和压力测试口径。",
            "动态持仓口径需要继续用真实 JoinQuant 组合账本复核，不把本地 OHLCV 代理收益直接写成正式策略收益。" if config.holding_policy == "dynamic_signal" else "短窗口只适合验证数据链路、建仓约束和页面展示，不作为策略有效性结论。",
        ],
    }

    dated_json = RESULTS_DIR / f"position_stress{model_suffix}_{config.start.replace('-', '')}_{config.end.replace('-', '')}.json"
    latest_json = RESULTS_DIR / ("position_stress_constrained_liquidity_latest.json" if config.execution_model == "constrained_liquidity" else "position_stress_latest.json")
    paths = [dated_json, latest_json]
    if config.execution_model == "constrained_liquidity":
        paths.append(RESULTS_DIR / "position_stress_latest.json")
    for path in paths:
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if config.execution_model == "constrained_liquidity":
        docs_path, desktop_path = write_constrained_liquidity_reports(report)
        report["artifacts"]["markdownReport"] = str(docs_path.relative_to(ROOT))
        report["artifacts"]["desktopMarkdownReport"] = str(desktop_path) if desktop_path else None
        for path in paths:
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def parse_args() -> RunConfig:
    parser = argparse.ArgumentParser(description="生成 M-Quant 建仓压力测试数据包")
    parser.add_argument("--start", default="2025-01-01")
    parser.add_argument("--end", default="2026-07-22")
    parser.add_argument("--symbols-file", default=str(DEFAULT_SYMBOLS_FILE))
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--capital", type=float, default=1_000_000)
    parser.add_argument("--source", choices=["auto", "joinquant", "akshare", "akshare_cache"], default="auto")
    parser.add_argument("--import-file", default="")
    parser.add_argument("--selected-codes", default="")
    parser.add_argument("--strategy-adapter", default="ohlcv_core_volume_price")
    parser.add_argument("--strategy-id", default="m_quant_trend_volume_pressure_v1")
    parser.add_argument("--strategy-name", default="趋势量价建仓压力测试 v1")
    parser.add_argument("--lot-size", type=int, default=100)
    parser.add_argument("--commission-bps", type=float, default=2.5)
    parser.add_argument("--min-commission", type=float, default=5.0)
    parser.add_argument("--stamp-duty-bps", type=float, default=5.0)
    parser.add_argument("--slippage-bps", type=float, default=5.0)
    parser.add_argument("--cash-buffer-pct", type=float, default=0.01)
    parser.add_argument("--holding-policy", choices=["next_day", "dynamic_signal"], default="dynamic_signal")
    parser.add_argument("--min-holding-days", type=int, default=1)
    parser.add_argument("--base-holding-days", type=int, default=5)
    parser.add_argument("--max-holding-days", type=int, default=20)
    parser.add_argument("--hard-max-holding-days", type=int, default=60)
    parser.add_argument("--signal-buffer-n", type=int, default=80)
    parser.add_argument("--trend-extend-buffer-n", type=int, default=40)
    parser.add_argument("--trend-extend-min-return", type=float, default=0.03)
    parser.add_argument("--stop-loss-pct", type=float, default=0.08)
    parser.add_argument("--take-profit-pct", type=float, default=0.12)
    parser.add_argument("--trailing-stop-pct", type=float, default=0.06)
    parser.add_argument("--score-drop-pct", type=float, default=0.30)
    parser.add_argument("--execution-model", choices=["idealized", "constrained_liquidity"], default="constrained_liquidity")
    parser.add_argument("--max-participation-pct", type=float, default=0.05)
    parser.add_argument("--capital-sweep", default="")
    args = parser.parse_args()
    if args.symbols_file == "auto_cache_all":
        path = Path("auto_cache_all")
    else:
        path = Path(args.symbols_file).expanduser()
        if not path.is_absolute():
            path = ROOT / path
    return RunConfig(
        start=args.start,
        end=args.end,
        symbols_file=path,
        top_n=args.top_n,
        capital=args.capital,
        source=args.source,
        import_file=Path(args.import_file).expanduser().resolve() if args.import_file else None,
        selected_codes=tuple(normalize_code(code) for code in args.selected_codes.replace("，", ",").split(",") if code.strip()),
        strategy_adapter=args.strategy_adapter,
        strategy_id=args.strategy_id,
        strategy_name=args.strategy_name,
        lot_size=args.lot_size,
        commission_bps=args.commission_bps,
        min_commission=args.min_commission,
        stamp_duty_bps=args.stamp_duty_bps,
        slippage_bps=args.slippage_bps,
        cash_buffer_pct=args.cash_buffer_pct,
        holding_policy=args.holding_policy,
        min_holding_days=args.min_holding_days,
        base_holding_days=args.base_holding_days,
        max_holding_days=args.max_holding_days,
        hard_max_holding_days=args.hard_max_holding_days,
        signal_buffer_n=args.signal_buffer_n,
        trend_extend_buffer_n=args.trend_extend_buffer_n,
        trend_extend_min_return=args.trend_extend_min_return,
        stop_loss_pct=args.stop_loss_pct,
        take_profit_pct=args.take_profit_pct,
        trailing_stop_pct=args.trailing_stop_pct,
        score_drop_pct=args.score_drop_pct,
        execution_model=args.execution_model,
        max_participation_pct=args.max_participation_pct,
        capital_sweep=tuple(float(value) for value in args.capital_sweep.replace("，", ",").split(",") if value.strip()),
    )


def main() -> None:
    report = build_report(parse_args())
    print(json.dumps({
        "status": report["status"],
        "sourceMode": report["sourceMode"],
        "actualDates": report["actualDates"],
        "missingDates": report["missingDates"],
        "rowCount": report["rowCount"],
        "stockCount": report["stockCount"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
