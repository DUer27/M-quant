#!/usr/bin/env python3
"""Audit overlap between recommended paper-watch routes."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
READINESS_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_readiness_audit_20260709.json"
SWITCH_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "regime_switch_quality_kline_v1_20260709.json"
RESULT_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_independence_audit_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "paper-watch-independence-audit-20260709.md"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def route_key(strategy_id: str | None, regime: str | None, bucket: str | None) -> str:
    return "::".join([strategy_id or "", regime or "", bucket or ""])


def route_components(route: dict, switch_pack: dict) -> list[dict]:
    if route.get("strategy_id") == switch_pack.get("strategy_id"):
        return [
            {
                "strategy_id": component.get("strategy_id"),
                "strategy_name": component.get("strategy_name"),
                "market_regime": component.get("market_regime"),
                "market_cap_bucket": component.get("market_cap_bucket"),
                "role": component.get("role"),
            }
            for component in switch_pack.get("components", [])
        ]
    return [
        {
            "strategy_id": route.get("strategy_id"),
            "strategy_name": route.get("strategy_name"),
            "market_regime": route.get("market_regime"),
            "market_cap_bucket": route.get("market_cap_bucket"),
            "role": "standalone_route",
        }
    ]


def route_dates(route: dict, switch_pack: dict, readiness_routes: list[dict]) -> set[str]:
    if route.get("strategy_id") == switch_pack.get("strategy_id"):
        return {point["date"] for point in switch_pack.get("net_value_curve", []) if point.get("date")}
    for candidate in readiness_routes:
        if candidate.get("strategy_id") != route.get("strategy_id"):
            continue
        if candidate.get("allowed_layer") != route.get("layer"):
            continue
        baseline = candidate.get("baseline", {})
        # Readiness records only keep range metrics, so use an approximate label for overlap decisions.
        return {f"{baseline.get('first_date')}..{baseline.get('last_date')}"}
    return set()


def audit() -> dict:
    readiness = load_json(READINESS_PATH)
    switch_pack = load_json(SWITCH_PATH)
    recommended = readiness.get("recommended_routes", [])
    readiness_routes = readiness.get("routes", [])
    enriched = []
    for route in recommended:
        components = route_components(route, switch_pack)
        enriched.append({
            **route,
            "components": components,
            "component_keys": [
                route_key(component.get("strategy_id"), component.get("market_regime"), component.get("market_cap_bucket"))
                for component in components
            ],
            "date_set": sorted(route_dates(route, switch_pack, readiness_routes)),
        })

    overlaps = []
    for left_index, left in enumerate(enriched):
        for right in enriched[left_index + 1:]:
            shared_components = sorted(set(left["component_keys"]) & set(right["component_keys"]))
            relation = "independent"
            warning = ""
            if shared_components:
                relation = "component_overlap"
                warning = "两条推荐路线共享同一个底层策略/市场状态组件，不应作为两笔独立资金同时满仓运行。"
            overlaps.append({
                "left_strategy_id": left["strategy_id"],
                "left_strategy_name": left["strategy_name"],
                "right_strategy_id": right["strategy_id"],
                "right_strategy_name": right["strategy_name"],
                "relation": relation,
                "shared_components": shared_components,
                "warning": warning,
            })

    has_overlap = any(item["relation"] != "independent" for item in overlaps)
    deployment_mode = "portfolio_controller_primary" if has_overlap else "independent_sleeves"
    pack = {
        "source": "paper_watch_independence_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "只读取模拟观察推荐路线和已生成的真实曲线组合策略组件；不生成收益或回测结果。",
        "recommended_route_count": len(recommended),
        "independent_capital_sleeves": 1 if has_overlap else len(recommended),
        "deployment_mode": deployment_mode,
        "decision": "use_switch_strategy_as_primary_and_component_as_monitor" if has_overlap else "routes_can_run_as_independent_sleeves",
        "decision_name": "切换策略主用，组件策略监控" if has_overlap else "可作为独立资金袖",
        "summary": (
            "市场状态切换策略包含 JQ质量利润流动性策略的高波动组件；模拟盘应把切换策略作为组合控制器，"
            "JQ高波动作为组件监控或备选，不应和切换策略在高波动环境下重复满仓。"
            if has_overlap else
            "推荐路线之间未发现组件重叠，可作为独立资金袖观察。"
        ),
        "routes": [
            {key: value for key, value in route.items() if key != "date_set"}
            for route in enriched
        ],
        "overlaps": overlaps,
    }
    return pack


def write_doc(pack: dict) -> None:
    lines = [
        "# 模拟观察独立性审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 推荐路线数量：{pack['recommended_route_count']}",
        f"- 独立资金袖数量：{pack['independent_capital_sleeves']}",
        f"- 决策：{pack['decision_name']}",
        "",
        pack["summary"],
        "",
        "## 重叠检查",
        "",
    ]
    if not pack["overlaps"]:
        lines.append("- 无路线可比较。")
    for item in pack["overlaps"]:
        lines.append(
            f"- `{item['left_strategy_name']}` vs `{item['right_strategy_name']}`：{item['relation']}。{item['warning']}"
        )
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    pack = audit()
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "decision": pack["decision"],
        "independent_capital_sleeves": pack["independent_capital_sleeves"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
