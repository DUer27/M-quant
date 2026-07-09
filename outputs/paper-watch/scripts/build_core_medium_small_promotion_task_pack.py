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
    candidate = next(
        (item for item in audit.get("candidates", []) if item.get("strategy_id") == STRATEGY_ID),
        {},
    )
    metrics = candidate.get("metrics", {})
    return {
        "source": "m_quant_core_medium_small_promotion_task_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": "waiting_for_joinquant_latest_signal_review",
        "data_policy": "只生成 JoinQuant 最新信号复核任务；不生成收益、净值、成交、持仓、交易可行性或模拟盘结果。",
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
        "joinquant_script": {
            "path": str(SCRIPT_PATH.relative_to(ROOT)),
            "download_endpoint": "/strategy-api/joinquant-core-medium-small-latest-signal-review.py",
            "expected_source": "joinquant_core_medium_small_latest_signal_review",
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
