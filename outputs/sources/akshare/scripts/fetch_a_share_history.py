#!/usr/bin/env python3
"""
M-Quant AkShare A股历史数据采集脚本。

用途：
- 拉取连续日频行情，补足本地因子研究需要的时间序列。
- 输出原始 CSV 与统一字段 processed CSV。

数据原则：
- 只保存 AkShare 返回的真实数据。
- 不在本脚本内生成收益结论、IC、胜率或策略绩效。
- 如果本地未安装 akshare，脚本会直接报出安装提示，不降级生成假数据。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import akshare as ak
    import pandas as pd
except ModuleNotFoundError as exc:
    missing = exc.name
    raise SystemExit(
        f"缺少依赖 {missing}。请先安装：python3 -m pip install akshare pandas openpyxl"
    ) from exc


ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = ROOT / "outputs" / "sources" / "akshare"
RAW_DIR = OUT_DIR / "raw" / "a_share_daily"
PROCESSED_DIR = OUT_DIR / "processed"
RESULTS_DIR = OUT_DIR / "results"

SEED_SYMBOLS = [
    ("000001", "平安银行"),
    ("000002", "万科A"),
    ("000063", "中兴通讯"),
    ("000333", "美的集团"),
    ("000651", "格力电器"),
    ("000858", "五粮液"),
    ("600000", "浦发银行"),
    ("600036", "招商银行"),
    ("600519", "贵州茅台"),
    ("601318", "中国平安"),
]


def normalize_code(code: str) -> str:
    return str(code).strip().zfill(6)


def jq_security(code: str) -> str:
    code = normalize_code(code)
    suffix = "XSHG" if code.startswith("6") else "XSHE"
    return f"{code}.{suffix}"


def pool_from_symbols(symbols: str) -> pd.DataFrame:
    records = []
    name_by_code = {code: name for code, name in SEED_SYMBOLS}
    for raw in symbols.replace("，", ",").split(","):
        code = normalize_code(raw)
        if not code or len(code) != 6:
            continue
        records.append({"code": code, "name": name_by_code.get(code, code), "pool_source": "manual_symbols"})

    if not records:
        raise SystemExit("--symbols 没有解析到有效 6 位股票代码。")

    return pd.DataFrame(records).drop_duplicates("code").sort_values("code")


def pool_from_symbols_file(path: str) -> pd.DataFrame:
    source_path = Path(path).expanduser()
    if not source_path.is_absolute():
        source_path = ROOT / source_path
    if not source_path.exists():
        raise SystemExit(f"--symbols-file 不存在：{source_path}")

    df = pd.read_csv(source_path, dtype={"code": str})
    if "code" not in df.columns:
        raise SystemExit("--symbols-file 必须包含 code 列。")
    if "name" not in df.columns:
        df["name"] = df["code"]
    pool = df[["code", "name"]].copy()
    pool["code"] = pool["code"].map(normalize_code)
    pool["pool_source"] = str(source_path.relative_to(ROOT)) if source_path.is_relative_to(ROOT) else str(source_path)
    return pool.drop_duplicates("code").sort_values("code")


def seed_pool(limit: int | None = None) -> pd.DataFrame:
    pool = pd.DataFrame([
        {"code": code, "name": name, "pool_source": "seed_fallback"}
        for code, name in SEED_SYMBOLS
    ])
    if limit:
        pool = pool.head(limit)
    return pool


def fetch_stock_pool(limit: int | None = None, seed_fallback: bool = False) -> pd.DataFrame:
    pool_source = "akshare.stock_zh_a_spot_em"
    spot = ak.stock_zh_a_spot_em()
    code_col = "代码"
    name_col = "名称"
    pool = spot[[code_col, name_col]].rename(columns={code_col: "code", name_col: "name"}).copy()
    pool["code"] = pool["code"].map(normalize_code)
    pool["pool_source"] = pool_source
    pool = pool.drop_duplicates("code").sort_values("code")
    if limit:
        pool = pool.head(limit)
    return pool


def fetch_one_stock(code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
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
        "振幅": "amplitude",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amount",
        "换手率": "turnover",
    }
    df = raw.rename(columns=mapping).copy()
    if "code" not in df.columns:
        df["code"] = normalize_code(code)
    df["code"] = df["code"].map(normalize_code)
    df["security"] = df["code"].map(jq_security)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df["source"] = "akshare.stock_zh_a_hist"
    df["adjust"] = adjust
    return df


def fetch_one_stock_with_retry(code: str, start: str, end: str, adjust: str, retries: int, retry_sleep: float) -> tuple[pd.DataFrame, str | None]:
    last_error = None
    attempts = max(1, retries + 1)
    for attempt in range(1, attempts + 1):
        try:
            return fetch_one_stock(code, start, end, adjust), None
        except Exception as exc:  # noqa: BLE001
            last_error = repr(exc)
            if attempt < attempts:
                time.sleep(retry_sleep * attempt)
    return pd.DataFrame(), last_error


def existing_raw_frame(code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    raw_path = RAW_DIR / f"{normalize_code(code)}.csv"
    if not raw_path.exists():
        return pd.DataFrame()

    df = pd.read_csv(raw_path, dtype={"code": str})
    if df.empty or "date" not in df.columns:
        return pd.DataFrame()

    df["code"] = df["code"].map(normalize_code)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    start_date = pd.to_datetime(start).strftime("%Y-%m-%d")
    end_date = pd.to_datetime(end).strftime("%Y-%m-%d")
    window = df[(df["date"] >= start_date) & (df["date"] <= end_date)].copy()
    if adjust and "adjust" in window.columns:
        window = window[window["adjust"] == adjust].copy()
    return window


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch A-share daily history from AkShare.")
    parser.add_argument("--start", default="20240101", help="开始日期，格式 YYYYMMDD")
    parser.add_argument("--end", default=datetime.now().strftime("%Y%m%d"), help="结束日期，格式 YYYYMMDD")
    parser.add_argument("--adjust", default="qfq", choices=["", "qfq", "hfq"], help="复权方式")
    parser.add_argument("--limit", type=int, default=0, help="只拉前 N 只股票，用于试跑")
    parser.add_argument("--sleep", type=float, default=0.2, help="每只股票请求间隔秒数")
    parser.add_argument("--retries", type=int, default=2, help="单只股票失败后的重试次数")
    parser.add_argument("--retry-sleep", type=float, default=1.0, help="重试等待秒数，会按次数递增")
    parser.add_argument("--skip-existing", action="store_true", help="raw 中已有该股票数据时直接复用，用于断点续跑")
    parser.add_argument("--symbols", default="", help="逗号分隔的 6 位股票代码；传入后不请求股票池列表")
    parser.add_argument("--symbols-file", default="", help="包含 code/name 列的 CSV 股票池文件；优先级高于 --symbols")
    parser.add_argument("--seed-fallback", action="store_true", help="股票池列表接口失败时，使用内置小股票池继续验证行情接口")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    pool_error = None
    if args.symbols_file:
        pool = pool_from_symbols_file(args.symbols_file)
        if args.limit:
            pool = pool.head(args.limit)
    elif args.symbols:
        pool = pool_from_symbols(args.symbols)
        if args.limit:
            pool = pool.head(args.limit)
    else:
        try:
            pool = fetch_stock_pool(args.limit or None)
        except Exception as exc:  # noqa: BLE001
            pool_error = repr(exc)
            if not args.seed_fallback:
                raise
            pool = seed_pool(args.limit or None)

    pool_path = PROCESSED_DIR / "a_share_stock_pool.csv"
    pool.to_csv(pool_path, index=False, encoding="utf-8-sig")

    frames = []
    failures = []
    reused = []
    for index, row in pool.iterrows():
        code = row["code"]
        if args.skip_existing:
            existing = existing_raw_frame(code, args.start, args.end, args.adjust)
            if not existing.empty:
                frames.append(existing)
                reused.append(code)
                print(f"[SKIP] {code} reused rows={len(existing)}")
                continue

        df, error = fetch_one_stock_with_retry(
            code,
            args.start,
            args.end,
            args.adjust,
            retries=max(0, args.retries),
            retry_sleep=max(0, args.retry_sleep),
        )
        if error:
            failures.append({"code": code, "reason": error})
            print(f"[FAIL] {code}: {error}", file=sys.stderr)
            continue
        if df.empty:
            failures.append({"code": code, "reason": "empty"})
            continue
        df["name"] = row["name"]
        raw_path = RAW_DIR / f"{code}.csv"
        df.to_csv(raw_path, index=False, encoding="utf-8-sig")
        frames.append(df)
        print(f"[{len(frames)}/{len(pool)}] {code} rows={len(df)}")
        time.sleep(args.sleep)

    if not frames:
        raise SystemExit("没有成功拉取任何股票历史数据。")

    combined = pd.concat(frames, ignore_index=True)
    output_path = PROCESSED_DIR / f"a_share_daily_{args.start}_{args.end}_{args.adjust or 'none'}.csv"
    combined.to_csv(output_path, index=False, encoding="utf-8-sig")

    summary = {
        "source": "akshare",
        "script": str(Path(__file__).relative_to(ROOT)),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "start": args.start,
        "end": args.end,
        "adjust": args.adjust,
        "stocks_requested": int(len(pool)),
        "stocks_success": int(combined["code"].nunique()),
        "rows": int(len(combined)),
        "dates": int(combined["date"].nunique()),
        "output": str(output_path.relative_to(ROOT)),
        "pool_source": sorted(pool["pool_source"].dropna().unique().tolist()) if "pool_source" in pool.columns else [],
        "pool_error": pool_error,
        "retries": int(max(0, args.retries)),
        "reused_existing": len(reused),
        "failures": failures[:100],
    }
    summary_path = RESULTS_DIR / "a_share_daily_history_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
