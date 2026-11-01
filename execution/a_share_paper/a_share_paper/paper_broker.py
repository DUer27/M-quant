"""内存中的 PAPER broker：快照成交，状态与 ledger 可持久化到 service。"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional
from .models import Account, Fill, LedgerEntry, Order, Position
from .risk import RiskManager
from .rules import TradingRules


class PaperBroker:
    def __init__(self, account: Optional[Account] = None, rules: Optional[TradingRules] = None,
                 risk: Optional[RiskManager] = None, fee_rate: Decimal = Decimal("0.0003"),
                 slippage_bps: Decimal = Decimal("5"), mode: str = "PAPER"):
        if mode.upper() != "PAPER":
            raise ValueError("LIVE execution is explicitly unsupported; use PAPER")
        self.account = account or Account()
        self.rules, self.risk = rules or TradingRules(), risk or RiskManager()
        self.fee_rate, self.slippage_bps = Decimal(fee_rate), Decimal(slippage_bps)
        self.orders: Dict[str, Order] = {}
        self.fills: Dict[str, Fill] = {}
        self.ledger: List[LedgerEntry] = []
        self.turnover = Decimal("0")

    def submit(self, signal_id: str, symbol: str, side: str, quantity: int, price: Decimal,
               asset_type: str = "stock", now: Optional[datetime] = None) -> Order:
        if signal_id in self.orders:
            return self.orders[signal_id]
        side = side.upper(); price = Decimal(price)
        position = self.account.positions.get(symbol)
        reason = self.rules.validate(symbol, side, quantity, asset_type, position, now)
        if not reason:
            reason = self.risk.check(self.account, symbol, side, quantity, price, {symbol: price}, len(self.orders), self.turnover)
        order = Order(order_id="ord-" + signal_id, signal_id=signal_id, symbol=symbol, side=side,
                      quantity=quantity, requested_price=price)
        if reason:
            return self._reject(order, reason)
        execution_price = price * (Decimal("1") + self.slippage_bps / Decimal("100000") * (1 if side == "BUY" else -1))
        fee = execution_price * quantity * self.fee_rate
        total = execution_price * quantity
        if side == "BUY":
            if self.account.cash - total - fee < 0:
                return self._reject(order, "insufficient_cash")
            old = position or Position(symbol)
            new_qty = old.quantity + quantity
            old.average_price = ((old.average_price * old.quantity) + total) / new_qty
            old.quantity = old.available_quantity = new_qty
            self.account.positions[symbol] = old
        else:
            if not position or position.available_quantity < quantity:
                return self._reject(order, "insufficient_available_position")
            position.quantity -= quantity; position.available_quantity -= quantity
            if position.quantity == 0:
                self.account.positions.pop(symbol, None)
            self.account.cash += total - fee
        self.account.cash -= (total + fee) if side == "BUY" else Decimal("0")
        self.account.fees_paid += fee; self.turnover += total
        fill = Fill("fill-" + signal_id, order.order_id, symbol, side, quantity, execution_price, fee,
                    execution_price - price)
        order.status, order.filled_quantity, order.fill_id = "FILLED", quantity, fill.fill_id
        self.orders[signal_id], self.fills[fill.fill_id] = order, fill
        self._entry("FILL", order, total, {"fill_id": fill.fill_id, "fee": str(fee), "price": str(execution_price)})
        return order

    def _reject(self, order: Order, reason: str) -> Order:
        order.status, order.reason = "REJECTED", reason
        self.orders[order.signal_id] = order
        self._entry("ORDER_REJECTED", order, Decimal("0"), {"reason": reason})
        return order

    def _entry(self, kind: str, order: Order, amount: Decimal, details: dict) -> None:
        self.ledger.append(LedgerEntry("led-" + str(len(self.ledger) + 1), kind, order.order_id,
                                       order.signal_id, order.symbol, amount, details))

    def snapshot(self) -> dict:
        from .models import to_dict
        rejected = [to_dict(x) for x in self.orders.values() if x.status == "REJECTED"]
        return {
            "runtime": {"mode": "PAPER", "broker": "PaperBroker", "live_supported": False},
            "account": to_dict(self.account),
            "orders": [to_dict(x) for x in self.orders.values()],
            "fills": [to_dict(x) for x in self.fills.values()],
            "ledger": [to_dict(x) for x in self.ledger],
            "rejections": rejected,
        }
