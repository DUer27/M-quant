#!/usr/bin/env python3
"""Audit candidates for the second independent paper-watch sleeve.

This script is deliberately evidence-only. It reads existing JoinQuant and
AkShare audit outputs and classifies candidates by independence, overlap, and
missing evidence. It does not create returns, fills, positions, or NAV.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULTS_DIR = ROOT / "outputs" / "paper-watch" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

OPERATIONS_PATH = RESULTS_DIR / "paper_watch_operations_pack_20260709.json"
JQ_INDEPENDENCE_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_independence_audit_20260709.json"
JQ_MATURITY_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "strategy_maturity_audit_20260709.json"
AK_FACTOR_AUDIT_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_factor_quality_audit.json"
TRADEABILITY_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-tradeability-reviews.json"

RESULT_PATH = RESULTS_DIR / "independent_sleeve_candidate_audit_20260710.json"
DOC_PATH = DOCS_DIR / "independent-sleeve-candidate-audit-20260710.md"


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value) -> str:
    if value is None:
        return "NA"
    return f"{float(value) * 100:.2f}%"


def metric_block(source: dict) -> dict:
    baseline = source.get("baseline") or source
    return {
        "sample_dates": baseline.get("sample_dates") or baseline.get("sample_trades"),
        "strategy_return": baseline.get("strategy_return"),
        "annual_return": baseline.get("annual_return") or baseline.get("strategy_annual_return"),
        "max_drawdown": baseline.get("max_drawdown"),
        "sharpe": baseline.get("sharpe"),
        "win_rate": baseline.get("win_rate") or baseline.get("daily_win_rate") or baseline.get("positive_trade_ratio"),
    }


def decision_name(decision: str) -> str:
    names = {
        "eligible_primary_sleeve": "已准入独立资金袖",
        "blocked_pending_tradeability": "待交易可行性复核",
        "monitor_only_component_overlap": "组件重叠，仅监控",
        "route_candidate_needs_independence_review": "路线候选，需独立性复核",
        "rejected_or_rework": "暂缓或重做",
    }
    return names.get(decision, decision)


def build_candidates() -> dict:
    operations = read_json(OPERATIONS_PATH, {})
    independence = read_json(JQ_INDEPENDENCE_PATH, {})
    maturity = read_json(JQ_MATURITY_PATH, {})
    ak_audit = read_json(AK_FACTOR_AUDIT_PATH, {})
    reviews = read_json(TRADEABILITY_REVIEWS_PATH, [])

    candidates: list[dict] = []
    used_keys: set[str] = set()

    for sleeve in operations.get("capital_sleeves", []):
        can_start = bool(sleeve.get("can_start_observation"))
        review = sleeve.get("tradeability_review") or {}
        decision = "eligible_primary_sleeve" if can_start else "blocked_pending_tradeability"
        if sleeve.get("sleeve_id") == "akshare_local_switch" and review.get("decision") != "tradeability_review_passed":
            decision = "blocked_pending_tradeability"
        item = {
            "candidate_id": sleeve.get("sleeve_id"),
            "strategy_id": sleeve.get("strategy_id"),
            "strategy_name": sleeve.get("strategy_name"),
            "evidence_system": sleeve.get("evidence_system"),
            "role": sleeve.get("role"),
            "decision": decision,
            "decision_name": decision_name(decision),
            "counts_as_independent_sleeve": can_start,
            "can_start_observation": can_start,
            "metrics": metric_block(sleeve),
            "blocked_reasons": sleeve.get("blocked_reasons", []),
            "required_next_evidence": [] if can_start else [
                "导入通过严格校验的 JoinQuant 最新信号交易可行性复核 JSON。"
            ],
            "data_policy": sleeve.get("data_policy"),
        }
        candidates.append(item)
        used_keys.add(str(sleeve.get("strategy_id")))

    for monitor in operations.get("monitors", []):
        item = {
            "candidate_id": monitor.get("sleeve_id"),
            "strategy_id": monitor.get("strategy_id"),
            "strategy_name": monitor.get("strategy_name"),
            "evidence_system": monitor.get("evidence_system"),
            "role": "component_monitor",
            "decision": "monitor_only_component_overlap",
            "decision_name": decision_name("monitor_only_component_overlap"),
            "counts_as_independent_sleeve": False,
            "can_start_observation": False,
            "metrics": metric_block(monitor),
            "blocked_reasons": monitor.get("blocked_reasons", []),
            "required_next_evidence": [
                "如要独立开仓，必须证明与切换控制器不共享同一市场状态组件或采用互斥仓位控制。"
            ],
            "data_policy": independence.get("data_policy"),
        }
        candidates.append(item)
        used_keys.add(str(monitor.get("strategy_id")))

    for route in maturity.get("controlled_routes", []):
        strategy_id = str(route.get("strategy_id"))
        if strategy_id in used_keys or strategy_id == "regime_switch_quality_kline_v1":
            continue
        candidates.append({
            "candidate_id": f"{route.get('strategy_id')}::{route.get('layer')}",
            "strategy_id": route.get("strategy_id"),
            "strategy_name": route.get("strategy_name"),
            "evidence_system": "JoinQuant",
            "role": "controlled_route_candidate",
            "layer": route.get("layer"),
            "market_regime": route.get("market_regime"),
            "market_cap_bucket": route.get("market_cap_bucket"),
            "decision": "route_candidate_needs_independence_review",
            "decision_name": decision_name("route_candidate_needs_independence_review"),
            "counts_as_independent_sleeve": False,
            "can_start_observation": False,
            "metrics": metric_block(route),
            "blocked_reasons": [
                "该路线通过分层硬门槛，但当前未被证明能作为独立资金袖与主控制器并行。"
            ],
            "required_next_evidence": [
                "补充与主控制器的组件重叠、日期重叠、持仓重叠和市场状态互斥检查。",
                "若重叠明显，只能作为组件或备选，不计入第二成熟策略。"
            ],
            "data_policy": route.get("data_policy"),
        })

    awaiting_akshare = [
        item for item in ak_audit.get("strategies", [])
        if item.get("decision") == "awaiting_joinquant_review"
    ]
    for item in awaiting_akshare:
        candidates.append({
            "candidate_id": f"akshare_candidate::{item.get('strategy_id')}",
            "strategy_id": item.get("strategy_id"),
            "strategy_name": item.get("strategy_name"),
            "evidence_system": "AkShare local OHLCV + pending JoinQuant",
            "role": "local_candidate_waiting_external_review",
            "decision": "blocked_pending_tradeability",
            "decision_name": decision_name("blocked_pending_tradeability"),
            "counts_as_independent_sleeve": False,
            "can_start_observation": False,
            "metrics": metric_block(item),
            "blocked_reasons": [
                "本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。"
            ],
            "required_next_evidence": [
                "运行 AkShare 强分层候选 JoinQuant 批量复核脚本并导入真实 records。"
            ],
            "data_policy": ak_audit.get("data_policy"),
        })

    eligible = [item for item in candidates if item.get("counts_as_independent_sleeve")]
    blocked = [item for item in candidates if not item.get("counts_as_independent_sleeve")]
    blocking_summary = []
    if len(eligible) < 2:
        blocking_summary.append(f"当前独立可观察资金袖为 {len(eligible)} 个，距离目标 2 个还差 {2 - len(eligible)} 个。")
    if not reviews:
        blocking_summary.append("尚未导入任何 JoinQuant 交易可行性复核 JSON。")

    return {
        "source": "m_quant_independent_sleeve_candidate_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "只读取已审计 JoinQuant、AkShare 与用户导入复核文件；不生成收益、净值、成交、持仓或交易可行性结论。",
        "target_independent_sleeves": 2,
        "eligible_independent_sleeve_count": len(eligible),
        "blocked_candidate_count": len(blocked),
        "goal_status": "target_met" if len(eligible) >= 2 else "not_met",
        "blocking_summary": blocking_summary,
        "candidates": candidates,
    }


def write_doc(pack: dict) -> None:
    lines = [
        "# 独立资金袖候选审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 目标独立资金袖：{pack['target_independent_sleeves']}",
        f"- 当前准入：{pack['eligible_independent_sleeve_count']}",
        f"- 状态：`{pack['goal_status']}`",
        "",
        "## 阻塞摘要",
        "",
    ]
    if pack["blocking_summary"]:
        lines.extend(f"- {item}" for item in pack["blocking_summary"])
    else:
        lines.append("- 无硬阻塞。")
    lines.extend([
        "",
        "## 候选明细",
        "",
        "| 候选 | 决策 | 计入目标 | 收益 | 回撤 | Sharpe | 缺口 |",
        "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ])
    for item in pack["candidates"]:
        metrics = item.get("metrics", {})
        gaps = "；".join(item.get("blocked_reasons") or item.get("required_next_evidence") or [])
        lines.append(
            f"| {item.get('strategy_name') or item.get('candidate_id')} | {item.get('decision_name')} | "
            f"{'是' if item.get('counts_as_independent_sleeve') else '否'} | "
            f"{pct(metrics.get('strategy_return'))} | {pct(metrics.get('max_drawdown'))} | "
            f"{metrics.get('sharpe', 'NA')} | {gaps} |"
        )
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pack = build_candidates()
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "goal_status": pack["goal_status"],
        "eligible_independent_sleeve_count": pack["eligible_independent_sleeve_count"],
        "blocked_candidate_count": pack["blocked_candidate_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
