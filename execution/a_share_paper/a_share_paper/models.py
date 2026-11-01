"""Paper execution 的核心数据模型；仅使用 Python 标准库。"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional
import json

SCHEMA_VERSION = "1.0"


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value") and not isinstance(value, (str, int, float, bool)):
        return value.value
    if isinstance(value, dict):
        return {k: _json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(v) for v in value]
    return value


def to_dict(obj: Any) -> Dict[str, Any]:
    return _json_value(asdict(obj))


def to_json(obj: Any) -> str:
    return json.dumps(to_dict(obj), ensure_ascii=False, sort_keys=True)


@dataclass
class Signal:
    """M-quant 只需输出这个版本化 JSON，不直接调用执行系统."""
    signal_id: str
    symbol: str
    strategy_id: str = ""
    data_policy: str = ""
    side: str = "BUY"
    quantity: Optional[int] = None
    target_weight: Optional[Decimal] = None
    asset_type: str = "stock"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at: Optional[str] = None
    schema_version: str = SCHEMA_VERSION
    risk: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Signal":
        return cls(
            signal_id=str(data.get("signal_id", data.get("id", ""))),
            symbol=str(data.get("symbol", "")),
            strategy_id=str(data.get("strategy_id", "")),
            data_policy=str(data.get("data_policy", data.get("data_source", ""))),
            side=str(data.get("side", "BUY")).upper(),
            quantity=None if data.get("quantity") is None else int(data["quantity"]),
            target_weight=None if data.get("target_weight") is None else Decimal(str(data["target_weight"])),
            asset_type=str(data.get("asset_type", "stock")).lower(),
            created_at=str(data.get("created_at", datetime.now(timezone.utc).isoformat())),
            expires_at=data.get("expires_at"),
            schema_version=str(data.get("schema_version", data.get("version", SCHEMA_VERSION))),
            risk=dict(data.get("risk", data.get("risk_params", {}))),
            metadata=dict(data.get("metadata", {})),
        )


@dataclass
class Order:
    order_id: str
    signal_id: str
    symbol: str
    side: str
    quantity: int
    requested_price: Decimal
    status: str = "PENDING"
    reason: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    filled_quantity: int = 0
    fill_id: Optional[str] = None


@dataclass
class Fill:
    fill_id: str
    order_id: str
    symbol: str
    side: str
    quantity: int
    price: Decimal
    fee: Decimal
    slippage: Decimal
    executed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class Position:
    symbol: str
    quantity: int = 0
    average_price: Decimal = Decimal("0")
    available_quantity: int = 0


@dataclass
class Account:
    account_id: str = "paper"
    cash: Decimal = Decimal("1000000")
    initial_cash: Decimal = Decimal("1000000")
    positions: Dict[str, Position] = field(default_factory=dict)
    fees_paid: Decimal = Decimal("0")


@dataclass
class LedgerEntry:
    entry_id: str
    entry_type: str
    order_id: Optional[str]
    signal_id: Optional[str]
    symbol: Optional[str]
    amount: Decimal
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def account_from_dict(data: Dict[str, Any]) -> Account:
    positions = {
        symbol: Position(
            symbol=symbol,
            quantity=int(p.get("quantity", 0)),
            average_price=Decimal(str(p.get("average_price", "0"))),
            available_quantity=int(p.get("available_quantity", p.get("quantity", 0))),
        )
        for symbol, p in data.get("positions", {}).items()
    }
    return Account(
        account_id=data.get("account_id", "paper"),
        cash=Decimal(str(data.get("cash", "0"))),
        initial_cash=Decimal(str(data.get("initial_cash", data.get("cash", "0")))),
        positions=positions,
        fees_paid=Decimal(str(data.get("fees_paid", "0"))),
    )
