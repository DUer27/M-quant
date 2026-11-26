#!/usr/bin/env python3
"""Run the structured reversal JoinQuant pipeline end to end."""

from __future__ import annotations

import argparse
import glob
import importlib.util
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"
FACTOR_SCRIPT = SCRIPT_DIR / "m_quant_structured_reversal_factor_jq.py"
ANALYSIS_SCRIPT = SCRIPT_DIR / "analyze_structured_reversal_factor.py"
STRATEGY_SCRIPT = SCRIPT_DIR / "m_quant_structured_reversal_index_enhancement.py"
MERGER_SCRIPT = SCRIPT_DIR / "merge_structured_reversal_slices.py"
STRATEGY_ID = "structured_reversal_csi500_v1"
SOURCE = "joinquant_structured_reversal_csi500_v1"
BUNDLED_PYTHON = Path("/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3")
SLICE_DIR = ROOT / "outputs" / "sources" / "joinquant" / "inbox" / "structured_reversal_slices"


def python_executable() -> str:
    if importlib.util.find_spec("numpy") and importlib.util.find_spec("pandas"):
        return sys.executable
    if BUNDLED_PYTHON.exists():
        return str(BUNDLED_PYTHON)
    return sys.executable


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def run_command(cmd: list[str]) -> dict[str, Any]:
    proc = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, check=False)
    return {
        "cmd": cmd,
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
    }


def extract_json_from_stdout(stdout: str) -> Any | None:
    decoder = json.JSONDecoder()
    stripped = stdout.strip()
    for start, char in enumerate(stripped):
        if char not in "[{":
            continue
        try:
            obj, _end = decoder.raw_decode(stripped[start:])
        except json.JSONDecodeError:
            continue
        return obj
    return None


def collect_existing_slices(patterns: list[str]) -> list[Path]:
    files: list[Path] = []
    for pattern in patterns:
        matches = [Path(item) for item in sorted(glob.glob(pattern))] if any(ch in pattern for ch in "*?[") else [Path(pattern)]
        for path in matches:
            if not path.is_file() or path.name.endswith("_status.json"):
                continue
            files.append(path.resolve())
    return sorted(dict.fromkeys(files))


def build_report(summary: dict[str, Any]) -> str:
    lines = [
        "# 长江结构化反转 JoinQuant 一键流水线报告",
        "",
        f"生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"状态：{summary.get('status_name') or summary.get('status')}",
        "",
        "## 产物",
        "",
        f"- 因子截面：`{summary.get('factor_output')}`",
        f"- 因子分析：`{summary.get('analysis_output')}`",
        f"- 策略回测：`{summary.get('strategy_output')}`",
        f"- 策略审计：`{summary.get('strategy_report')}`",
        f"- 最新名单：`{summary.get('symbols_path')}`",
        "",
        "## 门禁",
        "",
        f"- 准模拟盘门禁：{summary.get('paper_watch_checks')}",
        f"- 策略集写入：{summary.get('strategy_set_updated')}",
        f"- 压测选择写入：{summary.get('pressure_selection_updated')}",
        "",
        "## 数据原则",
        "",
        "流水线必须先拿到 JoinQuant 10m/1m 高频数据。若数据权限或因子活性不足，脚本会阻断准模拟盘升级，不生成虚构指标。",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run structured reversal JoinQuant factor, analysis, and strategy backtest pipeline.")
    parser.add_argument("--dataset", choices=["csi500", "csi800", "all_a"], default="csi500")
    parser.add_argument("--factor-start", default="2019-01-01")
    parser.add_argument("--end-limit", default="2026-07-15")
    parser.add_argument("--slice-start", default="")
    parser.add_argument("--slice-end", default="")
    parser.add_argument("--high-freq", choices=["10m", "1m"], default="10m")
    parser.add_argument("--update-strategy-set", action="store_true", help="Upgrade strategy set and pressure-test selection only if paper gate passes.")
    parser.add_argument("--factor-input", default="", help="Use an existing factor panel JSON instead of pulling JoinQuant data.")
    parser.add_argument("--merge-existing-slices", action="store_true", help="Merge web-notebook slice JSON files from the structured reversal inbox.")
    parser.add_argument("--slice-input", action="append", default=[], help="Slice JSON/TXT/LOG file or glob pattern. Defaults to outputs/sources/joinquant/inbox/structured_reversal_slices/*.json.")
    args = parser.parse_args(argv)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    if args.merge_existing_slices:
        patterns = args.slice_input or [str(SLICE_DIR / "*.json")]
        slice_paths = collect_existing_slices(patterns)
        if not slice_paths:
            summary = {
                "ok": False,
                "blocked_reason": "missing_slice_inputs",
                "message": "没有在 outputs/sources/joinquant/inbox/structured_reversal_slices 找到真实 slice JSON；status JSON 会被自动忽略。",
                "slice_dir": display_path(SLICE_DIR),
            }
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 2
        output_path = RESULT_DIR / f"{STRATEGY_ID}_merged_slices_{stamp}.json"
        report_path = REPORT_DIR / f"joinquant-structured-reversal-slice-merge-{stamp}.md"
        merge_cmd = [python_executable(), str(MERGER_SCRIPT), *[str(path) for path in slice_paths], "--output", str(output_path), "--report", str(report_path)]
        if args.update_strategy_set:
            merge_cmd.append("--update-strategy-set")
        result = run_command(merge_cmd)
        if result["returncode"] != 0:
            raise SystemExit(json.dumps({"ok": False, "stage": "merge_existing_slices", "result": result}, ensure_ascii=False, indent=2))
        summary = extract_json_from_stdout(result["stdout"]) or {"stdout": result["stdout"]}
        summary["mode"] = "merge_existing_slices"
        print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
        return 0

    factor_output = Path(args.factor_input).resolve() if args.factor_input else RESULT_DIR / f"{STRATEGY_ID}_factor_panel_{stamp}.json"
    analysis_output = RESULT_DIR / f"{STRATEGY_ID}_factor_analysis_{stamp}.json"
    analysis_report = REPORT_DIR / f"joinquant-structured-reversal-factor-analysis-{stamp}.md"
    strategy_output = RESULT_DIR / f"{STRATEGY_ID}_research_package_{stamp}.json"
    strategy_report = REPORT_DIR / f"joinquant-structured-reversal-index-enhancement-{stamp}.md"
    commands = []

    if not args.factor_input:
        factor_cmd = [
            python_executable(),
            str(FACTOR_SCRIPT),
            "--dataset",
            args.dataset,
            "--factor-start",
            args.factor_start,
            "--end-limit",
            args.end_limit,
            "--high-freq",
            args.high_freq,
            "--output",
            str(factor_output),
        ]
        if args.slice_start:
            factor_cmd.extend(["--slice-start", args.slice_start, "--run-mode", "slice"])
        if args.slice_end:
            factor_cmd.extend(["--slice-end", args.slice_end, "--run-mode", "slice"])
        result = run_command(factor_cmd)
        commands.append(result)
        if result["returncode"] != 0:
            raise SystemExit(json.dumps({"ok": False, "stage": "factor", "result": result}, ensure_ascii=False, indent=2))
        factor_payload = read_json(factor_output)
        if factor_payload.get("status"):
            summary = {
                "ok": False,
                "status": factor_payload.get("status"),
                "status_name": factor_payload.get("message"),
                "factor_output": display_path(factor_output),
                "commands": commands,
            }
            print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
            return 0

    analysis_result = run_command([python_executable(), str(ANALYSIS_SCRIPT), str(factor_output), "--output", str(analysis_output), "--report", str(analysis_report)])
    commands.append(analysis_result)
    if analysis_result["returncode"] != 0:
        raise SystemExit(json.dumps({"ok": False, "stage": "analysis", "result": analysis_result}, ensure_ascii=False, indent=2))

    strategy_cmd = [python_executable(), str(STRATEGY_SCRIPT), str(factor_output), "--output", str(strategy_output), "--report", str(strategy_report)]
    if args.update_strategy_set:
        strategy_cmd.append("--update-strategy-set")
    strategy_result = run_command(strategy_cmd)
    commands.append(strategy_result)
    if strategy_result["returncode"] != 0:
        raise SystemExit(json.dumps({"ok": False, "stage": "strategy", "result": strategy_result}, ensure_ascii=False, indent=2))

    strategy_stdout = extract_json_from_stdout(strategy_result["stdout"]) or {}
    package = read_json(strategy_output)
    summary = {
        "ok": True,
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "status": package.get("strategy_status"),
        "status_name": package.get("strategy_status_name"),
        "paper_watch_checks": package.get("paper_watch_checks"),
        "factor_output": display_path(factor_output),
        "analysis_output": display_path(analysis_output),
        "analysis_report": display_path(analysis_report),
        "strategy_output": display_path(strategy_output),
        "strategy_report": display_path(strategy_report),
        "symbols_path": strategy_stdout.get("symbols_path"),
        "strategy_set_updated": strategy_stdout.get("strategy_set_updated"),
        "pressure_selection_updated": strategy_stdout.get("pressure_selection_updated"),
        "commands": commands,
    }
    report_path = REPORT_DIR / f"joinquant-structured-reversal-pipeline-{stamp}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(summary), encoding="utf-8")
    summary["pipeline_report"] = display_path(report_path)
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
