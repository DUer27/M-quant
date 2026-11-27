import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_storage import IntradayStore, bootstrap, minute_metadata, light_report
from intraday_probe import collect


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.runtime = Path(self.directory.name)
        self.store = IntradayStore(self.runtime)

    def tearDown(self):
        self.store.close(); self.directory.cleanup()

    def data(self):
        return {'source': 'fixture.minute', 'code': '000001', 'adjust': 'none', 'source_time': '2026-11-24T10:01:00+08:00',
                'count': 2, 'age_seconds': 10, 'closure_verified': False,
                'rows': [{'time': f'2026-11-24T10:0{i}:00+08:00', 'open': 10, 'close': 10, 'high': 11, 'low': 9,
                          'volume_shares': 100, 'amount_yuan': 1000, 'closure_verified': False} for i in range(2)]}

    def test_replay_and_reverse_order_are_idempotent_and_never_create_verified_bars(self):
        data = self.data()
        self.assertTrue(self.store.minutes(data, '2026-11-24T10:02:00+08:00', 'a')['matched'])
        data['rows'].reverse()
        self.assertTrue(self.store.minutes(data, '2026-11-24T10:03:00+08:00', 'b')['matched'])
        counts = self.store.summary()
        self.assertEqual(counts['minute_candidates'], 2); self.assertEqual(counts['minute_revisions'], 0)
        self.assertEqual(counts['verified_minute_bars'], 0)
        self.assertEqual(self.store.connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_corrections_keep_previous_payload_and_old_receipts_cannot_regress(self):
        data = self.data(); self.store.minutes(data, '2026-11-24T10:02:00+08:00', 'a')
        data['rows'][0]['close'] = 10.5
        self.store.minutes(data, '2026-11-24T10:03:00+08:00', 'b')
        self.assertEqual(self.store.summary()['minute_revisions'], 1)
        self.assertIn('"close":10', self.store.connection.execute('SELECT old_payload FROM minute_revisions').fetchone()[0])
        data['rows'][0]['close'] = 9.5
        self.assertFalse(self.store.minutes(data, '2026-11-24T10:01:00+08:00', 'c')['matched'])
        self.assertEqual(self.store.summary()['minute_revisions'], 1)

    def test_failed_transaction_rolls_back_whole_series(self):
        data = self.data(); data['rows'][1]['close'] = float('nan')
        with self.assertRaises(ValueError): self.store.minutes(data, 'received', 'bad')
        self.assertEqual(self.store.summary()['minute_candidates'], 0)

    def test_quote_age_is_not_a_new_snapshot_and_sources_are_isolated(self):
        row = {'source': 'fixture.quote', 'code': '000001', 'source_time': 'time', 'last': 10, 'fresh': True, 'age_seconds': 1}
        self.store.quotes([row], 'received1', 'a')
        row.update(age_seconds=20, fresh=False); self.store.quotes([row], 'received2', 'b')
        self.assertEqual(self.store.summary()['quote_snapshots'], 1)
        row['source'] = 'other.quote'; self.store.quotes([row], 'received3', 'c')
        self.assertEqual(self.store.summary()['quote_snapshots'], 2)

    def test_version_changes_only_for_series_content_and_light_report_has_no_rows(self):
        data = self.data(); version = minute_metadata(data)['version']; data['age_seconds'] = 100
        self.assertEqual(minute_metadata(data)['version'], version)
        report = light_report({'rounds': [{'checks': [{'kind': 'minute', 'data': data}]}]})
        self.assertNotIn('rows', report['rounds'][0]['checks'][0]['data'])
        data['rows'][0]['volume_shares'] = 101
        self.assertNotEqual(minute_metadata(data)['version'], version)

    def test_bootstrap_existing_cache_is_repeatable(self):
        (self.runtime / 'minute-cache').mkdir()
        data = self.data()
        (self.runtime / 'minute-cache/000001.json').write_text(json.dumps({'data': data, 'received_at': 'time', 'run_id': 'run'}), encoding='utf-8')
        (self.runtime / 'status.json').write_text(json.dumps({'rounds': [{'checks': [{'kind': 'minute', 'data': data}]}]}), encoding='utf-8')
        first = bootstrap(self.runtime); second = bootstrap(self.runtime)
        self.assertEqual(first['minute_candidates'], second['minute_candidates'])
        self.assertEqual(second['minute_revisions'], 0)
        self.assertEqual(second['matched_cached_series'], 1)
        self.assertIn('version', json.loads((self.runtime / 'minute-cache/000001.json').read_text())['data'])

    def test_database_error_degrades_shadow_storage_without_breaking_report(self):
        class Session:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def get(self,*args,**kwargs): raise ConnectionError('fixture')
        with patch('intraday_probe.IntradayStore', side_effect=sqlite3.OperationalError('fixture locked')), patch('intraday_probe.time.sleep'):
            report = collect({'codes': ['000001']}, self.runtime, session_factory=Session)
        self.assertEqual(report['storage']['state'], 'degraded')
        self.assertEqual(report['state'], 'failed')
        self.assertTrue((self.runtime / 'status-light.json').exists())

    def test_database_write_failure_does_not_discard_successful_market_samples(self):
        class Session:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs):
                return SimpleNamespace(status_code=200, content=b'{}', json=lambda: {}, raise_for_status=lambda: None)
        quote = {'source': 'fixture.quote', 'code': '000001', 'source_time': self.data()['source_time'], 'last': 10}
        with patch('intraday_probe.parse_quote_batch', return_value={'data': [quote], 'validation_failures': []}), \
             patch('intraday_probe.parse_minutes', return_value=self.data()), \
             patch('intraday_probe.IntradayStore.minutes', side_effect=sqlite3.OperationalError('fixture locked')):
            report = collect({'codes': ['000001']}, self.runtime, session_factory=Session)
        self.assertEqual(report['storage']['state'], 'degraded')
        self.assertEqual(report['state'], 'sample_available')
        self.assertEqual(report['coverage'], {'quotes': 1, 'minutes': 1, 'total': 1})
        self.assertTrue((self.runtime / 'minute-cache/000001.json').exists())
        self.assertTrue(all(check['ok'] for check in report['rounds'][0]['checks']))


if __name__ == '__main__': unittest.main()
