"""BigQuant paper-watch script for M-quant jq_controller.

M-quant evidence says this controller is ready for controlled paper watch:
high volatility uses jq_quality_profit_liquidity_v1, low volatility uses
kline_assisted_confirmation, and medium volatility stays in cash/watch mode.

The script avoids inventing BigQuant results. It only implements selection and
rebalance rules for a BigQuant simulation/paper task. If BigQuant's current
template uses different callback names, paste CONFIG and the helper functions
into that wrapper without changing the strategy gates.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd


CONFIG = {
    "sleeve_id": "jq_controller",
    "strategy_id": "regime_switch_quality_kline_v1",
    "strategy_name": "Market regime switch controller v1",
    "benchmark": "000300.SH",
    "index_code": "000300.SH",
    "rebalance_days": 5,
    "top_n": 30,
    "target_weight": 1.0,
    "vol_window": 20,
    "vol_low_quantile": 0.30,
    "vol_high_quantile": 0.70,
    "lookback_days": 260,
    "logic": {
        "high_volatility": "jq_quality_profit_liquidity_v1",
        "low_volatility": "kline_assisted_confirmation",
        "medium_volatility": "cash_watch",
    },
    "pause_drawdown": -0.11336,
    "data_policy": (
        "Use BigQuant market/fundamental data only for paper-watch execution. "
        "Do not expand beyond M-quant audited controller logic."
    ),
}


@dataclass(frozen=True)
class TargetPosition:
    code: str
    weight: float


def normalize_code(code: str) -> str:
    raw = str(code).strip().upper()
    if raw.endswith(".XSHE"):
        return raw.replace(".XSHE", ".SZ")
    if raw.endswith(".XSHG"):
        return raw.replace(".XSHG", ".SH")
    return raw


def rank01(series, higher_is_better=True):
    values = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)
    ranked = values.rank(pct=True, method="average")
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5).clip(0, 1)


def clip01(series):
    return pd.to_numeric(series, errors="coerce").clip(0, 1).fillna(0.5)


def fetch_price_data(context, codes, count, fields):
    """Fetch price data through common BigQuant/BigTrader template APIs."""
    if "history" in globals():
        return history(count, "1d", fields, codes, df=True)  # type: ignore[name-defined]
    data = getattr(context, "data", None)
    if data is not None and hasattr(data, "history"):
        return data.history(codes, fields, count, "1d")
    raise RuntimeError("No BigQuant history API found. Adapt fetch_price_data to the template.")


def fetch_index_codes(context) -> list[str]:
    if "get_index_stocks" in globals():
        return [normalize_code(code) for code in get_index_stocks(CONFIG["index_code"])]  # type: ignore[name-defined]
    universe = getattr(context, "universe", None)
    if universe:
        return [normalize_code(code) for code in universe]
    raise RuntimeError("No index universe API found. Set context.universe or adapt fetch_index_codes.")


def latest_market_regime(index_close: pd.Series) -> str:
    close = pd.to_numeric(index_close, errors="coerce").dropna()
    returns = close.pct_change().dropna()
    if len(returns) < CONFIG["vol_window"] * 4:
        return "medium_volatility"
    rolling_vol = returns.rolling(CONFIG["vol_window"]).std() * math.sqrt(252)
    latest = rolling_vol.dropna().iloc[-1]
    low = rolling_vol.dropna().quantile(CONFIG["vol_low_quantile"])
    high = rolling_vol.dropna().quantile(CONFIG["vol_high_quantile"])
    if latest >= high:
        return "high_volatility"
    if latest <= low:
        return "low_volatility"
    return "medium_volatility"


def high_vol_quality_liquidity_score(frame: pd.DataFrame) -> pd.Series:
    close = pd.to_numeric(frame.get("close"), errors="coerce")
    money = pd.to_numeric(frame.get("money"), errors="coerce")
    volume = pd.to_numeric(frame.get("volume"), errors="coerce")
    turnover = pd.to_numeric(frame.get("turnover_ratio", 1.0), errors="coerce")
    market_cap = pd.to_numeric(frame.get("market_cap", 1.0), errors="coerce")
    ret20 = close / pd.to_numeric(frame.get("close_20", close), errors="coerce") - 1
    ret60 = close / pd.to_numeric(frame.get("close_60", close), errors="coerce") - 1
    liquidity = rank01(np.log1p(money), True)
    liquidity_stability = 1 / (1 + rank01(volume, True).replace(0, np.nan)).fillna(0.5)
    quality_proxy = 0.45 * rank01(ret60, True) + 0.30 * rank01(ret20, True) + 0.25 * rank01(market_cap, True)
    turnover_shape = (1 - (turnover - 1.5).abs() / 3.0).clip(0, 1).fillna(0.5)
    return (0.40 * quality_proxy + 0.35 * liquidity + 0.25 * turnover_shape + 0.10 * liquidity_stability).clip(0, 1)


def low_vol_kline_score(frame: pd.DataFrame) -> pd.Series:
    open_ = pd.to_numeric(frame.get("open"), errors="coerce")
    high = pd.to_numeric(frame.get("high"), errors="coerce")
    low = pd.to_numeric(frame.get("low"), errors="coerce")
    close = pd.to_numeric(frame.get("close"), errors="coerce")
    volume = pd.to_numeric(frame.get("volume"), errors="coerce")
    day_range = (high - low).replace(0, np.nan)
    signed_body = (close - open_) / day_range
    body_ratio = ((close - open_).abs() / day_range).clip(0, 1).fillna(0)
    upper_ratio = ((high - np.maximum(open_, close)) / day_range).clip(0, 1).fillna(0)
    lower_ratio = ((np.minimum(open_, close) - low) / day_range).clip(0, 1).fillna(0)
    close_position = ((close - low) / day_range).clip(0, 1).fillna(0.5)
    trend_context = rank01(close / pd.to_numeric(frame.get("close_20", close), errors="coerce") - 1, True)
    candle_quality = clip01(0.42 * close_position + 0.24 * ((signed_body + 1) / 2) + 0.20 * lower_ratio + 0.14 * (1 - upper_ratio))
    distribution_risk = clip01(0.55 * upper_ratio + 0.25 * (body_ratio <= 0.18).astype(float) + 0.20 * rank01(volume, True))
    emotion = rank01(volume, True)
    return (0.36 * candle_quality + 0.28 * trend_context + 0.18 * emotion - 0.26 * distribution_risk).clip(0, 1)


def build_selection(context) -> tuple[str, list[str]]:
    codes = fetch_index_codes(context)
    fields = ["open", "high", "low", "close", "volume", "money"]
    price = fetch_price_data(context, codes + [CONFIG["index_code"]], CONFIG["lookback_days"], fields)
    if isinstance(price, pd.DataFrame) and "instrument" in price.columns:
        code_col = "instrument"
    elif isinstance(price, pd.DataFrame) and "code" in price.columns:
        code_col = "code"
    else:
        raise RuntimeError("Price frame must contain instrument or code column.")

    price = price.copy()
    price[code_col] = price[code_col].map(normalize_code)
    index_code = normalize_code(CONFIG["index_code"])
    index_frame = price[price[code_col] == index_code]
    regime = latest_market_regime(index_frame["close"])
    if regime == "medium_volatility":
        return regime, []

    latest_rows = price[price[code_col] != index_code].groupby(code_col).tail(1).copy()
    for lag in (20, 60):
        lagged = price[price[code_col] != index_code].groupby(code_col)["close"].nth(-lag).rename(f"close_{lag}")
        latest_rows = latest_rows.join(lagged, on=code_col)

    if regime == "high_volatility":
        latest_rows["score"] = high_vol_quality_liquidity_score(latest_rows)
    else:
        latest_rows["score"] = low_vol_kline_score(latest_rows)

    selected = latest_rows.sort_values("score", ascending=False).head(int(CONFIG["top_n"]))[code_col]
    return regime, [normalize_code(code) for code in selected.tolist()]


def build_targets(codes: list[str]) -> list[TargetPosition]:
    if not codes:
        return []
    weight = float(CONFIG["target_weight"]) / len(codes)
    return [TargetPosition(code=code, weight=weight) for code in codes]


def current_position_codes(context) -> set[str]:
    portfolio = getattr(context, "portfolio", None)
    positions = getattr(portfolio, "positions", {}) if portfolio is not None else {}
    if isinstance(positions, dict):
        return {normalize_code(code) for code, pos in positions.items() if getattr(pos, "amount", 0) != 0}
    return set()


def order_target_percent_safe(context, code: str, weight: float) -> None:
    if "order_target_percent" in globals():
        order_target_percent(code, weight)  # type: ignore[name-defined]
        return
    if hasattr(context, "order_target_percent"):
        context.order_target_percent(code, weight)
        return
    raise RuntimeError("No order_target_percent function found in this BigQuant template.")


def rebalance(context) -> None:
    regime, codes = build_selection(context)
    context.m_quant_market_regime = regime
    targets = build_targets(codes)
    target_codes = {item.code for item in targets}
    for code in current_position_codes(context) - target_codes:
        order_target_percent_safe(context, code, 0.0)
    for item in targets:
        order_target_percent_safe(context, item.code, item.weight)


def should_rebalance(context) -> bool:
    return int(getattr(context, "day_count", 0)) % int(CONFIG["rebalance_days"]) == 0


def initialize(context):
    context.day_count = 0
    context.m_quant_config = CONFIG
    if "set_benchmark" in globals():
        set_benchmark(CONFIG["benchmark"])  # type: ignore[name-defined]
    if "set_commission" in globals():
        try:
            set_commission(PerOrder(buy_cost=0.0003, sell_cost=0.0013, min_cost=5))  # type: ignore[name-defined]
        except Exception:
            pass


def handle_data(context, data):
    if should_rebalance(context):
        rebalance(context)
    context.day_count = int(getattr(context, "day_count", 0)) + 1


def before_trading_start(context, data=None):
    context.m_quant_logic = CONFIG["logic"]


if __name__ == "__main__":
    print(CONFIG["strategy_id"])
