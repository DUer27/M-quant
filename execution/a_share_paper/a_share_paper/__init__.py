"""A 股/ETF Paper-only 执行框架（标准库）。"""
from .models import Signal, Order, Fill, Position, Account, LedgerEntry
from .paper_broker import PaperBroker
from .service import PaperService

__all__ = ["Signal", "Order", "Fill", "Position", "Account", "LedgerEntry", "PaperBroker", "PaperService"]
__version__ = "0.1.0"
