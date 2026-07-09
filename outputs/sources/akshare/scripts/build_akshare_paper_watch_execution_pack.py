#!/usr/bin/env python3
"""Build controlled paper-watch execution pack for AkShare local routes."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
RESULTS_DIR = ROOT / "outputs" / "sources" / "akshare" / "results"
DOCS_DIR = ROOT / "outputs" / "_docs"
INPUT_PATH = RESULTS_DIR / "akshare_paper_watch_readiness_audit_20260709.json"
OUTPUT_PATH = RESULTS_DIR / "akshare_paper_watch_execution_pack_20260709.json"
DOC_PATH = DOCS_DIR / "akshare-paper-watch-execution-pack-20260709.md"


PRIMARY_ROUTE_IDS = {
    "ak_low_vol_contraction_breakout_mid_liquidity",
    "ak_high_vol_mean_reversion_mid_liquidity",
}


def pct(value: float | None) -> str:
    if value is None:
        return "NA"
    return f"{value * 100:.2f}%"


def optional_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def route_role(route: dict) -> str:
    if route.get("id") == "ak_low_vol_contraction_breakout_mid_liquidity":
        return "primary_local_sleeve"
    if route.get("id") == "ak_high_vol_mean_reversion_mid_liquidity":
        return "high_volatility_backup_sleeve"
    return "candidate_monitor"


def build_pause_rules(route: dict) -> list[dict]:
    drawdown = float(route.get("max_drawdown") or 0)
    win_rate = float(route.get("win_rate") or 0)
    drawdown_trigger = round(max(drawdown * 1.5, -0.08), 6)
    if route.get("id") == "ak_low_vol_volume_trend_mid_liquidity":
        drawdown_trigger = round(max(drawdown * 1.2, -0.08), 6)
    return [
        {
            "rule": "local_rolling_drawdown_guard",
            "trigger": drawdown_trigger,
            "meaning": "本地模拟净值回撤超过历史最大回撤的压力阈值，或超过 8%，暂停新开仓并复核数据口径。",
        },
        {
            "rule": "three_rebalance_underperformance",
            "trigger": f"连续3个5日调仓周期跑输沪深300且命中率低于历史胜率 {win_rate:.2f}",
            "meaning": "说明本地路线样本外可能失效，暂停该路线并等待重新审计。",
        },
        {
            "rule": "layer_violation",
            "trigger": f"市场状态不为 {route.get('market_regime')} 或流动性分层不为 {route.get('liquidity_bucket')}",
            "meaning": "不满足本地受控分层时，只记录信号，不允许开仓。",
        },
        {
            "rule": "candidate_count_guard",
            "trigger": "候选数少于 15 或实际可买入少于 10",
            "meaning": "容量不足时不开新仓，避免把小样本强行扩成可交易策略。",
        },
        {
            "rule": "data_source_guard",
            "trigger": "AkShare 行情缺失、复权异常、涨跌停/停牌状态无法确认",
            "meaning": "数据源或交易可行性不完整时，暂停该路线并等待 JoinQuant/模拟盘复核。",
        },
    ]


def build_route_config(route: dict) -> dict:
    role = route_role(route)
    is_primary = role in {"primary_local_sleeve", "high_volatility_backup_sleeve"}
    return {
        "id": route.get("id"),
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "execution_role": role,
        "allowed_market_regime": route.get("market_regime"),
        "allowed_liquidity_bucket": route.get("liquidity_bucket"),
        "allowed_layer": route.get("layer"),
        "rebalance_days": 5,
        "position_mode": "equal_weight_top_20_or_available",
        "max_position_weight": 0.05,
        "paper_watch_priority": 1 if role == "primary_local_sleeve" else 2 if role == "high_volatility_backup_sleeve" else 3,
        "can_enter_paper_watch": is_primary,
        "entry_gate": [
            f"只在 {route.get('market_regime')} / {route.get('liquidity_bucket')} 分层观察",
            "只使用 AkShare 本地真实 OHLCV 因子脚本当期生成的候选池和排序分数",
            "候选池每期 Top20 等权，若可交易股票少于 10 只则只记录信号",
            "不得扩展到未审计股票池、未审计分层或未审计成本口径",
            "进入真实模拟盘前继续补 JoinQuant 复核、行业暴露、市值、涨跌停和停牌检查",
        ],
        "paper_watch_baseline": {
            "sample_dates": int(route.get("sample_trades") or 0),
            "strategy_return": optional_float(route.get("strategy_return")),
            "annual_return": None,
            "max_drawdown": optional_float(route.get("max_drawdown")),
            "sharpe": optional_float(route.get("sharpe")),
            "win_rate": optional_float(route.get("win_rate")),
            "avg_selected_count": optional_float(route.get("avg_selected_count")),
            "source": route.get("source"),
        },
        "cost_stress": route.get("cost_stress", {}),
        "pause_rules": build_pause_rules(route),
        "daily_observation_fields": [
            "date",
            "strategy_id",
            "market_regime",
            "liquidity_bucket",
            "candidate_count",
            "selected_count",
            "selected_codes",
            "paper_nav",
            "paper_period_return_5d",
            "hs300_period_return_5d",
            "rolling_drawdown",
            "turnover_estimate",
            "industry_top_exposure",
            "market_cap_bucket_exposure",
            "limit_up_down_count",
            "suspended_count",
            "pause_flag",
            "notes",
        ],
        "evidence": {
            "data_policy": route.get("data_policy"),
            "paper_scope": route.get("paper_scope"),
            "checks": route.get("checks", []),
            "segments": route.get("segments", {}),
            "segment_details": route.get("segment_details", {}),
        },
    }


def write_doc(pack: dict) -> None:
    lines = [
        "# AkShare 本地受控模拟观察执行包",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 路线数量：{pack['route_count']}",
        f"- 可直接进入本地模拟观察候选：{pack['paper_watch_route_count']}",
        "",
        "## 全局约束",
        "",
    ]
    lines.extend(f"- {item}" for item in pack["global_controls"])
    lines.extend(["", "## 主观察路线", ""])
    for route in pack["routes"]:
        if route["execution_role"] == "candidate_monitor":
            continue
        baseline = route["paper_watch_baseline"]
        lines.extend([
            f"### {route['strategy_name']}",
            "",
            f"- 执行角色：`{route['execution_role']}`",
            f"- 允许分层：`{route['allowed_layer']}`",
            f"- 真实本地收益：{pct(baseline['strategy_return'])}",
            f"- 真实最大回撤：{pct(baseline['max_drawdown'])}",
            f"- Sharpe：{baseline['sharpe']:.2f}",
            f"- 样本调仓日：{baseline['sample_dates']}",
            f"- 平均入选：{baseline['avg_selected_count']:.2f}",
            "- 暂停规则：",
        ])
        lines.extend(f"  - {item['meaning']}" for item in route["pause_rules"])
        lines.append("")
    lines.extend(["## 候选监控路线", ""])
    for route in pack["routes"]:
        if route["execution_role"] != "candidate_monitor":
            continue
        baseline = route["paper_watch_baseline"]
        lines.append(
            f"- {route['strategy_name']}：收益 {pct(baseline['strategy_return'])}，"
            f"回撤 {pct(baseline['max_drawdown'])}，Sharpe {baseline['sharpe']:.2f}。"
        )
    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    source = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    routes = source.get("recommended_routes") if isinstance(source.get("recommended_routes"), list) else []
    configs = [build_route_config(route) for route in routes]
    configs = sorted(configs, key=lambda item: item["paper_watch_priority"])
    pack = {
        "source": "akshare_local_paper_watch_execution_pack",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(INPUT_PATH.relative_to(ROOT)),
        "data_policy": "从 AkShare 本地严格就绪审计生成执行配置；不新增收益、不扩展未审计股票池或分层。",
        "status": "ready" if configs else "not_ready",
        "route_count": len(configs),
        "paper_watch_route_count": sum(1 for item in configs if item["can_enter_paper_watch"]),
        "global_controls": [
            "AkShare 路线只作为本地真实 OHLCV 证据源，不等同于 JoinQuant 原生策略回测。",
            "只允许执行包中的市场波动层和流动性层开仓观察。",
            "模拟盘必须记录净值、回撤、相对沪深300、候选数量、行业暴露、市值暴露、涨跌停和停牌数量。",
            "任一暂停规则触发后只允许平仓或观察，重新开仓必须重新审计。",
            "进入真实模拟盘前优先补 JoinQuant 复核结果。",
        ],
        "routes": configs,
    }
    OUTPUT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "output": str(OUTPUT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "status": pack["status"],
        "route_count": pack["route_count"],
        "paper_watch_route_count": pack["paper_watch_route_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
