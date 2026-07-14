#!/usr/bin/env python3
"""Fetch real AkShare data for index-enhancement research.

The script keeps this research data under a separate directory so the longer
Tencent history does not overwrite the richer existing Eastmoney OHLCV files.
No synthetic amount, turnover, returns, or constituents are created.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import akshare as ak
import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = ROOT / "outputs" / "sources" / "akshare" / "index_enhancement"
RAW_DIR = OUT_DIR / "raw"
PROCESSED_DIR = OUT_DIR / "processed"
RESULTS_DIR = OUT_DIR / "results"
EXISTING_PROCESSED = ROOT / "outputs" / "sources" / "akshare" / "processed"


INDEX_NAMES = {
    "000300": "csi300",
    "000905": "csi500",
    "000852": "csi1000",
}


def normalize_code(code: str) -> str:
    return str(code).strip().zfill(6)


def jq_security(code: str) -> str:
    code = normalize_code(code)
    suffix = "XSHG" if code.startswith("6") else "XSHE"
    return f"{code}.{suffix}"


def tx_security(code: str) -> str:
    code = normalize_code(code)
    prefix = "sh" if code.startswith("6") else "sz"
    return f"{prefix}{code}"


def index_name(symbol: str) -> str:
    return INDEX_NAMES.get(symbol, f"index_{symbol}")


def fallback_pool(symbol: str) -> pd.DataFrame | None:
    candidates = [
        EXISTING_PROCESSED / f"a_share_{index_name(symbol)}_pool.csv",
        PROCESSED_DIR / f"{index_name(symbol)}_pool.csv",
    ]
    for path in candidates:
        if path.exists():
            pool = pd.read_csv(path, dtype={"code": str})
            if "code" in pool.columns:
                if "name" not in pool.columns:
                    pool["name"] = pool["code"]
                pool = pool[["code", "name"]].copy()
                pool["code"] = pool["code"].map(normalize_code)
                pool["pool_source"] = str(path.relative_to(ROOT))
                return pool.drop_duplicates("code").sort_values("code")
    return None


def fetch_index_pool(symbol: str) -> pd.DataFrame:
    errors: list[str] = []
    try:
        raw = ak.index_stock_cons_csindex(symbol=symbol)
        pool = raw[["成分券代码", "成分券名称"]].rename(
            columns={"成分券代码": "code", "成分券名称": "name"}
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"csindex:{repr(exc)}")
        try:
            raw = ak.index_stock_cons(symbol=symbol)
            pool = raw[["品种代码", "品种名称"]].rename(
                columns={"品种代码": "code", "品种名称": "name"}
            )
        except Exception as exc2:  # noqa: BLE001
            errors.append(f"sina:{repr(exc2)}")
            fallback = fallback_pool(symbol)
            if fallback is None:
                raise RuntimeError("; ".join(errors)) from exc2
            return fallback
    pool = pool.copy()
    pool["code"] = pool["code"].map(normalize_code)
    pool["pool_source"] = f"akshare.index_stock_cons:{symbol}"
    return pool.drop_duplicates("code").sort_values("code")


def fetch_tx(code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    raw = ak.stock_zh_a_hist_tx(
        symbol=tx_security(code),
        start_date=start,
        end_date=end,
        adjust=adjust,
        timeout=20,
    )
    if raw.empty:
        return raw
    mapping = {
        "date": "date",
        "open": "open",
        "close": "close",
        "high": "high",
        "low": "low",
        "amount": "volume",
    }
    df = raw.rename(columns=mapping).copy()
    df["code"] = normalize_code(code)
    df["security"] = df["code"].map(jq_security)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    for col in ["open", "close", "high", "low", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["amount"] = pd.NA
    df["turnover"] = pd.NA
    df["source"] = "akshare.stock_zh_a_hist_tx"
    df["adjust"] = adjust
    return df[["date", "code", "security", "open", "close", "high", "low", "volume", "amount", "turnover", "source", "adjust"]]


def fetch_em(code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    raw = ak.stock_zh_a_hist(
        symbol=normalize_code(code),
        period="daily",
        start_date=start,
        end_date=end,
        adjust=adjust,
    )
    if raw.empty:
        return raw
    mapping = {
        "日期": "date",
        "股票代码": "code",
        "开盘": "open",
        "收盘": "close",
        "最高": "high",
        "最低": "low",
        "成交量": "volume",
        "成交额": "amount",
        "换手率": "turnover",
    }
    df = raw.rename(columns=mapping).copy()
    if "code" not in df.columns:
        df["code"] = normalize_code(code)
    df["code"] = df["code"].map(normalize_code)
    df["security"] = df["code"].map(jq_security)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    for col in ["open", "close", "high", "low", "volume", "amount", "turnover"]:
        if col not in df.columns:
            df[col] = pd.NA
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["source"] = "akshare.stock_zh_a_hist"
    df["adjust"] = adjust
    return df[["date", "code", "security", "open", "close", "high", "low", "volume", "amount", "turnover", "source", "adjust"]]


def fetch_one(code: str, start: str, end: str, adjust: str, providers: list[str], retries: int, retry_sleep: float) -> tuple[pd.DataFrame, str | None]:
    last_error = None
    for provider in providers:
        for attempt in range(retries + 1):
            try:
                if provider == "tx":
                    return fetch_tx(code, start, end, adjust), None
                if provider == "em":
                    return fetch_em(code, start, end, adjust), None
                raise ValueError(provider)
            except Exception as exc:  # noqa: BLE001
                last_error = f"{provider}:{repr(exc)}"
                if attempt < retries:
                    time.sleep(retry_sleep * (attempt + 1))
    return pd.DataFrame(), last_error


def usable_existing(path: Path, start: str, end: str) -> bool:
    if not path.exists():
        return False
    try:
        frame = pd.read_csv(path, usecols=["date"])
    except Exception:  # noqa: BLE001
        return False
    if frame.empty:
        return False
    dates = pd.to_datetime(frame["date"], errors="coerce").dropna()
    if dates.empty:
        return False
    start_ok = dates.min() <= pd.to_datetime(start)
    # The latest exchange date may lag a requested calendar end date by a few days.
    end_ok = dates.max() >= pd.to_datetime(end) - pd.Timedelta(days=14)
    return bool(start_ok and end_ok and len(dates) >= 1000)


def clean_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def write_summary(path: Path, summary: dict) -> None:
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--indices", default="000300,000905")
    parser.add_argument("--start", default="20200101")
    parser.add_argument("--end", default=datetime.now().strftime("%Y%m%d"))
    parser.add_argument("--adjust", default="qfq")
    parser.add_argument("--provider", default="tx", choices=["tx", "em", "em_tx"])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sleep", type=float, default=0.25)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--retry-sleep", type=float, default=1.0)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    providers = ["em", "tx"] if args.provider == "em_tx" else [args.provider]
    all_summaries = []
    for symbol in [item.strip() for item in args.indices.split(",") if item.strip()]:
        slug = index_name(symbol)
        pool = fetch_index_pool(symbol)
        if args.limit:
            pool = pool.head(args.limit)
        pool_path = PROCESSED_DIR / f"{slug}_pool.csv"
        pool.to_csv(pool_path, index=False, encoding="utf-8-sig")

        raw_dir = RAW_DIR / slug
        raw_dir.mkdir(parents=True, exist_ok=True)
        frames = []
        failures = []
        reused = 0
        for idx, row in enumerate(pool.to_dict("records"), 1):
            code = normalize_code(row["code"])
            path = raw_dir / f"{code}.csv"
            if args.skip_existing and usable_existing(path, args.start, args.end):
                frame = pd.read_csv(path, dtype={"code": str})
                frame["name"] = row.get("name", code)
                frames.append(frame)
                reused += 1
                print(f"[{slug}] reuse {idx}/{len(pool)} {code} rows={len(frame)}")
                continue
            frame, error = fetch_one(code, args.start, args.end, args.adjust, providers, args.retries, args.retry_sleep)
            if error or frame.empty:
                failures.append({"code": code, "name": row.get("name", code), "reason": error or "empty"})
                print(f"[{slug}] FAIL {idx}/{len(pool)} {code}: {error or 'empty'}", file=sys.stderr)
                continue
            frame["name"] = row.get("name", code)
            frame.to_csv(path, index=False, encoding="utf-8-sig")
            frames.append(frame)
            print(f"[{slug}] {idx}/{len(pool)} {code} rows={len(frame)} source={frame['source'].iloc[0]}")
            time.sleep(max(0, args.sleep))

        combined_path = PROCESSED_DIR / f"{slug}_daily_{args.start}_{args.end}_{args.adjust}.csv"
        if frames:
            combined = pd.concat(frames, ignore_index=True)
            combined.to_csv(combined_path, index=False, encoding="utf-8-sig")
            source_counts = combined["source"].value_counts(dropna=False).to_dict()
            latest_date = combined["date"].max()
            earliest_date = combined["date"].min()
        else:
            combined = pd.DataFrame()
            source_counts = {}
            latest_date = None
            earliest_date = None

        failures_path = RESULTS_DIR / f"{slug}_fetch_failures.csv"
        pd.DataFrame(failures).to_csv(failures_path, index=False, encoding="utf-8-sig")
        summary = {
            "index_symbol": symbol,
            "index_name": slug,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "start": args.start,
            "end": args.end,
            "adjust": args.adjust,
            "provider": args.provider,
            "pool_path": str(pool_path.relative_to(ROOT)),
            "stocks_requested": int(len(pool)),
            "stocks_success": int(combined["code"].nunique()) if not combined.empty else 0,
            "rows": int(len(combined)),
            "dates": int(combined["date"].nunique()) if not combined.empty else 0,
            "earliest_date": earliest_date,
            "latest_date": latest_date,
            "reused_existing": reused,
            "source_counts": source_counts,
            "combined_path": str(combined_path.relative_to(ROOT)) if frames else None,
            "failures_path": str(failures_path.relative_to(ROOT)),
            "failures": failures[:50],
        }
        summary_path = RESULTS_DIR / f"{slug}_fetch_summary.json"
        write_summary(summary_path, summary)
        all_summaries.append(summary)

    write_summary(RESULTS_DIR / "index_enhancement_fetch_summary.json", {"summaries": all_summaries})
    print(json.dumps({"summaries": all_summaries}, ensure_ascii=False, indent=2))
    return 0 if any(item["stocks_success"] for item in all_summaries) else 1


if __name__ == "__main__":
    raise SystemExit(main())
