"""Synthetic parser and network-failure fixtures; no fixture is published as market data."""
import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_probe import CHINA, collect, market_context, number, parse_minutes, parse_sina, parse_tencent, parse_sina_minutes, parse_quote_batch


class ParserTests(unittest.TestCase):
    now = datetime(2026, 11, 24, 10, 1, tzinfo=CHINA)

    def sina(self, date='2026-11-24', clock='10:00:45'):
        values = ['fixture', '10', '10', '10', '11', '9', '9.9', '10.1', '10000', '100000']
        values += [str(x) for i in range(5) for x in (100, 9.9 - i * 0.1)]
        values += [str(x) for i in range(5) for x in (200, 10.1 + i * 0.1)]
        values += [date, clock, '00']
        return 'var hq_str_sz000001="' + ','.join(values) + '";'

    def tencent(self):
        values = ['0'] * 40
        values[1:7] = ['fixture', '000001', '10', '10', '10', '100']
        for i in range(5):
            values[9+i*2:11+i*2] = [str(9.9-i*.1), '1']
            values[19+i*2:21+i*2] = [str(10.1+i*.1), '2']
        values[30] = '20261124100045'
        values[33:35] = ['11', '9']
        values[37] = '10'
        return 'v_sz000001="' + '~'.join(values) + '";'

    def test_quote_units_timestamps_and_five_levels(self):
        a = parse_sina(self.sina(), ['000001'], self.now)[0]
        b = parse_tencent(self.tencent(), ['000001'], self.now)[0]
        self.assertEqual(a['last'], b['last'])
        self.assertEqual(a['volume_shares'], b['volume_shares'])
        self.assertEqual(a['amount_yuan'], b['amount_yuan'])
        self.assertEqual(a['bids'], b['bids'])
        self.assertEqual(len(a['asks']), 5)
        self.assertTrue(a['fresh'])
        self.assertEqual(a['security_status'], 'unknown')

    def test_old_fast_return_is_not_fresh(self):
        a = parse_sina(self.sina(date='2026-11-23'), ['000001'], self.now)[0]
        self.assertFalse(a['fresh'])

    def test_future_time_wrong_code_missing_and_invalid_values_are_rejected(self):
        cases = [self.sina(clock='10:02:00'), self.sina().replace('sz000001', 'sz000002'),
                 self.sina().replace(',10000,', ',nan,'), 'hq_str_sz000001="";']
        for text in cases:
            with self.subTest(text=text[:40]), self.assertRaises(ValueError):
                parse_sina(text, ['000001'], self.now)
        with self.assertRaises(ValueError):
            parse_tencent(self.tencent().replace('~000001~', '~000002~'), ['000001'], self.now)

    def test_minute_units_and_closure_remain_unverified(self):
        result = parse_minutes({'code': '000001', 'trends': ['2026-11-24 10:00,10,10,11,9,2,2000,10']}, '000001', self.now)
        self.assertEqual(result['rows'][0]['volume_shares'], 200)
        self.assertFalse(result['closure_verified'])
        self.assertFalse(result['rows'][0]['closure_verified'])

    def test_minute_future_duplicates_wrong_code_and_ohlc_rejected(self):
        valid = '2026-11-24 10:00,10,10,11,9,2,2000,10'
        for values in [[valid, valid], [valid.replace('10:00', '10:03')], [valid.replace(',11,9,', ',8,9,')], [valid.replace(',2,2000', ',-2,2000')]]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                parse_minutes({'code': '000001', 'trends': values}, '000001', self.now)
        with self.assertRaises(ValueError):
            parse_minutes({'code': '000002', 'trends': [valid]}, '000001', self.now)

    def test_trading_calendar_lunch_and_after_hours(self):
        dates = ['2026-11-23', '2026-11-24', '2026-11-25']
        self.assertEqual(market_context(self.now, dates), 'trading')
        self.assertEqual(market_context(self.now.replace(hour=12), dates), 'market_closed')
        self.assertEqual(market_context(self.now.replace(hour=19), dates), 'market_closed')
        self.assertEqual(market_context(self.now, []), 'calendar_unknown')
        self.assertEqual(market_context(self.now.replace(day=22), dates), 'non_trading_day')

    def test_failed_sources_produce_a_report_instead_of_fake_data(self):
        class Session:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs): raise ConnectionError('fixture only')
        with tempfile.TemporaryDirectory() as directory, patch('intraday_probe.time.sleep'):
            report = collect({'codes': ['000001']}, directory, session_factory=Session)
            self.assertEqual(report['state'], 'failed')
            self.assertEqual(len(report['rounds'][0]['checks']), 4)
            self.assertTrue(all(not row['ok'] for row in report['rounds'][0]['checks']))
            self.assertFalse(report['automatic_enabled'])
            self.assertFalse(report['account_connected'])
            self.assertEqual(json.loads((Path(directory) / 'status.json').read_text(encoding='utf-8'))['state'], 'failed')

    def test_partial_quote_batch_keeps_valid_symbols_and_reports_missing(self):
        result = parse_quote_batch(parse_sina, self.sina(), ['000001', '000063'], self.now)
        self.assertEqual(len(result['data']), 1)
        self.assertEqual(result['validation_failures'][0]['code'], '000063')

    def test_fifty_symbols_are_supported_and_over_limit_is_rejected(self):
        class Session:
            calls = 0
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs):
                self.calls += 1
                raise ConnectionError('fixture unavailable')
        codes = [str(n).zfill(6) for n in range(1, 51)]
        with tempfile.TemporaryDirectory() as directory, patch('intraday_probe.time.sleep'):
            report = collect({'codes': codes}, directory, session_factory=Session)
            self.assertEqual(len(report['codes']), 50)
            self.assertEqual(report['coverage'], {'quotes': 0, 'minutes': 0, 'total': 50})
            self.assertEqual(report['state'], 'failed')
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                collect({'codes': codes + ['000051']}, directory, session_factory=Session)

    def test_sina_minutes_preserve_share_units_and_filter_previous_day(self):
        rows = [dict(day='2026-11-23 15:00:00', open='10', high='11', low='9', close='10', volume='500', amount='5000'),
                dict(day='2026-11-24 10:00:00', open='10', high='11', low='9', close='10', volume='12345', amount='123450')]
        result = parse_sina_minutes('/*fixture*/=(' + json.dumps(rows) + ');', '000001', self.now)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['rows'][0]['volume_shares'], 12345)
        self.assertEqual(result['source'], 'sina.minute')
        self.assertFalse(result['closure_verified'])
        with self.assertRaises(ValueError):
            parse_sina_minutes('alert("fixture")', '000001', self.now)

    def test_automatic_collection_respects_provider_cooldown_and_writes_compact_history(self):
        owner = self
        class Session:
            eastmoney_calls = 0
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, url, **kwargs):
                response = requests.Response(); response.status_code = 200
                if 'eastmoney' in url:
                    Session.eastmoney_calls += 1
                    response.status_code = 429; response.headers['Retry-After'] = '600'
                    response._content = b'fixture limit'
                elif 'hq.sinajs' in url: response._content = owner.sina().encode('gb18030')
                elif 'qt.gtimg' in url: response._content = owner.tencent().encode('gb18030')
                else:
                    row = dict(day='2026-11-24 10:00:00', open='10', high='11', low='9', close='10', volume='12345', amount='123450')
                    response._content = ('=(' + json.dumps([row]) + ');').encode()
                return response
        with tempfile.TemporaryDirectory() as directory, patch('intraday_probe.time.sleep'), patch('intraday_probe.datetime', wraps=datetime) as clock:
            clock.now.return_value = self.now
            for _ in range(2):
                report = collect({'codes': ['000001']}, directory, session_factory=Session, automatic=True)
                self.assertEqual(report['coverage'], {'quotes': 1, 'minutes': 1, 'total': 1})
                path = Path(directory)
                self.assertTrue((path / 'quote-cache/sina-000001.json').exists())
                self.assertTrue((path / 'minute-cache/000001.json').exists())
                summary = json.loads((path / 'runs' / report['run_id'] / 'report.json').read_text(encoding='utf-8'))
                self.assertNotIn('data', summary['rounds'][0]['checks'][0])
            self.assertEqual(Session.eastmoney_calls, 1)
            self.assertFalse(list(Path(directory).glob('runs/*/*.txt')))
            health = json.loads((Path(directory) / 'provider-health.json').read_text(encoding='utf-8'))
            self.assertGreater(health['eastmoney.minute']['blocked_until'], 0)

    def test_fifty_stock_batch_publishes_quotes_first_and_limits_actual_minute_requests(self):
        owner = self
        codes = [str(n).zfill(6) for n in range(1, 51)]
        class Clock:
            tick = 0.0
            def monotonic(self): return self.tick
            def sleep(self, seconds): self.tick += seconds
        clock = Clock()
        class Session:
            minute_times = []
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, url, **kwargs):
                response = requests.Response(); response.status_code = 200
                if 'hq.sinajs' in url:
                    response._content = ''.join(owner.sina().replace('sz000001', 'sz'+code) for code in codes).encode('gb18030')
                elif 'qt.gtimg' in url:
                    response._content = ''.join(owner.tencent().replace('sz000001', 'sz'+code).replace('~000001~', '~'+code+'~') for code in codes).encode('gb18030')
                else:
                    Session.minute_times.append(clock.tick)
                    status = json.loads((Path(directory) / 'status.json').read_text(encoding='utf-8'))
                    self_test.assertEqual(len(status['rounds'][0]['checks'][0]['data']), 50)
                    code = kwargs['params']['secid'].split('.')[1]
                    response._content = json.dumps({'data': {'code': code, 'trends': ['2026-11-24 10:00,10,10,11,9,2,2000,10']}}).encode()
                return response
        self_test = self
        with tempfile.TemporaryDirectory() as directory, patch('intraday_probe.time.monotonic', clock.monotonic), patch('intraday_probe.time.sleep', clock.sleep), patch('intraday_probe.datetime', wraps=datetime) as fake_now:
            fake_now.now.return_value = self.now
            report = collect({'codes': codes}, directory, session_factory=Session)
            self.assertEqual(report['coverage'], {'quotes': 50, 'minutes': 50, 'total': 50})
            self.assertEqual(report['metrics']['request_count'], 52)
            self.assertEqual(report['metrics']['quote_batch_seconds'], 0)
            self.assertTrue(all(b-a >= .6 - 1e-8 for a,b in zip(Session.minute_times, Session.minute_times[1:])))
            self.assertAlmostEqual(clock.tick, 29.4)


if __name__ == '__main__':
    unittest.main()
