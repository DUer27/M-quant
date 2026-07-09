#!/usr/bin/env python3
"""Build the controlled paper-watch operations pack.

The pack turns audited strategy evidence into an execution checklist and ledger
template. It does not create paper-trading returns, positions, fills, or NAV.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = ROOT / "outputs" / "paper-watch"
RESULTS_DIR = OUTPUT_DIR / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

JQ_INDEPENDENCE_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_independence_audit_20260709.json"
JQ_EXECUTION_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "paper_watch_execution_pack_20260709.json"
AK_SWITCH_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_regime_switch_paper_watch_strategy_20260709.json"
AK_ROBUSTNESS_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_regime_switch_robustness_audit_20260709.json"
AK_LATEST_SIGNAL_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_paper_watch_latest_signal_20260709.json"
TRADEABILITY_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-tradeability-reviews.json"
JQ_MATURITY_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "strategy_maturity_audit_20260709.json"
CORE_SIGNAL_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-core-medium-small-signal-reviews.json"

RESULT_PATH = RESULTS_DIR / "paper_watch_operations_pack_20260709.json"
DOC_PATH = DOCS_DIR / "paper-watch-operations-pack-20260709.md"

CORE_SLEEVE_ID = "jq_medium_vol_small_cap_core"
CORE_STRATEGY_ID = "core_volume_price_trend_v1"


def load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value) -> str:
    if value is None:
        return "NA"
    return f"{float(value) * 100:.2f}%"


def latest_tradeability_review(reviews: list[dict], strategy_id: str, signal_date: str) -> dict | None:
    matches = [
        item for item in reviews
        if item.get("strategy_id") == strategy_id and item.get("signal_date") == signal_date
    ]
    return sorted(matches, key=lambda item: item.get("importedAt", ""), reverse=True)[0] if matches else None


def latest_core_signal_review(reviews: list[dict]) -> dict | None:
    matches = [
        item for item in reviews
        if item.get("strategy_id") == CORE_STRATEGY_ID and item.get("sleeve_id") == CORE_SLEEVE_ID
    ]
    return sorted(matches, key=lambda item: item.get("importedAt", ""), reverse=True)[0] if matches else None


def core_medium_small_baseline(maturity: dict) -> dict | None:
    return next(
        (
            route for route in maturity.get("controlled_routes", [])
            if route.get("strategy_id") == CORE_STRATEGY_ID
            and route.get("market_regime") == "medium_volatility"
            and route.get("market_cap_bucket") == "small_cap"
        ),
        None,
    )


def jq_controller_route(independence: dict, execution_pack: dict) -> dict:
    routes = independence.get("routes") or []
    controller = next((route for route in routes if route.get("strategy_id") == "regime_switch_quality_kline_v1"), None)
    execution = next(
        (route for route in execution_pack.get("routes", []) if route.get("strategy_id") == "regime_switch_quality_kline_v1"),
        {},
    )
    if not controller:
        return {
            "sleeve_id": "jq_controller",
            "strategy_id": "regime_switch_quality_kline_v1",
            "strategy_name": "市场状态切换策略 v1",
            "evidence_system": "JoinQuant",
            "operational_status": "missing_evidence",
            "can_start_observation": False,
            "blocked_reasons": ["缺少 JoinQuant 独立性审计中的控制器路线。"],
        }
    return {
        "sleeve_id": "jq_controller",
        "strategy_id": controller.get("strategy_id"),
        "strategy_name": controller.get("strategy_name"),
        "evidence_system": "JoinQuant derived real curves",
        "operational_status": "ready_for_controlled_paper_watch",
        "can_start_observation": True,
        "blocked_reasons": [],
        "role": "primary_controller",
        "scope": "高低波动切换；中波动默认空仓/观察。",
        "baseline": {
            "sample_dates": controller.get("sample_dates"),
            "strategy_return": controller.get("strategy_return"),
            "max_drawdown": controller.get("max_drawdown"),
            "sharpe": controller.get("sharpe"),
            "win_rate": controller.get("win_rate"),
            "avg_selected_count": controller.get("avg_selected_count"),
        },
        "entry_gate": execution.get("entry_gate", []),
        "pause_rules": execution.get("pause_rules", []),
        "data_policy": controller.get("data_policy") or independence.get("data_policy"),
    }


def jq_component_monitor(independence: dict) -> dict | None:
    route = next(
        (item for item in independence.get("routes", []) if item.get("strategy_id") == "jq_quality_profit_liquidity_v1"),
        None,
    )
    if not route:
        return None
    return {
        "sleeve_id": "jq_component_monitor",
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "evidence_system": "JoinQuant",
        "operational_status": "monitor_only_due_component_overlap",
        "can_start_observation": False,
        "blocked_reasons": ["与市场状态切换策略共享高波动组件，不能作为独立资金袖重复满仓。"],
        "baseline": {
            "strategy_return": route.get("strategy_return"),
            "max_drawdown": route.get("max_drawdown"),
            "sharpe": route.get("sharpe"),
        },
    }


def akshare_switch_route(switch: dict, robustness: dict, latest_signal: dict, reviews: list[dict]) -> dict:
    signal_date = latest_signal.get("signal_date", "")
    triggered = next(
        (route for route in latest_signal.get("routes", []) if route.get("action") == "paper_watch_open_allowed"),
        None,
    )
    review = latest_tradeability_review(reviews, "ak_mean_reversion_quality_combo", signal_date)
    review_passed = bool(review and review.get("decision") == "tradeability_review_passed")
    status = "ready_local_switch_pending_tradeability_review"
    blocked = ["最新高波动触发信号尚未导入 JoinQuant 交易可行性复核 JSON。"]
    if review_passed:
        status = "ready_for_controlled_paper_watch"
        blocked = []
    return {
        "sleeve_id": "akshare_local_switch",
        "strategy_id": switch.get("strategy_id"),
        "strategy_name": switch.get("strategy_name"),
        "evidence_system": "AkShare local OHLCV",
        "operational_status": status,
        "can_start_observation": review_passed,
        "blocked_reasons": blocked,
        "role": "local_independent_candidate",
        "scope": switch.get("paper_scope"),
        "baseline": switch.get("baseline", {}),
        "robustness": {
            "decision": robustness.get("decision"),
            "failed_checks": robustness.get("failed_checks", []),
            "summary": robustness.get("summary", {}),
        },
        "latest_signal": {
            "signal_date": signal_date,
            "triggered_component_strategy_id": triggered.get("strategy_id") if triggered else None,
            "triggered_component_name": triggered.get("strategy_name") if triggered else None,
            "action": triggered.get("action") if triggered else "record_only",
            "candidate_count": triggered.get("candidate_count", 0) if triggered else 0,
            "selected_count": triggered.get("selected_count", 0) if triggered else 0,
            "selected_codes": [item.get("code") for item in (triggered.get("selected", []) if triggered else [])],
        },
        "tradeability_review": review,
        "data_policy": switch.get("data_policy"),
    }


def core_medium_small_route(maturity: dict, reviews: list[dict]) -> dict | None:
    baseline = core_medium_small_baseline(maturity)
    review = latest_core_signal_review(reviews)
    if not baseline or not review:
        return None

    review_ready = (
        review.get("decision") == "promotion_signal_ready"
        and review.get("market_regime") == "medium_volatility"
        and review.get("target_market_regime") == "medium_volatility"
        and review.get("target_market_cap_bucket") == "small_cap"
        and int(review.get("selected_count") or 0) >= 10
    )
    blocked = [] if review_ready else [
        "已导入核心量价中波动/小市值最新信号复核，但未达到 promotion_signal_ready 门槛。",
    ]
    latest_records = review.get("records") if isinstance(review.get("records"), list) else []
    return {
        "sleeve_id": CORE_SLEEVE_ID,
        "strategy_id": CORE_STRATEGY_ID,
        "strategy_name": baseline.get("strategy_name") or "核心量价趋势策略 v1",
        "evidence_system": "JoinQuant historical route + imported latest signal review",
        "operational_status": "ready_for_controlled_paper_watch" if review_ready else "blocked_by_latest_signal_review",
        "can_start_observation": review_ready,
        "blocked_reasons": blocked,
        "role": "mutually_exclusive_medium_volatility_small_cap_sleeve",
        "scope": "仅限 medium_volatility / small_cap；与主控制器中波动空仓逻辑互斥，不可扩展到其他分层。",
        "baseline": {
            "sample_dates": baseline.get("sample_dates"),
            "strategy_return": baseline.get("strategy_return"),
            "annual_return": baseline.get("annual_return"),
            "max_drawdown": baseline.get("max_drawdown"),
            "sharpe": baseline.get("sharpe"),
            "win_rate": baseline.get("win_rate"),
        },
        "entry_gate": [
            "market_regime 必须为 medium_volatility。",
            "market_cap_bucket 必须为 small_cap。",
            "最新 JoinQuant 复核 decision 必须为 promotion_signal_ready。",
            "selected_count 必须不少于 10。",
            "若主控制器同时发出高/低波动信号，本资金袖不得开仓。",
        ],
        "pause_rules": [
            "最新复核不是 promotion_signal_ready 时，paper_action 只能 record_only。",
            "selected_count 低于 10 时暂停新开仓。",
            "市场状态离开 medium_volatility 时暂停新开仓并进入退出观察。",
        ],
        "latest_signal": {
            "signal_date": review.get("signal_date"),
            "market_regime": review.get("market_regime"),
            "target_market_regime": review.get("target_market_regime"),
            "target_market_cap_bucket": review.get("target_market_cap_bucket"),
            "action": "paper_watch_open_allowed" if review_ready else "record_only",
            "candidate_count": review.get("target_candidate_count"),
            "selected_count": review.get("selected_count"),
            "selected_codes": [item.get("code") for item in latest_records],
        },
        "latest_signal_review": review,
        "data_policy": baseline.get("data_policy"),
    }


def ledger_template() -> list[dict]:
    fields = [
        ("date", "观察日期，YYYY-MM-DD。"),
        ("sleeve_id", "资金袖：jq_controller / jq_medium_vol_small_cap_core / akshare_local_switch。"),
        ("strategy_id", "策略ID。"),
        ("signal_state", "ready / blocked / record_only / paused。"),
        ("gate_status", "准入门槛状态，必须来自运行包。"),
        ("candidate_count", "当期候选数量。"),
        ("selected_count", "当期入选数量。"),
        ("selected_codes", "入选股票代码列表。"),
        ("paper_action", "open_allowed / record_only / pause_new_entry / close_only。"),
        ("planned_weight", "计划观察仓位；未复核通过时必须为 0。"),
        ("paper_nav", "模拟观察净值；由后续真实记录填写，本包不生成。"),
        ("period_return", "观察期收益；由后续真实记录填写，本包不生成。"),
        ("benchmark_return", "基准收益；由后续真实记录填写。"),
        ("rolling_drawdown", "模拟观察滚动回撤。"),
        ("turnover", "换手率或估算换手。"),
        ("slippage", "滑点记录。"),
        ("industry_top_exposure", "第一大行业暴露。"),
        ("market_cap_exposure", "市值暴露。"),
        ("blocked_reason", "若不可开仓，记录阻塞原因。"),
        ("notes", "人工备注。"),
    ]
    return [{"field": name, "meaning": meaning} for name, meaning in fields]


def initial_ledger_rows(routes: list[dict]) -> list[dict]:
    rows = []
    for route in routes:
        latest = route.get("latest_signal") or {}
        can_start = bool(route.get("can_start_observation"))
        rows.append({
            "date": latest.get("signal_date") or "2026-07-09",
            "sleeve_id": route.get("sleeve_id"),
            "strategy_id": route.get("strategy_id"),
            "signal_state": "ready" if can_start else "blocked" if route.get("blocked_reasons") else "record_only",
            "gate_status": route.get("operational_status"),
            "candidate_count": latest.get("candidate_count", None),
            "selected_count": latest.get("selected_count", None),
            "selected_codes": latest.get("selected_codes", []),
            "paper_action": "open_allowed" if can_start else "record_only",
            "planned_weight": 1.0 if can_start and route.get("sleeve_id") == "jq_controller" else 0.0,
            "paper_nav": None,
            "period_return": None,
            "benchmark_return": None,
            "rolling_drawdown": None,
            "turnover": None,
            "slippage": None,
            "industry_top_exposure": None,
            "market_cap_exposure": None,
            "blocked_reason": "; ".join(route.get("blocked_reasons", [])),
            "notes": "运行包初始行；不含任何生成的模拟收益。",
        })
    return rows


def write_doc(pack: dict) -> None:
    lines = [
        "# 模拟观察运行包",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 状态：`{pack['status']}`",
        f"- 数据原则：{pack['data_policy']}",
        f"- 可观察资金袖：{pack['ready_sleeve_count']} / {pack['sleeve_count']}",
        "",
        "## 资金袖",
        "",
    ]
    for route in pack["capital_sleeves"]:
        baseline = route.get("baseline") or {}
        lines.extend([
            f"### {route['strategy_name']}",
            "",
            f"- 资金袖：`{route['sleeve_id']}`",
            f"- 证据源：{route['evidence_system']}",
            f"- 状态：`{route['operational_status']}`",
            f"- 可开始观察：{route['can_start_observation']}",
            f"- 收益证据：{pct(baseline.get('strategy_return'))}",
            f"- 回撤证据：{pct(baseline.get('max_drawdown'))}",
            f"- Sharpe：{baseline.get('sharpe', 'NA')}",
        ])
        if route.get("blocked_reasons"):
            lines.append(f"- 阻塞：{'；'.join(route['blocked_reasons'])}")
        lines.append("")
    lines.extend(["## 每日账本字段", ""])
    for item in pack["daily_ledger_template"]:
        lines.append(f"- `{item['field']}`：{item['meaning']}")
    lines.extend([
        "",
        "## 边界",
        "",
        "- 本运行包不生成任何纸面收益、净值、成交或持仓。",
        "- AkShare 本地路线必须等 JoinQuant 交易可行性复核通过后，才允许 planned_weight 大于 0。",
        "- JoinQuant 组件监控路线不作为独立资金袖重复开仓。",
        "",
    ])
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    independence = load_json(JQ_INDEPENDENCE_PATH, {})
    jq_execution = load_json(JQ_EXECUTION_PATH, {})
    ak_switch = load_json(AK_SWITCH_PATH, {})
    ak_robustness = load_json(AK_ROBUSTNESS_PATH, {})
    ak_signal = load_json(AK_LATEST_SIGNAL_PATH, {})
    reviews = load_json(TRADEABILITY_REVIEWS_PATH, [])
    maturity = load_json(JQ_MATURITY_PATH, {})
    core_signal_reviews = load_json(CORE_SIGNAL_REVIEWS_PATH, [])
    core_route = core_medium_small_route(maturity, core_signal_reviews)

    capital_sleeves = [
        jq_controller_route(independence, jq_execution),
        akshare_switch_route(ak_switch, ak_robustness, ak_signal, reviews),
    ]
    if core_route:
        capital_sleeves.insert(1, core_route)
    monitors = [item for item in [jq_component_monitor(independence)] if item]
    ready_count = sum(1 for item in capital_sleeves if item.get("can_start_observation"))
    pack = {
        "source": "m_quant_paper_watch_operations_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": "ready_with_blockers" if ready_count else "not_ready",
        "data_policy": "只读取已审计 JoinQuant 曲线、AkShare 本地 OHLCV 策略与已导入交易复核；不生成收益、净值、成交或持仓。",
        "sleeve_count": len(capital_sleeves),
        "ready_sleeve_count": ready_count,
        "blocked_sleeve_count": len(capital_sleeves) - ready_count,
        "capital_sleeves": capital_sleeves,
        "monitors": monitors,
        "daily_ledger_template": ledger_template(),
        "initial_ledger_rows": initial_ledger_rows(capital_sleeves),
        "global_rules": [
            "每个 sleeve_id 独立记录，不得把组件监控路线当作第二资金袖。",
            "planned_weight 只能在 can_start_observation=true 时大于 0。",
            "AkShare 本地信号缺 JoinQuant 交易复核时只能 record_only。",
            "核心量价中波动小市值资金袖只有在 JoinQuant 最新信号复核 ready 后才允许 planned_weight 大于 0。",
            "任何暂停规则触发后，paper_action 只能是 pause_new_entry 或 close_only。",
        ],
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "output": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "status": pack["status"],
        "ready_sleeve_count": pack["ready_sleeve_count"],
        "blocked_sleeve_count": pack["blocked_sleeve_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
