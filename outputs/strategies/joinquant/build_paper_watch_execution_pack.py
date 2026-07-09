#!/usr/bin/env python3
"""Build a controlled paper-watch execution pack from audited JoinQuant routes."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULT_DIR = ROOT / "outputs" / "strategies" / "joinquant"
INPUT_PATH = RESULT_DIR / "paper_watch_routes_20260709.json"
READINESS_PATH = RESULT_DIR / "paper_watch_readiness_audit_20260709.json"
OUTPUT_PATH = RESULT_DIR / "paper_watch_execution_pack_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "paper-watch-execution-pack-20260709.md"


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def optional_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def display_bucket(value) -> str:
    return value or "不限制市值层"


def build_route_config(route: dict) -> dict:
    drawdown = float(route.get("max_drawdown") or 0)
    strategy_return = float(route.get("strategy_return") or 0)
    sharpe = float(route.get("sharpe") or 0)
    sample_dates = int(route.get("sample_dates") or 0)
    win_rate = float(route.get("win_rate") or 0)
    layer = route.get("layer") or "-"
    is_adaptive = route.get("market_regime") == "adaptive_high_low_volatility"
    entry_gate = [
        "高波动环境使用 JQ质量利润流动性策略 v1",
        "低波动环境使用 K线辅助确认策略",
        "中波动环境空仓/观察，不强行开仓",
        "只使用已导入 JoinQuant 真实曲线验证过的组件策略和市场状态",
    ] if is_adaptive else [
        f"只在 {layer} 层开仓",
        "只使用原策略交易包生成的候选池和排序分数",
        "不得使用未通过 maturity audit 的市场波动/市值层",
        "若当期候选少于 10 只，记录信号但不开新仓",
    ]

    return {
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "allowed_market_regime": route.get("market_regime"),
        "allowed_market_cap_bucket": route.get("market_cap_bucket"),
        "allowed_layer": layer,
        "rebalance_days": 5,
        "position_mode": "equal_weight_top_30_or_available",
        "entry_gate": entry_gate,
        "paper_watch_baseline": {
            "sample_dates": sample_dates,
            "strategy_return": strategy_return,
            "annual_return": optional_float(route.get("annual_return")),
            "max_drawdown": drawdown,
            "sharpe": sharpe,
            "win_rate": win_rate,
            "source": route.get("source"),
        },
        "pause_rules": [
            {
                "rule": "rolling_drawdown_guard",
                "trigger": round(min(drawdown * 1.25, -0.08), 6),
                "meaning": "模拟盘回撤超过历史该路线最大回撤的 1.25 倍，或超过 8%，先暂停新开仓。",
            },
            {
                "rule": "three_rebalance_underperformance",
                "trigger": "连续3个调仓周期跑输沪深300且命中率低于历史胜率",
                "meaning": "说明样本外状态可能劣化，暂停并复核分层环境。",
            },
            {
                "rule": "layer_violation",
                "trigger": "市场状态不满足执行配置",
                "meaning": "不满足受控路线，禁止开仓；切换策略在中波动默认空仓。",
            },
        ],
        "daily_observation_fields": [
            "date",
            "strategy_id",
            "market_regime",
            "market_cap_bucket",
            "candidate_count",
            "selected_count",
            "paper_nav",
            "paper_daily_return",
            "hs300_daily_return",
            "rolling_drawdown",
            "turnover",
            "slippage",
            "industry_top_exposure",
            "pause_flag",
            "notes",
        ],
        "evidence": {
            "data_policy": route.get("data_policy"),
            "paper_scope": route.get("paper_scope"),
            "checks": route.get("checks", {}),
        },
    }


def write_doc(pack: dict) -> None:
    lines = [
        "# 受控模拟观察执行包",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 路线数量：{pack['route_count']}",
        "",
        "## 执行边界",
        "",
    ]
    lines.extend(f"- {item}" for item in pack["global_controls"])
    lines.extend(["", "## 首批路线", ""])
    for route in pack["routes"]:
        baseline = route["paper_watch_baseline"]
        lines.extend([
            f"### {route['strategy_name']} - {route['allowed_layer']}",
            "",
            f"- 允许波动层：`{route['allowed_market_regime']}`",
            f"- 允许市值层：`{display_bucket(route['allowed_market_cap_bucket'])}`",
            f"- 真实回测收益：{pct(baseline['strategy_return'])}",
            f"- 真实最大回撤：{pct(baseline['max_drawdown'])}",
            f"- Sharpe：{baseline['sharpe']:.2f}",
            f"- 样本调仓日：{baseline['sample_dates']}",
            "- 暂停规则：",
        ])
        lines.extend(f"  - {item['meaning']}" for item in route["pause_rules"])
        lines.append("")
    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    source = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    if READINESS_PATH.exists():
        readiness = json.loads(READINESS_PATH.read_text(encoding="utf-8"))
        routes = readiness.get("recommended_routes") if isinstance(readiness.get("recommended_routes"), list) else []
        input_path = READINESS_PATH if routes else INPUT_PATH
    else:
        routes = []
        input_path = INPUT_PATH
    if not routes:
        routes = source.get("routes") if isinstance(source.get("routes"), list) else []
    pack = {
        "source": "joinquant_controlled_paper_watch_execution_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(input_path.relative_to(ROOT)),
        "data_policy": "优先从模拟观察就绪审计推荐路线生成执行配置；不新增收益、不扩展未通过分层。",
        "status": "ready" if routes else "not_ready",
        "route_count": len(routes),
        "global_controls": [
            "只允许配置中的市场波动层和市值层开仓",
            "模拟盘记录净值、回撤、换手、滑点、行业暴露和是否触发暂停",
            "任一暂停规则触发后只允许平仓或观察，重新开仓必须重新审计",
            "执行包不是整策略实盘批准，只是受控样本外观察配置",
        ],
        "routes": [build_route_config(route) for route in routes],
    }
    OUTPUT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "output": str(OUTPUT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "status": pack["status"],
        "route_count": pack["route_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
