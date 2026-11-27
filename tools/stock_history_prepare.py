"""Check selected daily histories and fill a bounded batch without publishing signals."""
import argparse
import hashlib
import json
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

from market_data_refresh import (CHINA, ROOT, DailyUpdater, atomic_json,
                                 expected_trade_date, fetch_source, load_calendar,
                                 read_json, refresh_lock)
from market_data_sources import SourceManager


def cache_stamp(runtime, code):
    result = {}
    for suffix in ("csv", "json"):
        path = Path(runtime) / "cache" / f"{code}.{suffix}"
        if not path.exists():
            return None
        stat = path.stat()
        result[suffix] = {"size": stat.st_size, "mtime_ms": stat.st_mtime_ns // 1_000_000}
    return result


def requirements(config):
    return {"start_date": config["start_date"], "min_history_days": config["min_history_days"], "adjust": "qfq", "rule": "history-start.v2"}


class HistoryUpdater(DailyUpdater):
    def validate(self, frame, code, target, calendar):
        frame = super().validate(frame, code, target, calendar)
        first = min(day for day in calendar if self.config['start_date'] <= day <= target)
        if frame['date'].min() != first:
            raise ValueError(f'配置起点后的历史未覆盖：应从 {first} 开始；不能把截断历史当作完整范围')
        return frame


def quiet_time(now, calendar):
    local = now.astimezone(CHINA)
    day, clock = local.date().isoformat(), local.strftime("%H:%M:%S")
    return bool(calendar and max(calendar) >= day and
                (day not in calendar or not ("09:25:00" <= clock <= "15:05:00")))


def prepare(config, runtime, now=None, fetcher=None, calendar_loader=load_calendar,
            allowed=None, batch_limit=3):
    runtime = Path(runtime).resolve()
    now = now or datetime.now(CHINA)
    directory = runtime / "history-preparation"
    path = directory / "status.json"
    with refresh_lock(runtime):  # also held by the daily scheduled/manual updater
        previous = read_json(path, {})
        records = {row['code']: row for row in previous.get('stocks', [])}
        selected = config["managed_symbols"]
        started = time.monotonic()
        run_id = now.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
        state = {"schema": "history-preparation.v1", "run_id": run_id, "state": "running", "pid": os.getpid(),
                 "pool_id": config.get("pool_id"), "pool_version": config.get("pool_version"),
                 "started_at": now.isoformat(), "requirements": requirements(config), "stocks": [],
                 "coverage": {"total": len(selected), "checked": 0, "failed": 0, "queued": 0},
                 "network_stocks": 0, "batch_limit": min(max(int(batch_limit), 1), 3), "message": "正在校验历史缓存"}
        updater = HistoryUpdater({**config, "retries": 0}, runtime, fetcher=fetcher)
        updater.started = started
        updater.metrics = {"cache_hits": 0, "downloaded_stocks": 0, "timings": {}}
        updater.stock_details = {}

        def save():
            state['stocks'] = [records[row['code']] for row in selected if row['code'] in records]
            state['coverage'] = {"total": len(selected), **{key: sum(row.get('state') == value for row in state['stocks'])
                                   for key, value in [('checked', 'checked'), ('failed', 'failed'), ('queued', 'queued')]}}
            state['updated_at'] = datetime.now(CHINA).isoformat()
            state['elapsed_seconds'] = round(time.monotonic() - started, 3)
            state['sources'] = updater.manager.summary() if updater.manager else {}
            atomic_json(path, state)

        def checked(row, frame, calendar, origin):
            code = row['code']
            cache = runtime / 'cache' / (code + '.csv')
            first, last = str(frame['date'].min()), str(frame['date'].max())
            return {"code": code, "name": row['name'], "state": "checked", "origin": origin,
                    "requirements": requirements(config), "as_of": last, "first_date": first, "rows": len(frame),
                    "source": str(frame['source'].iloc[-1]), "checked_at": datetime.now(CHINA).isoformat(),
                    "missing_sessions": len({d for d in calendar if first <= d <= last} - set(frame['date'])),
                    "sha256": hashlib.sha256(cache.read_bytes()).hexdigest(), "cache_stamp": cache_stamp(runtime, code)}

        try:
            save()
            calendar = calendar_loader(runtime, now)
            target = expected_trade_date(calendar, now, config['completed_bar_after'])
            state['expected_date'] = target
            guard = allowed or (lambda: quiet_time(datetime.now(CHINA), calendar))
            queue = []
            for row in selected:
                code = row['code']
                try:
                    meta = read_json(runtime / 'cache' / (code + '.json'), {})
                    if meta.get('start') != config['start_date'] or meta.get('adjust') != 'qfq' or not meta.get('as_of') or meta['as_of'] > target:
                        raise ValueError('缓存范围、日期或复权口径需要准备')
                    frame = updater.validate(pd.read_csv(runtime / 'cache' / (code + '.csv'), dtype={'code': str}), code, meta['as_of'], calendar)
                    if 'source' not in frame or frame['source'].isna().any() or frame['source'].nunique() != 1:
                        raise ValueError('历史来源缺失或混用')
                    if str(frame['source'].iloc[-1]) != meta.get('source'):
                        raise ValueError('历史来源与缓存元信息不一致')
                    records[code] = checked(row, frame, calendar, 'cache')
                except Exception as error:
                    records[code] = {"code": code, "name": row['name'], "state": "queued", "reason": str(error)[:500],
                                     "requirements": requirements(config)}
                    queue.append(row)
                save()
            if not fetcher:
                updater.manager = SourceManager(updater.config, fetch_source, runtime, 'prepare-' + run_id,
                                               validator=lambda frame, code: updater.validate(frame, code, target, calendar))
            for row in queue[:state['batch_limit']]:
                if not guard():
                    state['message'] = '等待休市或最新行情任务结束后继续准备'
                    break
                code = row['code']
                state['network_stocks'] += 1
                state['active_code'] = code
                state['message'] = f"正在准备 {code} {row['name']}"
                save()
                try:
                    frame = updater.symbol(SimpleNamespace(**row), target, calendar)
                    records[code] = checked(row, frame, calendar, 'download')
                except Exception as error:
                    records[code] = {**records[code], "state": "failed", "reason": str(error)[:500]}
                save()
            state['state'] = 'checked' if all(records[row['code']]['state'] == 'checked' for row in selected) else 'partial'
            state['message'] = ('所选日线历史已通过基础校验；时效与完整股票池发布仍由日线更新检查' if state['state'] == 'checked'
                                else '部分历史待准备；失败保留原因，未完成项目等待下一批')
        except Exception as error:
            state['state'], state['message'] = 'failed', str(error)[:800]
            # An interrupted/global-failure pass cannot inherit old success receipts.
            records = {row['code']: {"code": row['code'], "state": "queued", "reason": state['message']} for row in selected}
        finally:
            try:
                if updater.manager:
                    updater.manager.close()
            finally:
                state['active_code'] = None
                state['finished_at'] = datetime.now(CHINA).isoformat()
                save()
                atomic_json(directory / 'runs' / (run_id + '.json'), state)
        return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--runtime', required=True)
    args = parser.parse_args()
    config = read_json(args.config)
    if not config.get('pool_snapshot'):
        parser.error('准备任务必须使用已保存股票池的固定快照')
    try:
        state = prepare(config, args.runtime)
    except (RuntimeError, OSError) as error:
        if '已有行情更新任务' not in str(error):
            raise
        print(json.dumps({'state': 'waiting', 'message': '等待日线更新任务释放锁'}, ensure_ascii=False))
        return 75
    print(json.dumps({key: state.get(key) for key in ('state', 'coverage', 'network_stocks', 'message')}, ensure_ascii=False))
    return 0 if state['state'] in ('checked', 'partial') else 1


if __name__ == '__main__':
    sys.exit(main())
