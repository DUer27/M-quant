# M-quant JoinQuant tradeability review: AkShare latest paper-watch signal
# Policy: review only the 2026-07-09 triggered AkShare local signal candidates.
# No fabricated prices, returns, industries, market caps, or trading status.
#
# Usage:
# 1. Paste this file into a JoinQuant Python3 research notebook.
# 2. Run the cell.
# 3. Copy the printed JSON back to M-quant 回测中心 -> 结果回填.

import json
import math

import pandas as pd

from jqdata import *


SIGNAL_DATE = "2026-07-09"
INDEX_CODE = "000300.XSHG"
STRATEGY_ID = "ak_mean_reversion_quality_combo"
STRATEGY_NAME = "AkShare高波动均值回归-中流动性观察策略"
ACTION = "paper_watch_open_allowed"
LOCAL_SIGNAL_SOURCE = "akshare_paper_watch_latest_signal_20260709"
LOCAL_SIGNAL_DATA_POLICY = "本地 AkShare 真实 OHLCV 最新信号；JoinQuant 仅复核交易可行性、行业、市值和真实交易状态。"

CANDIDATES = [
    {"code": "002001.XSHE", "local_code": "002001", "local_name": "新和成", "local_score": 0.7130434782608696},
    {"code": "000568.XSHE", "local_code": "000568", "local_name": "泸州老窖", "local_score": 0.711304347826087},
    {"code": "000858.XSHE", "local_code": "000858", "local_name": "五粮液", "local_score": 0.6517391304347826},
    {"code": "000425.XSHE", "local_code": "000425", "local_name": "徐工机械", "local_score": 0.6321739130434783},
    {"code": "000338.XSHE", "local_code": "000338", "local_name": "潍柴动力", "local_score": 0.6321739130434783},
    {"code": "000651.XSHE", "local_code": "000651", "local_name": "格力电器", "local_score": 0.606086956521739},
    {"code": "000001.XSHE", "local_code": "000001", "local_name": "平安银行", "local_score": 0.5130434782608695},
    {"code": "002142.XSHE", "local_code": "002142", "local_name": "宁波银行", "local_score": 0.512608695652174},
    {"code": "000776.XSHE", "local_code": "000776", "local_name": "广发证券", "local_score": 0.48782608695652174},
    {"code": "002027.XSHE", "local_code": "002027", "local_name": "分众传媒", "local_score": 0.4578260869565217},
    {"code": "002241.XSHE", "local_code": "002241", "local_name": "歌尔股份", "local_score": 0.41347826086956524},
    {"code": "002179.XSHE", "local_code": "002179", "local_name": "中航光电", "local_score": 0.34173913043478255},
    {"code": "002230.XSHE", "local_code": "002230", "local_name": "科大讯飞", "local_score": 0.33739130434782605},
    {"code": "002415.XSHE", "local_code": "002415", "local_name": "海康威视", "local_score": 0.32434782608695656},
    {"code": "002714.XSHE", "local_code": "002714", "local_name": "牧原股份", "local_score": 0.18913043478260871},
]


def safe_float(value):
    try:
        number = float(value)
    except Exception:
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def normalize_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns:
        df = df.reset_index()
        if "index" in df.columns and "time" not in df.columns:
            df = df.rename(columns={"index": "time"})
    if "code" not in df.columns and "security" in df.columns:
        df = df.rename(columns={"security": "code"})
    if "date" not in df.columns:
        df["date"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
    return df


def fetch_price_status(codes):
    fields = ["open", "high", "low", "close", "volume", "money", "paused", "high_limit", "low_limit"]
    price = get_price(
        codes,
        start_date=SIGNAL_DATE,
        end_date=SIGNAL_DATE,
        frequency="daily",
        fields=fields,
        panel=False,
        fq="pre",
    )
    frame = normalize_price_frame(price)
    if frame.empty:
        return {}
    return {row["code"]: row for _, row in frame.iterrows()}


def fetch_st_status(codes):
    try:
        extras = get_extras("is_st", codes, start_date=SIGNAL_DATE, end_date=SIGNAL_DATE, df=True)
        if extras is None or extras.empty:
            return {}
        row = extras.iloc[-1]
        return {code: bool(row.get(code, False)) for code in codes}
    except Exception:
        return {}


def fetch_valuation(codes):
    try:
        data = get_fundamentals(
            query(
                valuation.code,
                valuation.market_cap,
                valuation.turnover_ratio,
                valuation.circulating_market_cap,
            ).filter(valuation.code.in_(codes)),
            date=SIGNAL_DATE,
        )
    except Exception:
        data = None
    if data is None or data.empty:
        return {}
    return {row["code"]: row for _, row in data.iterrows()}


def fetch_industries(codes):
    result = {}
    for code in codes:
        try:
            info = get_industry(code, date=SIGNAL_DATE)
        except Exception:
            info = None
        industry_name = None
        if isinstance(info, dict):
            sw_l1 = info.get("sw_l1") or {}
            industry_name = sw_l1.get("industry_name") or sw_l1.get("industry_code")
        result[code] = industry_name
    return result


def review_candidates():
    codes = [item["code"] for item in CANDIDATES]
    price_map = fetch_price_status(codes)
    st_map = fetch_st_status(codes)
    valuation_map = fetch_valuation(codes)
    industry_map = fetch_industries(codes)
    rows = []
    for item in CANDIDATES:
        code = item["code"]
        price = price_map.get(code, {})
        val = valuation_map.get(code, {})
        close = safe_float(price.get("close"))
        high_limit = safe_float(price.get("high_limit"))
        low_limit = safe_float(price.get("low_limit"))
        paused = bool(price.get("paused", False))
        is_st = bool(st_map.get(code, False))
        at_high_limit = bool(close is not None and high_limit is not None and close >= high_limit * 0.999)
        at_low_limit = bool(close is not None and low_limit is not None and close <= low_limit * 1.001)
        tradable = not paused and not is_st and not at_high_limit and not at_low_limit
        rows.append({
            **item,
            "date": SIGNAL_DATE,
            "jq_name": get_security_info(code).display_name if get_security_info(code) else item["local_name"],
            "open": safe_float(price.get("open")),
            "high": safe_float(price.get("high")),
            "low": safe_float(price.get("low")),
            "close": close,
            "volume": safe_float(price.get("volume")),
            "money": safe_float(price.get("money")),
            "paused": paused,
            "is_st": is_st,
            "high_limit": high_limit,
            "low_limit": low_limit,
            "at_high_limit": at_high_limit,
            "at_low_limit": at_low_limit,
            "tradable": tradable,
            "market_cap": safe_float(val.get("market_cap")),
            "circulating_market_cap": safe_float(val.get("circulating_market_cap")),
            "turnover_ratio": safe_float(val.get("turnover_ratio")),
            "industry_sw_l1": industry_map.get(code),
        })
    return rows


def concentration(rows, key):
    counts = {}
    for row in rows:
        value = row.get(key) or "unknown"
        counts[value] = counts.get(value, 0) + 1
    total = len(rows) or 1
    return [
        {"name": name, "count": count, "weight": count / total}
        for name, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
    ]


def classify_market_cap(value):
    if value is None:
        return "unknown"
    if value >= 1000:
        return "large_cap"
    if value >= 300:
        return "mid_cap"
    return "small_cap"


def main():
    rows = review_candidates()
    for row in rows:
        row["market_cap_bucket"] = classify_market_cap(row.get("market_cap"))
    tradable_rows = [row for row in rows if row.get("tradable")]
    pack = {
        "source": "joinquant_akshare_latest_signal_tradeability_review",
        "strategy_id": STRATEGY_ID,
        "strategy_name": STRATEGY_NAME,
        "signal_source": LOCAL_SIGNAL_SOURCE,
        "signal_date": SIGNAL_DATE,
        "action": ACTION,
        "candidate_count": len(rows),
        "tradable_count": len(tradable_rows),
        "blocked_count": len(rows) - len(tradable_rows),
        "industry_concentration": concentration(rows, "industry_sw_l1"),
        "market_cap_concentration": concentration(rows, "market_cap_bucket"),
        "data_policy": LOCAL_SIGNAL_DATA_POLICY,
        "decision": "tradeability_review_passed" if len(tradable_rows) >= 10 else "tradeability_review_failed",
        "decision_reason": "可交易候选不少于10只。" if len(tradable_rows) >= 10 else "可交易候选少于10只，不能开仓观察。",
        "records": rows,
    }
    print(json.dumps(pack, ensure_ascii=False, indent=2))


main()
