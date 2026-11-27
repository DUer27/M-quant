"""Isolated gap queue and worker fixtures; never publish synthetic live data."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import datetime
from unittest.mock import patch

import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_backfill import BackfillQueue, gap_groups, work_one
from intraday_probe import CHINA


class BackfillTests(unittest.TestCase):
    now = datetime(2026, 11, 25, 16, tzinfo=CHINA)
    config = {'codes': ['000001'], 'minute_audit_codes': ['000001'], 'backfill': {'enabled': True}}

    def data(self, labels=('13:01', '13:03'), source='sina.minute', day='2026-11-25'):
        return {'code':'000001', 'source':source, 'adjust':'none', 'closure_verified':False,
                'rows':[{'time':f'{day}T{label}:00+08:00', 'open':10, 'close':10, 'high':11, 'low':9,
                         'volume_shares':100, 'amount_yuan':1000, 'closure_verified':False} for label in labels]}

    def seed(self, runtime, **kwargs):
        queue=BackfillQueue(runtime)
        queue.observe(self.data(**kwargs), self.now.isoformat())
        queue.close()

    def client(self, labels=('13:02',), status=200):
        calls=[]
        class Client:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,url,**kwargs):
                calls.append((url,kwargs));response=requests.Response();response.status_code=status;response.encoding='utf-8'
                response._content=('=('+json.dumps([{'day':f'2026-11-25 {label}:00','open':'10','close':'10','high':'11','low':'9','volume':'100','amount':'1000'} for label in labels])+');').encode()
                if status==429: response.headers['Retry-After']='600'
                return response
        return Client,calls

    def test_internal_gap_discovery_excludes_lunch_and_unknown_session_edges(self):
        self.assertEqual(len(gap_groups(self.data())[0]),1)
        self.assertEqual(gap_groups(self.data(('11:30','13:00'))),[])
        self.assertEqual(gap_groups(self.data(('13:30',))),[])
        groups=gap_groups(self.data(('09:31','10:34')))
        self.assertEqual([len(group) for group in groups],[30,30,2])

    def test_queue_deduplicates_same_source_and_separates_different_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=BackfillQueue(directory)
            try:
                self.assertEqual(queue.observe(self.data(),self.now.isoformat()),1)
                self.assertEqual(queue.observe(self.data(),self.now.isoformat()),0)
                self.assertEqual(queue.observe(self.data(source='eastmoney.minute'),self.now.isoformat()),1)
                self.assertEqual(queue.summary('2026-11-25')['counts']['pending'],2)
            finally:queue.close()

    def test_later_live_series_resolves_without_network_or_promoting_closure(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=BackfillQueue(directory)
            try:
                queue.observe(self.data(),self.now.isoformat())
                queue.observe(self.data(('13:01','13:02','13:03')),self.now.isoformat())
                summary=queue.summary('2026-11-25')
                self.assertEqual(summary['counts']['resolved_from_latest'],1)
                self.assertEqual(summary['candidate_rows'],1)
                row=json.loads(queue.db.execute('SELECT payload FROM observations').fetchone()[0])
                self.assertFalse(row['closure_verified']);self.assertFalse(row['strategy_eligible'])
            finally:queue.close()

    def test_lease_expiry_requeues_and_claim_prevents_second_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            self.seed(directory);first=BackfillQueue(directory);second=BackfillQueue(directory)
            try:
                job=first.claim(1000);self.assertIsNotNone(job);self.assertIsNone(second.claim(1001))
                reclaimed=second.claim(1091);self.assertEqual(reclaimed['id'],job['id'])
            finally:first.close();second.close()

    def test_worker_stores_only_missing_candidates_and_preserves_all_live_files(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory);self.seed(runtime)
            (runtime/'minute-cache').mkdir();cache=runtime/'minute-cache/000001.json'
            cache.write_text(json.dumps({'data':self.data(),'received_at':self.now.isoformat(),'run_id':'live'}),encoding='utf-8')
            status=runtime/'status.json';status.write_text('{"run_id":"unchanged"}',encoding='utf-8')
            before=(cache.read_bytes(),status.read_bytes());client,calls=self.client()
            result=work_one(runtime,self.config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
            self.assertEqual(len(calls),1);self.assertEqual(result['counts']['collected_unverified'],1)
            self.assertEqual(result['candidate_rows'],1);self.assertEqual(result['requests_today'],1)
            self.assertEqual(before,(cache.read_bytes(),status.read_bytes()))
            self.assertFalse((runtime/'intraday.sqlite').exists())

    def test_trading_or_unknown_calendar_yields_without_requests_or_claims(self):
        for now,dates in [(self.now.replace(hour=14),['2026-11-25']),(self.now,[])]:
            with tempfile.TemporaryDirectory() as directory:
                self.seed(directory);client,calls=self.client()
                result=work_one(directory,self.config,now=now,session_factory=client,calendar_dates=dates)
                self.assertEqual(result['worker_state'],'yielded_to_live');self.assertEqual(calls,[])
                self.assertEqual(result['counts']['pending'],1)

    def test_old_date_is_held_for_supported_historical_provider_without_fake_success(self):
        with tempfile.TemporaryDirectory() as directory:
            self.seed(directory,day='2026-11-24');client,calls=self.client()
            result=work_one(directory,self.config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
            self.assertEqual(calls,[]);self.assertEqual(result['counts']['needs_historical_source'],1)
            self.assertEqual(result['candidate_rows'],0)

    def test_shared_provider_cooldown_and_daily_budget_block_network(self):
        for health,config in [({'sina.minute':{'blocked_until':self.now.timestamp()+1000}},self.config),
                              ({},{**self.config,'backfill':{'enabled':True,'max_requests_per_day':0}})]:
            with tempfile.TemporaryDirectory() as directory:
                self.seed(directory)
                (Path(directory)/'provider-health.json').write_text(json.dumps(health),encoding='utf-8')
                client,calls=self.client()
                result=work_one(directory,config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
                self.assertEqual(calls,[]);self.assertEqual(result['requests_today'],0)

    def test_rate_limit_updates_shared_cooldown_and_task_retries_are_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            self.seed(directory);client,calls=self.client(status=429)
            work_one(directory,self.config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
            health=json.loads((Path(directory)/'provider-health.json').read_text(encoding='utf-8'))
            self.assertEqual(health['sina.minute']['blocked_until'],self.now.timestamp()+600)
            queue=BackfillQueue(directory)
            try:
                for index in range(2):
                    job=queue.claim(self.now.timestamp()+1000*(index+1))
                    queue.finish(job,'retry_wait',self.now,'fixture missing',sent=True)
                self.assertEqual(queue.summary('2026-11-25')['counts']['needs_review'],1)
            finally:queue.close()

    def test_overlapping_jobs_share_observations_and_other_source_cannot_resolve(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=BackfillQueue(directory)
            try:
                queue.observe(self.data(('13:01','13:04')),self.now.isoformat())
                queue.observe(self.data(('13:02','13:04')),self.now.isoformat())
                queue.observe(self.data(('13:01','13:02','13:03','13:04'),source='eastmoney.minute'),self.now.isoformat())
                self.assertGreater(queue.summary('2026-11-25')['counts'].get('pending',0),0)
                queue.observe(self.data(('13:01','13:02','13:03','13:04')),self.now.isoformat())
                self.assertEqual(queue.summary('2026-11-25')['counts']['resolved_from_latest'],2)
            finally:queue.close()

    def test_interrupted_reserved_requests_are_not_retried_forever(self):
        with tempfile.TemporaryDirectory() as directory:
            self.seed(directory);queue=BackfillQueue(directory)
            try:
                for index in range(3):
                    job=queue.claim(self.now.timestamp()+100*index)
                    self.assertTrue(queue.consume_request('2026-11-25',20,job['id']))
                # Simulate a process killed after reservation, without a finish call.
                self.assertEqual(queue.summary('2026-11-25')['requests_today'],3)
            finally:queue.close()
            client,calls=self.client()
            result=work_one(directory,self.config,now=self.now.replace(minute=10),session_factory=client,calendar_dates=['2026-11-25'])
            self.assertEqual(calls,[]);self.assertEqual(result['counts']['needs_review'],1)

    def test_boundary_gaps_require_review_instead_of_automatic_fetch(self):
        with tempfile.TemporaryDirectory() as directory:
            self.seed(directory,labels=('14:57','15:00'))
            client,calls=self.client()
            result=work_one(directory,self.config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
            self.assertEqual(calls,[])
            self.assertEqual(result['counts']['needs_boundary_review'],1)
            self.assertEqual(result['candidate_rows'],0)

    def test_one_source_response_can_cover_multiple_jobs_without_extra_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=BackfillQueue(directory)
            try:
                queue.observe(self.data(('13:01','13:04')),self.now.isoformat())
                queue.observe(self.data(('13:02','13:04')),self.now.isoformat())
            finally:queue.close()
            client,calls=self.client(labels=('13:03',))
            result=work_one(directory,self.config,now=self.now,session_factory=client,calendar_dates=['2026-11-25'])
            self.assertEqual(len(calls),1);self.assertEqual(result['counts']['collected_unverified'],2)
            self.assertEqual(result['requests_today'],1)

    def test_latest_collection_only_enqueues_and_never_fetches_history_inline(self):
        from intraday_probe import collect
        owner=self;calls=[]
        class Client:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,url,**kwargs):
                calls.append(url);response=requests.Response();response.status_code=200;response.encoding='utf-8'
                response._content=('=('+json.dumps([{'day':f'2026-11-25 {label}:00','open':'10','close':'10','high':'11','low':'9','volume':'100','amount':'1000'} for label in ('13:01','13:03')])+');').encode()
                return response
        with tempfile.TemporaryDirectory() as directory, patch('intraday_probe.parse_quote_batch',return_value={'data':[],'validation_failures':[]}), \
             patch('intraday_probe.datetime',wraps=datetime) as stamp,patch('intraday_probe.time.sleep'):
            stamp.now.return_value=owner.now
            report=collect({**self.config,'minute_source_order':['sina','eastmoney']},directory,session_factory=Client)
            self.assertEqual(len(calls),3) # Two quote batches and one minute fetch; no worker fetch.
            self.assertEqual(report['backfill']['counts']['pending'],1)
            self.assertEqual(report['backfill']['requests_today'],0)


if __name__=='__main__':unittest.main()
