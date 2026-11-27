"""Supervisor fixtures use isolated HTTP servers; never stop the user's platform."""
import copy
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from platform_supervisor import PlatformSupervisor, SupervisorLease, atomic_json, collector_alerts, iso, project_identity


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='platform-supervisor-'))
        self.now = time.time()
        self.deployment = {'repository': str(self.root), 'node': sys.executable, 'python': sys.executable, 'port': 15555}
        self.supervisor = PlatformSupervisor(self.deployment, clock=lambda: self.now)
        self.supervisor.port_open = lambda: False
        self.supervisor.probe = lambda: None

    def tearDown(self):
        self.supervisor.stop_owned()

    def health(self):
        return {'ok': True, 'instance_id': 'fixture', 'pid': os.getpid(), 'project_id': project_identity(self.root),
                'started_at': iso(self.now - 300), 'at': iso(self.now),
                'collector': {'scheduled': True, 'scheduler_last_tick_at': iso(self.now), 'automatic_enabled': True,
                              'current_context': 'trading', 'lanes': {'quote': {'enabled': True, 'running': False,
                              'interval_seconds': 15, 'last_completed_at': iso(self.now - 2), 'next_start_at': iso(self.now + 10)}}}}

    def test_foreign_listener_is_never_terminated_or_duplicated(self):
        self.supervisor.port_open = lambda: True
        launch = self.supervisor.launcher = Mock()
        for _ in range(5):
            result = self.supervisor.step()
        self.assertEqual(result['state'], 'needs_attention'); launch.assert_not_called()
        events = json.loads((self.supervisor.runtime / 'supervisor-events.json').read_text(encoding='utf-8'))
        self.assertEqual(len(events), 1)

    def test_healthy_manual_service_is_observed_without_restarting(self):
        self.supervisor.probe = self.health
        self.supervisor.launcher = Mock()
        result = self.supervisor.step()
        self.assertEqual(result['state'], 'healthy'); self.assertEqual(result['mode'], 'observing_external')
        self.supervisor.launcher.assert_not_called()

    def test_manual_stop_survives_a_new_supervisor_and_does_not_touch_foreign_process(self):
        atomic_json(self.supervisor.runtime / 'supervisor-control.json', {'enabled': False})
        self.supervisor.launcher = Mock()
        result = self.supervisor.step()
        restarted = PlatformSupervisor(self.deployment)
        result2 = restarted.step()
        self.assertEqual(result['state'], 'stopped'); self.assertEqual(result2['state'], 'stopped')
        self.supervisor.launcher.assert_not_called()

    def test_restart_budget_is_persisted_and_recovers_after_window(self):
        self.supervisor.attempts = [{'at': self.now - 30 * i, 'reason': 'recovery'} for i in range(3)]
        self.supervisor.had_failure = True
        result = self.supervisor.start_server()
        self.assertEqual(result['state'], 'restart_limited'); self.assertGreater(self.supervisor.next_retry, self.now)
        fresh = PlatformSupervisor(self.deployment, clock=lambda: self.now)
        self.assertEqual(len(fresh.attempts), 3)
        self.now += 901
        self.supervisor.launcher = Mock(side_effect=OSError('isolated launch failure'))
        self.assertEqual(self.supervisor.start_server()['state'], 'retry_wait')
        self.assertEqual(len(self.supervisor.attempts), 1)

    def test_source_failure_stagnation_and_delayed_collection_alert_without_service_restart(self):
        data = self.health(); lane = data['collector']['lanes']['quote']
        lane['oldest_advanced_source_time'] = iso(self.now - 150)
        lane['last_completed_at'] = iso(self.now - 200); lane['next_start_at'] = iso(self.now - 50)
        self.supervisor.probe = lambda: data; self.supervisor.launcher = Mock()
        result = self.supervisor.step()
        self.assertEqual(result['state'], 'collection_warning')
        self.assertIn('source_stalled_quote', result['collector_alerts'])
        self.assertIn('collection_gap_quote', result['collector_alerts']); self.supervisor.launcher.assert_not_called()

    def test_start_limit_event_is_saved_when_retry_wait_reaches_the_budget(self):
        self.supervisor.attempts = [{'at': self.now - i, 'reason': 'recovery'} for i in range(3)]
        self.supervisor.next_retry = self.now + 5
        self.assertEqual(self.supervisor.step()['state'], 'retry_wait')
        self.now += 6
        self.assertEqual(self.supervisor.step()['state'], 'restart_limited')
        events = json.loads((self.supervisor.runtime / 'supervisor-events.json').read_text(encoding='utf-8'))
        self.assertIn('restart_limited', [e['kind'] for e in events])

    def test_manual_restart_is_not_reported_as_an_automatic_failure_recovery(self):
        atomic_json(self.supervisor.runtime / 'supervisor-status.json', {'project_id': self.supervisor.project_id,
                    'state': 'stopped', 'server_instance_id': 'old-stopped-instance',
                    'attempts': [{'at': self.now - 5, 'reason': 'initial_start'}]})
        restarted = PlatformSupervisor(self.deployment, clock=lambda: self.now, launcher=Mock(side_effect=OSError('fixture')))
        restarted.port_open = lambda: False; restarted.probe = lambda: None
        result = restarted.step()
        self.assertEqual(result['state'], 'retry_wait'); self.assertEqual(result['restart_count_window'], 0)
        self.assertEqual(result['start_attempts_window'], 2)

    def test_pause_lunch_and_planned_cooldown_are_not_missing_cycles(self):
        data = self.health(); lane = data['collector']['lanes']['quote']; lane['last_completed_at'] = iso(self.now - 600)
        lane['next_start_at'] = iso(self.now + 300)
        self.assertEqual(collector_alerts(data, self.now), [])
        lane['next_start_at'] = None; data['collector']['automatic_enabled'] = False
        self.assertEqual(collector_alerts(data, self.now), [])
        data['collector']['automatic_enabled'] = True; data['collector']['current_context'] = 'market_closed'
        self.assertEqual(collector_alerts(data, self.now), [])

    def test_dead_scheduler_only_restarts_a_child_started_by_this_supervisor(self):
        data = self.health(); data['collector']['scheduler_last_tick_at'] = iso(self.now - 40)
        self.supervisor.probe = lambda: data; self.supervisor.port_open = lambda: True
        for _ in range(3):
            result = self.supervisor.step()
        self.assertEqual(result['state'], 'needs_attention')
        child = Mock(pid=123); child.poll.return_value = None
        self.supervisor.child = child; self.supervisor.started_child_at = self.now - 40
        with patch.object(self.supervisor, 'start_server', return_value={'state': 'fixture_restart'}) as start:
            self.assertEqual(self.supervisor.step()['state'], 'fixture_restart'); start.assert_called_once()
        child.terminate.assert_called_once()

    def test_corrupt_stop_control_blocks_relaunch_and_preserves_market_files(self):
        sentinel = self.root / 'minute-cache.json'; sentinel.write_text('unchanged', encoding='utf-8')
        (self.supervisor.runtime / 'supervisor-control.json').write_text('invalid JSON', encoding='utf-8')
        result = self.supervisor.step()
        self.assertEqual(result['state'], 'needs_attention'); self.assertFalse(result['enabled'])
        self.assertEqual(sentinel.read_text(encoding='utf-8'), 'unchanged')

    def test_lease_prevents_duplicate_daemons_and_releases_after_close(self):
        first = SupervisorLease(self.root / 'lock'); second = SupervisorLease(self.root / 'lock')
        try:
            self.assertTrue(first.acquire()); self.assertFalse(second.acquire()); first.close(); self.assertTrue(second.acquire())
        finally:
            first.close(); second.close()

    def test_events_are_bounded_and_health_probe_rejects_another_project(self):
        for i in range(125):
            self.supervisor.event('fixture', str(i))
        events = json.loads((self.supervisor.runtime / 'supervisor-events.json').read_text(encoding='utf-8'))
        self.assertEqual(len(events), 120)
        payload = {**self.health(), 'service': 'quant-factor-platform', 'project_id': 'another-project'}
        response = Mock(); response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps(payload).encode()
        with patch.object(self.supervisor.opener, 'open', return_value=response):
            self.assertIsNone(PlatformSupervisor.probe(self.supervisor))

    def test_network_exposure_and_relative_runtime_paths_are_rejected(self):
        with self.assertRaises(ValueError): PlatformSupervisor({**self.deployment, 'host': '0.0.0.0'})
        with self.assertRaises(ValueError): PlatformSupervisor({**self.deployment, 'node': 'node'})


class SupervisorProcessTests(unittest.TestCase):
    def test_actual_child_exit_restart_and_manual_stop_are_isolated(self):
        root = Path(tempfile.mkdtemp(prefix='supervisor-child-'))
        server = root / 'platform/quant-factor-platform/server.mjs'; server.parent.mkdir(parents=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        server.write_text('''import os,json,hashlib,uuid
from pathlib import Path
from datetime import datetime,timezone
from http.server import HTTPServer,BaseHTTPRequestHandler
identity=str(uuid.uuid4());project=hashlib.sha256(str(Path(os.environ['M_QUANT_DATA_ROOT']).resolve()).replace('\\\\','/').lower().encode()).hexdigest()
started=datetime.now(timezone.utc).isoformat()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  stamp=datetime.now(timezone.utc).isoformat()
  value={'ok':True,'service':'quant-factor-platform','project_id':project,'instance_id':identity,'pid':os.getpid(),'started_at':started,'at':stamp,'collector':{'scheduled':True,'scheduler_last_tick_at':stamp,'automatic_enabled':False,'current_context':'market_closed'}}
  body=json.dumps(value).encode();self.send_response(200);self.end_headers();self.wfile.write(body)
print('X'*2200000,flush=True)
HTTPServer(('127.0.0.1',int(os.environ['PORT'])),Handler).serve_forever()
''', encoding='utf-8')
        supervisor = PlatformSupervisor({'repository': str(root), 'node': sys.executable, 'python': sys.executable, 'port': port})
        def ready():
            until = time.monotonic() + 6
            while time.monotonic() < until:
                result = supervisor.probe()
                if result: return result
                time.sleep(.05)
            self.fail('Isolated fixture HTTP server did not become ready')
        try:
            self.assertEqual(supervisor.step()['state'], 'starting')
            first = ready(); self.assertEqual(supervisor.step()['state'], 'healthy')
            child = supervisor.child; child.terminate(); child.wait(timeout=5)
            self.assertEqual(supervisor.step()['state'], 'retry_wait')
            supervisor.next_retry = 0
            self.assertEqual(supervisor.step()['state'], 'starting')
            second = ready(); self.assertNotEqual(first['instance_id'], second['instance_id'])
            self.assertEqual(supervisor.step()['state'], 'healthy')
            atomic_json(supervisor.runtime / 'supervisor-control.json', {'enabled': False})
            self.assertEqual(supervisor.step()['state'], 'stopped'); self.assertIsNone(supervisor.child)
            logs = list(supervisor.runtime.glob('server.stdout.log*'))
            self.assertGreaterEqual(len(logs), 2); self.assertLessEqual(len(logs), 4)
            self.assertTrue(all(path.stat().st_size <= 1_020_000 for path in logs))
            events = json.loads((supervisor.runtime / 'supervisor-events.json').read_text(encoding='utf-8'))
            self.assertIn('server_exited', [e['kind'] for e in events]); self.assertIn('service_recovered', [e['kind'] for e in events])
        finally:
            supervisor.stop_owned()


if __name__ == '__main__': unittest.main()
