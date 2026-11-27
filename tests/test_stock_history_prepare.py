"""Synthetic data stays isolated in temporary directories."""
import sys
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from market_data_refresh import CHINA, atomic_json, read_json, refresh_lock
from stock_history_prepare import cache_stamp, prepare, quiet_time
from market_data_sources import SourceManager


class HistoryPreparationTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Path(tempfile.mkdtemp(prefix='mquant-history-test-'))
        self.calendar = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25']
        self.now = datetime(2026, 11, 24, 16, tzinfo=CHINA)
        self.calls = []
        self.config = dict(pool_id='fixture', pool_version=2, managed_symbols=[dict(code='600519', name='fixture')],
                           start_date='2026-11-18', min_history_days=3, completed_bar_after='16:30',
                           request_timeout=1, retries=0)

    def frame(self, code, end):
        return pd.DataFrame([dict(date=day, code=code, name='fixture', open=10, close=10, high=11, low=9,
                                  volume=100, adjust='qfq', source='fixture.daily.qfq') for day in self.calendar if day <= end])

    def fetch(self, code, name, start, end, timeout, retries):
        self.calls.append(code)
        return self.frame(code, end)

    def run_prepare(self, **kwargs):
        return prepare(self.config, self.runtime, self.now, fetcher=kwargs.pop('fetcher', self.fetch),
                       calendar_loader=lambda runtime, now: self.calendar, allowed=kwargs.pop('allowed', lambda: True), **kwargs)

    def cache(self, code='600519', date='2026-11-20'):
        directory = self.runtime / 'cache'
        directory.mkdir(exist_ok=True)
        self.frame(code, date).to_csv(directory / f'{code}.csv', index=False)
        atomic_json(directory / f'{code}.json', dict(as_of=date, start='2026-11-18', adjust='qfq', source='fixture.daily.qfq'))

    def test_missing_history_downloads_without_changing_daily_publication(self):
        atomic_json(self.runtime / 'status.json', dict(run_id='original', last_success={'signals': 'original-signal'}))
        before = (self.runtime / 'status.json').read_bytes()
        state = self.run_prepare()
        self.assertEqual(state['state'], 'checked')
        self.assertEqual(self.calls, ['600519'])
        self.assertEqual(state['stocks'][0]['rows'], 4)
        self.assertEqual((self.runtime / 'status.json').read_bytes(), before)
        self.assertFalse((self.runtime / 'snapshots').exists())
        self.assertEqual(state['stocks'][0]['cache_stamp'], cache_stamp(self.runtime, '600519'))

    def test_valid_old_history_reuses_cache_and_does_not_claim_freshness(self):
        self.cache()
        before = (self.runtime / 'cache/600519.csv').read_bytes()
        result = self.run_prepare()
        self.assertEqual(result['expected_date'], '2026-11-23')
        self.assertEqual(result['stocks'][0]['as_of'], '2026-11-20')
        self.assertEqual(result['state'], 'checked')
        self.assertEqual(self.calls, [])
        self.assertEqual((self.runtime / 'cache/600519.csv').read_bytes(), before)

    def test_network_batch_is_bounded_and_next_batch_finishes_remaining(self):
        self.config['managed_symbols'] = [dict(code=f'60000{i}', name='fixture') for i in range(5)]
        result = self.run_prepare(batch_limit=100)
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(result['coverage'], dict(total=5, checked=3, failed=0, queued=2))
        result = self.run_prepare()
        self.assertEqual(len(self.calls), 5)
        self.assertEqual(result['coverage']['checked'], 5)

    def test_source_failure_preserves_invalid_original_cache_and_shows_reason(self):
        self.cache()
        path = self.runtime / 'cache/600519.csv'
        path.write_text('broken fixture cache', encoding='utf-8')
        before = path.read_bytes()
        def unavailable(*args):
            raise RuntimeError('fixture unavailable')
        result = self.run_prepare(fetcher=unavailable)
        self.assertEqual(result['coverage']['failed'], 1)
        self.assertIn('fixture unavailable', result['stocks'][0]['reason'])
        self.assertEqual(path.read_bytes(), before)

    def test_yield_before_network_keeps_missing_stocks_queued(self):
        result = self.run_prepare(allowed=lambda: False)
        self.assertEqual(self.calls, [])
        self.assertEqual(result['coverage']['queued'], 1)

    def test_changed_requirements_force_revalidation_without_old_success(self):
        self.cache()
        self.run_prepare()
        self.config['min_history_days'] = 99
        result = self.run_prepare()
        self.assertEqual(result['coverage']['checked'], 0)
        self.assertEqual(result['coverage']['failed'], 1)

    def test_future_cache_cannot_be_trusted(self):
        self.cache(date='2026-11-25')
        result = self.run_prepare()
        self.assertEqual(self.calls, ['600519'])
        self.assertEqual(result['stocks'][0]['as_of'], '2026-11-23')

    def test_truncated_history_over_minimum_does_not_pass_start_coverage(self):
        self.cache()
        path = self.runtime / 'cache/600519.csv'
        self.frame('600519', '2026-11-23').iloc[1:].to_csv(path, index=False)
        atomic_json(path.with_suffix('.json'), dict(as_of='2026-11-23', start='2026-11-18', adjust='qfq', source='fixture.daily.qfq'))
        def truncated(*args):
            return self.frame('600519', '2026-11-23').iloc[1:]
        result = self.run_prepare(fetcher=truncated)
        self.assertEqual(result['coverage']['checked'], 0)
        self.assertIn('配置起点', result['stocks'][0]['reason'])

    def test_internal_missing_sessions_are_reported_without_inventing_rows(self):
        self.cache(date='2026-11-23')
        path = self.runtime / 'cache/600519.csv'
        self.frame('600519', '2026-11-23').drop(index=1).to_csv(path, index=False)
        result = self.run_prepare()
        self.assertEqual(result['stocks'][0]['missing_sessions'], 1)
        self.assertEqual(result['stocks'][0]['rows'], 3)
        self.assertEqual(self.calls, [])

    def test_truncated_source_falls_back_before_writing_cache(self):
        def source(source_name, code, name, start, end, timeout, session):
            if source_name == 'eastmoney':
                raise RuntimeError('fixture offline')
            frame = self.frame(code, end)
            frame['source'] = source_name + '.daily.qfq'
            return frame.iloc[1:] if source_name == 'tencent' else frame
        with patch('stock_history_prepare.fetch_source', side_effect=source), patch.object(SourceManager, 'order', return_value=['eastmoney', 'tencent', 'sina']):
            result = prepare(self.config, self.runtime, self.now, calendar_loader=lambda runtime, now: self.calendar, allowed=lambda: True)
        self.assertEqual(result['coverage']['checked'], 1)
        self.assertEqual(result['sources']['tencent']['failures'], 1)
        self.assertEqual(result['stocks'][0]['source'], 'sina.daily.qfq')
        self.assertEqual(result['stocks'][0]['first_date'], '2026-11-18')

    def test_shared_daily_lock_prevents_competing_cache_writer(self):
        with refresh_lock(self.runtime):
            with self.assertRaises((RuntimeError, OSError)):
                self.run_prepare()
        self.assertEqual(self.calls, [])

    def test_calendar_failure_does_not_retain_previous_success_receipts(self):
        self.run_prepare()
        def failed_calendar(*args):
            raise ValueError('fixture calendar unavailable')
        result = prepare(self.config, self.runtime, self.now, fetcher=self.fetch, calendar_loader=failed_calendar)
        self.assertEqual(result['state'], 'failed')
        self.assertEqual(result['coverage']['checked'], 0)

    def test_quiet_time_excludes_whole_trading_day_including_lunch(self):
        for hour in (9, 10, 12, 14, 15):
            self.assertFalse(quiet_time(datetime(2026, 11, 24, hour, 30 if hour != 15 else 0, tzinfo=CHINA), self.calendar))
        self.assertTrue(quiet_time(self.now, self.calendar))
        self.assertFalse(quiet_time(self.now, []))


if __name__ == '__main__':
    unittest.main()
