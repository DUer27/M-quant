#!/usr/bin/env python3
"""Audit controlled paper-watch readiness from real JoinQuant trading curves."""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
EXECUTION_PACK_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_execution_pack_20260709.json"
RESULT_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_readiness_audit_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "paper-watch-readiness-audit-20260709.md"
TODAY = pd.Timestamp("2026-07-09")

GATES = {
    "min_periods": 30,
    "min_strategy_return": 0.20,
    "max_drawdown_floor": -0.15,
    "min_sharpe": 1.20,
    "min_win_rate": 0.52,
    "min_stress_1_5_return": 0.0,
    "min_avg_selected_count": 10,
    "max_recency_days": 180,
}


def load_imported_results() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    return data.get("results", [])


def max_drawdown(equity: pd.Series) -> float | None:
    if equity.empty:
        return None
    drawdown = equity / equity.cummax() - 1
    return float(drawdown.min())


def sharpe_ratio(returns: pd.Series, periods_per_year: float = 252 / 5) -> float | None:
    clean = returns.replace([math.inf, -math.inf], math.nan).dropna()
    if clean.empty or clean.std(ddof=1) == 0:
        return None
    return float(clean.mean() / clean.std(ddof=1) * math.sqrt(periods_per_year))


def calc_curve_metrics(curve: list[dict], cost_multiplier: float = 1.0) -> dict:
    frame = pd.DataFrame(curve)
    if frame.empty:
        return {
            "periods": 0,
            "strategy_return": None,
            "max_drawdown": None,
            "sharpe": None,
            "win_rate": None,
            "avg_turnover": None,
            "avg_selected_count": None,
        }
    frame["date"] = pd.to_datetime(frame["date"])
    frame["gross_return"] = pd.to_numeric(frame["gross_return"], errors="coerce")
    frame["cost"] = pd.to_numeric(frame["cost"], errors="coerce").fillna(0)
    frame["turnover"] = pd.to_numeric(frame["turnover"], errors="coerce")
    frame["selected_count"] = pd.to_numeric(frame["selected_count"], errors="coerce")
    period_return = frame["gross_return"] - frame["cost"] * cost_multiplier
    equity = (1 + period_return.fillna(0)).cumprod()
    return {
        "periods": int(len(frame)),
        "first_date": frame["date"].min().strftime("%Y-%m-%d"),
        "last_date": frame["date"].max().strftime("%Y-%m-%d"),
        "strategy_return": float(equity.iloc[-1] - 1),
        "max_drawdown": max_drawdown(equity),
        "sharpe": sharpe_ratio(period_return),
        "win_rate": float((period_return > 0).mean()),
        "avg_turnover": None if frame["turnover"].dropna().empty else float(frame["turnover"].mean()),
        "avg_selected_count": None if frame["selected_count"].dropna().empty else float(frame["selected_count"].mean()),
    }


def split_curve(curve: list[dict]) -> dict:
    if not curve:
        return {"first_half": calc_curve_metrics([]), "second_half": calc_curve_metrics([])}
    ordered = sorted(curve, key=lambda item: item["date"])
    middle = len(ordered) // 2
    return {
        "first_half": calc_curve_metrics(ordered[:middle]),
        "second_half": calc_curve_metrics(ordered[middle:]),
    }


def match_trading_result(results: list[dict], route: dict) -> dict | None:
    for item in results:
        if item.get("result_type") != "strategy_trading_backtest":
            continue
        if item.get("strategy_id") != route.get("strategy_id"):
            continue
        if item.get("market_regime") != route.get("allowed_market_regime"):
            continue
        if item.get("market_cap_bucket") != route.get("allowed_market_cap_bucket"):
            continue
        return item
    return None


def bool_check(name: str, passed: bool, detail: str) -> dict:
    return {"name": name, "passed": bool(passed), "detail": detail}


def classify_route(route: dict, trading_result: dict | None, metrics: dict, stress: dict, split: dict) -> tuple[str, str, list[dict]]:
    checks = []
    if trading_result is None:
        return "missing_result", "缺少匹配的 JoinQuant 真实交易回测结果。", checks

    recency_days = (TODAY - pd.Timestamp(metrics["last_date"])).days
    first_half = split["first_half"]
    second_half = split["second_half"]
    checks.extend([
        bool_check("periods", metrics["periods"] >= GATES["min_periods"], f"{metrics['periods']} >= {GATES['min_periods']}"),
        bool_check("strategy_return", metrics["strategy_return"] >= GATES["min_strategy_return"], f"{metrics['strategy_return']:.4f} >= {GATES['min_strategy_return']:.4f}"),
        bool_check("max_drawdown", metrics["max_drawdown"] >= GATES["max_drawdown_floor"], f"{metrics['max_drawdown']:.4f} >= {GATES['max_drawdown_floor']:.4f}"),
        bool_check("sharpe", metrics["sharpe"] >= GATES["min_sharpe"], f"{metrics['sharpe']:.4f} >= {GATES['min_sharpe']:.4f}"),
        bool_check("win_rate", metrics["win_rate"] >= GATES["min_win_rate"], f"{metrics['win_rate']:.4f} >= {GATES['min_win_rate']:.4f}"),
        bool_check("stress_1_5_return", stress["cost_1_5x"]["strategy_return"] >= GATES["min_stress_1_5_return"], f"{stress['cost_1_5x']['strategy_return']:.4f} > 0"),
        bool_check("avg_selected_count", metrics["avg_selected_count"] >= GATES["min_avg_selected_count"], f"{metrics['avg_selected_count']:.2f} >= {GATES['min_avg_selected_count']}"),
        bool_check("first_half_positive", first_half["strategy_return"] > 0, f"{first_half['strategy_return']:.4f} > 0"),
        bool_check("second_half_positive", second_half["strategy_return"] > 0, f"{second_half['strategy_return']:.4f} > 0"),
        bool_check("recent_layer_activity", recency_days <= GATES["max_recency_days"], f"{recency_days} <= {GATES['max_recency_days']} days"),
    ])
    hard_pass_names = {
        "periods",
        "strategy_return",
        "max_drawdown",
        "sharpe",
        "win_rate",
        "stress_1_5_return",
        "avg_selected_count",
    }
    hard_pass = all(item["passed"] for item in checks if item["name"] in hard_pass_names)
    split_pass = first_half["strategy_return"] > 0 and second_half["strategy_return"] > 0
    recent = recency_days <= GATES["max_recency_days"]

    if hard_pass and split_pass and recent:
        return "ready_controlled_paper_watch", "硬门槛、成本压力、前后半段和近期触发均通过。", checks
    if hard_pass and split_pass:
        return "conditional_paper_watch", "硬门槛、成本压力和前后半段通过，但近期未触发该分层，只能等环境出现后观察。", checks
    if hard_pass:
        return "conditional_recheck_required", "硬门槛通过，但分段或近期触发不足，模拟前需人工复核。", checks
    return "not_ready", "硬门槛未全部通过，不进入模拟观察。", checks


def audit_route(results: list[dict], route: dict) -> dict:
    trading_result = match_trading_result(results, route)
    curve = trading_result.get("net_value_curve", []) if trading_result else []
    metrics = calc_curve_metrics(curve, cost_multiplier=1.0)
    stress = {
        "cost_1_0x": metrics,
        "cost_1_5x": calc_curve_metrics(curve, cost_multiplier=1.5),
        "cost_2_0x": calc_curve_metrics(curve, cost_multiplier=2.0),
    }
    split = split_curve(curve)
    decision, reason, checks = classify_route(route, trading_result, metrics, stress, split)
    return {
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "allowed_layer": route.get("allowed_layer"),
        "allowed_market_regime": route.get("allowed_market_regime"),
        "allowed_market_cap_bucket": route.get("allowed_market_cap_bucket"),
        "decision": decision,
        "decision_reason": reason,
        "checks": checks,
        "baseline": metrics,
        "cost_stress": stress,
        "split": split,
        "source": trading_result.get("source") if trading_result else None,
        "data_policy": trading_result.get("data_policy") if trading_result else None,
    }


def pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value * 100:.2f}%"


def write_doc(pack: dict) -> None:
    lines = [
        "# 受控模拟观察就绪审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 路线数量：{pack['route_count']}",
        f"- 决策分布：{pack['decision_counts']}",
        "",
        "## 路线结论",
        "",
    ]
    for route in pack["routes"]:
        base = route["baseline"]
        stress = route["cost_stress"]
        split = route["split"]
        lines.extend([
            f"### {route['strategy_name']} - {route['allowed_layer']}",
            "",
            f"- 决策：{route['decision']}",
            f"- 原因：{route['decision_reason']}",
            f"- 真实收益：{pct(base['strategy_return'])}",
            f"- 最大回撤：{pct(base['max_drawdown'])}",
            f"- Sharpe：{base['sharpe']:.2f}",
            f"- 1.5x 成本压力收益：{pct(stress['cost_1_5x']['strategy_return'])}",
            f"- 2.0x 成本压力收益：{pct(stress['cost_2_0x']['strategy_return'])}",
            f"- 前半段收益：{pct(split['first_half']['strategy_return'])}",
            f"- 后半段收益：{pct(split['second_half']['strategy_return'])}",
            f"- 日期：{base.get('first_date', '-')} 至 {base.get('last_date', '-')}",
            "",
            "检查项：",
        ])
        lines.extend(
            f"- {'通过' if item['passed'] else '未通过'} `{item['name']}`：{item['detail']}"
            for item in route["checks"]
        )
        lines.append("")
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    results = load_imported_results()
    execution_pack = json.loads(EXECUTION_PACK_PATH.read_text(encoding="utf-8"))
    routes = execution_pack.get("routes", [])
    audited_routes = [audit_route(results, route) for route in routes]
    decision_counts = {
        str(key): int(value)
        for key, value in pd.Series([route["decision"] for route in audited_routes]).value_counts().items()
    }
    pack = {
        "source": "joinquant_paper_watch_readiness_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": {
            "execution_pack": str(EXECUTION_PACK_PATH.relative_to(ROOT)),
            "imported_backtests": str(DATA_PATH.relative_to(ROOT)),
        },
        "data_policy": "只读取已导入 JoinQuant 真实交易回测净值曲线；成本压力和分段收益由曲线中的真实 gross_return/cost/turnover 重算，不生成虚构收益。",
        "gates": GATES,
        "route_count": len(audited_routes),
        "decision_counts": decision_counts,
        "routes": audited_routes,
    }
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "source": pack["source"],
        "route_count": pack["route_count"],
        "decision_counts": pack["decision_counts"],
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
