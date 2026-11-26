#!/usr/bin/env python3
"""Complete and audit real A-share daily OHLCV cache.

This script is intentionally data-only:
- request window stays at 2025-01-01 through 2026-07-22;
- only real rows returned by Eastmoney are saved;
- no missing trading day is generated, forward-filled, or interpolated.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = ROOT / "outputs" / "sources" / "akshare"
RAW_DIR = OUT_DIR / "raw" / "a_share_daily"
PROCESSED_DIR = OUT_DIR / "processed"
RESULTS_DIR = OUT_DIR / "results"

DEFAULT_POOL = PROCESSED_DIR / "a_share_eastmoney_all_a_20260720.csv"
REQUEST_START = "2025-01-01"
REQUEST_END = "2026-07-22"
START_YYYYMMDD = "20250101"
END_YYYYMMDD = "20260722"
EXPECTED_TRADING_DAYS = 375
FULL_STATUS = f"full_{EXPECTED_TRADING_DAYS}"
PRESSURE_PREFIX_RE = r"^(000|001|002|003|300|301|600|601|603|605|688|689)"


def normalize_code(code: object) -> str:
    return str(code).strip().zfill(6)


def security_code(code: str) -> str:
    code = normalize_code(code)
    if code.startswith("6"):
        return f"{code}.XSHG"
    if code.startswith(("0", "3")):
        return f"{code}.XSHE"
    return f"{code}.XBSE"


def eastmoney_secid(code: str) -> str:
    code = normalize_code(code)
    market = "1" if code.startswith("6") else "0"
    return f"{market}.{code}"


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()
    out = df.rename(columns={"money": "amount"}).copy()
    out["code"] = out["code"].map(normalize_code)
    out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    for col in ["open", "high", "low", "close", "volume", "amount", "amplitude", "change_pct", "change_amount", "turnover"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    for col in ["amount", "amplitude", "change_pct", "change_amount", "turnover"]:
        if col not in out.columns:
            out[col] = pd.NA
    if "security" not in out.columns:
        out["security"] = out["code"].map(security_code)
    if "source" not in out.columns:
        out["source"] = "unknown_real_cache"
    if "adjust" not in out.columns:
        out["adjust"] = "qfq"
    out = out.dropna(subset=["date", "open", "high", "low", "close"])
    return out.sort_values(["code", "date"]).drop_duplicates(["code", "date"], keep="last")


def window_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "date" not in df.columns:
        return pd.DataFrame()
    out = normalize_ohlcv(df)
    out = out[(out["date"] >= REQUEST_START) & (out["date"] <= REQUEST_END)].copy()
    if "adjust" in out.columns:
        qfq = out[out["adjust"].fillna("") == "qfq"].copy()
        if not qfq.empty:
            out = qfq
    return out


def read_raw_window(code: str) -> pd.DataFrame:
    path = RAW_DIR / f"{normalize_code(code)}.csv"
    if not path.exists():
        return pd.DataFrame()
    try:
        return window_frame(pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig"))
    except UnicodeDecodeError:
        return window_frame(pd.read_csv(path, dtype={"code": str}))


def fetch_eastmoney_one(code: str, name: str, timeout: float, start_yyyymmdd: str = START_YYYYMMDD) -> pd.DataFrame:
    params = {
        "secid": eastmoney_secid(code),
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116",
        "klt": "101",
        "fqt": "1",
        "beg": start_yyyymmdd,
        "end": END_YYYYMMDD,
    }
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 M-Quant"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    klines = (payload.get("data") or {}).get("klines") or []
    rows = []
    for line in klines:
        parts = str(line).split(",")
        if len(parts) < 11:
            continue
        rows.append(
            {
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
                "security": security_code(code),
                "source": "eastmoney.push2his.kline",
                "adjust": "qfq",
                "name": name,
            }
        )
    return window_frame(pd.DataFrame(rows)) if rows else pd.DataFrame()


def merge_raw(code: str, fetched: pd.DataFrame) -> None:
    if fetched.empty:
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{normalize_code(code)}.csv"
    frames = [fetched]
    if path.exists():
        try:
            old = pd.read_csv(path, dtype={"code": str}, encoding="utf-8-sig")
        except UnicodeDecodeError:
            old = pd.read_csv(path, dtype={"code": str})
        if not old.empty:
            frames.insert(0, old)
    merged = normalize_ohlcv(pd.concat(frames, ignore_index=True))
    merged.to_csv(path, index=False, encoding="utf-8-sig")


def load_pool(path: Path) -> pd.DataFrame:
    pool = pd.read_csv(path, dtype={"code": str})
    if "code" not in pool.columns or "name" not in pool.columns:
        raise SystemExit(f"Pool must contain code/name columns: {path}")
    pool = pool.copy()
    pool["code"] = pool["code"].map(normalize_code)
    pool["name"] = pool["name"].astype(str)
    pool["prefix3"] = pool["code"].str[:3]
    pool["is_st_or_delist_name"] = pool["name"].str.contains("ST|退", regex=True, na=False)
    pool["pressure_supported_prefix"] = pool["code"].str.match(PRESSURE_PREFIX_RE)
    return pool.drop_duplicates("code").sort_values("code").reset_index(drop=True)


def build_light_audit(pool: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for row in pool.itertuples(index=False):
        status, row_count, date_count, first_date, last_date, source = fast_raw_status(row.code)
        rows.append(
            {
                "code": row.code,
                "name": row.name,
                "prefix3": row.prefix3,
                "pressure_supported_prefix": bool(row.pressure_supported_prefix),
                "is_st_or_delist_name": bool(row.is_st_or_delist_name),
                "status": status,
                "rows": row_count,
                "dates": date_count,
                "first_date": first_date,
                "last_date": last_date,
                "source": source,
            }
        )
    return pd.DataFrame(rows)


def fast_raw_status(code: str) -> tuple[str, int, int, str | None, str | None, str]:
    path = RAW_DIR / f"{normalize_code(code)}.csv"
    if not path.exists():
        return "missing_raw", 0, 0, None, None, ""
    dates = set()
    sources = set()
    row_count = 0
    try:
        handle = path.open("r", encoding="utf-8-sig", newline="")
    except UnicodeDecodeError:
        handle = path.open("r", newline="")
    with handle:
        reader = csv.DictReader(handle)
        for row in reader:
            date = str(row.get("date") or "")[:10]
            if not (REQUEST_START <= date <= REQUEST_END):
                continue
            adjust = str(row.get("adjust") or "")
            if adjust and adjust != "qfq":
                continue
            if not row.get("open") or not row.get("high") or not row.get("low") or not row.get("close"):
                continue
            dates.add(date)
            row_count += 1
            if row.get("source"):
                sources.add(str(row["source"]))
    if not dates:
        return "missing_raw", 0, 0, None, None, ""
    date_count = len(dates)
    status = FULL_STATUS if date_count == EXPECTED_TRADING_DAYS else "partial"
    return status, row_count, date_count, min(dates), max(dates), ";".join(sorted(sources)[:5])


def status_for(frame: pd.DataFrame) -> tuple[str, int, int, str | None, str | None, str]:
    if frame.empty:
        return "missing_raw", 0, 0, None, None, ""
    dates = int(frame["date"].nunique())
    rows = int(len(frame))
    status = FULL_STATUS if dates == EXPECTED_TRADING_DAYS else "partial"
    source = ""
    if "source" in frame.columns:
        source = ";".join(sorted(map(str, frame["source"].dropna().unique()))[:5])
    return status, rows, dates, str(frame["date"].min()), str(frame["date"].max()), source


def build_audit(pool: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = []
    frames = []
    for row in pool.itertuples(index=False):
        frame = read_raw_window(row.code)
        if not frame.empty:
            frame = frame.copy()
            frame["name"] = frame.get("name", row.name)
            frames.append(frame)
        status, row_count, date_count, first_date, last_date, source = status_for(frame)
        rows.append(
            {
                "code": row.code,
                "name": row.name,
                "prefix3": row.prefix3,
                "pressure_supported_prefix": bool(row.pressure_supported_prefix),
                "is_st_or_delist_name": bool(row.is_st_or_delist_name),
                "status": status,
                "rows": row_count,
                "dates": date_count,
                "first_date": first_date,
                "last_date": last_date,
                "source": source,
            }
        )
    combined = normalize_ohlcv(pd.concat(frames, ignore_index=True)) if frames else pd.DataFrame()
    return pd.DataFrame(rows), combined


def write_outputs(audit: pd.DataFrame, combined: pd.DataFrame, fetch_failures: list[dict], fetched: int, elapsed: float) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    audit_path = RESULTS_DIR / "a_share_all_completion_audit_20260723.csv"
    missing_path = RESULTS_DIR / "a_share_all_completion_missing_or_partial_20260723.csv"
    failures_path = RESULTS_DIR / "a_share_all_completion_fetch_failures_20260723.csv"
    combined_path = PROCESSED_DIR / "a_share_all_real_20250101_20260722_qfq.csv"
    available_pool_path = PROCESSED_DIR / "a_share_all_available_pool_20250101_20260722.csv"
    full_pool_path = PROCESSED_DIR / "a_share_all_full_375_pool_20250101_20260722.csv"
    pressure_full_pool_path = PROCESSED_DIR / "a_share_pressure_supported_non_st_full_375_pool_20250101_20260722.csv"
    summary_path = RESULTS_DIR / "a_share_all_completion_summary_20260723.json"

    audit.to_csv(audit_path, index=False, encoding="utf-8-sig")
    audit[audit["status"] != FULL_STATUS].to_csv(missing_path, index=False, encoding="utf-8-sig")
    pd.DataFrame(fetch_failures).to_csv(failures_path, index=False, encoding="utf-8-sig")
    audit[audit["status"] != "missing_raw"][["code", "name", "prefix3", "status", "dates"]].to_csv(
        available_pool_path, index=False, encoding="utf-8-sig"
    )
    audit[audit["status"] == FULL_STATUS][["code", "name", "prefix3", "status", "dates"]].to_csv(
        full_pool_path, index=False, encoding="utf-8-sig"
    )
    pressure_full = audit[
        audit["pressure_supported_prefix"] & ~audit["is_st_or_delist_name"] & (audit["status"] == FULL_STATUS)
    ]
    pressure_full[["code", "name", "prefix3", "status", "dates"]].to_csv(
        pressure_full_pool_path, index=False, encoding="utf-8-sig"
    )
    if not combined.empty:
        combined.to_csv(combined_path, index=False, encoding="utf-8-sig")

    def count(mask: pd.Series, status: str | None = None) -> int:
        subset = audit[mask]
        if status is not None:
            subset = subset[subset["status"] == status]
        return int(len(subset))

    all_mask = audit.index == audit.index
    non_st_mask = ~audit["is_st_or_delist_name"]
    pressure_non_st_mask = audit["pressure_supported_prefix"] & non_st_mask
    non_pressure_non_st_mask = ~audit["pressure_supported_prefix"] & non_st_mask
    summary = {
        "request_start": REQUEST_START,
        "request_end": REQUEST_END,
        "actual_first_trading_date_in_window": "2025-01-02",
        "expected_trading_days": EXPECTED_TRADING_DAYS,
        "data_policy": "Only real returned OHLCV rows are saved; no generated, interpolated, or forward-filled rows.",
        "pool_total": int(len(audit)),
        "pool_unique_codes": int(audit["code"].nunique()),
        "st_or_delist_name_count": int(audit["is_st_or_delist_name"].sum()),
        "all": {
            FULL_STATUS: count(all_mask, FULL_STATUS),
            "partial": count(all_mask, "partial"),
            "missing_raw": count(all_mask, "missing_raw"),
        },
        "pressure_supported_non_st": {
            "total": count(pressure_non_st_mask),
            FULL_STATUS: count(pressure_non_st_mask, FULL_STATUS),
            "partial": count(pressure_non_st_mask, "partial"),
            "missing_raw": count(pressure_non_st_mask, "missing_raw"),
        },
        "non_pressure_prefix_non_st": {
            "total": count(non_pressure_non_st_mask),
            FULL_STATUS: count(non_pressure_non_st_mask, FULL_STATUS),
            "partial": count(non_pressure_non_st_mask, "partial"),
            "missing_raw": count(non_pressure_non_st_mask, "missing_raw"),
        },
        "combined_codes": int(combined["code"].nunique()) if not combined.empty else 0,
        "combined_rows": int(len(combined)) if not combined.empty else 0,
        "combined_dates": int(combined["date"].nunique()) if not combined.empty else 0,
        "fetched_this_run": int(fetched),
        "fetch_failures": int(len(fetch_failures)),
        "elapsed_seconds": round(elapsed, 1),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "outputs": {
            "audit": str(audit_path.relative_to(ROOT)),
            "missing_or_partial": str(missing_path.relative_to(ROOT)),
            "fetch_failures": str(failures_path.relative_to(ROOT)),
            "combined_real_ohlcv": str(combined_path.relative_to(ROOT)) if not combined.empty else None,
            "available_pool": str(available_pool_path.relative_to(ROOT)),
            f"{FULL_STATUS}_pool": str(full_pool_path.relative_to(ROOT)),
            f"pressure_supported_non_st_{FULL_STATUS}_pool": str(pressure_full_pool_path.relative_to(ROOT)),
        },
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def incremental_fetch_start(last_date: object) -> str:
    parsed = pd.to_datetime(last_date, errors="coerce")
    if pd.isna(parsed):
        return START_YYYYMMDD
    next_day = parsed.to_pydatetime().date() + timedelta(days=1)
    if next_day > datetime.strptime(REQUEST_END, "%Y-%m-%d").date():
        return ""
    return next_day.strftime("%Y%m%d")


def main() -> int:
    parser = argparse.ArgumentParser(description="Complete real A-share OHLCV cache for 2025-01-01 through 2026-07-22.")
    parser.add_argument("--pool", default=str(DEFAULT_POOL), help="All-A pool CSV with code/name columns")
    parser.add_argument("--scope", choices=["all", "non_st", "pressure_non_st", "missing_only"], default="all")
    parser.add_argument("--fetch", action="store_true", help="Fetch missing raw windows before audit")
    parser.add_argument("--fetch-only", action="store_true", help="Fetch incomplete raw windows and skip final combined audit")
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--sleep", type=float, default=0.05)
    parser.add_argument("--max-fetch", type=int, default=0, help="Limit fetched attempts for smoke tests")
    parser.add_argument("--progress-every", type=int, default=100, help="Print one success progress line every N fetched stocks")
    args = parser.parse_args()

    started = time.time()
    pool_path = Path(args.pool)
    if not pool_path.is_absolute():
        pool_path = ROOT / pool_path
    pool = load_pool(pool_path)

    scope_mask = pd.Series(True, index=pool.index)
    if args.scope == "non_st":
        scope_mask = ~pool["is_st_or_delist_name"]
    elif args.scope == "pressure_non_st":
        scope_mask = pool["pressure_supported_prefix"] & ~pool["is_st_or_delist_name"]
    elif args.scope == "missing_only":
        scope_mask = pd.Series(True, index=pool.index)

    fetched = 0
    empty_returns = 0
    failures: list[dict] = []
    if args.fetch or args.fetch_only:
        initial_audit = build_light_audit(pool)
        need_codes = set(initial_audit.loc[initial_audit["status"] != FULL_STATUS, "code"])
        fetch_pool = pool[pool["code"].isin(need_codes) & scope_mask].copy()
        progress_every = max(1, int(args.progress_every))
        print(f"[FETCH] incomplete targets={len(fetch_pool)} scope={args.scope}")
        audit_by_code = initial_audit.set_index("code").to_dict("index")
        for row in fetch_pool.itertuples(index=False):
            if args.max_fetch and fetched + len(failures) >= args.max_fetch:
                break
            audit_row = audit_by_code.get(row.code, {})
            fetch_start = incremental_fetch_start(audit_row.get("last_date"))
            if not fetch_start:
                continue
            try:
                df = fetch_eastmoney_one(row.code, row.name, args.timeout, fetch_start)
            except Exception as exc:  # noqa: BLE001
                failures.append({"code": row.code, "name": row.name, "reason": repr(exc)})
                print(f"[FAIL] {row.code} {row.name}: {exc}")
                continue
            if df.empty:
                failures.append({"code": row.code, "name": row.name, "reason": "empty_return"})
                empty_returns += 1
                if empty_returns == 1 or empty_returns % progress_every == 0:
                    print(f"[EMPTY] count={empty_returns} latest={row.code} {row.name}")
                continue
            merge_raw(row.code, df)
            fetched += 1
            if fetched == 1 or fetched % progress_every == 0:
                print(f"[OK] fetched={fetched}/{len(fetch_pool)} latest={row.code} {row.name} start={fetch_start} rows={len(df)} dates={df['date'].nunique()}")
            time.sleep(max(0.0, args.sleep))

    if args.fetch_only:
        failures_path = RESULTS_DIR / "a_share_all_completion_fetch_failures_20260723.csv"
        pd.DataFrame(failures).to_csv(failures_path, index=False, encoding="utf-8-sig")
        summary = {
            "request_start": REQUEST_START,
            "request_end": REQUEST_END,
            "expected_trading_days": EXPECTED_TRADING_DAYS,
            "fetch_only": True,
            "scope": args.scope,
            "fetched_this_run": int(fetched),
            "empty_returns": int(empty_returns),
            "fetch_failures": int(len(failures)),
            "elapsed_seconds": round(time.time() - started, 1),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "fetch_failures_output": str(failures_path.relative_to(ROOT)),
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    audit, combined = build_audit(pool)
    write_outputs(audit, combined, failures, fetched, time.time() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
