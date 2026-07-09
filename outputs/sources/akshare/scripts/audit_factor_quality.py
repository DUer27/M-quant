#!/usr/bin/env python3
"""
Audit AkShare local OHLCV factor and strategy candidate quality.

This script only reads existing real-data backtest outputs. It does not create
synthetic factor values, prices, returns, or strategy performance.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
AK_DIR = ROOT / "outputs" / "sources" / "akshare"
RESULTS_DIR = AK_DIR / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"
PLATFORM_DATA_DIR = ROOT / "platform" / "quant-factor-platform" / "data"

BACKTEST_PATH = RESULTS_DIR / "akshare_ohlcv_factor_backtest_results.json"
VALIDATION_PATH = RESULTS_DIR / "akshare_strategy_candidate_validation.json"
IMPORTED_BACKTEST_PATH = PLATFORM_DATA_DIR / "imported-backtest-results.json"
AUDIT_JSON_PATH = RESULTS_DIR / "akshare_factor_quality_audit.json"
AUDIT_MD_PATH = DOCS_DIR / "akshare-factor-quality-audit-20260709.md"

PRIMARY_HORIZONS = {5, 10, 20}

FACTOR_GATES = {
    "min_sample_dates": 120,
    "min_rank_ic": 0.015,
    "min_rank_ic_t": 2.0,
    "min_long_short": 0.0,
    "min_long_short_positive_ratio": 0.53,
}

STRATEGY_LOCAL_GATES = {
    "min_trades": 30,
    "min_sharpe": 1.0,
    "max_drawdown_floor": -0.15,
    "requires_positive_overall_return": True,
    "requires_positive_oos_after_2025_07_01": True,
    "requires_positive_year_segments": True,
}


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def safe_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def pct(value):
    number = safe_number(value)
    if number is None:
        return "NA"
    return f"{number * 100:.2f}%"


def fmt(value, digits=4):
    number = safe_number(value)
    if number is None:
        return "NA"
    return f"{number:.{digits}f}"


def factor_result_score(result: dict) -> float:
    rank_ic = safe_number(result.get("rank_ic_mean")) or -999
    rank_ic_t = safe_number(result.get("rank_ic_t")) or -999
    long_short = safe_number(result.get("long_short_mean")) or -999
    positive_ratio = safe_number(result.get("long_short_positive_ratio")) or 0
    sample_dates = safe_number(result.get("sample_dates")) or 0
    pass_bonus = 1000 if factor_passes_alpha_gate(result) else 0
    return pass_bonus + rank_ic_t + rank_ic * 100 + long_short * 100 + positive_ratio + sample_dates / 10000


def factor_passes_alpha_gate(result: dict) -> bool:
    rank_ic = safe_number(result.get("rank_ic_mean"))
    rank_ic_t = safe_number(result.get("rank_ic_t"))
    long_short = safe_number(result.get("long_short_mean"))
    positive_ratio = safe_number(result.get("long_short_positive_ratio"))
    sample_dates = safe_number(result.get("sample_dates")) or 0
    return (
        sample_dates >= FACTOR_GATES["min_sample_dates"]
        and rank_ic is not None and rank_ic >= FACTOR_GATES["min_rank_ic"]
        and rank_ic_t is not None and rank_ic_t >= FACTOR_GATES["min_rank_ic_t"]
        and long_short is not None and long_short > FACTOR_GATES["min_long_short"]
        and positive_ratio is not None and positive_ratio >= FACTOR_GATES["min_long_short_positive_ratio"]
    )


def classify_factor(results: list[dict], definition: dict | None = None) -> dict:
    primary_results = [
        item for item in results
        if int(item.get("horizon") or 0) in PRIMARY_HORIZONS
        and (safe_number(item.get("sample_dates")) or 0) >= FACTOR_GATES["min_sample_dates"]
    ]
    best = max(primary_results, key=factor_result_score) if primary_results else None
    definition = definition or {}

    if not best:
        decision = "insufficient_history"
        decision_name = "历史不足"
        evidence = "缺少 5/10/20 日且样本天数达标的真实回测结果。"
    elif factor_passes_alpha_gate(best):
        decision = "alpha_candidate"
        decision_name = "单因子通过"
        evidence = (
            f"{best.get('horizon')}日通过：RankIC {fmt(best.get('rank_ic_mean'))}，"
            f"t {fmt(best.get('rank_ic_t'), 2)}，多空 {pct(best.get('long_short_mean'))}，"
            f"多空胜率 {pct(best.get('long_short_positive_ratio'))}。"
        )
    else:
        rank_ic = safe_number(best.get("rank_ic_mean"))
        rank_ic_t = safe_number(best.get("rank_ic_t"))
        long_short = safe_number(best.get("long_short_mean"))
        positive_ratio = safe_number(best.get("long_short_positive_ratio"))
        if rank_ic is not None and rank_ic >= FACTOR_GATES["min_rank_ic"] and rank_ic_t is not None and rank_ic_t >= FACTOR_GATES["min_rank_ic_t"]:
            decision = "significant_not_tradeable"
            decision_name = "显著但不可单独交易"
            evidence = (
                f"{best.get('horizon')}日 RankIC 显著，但多空 {pct(long_short)}、"
                f"胜率 {pct(positive_ratio)} 未过交易门槛。"
            )
        elif rank_ic is not None and rank_ic > 0 and long_short is not None and long_short > 0:
            decision = "watch"
            decision_name = "继续观察"
            evidence = (
                f"{best.get('horizon')}日方向为正但强度不足：RankIC {fmt(rank_ic)}，"
                f"t {fmt(rank_ic_t, 2)}，多空 {pct(long_short)}。"
            )
        else:
            decision = "reject_standalone"
            decision_name = "暂缓单独使用"
            evidence = (
                f"{best.get('horizon')}日未同时满足 RankIC、t值、多空收益和胜率门槛；"
                f"当前不能作为独立 alpha。"
            )

    return {
        "factor_id": results[0].get("factor_name") if results else definition.get("id"),
        "name": definition.get("name") or (results[0].get("factor_display_name") if results else ""),
        "direction": definition.get("direction") or (results[0].get("direction") if results else ""),
        "description": definition.get("description", ""),
        "decision": decision,
        "decision_name": decision_name,
        "evidence": evidence,
        "best_primary_result": best,
        "primary_result_count": len(primary_results),
        "all_results": sorted(results, key=lambda item: int(item.get("horizon") or 0)),
    }


def imported_strategy_count(strategy_id: str, imported_results: list[dict]) -> int:
    return sum(1 for item in imported_results if item.get("strategy_id") == strategy_id)


def classify_strategy(candidate: dict, imported_results: list[dict]) -> dict:
    verdict = candidate.get("verdict", {})
    overall = candidate.get("overall", {})
    jq_count = imported_strategy_count(candidate.get("id", ""), imported_results)
    if jq_count:
        decision = "joinquant_result_imported"
        decision_name = "已有 JoinQuant 回填"
    elif verdict.get("status") == "joinquant_review_candidate":
        decision = "awaiting_joinquant_review"
        decision_name = "待 JoinQuant 复核"
    elif verdict.get("status") in {"strong_observation", "observation"}:
        decision = "local_observation"
        decision_name = "本地观察"
    else:
        decision = "not_ready"
        decision_name = "未就绪"

    return {
        "strategy_id": candidate.get("id"),
        "name": candidate.get("name"),
        "route": candidate.get("route"),
        "source_score_col": candidate.get("score_col"),
        "decision": decision,
        "decision_name": decision_name,
        "joinquant_result_count": jq_count,
        "local_status": verdict.get("status"),
        "passed_checks": verdict.get("passed_checks"),
        "total_checks": verdict.get("total_checks"),
        "sample_trades": overall.get("sample_trades"),
        "strategy_return": overall.get("strategy_return"),
        "max_drawdown": overall.get("max_drawdown"),
        "sharpe": overall.get("sharpe"),
        "next_action": (
            "导入 JoinQuant 复核结果后再决定是否进入正式策略池。"
            if not jq_count else
            "按 JoinQuant 结果继续做样本外、行业、市值和成本审计。"
        ),
    }


def write_markdown(audit: dict) -> None:
    lines = [
        "# AkShare 因子质量审计",
        "",
        f"生成时间：{audit['generated_at']}",
        "",
        "## 数据口径",
        "",
        f"- 输入回测：`{audit['inputs']['factor_backtest']}`",
        f"- 输入候选：`{audit['inputs']['strategy_validation']}`",
        f"- 因子数：{audit['factor_count']} 个",
        f"- 策略候选：{audit['strategy_candidate_count']} 条",
        "- 原则：只审计真实回测结果；不生成新收益，不替代 JoinQuant 复核。",
        "",
        "## 因子门槛",
        "",
        f"- 样本天数 >= {FACTOR_GATES['min_sample_dates']}",
        f"- RankIC >= {FACTOR_GATES['min_rank_ic']}",
        f"- RankIC t >= {FACTOR_GATES['min_rank_ic_t']}",
        "- 多空收益 > 0",
        f"- 多空胜率 >= {pct(FACTOR_GATES['min_long_short_positive_ratio'])}",
        "",
        "## 因子结论",
        "",
    ]
    for decision in ["alpha_candidate", "significant_not_tradeable", "watch", "reject_standalone", "insufficient_history"]:
        group = [item for item in audit["factors"] if item["decision"] == decision]
        if not group:
            continue
        lines.extend([f"### {group[0]['decision_name']}", ""])
        for item in group:
            best = item.get("best_primary_result") or {}
            lines.append(
                f"- `{item['factor_id']}`：{item['evidence']} "
                f"最佳周期 {best.get('horizon', 'NA')}日。"
            )
        lines.append("")

    lines.extend([
        "## 策略候选结论",
        "",
        "| 策略 | 状态 | 交易数 | 收益 | 回撤 | Sharpe | 下一步 |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ])
    for item in audit["strategies"]:
        lines.append(
            f"| {item['name']} | {item['decision_name']} | {item.get('sample_trades') or 0} | "
            f"{pct(item.get('strategy_return'))} | {pct(item.get('max_drawdown'))} | "
            f"{fmt(item.get('sharpe'), 2)} | {item['next_action']} |"
        )

    lines.extend([
        "",
        "## 晋级规则",
        "",
        "- `单因子通过` 可以进入策略组合研究，但仍需外部复核和分层审计。",
        "- `显著但不可单独交易` 只能作为风控或组合模块，不能独立形成策略。",
        "- `待 JoinQuant 复核` 不是成熟策略；必须回填 JoinQuant 真实结果后再筛。",
        "",
    ])
    AUDIT_MD_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    backtest = read_json(BACKTEST_PATH, {})
    validation = read_json(VALIDATION_PATH, {})
    imported_results = read_json(IMPORTED_BACKTEST_PATH, [])
    definitions = {
        item.get("id"): item
        for item in backtest.get("factor_definitions", [])
        if item.get("id")
    }
    grouped = {}
    for result in backtest.get("factor_results", []):
        grouped.setdefault(result.get("factor_name"), []).append(result)

    factors = [
        classify_factor(results, definitions.get(factor_id))
        for factor_id, results in sorted(grouped.items())
    ]
    strategies = [
        classify_strategy(candidate, imported_results)
        for candidate in validation.get("candidates", [])
    ]

    audit = {
        "source": "akshare_factor_quality_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "只读取真实 AkShare 本地回测与候选验证结果；不生成虚构绩效；未导入 JoinQuant 结果前不升级成熟策略。",
        "inputs": {
            "factor_backtest": str(BACKTEST_PATH.relative_to(ROOT)),
            "strategy_validation": str(VALIDATION_PATH.relative_to(ROOT)),
            "imported_backtests": str(IMPORTED_BACKTEST_PATH.relative_to(ROOT)),
        },
        "factor_gates": FACTOR_GATES,
        "strategy_local_gates": STRATEGY_LOCAL_GATES,
        "factor_count": len(factors),
        "strategy_candidate_count": len(strategies),
        "factor_decision_counts": dict(Counter(item["decision"] for item in factors)),
        "strategy_decision_counts": dict(Counter(item["decision"] for item in strategies)),
        "factors": factors,
        "strategies": strategies,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_JSON_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(audit)
    print(json.dumps({
        "source": audit["source"],
        "generated_at": audit["generated_at"],
        "factor_count": audit["factor_count"],
        "factor_decision_counts": audit["factor_decision_counts"],
        "strategy_candidate_count": audit["strategy_candidate_count"],
        "strategy_decision_counts": audit["strategy_decision_counts"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
