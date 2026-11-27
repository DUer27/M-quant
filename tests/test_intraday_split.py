"""Concurrent synthetic collectors use isolated temporary runtimes."""
import json
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from intraday_probe import collect, CHINA
import test_intraday_probe as parser_fixtures


class FixedClock(datetime):
    @classmethod
    def now(cls,tz=None): return cls(2026,11,25,10,1,tzinfo=CHINA)


class SplitCollectorTests(unittest.TestCase):
    def setUp(self):
        self.runtime=Path(tempfile.mkdtemp(prefix='intraday-split-test-'))
        self.config={'codes':['000001'],'minute_codes':['000001'],'minute_audit_codes':['000001'],'minute_source_order':['sina','eastmoney'],'pool_version':2}
        self.requests=[];self.first_quote_published=False

    def factory(self,runtime,gate=None,entered=None):
        owner=self
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,url,**kwargs):
                owner.requests.append(url)
                if 'hq.sinajs' in url:text=parser_fixtures.ParserTests().sina(date='2026-11-25')
                elif 'qt.gtimg' in url:
                    snapshot=json.loads((runtime/'status.json').read_text(encoding='utf-8'))
                    owner.first_quote_published=bool(snapshot['rounds'][0]['checks'][0]['ok'])
                    text=parser_fixtures.ParserTests().tencent().replace('20261124','20261125')
                else:
                    if entered:entered.set()
                    if gate and not gate.wait(5):raise RuntimeError('fixture gate expired')
                    text='=('+json.dumps([{'day':'2026-11-25 10:00:00','open':'10','high':'11','low':'9','close':'10','volume':'100','amount':'1000'}])+');'
                class Response:
                    status_code=200
                    content=text.encode('gb18030')
                    def raise_for_status(self):pass
                    def json(self):return json.loads(self.text)
                response=Response();response.text=text;return response
        return Session

    def test_quote_only_publishes_first_source_without_waiting_for_second_and_never_requests_minutes(self):
        with patch('intraday_probe.datetime',FixedClock):
            report=collect(self.config,self.runtime,session_factory=self.factory(self.runtime),lane='quote')
        self.assertEqual(len(self.requests),2);self.assertTrue(self.first_quote_published)
        self.assertEqual(report['lane'],'quote');self.assertEqual(report['coverage']['quotes'],1)
        self.assertEqual(report['coverage']['minutes'],0)
        self.assertFalse((self.runtime/'minute-cache').exists());self.assertFalse((self.runtime/'backfill.sqlite').exists())

    def test_minute_only_never_requests_quotes_and_can_succeed_without_any_quote(self):
        with patch('intraday_probe.datetime',FixedClock):
            report=collect(self.config,self.runtime,session_factory=self.factory(self.runtime),lane='minute')
        self.assertEqual(len(self.requests),1);self.assertNotIn('hq.sinajs',self.requests[0]);self.assertNotIn('qt.gtimg',self.requests[0])
        self.assertEqual(report['state'],'sample_available');self.assertEqual(report['coverage']['minutes'],1)
        self.assertEqual(report['coverage']['quotes'],0);self.assertFalse((self.runtime/'quote-cache').exists())
        self.assertFalse(report['rounds'][0]['checks'][0]['data']['closure_verified'])

    def test_blocked_minute_worker_does_not_block_quote_lock_cache_or_database(self):
        entered,release=threading.Event(),threading.Event();quotes=self.runtime/'quote-lane'
        with patch('intraday_probe.datetime',FixedClock),ThreadPoolExecutor(max_workers=2) as pool:
            pending=pool.submit(collect,self.config,self.runtime,session_factory=self.factory(self.runtime,release,entered),lane='minute')
            self.assertTrue(entered.wait(2))
            try:
                fast=pool.submit(collect,self.config,quotes,session_factory=self.factory(quotes),lane='quote').result(timeout=3)
                self.assertEqual(fast['coverage']['quotes'],1);self.assertFalse(pending.done())
                self.assertTrue((quotes/'intraday.sqlite').exists());self.assertTrue((self.runtime/'intraday.sqlite').exists())
            finally:release.set()
            slow=pending.result(timeout=3)
        self.assertEqual(slow['coverage']['minutes'],1)
        self.assertNotEqual(fast['run_id'],slow['run_id'])

    def test_unknown_lane_is_rejected(self):
        with self.assertRaises(ValueError):collect(self.config,self.runtime,lane='unknown')


if __name__=='__main__':unittest.main()
