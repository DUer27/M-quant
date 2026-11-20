#!/usr/bin/env python3
"""Extend the real A-share daily OHLCV cache to the latest trading day.

Same data policy as complete_a_share_all_history.py:
- only real returned rows are saved; no generated, interpolated, or forward-filled rows;
- per-stock raw CSVs are merged/deduped (new rows win), then a fresh combined file,
  audit, pools and summary are written with the new window tag.

Source note: this run uses Tencent ifzq fqkline because push2his.eastmoney.com was
unreachable from the current network. The cache already stores tencent-sourced rows,
so the format matches. Each stock's stored close on the previous cache end date is
compared against the freshly fetched Tencent qfq close for the same date:
- matches (<=0.3% diff): only rows after the previous end are appended, preserving
  the original Eastmoney history untouched;
- mismatch (ex-dividend/split happened) or missing overlap: the stock's full qfq
  window is refetched from Tencent so the whole series stays on one adjustment basis.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import complete_a_share_all_history as base  # noqa: E402

ROOT = base.ROOT
RAW_DIR = base.RAW_DIR
PROCESSED_DIR = base.PROCESSED_DIR
RESULTS_DIR = base.RESULTS_DIR
POOL_FILE = PROCESSED_DIR / "a_share_eastmoney_all_a_20260720.csv"
TX_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
TX_SOURCE = "tencent.ifzq.fqkline"
SINA_SOURCE = "sina.stock_zh_a_daily_qfq"
QFQ_MATCH_TOLERANCE = 0.003


def tx_symbol(code: str) -> str:
    code = base.normalize_code(code)
    if code.startswith("6"):
        return f"sh{code}"
    if code.startswith(("0", "3")):
        return f"sz{code}"
    return f"bj{code}"


def fetch_tx_kline(symbol: str, start_dash: str, end_dash: str, count: int, timeout: float) -> list[dict]:
    """Return [{date, open, close, high, low, volume}, ...] from Tencent fqkline."""
    params = {"param": f"{symbol},day,{start_dash},{end_dash},{count},qfq"}
    url = TX_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 M-Quant"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    node = (payload.get("data") or {}).get(symbol) or {}
    rows = node.get("qfqday") or node.get("day") or []
    out = []
    for line in rows:
        if not isinstance(line, list) or len(line) < 6:
            continue
        out.append(
            {
                "date": str(line[0]),
                "open": line[1],
                "close": line[2],
                "high": line[3],
                "low": line[4],
                "volume": line[5],
            }
        )
    return out


def fetch_trading_days(start_dash: str, end_dash: str, timeout: float) -> list[str]:
    """Trading days from the SSE index kline. Tencent first; Sina as WAF fallback."""
    try:
        rows = fetch_tx_kline("sh000001", start_dash, end_dash, 800, timeout)
        days = [row["date"] for row in rows]
        if days:
            return days
    except Exception as exc:  # noqa: BLE001
        print(f"[CALENDAR] Tencent calendar unavailable ({type(exc).__name__}), falling back to Sina", flush=True)
    # Sina index daily kline (sh000001), most recent `datalen` bars
    url = (
        "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
        "?symbol=sh000001&scale=240&ma=no&datalen=800"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 M-Quant"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    days = sorted({str(item["day"])[:10] for item in payload if str(item.get("day", ""))[:4].isdigit()})
    return [d for d in days if start_dash <= d <= end_dash or d <= end_dash]


def fetch_stock_window(code: str, name: str, start_dash: str, end_dash: str, timeout: float) -> pd.DataFrame:
    """One stock's full qfq window from Tencent as a normalize-ready frame."""
    raw = fetch_tx_kline(tx_symbol(code), start_dash, end_dash, 800, timeout)
    rows = []
    for item in raw:
        rows.append(
            {
                "date": item["date"],
                "code": base.normalize_code(code),
                "open": item["open"],
                "close": item["close"],
                "high": item["high"],
                "low": item["low"],
                "volume": item["volume"],
                "amount": pd.NA,
                "amplitude": pd.NA,
                "change_pct": pd.NA,
                "change_amount": pd.NA,
                "turnover": pd.NA,
                "security": base.security_code(code),
                "source": TX_SOURCE,
                "adjust": "qfq",
                "name": name,
            }
        )
    return base.window_frame(pd.DataFrame(rows)) if rows else pd.DataFrame()


def fetch_with_retry(code: str, name: str, start_dash: str, end_dash: str, timeout: float, source: str) -> tuple[pd.DataFrame | None, str]:
    last_error = ""
    for attempt in range(3):
        try:
            if source == "sina":
                return fetch_sina_window(code, name, start_dash, end_dash), ""
            return fetch_stock_window(code, name, start_dash, end_dash, timeout), ""
        except Exception as exc:  # noqa: BLE001
            last_error = repr(exc)
            time.sleep(1.5 * (attempt + 1))
    return None, last_error


def fetch_sina_window(code: str, name: str, start_dash: str, end_dash: str) -> pd.DataFrame:
    """qfq daily window from Sina via akshare (works when Tencent WAF blocks this IP).

    Sina volume is in shares; the cache stores Eastmoney-style lots (手), so /100.
    """
    import warnings

    warnings.filterwarnings("ignore")
    import akshare as ak

    frame = ak.stock_zh_a_daily(
        symbol=tx_symbol(code),
        adjust="qfq",
    )
    if frame is None or frame.empty:
        return pd.DataFrame()
    rows = []
    for item in frame.to_dict("records"):
        rows.append(
            {
                "date": pd.to_datetime(item["date"]).strftime("%Y-%m-%d"),
                "code": base.normalize_code(code),
                "open": item["open"],
                "close": item["close"],
                "high": item["high"],
                "low": item["low"],
                "volume": (float(item["volume"]) / 100.0) if pd.notna(item.get("volume")) else pd.NA,
                "amount": pd.NA,
                "amplitude": pd.NA,
                "change_pct": pd.NA,
                "change_amount": pd.NA,
                "turnover": pd.NA,
                "security": base.security_code(code),
                "source": SINA_SOURCE,
                "adjust": "qfq",
                "name": name,
            }
        )
    return base.window_frame(pd.DataFrame(rows))


def stored_close_on(code: str, date_dash: str) -> float | None:
    """Stored qfq close for a date from the per-stock raw CSV (NaN-safe, early exit)."""
    path = RAW_DIR / f"{base.normalize_code(code)}.csv"
    if not path.exists():
        return None
    try:
        handle = path.open("r", encoding="utf-8-sig", newline="")
    except UnicodeDecodeError:
        handle = path.open("r", newline="")
    with handle:
        for row in csv.DictReader(handle):
            if str(row.get("date") or "")[:10] == date_dash:
                try:
                    value = float(row.get("close"))
                except (TypeError, ValueError):
                    return None
                return value if value > 0 else None
    return None


def stored_last_date(code: str) -> str | None:
    """Last stored date from the per-stock raw CSV (tail read, no full parse)."""
    path = RAW_DIR / f"{base.normalize_code(code)}.csv"
    if not path.exists():
        return None
    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 600))
            chunk = handle.read().decode("utf-8-sig", errors="replace")
    except OSError:
        return None
    lines = [line for line in chunk.splitlines() if line.strip()]
    for line in reversed(lines):
        parts = line.split(",")
        if len(parts) >= 6 and parts[0][:4].isdigit():
            return parts[0][:10]
    return None


# 连续失败达到阈值时的全局限频冷却：腾讯限频通常按分钟窗口，硬重试只会加深限制
_COOLDOWN_STATE = {"consecutive": 0, "last": 0.0}
_COOLDOWN_LOCK = threading.Lock()
COOLDOWN_THRESHOLD = 10
COOLDOWN_SECONDS = 90


def note_failure_cooling() -> None:
    with _COOLDOWN_LOCK:
        _COOLDOWN_STATE["consecutive"] += 1
        if _COOLDOWN_STATE["consecutive"] >= COOLDOWN_THRESHOLD:
            _COOLDOWN_STATE["consecutive"] = 0
            _COOLDOWN_STATE["last"] = time.time()
            print(f"[COOLDOWN] 连续失败达到阈值，全局冷却 {COOLDOWN_SECONDS}s", flush=True)
            time.sleep(COOLDOWN_SECONDS)


def update_stock(code: str, name: str, prev_end_dash: str, end_dash: str, timeout: float, source: str) -> tuple[str, str]:
    """Return (code, outcome): current | appended | full_replaced | empty | failed:<reason>."""
    if stored_last_date(code) == end_dash:
        return code, "current"
    tail, error = fetch_with_retry(code, name, prev_end_dash, end_dash, timeout, source)
    if error:
        note_failure_cooling()
        return code, f"failed:{error}"
    if tail is None or tail.empty:
        return code, "empty"

    overlap = tail[tail["date"] == prev_end_dash]
    stored = stored_close_on(code, prev_end_dash)
    needs_full_refetch = True
    if not overlap.empty and stored is not None:
        fetched_close = float(overlap.iloc[0]["close"])
        if fetched_close > 0 and abs(fetched_close - stored) / stored <= QFQ_MATCH_TOLERANCE:
            needs_full_refetch = False

    if needs_full_refetch:
        full, error = fetch_with_retry(code, name, base.REQUEST_START, end_dash, timeout, source)
        if error:
            note_failure_cooling()
            return code, f"failed:{error}"
        if full is None or full.empty:
            return code, "empty"
        base.merge_raw(code, full)
        return code, "full_replaced"

    fresh = tail[tail["date"] > prev_end_dash]
    if fresh.empty:
        return code, "empty"
    base.merge_raw(code, fresh)
    return code, "appended"


def resolve_window(args: argparse.Namespace) -> tuple[str, str, list[str]]:
    start_dash = f"{args.start[:4]}-{args.start[4:6]}-{args.start[6:]}"
    today_compact = datetime.now().strftime("%Y%m%d")
    end_compact = args.end or today_compact
    calendar = fetch_trading_days(start_dash, f"{end_compact[:4]}-{end_compact[4:6]}-{end_compact[6:]}", args.timeout)
    if not calendar:
        raise SystemExit("Tencent trading calendar returned no days; aborting.")
    if not args.end:
        # Auto mode: drop a still-forming bar for today (before market close + buffer).
        if calendar[-1] == datetime.now().strftime("%Y-%m-%d") and datetime.now().strftime("%H:%M") < "15:30":
            calendar = calendar[:-1]
    if calendar[-1].replace("-", "") < end_compact:
        end_compact = calendar[-1].replace("-", "")
    end_dash = f"{end_compact[:4]}-{end_compact[4:6]}-{end_compact[6:]}"
    days = [d for d in calendar if start_dash <= d <= end_dash]
    return start_dash, end_dash, days


def patch_base_constants(start_dash: str, end_dash: str, expected_days: int) -> None:
    base.REQUEST_START = start_dash
    base.REQUEST_END = end_dash
    base.END_YYYYMMDD = end_dash.replace("-", "")
    base.EXPECTED_TRADING_DAYS = expected_days
    base.FULL_STATUS = f"full_{expected_days}"


def build_pool() -> pd.DataFrame:
    """Existing raw cache defines the update scope (codes already collected)."""
    pool = base.load_pool(POOL_FILE)
    raw_codes = {path.stem for path in RAW_DIR.glob("*.csv")}
    scoped = pool[pool["code"].isin(raw_codes)].copy()
    extra = sorted(raw_codes - set(pool["code"]))
    if extra:
        rows = [{"code": code, "name": ""} for code in extra]
        scoped = pd.concat([scoped, pd.DataFrame(rows)], ignore_index=True)
        scoped["prefix3"] = scoped["code"].str[:3]
        scoped["is_st_or_delist_name"] = scoped["name"].str.contains("ST|退", regex=True, na=False)
        scoped["pressure_supported_prefix"] = scoped["code"].str.match(base.PRESSURE_PREFIX_RE)
    return scoped.drop_duplicates("code").sort_values("code").reset_index(drop=True)


def run_update(pool: pd.DataFrame, args: argparse.Namespace, prev_end_dash: str, end_dash: str) -> dict[str, int]:
    outcomes: dict[str, int] = {"current": 0, "appended": 0, "full_replaced": 0, "empty": 0, "failed": 0}
    failures: list[dict] = []
    attempts = 0
    total = len(pool)
    progress_every = max(1, args.progress_every)
    started = time.time()

    def handle(code: str, outcome: str) -> None:
        nonlocal attempts
        attempts += 1
        if outcome.startswith("failed:"):
            outcomes["failed"] += 1
            failures.append({"code": code, "reason": outcome})
        else:
            outcomes[outcome] += 1
        if attempts == 1 or attempts % progress_every == 0:
            rate = attempts / max(time.time() - started, 1)
            print(
                f"[PROGRESS] {attempts}/{total} current={outcomes['current']} appended={outcomes['appended']} "
                f"full_replaced={outcomes['full_replaced']} empty={outcomes['empty']} "
                f"fail={outcomes['failed']} rate={rate:.1f}/s elapsed={time.time() - started:.0f}s",
                flush=True,
            )

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(update_stock, row.code, row.name, prev_end_dash, end_dash, args.timeout, args.source)
            for row in pool.itertuples(index=False)
        ]
        for i, future in enumerate(as_completed(futures)):
            if args.max_fetch and i >= args.max_fetch:
                executor.shutdown(wait=False, cancel_futures=True)
                break
            code, outcome = future.result()
            handle(code, outcome)

    if failures:
        pd.DataFrame(failures).to_csv(
            RESULTS_DIR / f"a_share_all_extension_failures_{end_dash.replace('-', '')}.csv",
            index=False,
            encoding="utf-8-sig",
        )
    return outcomes


def validate(combined: pd.DataFrame, audit: pd.DataFrame, end_dash: str) -> dict:
    """Accuracy and cleanliness checks; every number lands in the summary JSON."""
    ohlc = combined[["open", "high", "low", "close"]]
    bad_shape = int(
        (
            (combined["high"] < combined["low"])
            | (combined["close"] > combined["high"])
            | (combined["close"] < combined["low"])
            | (combined["open"] > combined["high"])
            | (combined["open"] < combined["low"])
        ).sum()
    )
    non_positive = int((ohlc <= 0).any(axis=1).sum())
    missing_ohlc = int(ohlc.isna().any(axis=1).sum())
    return {
        "duplicate_code_date_rows": int(combined.duplicated(["code", "date"]).sum()),
        "ohlc_shape_violations": bad_shape,
        "non_positive_prices": non_positive,
        "rows_with_missing_ohlc": missing_ohlc,
        "date_min": str(combined["date"].min()),
        "date_max": str(combined["date"].max()),
        "stocks_updated_to_end_date": int((audit["last_date"] == end_dash).sum()),
        "stocks_total": int(len(audit)),
    }


def write_outputs(
    audit: pd.DataFrame,
    combined: pd.DataFrame,
    outcomes: dict[str, int],
    elapsed: float,
    start_dash: str,
    end_dash: str,
    expected_days: int,
    prev_end_dash: str,
    source: str,
) -> Path:
    tag = end_dash.replace("-", "")
    start_compact = start_dash.replace("-", "")
    full_status = f"full_{expected_days}"
    audit_path = RESULTS_DIR / f"a_share_all_completion_audit_{tag}.csv"
    missing_path = RESULTS_DIR / f"a_share_all_completion_missing_or_partial_{tag}.csv"
    combined_path = PROCESSED_DIR / f"a_share_all_real_{start_compact}_{tag}_qfq.csv"
    available_pool_path = PROCESSED_DIR / f"a_share_all_available_pool_{start_compact}_{tag}.csv"
    full_pool_path = PROCESSED_DIR / f"a_share_all_full_{expected_days}_pool_{start_compact}_{tag}.csv"
    pressure_full_pool_path = (
        PROCESSED_DIR / f"a_share_pressure_supported_non_st_full_{expected_days}_pool_{start_compact}_{tag}.csv"
    )
    summary_path = RESULTS_DIR / f"a_share_all_completion_summary_{tag}.json"

    audit.to_csv(audit_path, index=False, encoding="utf-8-sig")
    audit[audit["status"] != full_status].to_csv(missing_path, index=False, encoding="utf-8-sig")
    audit[audit["status"] != "missing_raw"][["code", "name", "prefix3", "status", "dates"]].to_csv(
        available_pool_path, index=False, encoding="utf-8-sig"
    )
    audit[audit["status"] == full_status][["code", "name", "prefix3", "status", "dates"]].to_csv(
        full_pool_path, index=False, encoding="utf-8-sig"
    )
    pressure_full = audit[
        audit["pressure_supported_prefix"] & ~audit["is_st_or_delist_name"] & (audit["status"] == full_status)
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
        "request_start": start_dash,
        "request_end": end_dash,
        "previous_cache_end": prev_end_dash,
        "expected_trading_days": expected_days,
        "trading_calendar": "tencent ifzq SSE index kline (sh000001), same source as OHLCV",
        "data_source_this_run": source,
        "data_policy": "Only real returned OHLCV rows are saved; no generated, interpolated, or forward-filled rows.",
        "pool_total": int(len(audit)),
        "pool_unique_codes": int(audit["code"].nunique()),
        "st_or_delist_name_count": int(audit["is_st_or_delist_name"].sum()),
        "all": {
            full_status: count(all_mask, full_status),
            "partial": count(all_mask, "partial"),
            "missing_raw": count(all_mask, "missing_raw"),
        },
        "pressure_supported_non_st": {
            "total": count(pressure_non_st_mask),
            full_status: count(pressure_non_st_mask, full_status),
            "partial": count(pressure_non_st_mask, "partial"),
            "missing_raw": count(pressure_non_st_mask, "missing_raw"),
        },
        "non_pressure_prefix_non_st": {
            "total": count(non_pressure_non_st_mask),
            full_status: count(non_pressure_non_st_mask, full_status),
            "partial": count(non_pressure_non_st_mask, "partial"),
            "missing_raw": count(non_pressure_non_st_mask, "missing_raw"),
        },
        "combined_codes": int(combined["code"].nunique()) if not combined.empty else 0,
        "combined_rows": int(len(combined)) if not combined.empty else 0,
        "combined_dates": int(combined["date"].nunique()) if not combined.empty else 0,
        "run_outcomes": outcomes,
        "validation": validate(combined, audit, end_dash),
        "elapsed_seconds": round(elapsed, 1),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "outputs": {
            "audit": str(audit_path.relative_to(ROOT)),
            "missing_or_partial": str(missing_path.relative_to(ROOT)),
            "combined_real_ohlcv": str(combined_path.relative_to(ROOT)) if not combined.empty else None,
            "available_pool": str(available_pool_path.relative_to(ROOT)),
            f"{full_status}_pool": str(full_pool_path.relative_to(ROOT)),
            f"pressure_supported_non_st_{full_status}_pool": str(pressure_full_pool_path.relative_to(ROOT)),
        },
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Extend the real A-share OHLCV cache to the latest trading day.")
    parser.add_argument("--start", default="20250101", help="Window start YYYYMMDD (default 20250101)")
    parser.add_argument("--prev-end", default="2026-07-22", help="Previous cache end date for overlap check")
    parser.add_argument("--end", default="", help="Window end YYYYMMDD; default = last completed trading day")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent fetch threads")
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--max-fetch", type=int, default=0, help="Limit processed stocks for smoke tests")
    parser.add_argument("--skip-fetch", action="store_true", help="Audit + rebuild outputs only")
    parser.add_argument("--source", choices=["tencent", "sina"], default="tencent", help="OHLCV source for this run")
    parser.add_argument("--progress-every", type=int, default=250)
    args = parser.parse_args()

    started = time.time()
    start_dash, end_dash, trading_days = resolve_window(args)
    expected_days = len(trading_days)
    patch_base_constants(start_dash, end_dash, expected_days)
    prev_end_dash = args.prev_end
    new_days = len([d for d in trading_days if d > prev_end_dash])
    print(
        f"[WINDOW] {start_dash} -> {end_dash}  trading_days={expected_days}  "
        f"new_since_{prev_end_dash}={new_days}",
        flush=True,
    )

    pool = build_pool()
    print(f"[POOL] {len(pool)} stocks (existing raw cache scope)", flush=True)

    outcomes = {"current": 0, "appended": 0, "full_replaced": 0, "empty": 0, "failed": 0}
    if not args.skip_fetch:
        outcomes = run_update(pool, args, prev_end_dash, end_dash)
        print(f"[UPDATE] done {outcomes}", flush=True)

    audit, combined = base.build_audit(pool)
    print(f"[AUDIT] combined_rows={len(combined)} codes={combined['code'].nunique()}", flush=True)
    write_outputs(
        audit, combined, outcomes, time.time() - started,
        start_dash, end_dash, expected_days, prev_end_dash, args.source,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
