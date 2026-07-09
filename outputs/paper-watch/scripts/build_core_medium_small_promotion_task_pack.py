#!/usr/bin/env python3
"""Build the promotion task pack for the core medium-vol/small-cap sleeve.

The pack tells the user how to run the JoinQuant latest-signal review. It does
not import review results or promote the sleeve.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULTS_DIR = ROOT / "outputs" / "paper-watch" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

CANDIDATE_AUDIT_PATH = RESULTS_DIR / "independent_sleeve_candidate_audit_20260710.json"
SCRIPT_PATH = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "m_quant_core_medium_small_latest_signal_review_20260710.py"
IMPORTED_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-core-medium-small-signal-reviews.json"
OPERATIONS_PATH = RESULTS_DIR / "paper_watch_operations_pack_20260709.json"
RESULT_PATH = RESULTS_DIR / "core_medium_small_promotion_task_pack_20260710.json"
DOC_PATH = DOCS_DIR / "core-medium-small-promotion-task-pack-20260710.md"

STRATEGY_ID = "core_volume_price_trend_v1"
SLEEVE_ID = "jq_medium_vol_small_cap_core"


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value) -> str:
    if value is None:
        return "NA"
    return f"{float(value) * 100:.2f}%"


def build_pack() -> dict:
    audit = read_json(CANDIDATE_AUDIT_PATH, {})
    imported_reviews = read_json(IMPORTED_REVIEWS_PATH, [])
    operations = read_json(OPERATIONS_PATH, {})
    candidate = next(
        (item for item in audit.get("candidates", []) if item.get("strategy_id") == STRATEGY_ID),
        {},
    )
    matching_reviews = [
        item for item in imported_reviews
        if item.get("strategy_id") == STRATEGY_ID and item.get("sleeve_id") == SLEEVE_ID
    ]
    latest_review = sorted(matching_reviews, key=lambda item: item.get("importedAt", ""), reverse=True)[0] if matching_reviews else None
    promoted_sleeve = next(
        (
            item for item in operations.get("capital_sleeves", [])
            if item.get("sleeve_id") == SLEEVE_ID and item.get("can_start_observation")
        ),
        None,
    )
    if promoted_sleeve:
        status = "promoted_to_operations_pack"
    elif latest_review and latest_review.get("decision") == "promotion_signal_ready":
        status = "signal_ready_imported_waiting_for_operations_pack_promotion"
    elif latest_review:
        status = "signal_not_ready_imported"
    else:
        status = "waiting_for_joinquant_latest_signal_review"
    metrics = candidate.get("metrics", {})
    return {
        "source": "m_quant_core_medium_small_promotion_task_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": status,
        "data_policy": "只生成 JoinQuant 最新信号复核任务；不生成收益、净值、成交、持仓、交易可行性或模拟盘结果。",
        "imported_review_count": len(matching_reviews),
        "latest_review": latest_review,
        "target": {
            "sleeve_id": SLEEVE_ID,
            "strategy_id": STRATEGY_ID,
            "strategy_name": candidate.get("strategy_name") or "核心量价趋势策略 v1",
            "layer": candidate.get("layer") or "中波动/小市值",
            "market_regime": "medium_volatility",
            "market_cap_bucket": "small_cap",
            "current_decision": candidate.get("decision"),
            "current_decision_name": candidate.get("decision_name"),
            "counts_as_independent_sleeve": False,
            "baseline": metrics,
            "independence_evidence": candidate.get("independence_evidence"),
        },
        "pass_gate": {
            "required_source": "joinquant_core_medium_small_latest_signal_review",
            "required_decision": "promotion_signal_ready",
            "required_market_regime": "medium_volatility",
            "required_market_cap_bucket": "small_cap",
            "min_selected_count": 10,
            "after_pass_next_action": "再写入模拟观察运行包；写入前仍不计入 2/2 成熟策略目标。",
        },
        "operations_pack_promotion": {
            "promoted": bool(promoted_sleeve),
            "sleeve_id": promoted_sleeve.get("sleeve_id") if promoted_sleeve else None,
            "can_start_observation": promoted_sleeve.get("can_start_observation") if promoted_sleeve else False,
            "operational_status": promoted_sleeve.get("operational_status") if promoted_sleeve else None,
        },
        "joinquant_script": {
            "path": str(SCRIPT_PATH.relative_to(ROOT)),
            "download_endpoint": "/strategy-api/joinquant-core-medium-small-latest-signal-review.py",
            "expected_source": "joinquant_core_medium_small_latest_signal_review",
        },
        "import": {
            "validate_endpoint": "/backtest-api/validate-core-medium-small-signal-review",
            "import_endpoint": "/backtest-api/import-results",
            "storage": str(IMPORTED_REVIEWS_PATH.relative_to(ROOT)),
            "after_import_expected_effect": "平台会把复核结果写入 imported-core-medium-small-signal-reviews.json；即使 signal_ready，通过前仍需下一步写入运行包。",
        },
        "steps": [
            "在 M-quant 页面下载核心量价中波动小市值最新信号复核脚本。",
            "粘贴到 JoinQuant Python3 研究环境运行。",
            "确认输出 JSON 的 source、strategy_id、sleeve_id、market_regime、selected_count 和 records。",
            "只有 decision=promotion_signal_ready 且 selected_count>=10 时，才进入运行包晋级步骤。",
            "晋级前仍不得把该路线计入两条成熟策略目标。",
        ],
    }


def write_doc(pack: dict) -> None:
    target = pack["target"]
    baseline = target.get("baseline") or {}
    lines = [
        "# 核心量价中波动小市值晋级任务包",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 状态：`{pack['status']}`",
        f"- 数据原则：{pack['data_policy']}",
        f"- 已导入复核：{pack['imported_review_count']}",
        "",
        "## 目标候选",
        "",
        f"- 资金袖：`{target['sleeve_id']}`",
        f"- 策略：{target['strategy_name']}",
        f"- 分层：{target['layer']}",
        f"- 当前决策：{target.get('current_decision_name')}",
        f"- 历史收益：{pct(baseline.get('strategy_return'))}",
        f"- 历史回撤：{pct(baseline.get('max_drawdown'))}",
        f"- Sharpe：{baseline.get('sharpe', 'NA')}",
        "",
        "## 通过门槛",
        "",
    ]
    gate = pack["pass_gate"]
    for key, value in gate.items():
        lines.append(f"- `{key}`：{value}")
    if pack.get("latest_review"):
        review = pack["latest_review"]
        lines.extend([
            "",
            "## 最新导入复核",
            "",
            f"- 日期：{review.get('signal_date')}",
            f"- 结论：`{review.get('decision')}`",
            f"- 市场状态：{review.get('market_regime')}",
            f"- 入选数量：{review.get('selected_count')}",
        ])
    lines.extend(["", "## 步骤", ""])
    for index, step in enumerate(pack["steps"], 1):
        lines.append(f"{index}. {step}")
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pack = build_pack()
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "source": pack["source"],
        "status": pack["status"],
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "script": pack["joinquant_script"]["path"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
