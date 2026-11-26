#!/usr/bin/env python3
"""Run CSI500 LCR TopN / holding-period / cost-sensitivity diagnostics.

The script intentionally reuses the existing JoinQuant-slice optimizer kernel:
factor-row loading, engineered factors, score construction, trade filters,
cap-neutral selection, and trading simulation all come from
``optimize_csi500_lcr_candidates.py``.  The only extra dimension here is a
controlled sweep over TopN and cost multipliers so the failure mode is easier
to isolate.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"

sys.path.insert(0, str(SCRIPT_DIR))
import optimize_csi500_lcr_candidates as optimizer  # noqa: E402


DEFAULT_VARIANT_ID = "v2_volume_dual_gate_cap_neutral"
DEFAULT_TOP_N = [10, 20, 50]
DEFAULT_HORIZONS = [1, 5, 10, 20]
DEFAULT_COST_MULTIPLIERS = [0.0, 0.5, 1.0, 1.5, 2.0]


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def pct(value: Any) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.2%}"


def num(value: Any, digits: int = 3) -> str:
    number = clean_float(value)
    return "-" if number is None else f"{number:.{digits}f}"


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def parse_int_list(text: str) -> list[int]:
    return [int(item.strip()) for item in text.split(",") if item.strip()]


def parse_float_list(text: str) -> list[float]:
    return [float(item.strip()) for item in text.split(",") if item.strip()]


def get_variant(variant_id: str) -> optimizer.CandidateVariant:
    for variant in optimizer.CANDIDATE_VARIANTS:
        if variant.variant_id == variant_id:
            return variant
    available = ", ".join(item.variant_id for item in optimizer.CANDIDATE_VARIANTS)
    raise SystemExit(f"未知 variant_id: {variant_id}. 可选: {available}")


def scaled_variant(base: optimizer.CandidateVariant, top_n: int) -> optimizer.CandidateVariant:
    original_ratio = base.buffer_n / max(base.top_n, 1)
    buffer_n = max(top_n, int(round(top_n * original_ratio)))
    return replace(base, top_n=int(top_n), buffer_n=int(buffer_n))


def diagnose_row(row: dict[str, Any], no_cost_by_key: dict[tuple[int, int], dict[str, Any]]) -> str:
    key = (int(row["top_n"]), int(row["holding_days"]))
    no_cost = no_cost_by_key.get(key) or {}
    no_cost_active = clean_float(no_cost.get("excess_return"))
    active = clean_float(row.get("excess_return"))
    strategy = clean_float(row.get("strategy_return"))
    drawdown = clean_float(row.get("max_drawdown"))
    cost_drag = clean_float(row.get("cost_drag_vs_0x")) or 0.0
    if no_cost_active is not None and no_cost_active <= 0:
        return "信号/排序弱"
    if no_cost_active is not None and active is not None and active <= 0 < no_cost_active and cost_drag > 0.01:
        return "成本/换手侵蚀"
    if strategy is not None and strategy <= 0 and active is not None and active > 0:
        return "环境贝塔偏弱"
    if drawdown is not None and drawdown < -0.25:
        return "回撤约束失败"
    if active is not None and active > 0:
        return "相对可用"
    return "边际不足"


def summarize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = [row for row in rows if abs(float(row["cost_multiplier"]) - 1.0) < 1e-9]
    summary = []
    for key, group in pd.DataFrame(base).groupby(["top_n", "holding_days"], sort=True):
        top_n, holding_days = key
        item = group.iloc[0].to_dict()
        summary.append({
            "top_n": int(top_n),
            "holding_days": int(holding_days),
            "base_strategy_return": clean_float(item.get("strategy_return")),
            "base_excess_return": clean_float(item.get("excess_return")),
            "base_active_sharpe": clean_float(item.get("active_sharpe")),
            "base_max_drawdown": clean_float(item.get("max_drawdown")),
            "base_avg_turnover": clean_float(item.get("avg_turnover")),
            "base_cost_drag_vs_0x": clean_float(item.get("cost_drag_vs_0x")),
            "diagnosis": item.get("diagnosis"),
        })
    summary = sorted(
        summary,
        key=lambda item: (
            item.get("base_excess_return") if item.get("base_excess_return") is not None else -999,
            item.get("base_active_sharpe") if item.get("base_active_sharpe") is not None else -999,
        ),
        reverse=True,
    )
    return summary


def build_report(package: dict[str, Any], output_path: Path, csv_path: Path) -> str:
    lines = [
        "# 中证500 LCR TopN/持有期/成本敏感性诊断",
        "",
        f"生成时间：{package.get('generated_at')}",
        f"结果文件：`{display_path(output_path)}`",
        f"CSV：`{display_path(csv_path)}`",
        "",
        "## 数据边界",
        "",
        "只读取 JoinQuant slice 原始 factor_rows；因子工程、打分、交易过滤、市值中性选股和交易模拟复用现有优化内核。本表用于诊断，不从汇总结果补造收益。",
        "",
        "## 样本",
        "",
    ]
    audit = package.get("slice_audit") or {}
    lines.extend([
        f"- 分片数量：{audit.get('slice_count')}",
        f"- 合并截面行：{audit.get('merged_factor_rows')}",
        f"- 因子日期：{audit.get('factor_dates')}",
        f"- 日期范围：{audit.get('date_range')}",
        f"- 股票数量：{audit.get('unique_securities')}",
        f"- 诊断版本：`{package.get('variant_id')}` / {package.get('variant_name')}",
        "",
        "## 基础成本 1.0x 排名",
        "",
        "| 排名 | TopN | 持有 | 策略收益 | 主动收益 | 主动Sharpe | 回撤 | 平均换手 | 成本拖累vs0x | 诊断 |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ])
    for idx, item in enumerate(package.get("base_cost_summary") or [], start=1):
        lines.append(
            "| %d | %d | %d日 | %s | %s | %s | %s | %s | %s | %s |" % (
                idx,
                item.get("top_n"),
                item.get("holding_days"),
                pct(item.get("base_strategy_return")),
                pct(item.get("base_excess_return")),
                num(item.get("base_active_sharpe")),
                pct(item.get("base_max_drawdown")),
                num(item.get("base_avg_turnover")),
                pct(item.get("base_cost_drag_vs_0x")),
                item.get("diagnosis"),
            )
        )

    lines.extend([
        "",
        "## 全量敏感性表",
        "",
        "| TopN | 持有 | 成本倍数 | 策略收益 | 基准收益 | 主动收益 | 年化主动 | 主动Sharpe | 回撤 | 胜率 | 平均换手 | 平均持仓 | 成本拖累vs0x | 诊断 |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ])
    for row in package.get("diagnostic_rows") or []:
        lines.append(
            "| %d | %d日 | %.1fx | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                row.get("top_n"),
                row.get("holding_days"),
                row.get("cost_multiplier"),
                pct(row.get("strategy_return")),
                pct(row.get("benchmark_return")),
                pct(row.get("excess_return")),
                pct(row.get("active_annual_return")),
                num(row.get("active_sharpe")),
                pct(row.get("max_drawdown")),
                pct(row.get("active_win_rate")),
                num(row.get("avg_turnover")),
                num(row.get("avg_selected_count"), 1),
                pct(row.get("cost_drag_vs_0x")),
                row.get("diagnosis"),
            )
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="CSI500 LCR TopN / horizon / cost sensitivity diagnostic.")
    parser.add_argument("inputs", nargs="+", help="Slice JSON/TXT/LOG files or glob patterns with factor_rows.")
    parser.add_argument("--variant-id", default=DEFAULT_VARIANT_ID)
    parser.add_argument("--top-n", default=",".join(map(str, DEFAULT_TOP_N)))
    parser.add_argument("--horizons", default=",".join(map(str, DEFAULT_HORIZONS)))
    parser.add_argument("--cost-multipliers", default=",".join(map(str, DEFAULT_COST_MULTIPLIERS)))
    parser.add_argument("--output", default="")
    parser.add_argument("--report", default="")
    parser.add_argument("--csv", default="")
    args = parser.parse_args()

    files = optimizer.expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到 slice 输入文件。")

    top_n_values = parse_int_list(args.top_n)
    horizons = parse_int_list(args.horizons)
    cost_multipliers = parse_float_list(args.cost_multipliers)
    base_variant = get_variant(args.variant_id)
    table, audit = optimizer.build_table(files)
    scored_by_top_n = {top_n: optimizer.score_table(table, scaled_variant(base_variant, top_n)) for top_n in top_n_values}

    original_cost = optimizer.kernel.TRADING_COST_RATE
    original_slippage = optimizer.kernel.TRADING_SLIPPAGE_RATE
    records: list[dict[str, Any]] = []
    try:
        for top_n in top_n_values:
            variant = scaled_variant(base_variant, top_n)
            scored = scored_by_top_n[top_n]
            for cost_multiplier in cost_multipliers:
                optimizer.kernel.TRADING_COST_RATE = original_cost * cost_multiplier
                optimizer.kernel.TRADING_SLIPPAGE_RATE = original_slippage * cost_multiplier
                for horizon in horizons:
                    record = optimizer.simulate_trading(scored, variant, horizon, "整体", {})
                    if not record:
                        continue
                    records.append({
                        "top_n": int(top_n),
                        "buffer_n": int(variant.buffer_n),
                        "holding_days": int(horizon),
                        "cost_multiplier": clean_float(cost_multiplier),
                        "effective_cost_rate": clean_float((original_cost + original_slippage) * cost_multiplier),
                        "sample_dates": record.get("sample_dates"),
                        "sample_trades": record.get("sample_trades"),
                        "strategy_return": record.get("strategy_return"),
                        "benchmark_return": record.get("benchmark_return"),
                        "excess_return": record.get("excess_return"),
                        "strategy_annual_return": record.get("strategy_annual_return"),
                        "benchmark_annual_return": record.get("benchmark_annual_return"),
                        "active_annual_return": record.get("active_annual_return"),
                        "active_sharpe": record.get("active_sharpe"),
                        "sharpe": record.get("sharpe"),
                        "max_drawdown": record.get("max_drawdown"),
                        "active_max_drawdown": record.get("active_max_drawdown"),
                        "daily_win_rate": record.get("daily_win_rate"),
                        "active_win_rate": record.get("active_win_rate"),
                        "period_mean_return": record.get("period_mean_return"),
                        "active_period_mean_return": record.get("active_period_mean_return"),
                        "avg_turnover": record.get("avg_turnover"),
                        "total_turnover": record.get("total_turnover"),
                        "avg_selected_count": record.get("avg_selected_count"),
                        "date_range": record.get("date_range"),
                    })
    finally:
        optimizer.kernel.TRADING_COST_RATE = original_cost
        optimizer.kernel.TRADING_SLIPPAGE_RATE = original_slippage

    no_cost_by_key = {
        (int(row["top_n"]), int(row["holding_days"])): row
        for row in records
        if abs(float(row["cost_multiplier"])) < 1e-9
    }
    for row in records:
        no_cost = no_cost_by_key.get((int(row["top_n"]), int(row["holding_days"]))) or {}
        no_cost_return = clean_float(no_cost.get("strategy_return"))
        row_return = clean_float(row.get("strategy_return"))
        row["cost_drag_vs_0x"] = clean_float(no_cost_return - row_return) if no_cost_return is not None and row_return is not None else None
        row["diagnosis"] = diagnose_row(row, no_cost_by_key)

    records = sorted(records, key=lambda item: (int(item["top_n"]), int(item["holding_days"]), float(item["cost_multiplier"])))
    audit["slice_count"] = len(files)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"csi500_lcr_topn_cost_diagnostic_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"csi500-lcr-topn-cost-diagnostic-{stamp}.md"
    csv_path = Path(args.csv) if args.csv else RESULT_DIR / f"csi500_lcr_topn_cost_diagnostic_{stamp}.csv"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    if not csv_path.is_absolute():
        csv_path = ROOT / csv_path

    package = {
        "result_type": "csi500_lcr_topn_cost_sensitivity_diagnostic",
        "source": "joinquant_csi500_lcr_topn_cost_sensitivity_diagnostic",
        "strategy_id": optimizer.STRATEGY_ID,
        "strategy_name": optimizer.STRATEGY_NAME,
        "variant_id": base_variant.variant_id,
        "variant_name": base_variant.name,
        "variant_description": base_variant.description,
        "variant_weights": base_variant.weights,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "真实 JoinQuant factor slice 合并复算；复用现有候选优化内核；仅扫描 TopN、持有期和成本倍数。",
        "base_cost_rate": original_cost,
        "base_slippage_rate": original_slippage,
        "top_n_values": top_n_values,
        "horizons": horizons,
        "cost_multipliers": cost_multipliers,
        "slice_audit": audit,
        "base_cost_summary": summarize(records),
        "diagnostic_rows": records,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(package, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    pd.DataFrame(records).to_csv(csv_path, index=False, encoding="utf-8-sig")
    report_path.write_text(build_report(package, output_path, csv_path), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "csv_path": display_path(csv_path),
        "variant_id": base_variant.variant_id,
        "slice_audit": audit,
        "best_base_cost_rows": package["base_cost_summary"][:5],
    }, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
