#!/usr/bin/env python3
"""Merge structured reversal JoinQuant factor-panel slices locally.

Slice files are produced by ``m_quant_structured_reversal_factor_jq_notebook.py``
in the JoinQuant web research environment. This merger combines raw factor rows
and then recomputes factor activity plus Top100 trading gates from the merged
panel. It never adds IC, returns, or Sharpe from partial summaries.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"

sys.path.insert(0, str(SCRIPT_DIR))
import analyze_structured_reversal_factor as analyzer  # noqa: E402
import m_quant_structured_reversal_index_enhancement as strategy  # noqa: E402


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_json_object(text: str) -> Any:
    return analyzer.extract_json_object(text)


def expand_inputs(patterns: list[str]) -> list[Path]:
    files: list[Path] = []
    for pattern in patterns:
        matches = [Path(item) for item in sorted(glob.glob(pattern))] if any(ch in pattern for ch in "*?[") else [Path(pattern)]
        files.extend(path for path in matches if path.is_file())
    unique: dict[str, Path] = {}
    for path in files:
        if path.name.endswith("_status.json"):
            continue
        unique[str(path.resolve())] = path.resolve()
    return sorted(unique.values())


def load_slice(path: Path) -> dict[str, Any]:
    payload = extract_json_object(read_text(path))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} 不是 JSON 对象。")
    if payload.get("strategy_id") != strategy.STRATEGY_ID:
        raise ValueError(f"{path} 不是 {strategy.STRATEGY_ID} 的分片。")
    rows = payload.get("factor_rows") or []
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{path} 缺少 factor_rows。")
    return payload


def build_table(slices: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    frames = []
    slice_meta = []
    for payload in slices:
        frame = pd.DataFrame(payload["factor_rows"])
        frame["date"] = pd.to_datetime(frame["date"]).dt.normalize()
        frames.append(frame)
        sample = payload.get("sample") or {}
        config = payload.get("config") or {}
        slice_meta.append({
            "slice_start": payload.get("slice_start") or config.get("slice_start") or config.get("factor_start"),
            "slice_end": payload.get("slice_end") or config.get("slice_end") or config.get("end_limit"),
            "factor_rows": sample.get("factor_rows") or len(frame),
            "factor_dates": sample.get("factor_dates") or int(frame["date"].nunique()),
            "unique_securities": sample.get("unique_securities") or int(frame["code"].nunique()),
        })

    table = pd.concat(frames, ignore_index=True)
    before = len(table)
    table = table.sort_values(["date", "code"]).drop_duplicates(["date", "code"], keep="last")
    dropped_duplicates = before - len(table)
    first_config = slices[0].get("config") or {}
    factor_start = table["date"].min().strftime("%Y-%m-%d")
    factor_end = table["date"].max().strftime("%Y-%m-%d")
    config = {
        **first_config,
        "run_mode": "merged_slices",
        "factor_start": factor_start,
        "end_limit": factor_end,
        "slice_count": len(slices),
        "test_dates": int(table["date"].nunique()),
        "unique_securities": int(table["code"].nunique()),
        "merged_at": datetime.now().isoformat(timespec="milliseconds") + "Z",
    }
    audit = {
        "slice_count": len(slices),
        "slice_meta": slice_meta,
        "input_factor_rows": int(before),
        "merged_factor_rows": int(len(table)),
        "dropped_duplicate_date_code_rows": int(dropped_duplicates),
        "factor_dates": int(table["date"].nunique()),
        "date_range": f"{factor_start} 至 {factor_end}",
        "unique_securities": int(table["code"].nunique()),
    }
    return table, config, audit


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def build_report(package: dict[str, Any], audit: dict[str, Any], output_path: Path, symbols_path: Path | None) -> str:
    factor_gates = [row for row in (package.get("factor_gate_result") or []) if row]
    passed = [row for row in factor_gates if row.get("gate_passed")]
    records = package.get("records") or []
    overall = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == strategy.PRIMARY_REBALANCE_DAYS and not row.get("market_regime")), None)
    lines = [
        "# 长江结构化反转 JoinQuant 分片合并审计",
        "",
        f"生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"合并结果：`{display_path(output_path)}`",
        f"最新名单：`{display_path(symbols_path)}`" if symbols_path else "最新名单：无",
        "",
        "## 分片覆盖",
        "",
        f"- 分片数量：{audit['slice_count']}",
        f"- 合并截面行：{audit['merged_factor_rows']}",
        f"- 去重行数：{audit['dropped_duplicate_date_code_rows']}",
        f"- 因子日期：{audit['factor_dates']}",
        f"- 日期范围：{audit['date_range']}",
        f"- 股票数量：{audit['unique_securities']}",
        "",
        "## 门禁摘要",
        "",
        f"- 20日因子门禁通过：{len(passed)} / {len(factor_gates)}",
        f"- 策略状态：{package.get('strategy_status_name') or package.get('strategy_status')}",
        f"- 记录数：{len(records)}",
    ]
    if overall:
        lines.extend([
            f"- 5日调仓年化收益：{overall.get('strategy_annual_return')}",
            f"- 5日调仓年化超额：{overall.get('active_annual_return')}",
            f"- 5日主动 Sharpe：{overall.get('active_sharpe')}",
            f"- 最大回撤：{overall.get('max_drawdown')}",
        ])
    lines.extend([
        "",
        "## 数据边界",
        "",
        "分片只保存 JoinQuant 网页研究环境输出的真实高频截面；本地只做合并、去重、统一复算，不加总分片指标，不补造收益。",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge structured reversal JoinQuant factor-panel slices into a research package.")
    parser.add_argument("inputs", nargs="+", help="Slice JSON/TXT/LOG files or glob patterns.")
    parser.add_argument("--output", default="", help="Merged package output path.")
    parser.add_argument("--report", default="", help="Markdown audit report path.")
    parser.add_argument("--update-strategy-set", action="store_true", help="Update strategy set and pressure-test selection only if paper gate passes.")
    args = parser.parse_args()

    files = expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到结构化反转 slice 输入文件。")

    slices = [load_slice(path) for path in files]
    table, config, audit = build_table(slices)
    package = strategy.build_package(table, config, emit=False)
    package["result_type"] = "index_enhancement_research_package"
    package["merged_slice_audit"] = audit
    package["data_policy"] = package.get("data_policy", "") + " 分片合并版：不加总分片指标，仅合并 JoinQuant 高频截面后统一重算。"

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"{strategy.STRATEGY_ID}_merged_slices_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-structured-reversal-slice-merge-{stamp}.md"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path

    symbols_path = strategy.write_latest_symbols(package, stamp)
    write_json(output_path, package)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, audit, output_path, symbols_path), encoding="utf-8")
    strategy_set_updated = strategy.update_strategy_set(package, symbols_path) if args.update_strategy_set else False
    pressure_selection_updated = strategy.update_position_stress_selection(package, symbols_path) if args.update_strategy_set else False

    summary = {
        "ok": True,
        "input_files": [display_path(path) for path in files],
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "symbols_path": display_path(symbols_path) if symbols_path else None,
        "audit": audit,
        "sample": package.get("sample"),
        "strategy_status": package.get("strategy_status"),
        "strategy_status_name": package.get("strategy_status_name"),
        "paper_watch_checks": package.get("paper_watch_checks"),
        "strategy_set_updated": strategy_set_updated,
        "pressure_selection_updated": pressure_selection_updated,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
