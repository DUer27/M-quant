"""BigQuant paper-watch script for M-quant akshare_local_switch.

This script is intentionally conservative. It uses only the 2026-07-09
AkShare latest signal that already passed JoinQuant tradeability review.
It does not recompute future returns and does not expand the audited scope.

If the current BigQuant template has different callback names, keep the
CONFIG and rebalance logic unchanged and paste them into that wrapper.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


CONFIG = {
    "sleeve_id": "akshare_local_switch",
    "strategy_id": "akshare_regime_switch_contraction_mean_reversion_v1",
    "component_strategy_id": "ak_mean_reversion_quality_combo",
    "strategy_name": "AkShare local high/low volatility switch v1",
    "signal_date": "2026-07-09",
    "benchmark": "000300.SH",
    "rebalance_days": 5,
    "target_weight": 1.0,
    "selected_codes": [
        "002001.SZ", "000568.SZ", "000858.SZ", "000425.SZ", "000338.SZ",
        "000651.SZ", "000001.SZ", "002142.SZ", "000776.SZ", "002027.SZ",
        "002241.SZ", "002179.SZ", "002230.SZ", "002415.SZ", "002714.SZ",
    ],
    "tradeability_review": {
        "decision": "tradeability_review_passed",
        "tradable_count": 15,
        "blocked_count": 0,
    },
    "data_policy": (
        "Use only audited M-quant latest selected codes from real AkShare OHLCV "
        "and JoinQuant tradeability review. Do not add unaudited symbols."
    ),
}


@dataclass(frozen=True)
class TargetPosition:
    code: str
    weight: float


def normalize_code(code: str) -> str:
    """Return the code format used by the script CONFIG."""
    raw = str(code).strip().upper()
    if raw.endswith(".XSHE"):
        return raw.replace(".XSHE", ".SZ")
    if raw.endswith(".XSHG"):
        return raw.replace(".XSHG", ".SH")
    return raw


def selected_codes() -> list[str]:
    return [normalize_code(code) for code in CONFIG["selected_codes"]]


def build_targets(codes: Iterable[str] | None = None) -> list[TargetPosition]:
    universe = list(codes or selected_codes())
    if not universe:
        return []
    weight = float(CONFIG["target_weight"]) / len(universe)
    return [TargetPosition(code=code, weight=weight) for code in universe]


def should_rebalance(context) -> bool:
    day_count = int(getattr(context, "day_count", 0))
    return day_count % int(CONFIG["rebalance_days"]) == 0


def order_target_percent_safe(context, code: str, weight: float) -> None:
    """Call the BigQuant/BigTrader order function available in the template."""
    if "order_target_percent" in globals():
        order_target_percent(code, weight)  # type: ignore[name-defined]
        return
    if hasattr(context, "order_target_percent"):
        context.order_target_percent(code, weight)
        return
    raise RuntimeError("No order_target_percent function found in this BigQuant template.")


def current_position_codes(context) -> set[str]:
    portfolio = getattr(context, "portfolio", None)
    positions = getattr(portfolio, "positions", {}) if portfolio is not None else {}
    if isinstance(positions, dict):
        return {normalize_code(code) for code, pos in positions.items() if getattr(pos, "amount", 0) != 0}
    return set()


def rebalance(context) -> None:
    targets = build_targets()
    target_codes = {item.code for item in targets}

    for code in current_position_codes(context) - target_codes:
        order_target_percent_safe(context, code, 0.0)

    for item in targets:
        order_target_percent_safe(context, item.code, item.weight)


def initialize(context):
    context.day_count = 0
    context.m_quant_config = CONFIG
    if "set_benchmark" in globals():
        set_benchmark(CONFIG["benchmark"])  # type: ignore[name-defined]
    if "set_commission" in globals():
        # Keep this simple if the BigQuant template supports it; otherwise ignore.
        try:
            set_commission(PerOrder(buy_cost=0.0003, sell_cost=0.0013, min_cost=5))  # type: ignore[name-defined]
        except Exception:
            pass


def handle_data(context, data):
    if should_rebalance(context):
        rebalance(context)
    context.day_count = int(getattr(context, "day_count", 0)) + 1


def before_trading_start(context, data=None):
    context.m_quant_ready_codes = selected_codes()


if __name__ == "__main__":
    for target in build_targets():
        print(f"{target.code},{target.weight:.8f}")
