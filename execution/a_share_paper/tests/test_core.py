import json
import tempfile
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))

from a_share_paper.models import Account, Position, Signal
from a_share_paper.validation import validate_signal
from a_share_paper.rules import TradingRules
from a_share_paper.risk import RiskConfig, RiskManager
from a_share_paper.paper_broker import PaperBroker
from a_share_paper.service import PaperService


class Tests(unittest.TestCase):
    def valid_signal(self, **overrides):
        data = {
            "schema_version": "1.0", "signal_id": "x", "strategy_id": "s1",
            "data_policy": "synthetic_quote", "risk": {"purpose": "test"},
            "symbol": "600000", "side": "BUY", "quantity": 100, "asset_type": "stock",
        }
        data.update(overrides)
        return Signal.from_dict(data)

    def test_schema_expiry_and_required_provenance(self):
        signal = self.valid_signal(expires_at="2020-01-01T00:00:00+00:00")
        self.assertIn("signal_expired", validate_signal(signal))
        signal.schema_version = "9"
        self.assertIn("unsupported_schema_version", validate_signal(signal))
        self.assertIn("missing_strategy_id", validate_signal(self.valid_signal(strategy_id="")))
        self.assertIn("missing_data_policy", validate_signal(self.valid_signal(data_policy="")))

    def test_broker_idempotency_cash_position_fee_slippage(self):
        broker = PaperBroker(
            account=Account(cash=Decimal("100000"), initial_cash=Decimal("100000")),
            risk=RiskManager(RiskConfig(max_symbol_weight=Decimal("1"), max_turnover=Decimal("10"))),
            slippage_bps=Decimal("10"),
        )
        buy = broker.submit("s1", "600000", "BUY", 100, Decimal("10"))
        cash_after_buy = broker.account.cash
        self.assertEqual(broker.submit("s1", "600000", "BUY", 100, Decimal("10")).order_id, buy.order_id)
        self.assertEqual(broker.account.positions["600000"].quantity, 100)
        self.assertLess(cash_after_buy, Decimal("99000"))
        self.assertNotEqual(broker.fills[buy.fill_id].price, Decimal("10"))
        sell = broker.submit("s2", "600000", "SELL", 100, Decimal("11"))
        self.assertEqual(sell.status, "FILLED")
        self.assertNotIn("600000", broker.account.positions)
        self.assertEqual(len(broker.ledger), 2)

    def test_reject_risk_and_rules(self):
        rules = TradingRules()
        self.assertEqual(rules.validate("x", "BUY", 99, "stock"), "invalid_lot_size")
        self.assertEqual(rules.validate("x", "BUY", 100, "stock", when=datetime(2025, 1, 4, 10, 0)), "outside_trading_session")
        suspended = TradingRules(is_suspended=lambda symbol: symbol == "600000")
        self.assertEqual(suspended.validate("600000", "BUY", 100, "stock"), "suspended")
        t1 = Position("600000", quantity=100, available_quantity=0)
        self.assertEqual(rules.validate("600000", "SELL", 100, "stock", t1), "insufficient_available_position")
        broker = PaperBroker(risk=RiskManager(RiskConfig(max_order_value=Decimal("1"))))
        rejected = broker.submit("x", "600000", "BUY", 100, Decimal("10"))
        self.assertEqual(rejected.status, "REJECTED")
        self.assertEqual(broker.snapshot()["rejections"][0]["reason"], "max_order_value")

    def test_cash_reserve_and_live_guard(self):
        broker = PaperBroker(
            account=Account(cash=Decimal("1000"), initial_cash=Decimal("1000")),
            risk=RiskManager(RiskConfig(
                max_symbol_weight=Decimal("1"), max_order_value=Decimal("100000"), max_turnover=Decimal("10")
            )),
        )
        self.assertEqual(broker.submit("cash", "600000", "BUY", 100, Decimal("10")).reason, "cash_reserve")
        with self.assertRaises(ValueError):
            PaperBroker(mode="LIVE")

    def test_file_import_duplicate_bad_json_and_state_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = PaperService(root)
            (root / "quotes.json").write_text(json.dumps({"510300": {"price": "4", "tradable": True}}))
            valid = root / "buy.json"
            valid.write_text(json.dumps({
                "schema_version": "1.0", "signal_id": "x", "strategy_id": "s1",
                "data_policy": "synthetic_quote", "risk": {}, "symbol": "510300",
                "side": "BUY", "quantity": 100, "asset_type": "etf",
            }))
            self.assertEqual(service.process_one(valid)["status"], "FILLED")
            self.assertEqual(service.process_one(valid)["status"], "DUPLICATE")
            restored = PaperService(root)
            self.assertEqual(restored.snapshot()["account"]["positions"]["510300"]["quantity"], 100)
            bad = root / "bad.json"
            bad.write_text("not-json")
            self.assertEqual(restored.process_one(bad)["status"], "REJECTED")
            self.assertEqual(restored.snapshot()["ledger"][-1]["entry_type"], "INPUT_REJECTED")

    def test_file_import_expired_and_not_tradable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = PaperService(root)
            (root / "quotes.json").write_text(json.dumps({"510300": {"price": "4", "tradable": False}}))
            expired = root / "expired.json"
            expired.write_text(json.dumps({
                "schema_version": "1.0", "signal_id": "expired", "strategy_id": "s1",
                "data_policy": "synthetic_quote", "risk": {}, "symbol": "510300",
                "side": "BUY", "quantity": 100, "asset_type": "etf",
                "expires_at": "2020-01-01T00:00:00+00:00",
            }))
            self.assertEqual(service.process_one(expired)["status"], "REJECTED")
            self.assertIn("signal_expired", service.snapshot()["ledger"][-1]["details"]["errors"])
            halted = root / "halted.json"
            halted.write_text(json.dumps({
                "schema_version": "1.0", "signal_id": "halted", "strategy_id": "s1",
                "data_policy": "synthetic_quote", "risk": {}, "symbol": "510300",
                "side": "BUY", "quantity": 100, "asset_type": "etf",
            }))
            self.assertEqual(service.process_one(halted)["status"], "REJECTED")
            self.assertEqual(service.snapshot()["ledger"][-1]["details"]["reason"], "quote_not_tradable")


if __name__ == "__main__":
    unittest.main()
