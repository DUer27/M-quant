"""Synthetic fixtures only: never used as market data by the application."""
import json
import sys
import tempfile
import subprocess
import unittest
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from market_data_refresh import CHINA, FIELDS, DailyUpdater, atomic_json, expected_trade_date, normalize_sina, refresh_lock, validate_history


class DailyRefreshTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="mquant-daily-test-"))
        self.pool = self.root / "pool.csv"
        self.pool.write_text("code,name\n000001,fixture-a\n600000,fixture-b\n", encoding="utf-8")
        self.calendar = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"]
        self.config = {"profile": "fixture", "label": "test fixture", "symbols_file": str(self.pool), "start_date": "2026-11-18", "schedule_time": "18:30", "completed_bar_after": "16:30", "min_history_days": 3, "max_workers": 1, "request_timeout": 1, "retries": 0}
        self.calls = 0
        self.signal_calls = 0
        self.provider_failed = False
        self.price = 10.0
        self.now = datetime(2026, 11, 23, 19, tzinfo=CHINA)

    def frame(self, code, end):
        rows = []
        for day in self.calendar:
            if day <= end:
                row = {field: None for field in FIELDS}
                row.update(date=day, code=code, name="fixture", open=self.price, close=self.price, high=self.price + 1, low=self.price - 1, volume=100, amount=10000, turnover=1, adjust="qfq", source="synthetic-test-only")
                rows.append(row)
        return pd.DataFrame(rows)

    def fetch(self, code, name, start, end, timeout, retries):
        self.calls += 1
        if self.provider_failed and code == "600000":
            raise RuntimeError("fixture provider unavailable")
        return self.frame(code, end)

    def signals(self, snapshot, target, directory):
        self.signal_calls += 1
        path = directory / "fixture-signals.json"
        atomic_json(path, {"signal_date": target, "observation_only": True, "route_count": 1, "routes": [{"action": "record_only"}]})
        return path

    def updater(self):
        return DailyUpdater(self.config, self.root / "runtime", self.fetch, lambda runtime, now: self.calendar, self.signals)

    def test_closed_bar_date_respects_china_time_weekend_and_cutoff(self):
        before = datetime(2026, 11, 23, 8, tzinfo=CHINA)
        weekend = datetime(2026, 11, 22, 19, tzinfo=CHINA)
        self.assertEqual(expected_trade_date(self.calendar, before, "16:30"), "2026-11-20")
        self.assertEqual(expected_trade_date(self.calendar, weekend, "16:30"), "2026-11-20")
        self.assertEqual(expected_trade_date(self.calendar, self.now, "16:30"), "2026-11-23")
        with self.assertRaises(ValueError):
            expected_trade_date(self.calendar, datetime(2026, 11, 25, 19, tzinfo=CHINA), "16:30")

    def test_complete_snapshot_and_repeat_uses_checked_cache(self):
        first = self.updater().run(self.now)
        second = self.updater().run(self.now)
        self.assertEqual(first["state"], "ready")
        self.assertEqual(second["coverage"]["fresh"], 2)
        self.assertEqual(self.calls, 2)
        self.assertEqual(first["last_success"]["data_date"], "2026-11-23")
        self.assertEqual(first["metrics"]["downloaded_stocks"], 2)
        self.assertEqual(second["metrics"]["cache_hits"], 2)
        self.assertEqual(second["metrics"]["downloaded_stocks"], 0)
        self.assertEqual(len(second["stock_details"]), 2)
        self.assertIn("signals_seconds", second["metrics"]["timings"])

    def test_managed_symbols_override_legacy_file_and_record_pool_version(self):
        self.config.update(managed_symbols=[{'code':'000001','name':'fixture-a'},{'code':'600519','name':'fixture-new'}],
                           pool_version=7,pool_id='fixture-library',symbols_file='unused-legacy-pool-does-not-exist.csv')
        result=self.updater().run(self.now)
        self.assertEqual(result['state'],'ready');self.assertEqual(result['pool_version'],7)
        self.assertEqual(result['last_success']['pool_version'],7)
        codes=set(pd.read_csv(result['last_success']['snapshot'],dtype={'code':str})['code'])
        self.assertEqual(codes,{'000001','600519'})

    def test_automatic_worker_skips_ready_and_respects_failure_backoff(self):
        first = self.updater().run(self.now, "fixture-slot")
        skipped = self.updater().run(self.now, "fixture-slot", automatic=True)
        self.assertEqual(skipped["state"], "skipped")
        path = self.root / "runtime/status.json"
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["run_id"], first["run_id"])
        first.update(state="failed", updated_at=self.now.isoformat())
        atomic_json(path, first)
        skipped = self.updater().run(self.now, "fixture-slot", automatic=True)
        self.assertEqual(skipped["state"], "skipped")
        self.assertIn("间隔", skipped["message"])

    def test_automatic_cli_reports_skip_with_successful_exit(self):
        self.updater().run(self.now, "fixture-slot")
        config = self.root / "config.json"
        atomic_json(config, self.config)
        process = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / "tools/market_data_refresh.py"),
                                  "--config", str(config), "--runtime", str(self.root / "runtime"),
                                  "--auto-key", "fixture-slot", "--automatic"], capture_output=True, text=True, encoding="utf-8",
                                  env=dict(__import__('os').environ, PYTHONIOENCODING="utf-8"))
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout)["state"], "skipped")

    def test_existing_queue_finishes_before_new_backfill(self):
        self.updater().run(self.now)
        path = self.root / "runtime/cache/000001.csv"
        path.unlink()
        order = []
        def fetch(*args):
            order.append(args[0])
            return self.fetch(*args)
        updater = self.updater(); updater.fetcher = fetch
        result = updater.run(datetime(2026, 11, 24, 19, tzinfo=CHINA))
        self.assertEqual(order, ["600000", "000001"])
        self.assertEqual(result["queues"], {"existing": 1, "backfill": 1})

    def test_partial_failure_keeps_last_success_and_does_not_publish_signals(self):
        first = self.updater().run(self.now)
        self.provider_failed = True
        second = self.updater().run(datetime(2026, 11, 24, 19, tzinfo=CHINA))
        self.assertEqual(second["state"], "failed")
        self.assertEqual(second["coverage"]["failed"], 1)
        self.assertEqual(second["last_success"], first["last_success"])
        self.assertEqual(self.signal_calls, 1)

    def test_qfq_history_replaces_entire_series_instead_of_appending(self):
        self.updater().run(self.now)
        self.price = 20.0
        result = self.updater().run(datetime(2026, 11, 24, 19, tzinfo=CHINA))
        frame = pd.read_csv(result["last_success"]["snapshot"])
        self.assertEqual(set(frame["close"]), {20.0})

    def test_corrupt_cached_history_is_refetched(self):
        self.updater().run(self.now)
        path = self.root / "runtime/cache/000001.csv"
        frame = pd.read_csv(path, dtype={"code": str})
        frame["close"] = -1
        frame.to_csv(path, index=False)
        result = self.updater().run(self.now)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(self.calls, 3)

    def test_stale_future_invalid_and_wrong_adjustment_are_rejected(self):
        base = self.frame("000001", "2026-11-23")
        cases = [base.iloc[:-1].copy(), self.frame("000001", "2026-11-24")]
        bad = base.copy(); bad.loc[0, "close"] = float("inf"); cases.append(bad)
        bad = base.copy(); bad["adjust"] = "hfq"; cases.append(bad)
        bad = base.copy(); bad.loc[0, "high"] = 1; cases.append(bad)
        for frame in cases:
            with self.subTest(frame=frame.iloc[-1]["date"]):
                with self.assertRaises(ValueError):
                    validate_history(frame, "000001", self.config["start_date"], "2026-11-23", self.calendar, 3)

    def test_signal_failure_is_visible_and_data_success_is_retained(self):
        def broken(*args):
            raise RuntimeError("fixture signal error")
        updater = self.updater(); updater.signal_builder = broken
        result = updater.run(self.now)
        self.assertEqual(result["state"], "attention")
        self.assertIsNone(result["last_success"]["signals"])
        self.assertEqual(result["last_success"]["data_date"], "2026-11-23")

    def test_concurrent_refresh_is_locked(self):
        with refresh_lock(self.root / "runtime"):
            with self.assertRaises((RuntimeError, OSError)):
                with refresh_lock(self.root / "runtime"):
                    self.fail("Second update obtained an occupied lock")

    def test_sina_units_are_converted_without_inventing_amount(self):
        frame = normalize_sina(pd.DataFrame([{'volume': 1000, 'turnover': 0.05}]))
        self.assertEqual(frame['volume'].iloc[0], 10)
        self.assertEqual(frame['turnover'].iloc[0], 5)
        self.assertNotIn('amount', frame)


if __name__ == "__main__":
    unittest.main()
