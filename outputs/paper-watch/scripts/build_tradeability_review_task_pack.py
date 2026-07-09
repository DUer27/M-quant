#!/usr/bin/env python3
"""Build a JoinQuant tradeability review task pack for the latest AkShare signal.

The task pack is an execution checklist. It does not call JoinQuant, does not
create tradeability results, and does not unlock any paper-watch sleeve.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULTS_DIR = ROOT / "outputs" / "paper-watch" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"

LATEST_SIGNAL_PATH = ROOT / "outputs" / "sources" / "akshare" / "results" / "akshare_paper_watch_latest_signal_20260709.json"
OPERATIONS_PATH = RESULTS_DIR / "paper_watch_operations_pack_20260709.json"
MATRIX_PATH = RESULTS_DIR / "strategy_maturity_matrix_20260710.json"
TRADEABILITY_REVIEWS_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-tradeability-reviews.json"
JQ_SCRIPT_PATH = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "m_quant_akshare_latest_signal_tradeability_review_20260709.py"

RESULT_PATH = RESULTS_DIR / "tradeability_review_task_pack_20260710.json"
DOC_PATH = DOCS_DIR / "tradeability-review-task-pack-20260710.md"


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def latest_review(reviews: list[dict], strategy_id: str, signal_date: str) -> dict | None:
    matches = [
        item for item in reviews
        if item.get("strategy_id") == strategy_id and item.get("signal_date") == signal_date
    ]
    return sorted(matches, key=lambda item: item.get("importedAt", ""), reverse=True)[0] if matches else None


def triggered_route(latest_signal: dict) -> dict | None:
    for route in latest_signal.get("routes", []):
        if route.get("action") == "paper_watch_open_allowed":
            return route
    return None


def build_pack() -> dict:
    latest_signal = read_json(LATEST_SIGNAL_PATH, {})
    operations = read_json(OPERATIONS_PATH, {})
    matrix = read_json(MATRIX_PATH, {})
    reviews = read_json(TRADEABILITY_REVIEWS_PATH, [])
    route = triggered_route(latest_signal)
    signal_date = latest_signal.get("signal_date", "")
    strategy_id = route.get("strategy_id") if route else ""
    review = latest_review(reviews, strategy_id, signal_date)
    selected = route.get("selected", []) if route else []
    selected_codes = [item.get("code") for item in selected]
    selected_names = [item.get("name") for item in selected]

    ak_sleeve = next(
        (item for item in operations.get("capital_sleeves", []) if item.get("sleeve_id") == "akshare_local_switch"),
        {},
    )

    status = "review_imported" if review else "waiting_for_joinquant_review"
    if review and review.get("decision") == "tradeability_review_passed":
        status = "review_passed"
    elif review and review.get("decision") == "tradeability_review_failed":
        status = "review_failed"

    return {
        "source": "m_quant_tradeability_review_task_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": status,
        "data_policy": "只整理已有 AkShare 本地最新信号、运行包和成熟策略矩阵；不调用 JoinQuant，不生成交易可行性、收益、净值、成交或持仓。",
        "target": {
            "sleeve_id": "akshare_local_switch",
            "strategy_id": strategy_id,
            "strategy_name": route.get("strategy_name") if route else "",
            "signal_date": signal_date,
            "action": route.get("action") if route else "record_only",
            "candidate_count": route.get("candidate_count", 0) if route else 0,
            "selected_count": route.get("selected_count", 0) if route else 0,
            "selected_codes": selected_codes,
            "selected_names": selected_names,
        },
        "current_gate": {
            "operational_status": ak_sleeve.get("operational_status"),
            "can_start_observation": bool(ak_sleeve.get("can_start_observation")),
            "blocked_reasons": ak_sleeve.get("blocked_reasons", []),
            "maturity_goal_status": matrix.get("goal_status"),
            "ready_strategy_count": matrix.get("ready_strategy_count"),
            "target_ready_strategy_count": matrix.get("target_ready_strategy_count"),
        },
        "joinquant_script": {
            "path": str(JQ_SCRIPT_PATH.relative_to(ROOT)),
            "download_endpoint": "/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py",
            "environment": "JoinQuant Python3 research notebook",
            "expected_source": "joinquant_akshare_latest_signal_tradeability_review",
            "expected_result_type": "tradeability_review",
        },
        "pass_gate": {
            "min_tradable_count": 10,
            "required_decision": "tradeability_review_passed",
            "required_fields": [
                "source",
                "strategy_id",
                "strategy_name",
                "signal_date",
                "candidate_count",
                "tradable_count",
                "blocked_count",
                "decision",
                "records",
            ],
            "import_endpoint": "/backtest-api/import-results",
            "after_import_expected_effect": "平台会把复核结果写入 imported-tradeability-reviews.json；只有 decision=tradeability_review_passed 且运行包重建后，akshare_local_switch 才可能从 record_only 进入可观察资金袖。",
        },
        "steps": [
            "打开 JoinQuant Python3 研究环境。",
            "下载或复制 joinquant_script.download_endpoint 返回的脚本。",
            "在 JoinQuant 中运行脚本，等待其打印 JSON。",
            "完整复制打印出的 JSON，不要手工改 candidate_count、tradable_count、decision 或 records。",
            "回到 M-quant 回测中心结果回填，粘贴 JSON 并导入。",
            "导入后重新生成运行包和成熟策略矩阵，确认 akshare_local_switch 是否解除阻塞。",
        ],
        "latest_review": review,
    }


def write_doc(pack: dict) -> None:
    target = pack["target"]
    gate = pack["current_gate"]
    lines = [
        "# JoinQuant 交易可行性复核任务包",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 状态：`{pack['status']}`",
        f"- 数据原则：{pack['data_policy']}",
        "",
        "## 目标信号",
        "",
        f"- 资金袖：`{target['sleeve_id']}`",
        f"- 策略：`{target['strategy_id']}` / {target['strategy_name']}",
        f"- 信号日期：{target['signal_date']}",
        f"- 动作：{target['action']}",
        f"- 候选：{target['candidate_count']}，入选：{target['selected_count']}",
        f"- 入选代码：{', '.join(target['selected_codes'])}",
        "",
        "## 当前阻塞",
        "",
        f"- 运行状态：`{gate.get('operational_status')}`",
        f"- 可进入观察：{gate.get('can_start_observation')}",
    ]
    for reason in gate.get("blocked_reasons", []):
        lines.append(f"- 阻塞原因：{reason}")

    lines.extend([
        "",
        "## 执行步骤",
        "",
    ])
    for index, step in enumerate(pack["steps"], 1):
        lines.append(f"{index}. {step}")

    lines.extend([
        "",
        "## 通过门槛",
        "",
        f"- 最少可交易数量：{pack['pass_gate']['min_tradable_count']}",
        f"- 必须结论：`{pack['pass_gate']['required_decision']}`",
        f"- 导入接口：`{pack['pass_gate']['import_endpoint']}`",
        f"- 脚本路径：`{pack['joinquant_script']['path']}`",
        f"- 下载入口：`{pack['joinquant_script']['download_endpoint']}`",
        "",
        "## 注意",
        "",
        "- 本任务包不是复核结果。",
        "- 未导入 JoinQuant 打印出的真实 JSON 前，AkShare 本地策略仍只能 record_only。",
    ])
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
        "strategy_id": pack["target"]["strategy_id"],
        "signal_date": pack["target"]["signal_date"],
        "selected_count": pack["target"]["selected_count"],
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
