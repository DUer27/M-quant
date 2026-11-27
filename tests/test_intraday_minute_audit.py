"""Synthetic minute-label fixtures, never published as real market observations."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_minute_audit import audit_series, observe_minute
from intraday_probe import collect, parse_minutes, CHINA
from datetime import datetime


class MinuteAuditTests(unittest.TestCase):
    def data(self, labels=('09:31', '09:32'), day='2026-11-25'):
        rows = [{'time': f'{day}T{clock}:00+08:00', 'open': 10, 'close': 10, 'high': 11, 'low': 9,
                 'volume_shares': 100, 'amount_yuan': 1000, 'closure_verified': False} for clock in labels]
        return {'code': '000001', 'source': 'sina.minute', 'adjust': 'none', 'rows': rows,
                'source_time': max(row['time'] for row in rows), 'closure_verified': False}

    def test_internal_gap_only_excludes_lunch_day_and_unknown_boundaries(self):
        data = self.data(('09:31', '09:34', '11:30', '13:00', '13:01'))
        audit = audit_series(data, '2026-11-25T15:01:00+08:00', 'a')
        self.assertEqual(audit['gap_range_count'], 2)
        self.assertEqual(audit['gap_examples'][0]['candidate_labels'], 2)
        self.assertEqual(audit['possible_missing_labels'], 117)
        noon = audit_series(self.data(('11:30', '13:00')), '2026-11-25T15:01:00+08:00', 'a')
        self.assertEqual(noon['possible_missing_labels'], 0)
        self.assertEqual(len(noon['observed_boundary_labels']), 2)
        one = audit_series(self.data(('13:30',)), '2026-11-25T15:01:00+08:00', 'a')
        self.assertEqual(one['possible_missing_labels'], 0)

    def test_elapsed_time_or_stable_rows_never_promotes_closed_bars(self):
        data = self.data()
        previous = {'data': data, 'received_at': '2026-11-25T09:32:10+08:00'}
        audit = audit_series(data, '2026-11-25T15:10:00+08:00', 'b', previous)
        self.assertFalse(audit['strategy_eligible'])
        self.assertEqual(audit['verified_count'], 0)
        self.assertEqual(audit['closure_state'], 'unverified')
        self.assertEqual(audit['changed_labels'], 0)
        current = audit_series(data, '2026-11-25T09:32:20+08:00', 'a')
        self.assertEqual(current['possible_forming_count'], 1)

    def test_same_source_changes_are_recorded_but_cross_source_and_day_not_compared(self):
        old = self.data(); changed = copy.deepcopy(old); changed['rows'][0]['close'] = 10.5
        previous = {'data': old, 'received_at': '2026-11-25T09:32:10+08:00'}
        audit = audit_series(changed, '2026-11-25T09:33:00+08:00', 'b', previous)
        self.assertEqual(audit['changed_labels'], 1)
        self.assertEqual(audit['change_examples'][0]['before'], {'close': 10})
        self.assertEqual(audit['change_examples'][0]['after'], {'close': 10.5})
        changed['source'] = 'eastmoney.minute'
        self.assertEqual(audit_series(changed, '2026-11-25T09:33:00+08:00', 'c', previous)['comparison_state'], 'source_or_basis_changed')
        next_day = audit_series(self.data(day='2026-11-26'), '2026-11-26T09:33:00+08:00', 'd', previous)
        self.assertEqual(next_day['comparison_state'], 'new_day')
        self.assertEqual(next_day['changed_labels'], 0)

    def test_duplicate_rejection_and_reorder_are_explicit(self):
        data = self.data(('09:32', '09:31'))
        self.assertTrue(audit_series(data, '2026-11-25T10:00:00+08:00', 'a')['input_reordered'])
        with self.assertRaises(ValueError):
            audit_series(self.data(('09:31', '09:31')), '2026-11-25T10:00:00+08:00', 'a')
        raw = ['2026-11-25 09:32,10,10,11,9,1,1000,10', '2026-11-25 09:31,10,10,11,9,1,1000,10']
        parsed = parse_minutes({'code': '000001', 'trends': raw}, '000001', datetime(2026, 11, 25, 10, tzinfo=CHINA))
        self.assertTrue(parsed['input_quality']['reordered'])
        self.assertEqual(parsed['rows'][0]['time'][11:16], '09:31')

    def test_replay_is_idempotent_old_receipts_and_regression_preserve_newer_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            data = self.data()
            first = observe_minute(directory, data, '2026-11-25T09:33:00+08:00', 'a')
            self.assertEqual(first, observe_minute(directory, data, '2026-11-25T09:33:00+08:00', 'a'))
            changed = copy.deepcopy(data); changed['rows'][0]['close'] = 10.5
            second = observe_minute(directory, changed, '2026-11-25T09:34:00+08:00', 'b')
            self.assertEqual(second['changed_labels'], 1)
            self.assertEqual(second, observe_minute(directory, changed, '2026-11-25T09:34:00+08:00', 'b'))
            ignored = observe_minute(directory, data, '2026-11-25T09:32:00+08:00', 'old')
            self.assertEqual(ignored['comparison_state'], 'older_receipt_ignored')
            regressed = observe_minute(directory, self.data(('09:31',)), '2026-11-25T09:35:00+08:00', 'c')
            self.assertTrue(regressed['latest_label_regressed'])
            baseline = json.loads((Path(directory) / 'minute-audit-baselines/000001-sina.minute.json').read_text(encoding='utf-8'))
            self.assertEqual(baseline['run_id'], 'b')
            self.assertEqual(baseline['data']['rows'][0]['close'], 10.5)

    def test_disappeared_overlap_is_not_confused_with_response_window_truncation(self):
        previous = {'data': self.data(('09:31', '09:32', '09:33', '09:34')), 'received_at': '2026-11-25T09:35:00+08:00'}
        audit = audit_series(self.data(('09:32', '09:34')), '2026-11-25T09:36:00+08:00', 'b', previous)
        self.assertEqual(audit['disappeared_in_overlap'], 1)
        self.assertEqual(audit['possible_missing_labels'], 1)

    def test_history_is_bounded_and_a_later_receipt_of_old_day_cannot_replace_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            for index in range(32):
                result = observe_minute(directory, self.data(), f'2026-11-25T10:{index:02}:00+08:00', str(index))
            self.assertEqual(result['observation_count'], 32)
            self.assertEqual(len(result['history']), 30)
            self.assertEqual(result['history'][0]['run_id'], '2')
            old_day = observe_minute(directory, self.data(day='2026-11-24'), '2026-11-25T11:00:00+08:00', 'old-day')
            self.assertTrue(old_day['latest_label_regressed'])
            baseline = json.loads((Path(directory) / 'minute-audit-baselines/000001-sina.minute.json').read_text(encoding='utf-8'))
            self.assertEqual(baseline['run_id'], '31')

    def test_switching_sources_keeps_baselines_separate_and_is_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            sina = self.data()
            observe_minute(directory, sina, '2026-11-25T10:00:00+08:00', 'sina-first')
            eastmoney = copy.deepcopy(sina); eastmoney['source'] = 'eastmoney.minute'
            eastmoney['rows'][0]['close'] = 10.5
            switched = observe_minute(directory, eastmoney, '2026-11-25T10:01:00+08:00', 'eastmoney-first')
            self.assertEqual(switched['source_switched_from'], 'sina.minute')
            self.assertEqual(switched['comparison_state'], 'source_or_basis_changed')
            self.assertEqual(switched['changed_labels'], 0)
            late = observe_minute(directory, sina, '2026-11-25T10:00:30+08:00', 'late-old-source')
            self.assertEqual(late['comparison_state'], 'older_receipt_ignored')
            latest = json.loads((Path(directory) / 'minute-audit/000001.json').read_text(encoding='utf-8'))
            self.assertEqual(latest['run_id'], 'eastmoney-first')
            back = observe_minute(directory, sina, '2026-11-25T10:02:00+08:00', 'sina-second')
            self.assertEqual(back['comparison_state'], 'compared')
            self.assertEqual(back['source_switched_from'], 'eastmoney.minute')
            self.assertEqual(back['changed_labels'], 0)
            self.assertEqual(back['compared_labels'], 2)

    def test_audit_failure_keeps_successful_market_samples_and_existing_request_budget(self):
        class Session:
            calls = 0
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs):
                self.calls += 1
                return SimpleNamespace(status_code=200, content=b'{}', json=lambda: {}, raise_for_status=lambda: None)
        quote = {'source': 'fixture.quote', 'code': '000001', 'source_time': self.data()['source_time'], 'last': 10}
        client = Session()
        with tempfile.TemporaryDirectory() as directory, \
             patch('intraday_probe.parse_quote_batch', return_value={'data': [quote], 'validation_failures': []}), \
             patch('intraday_probe.parse_minutes', return_value=self.data()), \
             patch('intraday_probe.observe_minute', side_effect=OSError('fixture disk unavailable')):
            report = collect({'codes': ['000001']}, directory, session_factory=lambda: client)
            self.assertEqual(report['coverage'], {'quotes': 1, 'minutes': 1, 'total': 1})
            self.assertEqual(report['minute_audit']['state'], 'degraded')
            self.assertTrue((Path(directory) / 'minute-cache/000001.json').exists())
            self.assertEqual(client.calls, 3)
            self.assertTrue(all(check['ok'] for check in report['rounds'][0]['checks']))


if __name__ == '__main__':
    unittest.main()
