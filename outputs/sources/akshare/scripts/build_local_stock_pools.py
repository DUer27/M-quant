#!/usr/bin/env python3
"""
Build local AkShare stock-pool helper CSVs from already downloaded raw files.

This script does not request network data. It scans raw/a_share_daily/*.csv,
creates a pool of locally available stocks, and optionally compares it with a
base pool to produce a missing-stock retry list.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
AK_DIR = ROOT / "outputs" / "sources" / "akshare"
RAW_DIR = AK_DIR / "raw" / "a_share_daily"
PROCESSED_DIR = AK_DIR / "processed"


def normalize_code(code: str) -> str:
    return str(code).strip().zfill(6)


def raw_available_pool() -> pd.DataFrame:
    records = []
    for path in sorted(RAW_DIR.glob("*.csv")):
        try:
            df = pd.read_csv(path, dtype={"code": str})
        except Exception as exc:  # noqa: BLE001
            records.append({
                "code": normalize_code(path.stem),
                "name": normalize_code(path.stem),
                "pool_source": "raw_available",
                "read_error": repr(exc),
            })
            continue

        code = normalize_code(path.stem)
        if "code" in df.columns and not df["code"].dropna().empty:
            code = normalize_code(df["code"].dropna().iloc[0])

        name = code
        if "name" in df.columns and not df["name"].dropna().empty:
            name = str(df["name"].dropna().iloc[0])

        records.append({"code": code, "name": name, "pool_source": "raw_available"})

    if not records:
        raise SystemExit(f"没有找到 raw CSV：{RAW_DIR}")
    return pd.DataFrame(records).drop_duplicates("code").sort_values("code")


def load_pool(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"code": str})
    if "code" not in df.columns:
        raise SystemExit(f"股票池缺少 code 列：{path}")
    if "name" not in df.columns:
        df["name"] = df["code"]
    df["code"] = df["code"].map(normalize_code)
    return df.drop_duplicates("code")


def resolve_output(filename: str) -> Path:
    path = Path(filename)
    if path.is_absolute() or ".." in path.parts:
        raise SystemExit(f"输出文件名不安全：{filename}")
    return PROCESSED_DIR / path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local AkShare stock-pool helper CSVs.")
    parser.add_argument("--base-pool", default="", help="可选：用于对比的候选股票池 CSV")
    parser.add_argument("--available-output", default="a_share_raw_available_pool.csv")
    parser.add_argument("--missing-output", default="a_share_missing_pool.csv")
    args = parser.parse_args()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    available = raw_available_pool()
    available_path = resolve_output(args.available_output)
    available.to_csv(available_path, index=False, encoding="utf-8-sig")

    summary = {
        "available_output": str(available_path.relative_to(ROOT)),
        "available_stocks": int(len(available)),
    }

    if args.base_pool:
        base_path = Path(args.base_pool)
        if not base_path.is_absolute():
            base_path = ROOT / base_path
        base = load_pool(base_path)
        missing = base[~base["code"].isin(set(available["code"]))].copy()
        missing["pool_source"] = f"missing_from:{base_path.relative_to(ROOT) if base_path.is_relative_to(ROOT) else base_path}"
        missing_path = resolve_output(args.missing_output)
        missing.to_csv(missing_path, index=False, encoding="utf-8-sig")
        summary.update({
            "base_pool": str(base_path.relative_to(ROOT)) if base_path.is_relative_to(ROOT) else str(base_path),
            "base_stocks": int(len(base)),
            "missing_output": str(missing_path.relative_to(ROOT)),
            "missing_stocks": int(len(missing)),
        })

    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
