"""Bounded, observable daily providers. No fabricated data or unlimited retries."""
import json
import os
import threading
import time
import uuid
from pathlib import Path

import requests


class SourceManager:
    sources = ("eastmoney", "tencent", "sina")

    def __init__(self, config, fetch_source, runtime=None, run_id=None, validator=None,
                 clock=time.time, monotonic=time.monotonic, sleep=time.sleep,
                 session_factory=requests.Session):
        self.config, self.fetch_source, self.validator = config, fetch_source, validator
        self.clock, self.monotonic, self.sleep = clock, monotonic, sleep
        self.session_factory = session_factory
        self.runtime = Path(runtime) if runtime else None
        self.event_path = self.runtime / "requests" / (run_id + ".jsonl") if self.runtime and run_id else None
        self.lock = threading.RLock()
        self.limiters = {source: threading.Lock() for source in self.sources}
        self.last_request = {source: float("-inf") for source in self.sources}
        self.local = threading.local()
        self.sessions = []
        self.probing = set()
        self.health = {}
        self.stats = {source: {"requests": 0, "successes": 0, "failures": 0,
                              "request_seconds": 0.0, "wait_seconds": 0.0,
                              "validation_seconds": 0.0,
                              "skipped": 0} for source in self.sources}
        if self.runtime:
            try:
                self.health = json.loads((self.runtime / "source-health.json").read_text(encoding="utf-8"))
            except (FileNotFoundError, ValueError):
                pass
        for source in self.sources:
            self.health.setdefault(source, {})

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def close(self):
        for session in self.sessions:
            session.close()
        if self.runtime:
            self.runtime.mkdir(parents=True, exist_ok=True)
            path = self.runtime / "source-health.json"
            temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
            temporary.write_text(json.dumps(self.health, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temporary, path)

    def session(self):
        # requests.Session is intentionally not shared between worker threads.
        if not hasattr(self.local, "session"):
            self.local.session = self.session_factory()
            with self.lock:
                self.sessions.append(self.local.session)
        return self.local.session

    def order(self):
        def score(source):
            h = self.health[source]
            if h.get("blocked_until", 0) and h["blocked_until"] <= self.clock():
                return -1  # a single recovery probe is allowed, rather than permanent exclusion
            attempts = h.get("successes", 0) + h.get("failures", 0)
            penalty = 30 * h.get("failures", 0) / max(attempts, 1)
            return h.get("latency_ewma", 5.0) + penalty
        with self.lock:
            return sorted(self.sources, key=score)

    def claim(self, source):
        with self.lock:
            h = self.health[source]
            until = h.get("blocked_until", 0)
            if until > self.clock() or source in self.probing:
                self.stats[source]["skipped"] += 1
                return False
            if until:
                self.probing.add(source)  # one recovery probe after cooldown
            return True

    def wait(self, source):
        started = self.monotonic()
        interval = max(0.6, float(self.config.get("source_interval_seconds", 0.6)))
        with self.limiters[source]:
            delay = interval - (self.monotonic() - self.last_request[source])
            if delay > 0:
                self.sleep(delay)
            self.last_request[source] = self.monotonic()
        return self.monotonic() - started

    def record(self, source, code, attempt, started, waited, error=None, request_seconds=None):
        total = self.monotonic() - started
        elapsed = total if request_seconds is None else request_seconds
        validation = max(0, total - elapsed)
        event = {"at": self.clock(), "code": code, "source": source, "attempt": attempt,
                 "ok": error is None, "request_seconds": round(elapsed, 4),
                 "wait_seconds": round(waited, 4), "validation_seconds": round(validation, 4)}
        with self.lock:
            stats, h = self.stats[source], self.health[source]
            stats["requests"] += 1
            stats["request_seconds"] += elapsed
            stats["wait_seconds"] += waited
            stats["validation_seconds"] += validation
            h["latency_ewma"] = elapsed * 0.3 + h.get("latency_ewma", elapsed) * 0.7
            self.probing.discard(source)
            if error is None:
                stats["successes"] += 1
                h["successes"] = h.get("successes", 0) + 1
                h["consecutive_failures"] = 0
                h["blocked_until"] = 0
                h["last_success_at"] = self.clock()
            else:
                stats["failures"] += 1
                h["failures"] = h.get("failures", 0) + 1
                h["consecutive_failures"] = h.get("consecutive_failures", 0) + 1
                # Store the error type, not raw URLs or proxy credentials.
                event["error"] = h["last_error"] = type(error).__name__
                if isinstance(error, (ValueError, KeyError)):
                    event["reason"] = str(error)[:300]
                h["last_failure_at"] = self.clock()
                response = getattr(error, "response", None)
                if response is not None:
                    event["http_status"] = response.status_code
                limited = response is not None and response.status_code in (429, 403)
                if h["consecutive_failures"] >= int(self.config.get("source_failure_threshold", 3)) or limited:
                    cooldown = max(30, float(self.config.get("source_cooldown_seconds", 300)))
                    if response is not None:
                        try:
                            cooldown = max(cooldown, float(response.headers.get("Retry-After", 0)))
                        except ValueError:
                            pass
                    h["blocked_until"] = self.clock() + cooldown
            if self.event_path:
                self.event_path.parent.mkdir(parents=True, exist_ok=True)
                with self.event_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def fetch(self, code, name, start, end, timeout, retries):
        errors = []
        for source in self.order():
            for attempt in range(max(0, min(int(retries), 2)) + 1):
                if not self.claim(source):
                    errors.append(source + ": cooling down")
                    break
                waited = self.wait(source)
                # Another in-flight request may have opened the circuit while waiting.
                with self.lock:
                    if self.health[source].get("blocked_until", 0) > self.clock():
                        self.probing.discard(source)
                        self.stats[source]["skipped"] += 1
                        break
                started = self.monotonic()
                fetched = None
                try:
                    frame = self.fetch_source(source, code, name, start, end, timeout, self.session())
                    fetched = self.monotonic() - started
                    if self.validator:
                        frame = self.validator(frame, code)
                except Exception as error:
                    self.record(source, code, attempt + 1, started, waited, error, fetched)
                    errors.append(source + ": " + type(error).__name__)
                    if attempt < retries:
                        self.sleep(min(attempt + 1, 2))
                else:
                    self.record(source, code, attempt + 1, started, waited, request_seconds=fetched)
                    return frame
        raise RuntimeError("All daily sources failed: " + "; ".join(errors)[-900:])

    def summary(self):
        with self.lock:
            return {source: {**stats, "request_seconds": round(stats["request_seconds"], 3),
                             "wait_seconds": round(stats["wait_seconds"], 3),
                             "validation_seconds": round(stats["validation_seconds"], 3),
                             "cooldown_remaining_seconds": max(0, round(self.health[source].get("blocked_until", 0) - self.clock())),
                             "blocked_until": self.health[source].get("blocked_until", 0),
                             "last_error": self.health[source].get("last_error")}
                    for source, stats in self.stats.items()}
