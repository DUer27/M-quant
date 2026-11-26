#!/usr/bin/env python3
"""Build a formal paper-watch package from the best LCR optimization variant."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"
STRATEGY_ID = "csi500_low_crowding_reversal_index_enhancement_v0"
STRATEGY_NAME = "中证500低拥挤反转指数增强候选策略 v0"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def pct(value: Any) -> str:
    try:
        return f"{float(value):.2%}"
    except (TypeError, ValueError):
        return "-"


def build_report(package: dict[str, Any], output_path: Path) -> str:
    primary = package.get("primary_trading") or {}
    gates = package.get("factor_gate_result") or []
    checks = package.get("paper_watch_checks") or {}
    lines = [
        "# 中证500低拥挤反转指数增强准模拟盘候选包",
        "",
        f"生成时间：{package.get('generated_at')}",
        f"结果文件：`{display_path(output_path)}`",
        "",
        "## 结论",
        "",
        f"- 策略状态：{package.get('strategy_status_name')}",
        f"- 候选版本：`{package.get('variant_id')}` / {package.get('variant_name')}",
        f"- 样本：{package.get('slice_audit', {}).get('factor_dates')} 个因子日期，{package.get('slice_audit', {}).get('merged_factor_rows')} 行截面。",
        f"- 日期范围：{package.get('slice_audit', {}).get('date_range')}",
        "",
        "## 5日主调仓",
        "",
        f"- 策略收益：{pct(primary.get('strategy_return'))}",
        f"- 基准收益：{pct(primary.get('benchmark_return'))}",
        f"- 主动收益：{pct(primary.get('excess_return'))}",
        f"- 年化收益：{pct(primary.get('strategy_annual_return'))}",
        f"- 主动 Sharpe：{primary.get('active_sharpe')}",
        f"- 最大回撤：{pct(primary.get('max_drawdown'))}",
        f"- 平均换手：{primary.get('avg_turnover')}",
        "",
        "## 20日因子门禁",
        "",
    ]
    for gate in gates:
        result = gate.get("primary_result") or {}
        lines.append(
            f"- `{gate.get('factor_name')}`：pass={gate.get('gate_passed')}，IC={result.get('rank_ic_mean')}，t={result.get('rank_ic_t')}，多空={result.get('long_short_mean')}，正收益比例={result.get('long_short_positive_ratio')}"
        )
    lines.extend(["", "## 准模拟盘检查", ""])
    for key, value in checks.items():
        lines.append(f"- `{key}`：{value}")
    lines.extend([
        "",
        "## 数据边界",
        "",
        package.get("data_policy") or "JoinQuant slice 原始截面合并复算；不从汇总指标反推。",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build formal CSI500 LCR paper-watch candidate package.")
    parser.add_argument("optimization", help="Candidate optimization JSON path.")
    parser.add_argument("--variant-id", default="", help="Variant id to export. Defaults to first paper_trade_candidate, then top-ranked variant.")
    parser.add_argument("--output", default="", help="Output package path.")
    parser.add_argument("--report", default="", help="Markdown report path.")
    args = parser.parse_args()

    optimization_path = Path(args.optimization)
    if not optimization_path.is_absolute():
        optimization_path = ROOT / optimization_path
    data = read_json(optimization_path)
    variants = data.get("variant_summaries") or []
    selected = None
    if args.variant_id:
        selected = next((item for item in variants if item.get("variant_id") == args.variant_id), None)
    if selected is None:
        selected = next((item for item in variants if item.get("strategy_status") == "paper_trade_candidate"), None)
    if selected is None and variants:
        selected = variants[0]
    if selected is None:
        raise SystemExit("优化结果缺少 variant_summaries。")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"{STRATEGY_ID}_{selected.get('variant_id')}_paper_candidate_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-csi500-lcr-paper-candidate-{selected.get('variant_id')}-{stamp}.md"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path

    primary = selected.get("primary_trading") or {}
    package = {
        "result_type": "index_enhancement_research_package",
        "source": f"joinquant_csi500_low_crowding_reversal_index_enhancement_{selected.get('variant_id')}",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "variant_id": selected.get("variant_id"),
        "variant_name": selected.get("variant_name"),
        "variant_description": selected.get("description"),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": data.get("data_policy"),
        "sample_warning": data.get("sample_warning"),
        "factor_gate": data.get("factor_gate"),
        "paper_watch_gate": data.get("paper_watch_gate"),
        "factor_gate_result": selected.get("factor_gate_result"),
        "factor_gate_pass_count": selected.get("factor_gate_pass_count"),
        "strategy_status": selected.get("strategy_status"),
        "strategy_status_name": selected.get("strategy_status_name"),
        "paper_watch_checks": selected.get("paper_watch_checks"),
        "primary_trading": primary,
        "slice_audit": data.get("slice_audit"),
        "optimization_source": display_path(optimization_path),
        "sample": {
            "factor_rows": data.get("slice_audit", {}).get("merged_factor_rows"),
            "factor_dates": data.get("slice_audit", {}).get("factor_dates"),
            "unique_securities": data.get("slice_audit", {}).get("unique_securities"),
            "records": len(selected.get("records") or []),
        },
        "records": selected.get("records") or [],
    }
    write_json(output_path, package)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "variant_id": package["variant_id"],
        "strategy_status": package["strategy_status"],
        "strategy_status_name": package["strategy_status_name"],
        "sample": package["sample"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
