#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REPORT = ROOT / "outputs" / "position-stress" / "results" / "position_stress_latest.json"
EXPORT_DIR = ROOT / "outputs" / "position-stress" / "exports"

TRADE_HEADERS = [
    ("signalDate", "信号日"),
    ("entryDate", "建仓日"),
    ("exitDate", "退出日"),
    ("holdingDays", "持仓交易日"),
    ("exitReason", "退出原因"),
    ("code", "代码"),
    ("security", "证券代码"),
    ("name", "名称"),
    ("entryClose", "建仓收盘"),
    ("exitClose", "退出收盘"),
    ("entryPrice", "成交买价"),
    ("exitPrice", "成交卖价"),
    ("targetWeight", "目标权重"),
    ("actualWeight", "实际权重"),
    ("shares", "股数"),
    ("orderNotional", "目标金额"),
    ("filledNotional", "成交金额"),
    ("unfilledNotional", "未成交金额"),
    ("fillRatio", "成交率"),
    ("notional", "兼容名义金额"),
    ("pnl", "盈亏"),
    ("buyCost", "买入成本"),
    ("sellCost", "卖出成本"),
    ("costAmount", "总成本"),
    ("return", "收益"),
    ("contribution", "组合贡献"),
    ("portfolioValueBefore", "交易前资产"),
    ("portfolioValueAfter", "交易后资产"),
    ("cashAfterTrade", "买入后现金"),
    ("strategyScore", "策略分"),
    ("exitScore", "退出分"),
    ("entryRank", "建仓排名"),
    ("exitRank", "退出排名"),
    ("maxReturnDuringHold", "持仓最高收益"),
    ("scoreDropPct", "分数衰减"),
]


def clean(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return json.dumps(value, ensure_ascii=False)


def write_sheet(wb: Workbook, title: str, rows: list[dict[str, object]], headers: list[tuple[str, str]]) -> None:
    ws = wb.create_sheet(title)
    ws.append([label for _, label in headers])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E78")
    for row in rows:
        ws.append([clean(row.get(key)) for key, _ in headers])
    ws.freeze_panes = "A2"
    for index, (_, label) in enumerate(headers, start=1):
        values = [str(label)] + [str(clean(row.get(headers[index - 1][0])) or "") for row in rows[:500]]
        width = min(max(len(value) for value in values) + 2, 42)
        ws.column_dimensions[get_column_letter(index)].width = width


def metric_rows(report: dict[str, object]) -> list[dict[str, object]]:
    strategy = report.get("strategy") or {}
    metrics = strategy.get("metrics") or {}
    run_gate = report.get("runGate") or {}
    date_range = report.get("requestedDateRange") or {}
    base = [
        ("生成时间", report.get("generatedAt")),
        ("报告状态", report.get("status")),
        ("正式运行放行", run_gate.get("formalRunAllowed")),
        ("数据源模式", report.get("sourceMode")),
        ("开始日期", date_range.get("start")),
        ("结束日期", date_range.get("end")),
        ("实际交易日数", len(report.get("actualDates") or [])),
        ("覆盖股票数", report.get("stockCount")),
        ("行情行数", report.get("rowCount")),
        ("策略ID", strategy.get("id")),
        ("策略名称", strategy.get("name")),
        ("策略适配器", strategy.get("adapter")),
        ("适配器说明", strategy.get("adapterNote")),
    ]
    metric_labels = {
        "totalReturn": "总收益",
        "maxDrawdown": "最大回撤",
        "returnDrawdownRatio": "收益回撤比",
        "annualizedReturn": "年化收益",
        "initialCapital": "期初资金",
        "endingValue": "期末资产",
        "totalPnl": "累计盈亏",
        "totalCostAmount": "累计成本",
        "averageFillRatio": "平均成交率",
        "turnover": "换手倍数",
        "orderCount": "订单数",
        "calmarLike": "Calmar类指标",
        "returnVolatilityRatio": "收益波动比",
        "simplifiedSharpe": "简化Sharpe",
        "dailyWinRate": "日胜率",
        "tradeWinRate": "交易胜率",
        "averageTradeReturn": "平均单笔收益",
        "bestTradeReturn": "最好单笔收益",
        "worstTradeReturn": "最差单笔收益",
        "tradeCount": "交易笔数",
        "rebalanceCount": "调仓次数",
        "uniqueHeldStocks": "持仓覆盖股票数",
        "averageHoldingCount": "平均持仓数",
    }
    rows = [{"name": name, "value": clean(value)} for name, value in base]
    rows.extend({"name": label, "value": clean(metrics.get(key))} for key, label in metric_labels.items())
    return rows


def diagnostic_rows(report: dict[str, object]) -> list[dict[str, object]]:
    metrics = ((report.get("strategy") or {}).get("metrics") or {})
    trade_items = [
        ("最好单笔", metrics.get("bestTrade")),
        ("最差单笔", metrics.get("worstTrade")),
        ("单票最大贡献", metrics.get("maxSingleStockContributionTrade")),
    ]
    rows: list[dict[str, object]] = []
    for label, item in trade_items:
        item = item or {}
        rows.append({
            "type": label,
            "date": item.get("signalDate"),
            "entryDate": item.get("entryDate"),
            "exitDate": item.get("exitDate"),
            "code": item.get("code"),
            "security": item.get("security"),
            "name": item.get("name"),
            "entryClose": item.get("entryClose"),
            "exitClose": item.get("exitClose"),
            "targetWeight": item.get("targetWeight"),
            "notional": item.get("notional"),
            "shares": item.get("shares"),
            "filledNotional": item.get("filledNotional"),
            "fillRatio": item.get("fillRatio"),
            "pnl": item.get("pnl"),
            "costAmount": item.get("costAmount"),
            "return": item.get("return"),
            "strategyScore": item.get("strategyScore"),
            "equity": None,
            "dailyReturn": None,
            "value": None,
        })

    day_items = [
        ("最好交易日", metrics.get("bestDay")),
        ("最差交易日", metrics.get("worstDay")),
    ]
    for label, item in day_items:
        item = item or {}
        rows.append({
            "type": label,
            "date": item.get("date"),
            "entryDate": None,
            "exitDate": None,
            "code": None,
            "security": None,
            "name": None,
            "entryClose": None,
            "exitClose": None,
            "targetWeight": None,
            "notional": None,
            "return": None,
            "strategyScore": None,
            "equity": item.get("equity"),
            "dailyReturn": item.get("dailyReturn"),
            "value": None,
        })

    scalar_items = [
        ("调仓次数", metrics.get("rebalanceCount")),
        ("平均持仓数", metrics.get("averageHoldingCount")),
        ("日波动", metrics.get("dailyVolatility")),
        ("年化收益", metrics.get("annualizedReturn")),
        ("盈利贡献", metrics.get("profitContribution")),
        ("亏损贡献", metrics.get("lossContribution")),
        ("收益集中度", metrics.get("returnConcentration")),
        ("单日最大贡献", metrics.get("maxDailyContribution")),
        ("单票最大贡献值", metrics.get("maxSingleStockContribution")),
    ]
    for label, value in scalar_items:
        rows.append({
            "type": label,
            "date": None,
            "entryDate": None,
            "exitDate": None,
            "code": None,
            "security": None,
            "name": None,
            "entryClose": None,
            "exitClose": None,
            "targetWeight": None,
            "notional": None,
            "return": None,
            "strategyScore": None,
            "equity": None,
            "dailyReturn": None,
            "value": value,
        })
    return rows


def default_export_path(report: dict[str, object], sheet: str) -> Path:
    strategy = str((report.get("strategy") or {}).get("id") or "position_stress")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = "trades" if sheet == "trades" else "equity"
    return EXPORT_DIR / f"position_stress_{suffix}_{strategy}_{stamp}.xlsx"


def export(report_path: Path, output_path: Path | None = None, sheet: str = "all") -> Path:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    if output_path is None:
        output_path = default_export_path(report, sheet)

    wb = Workbook()
    wb.remove(wb.active)
    if sheet == "trades":
        write_sheet(wb, "成交明细", (report.get("strategy") or {}).get("trades") or [], TRADE_HEADERS)
        write_sheet(wb, "导出口径", metric_rows(report), [("name", "指标"), ("value", "值")])
        wb.save(output_path)
        return output_path

    write_sheet(wb, "核心指标", metric_rows(report), [("name", "指标"), ("value", "值")])
    write_sheet(wb, "净值曲线", (report.get("strategy") or {}).get("equityCurve") or [], [
        ("date", "日期"),
        ("equity", "净值"),
        ("portfolioValue", "组合资产"),
        ("cash", "现金"),
        ("marketValue", "期末持仓市值"),
        ("tradedNotional", "当日成交额"),
        ("dailyPnl", "日盈亏"),
        ("dailyReturn", "日收益"),
        ("drawdown", "回撤"),
        ("costAmount", "日成本"),
    ])
    write_sheet(wb, "诊断明细", diagnostic_rows(report), [
        ("type", "类型"),
        ("date", "日期/信号日"),
        ("entryDate", "建仓日"),
        ("exitDate", "退出日"),
        ("code", "代码"),
        ("security", "证券代码"),
        ("name", "名称"),
        ("entryClose", "建仓收盘"),
        ("exitClose", "退出收盘"),
        ("targetWeight", "目标权重"),
        ("notional", "名义金额"),
        ("shares", "股数"),
        ("filledNotional", "成交金额"),
        ("fillRatio", "成交率"),
        ("pnl", "盈亏"),
        ("costAmount", "成本"),
        ("return", "单笔收益"),
        ("strategyScore", "策略分"),
        ("equity", "净值"),
        ("dailyReturn", "日收益"),
        ("value", "数值"),
    ])
    write_sheet(wb, "成交明细", (report.get("strategy") or {}).get("trades") or [], TRADE_HEADERS)
    write_sheet(wb, "压力场景", report.get("stress") or [], [
        ("category", "类别"),
        ("name", "场景"),
        ("resultReturn", "结果收益"),
        ("maxDrawdown", "最大回撤"),
        ("tradeCount", "交易数"),
        ("endingValue", "期末资产"),
        ("totalCostAmount", "累计成本"),
        ("averageFillRatio", "平均成交率"),
        ("impact", "含义"),
    ])
    write_sheet(wb, "每日建仓选择", (report.get("strategy") or {}).get("dailySelections") or [], [
        ("date", "日期"),
        ("selectedCount", "入选数量"),
        ("names", "入选股票"),
        ("items", "明细"),
    ])
    write_sheet(wb, "数据口径", [
        {"name": "数据政策", "value": report.get("dataPolicy")},
        {"name": "数据源说明", "value": report.get("sourceMessage")},
        {"name": "缺失日期", "value": report.get("missingDates")},
        {"name": "警告", "value": report.get("warnings")},
        {"name": "下一步", "value": report.get("nextActions")},
    ], [("name", "项目"), ("value", "内容")])
    wb.save(output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="导出建仓压力测试组合净值结果 Excel")
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--output", default="")
    parser.add_argument("--sheet", choices=["all", "trades"], default="all")
    args = parser.parse_args()
    output = export(Path(args.report), Path(args.output) if args.output else None, args.sheet)
    print(output)


if __name__ == "__main__":
    main()
