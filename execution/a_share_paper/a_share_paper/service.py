"""JSON 文件边界服务；不启动网络服务，未来 REST 可在此边界接入。"""
from datetime import datetime
from pathlib import Path
import json
from decimal import Decimal
from typing import Optional
from .models import Signal, Account, Fill, LedgerEntry, Order, account_from_dict
from .paper_broker import PaperBroker
from .validation import validate_signal


class PaperService:
    def __init__(self, data_dir: str | Path, broker: Optional[PaperBroker] = None):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.inbox = self.data_dir / "signals"
        self.inbox.mkdir(exist_ok=True)
        self.state_file = self.data_dir / "state.json"
        self.broker = broker or PaperBroker(account=self._load_account())
        self.processed = set()
        self._load_state()

    def _load_account(self) -> Account:
        if self.state_file.exists():
            try:
                return account_from_dict(json.loads(self.state_file.read_text(encoding="utf-8")).get("account", {}))
            except (ValueError, OSError, TypeError, json.JSONDecodeError):
                pass
        return Account()

    def _load_state(self) -> None:
        if not self.state_file.exists():
            return
        try:
            state = json.loads(self.state_file.read_text(encoding="utf-8"))
            self.processed = set(state.get("processed", []))
            for raw in state.get("orders", []):
                order = Order(
                    order_id=raw["order_id"], signal_id=raw["signal_id"], symbol=raw["symbol"],
                    side=raw["side"], quantity=int(raw["quantity"]),
                    requested_price=Decimal(str(raw["requested_price"])), status=raw.get("status", "PENDING"),
                    reason=raw.get("reason", ""), created_at=raw.get("created_at", ""),
                    filled_quantity=int(raw.get("filled_quantity", 0)), fill_id=raw.get("fill_id"),
                )
                self.broker.orders[order.signal_id] = order
            for raw in state.get("fills", []):
                fill = Fill(
                    raw["fill_id"], raw["order_id"], raw["symbol"], raw["side"], int(raw["quantity"]),
                    Decimal(str(raw["price"])), Decimal(str(raw["fee"])), Decimal(str(raw["slippage"])),
                    raw.get("executed_at", ""),
                )
                self.broker.fills[fill.fill_id] = fill
            self.broker.ledger = [
                LedgerEntry(
                    raw["entry_id"], raw["entry_type"], raw.get("order_id"), raw.get("signal_id"),
                    raw.get("symbol"), Decimal(str(raw["amount"])), raw.get("details", {}), raw.get("timestamp", ""),
                )
                for raw in state.get("ledger", [])
            ]
            self.broker.turnover = Decimal(str(state.get("turnover", "0")))
        except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError):
            self.processed = set()

    def _save(self) -> None:
        data = self.broker.snapshot()
        data["processed"] = sorted(self.processed)
        data["turnover"] = str(self.broker.turnover)
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    def _input_rejection(self, key: str, reason: str, details: Optional[dict] = None) -> dict:
        self.broker.ledger.append(LedgerEntry(
            entry_id="led-" + str(len(self.broker.ledger) + 1), entry_type="INPUT_REJECTED",
            order_id=None, signal_id=None, symbol=None, amount=Decimal("0"),
            details={"file": key, "reason": reason, **(details or {})},
        ))
        self.processed.add(key)
        self._save()
        return {"file": key, "status": "REJECTED", "errors": [reason]}

    @staticmethod
    def _market_time(raw: dict, quote: dict) -> Optional[datetime]:
        value = raw.get("market_time") or quote.get("market_time")
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None

    def process_one(self, path: str | Path) -> dict:
        path = Path(path)
        key = path.name
        if key in self.processed:
            return {"file": key, "status": "DUPLICATE"}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return self._input_rejection(key, "signal_must_be_object")
            signal = Signal.from_dict(data)
        except (OSError, json.JSONDecodeError, TypeError, ValueError, OverflowError) as exc:
            return self._input_rejection(key, "invalid_json_or_signal", {"detail": str(exc)})

        errors = validate_signal(signal)
        if errors:
            self.processed.add(key)
            self.broker.ledger.append(LedgerEntry(
                entry_id="led-" + str(len(self.broker.ledger) + 1), entry_type="INPUT_REJECTED",
                order_id=None, signal_id=signal.signal_id or None, symbol=signal.symbol or None,
                amount=Decimal("0"), details={"file": key, "errors": errors},
            ))
            self._save()
            return {"file": key, "status": "REJECTED", "errors": errors}

        quote = {}
        try:
            quotes = self.data_dir / "quotes.json"
            if quotes.exists():
                quote = json.loads(quotes.read_text(encoding="utf-8")).get(signal.symbol, {})
        except (OSError, json.JSONDecodeError, TypeError, AttributeError):
            return self._input_rejection(key, "invalid_quotes_snapshot")
        if quote.get("tradable") is False:
            return self._input_rejection(key, "quote_not_tradable", {"symbol": signal.symbol})
        price = data.get("price", quote.get("price"))
        if price is None:
            return self._input_rejection(key, "missing_price_snapshot")
        try:
            price = Decimal(str(price))
        except (ValueError, TypeError):
            return self._input_rejection(key, "invalid_price_snapshot")
        quantity = signal.quantity
        if quantity is None:
            lot = self.broker.rules.lot_size(signal.asset_type)
            quantity = int((self.broker.account.cash * signal.target_weight / price) // lot) * lot
        order = self.broker.submit(
            signal.signal_id, signal.symbol, signal.side, quantity, price, signal.asset_type,
            now=self._market_time(data, quote),
        )
        self.processed.add(key)
        self._save()
        return {"file": key, "status": order.status, "order": order.order_id, "reason": order.reason}

    def process_pending(self) -> list[dict]:
        return [self.process_one(p) for p in sorted(self.inbox.glob("*.json"))]

    def snapshot(self) -> dict:
        return self.broker.snapshot()

    # REST boundary placeholder: future adapters should call process_one/process_pending/snapshot.
