#!/usr/bin/env python3
"""
Audit JoinQuant strategy maturity and controlled paper-watch routes.

The audit only reads imported real JoinQuant backtest results. It does not
create synthetic returns, net value curves, or strategy performance.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
RESULT_DIR = ROOT / "outputs" / "strategies" / "joinquant"
DOC_DIR = ROOT / "outputs" / "_docs"
AUDIT_JSON_PATH = RESULT_DIR / "strategy_maturity_audit_20260709.json"
AUDIT_MD_PATH = DOC_DIR / "strategy-maturity-audit-20260709.md"
PAPER_WATCH_JSON_PATH = RESULT_DIR / "paper_watch_routes_20260709.json"

WHOLE_STRATEGY_GATES = {
    "min_sample_dates": 100,
    "min_strategy_return": 0.15,
    "min_annual_return": 0.08,
    "max_drawdown_floor": -0.25,
    "min_sharpe": 0.8,
    "min_win_rate": 0.52,
    "min_positive_cross_layers": 12,
}

CONTROLLED_ROUTE_GATES = {
    "min_sample_dates": 30,
    "min_strategy_return": 0.20,
    "min_annual_return": 0.20,
    "max_drawdown_floor": -0.15,
    "min_sharpe": 1.20,
    "min_win_rate": 0.52,
}


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def number(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def pct(value):
    result = number(value)
    if result is None:
        return "NA"
    return f"{result * 100:.2f}%"


def fmt(value, digits=2):
    result = number(value)
    if result is None:
        return "NA"
    return f"{result:.{digits}f}"


def is_trading_result(item):
    return item.get("result_type") == "strategy_trading_backtest"


def is_event_result(item):
    return item.get("result_type") == "strategy_backtest"


def is_unsegmented(item):
    return is_trading_result(item) and not item.get("market_regime") and not item.get("market_cap_bucket")


def is_cross_layer(item):
    return is_trading_result(item) and bool(item.get("market_regime")) and bool(item.get("market_cap_bucket"))


def trading_passes(item, gates):
    strategy_return = number(item.get("strategy_return"))
    annual_return = number(item.get("strategy_annual_return") or item.get("annual_return"))
    max_drawdown = number(item.get("max_drawdown"))
    sharpe = number(item.get("sharpe"))
    win_rate = number(item.get("daily_win_rate"))
    sample_dates = number(item.get("sample_dates")) or 0
    checks = {
        "sample_dates": sample_dates >= gates["min_sample_dates"],
        "strategy_return": strategy_return is not None and strategy_return >= gates["min_strategy_return"],
        "annual_return": annual_return is not None and annual_return >= gates["min_annual_return"],
        "max_drawdown": max_drawdown is not None and max_drawdown >= gates["max_drawdown_floor"],
        "sharpe": sharpe is not None and sharpe >= gates["min_sharpe"],
        "win_rate": win_rate is not None and win_rate >= gates["min_win_rate"],
    }
    return all(checks.values()), checks


def score_route(item):
    return (
        (number(item.get("sharpe")) or -999) * 100
        + (number(item.get("strategy_return")) or -999) * 10
        + (number(item.get("strategy_annual_return") or item.get("annual_return")) or -999) * 5
        + (number(item.get("max_drawdown")) or -999)
        + (number(item.get("sample_dates")) or 0) / 1000
    )


def strategy_name(records, strategy_id):
    for item in records:
        if item.get("strategy_name"):
            return item["strategy_name"]
    return strategy_id


def audit_strategy(strategy_id, records):
    trading = [item for item in records if is_trading_result(item)]
    events = [item for item in records if is_event_result(item)]
    base = next((item for item in trading if is_unsegmented(item)), None)
    cross_layers = [item for item in trading if is_cross_layer(item)]
    positive_cross_layers = [item for item in cross_layers if (number(item.get("strategy_return")) or -999) > 0]
    controlled_routes = []
    for item in trading:
        if is_unsegmented(item):
            continue
        passes, checks = trading_passes(item, CONTROLLED_ROUTE_GATES)
        if passes:
            controlled_routes.append({
                "strategy_id": strategy_id,
                "strategy_name": strategy_name(records, strategy_id),
                "layer": item.get("layer") or "",
                "market_regime": item.get("market_regime") or "",
                "market_cap_bucket": item.get("market_cap_bucket") or "",
                "sample_dates": item.get("sample_dates"),
                "strategy_return": item.get("strategy_return"),
                "annual_return": item.get("strategy_annual_return") or item.get("annual_return"),
                "max_drawdown": item.get("max_drawdown"),
                "sharpe": item.get("sharpe"),
                "win_rate": item.get("daily_win_rate"),
                "checks": checks,
                "source": item.get("source", ""),
                "data_policy": item.get("data_policy", ""),
                "paper_scope": f"仅限 {item.get('layer') or '该分层'}，不得扩展到未通过分层。",
            })

    controlled_routes = sorted(controlled_routes, key=score_route, reverse=True)
    base_passes = False
    base_checks = {}
    if base:
        base_passes, base_checks = trading_passes(base, WHOLE_STRATEGY_GATES)
    cross_layer_passes = len(positive_cross_layers) >= WHOLE_STRATEGY_GATES["min_positive_cross_layers"]
    if base_passes and cross_layer_passes:
        decision = "whole_strategy_paper_watch"
        decision_name = "整策略可模拟观察"
    elif controlled_routes:
        decision = "controlled_route_paper_watch"
        decision_name = "仅分层路线可模拟观察"
    elif base and (number(base.get("strategy_return")) or -999) > 0:
        decision = "positive_but_not_mature"
        decision_name = "正收益但未成熟"
    else:
        decision = "reject_or_rework"
        decision_name = "暂缓或重做"

    worst_layers = sorted(
        trading,
        key=lambda item: number(item.get("strategy_return")) if number(item.get("strategy_return")) is not None else -999,
    )[:5]

    return {
        "strategy_id": strategy_id,
        "strategy_name": strategy_name(records, strategy_id),
        "decision": decision,
        "decision_name": decision_name,
        "record_count": len(records),
        "event_count": len(events),
        "trading_count": len(trading),
        "cross_layer_count": len(cross_layers),
        "positive_cross_layer_count": len(positive_cross_layers),
        "base_trading": base,
        "base_checks": base_checks,
        "controlled_route_count": len(controlled_routes),
        "controlled_routes": controlled_routes,
        "worst_layers": [
            {
                "layer": item.get("layer") or "",
                "market_regime": item.get("market_regime") or "",
                "market_cap_bucket": item.get("market_cap_bucket") or "",
                "sample_dates": item.get("sample_dates"),
                "strategy_return": item.get("strategy_return"),
                "max_drawdown": item.get("max_drawdown"),
                "sharpe": item.get("sharpe"),
            }
            for item in worst_layers
        ],
        "next_action": (
            "可进入受控模拟观察，但只能按通过的分层路线运行，并继续监控样本外和成本。"
            if controlled_routes else
            "不进入模拟盘；先重做因子、降低换手或限制市场/市值层后再复核。"
        ),
    }


def write_markdown(audit):
    lines = [
        "# JoinQuant 策略成熟度审计",
        "",
        f"生成时间：{audit['generated_at']}",
        "",
        "## 数据口径",
        "",
        f"- 输入：`{audit['input']}`",
        f"- 策略数：{audit['strategy_count']}",
        f"- 受控模拟观察路线：{audit['controlled_route_count']}",
        "- 原则：只读取已导入的 JoinQuant 真实结果；不生成虚构收益。",
        "",
        "## 硬门槛",
        "",
        f"- 整策略：样本日 >= {WHOLE_STRATEGY_GATES['min_sample_dates']}，总收益 >= {pct(WHOLE_STRATEGY_GATES['min_strategy_return'])}，年化 >= {pct(WHOLE_STRATEGY_GATES['min_annual_return'])}，最大回撤不低于 {pct(WHOLE_STRATEGY_GATES['max_drawdown_floor'])}，Sharpe >= {WHOLE_STRATEGY_GATES['min_sharpe']}，日胜率 >= {pct(WHOLE_STRATEGY_GATES['min_win_rate'])}，且正收益交叉层 >= {WHOLE_STRATEGY_GATES['min_positive_cross_layers']}。",
        f"- 受控路线：样本日 >= {CONTROLLED_ROUTE_GATES['min_sample_dates']}，总收益 >= {pct(CONTROLLED_ROUTE_GATES['min_strategy_return'])}，年化 >= {pct(CONTROLLED_ROUTE_GATES['min_annual_return'])}，最大回撤不低于 {pct(CONTROLLED_ROUTE_GATES['max_drawdown_floor'])}，Sharpe >= {CONTROLLED_ROUTE_GATES['min_sharpe']}，日胜率 >= {pct(CONTROLLED_ROUTE_GATES['min_win_rate'])}。",
        "",
        "## 策略结论",
        "",
        "| 策略 | 结论 | 未分层收益 | 未分层回撤 | 未分层Sharpe | 正收益交叉层 | 受控路线数 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for item in audit["strategies"]:
        base = item.get("base_trading") or {}
        lines.append(
            f"| {item['strategy_name']} | {item['decision_name']} | "
            f"{pct(base.get('strategy_return'))} | {pct(base.get('max_drawdown'))} | "
            f"{fmt(base.get('sharpe'))} | {item['positive_cross_layer_count']}/{item['cross_layer_count']} | "
            f"{item['controlled_route_count']} |"
        )

    lines.extend(["", "## 可进入受控模拟观察的路线", ""])
    if audit["controlled_routes"]:
        lines.extend([
            "| 策略 | 路线 | 收益 | 年化 | 回撤 | Sharpe | 样本日 | 边界 |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
        ])
        for route in audit["controlled_routes"]:
            lines.append(
                f"| {route['strategy_name']} | {route['layer']} | {pct(route['strategy_return'])} | "
                f"{pct(route['annual_return'])} | {pct(route['max_drawdown'])} | "
                f"{fmt(route['sharpe'])} | {route.get('sample_dates') or 0} | {route['paper_scope']} |"
            )
    else:
        lines.append("当前没有路线满足受控模拟观察门槛。")

    lines.extend(["", "## 首批模拟观察配置", ""])
    primary_routes = audit.get("primary_paper_watch_routes", [])
    if primary_routes:
        lines.extend([
            "| 策略 | 允许路线 | 收益 | 回撤 | Sharpe | 约束 |",
            "| --- | --- | ---: | ---: | ---: | --- |",
        ])
        for route in primary_routes:
            lines.append(
                f"| {route['strategy_name']} | {route['layer']} | {pct(route['strategy_return'])} | "
                f"{pct(route['max_drawdown'])} | {fmt(route['sharpe'])} | {route['paper_scope']} |"
            )
    else:
        lines.append("当前不足两条不同策略的受控路线，暂不生成模拟观察配置。")

    lines.extend([
        "",
        "## 使用边界",
        "",
        "- `仅分层路线可模拟观察` 不等于整策略成熟，只能按通过的市场/市值层运行。",
        "- 小市值或中波动层若未通过，不能在模拟盘中放开。",
        "- 下一步应把通过路线写成模拟盘配置，并继续做样本外、换手、行业暴露和成本敏感性监控。",
        "",
    ])
    AUDIT_MD_PATH.write_text("\n".join(lines), encoding="utf-8")


def select_primary_paper_watch_routes(controlled_routes, max_routes=2):
    selected = []
    used_strategies = set()
    for route in controlled_routes:
        strategy_id = route["strategy_id"]
        if strategy_id in used_strategies:
            continue
        selected.append(route)
        used_strategies.add(strategy_id)
        if len(selected) >= max_routes:
            break
    return selected


def write_paper_watch_config(audit):
    primary_routes = audit["primary_paper_watch_routes"]
    config = {
        "source": "joinquant_paper_watch_routes",
        "generated_at": audit["generated_at"],
        "data_policy": "只使用 JoinQuant 真实策略交易回测中通过硬门槛的受控分层路线；不得扩展到未通过分层。",
        "status": "ready_for_controlled_paper_watch" if len(primary_routes) >= 2 else "not_ready",
        "route_count": len(primary_routes),
        "selection_policy": "按 Sharpe、收益、年化、回撤和样本日排序，每个策略最多取一条首批路线。",
        "required_controls": [
            "只允许配置中列出的市场波动和市值层开仓",
            "模拟盘继续记录净值、回撤、换手、滑点和行业暴露",
            "任一策略实盘外推前必须补样本外和成本敏感性复核",
            "未通过层不得因为同名策略整体开放",
        ],
        "routes": primary_routes,
    }
    PAPER_WATCH_JSON_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return config


def main():
    records = read_json(DATA_PATH, [])
    grouped = defaultdict(list)
    for item in records:
        strategy_id = item.get("strategy_id")
        if strategy_id:
            grouped[strategy_id].append(item)

    strategies = [audit_strategy(strategy_id, grouped[strategy_id]) for strategy_id in sorted(grouped)]
    controlled_routes = []
    for item in strategies:
        controlled_routes.extend(item["controlled_routes"])
    controlled_routes = sorted(controlled_routes, key=score_route, reverse=True)
    primary_paper_watch_routes = select_primary_paper_watch_routes(controlled_routes, max_routes=2)

    audit = {
        "source": "joinquant_strategy_maturity_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(DATA_PATH.relative_to(ROOT)),
        "data_policy": "只读取已导入 JoinQuant 真实策略结果；不生成虚构收益；整策略和分层路线分开评级。",
        "whole_strategy_gates": WHOLE_STRATEGY_GATES,
        "controlled_route_gates": CONTROLLED_ROUTE_GATES,
        "strategy_count": len(strategies),
        "decision_counts": dict(Counter(item["decision"] for item in strategies)),
        "controlled_route_count": len(controlled_routes),
        "primary_paper_watch_route_count": len(primary_paper_watch_routes),
        "primary_paper_watch_routes": primary_paper_watch_routes,
        "strategies": strategies,
        "controlled_routes": controlled_routes,
    }
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_JSON_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(audit)
    paper_config = write_paper_watch_config(audit)
    print(json.dumps({
        "source": audit["source"],
        "generated_at": audit["generated_at"],
        "strategy_count": audit["strategy_count"],
        "decision_counts": audit["decision_counts"],
        "controlled_route_count": audit["controlled_route_count"],
        "paper_watch_status": paper_config["status"],
        "primary_paper_watch_route_count": audit["primary_paper_watch_route_count"],
        "top_routes": [
            {
                "strategy_id": item["strategy_id"],
                "layer": item["layer"],
                "return": item["strategy_return"],
                "drawdown": item["max_drawdown"],
                "sharpe": item["sharpe"],
            }
            for item in controlled_routes[:5]
        ],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
