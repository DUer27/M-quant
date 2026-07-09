#!/usr/bin/env python3
"""Audit robustness of the AkShare local regime switch strategy.

This script rebuilds the exact switch trade stream from audited component
trade_records and checks whether the result is overly dependent on one year,
one component, or a short lucky interval. It does not create synthetic returns.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_akshare_regime_switch_strategy import (
    EXECUTION_PACK_PATH,
    ROOT,
    VALIDATION_PATH,
    build_switch_trades,
    clean_float,
    executable_components,
    load_json,
    metric_summary,
    pct,
)


RESULTS_DIR = ROOT / "outputs" / "sources" / "akshare" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"
SWITCH_PATH = RESULTS_DIR / "akshare_regime_switch_paper_watch_strategy_20260709.json"
OUTPUT_PATH = RESULTS_DIR / "akshare_regime_switch_robustness_audit_20260709.json"
DOC_PATH = DOCS_DIR / "akshare-regime-switch-robustness-audit-20260709.md"

GATES = {
    "min_total_trades": 50,
    "min_component_trade_share": 0.25,
    "max_component_trade_share": 0.75,
    "min_component_return": 0.0,
    "min_year_positive_ratio": 0.67,
    "min_leave_one_year_return": 0.20,
    "min_leave_one_year_sharpe": 1.0,
    "min_rolling_12_positive_ratio": 0.70,
    "min_worst_rolling_12_return": -0.08,
    "max_worst_rolling_12_drawdown": -0.12,
    "min_rolling_12_sharpe": -1.0,
    "min_recent_return": 0.0,
}


def format_number(value: float | None) -> str:
    if value is None:
        return "NA"
    return f"{value:.2f}"


def add_return_columns(rows: pd.DataFrame) -> pd.DataFrame:
    work = rows.copy()
    work["base_cost"] = work["gross_return_5d"] - work["net_return_5d"]
    work["stress_2_0_return_5d"] = work["gross_return_5d"] - work["base_cost"] * 2.0
    return work


def summarize_group(rows: pd.DataFrame) -> dict:
    summary = metric_summary(rows, cost_multiplier=1.0)
    summary["stress_2_0_return"] = metric_summary(rows, cost_multiplier=2.0)["strategy_return"]
    return summary


def component_robustness(rows: pd.DataFrame) -> list[dict]:
    total = max(len(rows), 1)
    result = []
    for (component_id, component_name, role, regime), group in rows.groupby([
        "component_id",
        "component_name",
        "execution_role",
        "market_regime",
    ]):
        summary = summarize_group(group)
        result.append({
            "component_id": component_id,
            "component_name": component_name,
            "execution_role": role,
            "market_regime": regime,
            "trade_share": clean_float(len(group) / total),
            **summary,
        })
    return sorted(result, key=lambda item: item["sample_trades"], reverse=True)


def year_robustness(rows: pd.DataFrame) -> list[dict]:
    result = []
    for year, group in rows.groupby(rows["date"].dt.year):
        summary = summarize_group(group)
        result.append({"year": int(year), **summary})
    return sorted(result, key=lambda item: item["year"])


def leave_one_year_out(rows: pd.DataFrame) -> list[dict]:
    result = []
    for year in sorted(rows["date"].dt.year.unique()):
        kept = rows[rows["date"].dt.year != year]
        summary = summarize_group(kept)
        result.append({
            "excluded_year": int(year),
            **summary,
        })
    return result


def rolling_windows(rows: pd.DataFrame, window: int = 12) -> dict:
    if len(rows) < window:
        return {
            "window": window,
            "window_count": 0,
            "positive_ratio": None,
            "worst_return": None,
            "worst_drawdown": None,
            "min_sharpe": None,
            "records": [],
        }
    records = []
    for start in range(0, len(rows) - window + 1):
        block = rows.iloc[start:start + window]
        summary = summarize_group(block)
        records.append({
            "start_date": str(block["date"].iloc[0].date()),
            "end_date": str(block["date"].iloc[-1].date()),
            **summary,
        })
    return {
        "window": window,
        "window_count": len(records),
        "positive_ratio": clean_float(sum((item["strategy_return"] or 0) > 0 for item in records) / len(records)),
        "worst_return": clean_float(min(item["strategy_return"] for item in records if item["strategy_return"] is not None)),
        "worst_drawdown": clean_float(min(item["max_drawdown"] for item in records if item["max_drawdown"] is not None)),
        "min_sharpe": clean_float(min(item["sharpe"] for item in records if item["sharpe"] is not None)),
        "records": records,
    }


def build_checks(rows: pd.DataFrame, component_rows: list[dict], year_rows: list[dict], loo_rows: list[dict], rolling_12: dict) -> list[dict]:
    recent = rows[rows["date"] >= pd.Timestamp("2026-01-01")]
    recent_summary = summarize_group(recent)
    year_positive_ratio = sum((item.get("strategy_return") or 0) > 0 for item in year_rows) / max(len(year_rows), 1)
    component_shares = [item.get("trade_share") or 0 for item in component_rows]
    component_returns = [item.get("strategy_return") for item in component_rows]
    min_loo_return = min(item["strategy_return"] for item in loo_rows if item["strategy_return"] is not None)
    min_loo_sharpe = min(item["sharpe"] for item in loo_rows if item["sharpe"] is not None)
    return [
        {
            "name": "total_trades",
            "passed": len(rows) >= GATES["min_total_trades"],
            "detail": f"{len(rows)} >= {GATES['min_total_trades']}",
        },
        {
            "name": "component_trade_share_floor",
            "passed": min(component_shares or [0]) >= GATES["min_component_trade_share"],
            "detail": f"{min(component_shares or [0]):.4f} >= {GATES['min_component_trade_share']:.4f}",
        },
        {
            "name": "component_trade_share_ceiling",
            "passed": max(component_shares or [1]) <= GATES["max_component_trade_share"],
            "detail": f"{max(component_shares or [1]):.4f} <= {GATES['max_component_trade_share']:.4f}",
        },
        {
            "name": "components_all_positive",
            "passed": all((value or -math.inf) > GATES["min_component_return"] for value in component_returns),
            "detail": ", ".join(f"{value:.4f}" for value in component_returns if value is not None),
        },
        {
            "name": "year_positive_ratio",
            "passed": year_positive_ratio >= GATES["min_year_positive_ratio"],
            "detail": f"{year_positive_ratio:.4f} >= {GATES['min_year_positive_ratio']:.4f}",
        },
        {
            "name": "leave_one_year_return",
            "passed": min_loo_return >= GATES["min_leave_one_year_return"],
            "detail": f"{min_loo_return:.4f} >= {GATES['min_leave_one_year_return']:.4f}",
        },
        {
            "name": "leave_one_year_sharpe",
            "passed": min_loo_sharpe >= GATES["min_leave_one_year_sharpe"],
            "detail": f"{min_loo_sharpe:.4f} >= {GATES['min_leave_one_year_sharpe']:.4f}",
        },
        {
            "name": "rolling_12_positive_ratio",
            "passed": (rolling_12["positive_ratio"] or -math.inf) >= GATES["min_rolling_12_positive_ratio"],
            "detail": f"{rolling_12['positive_ratio']:.4f} >= {GATES['min_rolling_12_positive_ratio']:.4f}",
        },
        {
            "name": "worst_rolling_12_return",
            "passed": (rolling_12["worst_return"] or -math.inf) >= GATES["min_worst_rolling_12_return"],
            "detail": f"{rolling_12['worst_return']:.4f} >= {GATES['min_worst_rolling_12_return']:.4f}",
        },
        {
            "name": "worst_rolling_12_drawdown",
            "passed": (rolling_12["worst_drawdown"] or -math.inf) >= GATES["max_worst_rolling_12_drawdown"],
            "detail": f"{rolling_12['worst_drawdown']:.4f} >= {GATES['max_worst_rolling_12_drawdown']:.4f}",
        },
        {
            "name": "min_rolling_12_sharpe",
            "passed": (rolling_12["min_sharpe"] or -math.inf) >= GATES["min_rolling_12_sharpe"],
            "detail": f"{rolling_12['min_sharpe']:.4f} >= {GATES['min_rolling_12_sharpe']:.4f}",
        },
        {
            "name": "recent_return",
            "passed": (recent_summary["strategy_return"] or -math.inf) > GATES["min_recent_return"],
            "detail": f"{recent_summary['strategy_return']:.4f} > {GATES['min_recent_return']:.4f}",
        },
    ]


def write_doc(pack: dict) -> None:
    lines = [
        "# AkShare 本地切换策略稳健性审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 决策：`{pack['decision']}`",
        f"- 数据原则：{pack['data_policy']}",
        f"- 输入：`{pack['input']}`",
        "",
        "## 核心结论",
        "",
        f"- 年度正收益比例：{pack['summary']['year_positive_ratio']:.2%}",
        f"- 留一年最差收益：{pct(pack['summary']['min_leave_one_year_return'])}",
        f"- 留一年最差 Sharpe：{format_number(pack['summary']['min_leave_one_year_sharpe'])}",
        f"- 滚动12期正收益比例：{pack['summary']['rolling_12_positive_ratio']:.2%}",
        f"- 滚动12期最差收益：{pct(pack['summary']['worst_rolling_12_return'])}",
        f"- 滚动12期最深回撤：{pct(pack['summary']['worst_rolling_12_drawdown'])}",
        "",
        "## 组件均衡",
        "",
    ]
    for item in pack["component_robustness"]:
        lines.extend([
            f"### {item['component_name']}",
            "",
            f"- 调仓占比：{item['trade_share']:.2%}",
            f"- 样本调仓：{item['sample_trades']}",
            f"- 收益：{pct(item['strategy_return'])}",
            f"- 最大回撤：{pct(item['max_drawdown'])}",
            f"- Sharpe：{format_number(item['sharpe'])}",
            "",
        ])
    lines.extend(["## 门槛检查", ""])
    for check in pack["checks"]:
        mark = "通过" if check["passed"] else "未过"
        lines.append(f"- {check['name']}：{mark}，{check['detail']}")
    lines.extend(["", "## 边界", "", pack["data_policy"], ""])
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    validation = load_json(VALIDATION_PATH)
    execution_pack = load_json(EXECUTION_PACK_PATH)
    switch_pack = load_json(SWITCH_PATH)
    components = executable_components(execution_pack, validation)
    rows = add_return_columns(build_switch_trades(components))
    component_rows = component_robustness(rows)
    year_rows = year_robustness(rows)
    loo_rows = leave_one_year_out(rows)
    rolling_12 = rolling_windows(rows, window=12)
    checks = build_checks(rows, component_rows, year_rows, loo_rows, rolling_12)
    passed_all = all(item["passed"] for item in checks)
    decision = "robust_local_switch_paper_watch" if passed_all else "conditional_local_switch_recheck"
    summary = {
        "year_positive_ratio": clean_float(sum((item.get("strategy_return") or 0) > 0 for item in year_rows) / max(len(year_rows), 1)),
        "min_leave_one_year_return": clean_float(min(item["strategy_return"] for item in loo_rows if item["strategy_return"] is not None)),
        "min_leave_one_year_sharpe": clean_float(min(item["sharpe"] for item in loo_rows if item["sharpe"] is not None)),
        "rolling_12_positive_ratio": rolling_12["positive_ratio"],
        "worst_rolling_12_return": rolling_12["worst_return"],
        "worst_rolling_12_drawdown": rolling_12["worst_drawdown"],
        "min_rolling_12_sharpe": rolling_12["min_sharpe"],
    }
    pack = {
        "source": "akshare_regime_switch_robustness_audit",
        "strategy_id": switch_pack.get("strategy_id"),
        "strategy_name": switch_pack.get("strategy_name"),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(SWITCH_PATH.relative_to(ROOT)),
        "data_policy": "只读取 AkShare 本地切换策略的真实组件 trade_records 重建曲线；做稳健性切片和压力检查，不生成新收益。",
        "decision": decision,
        "decision_reason": (
            "组件均衡、留一年、年度、滚动窗口和近期收益门槛均通过。"
            if passed_all
            else "存在稳健性门槛未通过，需继续观察或收紧执行边界。"
        ),
        "gates": GATES,
        "checks": checks,
        "failed_checks": [item for item in checks if not item["passed"]],
        "summary": summary,
        "component_robustness": component_rows,
        "year_robustness": year_rows,
        "leave_one_year_out": loo_rows,
        "rolling_12": {
            **{key: value for key, value in rolling_12.items() if key != "records"},
            "worst_records": sorted(
                rolling_12["records"],
                key=lambda item: item["strategy_return"] if item["strategy_return"] is not None else 999,
            )[:5],
        },
    }
    OUTPUT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "output": str(OUTPUT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "decision": decision,
        "failed_checks": pack["failed_checks"],
        "summary": summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
