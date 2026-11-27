"""Bounded same-day gap queue. Backfill observations never replace live caches."""
import argparse
import json
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from intraday_storage import canonical, digest
from intraday_minute_audit import label_time, session
from market_data_refresh import ROOT, atomic_json, read_json, refresh_lock

CHINA = ZoneInfo('Asia/Shanghai')
OPEN_STATES = ('pending', 'retry_wait', 'running')


def gap_groups(data):
    stamps = sorted(label_time(row['time']) for row in data.get('rows', []))
    groups = []
    for before, after in zip(stamps, stamps[1:]):
        if before.date() != after.date() or not session(before) or session(before) != session(after):
            continue
        labels = []
        cursor = before + timedelta(minutes=1)
        while cursor < after:
            labels.append(cursor.isoformat()); cursor += timedelta(minutes=1)
        # Split long gaps rather than fetching or claiming a synthetic full session.
        groups.extend(labels[index:index + 30] for index in range(0, len(labels), 30))
    return groups


def boundary_review(labels):
    before = label_time(labels[0]) - timedelta(minutes=1)
    after = label_time(labels[-1]) + timedelta(minutes=1)
    return before.strftime('%H:%M') in ('09:30', '11:30', '13:00', '15:00') or after.strftime('%H:%M') in ('09:30', '11:30', '13:00', '15:00')


class BackfillQueue:
    def __init__(self, runtime):
        self.runtime = Path(runtime); self.runtime.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.runtime / 'backfill.sqlite', timeout=.1)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, code TEXT NOT NULL, source TEXT NOT NULL, day TEXT NOT NULL,
            adjust TEXT NOT NULL, labels TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
            next_at REAL NOT NULL DEFAULT 0, lease_until REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
            observed_at TEXT NOT NULL, message TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS observations (
            source TEXT, code TEXT, day TEXT, label TEXT, adjust TEXT, payload TEXT NOT NULL,
            received_at TEXT NOT NULL, job_id TEXT NOT NULL,
            PRIMARY KEY(source,code,day,label,adjust));
          CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY, job_id TEXT, at TEXT, request_sent INTEGER, outcome TEXT, detail TEXT);
          CREATE TABLE IF NOT EXISTS budgets (day TEXT PRIMARY KEY, requests INTEGER NOT NULL);
        ''')
        if 'paused_from' not in [row[1] for row in self.db.execute('PRAGMA table_info(jobs)')]:
            self.db.execute("ALTER TABLE jobs ADD COLUMN paused_from TEXT")

    def close(self): self.db.close()

    def sync_pool(self, codes):
        with self.db:
            for row in self.db.execute('SELECT id,code,state,paused_from FROM jobs').fetchall():
                if row['code'] not in codes and row['state'] in (*OPEN_STATES,'needs_boundary_review','needs_historical_source'):
                    self.db.execute("UPDATE jobs SET paused_from=state,state='paused_removed',lease_until=0,message='已从分钟采集池移出，历史与任务保留' WHERE id=?",(row['id'],))
                elif row['code'] in codes and row['state']=='paused_removed':
                    self.db.execute("UPDATE jobs SET state=?,paused_from=NULL,message='重新加入分钟池，等待核对任务范围' WHERE id=?",(row['paused_from'] if row['paused_from'] in OPEN_STATES else row['paused_from'] or 'pending',row['id']))

    def observe(self, data, received_at, max_pending=100):
        if data.get('source') not in ('sina.minute', 'eastmoney.minute') or data.get('adjust') != 'none':
            raise ValueError('补采仅支持已配置来源的不复权分钟样本')
        added = 0
        with self.db:
            # A later live fetch can cover a queued gap without another source request.
            jobs = self.db.execute('SELECT * FROM jobs WHERE source=? AND code=? AND adjust=? AND state IN (?,?,?)',
                (data['source'], data['code'], data['adjust'], *OPEN_STATES)).fetchall()
            for job in jobs:
                self.record_candidates(job, data, received_at)
                if not self.remaining(job):
                    self.db.execute("UPDATE jobs SET state='resolved_from_latest',lease_until=0,message=? WHERE id=?",
                                    ('后续同源采集已覆盖，样本仍待核实', job['id']))
            for labels in gap_groups(data):
                day = labels[0][:10]
                identity = digest([data['source'], data['code'], day, '1m', data['adjust'], labels])
                protected = boundary_review(labels)
                existing = self.db.execute('SELECT id FROM jobs WHERE id=?', (identity,)).fetchone()
                if existing:
                    self.db.execute('UPDATE jobs SET observed_at=? WHERE id=?', (received_at, identity))
                    if protected:
                        self.db.execute("UPDATE jobs SET state='needs_boundary_review',lease_until=0,message='紧邻时段边界，先核实来源口径，不自动请求' WHERE id=? AND state IN (?,?,?)",
                                        (identity, *OPEN_STATES))
                    continue
                count = self.db.execute('SELECT COUNT(*) FROM jobs WHERE state IN (?,?,?)', OPEN_STATES).fetchone()[0]
                if count >= max_pending: continue
                self.db.execute('INSERT INTO jobs(id,code,source,day,adjust,labels,state,created_at,observed_at,message) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (identity, data['code'], data['source'], day, data['adjust'], canonical(labels), 'needs_boundary_review' if protected else 'pending', received_at, received_at,
                     '紧邻时段边界，先核实来源口径，不自动请求' if protected else '同一时段内部疑似缺口，尚未确认漏数原因'))
                added += 1
        return added

    def record_candidates(self, job, data, received_at):
        if (data['source'], data['code'], data['adjust']) != (job['source'], job['code'], job['adjust']):
            return 0
        wanted = set(json.loads(job['labels'])); added = 0
        for row in data.get('rows', []):
            if row['time'] not in wanted or label_time(row['time']) > label_time(received_at): continue
            self.db.execute('''INSERT INTO observations VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(source,code,day,label,adjust) DO UPDATE SET payload=excluded.payload,
                received_at=excluded.received_at,job_id=excluded.job_id WHERE excluded.received_at>=observations.received_at''',
                (job['source'], job['code'], job['day'], row['time'], job['adjust'],
                 canonical({**row, 'closure_verified': False, 'strategy_eligible': False}), received_at, job['id']))
            added += 1
        return added

    def remaining(self, job):
        found = {row[0] for row in self.db.execute('SELECT label FROM observations WHERE source=? AND code=? AND day=? AND adjust=?',
                                               (job['source'], job['code'], job['day'], job['adjust']))}
        return set(json.loads(job['labels'])) - found

    def claim(self, epoch):
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            self.db.execute("UPDATE jobs SET state='retry_wait',lease_until=0,message='进程中断后重新排队' WHERE state='running' AND lease_until<=?", (epoch,))
            job = self.db.execute("SELECT * FROM jobs WHERE state IN ('pending','retry_wait') AND next_at<=? ORDER BY created_at,id LIMIT 1", (epoch,)).fetchone()
            if not job: return None
            self.db.execute("UPDATE jobs SET state='running',lease_until=? WHERE id=?", (epoch + 90, job['id']))
            return self.db.execute('SELECT * FROM jobs WHERE id=?', (job['id'],)).fetchone()

    def finish(self, job, state, at, message, sent=False):
        reserved = self.db.execute('SELECT attempts FROM jobs WHERE id=?', (job['id'],)).fetchone()[0]
        count = reserved if reserved > job['attempts'] else reserved + int(sent)
        if state == 'retry_wait' and count >= 3: state = 'needs_review'
        with self.db:
            self.db.execute('UPDATE jobs SET state=?,attempts=?,next_at=?,lease_until=0,message=? WHERE id=?',
                (state, count, at.timestamp() + (300 if state == 'retry_wait' else 60), message, job['id']))
            self.db.execute('INSERT INTO attempts(job_id,at,request_sent,outcome,detail) VALUES(?,?,?,?,?)',
                (job['id'], at.isoformat(), int(sent), state, message))

    def consume_request(self, day, limit, job_id=None):
        if limit <= 0: return False
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            used = self.db.execute('SELECT requests FROM budgets WHERE day=?', (day,)).fetchone()
            if used and used[0] >= limit: return False
            self.db.execute('INSERT INTO budgets VALUES(?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1', (day,))
            if job_id: self.db.execute('UPDATE jobs SET attempts=attempts+1 WHERE id=?', (job_id,))
        return True

    def summary(self, day):
        counts = {row['state']: row['n'] for row in self.db.execute('SELECT state,COUNT(*) n FROM jobs GROUP BY state')}
        jobs = []
        for row in self.db.execute('SELECT * FROM jobs ORDER BY observed_at DESC,id LIMIT 20'):
            item = dict(row); labels = json.loads(item.pop('labels'))
            item.update(first_label=labels[0], last_label=labels[-1], candidate_labels=len(labels), remaining_labels=len(self.remaining(row)))
            jobs.append(item)
        used = self.db.execute('SELECT requests FROM budgets WHERE day=?', (day,)).fetchone()
        return {'schema': 'intraday-backfill.v1', 'counts': counts, 'tasks': jobs,
                'queue_at_capacity': sum(counts.get(state, 0) for state in OPEN_STATES) >= 100,
                'candidate_rows': self.db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],
                'requests_today': used[0] if used else 0, 'verified_bars': 0,
                'note': '补采候选独立保存，不覆盖最新缓存；闭合和缺口语义仍待核实。'}


def publish(queue, settings, at, **details):
    result = {**queue.summary(at.date().isoformat()), 'enabled': bool(settings.get('enabled', True)),
              'max_requests_per_day': min(20, max(0, int(settings.get('max_requests_per_day', 20)))),
              'updated_at': at.isoformat(), **details}
    atomic_json(queue.runtime / 'backfill-status.json', result)
    return result


def enqueue_cache(runtime, config):
    with refresh_lock(Path(runtime)):
        queue = BackfillQueue(runtime)
        try:
            queue.sync_pool(config.get('minute_codes',config['codes']))
            for code in config.get('minute_audit_codes', config['codes'][:3]):
                saved = read_json(Path(runtime) / 'minute-cache' / (code + '.json'), {})
                if saved.get('data'): queue.observe(saved['data'], saved['received_at'])
            return publish(queue, config.get('backfill', {}), datetime.now(CHINA), worker_state='idle')
        finally: queue.close()


def work_one(runtime, config, now=None, session_factory=requests.Session, calendar_dates=None):
    from intraday_probe import market_context, parse_minutes, parse_sina_minutes, symbol
    settings = config.get('backfill', {}); current = now or datetime.now(CHINA)
    dates = calendar_dates if calendar_dates is not None else read_json(ROOT / 'outputs/live-market-data/calendar.json', {}).get('dates', [])
    with refresh_lock(Path(runtime)):
        queue = BackfillQueue(runtime)
        try:
            queue.sync_pool(config.get('minute_codes',config['codes']))
            if not settings.get('enabled', True) or market_context(current, dates) in ('trading', 'calendar_unknown'):
                return publish(queue, settings, current, worker_state='yielded_to_live')
            job = queue.claim(current.timestamp())
            if not job: return publish(queue, settings, current, worker_state='idle')
            if job['code'] not in config.get('minute_codes',config['codes']):
                queue.finish(job, 'needs_review', current, '股票已不在当前池，等待复核')
                return publish(queue, settings, current, worker_state='idle')
            if job['day'] != current.date().isoformat():
                queue.finish(job, 'needs_historical_source', current, '当前适配器不按历史日期查询，需历史分钟来源')
                return publish(queue, settings, current, worker_state='idle')
            if boundary_review(json.loads(job['labels'])):
                queue.finish(job, 'needs_boundary_review', current, '紧邻时段边界，不自动请求')
                return publish(queue, settings, current, worker_state='idle')
            cached = read_json(Path(runtime) / 'minute-cache' / (job['code'] + '.json'), {})
            if cached.get('data'):
                with queue.db: queue.record_candidates(job, cached['data'], cached['received_at'])
                if not queue.remaining(job):
                    queue.finish(job, 'resolved_from_latest', current, '本地后续采集已覆盖，未额外请求')
                    return publish(queue, settings, current, worker_state='idle')
            source = job['source'].split('.')[0]; provider_key = source + '.minute'
            health_path = Path(runtime) / 'provider-health.json'; health = read_json(health_path, {})
            provider = health.get(provider_key, {})
            if provider.get('blocked_until', 0) > current.timestamp():
                queue.finish(job, 'retry_wait', current, '共享来源冷却中，未请求')
                return publish(queue, settings, current, worker_state='idle')
            if job['attempts'] >= 3:
                queue.finish(job, 'needs_review', current, '已占用3次尝试（含中断），停止自动重试')
                return publish(queue, settings, current, worker_state='idle')
            limit = min(20, max(0, int(settings.get('max_requests_per_day', 20))))
            if not queue.consume_request(current.date().isoformat(), limit, job['id']):
                queue.finish(job, 'budget_wait', current, '今日补采请求额度已用完，下一交易日需重核数据范围')
                return publish(queue, settings, current, worker_state='idle')
            delay = max(0, .6 - (time.time() - provider.get('last_request_at', 0)))
            if delay: time.sleep(min(delay, .6))
            sent_at = time.time(); response = None
            try:
                with session_factory() as client:
                    if source == 'sina':
                        response = client.get('https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData',
                            params={'symbol': symbol(job['code']), 'scale': '1', 'ma': 'no', 'datalen': '300'}, timeout=(2, 3))
                    else:
                        response = client.get('https://push2his.eastmoney.com/api/qt/stock/trends2/get',
                            params={'secid': ('1.' if job['code'].startswith('6') else '0.') + job['code'], 'ndays': '1', 'iscr': '0',
                                    'fields1': 'f1,f2,f3', 'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58'}, timeout=(2, 3))
                    received = now or datetime.now(CHINA); response.raise_for_status()
                    data = parse_sina_minutes(response.text, job['code'], received) if source == 'sina' else parse_minutes(response.json().get('data'), job['code'], received)
                with queue.db:
                    related = queue.db.execute('SELECT * FROM jobs WHERE source=? AND code=? AND day=? AND adjust=? AND state IN (?,?,?)',
                        (job['source'], job['code'], job['day'], job['adjust'], *OPEN_STATES)).fetchall()
                    for item in related:
                        queue.record_candidates(item, data, received.isoformat())
                        if item['id'] != job['id'] and not queue.remaining(item):
                            queue.db.execute("UPDATE jobs SET state='collected_unverified',lease_until=0,message='同一次同源补采响应已覆盖，候选待核实' WHERE id=?", (item['id'],))
                complete = not queue.remaining(job)
                queue.finish(job, 'collected_unverified' if complete else 'retry_wait', received,
                             '已取得全部候选，闭合仍未核实' if complete else '本次返回仍缺目标标签，等待有限重试', sent=True)
                health[provider_key] = {'failures': 0, 'blocked_until': 0, 'last_request_at': sent_at}
            except Exception as error:
                # Keep bad content scoped to the job; source transport/limit failures share cooldown.
                network = isinstance(error, requests.RequestException) and not isinstance(error, requests.exceptions.JSONDecodeError)
                failures = provider.get('failures', 0) + 1
                limited = response is not None and response.status_code in (403, 429)
                cooldown = 300
                if response is not None:
                    try: cooldown = max(cooldown, float(response.headers.get('Retry-After', 0)))
                    except ValueError:
                        from email.utils import parsedate_to_datetime
                        try: cooldown = max(cooldown, parsedate_to_datetime(response.headers['Retry-After']).timestamp() - current.timestamp())
                        except (ValueError, TypeError, KeyError): pass
                if network or limited:
                    health[provider_key] = {'failures': failures, 'blocked_until': current.timestamp() + cooldown if failures >= 3 or limited else 0,
                                            'last_request_at': sent_at, 'failure_kind': 'rate_limit' if limited else 'network'}
                else: health[provider_key] = {'failures': 0, 'blocked_until': 0, 'last_request_at': sent_at}
                queue.finish(job, 'retry_wait', now or datetime.now(CHINA), type(error).__name__, sent=True)
            atomic_json(health_path, health)
            return publish(queue, settings, now or datetime.now(CHINA), worker_state='idle')
        finally: queue.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['enqueue-cache', 'work-one'])
    parser.add_argument('--runtime', required=True); parser.add_argument('--config', required=True)
    args = parser.parse_args()
    from stock_library import apply_stock_library
    config = apply_stock_library(read_json(args.config),'intraday',ROOT)
    try:
        result = enqueue_cache(args.runtime, config) if args.action == 'enqueue-cache' else work_one(args.runtime, config)
    except RuntimeError as error:
        if '已有行情更新任务' not in str(error): raise
        result = {'worker_state': 'yielded_to_live', 'message': '最新采集持有运行锁，补采让路'}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__': main()
