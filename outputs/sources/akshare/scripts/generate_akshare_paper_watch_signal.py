#!/usr/bin/env python3
"""Generate latest paper-watch signals for AkShare local execution routes.

The signal uses real local AkShare OHLCV only. It does not use future returns,
does not create prices, and does not expand the audited route boundaries.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_ohlcv_factor_backtest import add_factor_columns, prepare_frame


ROOT = Path(__file__).resolve().parents[4]
AK_DIR = ROOT / "outputs" / "sources" / "akshare"
PROCESSED_DIR = AK_DIR / "processed"
DEFAULT_INPUT_PATH = PROCESSED_DIR / "a_share_daily_20240101_20260709_qfq.csv"
EXECUTION_PACK_PATH = AK_DIR / "results" / "akshare_paper_watch_execution_pack_20260709.json"
RESULT_PATH = AK_DIR / "results" / "akshare_paper_watch_latest_signal_20260709.json"
DOC_PATH = ROOT / "outputs" / "_docs" / "akshare-paper-watch-latest-signal-20260709.md"


def clean_float(value):
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


def latest_daily_input_path() -> Path:
    files = sorted(PROCESSED_DIR.glob("a_share_daily_*_qfq.csv"))
    if not files:
        return DEFAULT_INPUT_PATH
    return max(files, key=lambda path: path.stat().st_mtime)


def latest_factor_frame(input_path: Path | None = None) -> pd.DataFrame:
    raw = prepare_frame(input_path or latest_daily_input_path())
    factors = add_factor_columns(raw)
    latest_date = factors["date"].max()
    return factors[factors["date"] == latest_date].copy()


def selected_records(day: pd.DataFrame, score_col: str, top_n: int) -> list[dict]:
    records = []
    cols = [
        "code",
        "name",
        "close",
        "ret_1",
        "volume",
        "amount",
        "turnover",
        "market_vol_regime",
        "liquidity_bucket",
        "market_vol_20",
        "liquidity_metric20",
        score_col,
        "ak_crowding_risk",
        "ak_liquidity_stability",
    ]
    existing = [col for col in cols if col in day.columns]
    for item in day.sort_values(score_col, ascending=False).head(top_n)[existing].to_dict("records"):
        ret_1 = clean_float(item.get("ret_1"))
        volume = clean_float(item.get("volume"))
        item["score"] = clean_float(item.pop(score_col, None))
        item["limit_move_proxy"] = bool(ret_1 is not None and abs(ret_1) >= 0.095)
        item["suspension_proxy"] = bool(volume is not None and volume <= 0)
        records.append(item)
    return records


def build_route_signal(route: dict, latest: pd.DataFrame) -> dict:
    score_col = route.get("strategy_id")
    top_n = 20
    day = latest.dropna(subset=[score_col]).copy() if score_col in latest.columns else pd.DataFrame()
    route_layer = day[
        (day["market_vol_regime"].astype(str) == str(route.get("allowed_market_regime")))
        & (day["liquidity_bucket"].astype(str) == str(route.get("allowed_liquidity_bucket")))
    ].copy() if not day.empty else pd.DataFrame()
    candidates = selected_records(route_layer, score_col, top_n) if not route_layer.empty else []
    selected_count = len(candidates)
    candidate_count = int(len(route_layer))
    can_enter = bool(route.get("can_enter_paper_watch"))
    layer_matched = candidate_count > 0
    capacity_ok = candidate_count >= 15 and selected_count >= 10
    data_ok = not any(item["suspension_proxy"] for item in candidates)
    action = "record_only"
    reason = "路线只做候选监控或当前分层未触发。"
    if can_enter and layer_matched and capacity_ok and data_ok:
        action = "paper_watch_open_allowed"
        reason = "当前真实本地分层触发，候选容量满足执行包门槛，允许进入本地模拟观察开仓信号。"
    elif can_enter and not layer_matched:
        reason = "当前市场波动/流动性分层未触发该路线，只记录信号不新开仓。"
    elif can_enter and not capacity_ok:
        reason = "当前候选容量不足执行包门槛，只记录信号不新开仓。"
    elif can_enter and not data_ok:
        reason = "候选中存在停牌代理或数据异常，暂停新开仓。"

    latest_date = latest["date"].iloc[0].strftime("%Y-%m-%d") if not latest.empty else None
    market_regime_counts = latest["market_vol_regime"].astype(str).value_counts().to_dict() if "market_vol_regime" in latest else {}
    liquidity_counts = latest["liquidity_bucket"].astype(str).value_counts().to_dict() if "liquidity_bucket" in latest else {}
    return {
        "id": route.get("id"),
        "strategy_id": route.get("strategy_id"),
        "strategy_name": route.get("strategy_name"),
        "execution_role": route.get("execution_role"),
        "can_enter_paper_watch": can_enter,
        "signal_date": latest_date,
        "action": action,
        "reason": reason,
        "allowed_market_regime": route.get("allowed_market_regime"),
        "allowed_liquidity_bucket": route.get("allowed_liquidity_bucket"),
        "latest_market_regime_counts": market_regime_counts,
        "latest_liquidity_bucket_counts": liquidity_counts,
        "candidate_count": candidate_count,
        "selected_count": selected_count,
        "selected": candidates,
        "guards": {
            "layer_matched": layer_matched,
            "capacity_ok": capacity_ok,
            "data_ok": data_ok,
            "limit_move_proxy_count": sum(1 for item in candidates if item["limit_move_proxy"]),
            "suspension_proxy_count": sum(1 for item in candidates if item["suspension_proxy"]),
        },
    }


def write_doc(pack: dict, output_path: Path = DOC_PATH) -> None:
    lines = [
        "# AkShare 本地模拟观察最新信号",
        "",
        f"- 生成时间：{pack['generated_at']}",
        f"- 信号日期：{pack['signal_date']}",
        f"- 数据原则：{pack['data_policy']}",
        f"- 输入：`{pack['input']}`",
        "",
        "## 路线信号",
        "",
    ]
    for route in pack["routes"]:
        lines.extend([
            f"### {route['strategy_name']}",
            "",
            f"- 角色：`{route['execution_role']}`",
            f"- 动作：`{route['action']}`",
            f"- 原因：{route['reason']}",
            f"- 候选数：{route['candidate_count']}",
            f"- 入选数：{route['selected_count']}",
            f"- 涨跌停代理数：{route['guards']['limit_move_proxy_count']}",
            f"- 停牌代理数：{route['guards']['suspension_proxy_count']}",
            "",
        ])
        if route["selected"]:
            codes = ", ".join(item["code"] for item in route["selected"][:20])
            lines.append(f"- Top20：{codes}")
            lines.append("")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


def json_safe(value):
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if value is pd.NA or value is pd.NaT or isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--expected-date")
    parser.add_argument("--result", type=Path, default=RESULT_PATH)
    parser.add_argument("--doc", type=Path, default=DOC_PATH)
    parser.add_argument("--record-only", action="store_true")
    args = parser.parse_args()
    input_path = args.input.resolve() if args.input else latest_daily_input_path()
    execution_pack = json.loads(EXECUTION_PACK_PATH.read_text(encoding="utf-8"))
    latest = latest_factor_frame(input_path)
    routes = [
        build_route_signal(route, latest)
        for route in execution_pack.get("routes", [])
    ]
    if args.expected_date and not routes:
        raise SystemExit("执行包没有可用观察路线，不能声称信号已生成。")
    signal_date = latest["date"].iloc[0].strftime("%Y-%m-%d") if not latest.empty else None
    if args.expected_date and signal_date != args.expected_date:
        raise SystemExit("新行情日期与观察信号日期不一致，未发布信号。")
    if args.record_only:
        for route in routes:
            route["action"] = "record_only"
            route["reason"] = "自动更新产生的观察信号，仅记录；需要最新交易可行性复核后再决定是否执行。"
    pack = {
        "source": "akshare_local_paper_watch_latest_signal",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": str(input_path.relative_to(ROOT)) if input_path.is_relative_to(ROOT) else str(input_path),
        "execution_pack": str(EXECUTION_PACK_PATH.relative_to(ROOT)),
        "signal_date": signal_date,
        "observation_only": bool(args.record_only),
        "data_policy": "只使用本地已落地 AkShare 真实 OHLCV 和已审计执行包；信号只用当日及以前数据；不使用未来收益。",
        "route_count": len(routes),
        "open_allowed_count": sum(1 for route in routes if route["action"] == "paper_watch_open_allowed"),
        "record_only_count": sum(1 for route in routes if route["action"] != "paper_watch_open_allowed"),
        "routes": routes,
    }
    pack = json_safe(pack)
    args.result.parent.mkdir(parents=True, exist_ok=True)
    args.result.write_text(json.dumps(pack, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    write_doc(pack, args.doc)
    print(json.dumps({
        "result": str(args.result),
        "doc": str(args.doc),
        "signal_date": signal_date,
        "open_allowed_count": pack["open_allowed_count"],
        "route_count": pack["route_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
