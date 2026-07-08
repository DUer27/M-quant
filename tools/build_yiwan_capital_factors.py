import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean


ROOT = Path("/Users/Admin/Documents/Codex/2026-07-06/ke")
INPUTS = [
    Path("/Users/Admin/Desktop/yiwan-batch-20260707-093737-dates-2026-07-01-2026-07-01.json"),
    Path("/Users/Admin/Desktop/yiwan-batch-20260707-093737-dates-2026-07-02-2026-07-02.json"),
    Path("/Users/Admin/Desktop/yiwan-batch-20260707-093737-dates-2026-07-03-2026-07-03.json"),
]
OUTPUT_DIR = ROOT / "outputs" / "capital-flow-factors"


def to_number(value):
    if value is None:
        return math.nan
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("%", "")
    if text in {"", "-", "--", "None", "null", "nan"}:
        return math.nan
    try:
        return float(text)
    except ValueError:
        return math.nan


def clean_code(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return text.zfill(6)


def get(row, key, default=None):
    return row.get(str(key), default)


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def safe_div(numerator, denominator):
    if not finite(numerator) or not finite(denominator) or denominator == 0:
        return math.nan
    return numerator / denominator


def rank_pct(values, reverse=False):
    valid = sorted((value, index) for index, value in enumerate(values) if finite(value))
    if reverse:
        valid = list(reversed(valid))
    ranks = [0.5] * len(values)
    if not valid:
        return ranks
    denom = max(1, len(valid) - 1)
    for rank, (_, index) in enumerate(valid):
        ranks[index] = rank / denom
    return ranks


def clamp01(value):
    if not finite(value):
        return 0.5
    return max(0.0, min(1.0, value))


def heat_comfort(rank):
    # Prefer active-but-not-extreme capital attention.
    if not finite(rank):
        return 0.5
    return clamp01(1 - abs(rank - 0.68) / 0.68)


def parse_stock_row(row, date, source):
    code = clean_code(get(row, 0))
    name = str(get(row, 1, "")).strip()
    if not code or not name:
        return None
    amount = to_number(get(row, 9))
    primary_flow = to_number(get(row, 53))
    contra_flow = to_number(get(row, 49))
    net_flow = to_number(get(row, 61))
    reverse_flow = to_number(get(row, 62))
    return {
        "amount": amount,
        "change_pct": to_number(get(row, 2)),
        "close": to_number(get(row, 3)),
        "code": code,
        "contra_flow": contra_flow,
        "contra_flow_to_amount": safe_div(contra_flow, amount),
        "date": date,
        "flow_delta": to_number(get(row, 56)),
        "flow_delta_to_amount": safe_div(to_number(get(row, 56)), amount),
        "heat_label": str(get(row, 78, "")).strip(),
        "heat_score": to_number(get(row, 77)),
        "name": name,
        "net_flow": net_flow,
        "net_flow_to_amount": safe_div(net_flow, amount),
        "primary_flow": primary_flow,
        "primary_flow_to_amount": safe_div(primary_flow, amount),
        "reverse_flow": reverse_flow,
        "reverse_flow_to_amount": safe_div(reverse_flow, amount),
        "sector_code": str(get(row, 79, "")).strip(),
        "source": source,
        "turnover": to_number(get(row, 10)),
        "volume_ratio": to_number(get(row, 16)),
    }


def rows_from_section(payload, section):
    parsed = []
    by_date = payload.get(section, {})
    if not isinstance(by_date, dict):
        return parsed
    for date, rows in by_date.items():
        if not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, dict):
                item = parse_stock_row(row, date, section.replace("_by_date", ""))
                if item:
                    parsed.append(item)
    return parsed


def add_source_scores(rows, prefix):
    by_date = defaultdict(list)
    for row in rows:
        by_date[row["date"]].append(row)

    for date_rows in by_date.values():
        primary_rank = rank_pct([row["primary_flow_to_amount"] for row in date_rows])
        net_rank = rank_pct([row["net_flow_to_amount"] for row in date_rows])
        reverse_out_rank = rank_pct([abs(row["reverse_flow_to_amount"]) if finite(row["reverse_flow_to_amount"]) else math.nan for row in date_rows])
        change_rank = rank_pct([row["change_pct"] for row in date_rows])
        turnover_rank = rank_pct([row["turnover"] for row in date_rows])
        heat_rank = rank_pct([row["heat_score"] for row in date_rows])

        for index, row in enumerate(date_rows):
            turnover_comfort = clamp01(1 - max(0, turnover_rank[index] - 0.76) / 0.24)
            accumulation = (
                0.42 * primary_rank[index]
                + 0.28 * net_rank[index]
                + 0.12 * change_rank[index]
                + 0.10 * heat_comfort(heat_rank[index])
                + 0.08 * turnover_comfort
            )
            divergence = (
                0.45 * primary_rank[index]
                + 0.30 * net_rank[index]
                + 0.25 * (1 - reverse_out_rank[index])
            )
            overheat = (
                0.30 * turnover_rank[index]
                + 0.22 * heat_rank[index]
                + 0.18 * change_rank[index]
                + 0.20 * reverse_out_rank[index]
                + 0.10 * (1 - net_rank[index])
            )
            row[f"{prefix}_accumulation"] = round(clamp01(accumulation), 6)
            row[f"{prefix}_divergence"] = round(clamp01(divergence), 6)
            row[f"{prefix}_overheat"] = round(clamp01(overheat), 6)


def merge_stock_factors(main_rows, active_rows):
    add_source_scores(main_rows, "main_force")
    add_source_scores(active_rows, "active_ap")
    grouped = defaultdict(dict)

    for row in main_rows + active_rows:
        grouped[(row["date"], row["code"])][row["source"]] = row

    output = []
    by_code_history = defaultdict(list)
    for (date, code), sources in sorted(grouped.items()):
        main = sources.get("main_force")
        active = sources.get("active_ap_stock")
        base = active or main
        if not base:
            continue

        main_score = main.get("main_force_accumulation") if main else math.nan
        active_score = active.get("active_ap_accumulation") if active else math.nan
        source_scores = [value for value in [main_score, active_score] if finite(value)]
        multi_source_confirm = 1.0 if main and active else 0.0
        capital_follow = (
            0.42 * (mean(source_scores) if source_scores else 0.5)
            + 0.22 * (active.get("active_ap_accumulation") if active else 0.5)
            + 0.18 * (main.get("main_force_accumulation") if main else 0.5)
            + 0.18 * multi_source_confirm
        )
        divergence_scores = [
            main.get("main_force_divergence") if main else math.nan,
            active.get("active_ap_divergence") if active else math.nan,
        ]
        overheat_scores = [
            main.get("main_force_overheat") if main else math.nan,
            active.get("active_ap_overheat") if active else math.nan,
        ]
        institutional_contra_divergence = mean([value for value in divergence_scores if finite(value)] or [0.5])
        capital_overheat_risk = mean([value for value in overheat_scores if finite(value)] or [0.5])

        history = by_code_history[code]
        previous_follow = history[-1]["capital_follow_signal"] if history else math.nan
        if finite(previous_follow):
            persistence = 0.55 * capital_follow + 0.35 * previous_follow + 0.10 * (1 if capital_follow >= 0.6 and previous_follow >= 0.6 else 0)
        else:
            persistence = math.nan

        result = {
            "stock_code": code,
            "stock_name": base["name"],
            "stock_date": date,
            "date": date,
            "close": base["close"],
            "change_pct": base["change_pct"],
            "amount": base["amount"],
            "turnover": base["turnover"],
            "capital_follow_signal": round(clamp01(capital_follow), 6),
            "active_ap_accumulation": round(active.get("active_ap_accumulation"), 6) if active else None,
            "main_force_alignment": round(main.get("main_force_accumulation"), 6) if main else None,
            "institutional_contra_divergence": round(clamp01(institutional_contra_divergence), 6),
            "capital_overheat_risk": round(clamp01(capital_overheat_risk), 6),
            "capital_persistence_2d": round(clamp01(persistence), 6) if finite(persistence) else None,
            "capital_source_count": len(sources),
            "active_ap_primary_flow": active.get("primary_flow") if active else None,
            "active_ap_net_flow": active.get("net_flow") if active else None,
            "main_force_primary_flow": main.get("primary_flow") if main else None,
            "main_force_net_flow": main.get("net_flow") if main else None,
            "heat_label": base.get("heat_label"),
            "sector_code": base.get("sector_code"),
            "source_sections": sorted(sources.keys()),
        }
        output.append(result)
        by_code_history[code].append(result)

    return output


def market_regime_from_payloads(payloads):
    regimes = []
    for payload in payloads:
        by_date = payload.get("big_market_daily_by_date", {})
        big_ap = payload.get("big_ap_by_date", {})
        for date, daily in by_date.items():
            if not isinstance(daily, dict):
                continue
            tdates = daily.get("tdate") or []
            flows = daily.get("cum_flow") or []
            mas = daily.get("cum_ma") or []
            current_index = tdates.index(date) if date in tdates else len(tdates) - 1
            flow = to_number(flows[current_index]) if 0 <= current_index < len(flows) else math.nan
            ma = to_number(mas[current_index]) if 0 <= current_index < len(mas) else math.nan
            flow_vs_ma = safe_div(flow - ma, abs(ma)) if finite(ma) else math.nan
            intraday_rows = big_ap.get(date) if isinstance(big_ap, dict) else None
            intraday_end = math.nan
            intraday_slope = math.nan
            if isinstance(intraday_rows, list) and len(intraday_rows) >= 3 and isinstance(intraday_rows[1], list):
                series = [to_number(value) for value in intraday_rows[1] if finite(to_number(value))]
                if series:
                    intraday_end = series[-1]
                    max_abs = max(abs(value) for value in series if finite(value)) or 1
                    intraday_slope = safe_div(intraday_end, max_abs)
            regime_score = clamp01(0.5 + (flow_vs_ma if finite(flow_vs_ma) else 0) * 1.2 + (intraday_slope if finite(intraday_slope) else 0) * 0.18)
            regimes.append({
                "date": date,
                "market_capital_regime": round(regime_score, 6),
                "cum_flow": flow,
                "cum_ma": ma,
                "flow_vs_ma": round(flow_vs_ma, 6) if finite(flow_vs_ma) else None,
                "intraday_ap_end": intraday_end if finite(intraday_end) else None,
                "intraday_ap_slope": round(intraday_slope, 6) if finite(intraday_slope) else None,
                "status": "computed_from_big_market_daily_and_big_ap",
            })
    return regimes


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path, rows):
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    headers = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def main():
    payloads = [json.loads(path.read_text(encoding="utf-8")) for path in INPUTS]
    main_rows = []
    active_rows = []
    for payload in payloads:
        main_rows.extend(rows_from_section(payload, "main_force_by_date"))
        active_rows.extend(rows_from_section(payload, "active_ap_stock_by_date"))

    factor_rows = merge_stock_factors(main_rows, active_rows)
    market_regimes = market_regime_from_payloads(payloads)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT_DIR / "yiwan-capital-factor-results.json", factor_rows)
    write_csv(OUTPUT_DIR / "yiwan-capital-factor-results.csv", factor_rows)

    summary = {
        "source_files": [str(path) for path in INPUTS],
        "input_kind": "yiwan_date_capital_batches",
        "data_policy": "Only real rows from user-provided Yiwan date batches are used. No performance metrics or future returns are created.",
        "rows": len(factor_rows),
        "stock_dates": sorted({row["date"] for row in factor_rows}),
        "unique_stocks": len({row["stock_code"] for row in factor_rows}),
        "section_rows": {
            "main_force": len(main_rows),
            "active_ap_stock": len(active_rows),
        },
        "market_regimes": market_regimes,
        "factor_meta": {
            "status": "computed",
            "input_kind": "yiwan_date_capital_batches",
            "rows": len(factor_rows),
            "availability": {
                "capital_follow_signal": {
                    "status": "computed",
                    "category": "capital_flow",
                    "displayName": "资金跟随信号",
                    "fields": ["main_force_by_date", "active_ap_stock_by_date", "columns 49/53/61/62/77"],
                    "formula": "主力/活跃暗盘吸筹分数均值 + 双来源确认；分数越高表示资金信号越一致。",
                    "note": "字段来自用户日期包真实行。数字列含义按同批页面结构使用，不写入收益结论。",
                    "usage": "作为资金确认因子，适合和趋势质量、量价确认共同过滤。",
                },
                "active_ap_accumulation": {
                    "status": "computed",
                    "category": "capital_flow",
                    "displayName": "活跃暗盘吸筹",
                    "fields": ["active_ap_stock_by_date", "columns 53/61/62/77/10"],
                    "formula": "活跃暗盘资金强度 + 净流入强度 + 价格确认 + 热度舒适度 - 过高换手惩罚。",
                    "note": "仅在活跃暗盘个股列表出现的股票上计算。",
                },
                "main_force_alignment": {
                    "status": "computed",
                    "category": "capital_flow",
                    "displayName": "主力一致性",
                    "fields": ["main_force_by_date", "columns 53/61/62/77/10"],
                    "formula": "主力资金强度 + 净流入强度 + 价格确认 + 热度舒适度 - 过高换手惩罚。",
                    "note": "仅在主力数据列表出现的股票上计算。",
                },
                "institutional_contra_divergence": {
                    "status": "computed",
                    "category": "capital_flow",
                    "displayName": "主反向背离",
                    "fields": ["columns 53/61/62"],
                    "formula": "主资金强度 + 净流入强度 - 反向流压力。",
                    "note": "用于观察资金方向是否一致，不等同于收益预测。",
                },
                "capital_overheat_risk": {
                    "status": "computed",
                    "category": "risk",
                    "displayName": "资金过热风险",
                    "fields": ["turnover", "heat_score", "change_pct", "reverse_flow", "net_flow"],
                    "formula": "高换手 + 高热度 + 高涨幅 + 反向流压力 + 净流弱化。",
                    "note": "风险因子，分数越高越应谨慎。",
                },
                "capital_persistence_2d": {
                    "status": "partial_real_data",
                    "category": "capital_flow",
                    "displayName": "2日资金持续性",
                    "fields": ["capital_follow_signal by stock/date"],
                    "formula": "当日资金跟随信号与上一可用交易日信号加权。",
                    "note": "当前只有 2026-07-01 和 2026-07-02 有个股资金行，样本很短，只能作为持续性雏形。",
                },
                "market_capital_regime": {
                    "status": "computed",
                    "category": "market",
                    "displayName": "市场资金状态",
                    "fields": ["big_market_daily_by_date", "big_ap_by_date"],
                    "formula": "大盘累计资金相对均线 + 盘中暗盘累计斜率。",
                    "note": "市场级状态因子，不是个股因子，不输出个股收益结论。",
                },
            },
        },
    }
    write_json(OUTPUT_DIR / "yiwan-capital-factor-summary.json", summary)
    print(json.dumps({
        "output_dir": str(OUTPUT_DIR),
        "rows": len(factor_rows),
        "dates": summary["stock_dates"],
        "unique_stocks": summary["unique_stocks"],
        "market_regime_dates": [row["date"] for row in market_regimes],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
