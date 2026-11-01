"""信号 schema 与时间有效性检查。"""
from datetime import datetime, timezone
from typing import List
from .models import Signal, SCHEMA_VERSION


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_signal(signal: Signal, now: datetime | None = None) -> List[str]:
    errors: List[str] = []
    if signal.schema_version != SCHEMA_VERSION:
        errors.append("unsupported_schema_version")
    if not signal.signal_id:
        errors.append("missing_signal_id")
    if not signal.strategy_id:
        errors.append("missing_strategy_id")
    if not signal.data_policy:
        errors.append("missing_data_policy")
    if not signal.symbol:
        errors.append("missing_symbol")
    if signal.side not in {"BUY", "SELL"}:
        errors.append("invalid_side")
    if signal.quantity is None and signal.target_weight is None:
        errors.append("quantity_or_target_weight_required")
    if signal.quantity is not None and signal.quantity <= 0:
        errors.append("quantity_must_be_positive")
    if signal.target_weight is not None and not (DecimalLike.is_decimal(signal.target_weight) and 0 <= signal.target_weight <= 1):
        errors.append("target_weight_out_of_range")
    if not isinstance(signal.risk, dict):
        errors.append("risk_parameters_must_be_object")
    if signal.asset_type not in {"stock", "etf"}:
        errors.append("invalid_asset_type")
    try:
        created = _parse(signal.created_at)
        current = now or datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if signal.expires_at and _parse(signal.expires_at) <= current:
            errors.append("signal_expired")
    except (TypeError, ValueError):
        errors.append("invalid_timestamp")
    return errors


class DecimalLike:
    """避免校验层引入额外依赖；Signal.from_dict 已将数值转为 Decimal。"""
    @staticmethod
    def is_decimal(value: object) -> bool:
        from decimal import Decimal
        return isinstance(value, Decimal)


def is_expired(signal: Signal, now: datetime | None = None) -> bool:
    if not signal.expires_at:
        return False
    try:
        expiry = _parse(signal.expires_at)
        current = now or datetime.now(timezone.utc)
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry <= current
    except (TypeError, ValueError):
        return True
