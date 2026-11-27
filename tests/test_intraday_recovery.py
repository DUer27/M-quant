"""Minute-boundary and failure-scope regression fixtures; no real feeds requested."""
import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_probe import parse_sina_minutes, parse_minutes, collect, CHINA
from intraday_storage import IntradayStore, minute_metadata


class RecoveryTests(unittest.TestCase):
    now = datetime(2026, 11, 25, 13, 31, 48, tzinfo=CHINA)

    def row(self, time, **changes):
        return {'day': f'2026-11-25 {time}:00', 'open': '10', 'high': '11', 'low': '9',
                'close': '10', 'volume': '100', 'amount': '1000', **changes}

    def parse(self, rows, now=None):
        return parse_sina_minutes('=(' + json.dumps(rows) + ');', '000001', now or self.now)

    def test_only_next_sina_tail_is_quarantined_and_not_saved_as_candidate_bar(self):
        data = self.parse([self.row('13:30'), self.row('13:31'), self.row('13:32')])
        self.assertEqual(data['count'], 2); self.assertEqual(data['pending_count'], 1)
        self.assertEqual(data['source_time'][11:16], '13:31')
        self.assertEqual(data['pending_rows'][0]['state'], 'pending_boundary')
        self.assertFalse(data['pending_rows'][0]['strategy_eligible'])
        self.assertFalse(data['closure_verified'])
        self.assertNotIn('pending_rows', minute_metadata(data))
        with tempfile.TemporaryDirectory() as directory:
            store = IntradayStore(directory)
            try:
                self.assertTrue(store.minutes(data, self.now.isoformat(), 'fixture')['matched'])
                self.assertEqual(store.summary()['minute_candidates'], 2)
                self.assertEqual(store.summary()['verified_minute_bars'], 0)
            finally: store.close()

    def test_future_limit_position_duplicates_and_ohlc_remain_strict(self):
        for rows in [
            [self.row('13:31'), self.row('13:33')],
            [self.row('13:32'), self.row('13:31')],
            [self.row('13:31'), self.row('13:32'), self.row('13:32')],
            [self.row('13:31'), self.row('13:32', high='8')],
            [self.row('13:32')],
        ]:
            with self.subTest(rows=rows), self.assertRaises(ValueError): self.parse(rows)
        with self.assertRaises(ValueError):
            parse_minutes({'code':'000001','trends':['2026-11-25 13:31,10,10,11,9,1,1000,10',
                '2026-11-25 13:32,10,10,11,9,1,1000,10']}, '000001', self.now)

    def test_boundary_can_arrive_later_without_becoming_verified_and_pending_payload_does_not_change_chart_version(self):
        rows = [self.row('13:31'), self.row('13:32')]
        first = self.parse(rows)
        changed = self.parse([rows[0], self.row('13:32', close='10.5')])
        self.assertEqual(minute_metadata(first)['version'], minute_metadata(changed)['version'])
        later = self.parse(rows, self.now.replace(minute=32))
        self.assertEqual(later['pending_count'], 0); self.assertEqual(later['count'], 2)
        self.assertFalse(later['rows'][-1]['closure_verified'])

    def session(self, bad_codes=(), rate_limit=False, network_fail=False):
        owner=self
        class Session:
            urls=[]
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def get(self,url,**kwargs):
                self.urls.append(url)
                response=requests.Response();response.status_code=200;response._content=b'{}'
                if 'eastmoney' in url:
                    if network_fail: raise requests.ConnectionError('fixture connection')
                    if rate_limit:
                        response.status_code=429;response.headers['Retry-After']='600'
                    code=kwargs['params']['secid'].split('.')[1]
                    response._content=json.dumps({'data':{'code':code,'trends':[
                        '2026-11-25 13:31,10,10,11,9,1,1000,10' if code not in bad_codes else 'invalid']}}).encode()
                elif 'quotes.sina' in url:
                    response._content=('=('+json.dumps([owner.row('13:31'),owner.row('13:32')])+');').encode()
                return response
        return Session()

    def run_collection(self, directory, session, codes, **config):
        with patch('intraday_probe.parse_quote_batch',return_value={'data':[],'validation_failures':[]}), \
             patch('intraday_probe.datetime',wraps=datetime) as clock, patch('intraday_probe.time.sleep'):
            clock.now.return_value=self.now
            return collect({'codes':codes,**config},directory,session_factory=lambda:session,automatic=True)

    def test_three_symbol_payload_errors_do_not_cool_down_healthy_fourth_symbol(self):
        codes=['000001','000002','000003','000004']
        with tempfile.TemporaryDirectory() as directory:
            session=self.session(bad_codes=codes[:3]);report=self.run_collection(directory,session,codes)
            checks=report['rounds'][0]['checks']
            bad=[c for c in checks if c.get('failure_kind')=='validation']
            self.assertEqual(len(bad),3)
            fourth=[c for c in checks if c.get('code')=='000004']
            self.assertEqual(fourth[0]['source'],'eastmoney');self.assertTrue(fourth[0]['ok'])
            self.assertEqual(report['coverage']['minutes'],4)
            health=json.loads((Path(directory)/'provider-health.json').read_text(encoding='utf-8'))
            self.assertEqual(health['eastmoney.minute']['blocked_until'],0)

    def test_rate_limit_cools_source_but_fallback_keeps_all_symbols(self):
        codes=['000001','000002','000003']
        with tempfile.TemporaryDirectory() as directory:
            session=self.session(rate_limit=True);report=self.run_collection(directory,session,codes)
            self.assertEqual(sum('eastmoney' in url for url in session.urls),1)
            self.assertEqual(report['coverage']['minutes'],3)
            health=json.loads((Path(directory)/'provider-health.json').read_text(encoding='utf-8'))
            self.assertEqual(health['eastmoney.minute']['failure_kind'],'rate_limit')
            self.assertGreater(health['eastmoney.minute']['blocked_until'],0)
            self.assertEqual(health['sina.minute']['blocked_until'],0)

    def test_preferred_healthy_source_avoids_unnecessary_secondary_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            session=self.session();report=self.run_collection(directory,session,['000001','000002'],minute_source_order=['sina','eastmoney'])
            self.assertEqual(report['coverage']['minutes'],2)
            self.assertFalse(any('eastmoney' in url for url in session.urls))

    def test_transport_circuit_allows_one_retry_after_expiry_and_reopens_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'provider-health.json'
            path.write_text(json.dumps({'eastmoney.minute':{'failures':3,'blocked_until':1,'failure_kind':'network'}}),encoding='utf-8')
            session=self.session(network_fail=True);report=self.run_collection(directory,session,['000001','000002','000003'])
            self.assertEqual(sum('eastmoney' in url for url in session.urls),1)
            self.assertEqual(report['coverage']['minutes'],3)
            self.assertTrue(any(c.get('failure_kind')=='cooldown' and not c['request_sent'] for c in report['rounds'][0]['checks']))
            health=json.loads(path.read_text(encoding='utf-8'))
            health['eastmoney.minute']['blocked_until']=1
            path.write_text(json.dumps(health),encoding='utf-8')
            healthy=self.session()
            restored=self.run_collection(directory,healthy,['000001','000002','000003'])
            self.assertEqual(restored['coverage']['minutes'],3)
            self.assertEqual(sum('eastmoney' in url for url in healthy.urls),3)
            self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['eastmoney.minute']['failures'],0)


if __name__=='__main__':unittest.main()
