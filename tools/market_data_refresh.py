"""Refresh a declared daily universe; publish only complete, checked snapshots.

Live quotes and closed daily bars deliberately remain separate products.
QFQ history is replaced per symbol so adjustments from different as-of dates
are never appended into a single price series. No market rows are imputed.
"""
from __future__ import annotations

import argparse
import io
import hashlib
import json
import os
import subprocess
import sys
import time
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from market_data_sources import SourceManager

ROOT = Path(__file__).resolve().parents[1]
CHINA = ZoneInfo("Asia/Shanghai")
FIELDS = ["date", "code", "name", "open", "close", "high", "low", "volume", "amount", "amplitude", "change_pct", "change_amount", "turnover", "security", "source", "adjust"]


def read_json(path, fallback=None):
    return json.loads(Path(path).read_text(encoding="utf-8-sig")) if Path(path).exists() else fallback


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
        # Windows readers/antivirus can briefly hold a destination without delete
        # sharing. Keep the old complete JSON until replacement actually succeeds.
        for attempt in range(7):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 6:
                    raise
                time.sleep(min(.025 * 2 ** attempt, .2))
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def refresh_lock(runtime):
    runtime.mkdir(parents=True, exist_ok=True)
    with (runtime / "refresh.lock").open("a+b") as handle:
        handle.seek(0, 2)
        if not handle.tell():
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                raise RuntimeError("已有行情更新任务正在运行") from error
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)


def load_calendar(runtime, now):
    path = runtime / "calendar.json"
    cached = read_json(path, {})
    if cached.get("fetched_on") == now.date().isoformat():
        return cached["dates"]
    import akshare as ak
    frame = ak.tool_trade_date_hist_sina()
    dates = sorted({str(value)[:10] for value in frame["trade_date"]})
    if not dates or dates[-1] < now.date().isoformat():
        raise ValueError("交易日历未覆盖当前日期，不能猜测最近交易日")
    atomic_json(path, {"source": "akshare.tool_trade_date_hist_sina", "fetched_on": now.date().isoformat(), "dates": dates})
    return dates


def expected_trade_date(dates, now, completed_bar_after):
    local = now.astimezone(CHINA)
    today = local.date().isoformat()
    eligible = [day for day in dates if day < today or day == today and local.strftime("%H:%M") >= completed_bar_after]
    if not eligible or max(dates) < today:
        raise ValueError("交易日历不足以确认最近完整交易日")
    return max(eligible)


def fetch_source(source, code, name, start, end, timeout, session):
    headers = {"User-Agent": "Mozilla/5.0 M-quant daily research"}
    if source == "eastmoney":
        secid = ("1" if code.startswith("6") else "0") + "." + code
        response = session.get("https://push2his.eastmoney.com/api/qt/stock/kline/get", params={"secid": secid, "fields1": "f1,f2,f3,f4,f5,f6", "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61", "klt": "101", "fqt": "1", "beg": start.replace("-", ""), "end": end.replace("-", "")}, headers=headers, timeout=(5, timeout))
        response.raise_for_status()
        rows = (response.json().get("data") or {}).get("klines") or []
        frame = pd.DataFrame([row.split(",") for row in rows], columns=["date", "open", "close", "high", "low", "volume", "amount", "amplitude", "change_pct", "change_amount", "turnover"])
    elif source == "tencent":
        symbol = ("sh" if code.startswith("6") else "sz") + code
        response = session.get("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get", params={"param": f"{symbol},day,{start},{end},2000,qfq"}, headers=headers, timeout=(5, timeout))
        response.raise_for_status()
        stock = (response.json().get("data") or {}).get(symbol, {})
        rows = stock.get("qfqday") or stock.get("day") or []
        frame = pd.DataFrame([row[:6] for row in rows], columns=["date", "open", "close", "high", "low", "volume"])
    elif source == "sina":
        completed = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--sina-code', code, '--start', start, '--end', end], capture_output=True, text=True, encoding='utf-8', timeout=max(20, timeout * 3), env=dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONDONTWRITEBYTECODE='1'))
        if completed.returncode:
            raise ValueError(completed.stderr[-800:])
        frame = normalize_sina(pd.read_json(io.StringIO(completed.stdout)))
        frame['date'] = pd.to_datetime(frame['date']).dt.strftime('%Y-%m-%d')
    else:
        raise ValueError("Unsupported source: " + source)
    if frame.empty or str(frame["date"].max())[:10] != end:
        raise ValueError("数据源未返回目标交易日，不能把旧数据标记为更新成功")
    frame["code"], frame["name"] = code, name
    frame["security"] = code + (".XSHG" if code.startswith("6") else ".XSHE")
    frame["source"], frame["adjust"] = source + ".daily.qfq", "qfq"
    for field in FIELDS:
        if field not in frame:
            frame[field] = pd.NA
    return frame[FIELDS]


def fetch_daily(code, name, start, end, timeout, retries):
    # Compatibility entry point; normal runs reuse one manager across all symbols.
    with SourceManager({}, fetch_source) as manager:
        return manager.fetch(code, name, start, end, timeout, retries)


def normalize_sina(frame):
    frame = frame.copy()
    # Sina reports shares and a turnover fraction; the legacy factor adapter
    # consumes hands (100 shares) and percent. Never infer a missing amount.
    frame['volume'] = pd.to_numeric(frame['volume'], errors='raise') / 100.0
    if 'turnover' in frame:
        frame['turnover'] = pd.to_numeric(frame['turnover'], errors='coerce') * 100.0
    return frame


def validate_history(frame, code, start, end, calendar, minimum):
    frame = frame.copy()
    required = {"date", "code", "open", "close", "high", "low", "volume", "adjust"}
    if not required.issubset(frame.columns):
        raise ValueError("行情字段不完整")
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.strftime("%Y-%m-%d")
    if (frame["date"] > end).any():
        raise ValueError("数据源返回了目标日期之后的行情")
    frame = frame[(frame["date"] >= start) & (frame["date"] <= end)].copy()
    if frame.empty or frame["date"].max() != end:
        raise ValueError("目标交易日缺失")
    if frame["date"].duplicated().any() or not set(frame["date"]).issubset(set(calendar)):
        raise ValueError("交易日期重复或不在交易日历中")
    if set(frame["code"].astype(str).str.zfill(6)) != {code} or set(frame["adjust"]) != {"qfq"}:
        raise ValueError("股票代码或复权口径不一致")
    for field in ("open", "close", "high", "low", "volume"):
        frame[field] = pd.to_numeric(frame[field], errors="raise")
    prices = frame[["open", "close", "high", "low"]]
    if not np.isfinite(prices.to_numpy()).all() or (prices <= 0).any().any() or not np.isfinite(frame["volume"].to_numpy()).all() or (frame["volume"] < 0).any():
        raise ValueError("价格或成交量无效")
    if (frame["high"] + 1e-8 < prices.max(axis=1)).any() or (frame["low"] - 1e-8 > prices.min(axis=1)).any():
        raise ValueError("OHLC 高低价关系无效")
    if len(frame) < minimum:
        raise ValueError(f"有效历史不足 {minimum} 日")
    for field in ("amount", "amplitude", "change_pct", "change_amount", "turnover"):
        if field in frame:
            frame[field] = pd.to_numeric(frame[field], errors="coerce")
    return frame.sort_values("date").reset_index(drop=True)


class DailyUpdater:
    def __init__(self, config, runtime, fetcher=None, calendar_loader=load_calendar, signal_builder=None):
        self.config, self.runtime, self.fetcher, self.calendar_loader = config, Path(runtime).resolve(), fetcher, calendar_loader
        self.signal_builder = signal_builder or self.build_signals
        self.metrics_lock = threading.Lock()
        self.manager = None

    def add_time(self, name, started):
        with self.metrics_lock:
            self.metrics["timings"][name] = self.metrics["timings"].get(name, 0) + time.monotonic() - started

    def validate(self, frame, code, target, calendar):
        started = time.monotonic()
        try:
            return validate_history(frame, code, self.config["start_date"], target, calendar, self.config["min_history_days"])
        finally:
            self.add_time("validation_worker_seconds", started)

    def save(self, state):
        state["updated_at"] = datetime.now(CHINA).isoformat()
        with self.metrics_lock:
            state["metrics"] = {**self.metrics, "timings": {key: round(value, 3) for key, value in self.metrics["timings"].items()}}
            state["metrics"]["elapsed_seconds"] = round(time.monotonic() - self.started, 3)
            state["stock_details"] = list(self.stock_details.values())
        state["metrics"]["sources"] = self.manager.summary() if self.manager else {}
        atomic_json(self.runtime / "status.json", state)

    def symbol(self, row, target, calendar):
        code, name = str(row.code).zfill(6), str(row.name)
        started = time.monotonic()
        path = self.runtime / "cache" / (code + ".csv")
        try:
            meta = read_json(path.with_suffix(".json"), {})
        except ValueError:
            meta = {}
        start = self.config["start_date"]
        frame = None
        cached = False
        if not self.config.get("force_network") and path.exists() and meta.get("as_of") == target and meta.get("start") == start:
            try:
                frame = self.validate(pd.read_csv(path, dtype={"code": str}), code, target, calendar)
                cached = True
            except (ValueError, KeyError, OSError):
                frame = None
        if frame is None:
            fetcher = self.fetcher or self.manager.fetch
            frame = fetcher(code, name, start, target, self.config["request_timeout"], self.config["retries"])
            if self.fetcher:
                frame = self.validate(frame, code, target, calendar)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".csv.tmp")
            frame.to_csv(temporary, index=False, encoding="utf-8-sig")
            os.replace(temporary, path)
            atomic_json(path.with_suffix(".json"), {"as_of": target, "start": start, "adjust": "qfq", "source": str(frame["source"].iloc[-1])})
        with self.metrics_lock:
            self.metrics["cache_hits" if cached else "downloaded_stocks"] += 1
            self.stock_details[code] = {"code": code, "name": name, "state": "ready", "cached": cached,
                                        "source": str(frame["source"].iloc[-1]), "data_date": str(frame["date"].iloc[-1]),
                                        "rows": len(frame), "seconds": round(time.monotonic() - started, 3)}
        return frame

    def build_signals(self, snapshot, target, directory):
        result_path = directory / "observation-signals.json"
        script = ROOT / "outputs/sources/akshare/scripts/generate_akshare_paper_watch_signal.py"
        completed = subprocess.run([sys.executable, str(script), "--input", str(snapshot), "--expected-date", target, "--result", str(result_path), "--doc", str(directory / "observation-signals.md"), "--record-only"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=180, env=dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1"))
        if completed.returncode:
            raise RuntimeError((completed.stderr or completed.stdout)[-1500:])
        return result_path

    def run(self, now=None, auto_key="manual", automatic=False):
        now = now or datetime.now(CHINA)
        with refresh_lock(self.runtime):
            self.started = time.monotonic()
            workers = min(max(int(self.config["max_workers"]), 1), 4)
            self.metrics = {"workers": workers, "cache_hits": 0, "downloaded_stocks": 0, "timings": {}}
            self.stock_details = {}
            previous = read_json(self.runtime / "status.json", {})
            if automatic and previous.get("auto_key") == auto_key:
                if previous.get("state") == "ready":
                    return {"state": "skipped", "message": "当前时段已有完整更新", "exit_code": 0}
                timestamp = previous.get("updated_at") or previous.get("started_at")
                elapsed = now.timestamp() - datetime.fromisoformat(timestamp).timestamp() if timestamp else float("inf")
                if previous.get("auto_attempts", 0) >= self.config.get("max_auto_attempts_per_slot", 3):
                    return {"state": "skipped", "message": "本时段自动尝试次数已达上限", "exit_code": 0}
                if elapsed < self.config.get("retry_interval_minutes", 30) * 60:
                    return {"state": "skipped", "message": "等待自动重试间隔", "exit_code": 0}
            run_id = now.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
            state = {"schema_version": "daily-refresh.v1", "state": "running", "pid": os.getpid(), "run_id": run_id, "profile": self.config["profile"], "label": self.config["label"], "schedule_time": self.config["schedule_time"], "auto_key": auto_key, "auto_attempts": previous.get("auto_attempts", 0) + 1 if previous.get("auto_key") == auto_key else 1, "started_at": now.isoformat(), "last_success": previous.get("last_success"), "coverage": {"total": 0, "completed": 0, "fresh": 0, "failed": 0}, "failures": []}
            state.update(pool_version=self.config.get('pool_version'),pool_id=self.config.get('pool_id'))
            self.save(state)
            try:
                phase = time.monotonic()
                calendar = self.calendar_loader(self.runtime, now)
                target = expected_trade_date(calendar, now, self.config["completed_bar_after"])
                self.add_time("calendar_seconds", phase)
                state["expected_date"] = target
                if not self.fetcher:
                    self.manager = SourceManager(self.config, fetch_source, self.runtime, run_id,
                                                 validator=lambda frame, code: self.validate(frame, code, target, calendar))
                pool_path = ROOT / self.config["symbols_file"]
                pool = (pd.DataFrame(self.config['managed_symbols']) if 'managed_symbols' in self.config else pd.read_csv(pool_path, dtype={"code": str})).drop_duplicates("code").sort_values("code")
                if pool.empty or not {"code", "name"}.issubset(pool.columns) or not pool["code"].str.fullmatch(r"(?:0|3|6)\d{5}").all():
                    raise ValueError("股票池为空、字段不全或包含不支持的证券代码")
                pool_hash = hashlib.sha256("\n".join(pool["code"]).encode()).hexdigest()
                state["coverage"]["total"] = len(pool)
                self.save(state)
                frames = []
                existing, backfill = [], []
                priorities = set(self.config.get("priority_codes", []))
                for row in pool.itertuples():
                    (existing if (self.runtime / "cache" / (str(row.code).zfill(6) + ".csv")).exists() else backfill).append(row)
                existing.sort(key=lambda row: str(row.code).zfill(6) not in priorities)
                state["queues"] = {"existing": len(existing), "backfill": len(backfill)}
                phase = time.monotonic()
                # New history is a separate, bounded queue after existing holdings/candidates.
                for queue_name, rows, concurrency in [("existing", existing, workers), ("backfill", backfill, min(workers, max(1, int(self.config.get("backfill_workers", 1)))))]:
                    if not rows:
                        continue
                    state["active_queue"] = queue_name
                    self.save(state)
                    with ThreadPoolExecutor(max_workers=concurrency) as executor:
                        tasks = {executor.submit(self.symbol, row, target, calendar): str(row.code).zfill(6) for row in rows}
                        for task in as_completed(tasks):
                            state["coverage"]["completed"] += 1
                            try:
                                frames.append(task.result())
                                state["coverage"]["fresh"] += 1
                            except Exception as error:
                                state["coverage"]["failed"] += 1
                                state["failures"].append({"code": tasks[task], "reason": str(error)[:1200]})
                                with self.metrics_lock:
                                    self.stock_details[tasks[task]] = {"code": tasks[task], "state": "failed", "reason": str(error)[:1200]}
                            self.save(state)
                self.add_time("acquisition_seconds", phase)
                if state["failures"]:
                    raise ValueError(f"{len(state['failures'])} 只股票未通过新鲜度或质量检查；未发布新快照和信号")
                directory = self.runtime / "snapshots" / run_id
                directory.mkdir(parents=True, exist_ok=True)
                snapshot = directory / "daily-qfq.csv"
                phase = time.monotonic()
                combined = pd.concat(frames, ignore_index=True).sort_values(["code", "date"])
                combined.to_csv(snapshot, index=False, encoding="utf-8-sig")
                self.add_time("snapshot_seconds", phase)
                sources = combined.groupby("code")["source"].last().value_counts().to_dict()
                success = {"run_id": run_id, "data_date": target, "snapshot": str(snapshot), "rows": len(combined), "stocks": len(pool), "pool_hash": pool_hash, "pool_version":self.config.get('pool_version'),"pool_id":self.config.get('pool_id'),"source_counts": {str(key): int(value) for key, value in sources.items()}, "adjust": "qfq", "volume_unit": "hands", "signals": None}
                try:
                    phase = time.monotonic()
                    result_path = self.signal_builder(snapshot, target, directory)
                    signal = read_json(result_path)
                    if signal.get("signal_date") != target:
                        raise ValueError("观察信号日期与新行情不一致")
                    success["signals"] = str(result_path)
                    success["signal_routes"] = int(signal.get("route_count", 0))
                    state["state"] = "ready"
                except Exception as error:
                    state["state"] = "attention"
                    state["signal_error"] = str(error)[:1500]
                finally:
                    self.add_time("signals_seconds", phase)
                state["last_success"] = success
                state["message"] = "行情及观察信号已更新；观察信号仅记录，不改变策略准入" if state["state"] == "ready" else "行情已更新，观察信号生成失败"
            except Exception as error:
                state["state"], state["message"] = "failed", str(error)[:1500]
            finally:
                if self.manager:
                    self.manager.close()
            state["active_queue"] = None
            state["finished_at"] = datetime.now(CHINA).isoformat()
            self.save(state)
            atomic_json(self.runtime / "runs" / (run_id + ".json"), state)
            return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(ROOT / "platform/quant-factor-platform/config/market-data.json"))
    parser.add_argument("--runtime", default=str(ROOT / "outputs/live-market-data"))
    parser.add_argument("--auto-key", default="manual")
    parser.add_argument("--automatic", action="store_true")
    parser.add_argument("--force-network", action="store_true", help="Manual verification only: bypass daily cache, preserve full validation")
    parser.add_argument("--sina-code")
    parser.add_argument("--start")
    parser.add_argument("--end")
    args = parser.parse_args()
    if args.sina_code:
        import akshare as ak
        code = str(args.sina_code)
        if len(code) != 6 or not code.isdigit():
            raise ValueError('Invalid stock code')
        frame = ak.stock_zh_a_daily(symbol=('sh' if code.startswith('6') else 'sz') + code, start_date=args.start.replace('-', ''), end_date=args.end.replace('-', ''), adjust='qfq')
        print(frame.to_json(orient='records', date_format='iso'))
        return 0
    from stock_library import apply_stock_library
    config = apply_stock_library(read_json(args.config),'daily',ROOT)
    if args.force_network:
        if args.automatic:
            parser.error("--force-network cannot be combined with --automatic")
        config["force_network"] = True
    if args.automatic and not config.get("enabled", True):
        print(json.dumps({"state": "skipped", "message": "自动更新已暂停"}, ensure_ascii=False))
        return 0
    try:
        state = DailyUpdater(config, args.runtime).run(auto_key=args.auto_key, automatic=args.automatic)
    except (RuntimeError, OSError) as error:
        if "已有行情更新任务" not in str(error):
            raise
        print(json.dumps({"state": "skipped", "message": "已有更新任务持有锁"}, ensure_ascii=False))
        return 0
    print(json.dumps({"state": state["state"], "expected_date": state.get("expected_date"), "coverage": state.get("coverage"), "message": state["message"]}, ensure_ascii=False))
    return 0 if state["state"] in ("ready", "skipped") else 1


if __name__ == "__main__":
    raise SystemExit(main())
