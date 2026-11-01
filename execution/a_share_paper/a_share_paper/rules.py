"""A 股规则：默认保守拒绝非交易时段及违规数量。"""
from datetime import datetime, time
from typing import Callable, Optional
from .models import Position


class TradingRules:
    def __init__(self, etf_lot: int = 100, is_suspended: Optional[Callable[[str], bool]] = None):
        self.etf_lot = etf_lot
        self.is_suspended = is_suspended or (lambda symbol: False)

    def is_trading_session(self, when: datetime) -> bool:
        t = when.time()
        return when.weekday() < 5 and ((time(9, 30) <= t <= time(11, 30)) or (time(13, 0) <= t <= time(15, 0)))

    def lot_size(self, asset_type: str) -> int:
        return self.etf_lot if asset_type.lower() == "etf" else 100

    def validate(self, symbol: str, side: str, quantity: int, asset_type: str,
                 position: Optional[Position] = None, when: Optional[datetime] = None) -> Optional[str]:
        if when is not None and not self.is_trading_session(when):
            return "outside_trading_session"
        if self.is_suspended(symbol):
            return "suspended"
        lot = self.lot_size(asset_type)
        if quantity <= 0 or quantity % lot:
            return "invalid_lot_size"
        if side.upper() == "SELL":
            if position is None or position.available_quantity < quantity:
                return "insufficient_available_position"
            t1_reason = self.t_plus_one_check(position, quantity)
            if t1_reason:
                return t1_reason
        return None

    def t_plus_one_check(self, position: Position, quantity: int, trade_date: Optional[str] = None) -> Optional[str]:
        """T+1 扩展点；available_quantity 由上游结算层更新，默认代表可卖数量。"""
        return None if position.available_quantity >= quantity else "t_plus_one_unavailable"
