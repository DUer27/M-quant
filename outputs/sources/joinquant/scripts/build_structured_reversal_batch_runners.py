#!/usr/bin/env python3
"""Build JoinQuant notebook batch runners for structured reversal slices."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
TEMPLATE = SCRIPT_DIR / "m_quant_structured_reversal_batch_runner_jq_notebook.py"
NOTEBOOK_SCRIPT = SCRIPT_DIR / "m_quant_structured_reversal_factor_jq_notebook.py"
OUTPUT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "notebook_batches" / "structured_reversal"


def parse_date(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%d")


def date_text(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def add_months(value: datetime, months: int) -> datetime:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    days = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return value.replace(year=year, month=month, day=min(value.day, days[month - 1]))


def build_windows(start: str, end: str, months: int) -> list[tuple[str, str]]:
    if months <= 0:
        raise ValueError("window months must be positive")
    cursor = parse_date(start)
    limit = parse_date(end)
    windows: list[tuple[str, str]] = []
    while cursor <= limit:
        next_start = add_months(cursor, months)
        window_end = min(limit, next_start - timedelta(days=1))
        windows.append((date_text(cursor), date_text(window_end)))
        cursor = window_end + timedelta(days=1)
    return windows


def quarter_tag(start: str, end: str) -> str:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if start_dt.year == end_dt.year:
        quarter = (start_dt.month - 1) // 3 + 1
        if start_dt.month in {1, 4, 7, 10}:
            return f"{start_dt.year}q{quarter}"
    return f"{start_dt:%Y%m%d}_{end_dt:%Y%m%d}"


def patch_runner(template: str, base_script: str, start: str, end: str, offset: int, limit: int) -> tuple[str, str]:
    tag = f"{quarter_tag(start, end)}_b{offset:03d}_{offset + limit:03d}"
    output = template.replace("__M_QUANT_STRUCTURED_REVERSAL_SCRIPT__", base_script)
    replacements = {
        "SLICE_START": f'"{start}"',
        "SLICE_END": f'"{end}"',
        "SECURITY_BATCH_OFFSET": str(offset),
        "SECURITY_BATCH_LIMIT": str(limit),
        "TAG": f'"{tag}"',
    }
    for name, value in replacements.items():
        output = re.sub(rf"^{name} = .*$", f"{name} = {value}", output, count=1, flags=re.MULTILINE)
    return tag, output


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build structured reversal JoinQuant notebook batch runner files.")
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default="2026-07-15")
    parser.add_argument("--window-months", type=int, default=3, help="Use 3 for quarterly windows, 6 for half-year windows.")
    parser.add_argument("--security-count", type=int, default=600, help="Conservative CSI500 upper bound; extra empty offsets are harmless but slower.")
    parser.add_argument("--security-batch-limit", type=int, default=80)
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR))
    args = parser.parse_args()

    template = TEMPLATE.read_text(encoding="utf-8")
    base_script = NOTEBOOK_SCRIPT.read_text(encoding="utf-8")
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    records = []
    for start, end in build_windows(args.start, args.end, args.window_months):
        for offset in range(0, args.security_count, args.security_batch_limit):
            tag, body = patch_runner(template, base_script, start, end, offset, args.security_batch_limit)
            path = output_dir / f"m_quant_structured_reversal_batch_runner_{tag}.py"
            path.write_text(body, encoding="utf-8")
            records.append({
                "tag": tag,
                "slice_start": start,
                "slice_end": end,
                "security_batch_offset": offset,
                "security_batch_limit": args.security_batch_limit,
                "runner_path": display_path(path),
                "expected_json": f"joinquant_structured_reversal_slice_{tag}.json",
                "expected_status": f"joinquant_structured_reversal_slice_{tag}_status.json",
            })

    manifest = {
        "generated_at": datetime.now().isoformat(timespec="milliseconds") + "Z",
        "strategy_id": "structured_reversal_csi500_v1",
        "runner_count": len(records),
        "window_months": args.window_months,
        "security_batch_limit": args.security_batch_limit,
        "output_dir": display_path(output_dir),
        "records": records,
        "next_step": "Paste each runner into JoinQuant Python3 research notebook, then copy generated joinquant_structured_reversal_slice_*.json files into outputs/sources/joinquant/inbox/structured_reversal_slices/.",
    }
    manifest_path = output_dir / "manifest.json"
    write_json(manifest_path, manifest)
    print(json.dumps({"ok": True, "manifest_path": display_path(manifest_path), "runner_count": len(records)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
