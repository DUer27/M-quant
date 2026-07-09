#!/usr/bin/env python3
"""Build a high/low-volatility switching strategy from real JoinQuant curves."""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
RESULT_PATH = ROOT / "outputs" / "strategies" / "joinquant" / "regime_switch_quality_kline_v1_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "regime-switch-quality-kline-v1-20260709.md"

COMPONENTS = [
    {
        "strategy_id": "jq_quality_profit_liquidity_v1",
        "strategy_name": "JQ质量利润流动性策略 v1",
        "market_regime": "high_volatility",
        "market_cap_bucket": None,
        "role": "高波动环境主策略",
    },
    {
        "strategy_id": "kline_assisted_confirmation",
        "strategy_name": "K线辅助确认策略",
        "market_regime": "low_volatility",
        "market_cap_bucket": None,
        "role": "低波动环境确认策略",
    },
]


def load_results() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("results", [])


def normalize(value):
    return None if value in ("", None) else value


def find_component(results: list[dict], component: dict) -> dict:
    for item in results:
        if item.get("result_type") != "strategy_trading_backtest":
            continue
        if item.get("strategy_id") != component["strategy_id"]:
            continue
        if normalize(item.get("market_regime")) != normalize(component["market_regime"]):
            continue
        if normalize(item.get("market_cap_bucket")) != normalize(component["market_cap_bucket"]):
            continue
        return item
    raise ValueError(f"缺少组件真实回测结果：{component}")


def max_drawdown(equity: pd.Series) -> float:
    return float((equity / equity.cummax() - 1).min())


def sharpe_ratio(returns: pd.Series, periods_per_year: float = 252 / 5) -> float | None:
    clean = returns.dropna()
    if clean.empty or clean.std(ddof=1) == 0:
        return None
    return float(clean.mean() / clean.std(ddof=1) * math.sqrt(periods_per_year))


def calc_metrics(rows: list[dict], cost_multiplier: float = 1.0) -> dict:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return {"periods": 0}
    frame["date"] = pd.to_datetime(frame["date"])
    period_return = pd.to_numeric(frame["gross_return"], errors="coerce") - (
        pd.to_numeric(frame["cost"], errors="coerce").fillna(0) * cost_multiplier
    )
    equity = (1 + period_return.fillna(0)).cumprod()
    return {
        "periods": int(len(frame)),
        "first_date": frame["date"].min().strftime("%Y-%m-%d"),
        "last_date": frame["date"].max().strftime("%Y-%m-%d"),
        "strategy_return": float(equity.iloc[-1] - 1),
        "max_drawdown": max_drawdown(equity),
        "sharpe": sharpe_ratio(period_return),
        "win_rate": float((period_return > 0).mean()),
        "avg_turnover": float(pd.to_numeric(frame["turnover"], errors="coerce").mean()),
        "avg_selected_count": float(pd.to_numeric(frame["selected_count"], errors="coerce").mean()),
    }


def build_rows(results: list[dict]) -> tuple[list[dict], list[dict]]:
    rows = []
    component_summaries = []
    for component in COMPONENTS:
        result = find_component(results, component)
        curve = result.get("net_value_curve") or []
        for point in curve:
            rows.append({
                **point,
                "component_strategy_id": result.get("strategy_id"),
                "component_strategy_name": result.get("strategy_name"),
                "component_layer": result.get("layer"),
                "market_regime": result.get("market_regime"),
                "market_cap_bucket": result.get("market_cap_bucket"),
            })
        component_summaries.append({
            **component,
            "layer": result.get("layer"),
            "sample_dates": result.get("sample_dates"),
            "strategy_return": result.get("strategy_return"),
            "max_drawdown": result.get("max_drawdown"),
            "sharpe": result.get("sharpe"),
            "win_rate": result.get("daily_win_rate"),
            "date_range": result.get("date_range"),
            "source": result.get("source"),
            "data_policy": result.get("data_policy"),
        })

    frame = pd.DataFrame(rows)
    duplicate_dates = frame[pd.to_datetime(frame["date"]).duplicated(keep=False)]["date"].tolist()
    if duplicate_dates:
        raise ValueError(f"组件曲线日期重叠，不能直接组合：{duplicate_dates[:5]}")
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values("date")
    out_rows = []
    net_value = 1.0
    for _, row in frame.iterrows():
        period_return = float(row["gross_return"]) - float(row.get("cost") or 0)
        net_value *= 1 + period_return
        item = row.to_dict()
        item["date"] = pd.Timestamp(item["date"]).strftime("%Y-%m-%d")
        item["period_return"] = period_return
        item["net_value"] = net_value
        out_rows.append(item)
    return out_rows, component_summaries


def write_doc(pack: dict) -> None:
    base = pack["baseline"]
    stress = pack["cost_stress"]
    lines = [
        "# 市场状态切换策略 v1",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 数据原则：{pack['data_policy']}",
        "- 逻辑：高波动使用 JQ质量利润流动性策略，低波动使用 K线辅助确认策略，中波动空仓/观察。",
        f"- 样本期数：{base['periods']}",
        f"- 收益：{base['strategy_return'] * 100:.2f}%",
        f"- 最大回撤：{base['max_drawdown'] * 100:.2f}%",
        f"- Sharpe：{base['sharpe']:.2f}",
        f"- 1.5x 成本压力收益：{stress['cost_1_5x']['strategy_return'] * 100:.2f}%",
        f"- 2.0x 成本压力收益：{stress['cost_2_0x']['strategy_return'] * 100:.2f}%",
        "",
        "## 组件",
        "",
    ]
    for component in pack["components"]:
        lines.append(
            f"- `{component['strategy_name']}`：{component['layer']}，收益 {component['strategy_return'] * 100:.2f}%，回撤 {component['max_drawdown'] * 100:.2f}%，Sharpe {component['sharpe']:.2f}。"
        )
    DOC_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    results = load_results()
    rows, components = build_rows(results)
    split_at = len(rows) // 2
    pack = {
        "source": "derived_from_joinquant_real_trading_curves",
        "result_type": "derived_strategy_trading_backtest",
        "strategy_id": "regime_switch_quality_kline_v1",
        "strategy_name": "市场状态切换策略 v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_policy": "只组合两条已导入 JoinQuant 真实交易净值曲线的单期 gross_return/cost/turnover；不生成虚构收益；中波动环境默认空仓/观察。",
        "logic": {
            "high_volatility": "jq_quality_profit_liquidity_v1",
            "low_volatility": "kline_assisted_confirmation",
            "medium_volatility": "cash_watch",
        },
        "components": components,
        "baseline": calc_metrics(rows, 1.0),
        "cost_stress": {
            "cost_1_0x": calc_metrics(rows, 1.0),
            "cost_1_5x": calc_metrics(rows, 1.5),
            "cost_2_0x": calc_metrics(rows, 2.0),
        },
        "split": {
            "first_half": calc_metrics(rows[:split_at], 1.0),
            "second_half": calc_metrics(rows[split_at:], 1.0),
        },
        "net_value_curve": rows,
    }
    RESULT_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    write_doc(pack)
    print(json.dumps({
        "result": str(RESULT_PATH.relative_to(ROOT)),
        "doc": str(DOC_PATH.relative_to(ROOT)),
        "baseline": pack["baseline"],
        "split": pack["split"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
