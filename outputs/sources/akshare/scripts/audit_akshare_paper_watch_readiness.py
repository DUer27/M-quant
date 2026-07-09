#!/usr/bin/env python3
"""Audit AkShare local strategy candidates for controlled paper watch.

This audit reads strategy candidate validation results generated from real
AkShare OHLCV history. It does not create new returns or synthetic data.
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from build_ohlcv_factor_backtest import max_drawdown, sharpe_ratio


ROOT = Path(__file__).resolve().parents[4]
RESULTS_DIR = ROOT / "outputs" / "sources" / "akshare" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"
INPUT_PATH = RESULTS_DIR / "akshare_strategy_candidate_validation.json"
RESULT_PATH = RESULTS_DIR / "akshare_paper_watch_readiness_audit_20260709.json"
DOC_PATH = DOCS_DIR / "akshare-paper-watch-readiness-audit-20260709.md"

GATES = {
    "min_trades": 30,
    "min_strategy_return": 0.20,
    "min_sharpe": 1.20,
    "max_drawdown_floor": -0.15,
    "min_positive_trade_ratio": 0.55,
    "min_avg_stock_count": 15,
    "min_recent_trades": 3,
    "min_stress_1_5_return": 0.0,
    "min_stress_2_0_return": 0.0,
    "min_oos_return": 0.0,
    "min_year_segments": 3,
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def clean_float(value) -> float | None:
    if value is None:
        return None
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def pct(value: float | None) -> str:
    if value is None:
        return "NA"
    return f"{value * 100:.2f}%"


def number(value: float | None) -> str:
    if value is None:
        return "NA"
    return f"{value:.2f}"


def trade_frame(candidate: dict) -> pd.DataFrame:
    rows = candidate.get("trade_records") or []
    if not rows:
        return pd.DataFrame()
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["gross_return_5d"] = pd.to_numeric(frame["gross_return_5d"], errors="coerce")
    frame["net_return_5d"] = pd.to_numeric(frame["net_return_5d"], errors="coerce")
    frame["stock_count"] = pd.to_numeric(frame["stock_count"], errors="coerce")
    return frame.dropna(subset=["date", "gross_return_5d", "net_return_5d"]).sort_values("date")


def metric_summary(rows: pd.DataFrame, cost_multiplier: float = 1.0) -> dict:
    if rows.empty:
        return {
            "sample_trades": 0,
            "strategy_return": None,
            "max_drawdown": None,
            "sharpe": None,
            "positive_trade_ratio": None,
            "avg_stock_count": None,
            "first_trade_date": None,
            "last_trade_date": None,
        }
    base_cost = rows["gross_return_5d"] - rows["net_return_5d"]
    returns = rows["gross_return_5d"] - base_cost * cost_multiplier
    equity = (1 + returns).cumprod()
    return {
        "sample_trades": int(len(rows)),
        "strategy_return": clean_float(equity.iloc[-1] - 1),
        "max_drawdown": clean_float(max_drawdown(equity)),
        "sharpe": clean_float(sharpe_ratio(returns, periods_per_year=252 / 5)),
        "positive_trade_ratio": clean_float((returns > 0).mean()),
        "avg_stock_count": clean_float(rows["stock_count"].mean()),
        "first_trade_date": str(rows["date"].iloc[0].date()),
        "last_trade_date": str(rows["date"].iloc[-1].date()),
    }


def segment_checks(candidate: dict, rows: pd.DataFrame) -> tuple[dict, dict]:
    segments = candidate.get("segments") or {}
    year_segments = {
        key: value
        for key, value in segments.items()
        if key.startswith("year_") and value.get("sample_trades", 0) >= 5
    }
    recent_cutoff = pd.Timestamp(date(2026, 1, 1))
    recent_rows = rows[rows["date"] >= recent_cutoff]
    checks = {
        "first_half_positive": (segments.get("first_half", {}).get("strategy_return") or 0) > 0,
        "second_half_positive": (segments.get("second_half", {}).get("strategy_return") or 0) > 0,
        "oos_positive": (segments.get("from_2025_07_01", {}).get("strategy_return") or 0) > GATES["min_oos_return"],
        "year_segments_all_positive": (
            len(year_segments) >= GATES["min_year_segments"]
            and all((item.get("strategy_return") or 0) > 0 for item in year_segments.values())
        ),
        "recent_trades": len(recent_rows) >= GATES["min_recent_trades"],
    }
    details = {
        "year_segments": year_segments,
        "recent_trade_count": int(len(recent_rows)),
        "recent_first_trade_date": None if recent_rows.empty else str(recent_rows["date"].iloc[0].date()),
        "recent_last_trade_date": None if recent_rows.empty else str(recent_rows["date"].iloc[-1].date()),
    }
    return checks, details


def audit_candidate(candidate: dict) -> dict:
    rows = trade_frame(candidate)
    baseline = metric_summary(rows, cost_multiplier=1.0)
    stress_1_5 = metric_summary(rows, cost_multiplier=1.5)
    stress_2_0 = metric_summary(rows, cost_multiplier=2.0)
    segment_result, segment_details = segment_checks(candidate, rows)
    checks = [
        {
            "name": "sample_trades",
            "passed": baseline["sample_trades"] >= GATES["min_trades"],
            "detail": f"{baseline['sample_trades']} >= {GATES['min_trades']}",
        },
        {
            "name": "strategy_return",
            "passed": (baseline["strategy_return"] or -math.inf) >= GATES["min_strategy_return"],
            "detail": f"{baseline['strategy_return']:.4f} >= {GATES['min_strategy_return']:.4f}",
        },
        {
            "name": "max_drawdown",
            "passed": (baseline["max_drawdown"] or -math.inf) >= GATES["max_drawdown_floor"],
            "detail": f"{baseline['max_drawdown']:.4f} >= {GATES['max_drawdown_floor']:.4f}",
        },
        {
            "name": "sharpe",
            "passed": (baseline["sharpe"] or -math.inf) >= GATES["min_sharpe"],
            "detail": f"{baseline['sharpe']:.4f} >= {GATES['min_sharpe']:.4f}",
        },
        {
            "name": "positive_trade_ratio",
            "passed": (baseline["positive_trade_ratio"] or -math.inf) >= GATES["min_positive_trade_ratio"],
            "detail": f"{baseline['positive_trade_ratio']:.4f} >= {GATES['min_positive_trade_ratio']:.4f}",
        },
        {
            "name": "avg_stock_count",
            "passed": (baseline["avg_stock_count"] or -math.inf) >= GATES["min_avg_stock_count"],
            "detail": f"{baseline['avg_stock_count']:.2f} >= {GATES['min_avg_stock_count']}",
        },
        {
            "name": "stress_1_5_return",
            "passed": (stress_1_5["strategy_return"] or -math.inf) > GATES["min_stress_1_5_return"],
            "detail": f"{stress_1_5['strategy_return']:.4f} > {GATES['min_stress_1_5_return']:.4f}",
        },
        {
            "name": "stress_2_0_return",
            "passed": (stress_2_0["strategy_return"] or -math.inf) > GATES["min_stress_2_0_return"],
            "detail": f"{stress_2_0['strategy_return']:.4f} > {GATES['min_stress_2_0_return']:.4f}",
        },
    ]
    checks.extend(
        {
            "name": name,
            "passed": passed,
            "detail": str(segment_details.get("recent_trade_count")) if name == "recent_trades" else str(passed),
        }
        for name, passed in segment_result.items()
    )
    passed_all = all(item["passed"] for item in checks)
    decision = "ready_local_paper_watch" if passed_all else "not_ready"
    if not passed_all and sum(item["passed"] for item in checks) >= len(checks) - 2:
        decision = "conditional_local_paper_watch"
    failed = [item for item in checks if not item["passed"]]
    return {
        "id": candidate.get("id"),
        "strategy_id": candidate.get("strategy_id"),
        "strategy_name": candidate.get("name"),
        "layer": f"{candidate.get('market_vol_regime')}/{candidate.get('liquidity_bucket')}",
        "market_regime": candidate.get("market_vol_regime"),
        "liquidity_bucket": candidate.get("liquidity_bucket"),
        "route": candidate.get("route"),
        "decision": decision,
        "decision_reason": "严格门槛、成本压力、分段和近期触发均通过。" if passed_all else "存在未通过项，不能进入正式模拟观察。",
        "checks": checks,
        "failed_checks": failed,
        "baseline": baseline,
        "cost_stress": {
            "cost_1_0x": baseline,
            "cost_1_5x": stress_1_5,
            "cost_2_0x": stress_2_0,
        },
        "segments": candidate.get("segments") or {},
        "segment_details": segment_details,
        "sample_trades": baseline["sample_trades"],
        "strategy_return": baseline["strategy_return"],
        "max_drawdown": baseline["max_drawdown"],
        "sharpe": baseline["sharpe"],
        "win_rate": baseline["positive_trade_ratio"],
        "avg_selected_count": baseline["avg_stock_count"],
        "source": "akshare_strategy_candidate_validation",
        "data_policy": "真实 AkShare OHLCV 本地历史生成候选池；5日等权调仓收益来自真实未来5日价格变化扣成本；未生成虚构绩效。",
        "paper_scope": f"仅限 {candidate.get('route')} / {candidate.get('market_vol_regime')} / {candidate.get('liquidity_bucket')}，不得扩展到未审计股票池或未通过分层。",
    }


def write_doc(pack: dict) -> None:
    lines = [
        "# AkShare 模拟观察就绪审计",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 输入：`{pack['input']}`",
        f"- 候选数量：{pack['candidate_count']}",
        f"- 推荐数量：{pack['recommended_route_count']}",
        "",
        "## 推荐路线",
        "",
    ]
    if not pack["recommended_routes"]:
        lines.append("- 暂无通过严格审计的 AkShare 本地路线。")
    for route in pack["recommended_routes"]:
        lines.extend([
            f"### {route['strategy_name']}",
            "",
            f"- 决策：{route['decision']}",
            f"- 分层：{route['layer']}",
            f"- 样本调仓：{route['sample_trades']}",
            f"- 收益：{pct(route['strategy_return'])}",
            f"- 最大回撤：{pct(route['max_drawdown'])}",
            f"- Sharpe：{number(route['sharpe'])}",
            f"- 胜率：{pct(route['win_rate'])}",
            f"- 平均入选：{number(route['avg_selected_count'])}",
            f"- 范围：{route['paper_scope']}",
            "",
        ])
    lines.extend(["## 全部候选", ""])
    for route in pack["routes"]:
        failed = "；".join(f"{item['name']} {item['detail']}" for item in route["failed_checks"]) or "无"
        lines.append(f"- {route['strategy_name']}：{route['decision']}，失败项：{failed}")
    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    source = load_json(INPUT_PATH)
    routes = [audit_candidate(candidate) for candidate in source.get("candidates", [])]
    recommended = [
        route for route in routes
        if route["decision"] == "ready_local_paper_watch"
    ]
    recommended = sorted(
        recommended,
        key=lambda item: (
            item["sharpe"] or -999,
            item["strategy_return"] or -999,
            -(abs(item["max_drawdown"] or -999)),
        ),
        reverse=True,
    )
    pack = {
        "source": "akshare_paper_watch_readiness_audit",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(INPUT_PATH.relative_to(ROOT)),
        "data_policy": "只读取真实 AkShare OHLCV 本地策略候选验证结果；重算成本压力和分段门槛，不生成新收益或虚构绩效。",
        "gates": GATES,
        "candidate_count": len(routes),
        "recommended_route_count": len(recommended),
        "decision_counts": {
            str(key): int(value)
            for key, value in pd.Series([route["decision"] for route in routes]).value_counts().items()
        },
        "routes": routes,
        "recommended_routes": recommended,
    }
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "decision_counts": pack["decision_counts"],
        "recommended_route_count": pack["recommended_route_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
