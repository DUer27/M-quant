#!/usr/bin/env python3
"""Build the structured reversal Top100 index-enhancement research package."""

from __future__ import annotations

import argparse
import glob
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

import analyze_structured_reversal_factor as analyzer


ROOT = Path(__file__).resolve().parents[4]
RESULT_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
REPORT_DIR = ROOT / "outputs" / "_docs"
PLATFORM_STRATEGY_DEFINITIONS = ROOT / "platform" / "quant-factor-platform" / "data" / "strategy-definitions.json"
POSITION_STRESS_SELECTION = ROOT / "platform" / "quant-factor-platform" / "data" / "position-stress-selection.json"
SYMBOL_DIR = ROOT / "outputs" / "sources" / "joinquant" / "symbols"

STRATEGY_ID = "structured_reversal_csi500_v1"
STRATEGY_NAME = "长江结构化反转因子指数增强策略 v1"
SOURCE = "joinquant_structured_reversal_csi500_v1"
DATASET = "csi500"
SCORE_COL = "structured_reversal_enhanced_score"
CORE_FACTOR_COL = "structured_reversal_score"
SCORE_CANDIDATES = [
    "structured_reversal_enhanced_score",
    "structured_reversal_confirmed_score",
    "structured_reversal_tradeable_score",
    "structured_reversal_score",
]
HORIZONS = [1, 5, 10, 20]
PRIMARY_REBALANCE_DAYS = 5
TRADING_REBALANCE_DAYS_LIST = [1, 5, 10, 20]
TOP_N = 100
BUFFER_N = 150
BUY_RANK_CUTOFF = 80
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002
LOW_VOL_POSITION = 0.65
MEDIUM_VOL_POSITION = 0.90
HIGH_VOL_POSITION = 1.00
PAPER_WATCH_GATE = {
    "min_factor_gate_pass_count": 1,
    "min_strategy_annual_return": 0.03,
    "min_active_annual_return": 0.03,
    "min_active_sharpe": 0.5,
    "max_drawdown_floor": -0.25,
    "min_active_win_rate": 0.52,
    "min_sample_dates": 120,
}


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def extract_json_object(text: str) -> Any:
    return analyzer.extract_json_object(text)


def expand_inputs(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        matches = glob.glob(pattern) if any(ch in pattern for ch in "*?[") else [pattern]
        paths.extend(Path(item).resolve() for item in matches if Path(item).is_file())
    return sorted(dict.fromkeys(paths))


def load_table(paths: list[Path]) -> tuple[pd.DataFrame, dict[str, Any]]:
    return analyzer.load_table(paths)


def max_drawdown(values: list[float]) -> float | None:
    if not values:
        return None
    peak = values[0]
    result = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            result = min(result, value / peak - 1)
    return clean_float(result)


def position_scale(frame: pd.DataFrame) -> float:
    regime = frame["market_regime"].dropna().mode().iloc[0] if "market_regime" in frame.columns and not frame["market_regime"].dropna().empty else "medium_volatility"
    if regime == "low_volatility":
        return LOW_VOL_POSITION
    if regime == "high_volatility":
        return HIGH_VOL_POSITION
    return MEDIUM_VOL_POSITION


def select_with_buffer(frame: pd.DataFrame, previous_codes: set[str], score_col: str = SCORE_COL) -> pd.DataFrame:
    ranked = frame.sort_values(score_col, ascending=False).copy()
    ranked["rank"] = np.arange(1, len(ranked) + 1)
    keep = ranked[(ranked["code"].isin(previous_codes)) & (ranked["rank"] <= BUFFER_N)]
    buy = ranked[(~ranked["code"].isin(set(keep["code"]))) & (ranked["rank"] <= BUY_RANK_CUTOFF)]
    picked = pd.concat([keep, buy], ignore_index=True).drop_duplicates("code", keep="first")
    if len(picked) < TOP_N:
        fill = ranked[~ranked["code"].isin(set(picked["code"]))].head(TOP_N - len(picked))
        picked = pd.concat([picked, fill], ignore_index=True)
    return picked.sort_values("rank").head(TOP_N).copy()


def simulate_trading(table: pd.DataFrame, rebalance_days: int = PRIMARY_REBALANCE_DAYS, layer_label: str = "整体", layer_meta: dict[str, Any] | None = None, score_col: str = SCORE_COL) -> dict[str, Any] | None:
    layer_meta = layer_meta or {}
    future_col = f"future_return_{rebalance_days}"
    if future_col not in table.columns or score_col not in table.columns:
        return None
    work = table.replace([np.inf, -np.inf], np.nan).dropna(subset=[score_col, future_col]).copy()
    if work.empty:
        return None
    nav = 1.0
    bench_nav = 1.0
    active_nav = 1.0
    previous_weights: dict[str, float] = {}
    previous_codes: set[str] = set()
    period_returns = []
    benchmark_returns = []
    active_returns = []
    turnover_values = []
    curve = []
    latest_selection = pd.DataFrame()
    sample_trades = 0

    for day, frame in work.sort_values(["date", score_col], ascending=[True, False]).groupby("date"):
        if len(frame) < max(120, TOP_N):
            continue
        picked = select_with_buffer(frame, previous_codes, score_col=score_col)
        if picked.empty:
            continue
        scale = position_scale(frame)
        weight = scale / float(len(picked))
        current_weights = {code: weight for code in picked["code"].tolist()}
        all_codes = set(previous_weights) | set(current_weights)
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked[future_col] * weight).sum())
        cash_return = 0.0 * (1 - scale)
        benchmark_return = clean_float(frame[future_col].mean()) or 0.0
        cost = traded_notional * (TRADING_COST_RATE + TRADING_SLIPPAGE_RATE)
        net_return = gross_return + cash_return - cost
        active_return = net_return - benchmark_return
        nav *= 1 + net_return
        bench_nav *= 1 + benchmark_return
        active_nav *= 1 + active_return
        period_returns.append(net_return)
        benchmark_returns.append(benchmark_return)
        active_returns.append(active_return)
        turnover_values.append(traded_notional)
        sample_trades += int(len(picked))
        latest_selection = picked.copy()
        curve.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "net_value": clean_float(nav),
            "benchmark_net_value": clean_float(bench_nav),
            "active_net_value": clean_float(active_nav),
            "period_return": clean_float(net_return),
            "benchmark_return": clean_float(benchmark_return),
            "active_return": clean_float(active_return),
            "cost": clean_float(cost),
            "turnover": clean_float(traded_notional),
            "position_scale": clean_float(scale),
            "selected_count": int(len(picked)),
        })
        previous_weights = current_weights
        previous_codes = set(picked["code"])

    if not period_returns:
        return None
    periods = len(period_returns)
    annual_scale = 252.0 / float(rebalance_days)
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    active_std = float(np.std(active_returns, ddof=1)) if periods > 1 else 0.0
    strategy_annual = clean_float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    benchmark_annual = clean_float(bench_nav ** (annual_scale / periods) - 1) if bench_nav > 0 else None
    active_annual = clean_float(active_nav ** (annual_scale / periods) - 1) if active_nav > 0 else None
    record = {
        "source": SOURCE,
        "result_type": "strategy_trading_backtest",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "dataset": DATASET,
        "horizon": int(rebalance_days),
        "rebalance_days": int(rebalance_days),
        "horizon_label": f"{rebalance_days}日调仓交易",
        "layer": layer_label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "strategy_return": clean_float(nav - 1),
        "benchmark_return": clean_float(bench_nav - 1),
        "excess_return": clean_float(active_nav - 1),
        "strategy_annual_return": strategy_annual,
        "benchmark_annual_return": benchmark_annual,
        "active_annual_return": active_annual,
        "annual_return": strategy_annual,
        "final_net_value": clean_float(nav),
        "max_drawdown": max_drawdown([item["net_value"] for item in curve]),
        "active_max_drawdown": max_drawdown([item["active_net_value"] for item in curve]),
        "sharpe": clean_float(np.mean(period_returns) / period_std * math.sqrt(annual_scale)) if period_std > 0 else None,
        "active_sharpe": clean_float(np.mean(active_returns) / active_std * math.sqrt(annual_scale)) if active_std > 0 else None,
        "daily_win_rate": clean_float(np.mean([ret > 0 for ret in period_returns])),
        "active_win_rate": clean_float(np.mean([ret > 0 for ret in active_returns])),
        "period_mean_return": clean_float(np.mean(period_returns)),
        "active_period_mean_return": clean_float(np.mean(active_returns)),
        "avg_turnover": clean_float(np.mean(turnover_values)),
        "total_turnover": clean_float(np.sum(turnover_values)),
        "cost_rate": TRADING_COST_RATE,
        "slippage_rate": TRADING_SLIPPAGE_RATE,
        "top_n": TOP_N,
        "buffer_n": BUFFER_N,
        "buy_rank_cutoff": BUY_RANK_CUTOFF,
        "score_col": score_col,
        "score_name": score_col,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "net_value_curve": curve[-120:],
        "latest_selected_codes": latest_selection["code"].astype(str).str.slice(0, 6).tolist() if not latest_selection.empty else [],
        "latest_selected_rows": json.loads(latest_selection.head(TOP_N).replace([np.inf, -np.inf], np.nan).to_json(orient="records", force_ascii=False, date_format="iso")) if not latest_selection.empty else [],
        "data_policy": "JoinQuant 10m结构化反转因子 Top100 等权；缓冲区降低换手；扣单边成本和滑点；低波动环境按65%仓位。",
    }
    record.update(layer_meta)
    return record


def event_backtest(table: pd.DataFrame, score_col: str = SCORE_COL) -> list[dict[str, Any]]:
    records = []
    for horizon in HORIZONS:
        future_col = f"future_return_{horizon}"
        if future_col not in table.columns:
            continue
        daily_strategy = []
        daily_bench = []
        for _day, frame in table.dropna(subset=[score_col, future_col]).groupby("date"):
            if len(frame) < max(120, TOP_N):
                continue
            picked = frame.sort_values(score_col, ascending=False).head(TOP_N)
            daily_strategy.append(float(picked[future_col].mean()))
            daily_bench.append(float(frame[future_col].mean()))
        if not daily_strategy:
            continue
        strategy = pd.Series(daily_strategy, dtype=float)
        bench = pd.Series(daily_bench, dtype=float)
        active = strategy - bench
        records.append({
            "source": SOURCE,
            "result_type": "strategy_backtest",
            "strategy_id": STRATEGY_ID,
            "strategy_name": STRATEGY_NAME,
            "dataset": DATASET,
            "horizon": int(horizon),
            "sample_dates": int(len(strategy)),
            "sample_trades": int(len(strategy) * TOP_N),
            "mean_return": clean_float(strategy.mean()),
            "benchmark_mean_return": clean_float(bench.mean()),
            "active_mean_return": clean_float(active.mean()),
            "active_positive_ratio": clean_float((active > 0).mean()),
            "score_col": score_col,
            "score_name": "结构化反转增强总分（structured_reversal_enhanced_score）",
            "data_policy": "Top100 事件持有收益诊断；正式准入以5日调仓交易净值为主。",
        })
    return records


def trading_quality_key(record: dict[str, Any]) -> tuple[float, float, float, float]:
    return (
        float(record.get("active_annual_return") or -999),
        float(record.get("active_sharpe") or -999),
        float(record.get("strategy_annual_return") or -999),
        float(record.get("active_win_rate") or -999),
    )


def choose_score_col(table: pd.DataFrame, factor_analysis: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    records = []
    factor_rows = [
        row for row in (factor_analysis.get("records") or [])
        if row.get("result_type") == "factor_backtest" and row.get("horizon") == analyzer.PRIMARY_HORIZON
    ]
    factor_by_col = {row.get("factor"): row for row in factor_rows}
    for score_col in SCORE_CANDIDATES:
        if score_col not in table.columns:
            continue
        trading = simulate_trading(table, rebalance_days=PRIMARY_REBALANCE_DAYS, score_col=score_col)
        factor_row = factor_by_col.get(score_col) or {}
        records.append({
            "score_col": score_col,
            "factor_gate_passed": bool(factor_row.get("gate_passed")),
            "rank_ic_mean": factor_row.get("rank_ic_mean"),
            "rank_ic_t": factor_row.get("rank_ic_t"),
            "long_short_annual": factor_row.get("long_short_annual"),
            "top_excess_annual": factor_row.get("top_excess_annual"),
            "trading": trading,
            "selection_reason": "候选分数真实交易表现排序；不降低因子和交易门槛。",
        })
    passed = [row for row in records if row["factor_gate_passed"] and row.get("trading")]
    pool = passed or [row for row in records if row.get("trading")]
    if not pool:
        return SCORE_COL, records
    best = sorted(pool, key=lambda row: trading_quality_key(row["trading"]), reverse=True)[0]
    return best["score_col"], records


def build_strategy_records(table: pd.DataFrame, score_col: str = SCORE_COL) -> list[dict[str, Any]]:
    records = event_backtest(table, score_col=score_col)
    for days in [PRIMARY_REBALANCE_DAYS] + [item for item in TRADING_REBALANCE_DAYS_LIST if item != PRIMARY_REBALANCE_DAYS]:
        trading = simulate_trading(table, rebalance_days=days, score_col=score_col)
        if trading:
            records.append(trading)
    if "market_regime" in table.columns:
        regime_names = {
            "high_volatility": "高波动",
            "medium_volatility": "中波动",
            "low_volatility": "低波动",
        }
        for regime, part in table.dropna(subset=["market_regime"]).groupby("market_regime"):
            meta = {"market_regime": regime, "market_regime_name": regime_names.get(str(regime), str(regime)), "review_layer_type": "market_volatility"}
            trading = simulate_trading(part.copy(), rebalance_days=PRIMARY_REBALANCE_DAYS, layer_label=meta["market_regime_name"], layer_meta=meta, score_col=score_col)
            if trading:
                records.append(trading)
    return records


def paper_watch_label(records: list[dict[str, Any]], factor_analysis: dict[str, Any]) -> tuple[str, str, dict[str, bool]]:
    factor_rows = [factor_analysis.get("primary_factor_gate"), factor_analysis.get("enhanced_factor_gate")]
    factor_pass_count = sum(1 for row in factor_rows if row and row.get("gate_passed"))
    overall = next((row for row in records if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS and not row.get("market_regime")), None)
    checks = {
        "factor_gate_pass_count": factor_pass_count >= PAPER_WATCH_GATE["min_factor_gate_pass_count"],
        "sample_dates": overall is not None and (overall.get("sample_dates") or 0) >= PAPER_WATCH_GATE["min_sample_dates"],
        "strategy_annual_return": overall is not None and (overall.get("strategy_annual_return") or -999) >= PAPER_WATCH_GATE["min_strategy_annual_return"],
        "active_annual_return": overall is not None and (overall.get("active_annual_return") or -999) >= PAPER_WATCH_GATE["min_active_annual_return"],
        "active_sharpe": overall is not None and (overall.get("active_sharpe") or -999) >= PAPER_WATCH_GATE["min_active_sharpe"],
        "max_drawdown": overall is not None and (overall.get("max_drawdown") or -999) >= PAPER_WATCH_GATE["max_drawdown_floor"],
        "active_win_rate": overall is not None and (overall.get("active_win_rate") or -999) >= PAPER_WATCH_GATE["min_active_win_rate"],
    }
    if all(checks.values()):
        return "paper_trade_candidate", "达到准模拟盘候选标准，可进入压力测试", checks
    if factor_pass_count >= 1 and overall is not None:
        return "real_strategy_backtested", "已有真实 JoinQuant 回测，未达到准模拟盘门槛", checks
    return "factor_gate_not_passed", "因子活性或策略交易门禁未通过", checks


def build_package(table: pd.DataFrame, config: dict[str, Any], emit: bool = True) -> dict[str, Any]:
    analysis = analyzer.build_package(table, config, emit=False)
    selected_score_col, score_candidate_diagnostics = choose_score_col(table, analysis)
    strategy_records = build_strategy_records(table, score_col=selected_score_col)
    status, status_name, checks = paper_watch_label(strategy_records, analysis)
    for record in strategy_records:
        record["strategy_status"] = status
        record["strategy_status_name"] = status_name
        record["paper_watch_gate"] = PAPER_WATCH_GATE
        record["paper_watch_checks"] = checks
    output = {
        "result_type": "index_enhancement_research_package",
        "source": SOURCE,
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "data_policy": "JoinQuant 高频结构化反转因子真实回测包；包含因子活性、分组收益、Top100事件收益和5日调仓交易净值；未过门禁不升级准模拟盘。",
        "config": {**config, "top_n": TOP_N, "buffer_n": BUFFER_N, "score_col": selected_score_col, "score_candidates": SCORE_CANDIDATES},
        "factor_specs": analyzer.FACTOR_SPECS,
        "factor_gate": analyzer.FACTOR_GATE,
        "paper_watch_gate": PAPER_WATCH_GATE,
        "factor_gate_result": [analysis.get("primary_factor_gate"), analysis.get("enhanced_factor_gate")],
        "strategy_status": status,
        "strategy_status_name": status_name,
        "paper_watch_checks": checks,
        "score_candidate_diagnostics": score_candidate_diagnostics,
        "sample": {
            "factor_rows": int(len(table)),
            "factor_dates": int(table["date"].nunique()),
            "unique_securities": int(table["code"].nunique()),
            "factor_records": int(len(analysis.get("records") or [])),
            "strategy_records": int(len(strategy_records)),
        },
        "records": (analysis.get("records") or []) + strategy_records,
    }
    if emit:
        print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def latest_trading_record(package: dict[str, Any]) -> dict[str, Any] | None:
    return next((row for row in package.get("records", []) if row.get("result_type") == "strategy_trading_backtest" and int(row.get("rebalance_days") or 0) == PRIMARY_REBALANCE_DAYS and not row.get("market_regime")), None)


def update_strategy_set(package: dict[str, Any], symbols_path: Path | None) -> bool:
    if package.get("strategy_status") != "paper_trade_candidate":
        return False
    strategies = read_json(PLATFORM_STRATEGY_DEFINITIONS, []) or []
    definition = {
        "id": STRATEGY_ID,
        "name": STRATEGY_NAME,
        "source": {
            "evidence": SOURCE,
            "factorPanel": "JoinQuant 10m 高频结构化反转因子截面",
            "note": "自动门禁通过后进入准模拟盘候选；因子名中文展示，括号保留英文列名。",
        },
        "status": "paper_trade_candidate",
        "dataPolicy": package.get("data_policy"),
        "universe": {
            "current": "中证500历史成分",
            "filters": [
                "剔除 ST、停牌、新股、低成交额、连续跌停和极端无流动性下跌样本",
                "因子必须由真实 JoinQuant 10m 或 1m 聚合 10m 数据生成",
            ],
        },
        "factors": package.get("factor_specs") or [],
        "portfolioRules": {
            "ranking": "结构化反转增强总分（structured_reversal_enhanced_score）从高到低",
            "selection": "Top100 等权，持仓排名150以内保留，新进优先前80名",
            "rebalance": "每5个交易日调仓",
            "positionSizing": "高波动100%，中波动90%，低波动65%",
            "cost": "单边成本0.15%，滑点0.02%",
        },
        "pressureTest": {
            "ready": True,
            "symbolsFile": display_path(symbols_path) if symbols_path else None,
            "gate": package.get("paper_watch_checks"),
        },
    }
    kept = [item for item in strategies if item.get("id") != STRATEGY_ID]
    write_json(PLATFORM_STRATEGY_DEFINITIONS, [definition] + kept)
    return True


def update_position_stress_selection(package: dict[str, Any], symbols_path: Path | None) -> bool:
    if package.get("strategy_status") != "paper_trade_candidate":
        return False
    trading = latest_trading_record(package) or {}
    selected = trading.get("latest_selected_codes") or []
    payload = {
        "adapter": "selected_codes_mean_reversion",
        "baseline": None,
        "evidence": SOURCE,
        "gateStatus": "paper_trade_candidate",
        "layer": "中证500指数增强",
        "name": STRATEGY_NAME,
        "runnable": True,
        "runnableReason": "JoinQuant 高频结构化反转因子和5日调仓交易门禁已通过，可直接进入建仓压力测试。",
        "selectedCodes": selected,
        "source": SOURCE,
        "strategyId": STRATEGY_ID,
        "execution": {
            "holdingPolicy": "five_day_buffered_rebalance",
            "baseHoldingDays": PRIMARY_REBALANCE_DAYS,
            "signalBufferN": BUFFER_N,
            "buyRankCutoff": BUY_RANK_CUTOFF,
            "topN": TOP_N,
            "symbolsFile": display_path(symbols_path) if symbols_path else "joinquant_latest_selected_codes",
        },
        "selectedAt": datetime.now().isoformat(timespec="milliseconds") + "Z",
    }
    write_json(POSITION_STRESS_SELECTION, payload)
    return True


def write_latest_symbols(package: dict[str, Any], stamp: str) -> Path | None:
    trading = latest_trading_record(package)
    if not trading or not trading.get("latest_selected_rows"):
        return None
    SYMBOL_DIR.mkdir(parents=True, exist_ok=True)
    path = SYMBOL_DIR / f"structured_reversal_csi500_v1_latest_symbols_{stamp}.csv"
    rows = pd.DataFrame(trading["latest_selected_rows"])
    rows.to_csv(path, index=False, encoding="utf-8-sig")
    return path


def build_report(package: dict[str, Any], output_path: Path, symbols_path: Path | None) -> str:
    trading = latest_trading_record(package) or {}
    checks = package.get("paper_watch_checks") or {}
    lines = [
        "# 长江结构化反转因子指数增强回测审计",
        "",
        f"生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"结果文件：`{display_path(output_path)}`",
        f"最新候选：`{display_path(symbols_path)}`" if symbols_path else "最新候选：无",
        "",
        "## 准模拟盘门禁",
        "",
        f"- 状态：{package.get('strategy_status_name')}",
        f"- 门禁：{checks}",
        f"- 5日调仓年化收益：{trading.get('strategy_annual_return')}",
        f"- 5日调仓年化超额：{trading.get('active_annual_return')}",
        f"- 主动 Sharpe：{trading.get('active_sharpe')}",
        f"- 最大回撤：{trading.get('max_drawdown')}",
        f"- 平均换手：{trading.get('avg_turnover')}",
        "",
        "## 因子显示名",
        "",
        "- 结构化反转因子（structured_reversal_score）",
        "- 低波动控制因子（low_volatility_score）",
        "- 流动性质量因子（liquidity_quality_score）",
        "- 高频流动性溢价代理因子（liquidity_premium_proxy_score）",
        "- 量能稳定因子（volume_stability_score）",
        "- 跳空风险控制因子（gap_risk_control_score）",
        "- 结构化反转增强总分（structured_reversal_enhanced_score）",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build structured reversal Top100 JoinQuant index-enhancement package.")
    parser.add_argument("inputs", nargs="+", help="Structured reversal factor panel JSON files or glob patterns.")
    parser.add_argument("--output", default="", help="Research package output path.")
    parser.add_argument("--report", default="", help="Markdown audit report path.")
    parser.add_argument("--update-strategy-set", action="store_true", help="Write strategy-definitions and position-stress selection only if paper gate passes.")
    args = parser.parse_args(argv)

    files = expand_inputs(args.inputs)
    if not files:
        raise SystemExit("没有找到因子截面输入文件。")
    table, config = load_table(files)
    package = build_package(table, config, emit=False)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = Path(args.output) if args.output else RESULT_DIR / f"{STRATEGY_ID}_research_package_{stamp}.json"
    report_path = Path(args.report) if args.report else REPORT_DIR / f"joinquant-structured-reversal-index-enhancement-{stamp}.md"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    symbols_path = write_latest_symbols(package, stamp)
    write_json(output_path, package)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(package, output_path, symbols_path), encoding="utf-8")
    strategy_set_updated = update_strategy_set(package, symbols_path) if args.update_strategy_set else False
    pressure_selection_updated = update_position_stress_selection(package, symbols_path) if args.update_strategy_set else False
    print(json.dumps({
        "ok": True,
        "output_path": display_path(output_path),
        "report_path": display_path(report_path),
        "symbols_path": display_path(symbols_path) if symbols_path else None,
        "strategy_status": package.get("strategy_status"),
        "strategy_status_name": package.get("strategy_status_name"),
        "paper_watch_checks": package.get("paper_watch_checks"),
        "strategy_set_updated": strategy_set_updated,
        "pressure_selection_updated": pressure_selection_updated,
        "sample": package.get("sample"),
    }, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
