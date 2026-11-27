"""Provider fault tests use local fixtures only, never public request endpoints."""
import json
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from market_data_sources import SourceManager


class FakeSession:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Path(tempfile.mkdtemp(prefix="mquant-sources-"))
        self.time = 1000.0
        self.calls = []

    def sleep(self, delay):
        self.time += delay

    def manager(self, fetch, **kwargs):
        return SourceManager({"source_failure_threshold": 2, "source_cooldown_seconds": 30}, fetch,
                             self.runtime, "fixture", clock=lambda: self.time,
                             monotonic=lambda: self.time, sleep=self.sleep,
                             session_factory=FakeSession, **kwargs)

    def fetch(self, source, code, name, start, end, timeout, session):
        self.calls.append((source, session))
        if source == "eastmoney":
            raise ConnectionError("fixture connection failure")
        return {"source": source, "code": code}

    def get(self, manager, retries=0):
        return manager.fetch("000001", "fixture", "2024-01-01", "2026-11-24", 1, retries)

    def test_fallback_reorders_and_reuses_worker_connection(self):
        with self.manager(self.fetch) as manager:
            self.assertEqual(self.get(manager)["source"], "tencent")
            self.get(manager)
            self.assertEqual([source for source, _ in self.calls], ["eastmoney", "tencent", "tencent"])
            self.assertEqual(len({id(session) for _, session in self.calls}), 1)
            self.assertGreaterEqual(manager.summary()["tencent"]["wait_seconds"], 0.6 - 1e-6)
        self.assertTrue(self.calls[0][1].closed)
        events = [json.loads(row) for row in (self.runtime / "requests/fixture.jsonl").read_text().splitlines()]
        self.assertEqual(len(events), 3)
        self.assertFalse(events[0]["ok"])
        self.assertNotIn("fixture connection failure", json.dumps(events))

    def test_circuit_cooldown_and_single_recovery_probe(self):
        with self.manager(self.fetch) as manager:
            self.get(manager, retries=1)
            self.assertFalse(manager.claim("eastmoney"))
            self.time += 31
            self.assertEqual(manager.order()[0], "eastmoney")
            self.assertTrue(manager.claim("eastmoney"))
            self.assertFalse(manager.claim("eastmoney"))
            manager.record("eastmoney", "000001", 1, self.time, 0)
            self.assertTrue(manager.claim("eastmoney"))
            self.assertEqual(manager.health["eastmoney"]["consecutive_failures"], 0)

    def test_validation_failure_tries_another_source(self):
        def fetch(source, *args):
            return {"source": source}
        def validate(frame, code):
            if frame["source"] == "eastmoney":
                raise ValueError("fixture invalid OHLC")
            return frame
        with self.manager(fetch, validator=validate) as manager:
            self.assertEqual(self.get(manager)["source"], "tencent")
            self.assertEqual(manager.summary()["eastmoney"]["failures"], 1)

    def test_all_failures_are_bounded_and_circuit_is_persisted(self):
        def fail(*args):
            raise TimeoutError("fixture timeout")
        with self.manager(fail) as manager:
            with self.assertRaises(RuntimeError):
                self.get(manager, retries=9)
            self.assertEqual(sum(x["requests"] for x in manager.summary().values()), 6)
        with self.manager(fail) as manager:
            with self.assertRaises(RuntimeError):
                self.get(manager)
            self.assertEqual(sum(x["requests"] for x in manager.summary().values()), 0)

    def test_each_thread_owns_its_session(self):
        barrier = threading.Barrier(2)
        with self.manager(lambda *args: {}) as manager:
            def worker(_):
                session = manager.session()
                barrier.wait(timeout=5)
                self.assertIs(session, manager.session())
                return session
            with ThreadPoolExecutor(max_workers=2) as executor:
                sessions = list(executor.map(worker, range(2)))
            self.assertIsNot(sessions[0], sessions[1])
        self.assertTrue(all(session.closed for session in sessions))

    def test_rate_limit_honors_retry_after_and_uses_fallback(self):
        def fetch(source, *args):
            if source == "eastmoney":
                response = requests.Response()
                response.status_code = 429
                response.headers["Retry-After"] = "120"
                raise requests.HTTPError("fixture rate limit", response=response)
            return {"source": source}
        with self.manager(fetch) as manager:
            self.assertEqual(self.get(manager, retries=1)["source"], "tencent")
            self.assertEqual(manager.summary()["eastmoney"]["requests"], 1)
            self.assertGreaterEqual(manager.health["eastmoney"]["blocked_until"], 1120)


if __name__ == "__main__":
    unittest.main()
