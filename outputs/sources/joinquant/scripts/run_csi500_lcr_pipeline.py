#!/usr/bin/env python3
"""Run the CSI500 low-crowding reversal enhancement pipeline end to end.

This command is intentionally local-SDK oriented: it expects jqdatasdk plus
JQ_ACCOUNT/JQ_PASSWORD or JOINQUANT_ACCOUNT/JOINQUANT_PASSWORD. The strategy
kernel itself still runs unchanged inside the JoinQuant research environment.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
KERNEL = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "m_quant_csi500_low_crowding_reversal_index_enhancement.py"
IMPORTER = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "import_joinquant_result_package.py"
MERGER = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "merge_csi500_lcr_slices.py"
OPTIMIZER = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "optimize_csi500_lcr_candidates.py"
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
SLICE_DIR = ROOT / "outputs" / "sources" / "joinquant" / "inbox" / "csi500_lcr_slices"
REPORT_DIR = ROOT / "outputs" / "_docs"
STATUS_PATH = RESULT_DIR / "csi500_low_crowding_reversal_index_enhancement_status.json"
STRATEGY_ID = "csi500_low_crowding_reversal_index_enhancement_v0"
SOURCE = "joinquant_csi500_low_crowding_reversal_index_enhancement_v0"
DEFAULT_ENV_FILES = [
    ROOT / ".env.joinquant",
    ROOT / ".env.joinquant.local",
    ROOT / ".env.local",
    ROOT / "platform" / "quant-factor-platform" / ".env.joinquant",
    ROOT / "platform" / "quant-factor-platform" / ".env.local",
]


def load_env_file(path: Path) -> list[str]:
    loaded: list[str] = []
    if not path.exists():
        return loaded
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def load_private_env(extra_env_file: str = "") -> list[str]:
    paths = [Path(extra_env_file)] if extra_env_file else []
    paths.extend(DEFAULT_ENV_FILES)
    loaded: list[str] = []
    seen: set[Path] = set()
    for path in paths:
        resolved = path.expanduser()
        if not resolved.is_absolute():
            resolved = ROOT / resolved
        if resolved in seen:
            continue
        seen.add(resolved)
        loaded.extend(load_env_file(resolved))
    return loaded


def has_auth_env() -> bool:
    account = os.getenv("JQ_ACCOUNT") or os.getenv("JOINQUANT_ACCOUNT")
    password = os.getenv("JQ_PASSWORD") or os.getenv("JOINQUANT_PASSWORD")
    return bool(account and password)


def json_from_stdout(text: str) -> dict:
    decoder = json.JSONDecoder()
    starts = [index for index, char in enumerate(text) if char == "{"]
    last_error: Exception | None = None
    for start in starts:
        try:
            payload, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        if isinstance(payload, dict):
            return payload
    raise ValueError(f"策略脚本没有输出可解析 JSON：{last_error}")


def run_command(cmd: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def parse_date(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%d")


def date_text(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def add_months(value: datetime, months: int) -> datetime:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(value.day, days_in_month[month - 1])
    return value.replace(year=year, month=month, day=day)


def build_windows(start: str, end: str, months: int) -> list[tuple[str, str]]:
    if months <= 0:
        raise ValueError("slice months must be positive")
    cursor = parse_date(start)
    limit = parse_date(end)
    windows: list[tuple[str, str]] = []
    while cursor <= limit:
        next_start = add_months(cursor, months)
        window_end = min(limit, next_start - timedelta(days=1))
        windows.append((date_text(cursor), date_text(window_end)))
        cursor = window_end + timedelta(days=1)
    return windows


def classify_kernel_error(stderr: str) -> str:
    if "未开通权限" in stderr or "sdk" in stderr.lower() and "permission" in stderr.lower():
        return "joinquant_sdk_permission_not_enabled"
    if "Could not connect" in stderr or "TTransportException" in stderr:
        return "joinquant_network_unavailable"
    if "auth" in stderr.lower() or "password" in stderr.lower():
        return "joinquant_auth_failed"
    return "kernel_failed"


def classify_slice_failure(stderr: str) -> str:
    reason = classify_kernel_error(stderr)
    if reason != "kernel_failed":
        return reason
    return "sliced_kernel_failed"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path, fallback=None):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def json_from_error_text(text: str) -> dict:
    try:
        payload = json.loads(text)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def resolve_output_path(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def run_sliced_kernel(windows: list[tuple[str, str]], timeout: int) -> tuple[list[Path], list[dict]]:
    SLICE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    outputs: list[Path] = []
    results: list[dict] = []
    for start, end in windows:
        proc = run_command([
            sys.executable,
            str(KERNEL),
            "--run-mode",
            "slice",
            "--slice-start",
            start,
            "--slice-end",
            end,
        ], timeout=timeout)
        item = {
            "slice_start": start,
            "slice_end": end,
            "returncode": proc.returncode,
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }
        if proc.returncode != 0:
            results.append(item)
            item["blocked_reason"] = classify_slice_failure(proc.stderr)
            raise RuntimeError(json.dumps({"blocked_reason": item["blocked_reason"], "failed_slice": item}, ensure_ascii=False, indent=2))
        payload = json_from_stdout(proc.stdout)
        path = SLICE_DIR / f"{STRATEGY_ID}_slice_{start}_{end}_{stamp}.json"
        write_json(path, payload)
        outputs.append(path)
        item["output_path"] = str(path.relative_to(ROOT))
        item["factor_rows"] = payload.get("sample", {}).get("factor_rows")
        item["factor_dates"] = payload.get("sample", {}).get("factor_dates")
        results.append(item)
    return outputs, results


def collect_existing_slices() -> list[Path]:
    return sorted(path for path in SLICE_DIR.glob("*.json") if path.is_file())


def write_status(data: dict) -> None:
    status = {
        "generated_at": datetime.now().isoformat(timespec="milliseconds") + "Z",
        "strategy_id": STRATEGY_ID,
        "source": SOURCE,
        **data,
    }
    write_json(STATUS_PATH, status)


def build_report(payload: dict, import_result: dict | None, output_path: Path) -> str:
    factor_gates = payload.get("factor_gate_result") or []
    passed = [row for row in factor_gates if row.get("gate_passed")]
    records = payload.get("records") or []
    factor_rows = [row for row in records if row.get("result_type") == "factor_backtest"]
    strategy_rows = [row for row in records if str(row.get("result_type") or "").startswith("strategy_")]
    trading_rows = [row for row in strategy_rows if row.get("result_type") == "strategy_trading_backtest"]
    overall = next((row for row in trading_rows if not row.get("market_regime") and not row.get("market_cap_bucket")), None)
    lines = [
        "# 中证500低拥挤反转指数增强 JoinQuant 实跑报告",
        "",
        f"生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"结果文件：`{output_path.relative_to(ROOT)}`",
        "",
        "## 摘要",
        "",
        f"- 策略：{payload.get('strategy_name') or STRATEGY_ID}",
        f"- 来源：{payload.get('source') or SOURCE}",
        f"- 状态：{payload.get('strategy_status_name') or payload.get('strategy_status') or '-'}",
        f"- 因子记录：{len(factor_rows)}",
        f"- 策略记录：{len(strategy_rows)}",
        f"- 交易净值记录：{len(trading_rows)}",
        f"- 20日门禁通过因子：{len(passed)} / {len(factor_gates)}",
    ]
    if overall:
        lines.extend([
            "",
            "## 整体交易净值",
            "",
            f"- 累计收益：{overall.get('strategy_return')}",
            f"- 基准收益：{overall.get('benchmark_return')}",
            f"- 主动收益：{overall.get('excess_return')}",
            f"- 年化收益：{overall.get('strategy_annual_return')}",
            f"- 主动 Sharpe：{overall.get('active_sharpe')}",
            f"- 最大回撤：{overall.get('max_drawdown')}",
            f"- 平均换手：{overall.get('avg_turnover')}",
        ])
    if import_result:
        audit = import_result.get("audit") or import_result.get("result", {}).get("audit") or {}
        lines.extend([
            "",
            "## 导入审计",
            "",
            f"- 缺失因子周期：{audit.get('missing_factor_horizons', [])}",
            f"- 缺失策略周期：{audit.get('missing_strategy_horizons', [])}",
            f"- 缺失事件周期：{audit.get('missing_event_horizons', [])}",
            f"- 缺失交易调仓周期：{audit.get('missing_trading_horizons', [])}",
            f"- 分层数量：{audit.get('layer_count')}",
            f"- 交易九宫格周期矩阵：{audit.get('trading_layer_matrix_count')} / {audit.get('expected_trading_layer_matrix_count')}",
            f"- 缺失分层：{audit.get('missing_layer_keys', [])}",
        ])
    lines.extend([
        "",
        "## 数据边界",
        "",
        payload.get("data_policy") or "真实 JoinQuant 数据；不生成虚构收益。",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run CSI500 low-crowding reversal JoinQuant pipeline locally.")
    parser.add_argument("--output", default="", help="Output JSON path. Defaults to outputs/sources/joinquant/results/<strategy>_<timestamp>.json")
    parser.add_argument("--timeout", type=int, default=7200, help="Kernel timeout seconds.")
    parser.add_argument("--no-import", action="store_true", help="Run and save JSON without importing to platform.")
    parser.add_argument("--env-file", default="", help="Optional private env file with JQ_ACCOUNT/JQ_PASSWORD or JOINQUANT_ACCOUNT/JOINQUANT_PASSWORD.")
    parser.add_argument("--sliced", action="store_true", help="Run smaller JoinQuant slices locally, then merge and audit them.")
    parser.add_argument("--merge-existing-slices", action="store_true", help="Merge and audit existing JSON slices in outputs/sources/joinquant/inbox/csi500_lcr_slices without running JoinQuant SDK.")
    parser.add_argument("--optimize-candidates", action="store_true", help="After slice merge, run conservative candidate variant optimization from the same raw factor rows.")
    parser.add_argument("--slice-months", type=int, default=6, help="Months per slice when --sliced is used. Use 6 for half-year, 12 for yearly.")
    parser.add_argument("--slice-start", default="2019-01-01", help="First factor date for sliced mode.")
    parser.add_argument("--slice-end", default="2026-07-15", help="Last factor date for sliced mode.")
    args = parser.parse_args()

    loaded_env_keys = load_private_env(args.env_file)

    if args.merge_existing_slices:
        slice_paths = collect_existing_slices()
        if not slice_paths:
            result = {
                "ok": False,
                "blocked_reason": "missing_slice_inputs",
                "message": "没有在 outputs/sources/joinquant/inbox/csi500_lcr_slices 找到 JSON slice。",
            }
            write_status(result)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 2
        output_path = resolve_output_path(Path(args.output)) if args.output else RESULT_DIR / f"{STRATEGY_ID}_merged_existing_slices_{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        merge_proc = run_command([sys.executable, str(MERGER), *[str(path) for path in slice_paths], "--output", str(output_path)], timeout=1800)
        if merge_proc.returncode != 0:
            failed = {
                "ok": False,
                "blocked_reason": "slice_merge_failed",
                "returncode": merge_proc.returncode,
                "stdout_tail": merge_proc.stdout[-4000:],
                "stderr_tail": merge_proc.stderr[-4000:],
            }
            write_status(failed)
            print(json.dumps(failed, ensure_ascii=False, indent=2))
            return merge_proc.returncode or 1
        try:
            merge_result = json.loads(merge_proc.stdout)
        except Exception:
            merge_result = {"stdout": merge_proc.stdout, "stderr": merge_proc.stderr}
        optimization_result = None
        if args.optimize_candidates:
            opt_proc = run_command([sys.executable, str(OPTIMIZER), *[str(path) for path in slice_paths]], timeout=1800)
            try:
                optimization_result = json.loads(opt_proc.stdout)
            except Exception:
                optimization_result = {"returncode": opt_proc.returncode, "stdout": opt_proc.stdout, "stderr": opt_proc.stderr}
            if opt_proc.returncode != 0:
                failed = {"ok": False, "blocked_reason": "candidate_optimization_failed", "optimization_result": optimization_result}
                write_status(failed)
                print(json.dumps(failed, ensure_ascii=False, indent=2))
                return opt_proc.returncode or 1
        payload = read_json(output_path, {})
        success = {
            "ok": True,
            "strategy_id": STRATEGY_ID,
            "mode": "merge_existing_slices",
            "slice_count": len(slice_paths),
            "output_path": display_path(output_path),
            "merge_result": merge_result,
            "optimization_result": optimization_result,
            "sample": payload.get("sample"),
        }
        write_status(success)
        print(json.dumps(success, ensure_ascii=False, indent=2))
        return 0

    if not has_auth_env():
        result = {
            "ok": False,
            "blocked_reason": "missing_joinquant_credentials",
            "message": "本地 jqdatasdk 已可用，但缺少 JQ_ACCOUNT/JQ_PASSWORD 或 JOINQUANT_ACCOUNT/JOINQUANT_PASSWORD。",
            "strategy_id": STRATEGY_ID,
            "checked_private_env_files": [str(path.relative_to(ROOT)) for path in DEFAULT_ENV_FILES if path.exists()],
            "loaded_env_keys": [key for key in loaded_env_keys if "PASSWORD" not in key],
        }
        write_status(result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2

    output_path = resolve_output_path(Path(args.output)) if args.output else RESULT_DIR / f"{STRATEGY_ID}_{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    if args.sliced:
        try:
            windows = build_windows(args.slice_start, args.slice_end, args.slice_months)
            slice_paths, slice_results = run_sliced_kernel(windows, args.timeout)
            merge_proc = run_command([sys.executable, str(MERGER), *[str(path) for path in slice_paths], "--output", str(output_path)], timeout=1800)
        except Exception as exc:
            error_payload = json_from_error_text(str(exc))
            failed = {
                "ok": False,
                "blocked_reason": error_payload.get("blocked_reason") or "sliced_kernel_failed",
                "error": str(exc),
            }
            write_status(failed)
            print(json.dumps(failed, ensure_ascii=False, indent=2))
            return 1
        if merge_proc.returncode != 0:
            failed = {
                "ok": False,
                "blocked_reason": "slice_merge_failed",
                "returncode": merge_proc.returncode,
                "stdout_tail": merge_proc.stdout[-4000:],
                "stderr_tail": merge_proc.stderr[-4000:],
            }
            write_status(failed)
            print(json.dumps(failed, ensure_ascii=False, indent=2))
            return merge_proc.returncode or 1
        try:
            merge_result = json.loads(merge_proc.stdout)
        except Exception:
            merge_result = {"stdout": merge_proc.stdout, "stderr": merge_proc.stderr}
        payload = read_json(output_path, {})
        optimization_result = None
        if args.optimize_candidates:
            opt_proc = run_command([sys.executable, str(OPTIMIZER), *[str(path) for path in slice_paths]], timeout=1800)
            try:
                optimization_result = json.loads(opt_proc.stdout)
            except Exception:
                optimization_result = {"returncode": opt_proc.returncode, "stdout": opt_proc.stdout, "stderr": opt_proc.stderr}
            if opt_proc.returncode != 0:
                failed = {"ok": False, "blocked_reason": "candidate_optimization_failed", "optimization_result": optimization_result}
                write_status(failed)
                print(json.dumps(failed, ensure_ascii=False, indent=2))
                return opt_proc.returncode or 1
        import_result = None
        if not args.no_import:
            importer_proc = run_command([sys.executable, str(IMPORTER), str(output_path)], timeout=600)
            try:
                import_result = json.loads(importer_proc.stdout)
            except Exception:
                import_result = {"returncode": importer_proc.returncode, "stdout": importer_proc.stdout, "stderr": importer_proc.stderr}
            if importer_proc.returncode != 0:
                failed = {"ok": False, "blocked_reason": "import_failed", "output": str(output_path), "import_result": import_result}
                write_status(failed)
                print(json.dumps(failed, ensure_ascii=False, indent=2))
                return importer_proc.returncode or 1
        success = {
            "ok": True,
            "strategy_id": STRATEGY_ID,
            "mode": "sliced",
            "slice_count": len(slice_paths),
            "slice_results": slice_results,
            "output_path": display_path(output_path),
            "merge_result": merge_result,
            "optimization_result": optimization_result,
            "imported": not args.no_import,
            "import_result": import_result,
            "sample": payload.get("sample"),
        }
        write_status(success)
        print(json.dumps(success, ensure_ascii=False, indent=2))
        return 0

    proc = run_command([sys.executable, str(KERNEL)], timeout=args.timeout)
    if proc.returncode != 0:
        result = {
            "ok": False,
            "blocked_reason": classify_kernel_error(proc.stderr),
            "returncode": proc.returncode,
            "stdout_tail": proc.stdout[-4000:],
            "stderr_tail": proc.stderr[-4000:],
        }
        write_status(result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return proc.returncode or 1

    payload = json_from_stdout(proc.stdout)
    write_json(output_path, payload)

    import_result = None
    if not args.no_import:
        importer_proc = run_command([sys.executable, str(IMPORTER), str(output_path)], timeout=600)
        try:
            import_result = json.loads(importer_proc.stdout)
        except Exception:
            import_result = {"returncode": importer_proc.returncode, "stdout": importer_proc.stdout, "stderr": importer_proc.stderr}
        if importer_proc.returncode != 0:
            failed = {"ok": False, "blocked_reason": "import_failed", "output": str(output_path), "import_result": import_result}
            write_status(failed)
            print(json.dumps(failed, ensure_ascii=False, indent=2))
            return importer_proc.returncode or 1

    report_path = REPORT_DIR / f"joinquant-csi500-low-crowding-reversal-index-enhancement-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(payload, import_result, output_path), encoding="utf-8")

    success = {
        "ok": True,
        "strategy_id": STRATEGY_ID,
        "output_path": display_path(output_path),
        "report_path": str(report_path.relative_to(ROOT)),
        "imported": not args.no_import,
        "import_result": import_result,
    }
    write_status(success)
    print(json.dumps(success, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
