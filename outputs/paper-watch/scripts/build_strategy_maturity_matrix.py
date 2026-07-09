#!/usr/bin/env python3
"""Build a maturity matrix for the two-strategy paper-watch objective.

The matrix only reads existing audited evidence. It does not create strategy
returns, fills, positions, NAV, or tradeability results.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULTS_DIR = ROOT / "outputs" / "paper-watch" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

OPERATIONS_PATH = RESULTS_DIR / "paper_watch_operations_pack_20260709.json"
JQ_MATURITY_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "strategy_maturity_audit_20260709.json"
JQ_INDEPENDENCE_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_independence_audit_20260709.json"
AK_FACTOR_AUDIT_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_factor_quality_audit.json"
AK_SWITCH_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_regime_switch_paper_watch_strategy_20260709.json"
AK_ROBUSTNESS_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_regime_switch_robustness_audit_20260709.json"
TRADEABILITY_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-tradeability-reviews.json"
CORE_SIGNAL_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-core-medium-small-signal-reviews.json"
INDEPENDENT_SLEEVE_AUDIT_PATH = RESULTS_DIR / "independent_sleeve_candidate_audit_20260710.json"

RESULT_PATH = RESULTS_DIR / "strategy_maturity_matrix_20260710.json"
DOC_PATH = DOCS_DIR / "strategy-maturity-matrix-20260710.md"

TARGET_READY_STRATEGIES = 2


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value) -> str:
    if value is None:
        return "NA"
    return f"{float(value) * 100:.2f}%"


def number(value, digits=2) -> str:
    if value is None:
        return "NA"
    return f"{float(value):.{digits}f}"


def latest_tradeability_review(reviews: list[dict], strategy_id: str, signal_date: str) -> dict | None:
    matches = [
        item for item in reviews
        if item.get("strategy_id") == strategy_id and item.get("signal_date") == signal_date
    ]
    return sorted(matches, key=lambda item: item.get("importedAt", ""), reverse=True)[0] if matches else None


def sleeve_entry(sleeve: dict) -> dict:
    baseline = sleeve.get("baseline") or {}
    can_start = bool(sleeve.get("can_start_observation"))
    return {
        "id": sleeve.get("sleeve_id"),
        "strategy_id": sleeve.get("strategy_id"),
        "strategy_name": sleeve.get("strategy_name"),
        "category": "paper_watch_capital_sleeve",
        "evidence_system": sleeve.get("evidence_system"),
        "decision": "ready_for_paper_watch" if can_start else "blocked_before_paper_watch",
        "decision_name": "可进入模拟观察" if can_start else "准入阻塞",
        "counts_toward_two_strategy_goal": can_start,
        "can_start_observation": can_start,
        "operational_status": sleeve.get("operational_status"),
        "role": sleeve.get("role"),
        "sample_dates": baseline.get("sample_dates") or baseline.get("sample_trades"),
        "strategy_return": baseline.get("strategy_return"),
        "max_drawdown": baseline.get("max_drawdown"),
        "sharpe": baseline.get("sharpe"),
        "win_rate": baseline.get("win_rate") or baseline.get("positive_trade_ratio"),
        "blocked_reasons": sleeve.get("blocked_reasons", []),
        "next_action": (
            "开始真实模拟观察账本记录，并按运行包暂停规则监控。"
            if can_start
            else "补齐 blocked_reasons 中列出的准入证据后再允许 planned_weight 大于 0。"
        ),
        "data_policy": sleeve.get("data_policy"),
    }


def monitor_entry(monitor: dict) -> dict:
    baseline = monitor.get("baseline") or {}
    return {
        "id": monitor.get("sleeve_id"),
        "strategy_id": monitor.get("strategy_id"),
        "strategy_name": monitor.get("strategy_name"),
        "category": "monitor_only_component",
        "evidence_system": monitor.get("evidence_system"),
        "decision": "monitor_only_not_independent_sleeve",
        "decision_name": "只做组件监控",
        "counts_toward_two_strategy_goal": False,
        "can_start_observation": False,
        "operational_status": monitor.get("operational_status"),
        "strategy_return": baseline.get("strategy_return"),
        "max_drawdown": baseline.get("max_drawdown"),
        "sharpe": baseline.get("sharpe"),
        "blocked_reasons": monitor.get("blocked_reasons", []),
        "next_action": "保留为控制器组件或备选，不作为第二个独立资金袖重复开仓。",
    }


def controlled_route_entry(route: dict) -> dict:
    return {
        "id": f"{route.get('strategy_id')}::{route.get('layer')}",
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "category": "controlled_route_candidate",
        "evidence_system": "JoinQuant",
        "decision": "route_passed_but_not_independent_sleeve",
        "decision_name": "分层路线通过但非独立资金袖",
        "counts_toward_two_strategy_goal": False,
        "can_start_observation": False,
        "operational_status": "candidate_route",
        "layer": route.get("layer"),
        "market_regime": route.get("market_regime"),
        "market_cap_bucket": route.get("market_cap_bucket"),
        "sample_dates": route.get("sample_dates"),
        "strategy_return": route.get("strategy_return"),
        "annual_return": route.get("annual_return"),
        "max_drawdown": route.get("max_drawdown"),
        "sharpe": route.get("sharpe"),
        "win_rate": route.get("win_rate"),
        "blocked_reasons": [
            "已被市场状态切换控制器吸收或仍需独立性审计，不能直接算作第二个独立成熟策略。"
        ],
        "next_action": "作为控制器组件、候选池或参数来源；不要重复计算独立资金袖数量。",
        "data_policy": route.get("data_policy"),
    }


def promoted_candidate_route_entry(route: dict, candidate: dict) -> dict:
    entry = controlled_route_entry(route)
    entry.update({
        "category": "mutually_exclusive_route_candidate",
        "decision": candidate.get("decision"),
        "decision_name": candidate.get("decision_name"),
        "blocked_reasons": candidate.get("blocked_reasons", []),
        "next_action": "补最新信号、执行配置和晋级确认；通过前不计入第二成熟策略。",
        "independence_evidence": candidate.get("independence_evidence"),
    })
    return entry


def akshare_review_gap_entry(ak_audit: dict, switch: dict, robustness: dict, reviews: list[dict]) -> dict:
    latest_signal = (switch.get("latest_signal") or {}) if switch else {}
    signal_date = latest_signal.get("signal_date", "")
    review = latest_tradeability_review(reviews, "ak_mean_reversion_quality_combo", signal_date)
    strategy_candidates = ak_audit.get("strategies", [])
    awaiting = [item for item in strategy_candidates if item.get("decision") == "awaiting_joinquant_review"]
    return {
        "id": "akshare_joinquant_review_gap",
        "strategy_id": switch.get("strategy_id") if switch else "akshare_regime_switch_contraction_mean_reversion_v1",
        "strategy_name": switch.get("strategy_name") if switch else "AkShare本地高低波动切换策略 v1",
        "category": "maturity_gap",
        "evidence_system": "AkShare local OHLCV + pending JoinQuant review",
        "decision": "needs_joinquant_tradeability_and_candidate_review",
        "decision_name": "缺聚宽准入复核",
        "counts_toward_two_strategy_goal": False,
        "can_start_observation": False,
        "local_decision": robustness.get("decision") if robustness else None,
        "local_failed_checks": robustness.get("failed_checks", []) if robustness else [],
        "awaiting_joinquant_candidate_count": len(awaiting),
        "latest_tradeability_review_imported": bool(review),
        "blocked_reasons": [
            "AkShare 本地切换策略虽通过本地稳健性审计，但最新信号未导入 JoinQuant 交易可行性复核。",
            "6 条 AkShare 本地强分层候选仍等待 JoinQuant OHLCV/valuation 批量复核。",
        ],
        "next_action": "先运行并回填最新信号交易可行性复核；再运行 AkShare 强分层候选 JoinQuant 批量复核，决定是否升级第二资金袖。",
        "data_policy": "只汇总已有本地 AkShare 与待导入 JoinQuant 证据；不生成新收益。",
    }


def build_matrix() -> dict:
    operations = read_json(OPERATIONS_PATH, {})
    jq_maturity = read_json(JQ_MATURITY_PATH, {})
    independence = read_json(JQ_INDEPENDENCE_PATH, {})
    ak_audit = read_json(AK_FACTOR_AUDIT_PATH, {})
    ak_switch = read_json(AK_SWITCH_PATH, {})
    ak_robustness = read_json(AK_ROBUSTNESS_PATH, {})
    tradeability_reviews = read_json(TRADEABILITY_REVIEWS_PATH, [])
    core_signal_reviews = read_json(CORE_SIGNAL_REVIEWS_PATH, [])
    independent_sleeve_audit = read_json(INDEPENDENT_SLEEVE_AUDIT_PATH, {})

    entries = []
    entries.extend(sleeve_entry(item) for item in operations.get("capital_sleeves", []))
    entries.extend(monitor_entry(item) for item in operations.get("monitors", []))

    sleeve_strategy_ids = {item.get("strategy_id") for item in operations.get("capital_sleeves", [])}
    monitor_strategy_ids = {item.get("strategy_id") for item in operations.get("monitors", [])}
    known_strategy_ids = sleeve_strategy_ids | monitor_strategy_ids | {"regime_switch_quality_kline_v1"}
    candidate_lookup = {
        item.get("candidate_id"): item
        for item in independent_sleeve_audit.get("candidates", [])
    }
    for route in jq_maturity.get("controlled_routes", []):
        if route.get("strategy_id") in known_strategy_ids:
            continue
        candidate_id = f"{route.get('strategy_id')}::{route.get('layer')}"
        matched_candidate = candidate_lookup.get(candidate_id)
        if matched_candidate and matched_candidate.get("decision") == "mutually_exclusive_candidate_needs_promotion":
            entries.append(promoted_candidate_route_entry(route, matched_candidate))
        else:
            entries.append(controlled_route_entry(route))

    entries.append(akshare_review_gap_entry(ak_audit, ak_switch, ak_robustness, tradeability_reviews))

    ready_goal_entries = [item for item in entries if item.get("counts_toward_two_strategy_goal")]
    blockers = []
    if len(ready_goal_entries) < TARGET_READY_STRATEGIES:
        blockers.append(
            f"独立可观察资金袖只有 {len(ready_goal_entries)} 个，目标为 {TARGET_READY_STRATEGIES} 个。"
        )
    if len(ready_goal_entries) < TARGET_READY_STRATEGIES and not tradeability_reviews and not core_signal_reviews:
        blockers.append("尚未导入任何 JoinQuant 最新信号复核 JSON。")
    for item in independent_sleeve_audit.get("blocking_summary", []):
        if "独立可观察资金袖" in item and any("独立可观察资金袖" in blocker for blocker in blockers):
            continue
        if "交易可行性复核" in item and any("交易可行性复核" in blocker for blocker in blockers):
            continue
        if item not in blockers:
            blockers.append(item)

    candidate_audit_items = independent_sleeve_audit.get("candidates", [])
    has_mutually_exclusive_candidate = any(
        item.get("decision") == "mutually_exclusive_candidate_needs_promotion"
        for item in candidate_audit_items
    )
    next_actions = []
    if has_mutually_exclusive_candidate:
        next_actions.append({
            "priority": 1,
            "action": "确认是否将核心量价趋势策略 v1 的中波动/小市值路线晋级为第二模拟观察资金袖。",
            "reason": "该路线来自 JoinQuant 真实分层交易回测，且与主控制器中波动空仓逻辑互斥；晋级前仍需最新信号和执行配置。",
        })
    next_actions.extend([
        {
            "priority": 2 if has_mutually_exclusive_candidate else 1,
            "action": "运行并回填 AkShare 最新信号 JoinQuant 交易可行性复核脚本。",
            "reason": "这是把 AkShare 本地切换策略从 record_only 升级为可观察资金袖的最近阻塞项。",
        },
        {
            "priority": 3 if has_mutually_exclusive_candidate else 2,
            "action": "运行 AkShare 强分层候选 JoinQuant 批量复核并回填 records。",
            "reason": "用于判断本地 6 条强候选能否在 JoinQuant OHLCV/valuation 口径下继续保留。",
        },
        {
            "priority": 4 if has_mutually_exclusive_candidate else 3,
            "action": "对 jq_controller 开始真实模拟观察账本记录。",
            "reason": "当前唯一已准入资金袖需要样本外观察数据，而不是继续只看历史回测。",
        },
    ])

    return {
        "source": "m_quant_strategy_maturity_matrix",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "target_ready_strategy_count": TARGET_READY_STRATEGIES,
        "ready_strategy_count": len(ready_goal_entries),
        "goal_status": "target_met" if len(ready_goal_entries) >= TARGET_READY_STRATEGIES else "not_met",
        "goal_status_name": "已满足两条成熟策略目标" if len(ready_goal_entries) >= TARGET_READY_STRATEGIES else "尚未满足两条成熟策略目标",
        "data_policy": "只读取已审计 JoinQuant 策略结果、模拟观察运行包、AkShare 本地稳健性结果和用户导入的交易复核；不生成收益、净值、成交、持仓或交易可行性结论。",
        "inputs": {
            "operations_pack": str(OPERATIONS_PATH.relative_to(ROOT)),
            "joinquant_maturity_audit": str(JQ_MATURITY_PATH.relative_to(ROOT)),
            "joinquant_independence_audit": str(JQ_INDEPENDENCE_PATH.relative_to(ROOT)),
            "akshare_factor_quality_audit": str(AK_FACTOR_AUDIT_PATH.relative_to(ROOT)),
            "akshare_switch_strategy": str(AK_SWITCH_PATH.relative_to(ROOT)),
            "akshare_robustness_audit": str(AK_ROBUSTNESS_PATH.relative_to(ROOT)),
            "tradeability_reviews": str(TRADEABILITY_REVIEWS_PATH.relative_to(ROOT)),
            "core_medium_small_signal_reviews": str(CORE_SIGNAL_REVIEWS_PATH.relative_to(ROOT)),
            "independent_sleeve_candidate_audit": str(INDEPENDENT_SLEEVE_AUDIT_PATH.relative_to(ROOT)),
        },
        "evidence_summary": {
            "joinquant_strategy_count": jq_maturity.get("strategy_count"),
            "joinquant_controlled_route_count": jq_maturity.get("controlled_route_count"),
            "joinquant_independent_capital_sleeves": independence.get("independent_capital_sleeves"),
            "eligible_independent_sleeve_count": independent_sleeve_audit.get("eligible_independent_sleeve_count"),
            "blocked_independent_sleeve_candidate_count": independent_sleeve_audit.get("blocked_candidate_count"),
            "operations_ready_sleeve_count": operations.get("ready_sleeve_count"),
            "operations_blocked_sleeve_count": operations.get("blocked_sleeve_count"),
            "akshare_awaiting_joinquant_candidate_count": len([
                item for item in ak_audit.get("strategies", [])
                if item.get("decision") == "awaiting_joinquant_review"
            ]),
            "tradeability_review_count": len(tradeability_reviews),
            "core_medium_small_signal_review_count": len(core_signal_reviews),
        },
        "blockers": blockers,
        "entries": entries,
        "independent_sleeve_candidate_audit": {
            "source": independent_sleeve_audit.get("source"),
            "goal_status": independent_sleeve_audit.get("goal_status"),
            "eligible_independent_sleeve_count": independent_sleeve_audit.get("eligible_independent_sleeve_count"),
            "blocked_candidate_count": independent_sleeve_audit.get("blocked_candidate_count"),
            "candidates": independent_sleeve_audit.get("candidates", []),
            "data_policy": independent_sleeve_audit.get("data_policy"),
        },
        "next_actions": next_actions,
    }


def write_doc(matrix: dict) -> None:
    lines = [
        "# 成熟策略推进矩阵",
        "",
        f"- 生成时间：{matrix['generated_at']}",
        f"- 目标：至少 {matrix['target_ready_strategy_count']} 条完整回测且可进入模拟观察的策略。",
        f"- 当前：{matrix['ready_strategy_count']} 条。",
        f"- 状态：`{matrix['goal_status']}` / {matrix['goal_status_name']}",
        f"- 数据原则：{matrix['data_policy']}",
        "",
        "## 阻塞项",
        "",
    ]
    if matrix["blockers"]:
        lines.extend(f"- {item}" for item in matrix["blockers"])
    else:
        lines.append("- 无硬阻塞。")

    lines.extend([
        "",
        "## 策略矩阵",
        "",
        "| 项目 | 类型 | 决策 | 计入目标 | 收益 | 回撤 | Sharpe | 下一步 |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
    ])
    for item in matrix["entries"]:
        lines.append(
            f"| {item.get('strategy_name') or item.get('id')} | {item.get('category')} | "
            f"{item.get('decision_name')} | {'是' if item.get('counts_toward_two_strategy_goal') else '否'} | "
            f"{pct(item.get('strategy_return'))} | {pct(item.get('max_drawdown'))} | "
            f"{number(item.get('sharpe'))} | {item.get('next_action') or ''} |"
        )

    candidate_audit = matrix.get("independent_sleeve_candidate_audit") or {}
    candidates = candidate_audit.get("candidates") or []
    lines.extend([
        "",
        "## 独立资金袖候选",
        "",
        f"- 准入：{candidate_audit.get('eligible_independent_sleeve_count', 0)}",
        f"- 阻塞候选：{candidate_audit.get('blocked_candidate_count', 0)}",
        "",
        "| 候选 | 决策 | 计入目标 | 缺口 |",
        "| --- | --- | --- | --- |",
    ])
    for item in candidates:
        gap = "；".join(item.get("blocked_reasons") or item.get("required_next_evidence") or [])
        lines.append(
            f"| {item.get('strategy_name') or item.get('candidate_id')} | {item.get('decision_name')} | "
            f"{'是' if item.get('counts_as_independent_sleeve') else '否'} | {gap} |"
        )

    lines.extend([
        "",
        "## 下一步",
        "",
    ])
    for action in matrix["next_actions"]:
        lines.append(f"{action['priority']}. {action['action']} {action['reason']}")

    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    matrix = build_matrix()
    RESULT_PATH.write_text(json.dumps(matrix, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(matrix)
    print(json.dumps({
        "source": matrix["source"],
        "goal_status": matrix["goal_status"],
        "ready_strategy_count": matrix["ready_strategy_count"],
        "target_ready_strategy_count": matrix["target_ready_strategy_count"],
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
