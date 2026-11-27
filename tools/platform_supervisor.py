"""Local bounded platform supervisor. Never submits orders or changes collection inputs."""
import argparse
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return fallback


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        for attempt in range(7):
            try:
                temporary.replace(path)
                break
            except PermissionError:
                if attempt == 6:
                    raise
                time.sleep(min(.025 * 2 ** attempt, .2))
    finally:
        temporary.unlink(missing_ok=True)


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


def epoch(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.timestamp() if parsed.tzinfo is not None else None
    except (TypeError, ValueError, AttributeError, OverflowError):
        return None


def project_identity(root):
    return hashlib.sha256(str(Path(root).resolve()).replace('\\', '/').lower().encode()).hexdigest()


def collector_alerts(probe, now):
    """Restarts are limited to scheduler faults; source/coverage issues only alert."""
    collector = probe.get('collector', {})
    started = epoch(probe.get('started_at'))
    if started is None or now - started < 30:
        return []
    tick = epoch(collector.get('scheduler_last_tick_at'))
    if not collector.get('scheduled') or tick is None or now - tick > 25 or tick - now > 5:
        return [('scheduler_unresponsive', '采集调度超过25秒未响应，需恢复服务')]
    if not collector.get('automatic_enabled') or collector.get('current_context') != 'trading':
        return []
    alerts = []
    for kind, lane in collector.get('lanes', {}).items():
        if not lane.get('enabled', True):
            continue
        interval = max(15, float(lane.get('interval_seconds') or 60))
        due = epoch(lane.get('next_start_at'))
        completed = epoch(lane.get('last_completed_at')) or started
        if not lane.get('running') and now - completed > max(90, interval * 3) and (due is None or now - due > 20):
            alerts.append(('collection_gap_' + kind, ('报价' if kind == 'quote' else '分钟') + '多轮未完成，请检查调度或来源；保留原数据'))
        source = epoch(lane.get('oldest_advanced_source_time'))
        limit = 120 if kind == 'quote' else 240
        if source is not None and now - source > limit:
            alerts.append(('source_stalled_' + kind, ('报价' if kind == 'quote' else '分钟') + '来源时间较久未推进；不通过重启服务代替来源诊断'))
    return alerts


class SupervisorLease:
    def __init__(self, path):
        self.path = Path(path)
        self.file = None
        self.acquired = False

    def acquire(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.file = self.path.open('a+b')
            self.file.seek(0, 2)
            if not self.file.tell():
                self.file.write(b'0'); self.file.flush()
            self.file.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.acquired = True
            return True
        except OSError:
            if self.file:
                self.file.close(); self.file = None
            return False

    def close(self):
        if self.file:
            if os.name == 'nt' and self.acquired:
                import msvcrt
                self.file.seek(0); msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
            self.file.close(); self.file = None; self.acquired = False


class PlatformSupervisor:
    def __init__(self, deployment, runtime=None, clock=time.time, launcher=subprocess.Popen):
        self.deployment = deployment
        if not all(isinstance(deployment.get(key), str) and Path(deployment[key]).is_absolute() for key in ['repository', 'node', 'python']):
            raise ValueError('部署必须提供项目、Node与Python的绝对路径')
        self.root = Path(deployment['repository']).resolve()
        self.runtime = Path(runtime or self.root / 'outputs/live-market-data/service')
        self.runtime.mkdir(parents=True, exist_ok=True)
        if deployment.get('host', '127.0.0.1') != '127.0.0.1':
            raise ValueError('守护仅支持本机127.0.0.1，不扩大网络访问范围')
        self.port = int(deployment.get('port', 5555))
        if not 1024 <= self.port <= 65535:
            raise ValueError('本机端口无效')
        self.project_id = project_identity(self.root)
        self.clock, self.launcher = clock, launcher
        self.identity = str(uuid.uuid4())
        saved = read_json(self.runtime / 'supervisor-status.json', {})
        if not isinstance(saved, dict):
            saved = {}
        self.attempts = saved.get('attempts', []) if saved.get('project_id') == self.project_id else []
        self.attempts = [item for item in self.attempts if isinstance(item, dict) and isinstance(item.get('at'), (int, float))]
        self.child = None
        self.log_threads = []
        self.failures = 0
        self.consecutive_exits = 0
        self.next_retry = 0
        self.started_child_at = None
        self.last_server_id = None if saved.get('state') == 'stopped' else saved.get('server_instance_id')
        self.had_failure = saved.get('state') in ('retry_wait', 'restart_limited', 'checking')
        self.active_alerts = set()
        self.state = 'starting'
        self.error = ''
        self.closed = False
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def event(self, kind, message, **details):
        events = read_json(self.runtime / 'supervisor-events.json', [])
        if not isinstance(events, list):
            events = []
        events.append({'id': str(uuid.uuid4()), 'kind': kind, 'at': iso(self.clock()), 'message': message, **details})
        atomic_json(self.runtime / 'supervisor-events.json', events[-120:])

    def publish(self, state, enabled=True, **extra):
        self.state = state
        cutoff = self.clock() - 900
        self.attempts = [item for item in self.attempts if cutoff < item.get('at', 0) <= self.clock() + 5]
        value = {'schema': 'platform-supervisor.v1', 'project_id': self.project_id, 'supervisor_id': self.identity,
                 'pid': os.getpid(), 'enabled': enabled, 'state': state, 'heartbeat_at': iso(self.clock()),
                 'mode': 'owned' if self.child else 'observing_external', 'server_instance_id': self.last_server_id,
                 'owned_server_pid': self.child.pid if self.child else None, 'attempts': self.attempts,
                 'restart_count_window': sum(item.get('reason') != 'initial_start' for item in self.attempts),
                 'start_attempts_window': len(self.attempts), 'next_retry_at': iso(self.next_retry) if self.next_retry else None,
                 'last_error': self.error, **extra}
        atomic_json(self.runtime / 'supervisor-status.json', value)
        return value

    def probe(self):
        try:
            with self.opener.open(f'http://127.0.0.1:{self.port}/market-data-api/service/health', timeout=2) as response:
                payload = response.read(16385)
                if len(payload) > 16384:
                    return None
                result = json.loads(payload)
            stamp = epoch(result.get('at'))
            if (result.get('ok') is True and result.get('service') == 'quant-factor-platform'
                    and result.get('project_id') == self.project_id and isinstance(result.get('pid'), int)
                    and result.get('instance_id') and stamp is not None and abs(stamp - self.clock()) <= 10):
                return result
        except (OSError, ValueError, TypeError, urllib.error.URLError):
            pass
        return None

    def port_open(self):
        try:
            with socket.create_connection(('127.0.0.1', self.port), timeout=.4):
                return True
        except OSError:
            return False

    def stop_owned(self):
        """Popen retains the actual process handle; never stop a saved or foreign PID."""
        if self.child:
            if self.child.poll() is None:
                self.child.terminate()
                try:
                    self.child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.child.kill(); self.child.wait(timeout=5)
            self.child = None
        for thread in self.log_threads:
            thread.join(timeout=2)
        self.log_threads = []

    def capture(self, stream, name):
        handler = RotatingFileHandler(self.runtime / name, maxBytes=1_000_000, backupCount=3, encoding='utf-8')
        def drain():
            try:
                while True:
                    chunk = stream.readline(4096)
                    if not chunk:
                        break
                    handler.emit(logging.LogRecord('platform', logging.INFO, '', 0, chunk.rstrip('\n'), (), None))
            finally:
                stream.close(); handler.close()
        thread = threading.Thread(target=drain, daemon=True)
        thread.start(); self.log_threads.append(thread)

    def start_server(self):
        now = self.clock()
        self.attempts = [item for item in self.attempts if now - 900 < item.get('at', 0) <= now + 5]
        if len(self.attempts) >= 3:
            self.next_retry = min(item['at'] for item in self.attempts) + 900
            self.error = '15分钟内已尝试启动3次，暂缓自动启动；原数据保留'
            if self.state != 'restart_limited':
                self.event('restart_limited', self.error)
            return self.publish('restart_limited')
        if self.port_open():
            self.error = '本机地址已有无法核实的服务，不重复启动或结束其他进程'
            return self.publish('needs_attention')
        reason = 'recovery' if self.had_failure else 'initial_start'
        self.attempts.append({'at': now, 'reason': reason})
        self.publish('starting')  # Persist budget before spawning, even if a launch fails.
        environment = {**os.environ, 'HOST': '127.0.0.1', 'PORT': str(self.port), 'PYTHON': self.deployment['python'],
                       'M_QUANT_DATA_ROOT': str(self.root), 'M_QUANT_SUPERVISOR_ID': self.identity,
                       'PYTHONIOENCODING': 'utf-8', 'PYTHONDONTWRITEBYTECODE': '1'}
        server = self.root / 'platform/quant-factor-platform/server.mjs'
        try:
            self.child = self.launcher([self.deployment['node'], str(server)], cwd=server.parent, env=environment,
                                      stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True, encoding='utf-8', errors='replace',
                                      creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except OSError as error:
            self.stop_owned(); self.had_failure = True
            self.next_retry = now + 10
            self.error = '平台进程启动失败：' + type(error).__name__
            self.event('launch_failed', self.error)
            return self.publish('retry_wait')
        self.capture(self.child.stdout, 'server.stdout.log')
        self.capture(self.child.stderr, 'server.stderr.log')
        self.started_child_at = now
        self.next_retry = 0
        self.failures = 0
        self.error = ''
        self.event('server_starting', '正在恢复平台服务' if reason == 'recovery' else '正在启动平台服务', server_pid=self.child.pid)
        return self.publish('starting')

    def step(self):
        control_path = self.runtime / 'supervisor-control.json'
        control = read_json(control_path, None) if control_path.exists() else {'enabled': True}
        if not isinstance(control, dict) or not isinstance(control.get('enabled'), bool):
            self.error = '守护控制文件无法确认，暂停自动启动，保留正在运行的进程'
            return self.publish('needs_attention', enabled=False)
        if control.get('enabled') is not True:
            owned = bool(self.child)
            self.stop_owned(); self.event('manual_stop', '守护已按要求停止，后续不会自动拉起；未改采集开关', stopped_owned_server=owned)
            self.closed = True
            return self.publish('stopped', enabled=False)
        if self.child and self.child.poll() is not None:
            code = self.child.returncode
            self.stop_owned(); self.had_failure = True; self.consecutive_exits += 1
            self.next_retry = self.clock() + min(120, 5 * 2 ** min(self.consecutive_exits - 1, 5))
            self.error = '平台进程已退出，等待有限重试'
            self.event('server_exited', self.error, exit_code=code)
        result = self.probe()
        if result:
            alerts = collector_alerts(result, self.clock())
            fault = next((message for kind, message in alerts if kind == 'scheduler_unresponsive'), None)
            current = {kind for kind, _ in alerts}
            for kind, message in alerts:
                if kind not in self.active_alerts:
                    self.event(kind, message)
            if self.active_alerts - current:
                self.event('collection_recovered', '此前的采集调度或来源提示已解除；不等同于分钟闭合验收')
            self.active_alerts = current
            if not fault:
                if self.had_failure or self.last_server_id != result['instance_id']:
                    self.event('service_recovered' if self.had_failure else 'service_online', '平台服务已恢复' if self.had_failure else '平台服务已连接')
                self.last_server_id = result['instance_id']; self.had_failure = False
                self.failures = 0; self.error = ''; self.next_retry = 0
                return self.publish('collection_warning' if alerts else 'healthy', collector_alerts=list(current))
            self.failures += 1; self.error = fault; self.had_failure = True
        else:
            self.failures += 1
            if not self.had_failure and (self.last_server_id or self.child):
                self.event('service_unreachable', '平台连接中断，检查进程与调度；保留已有行情')
            self.had_failure = bool(self.last_server_id or self.child or self.had_failure)
            self.error = '平台健康检查未通过，不能视为正在正常采集'
        if self.clock() < self.next_retry:
            return self.publish('restart_limited' if self.state == 'restart_limited' else 'retry_wait')
        if self.child and self.started_child_at is not None and self.clock() - self.started_child_at < 30:
            return self.publish('starting')
        if self.child and self.failures >= 3:
            self.event('owned_service_restart', '连续3次健康检查失败，重启本守护启动的平台进程')
            self.stop_owned()
            return self.start_server()
        if self.child:
            return self.publish('checking')
        if self.port_open():
            if self.state != 'needs_attention':
                self.event('foreign_or_unresponsive_service', '服务地址被占用或手动服务未响应；不结束未经接管的进程')
            return self.publish('needs_attention')
        return self.start_server()

    def run(self):
        lease = SupervisorLease(self.runtime / 'supervisor.lock')
        if not lease.acquire():
            return 0
        try:
            self.event('supervisor_started', '后台守护已启动；健康检查不请求外部行情')
            while not self.closed:
                self.step()
                if not self.closed:
                    time.sleep(10)
            return 0
        finally:
            lease.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deployment', required=True)
    parser.add_argument('--action', choices=['run', 'enable', 'stop', 'status'], default='run')
    args = parser.parse_args()
    deployment = read_json(Path(args.deployment), {})
    supervisor = PlatformSupervisor(deployment)
    if args.action == 'enable':
        atomic_json(supervisor.runtime / 'supervisor-control.json', {'enabled': True, 'at': iso(time.time())})
    elif args.action == 'stop':
        atomic_json(supervisor.runtime / 'supervisor-control.json', {'enabled': False, 'at': iso(time.time())})
    elif args.action == 'status':
        if sys.stdout:
            print(json.dumps(read_json(supervisor.runtime / 'supervisor-status.json', {}), ensure_ascii=False))
    else:
        return supervisor.run()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
