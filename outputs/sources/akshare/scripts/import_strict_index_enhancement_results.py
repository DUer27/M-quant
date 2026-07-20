#!/usr/bin/env python3
"""Import strict index-enhancement factor results into platform backtest data."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
RESEARCH_PATH = ROOT / "outputs" / "sources" / "akshare" / "index_enhancement" / "results" / "index_enhancement_research_results.json"
IMPORTED_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
SOURCE = "akshare_strict_index_enhancement_factor_retest_20260715"
KEEP_FACTORS = {
    "f_medium_momentum",
    "f_long_momentum",
    "f_short_reversal",
    "f_low_volatility",
    "f_volume_stability",
    "f_volume_confirmation",
    "f_close_strength",
    "f_gap_risk_control",
    "f_anti_crowding",
    "f_drawdown_control",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def is_old_index_enhancement(row: dict) -> bool:
    source = str(row.get("source") or "")
    strategy_id = str(row.get("strategy_id") or "")
    factor_name = str(row.get("factor_name") or row.get("factor") or "")
    return (
        "index_enhancement" in source
        or strategy_id.startswith("index_enhancement_")
        or factor_name.startswith("index_enhancement_")
    )


def display_name(dataset: str, factor: str) -> str:
    prefix = "沪深300" if dataset == "csi300" else "中证500" if dataset == "csi500" else dataset
    names = {
        "f_anti_crowding": "指数增长反拥挤",
        "f_close_strength": "指数增长收盘强度",
        "f_drawdown_control": "指数增长回撤控制",
        "f_gap_risk_control": "指数增长跳空风险控制",
        "f_long_momentum": "指数增长长期趋势",
        "f_low_volatility": "指数增长低波动",
        "f_medium_momentum": "指数增长中期趋势",
        "f_short_reversal": "指数增长短期反转",
        "f_volume_confirmation": "指数增长量价确认",
        "f_volume_stability": "指数增长量能稳定",
    }
    return f"{prefix}{names.get(factor, factor)}"


def readable_factor_id(factor: str) -> str:
    ids = {
        "f_anti_crowding": "index_growth_anti_crowding",
        "f_close_strength": "index_growth_close_strength",
        "f_drawdown_control": "index_growth_drawdown_control",
        "f_gap_risk_control": "index_growth_gap_risk_control",
        "f_long_momentum": "index_growth_long_trend",
        "f_low_volatility": "index_growth_low_volatility",
        "f_medium_momentum": "index_growth_medium_trend",
        "f_short_reversal": "index_growth_short_reversal",
        "f_volume_confirmation": "index_growth_volume_price_confirmation",
        "f_volume_stability": "index_growth_volume_stability",
    }
    return ids.get(factor, factor)


def gate_lookup(research: dict) -> dict[tuple[str, str], dict]:
    out = {}
    for row in research.get("factor_gate_audit", []):
        out[(row.get("dataset"), row.get("factor"))] = row
    return out


def convert_factor_rows(research: dict) -> list[dict]:
    imported_at = datetime.now().isoformat(timespec="milliseconds") + "Z"
    gates = gate_lookup(research)
    rows = []
    for row in research.get("factor_ic", []):
        dataset = row.get("dataset")
        factor = row.get("factor")
        if factor not in KEEP_FACTORS:
            continue
        gate = gates.get((dataset, factor), {})
        is_primary = int(row.get("horizon") or 0) == int(research.get("factor_backtest_policy", {}).get("primary_horizon") or 20)
        readable_id = readable_factor_id(factor)
        rows.append({
            "source": SOURCE,
            "result_type": "factor_backtest",
            "factor_name": f"{dataset}_{readable_id}",
            "factor": readable_id,
            "raw_factor": factor,
            "factor_display_name": display_name(dataset, factor),
            "dataset": dataset,
            "horizon": row.get("horizon"),
            "direction": "positive",
            "sample_dates": row.get("sample_dates"),
            "rank_ic_mean": row.get("rank_ic_mean"),
            "rank_ic_std": row.get("rank_ic_std"),
            "rank_ic_ir": row.get("rank_ic_ir"),
            "rank_ic_t": row.get("rank_ic_t"),
            "long_short_mean": row.get("long_short_mean"),
            "long_short_positive_ratio": row.get("long_short_positive_ratio"),
            "positive_ratio": row.get("positive_ratio"),
            "coverage_mean": None,
            "gate_passed": bool(gate.get("gate_passed")) if is_primary else None,
            "blocked_reason": gate.get("blocked_reason") if is_primary else None,
            "factor_gate": research.get("factor_gate"),
            "factor_backtest_policy": research.get("factor_backtest_policy"),
            "strategy_backtest_policy": research.get("strategy_backtest_policy"),
            "data_policy": research.get("data_policy"),
            "note": "严格指数增长因子复测；未通过 20 日主周期门禁的 score_col 不进入准入型策略回测。",
            "importedAt": imported_at,
        })
    return rows


def main() -> int:
    research = read_json(RESEARCH_PATH)
    existing = read_json(IMPORTED_PATH)
    kept = [row for row in existing if not is_old_index_enhancement(row)]
    strict_rows = convert_factor_rows(research)
    write_json(IMPORTED_PATH, strict_rows + kept)
    print(json.dumps({
        "removed_old_index_enhancement_rows": len(existing) - len(kept),
        "imported_strict_factor_rows": len(strict_rows),
        "total_rows": len(strict_rows) + len(kept),
        "passed_gate_count": sum(1 for row in research.get("factor_gate_audit", []) if row.get("gate_passed")),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
