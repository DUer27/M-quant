#!/usr/bin/env python3
"""Build an AkShare local high/low volatility switch strategy.

The switch strategy only combines audited component trade records that were
already generated from real AkShare OHLCV history. It does not create new
prices, returns, market caps, industries, or synthetic trades.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_ohlcv_factor_backtest import max_drawdown, sharpe_ratio


ROOT = Path(__file__).resolve().parents[4]
RESULTS_DIR = ROOT / "outputs" / "sources" / "akshare" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"
VALIDATION_PATH = RESULTS_DIR / "akshare_strategy_candidate_validation.json"
EXECUTION_PACK_PATH = RESULTS_DIR / "akshare_paper_watch_execution_pack_20260709.json"
OUTPUT_PATH = RESULTS_DIR / "akshare_regime_switch_paper_watch_strategy_20260709.json"
DOC_PATH = DOCS_DIR / "akshare-regime-switch-paper-watch-strategy-20260709.md"

STRATEGY_ID = "akshare_regime_switch_contraction_mean_reversion_v1"
STRATEGY_NAME = "AkShare本地高低波动切换策略 v1"

GATES = {
    "min_trades": 50,
    "min_strategy_return": 0.30,
    "min_sharpe": 1.30,
    "max_drawdown_floor": -0.15,
    "min_positive_trade_ratio": 0.55,
    "min_avg_stock_count": 15,
    "min_stress_1_5_return": 0.0,
    "min_stress_2_0_return": 0.0,
    "min_component_count": 2,
    "min_recent_trades": 5,
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


def candidate_by_id(validation: dict) -> dict[str, dict]:
    return {
        candidate.get("id"): candidate
        for candidate in validation.get("candidates", [])
        if candidate.get("id")
    }


def executable_components(execution_pack: dict, validation: dict) -> list[dict]:
    by_id = candidate_by_id(validation)
    components = []
    for route in execution_pack.get("routes", []):
        if not route.get("can_enter_paper_watch"):
            continue
        candidate = by_id.get(route.get("id"))
        if not candidate:
            continue
        components.append({
            "id": route.get("id"),
            "strategy_id": route.get("strategy_id"),
            "strategy_name": route.get("strategy_name"),
            "execution_role": route.get("execution_role"),
            "allowed_market_regime": route.get("allowed_market_regime"),
            "allowed_liquidity_bucket": route.get("allowed_liquidity_bucket"),
            "priority": route.get("paper_watch_priority") or 99,
            "candidate": candidate,
        })
    return sorted(components, key=lambda item: item["priority"])


def component_trade_frame(component: dict) -> pd.DataFrame:
    rows = component["candidate"].get("trade_records") or []
    if not rows:
        return pd.DataFrame()
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["gross_return_5d"] = pd.to_numeric(frame["gross_return_5d"], errors="coerce")
    frame["net_return_5d"] = pd.to_numeric(frame["net_return_5d"], errors="coerce")
    frame["stock_count"] = pd.to_numeric(frame["stock_count"], errors="coerce")
    frame = frame.dropna(subset=["date", "gross_return_5d", "net_return_5d"])
    frame["component_id"] = component["id"]
    frame["component_strategy_id"] = component["strategy_id"]
    frame["component_name"] = component["strategy_name"]
    frame["execution_role"] = component["execution_role"]
    frame["market_regime"] = component["allowed_market_regime"]
    frame["liquidity_bucket"] = component["allowed_liquidity_bucket"]
    frame["priority"] = int(component["priority"])
    return frame.sort_values(["date", "priority"])


def build_switch_trades(components: list[dict]) -> pd.DataFrame:
    frames = [component_trade_frame(component) for component in components]
    frames = [frame for frame in frames if not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True).sort_values(["date", "priority"])
    return combined.drop_duplicates(subset=["date"], keep="first").sort_values("date").reset_index(drop=True)


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


def segment_metrics(rows: pd.DataFrame) -> dict:
    if rows.empty:
        return {}
    midpoint = len(rows) // 2
    segments = {
        "first_half": metric_summary(rows.iloc[:midpoint]),
        "second_half": metric_summary(rows.iloc[midpoint:]),
        "before_2025_07_01": metric_summary(rows[rows["date"] < pd.Timestamp("2025-07-01")]),
        "from_2025_07_01": metric_summary(rows[rows["date"] >= pd.Timestamp("2025-07-01")]),
    }
    for year, group in rows.groupby(rows["date"].dt.year):
        segments[f"year_{year}"] = metric_summary(group)
    for regime, group in rows.groupby("market_regime"):
        segments[f"regime_{regime}"] = metric_summary(group)
    return segments


def route_usage(rows: pd.DataFrame) -> list[dict]:
    if rows.empty:
        return []
    usage = []
    for (component_id, name, role, regime), group in rows.groupby([
        "component_id",
        "component_name",
        "execution_role",
        "market_regime",
    ]):
        summary = metric_summary(group)
        usage.append({
            "component_id": component_id,
            "component_name": name,
            "execution_role": role,
            "market_regime": regime,
            **summary,
        })
    return sorted(usage, key=lambda item: item["sample_trades"], reverse=True)


def audit_switch(rows: pd.DataFrame, components: list[dict], baseline: dict, stress_1_5: dict, stress_2_0: dict) -> tuple[list[dict], str]:
    recent_rows = rows[rows["date"] >= pd.Timestamp("2026-01-01")] if not rows.empty else rows
    checks = [
        {
            "name": "sample_trades",
            "passed": baseline["sample_trades"] >= GATES["min_trades"],
            "detail": f"{baseline['sample_trades']} >= {GATES['min_trades']}",
        },
        {
            "name": "component_count",
            "passed": len(components) >= GATES["min_component_count"],
            "detail": f"{len(components)} >= {GATES['min_component_count']}",
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
        {
            "name": "recent_trades",
            "passed": len(recent_rows) >= GATES["min_recent_trades"],
            "detail": f"{len(recent_rows)} >= {GATES['min_recent_trades']}",
        },
    ]
    decision = "ready_local_switch_paper_watch" if all(item["passed"] for item in checks) else "not_ready"
    return checks, decision


def preview_records(rows: pd.DataFrame) -> list[dict]:
    if rows.empty:
        return []
    fields = [
        "date",
        "component_strategy_id",
        "component_name",
        "market_regime",
        "liquidity_bucket",
        "gross_return_5d",
        "net_return_5d",
        "stock_count",
        "codes",
    ]
    preview = rows[fields].tail(20).copy()
    preview["date"] = preview["date"].dt.strftime("%Y-%m-%d")
    return preview.to_dict(orient="records")


def write_doc(pack: dict) -> None:
    baseline = pack["baseline"]
    lines = [
        "# AkShare 本地高低波动切换策略",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 决策：`{pack['decision']}`",
        f"- 数据原则：{pack['data_policy']}",
        f"- 输入验证：`{pack['inputs']['validation']}`",
        f"- 输入执行包：`{pack['inputs']['execution_pack']}`",
        "",
        "## 总体表现",
        "",
        f"- 样本调仓：{baseline['sample_trades']}",
        f"- 收益：{pct(baseline['strategy_return'])}",
        f"- 最大回撤：{pct(baseline['max_drawdown'])}",
        f"- Sharpe：{number(baseline['sharpe'])}",
        f"- 胜率：{pct(baseline['positive_trade_ratio'])}",
        f"- 平均入选：{number(baseline['avg_stock_count'])}",
        "",
        "## 组件使用",
        "",
    ]
    for item in pack["component_usage"]:
        lines.extend([
            f"### {item['component_name']}",
            "",
            f"- 角色：`{item['execution_role']}`",
            f"- 市场状态：`{item['market_regime']}`",
            f"- 样本调仓：{item['sample_trades']}",
            f"- 收益：{pct(item['strategy_return'])}",
            f"- 回撤：{pct(item['max_drawdown'])}",
            f"- Sharpe：{number(item['sharpe'])}",
            "",
        ])
    lines.extend(["## 门槛检查", ""])
    for check in pack["checks"]:
        mark = "通过" if check["passed"] else "未过"
        lines.append(f"- {check['name']}：{mark}，{check['detail']}")
    lines.extend(["", "## 结论", "", pack["decision_reason"], ""])
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    validation = load_json(VALIDATION_PATH)
    execution_pack = load_json(EXECUTION_PACK_PATH)
    components = executable_components(execution_pack, validation)
    trades = build_switch_trades(components)
    baseline = metric_summary(trades, cost_multiplier=1.0)
    stress_1_5 = metric_summary(trades, cost_multiplier=1.5)
    stress_2_0 = metric_summary(trades, cost_multiplier=2.0)
    checks, decision = audit_switch(trades, components, baseline, stress_1_5, stress_2_0)
    failed = [item for item in checks if not item["passed"]]
    pack = {
        "source": "akshare_local_regime_switch_paper_watch_strategy",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "inputs": {
            "validation": str(VALIDATION_PATH.relative_to(ROOT)),
            "execution_pack": str(EXECUTION_PACK_PATH.relative_to(ROOT)),
        },
        "data_policy": "只组合 AkShare 本地真实 OHLCV 已生成的执行组件 trade_records；不新增收益、不扩展未审计分层、不伪造交易状态。",
        "decision": decision,
        "decision_reason": (
            "低波动主观察与高波动备选均来自已审计执行包，组合后通过样本、收益、回撤、Sharpe、成本压力和近期触发门槛。"
            if decision == "ready_local_switch_paper_watch"
            else "组合后仍有硬门槛未通过，不能作为本地切换策略进入模拟观察。"
        ),
        "gates": GATES,
        "checks": checks,
        "failed_checks": failed,
        "component_count": len(components),
        "components": [
            {
                "id": item["id"],
                "strategy_id": item["strategy_id"],
                "strategy_name": item["strategy_name"],
                "execution_role": item["execution_role"],
                "allowed_market_regime": item["allowed_market_regime"],
                "allowed_liquidity_bucket": item["allowed_liquidity_bucket"],
            }
            for item in components
        ],
        "baseline": baseline,
        "cost_stress": {
            "cost_1_0x": baseline,
            "cost_1_5x": stress_1_5,
            "cost_2_0x": stress_2_0,
        },
        "segments": segment_metrics(trades),
        "component_usage": route_usage(trades),
        "trade_count": baseline["sample_trades"],
        "trade_records_preview": preview_records(trades),
        "paper_scope": "仅限 AkShare 执行包中的低波动收缩突破主观察与高波动均值回归备选；进入真实模拟盘前仍需 JoinQuant 交易可行性复核。",
    }
    OUTPUT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "output": str(OUTPUT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "decision": pack["decision"],
        "trade_count": pack["trade_count"],
        "strategy_return": pack["baseline"]["strategy_return"],
        "max_drawdown": pack["baseline"]["max_drawdown"],
        "sharpe": pack["baseline"]["sharpe"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
