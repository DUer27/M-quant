"""可组合的 paper 风控规则。"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict
from .models import Account


@dataclass
class RiskConfig:
    enabled: bool = True
    max_symbol_weight: Decimal = Decimal("0.30")
    max_order_value: Decimal = Decimal("100000")
    max_orders: int = 20
    max_turnover: Decimal = Decimal("0.50")
    cash_reserve: Decimal = Decimal("0.10")


class RiskManager:
    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()

    def check(self, account: Account, symbol: str, side: str, quantity: int, price: Decimal,
              prices: Dict[str, Decimal], orders_count: int = 0, turnover: Decimal = Decimal("0")) -> str | None:
        if not self.config.enabled:
            return None
        value = Decimal(quantity) * price
        if value > self.config.max_order_value:
            return "max_order_value"
        if orders_count >= self.config.max_orders:
            return "max_orders"
        if turnover + value > account.initial_cash * self.config.max_turnover:
            return "max_turnover"
        if side.upper() == "BUY":
            if account.cash - value < account.initial_cash * self.config.cash_reserve:
                return "cash_reserve"
            total = account.cash + sum(Decimal(p.quantity) * prices.get(s, price) for s, p in account.positions.items())
            current = Decimal(account.positions.get(symbol).quantity if symbol in account.positions else 0) * price
            if total and (current + value) / total > self.config.max_symbol_weight:
                return "max_symbol_weight"
        return None
