"""Shadow storage: observed quotes/minutes are never promoted to verified bars here."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def minute_metadata(value):
    version = value.get("version") or digest({k: value[k] for k in ("source", "code", "adjust", "rows")})
    return {**{k: v for k, v in value.items() if k not in ("rows", "pending_rows")}, "version": version, "count": len(value.get("rows", []))}


def light_report(report):
    return {**report, "rounds": [{**r, "checks": [{**c, "data": minute_metadata(c["data"])}
             if c.get("kind") == "minute" and c.get("data") else c for c in r.get("checks", [])]}
             for r in report.get("rounds", [])]}


class IntradayStore:
    def __init__(self, runtime):
        self.path = Path(runtime) / "intraday.sqlite"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, timeout=0.1)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.executescript("""
          CREATE TABLE IF NOT EXISTS quote_snapshots (
            source TEXT, code TEXT, source_time TEXT, content_hash TEXT, payload TEXT NOT NULL,
            first_received_at TEXT NOT NULL, last_received_at TEXT NOT NULL,
            PRIMARY KEY(source,code,source_time,content_hash));
          CREATE TABLE IF NOT EXISTS minute_candidates (
            source TEXT, code TEXT, period TEXT, label_time TEXT, adjust TEXT,
            payload TEXT NOT NULL, content_hash TEXT NOT NULL, first_received_at TEXT NOT NULL,
            last_received_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(source,code,period,label_time,adjust));
          CREATE TABLE IF NOT EXISTS minute_revisions (
            id INTEGER PRIMARY KEY, source TEXT, code TEXT, period TEXT, label_time TEXT, adjust TEXT,
            old_payload TEXT NOT NULL, old_hash TEXT NOT NULL, new_hash TEXT NOT NULL,
            received_at TEXT NOT NULL, run_id TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS verified_minute_bars (
            source TEXT, code TEXT, period TEXT, bar_end TEXT, adjust TEXT, payload TEXT NOT NULL,
            closure_verified INTEGER NOT NULL CHECK(closure_verified=1),
            PRIMARY KEY(source,code,period,bar_end,adjust));
          CREATE TABLE IF NOT EXISTS series_checks (
            run_id TEXT, source TEXT, code TEXT, version TEXT, expected_rows INTEGER,
            stored_rows INTEGER, matched INTEGER, checked_at TEXT,
            PRIMARY KEY(run_id,source,code));
          PRAGMA user_version=1;
        """)

    def close(self):
        self.connection.close()

    def quotes(self, rows, received_at, run_id):
        with self.connection:
            for row in rows:
                # Derived freshness/age change on every fetch; they are not source payload changes.
                payload = {k: v for k, v in row.items() if k not in ("fresh", "age_seconds")}
                self.connection.execute("""INSERT INTO quote_snapshots VALUES (?,?,?,?,?,?,?)
                    ON CONFLICT(source,code,source_time,content_hash) DO UPDATE SET
                    last_received_at=max(last_received_at,excluded.last_received_at)""",
                    (row["source"], row["code"], row["source_time"], digest(payload), canonical(payload), received_at, received_at))

    def minutes(self, data, received_at, run_id):
        rows = data.get("rows", [])
        if not rows:
            raise ValueError("不能保存空分钟序列")
        keys = (data["source"], data["code"], "1m", data["adjust"])
        with self.connection:
            for row in rows:
                identity = (*keys[:3], row["time"], keys[3])
                payload = canonical({**row, "closure_verified": False})
                checksum = hashlib.sha256(payload.encode()).hexdigest()
                previous = self.connection.execute("SELECT payload,content_hash,last_received_at,revision FROM minute_candidates WHERE source=? AND code=? AND period=? AND label_time=? AND adjust=?", identity).fetchone()
                if previous and received_at < previous[2]:
                    continue
                if previous and previous[1] != checksum:
                    self.connection.execute("INSERT INTO minute_revisions(source,code,period,label_time,adjust,old_payload,old_hash,new_hash,received_at,run_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                                            (*identity, previous[0], previous[1], checksum, received_at, run_id))
                self.connection.execute("""INSERT INTO minute_candidates VALUES (?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(source,code,period,label_time,adjust) DO UPDATE SET
                    payload=excluded.payload,content_hash=excluded.content_hash,last_received_at=excluded.last_received_at,
                    revision=excluded.revision""", (*identity, payload, checksum, received_at, received_at,
                     previous[3] + (previous[1] != checksum) if previous else 0))
            start, end = min(r["time"] for r in rows), max(r["time"] for r in rows)
            saved = self.connection.execute("SELECT payload FROM minute_candidates WHERE source=? AND code=? AND period=? AND adjust=? AND label_time BETWEEN ? AND ? ORDER BY label_time",
                                            (*keys, start, end)).fetchall()
            expected = sorted(({**r, "closure_verified": False} for r in rows), key=lambda r: r["time"])
            matched = [json.loads(r[0]) for r in saved] == expected
            self.connection.execute("INSERT OR REPLACE INTO series_checks VALUES (?,?,?,?,?,?,?,?)",
                                    (run_id, keys[0], keys[1], minute_metadata(data)["version"], len(rows), len(saved), int(matched), received_at))
        return {"matched": matched, "expected_rows": len(rows), "stored_rows": len(saved)}

    def summary(self):
        counts = {table: self.connection.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                  for table in ("quote_snapshots", "minute_candidates", "minute_revisions", "verified_minute_bars", "series_checks")}
        return {"mode": "shadow", "schema_version": 1, **counts}


def bootstrap(runtime):
    from market_data_refresh import atomic_json, read_json, refresh_lock
    runtime = Path(runtime).resolve()
    with refresh_lock(runtime):
        store = IntradayStore(runtime)
        try:
            for path in sorted((runtime / "quote-cache").glob("*.json")):
                value = read_json(path)
                store.quotes([value["data"]], value["received_at"], value["run_id"])
            matched = 0
            for path in sorted((runtime / "minute-cache").glob("*.json")):
                if path.name.endswith(".meta.json"):
                    continue
                value = read_json(path)
                value["data"]["version"] = minute_metadata(value["data"])["version"]
                check = store.minutes(value["data"], value["received_at"], value["run_id"])
                matched += check["matched"]
                atomic_json(path, value)
                atomic_json(path.with_name(path.stem + ".meta.json"), {**value, "data": minute_metadata(value["data"])})
            report = read_json(runtime / "status.json", {})
            atomic_json(runtime / "status-light.json", light_report(report))
            result = {"state": "ready", "matched_cached_series": matched, **store.summary()}
            atomic_json(runtime / "storage-status.json", result)
            return result
        finally:
            store.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    args = parser.parse_args()
    print(json.dumps(bootstrap(args.runtime), ensure_ascii=False))
