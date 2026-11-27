"""Isolated synthetic histories only; no test data is published to the platform."""
import hashlib
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pandas as pd

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from market_data_refresh import CHINA, atomic_json, read_json, refresh_lock
from market_data_sources import SourceManager
from daily_gap_review import review


class GapReviewTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(tempfile.mkdtemp(prefix='mquant-gap-review-'))
        self.calendar=['2026-11-18','2026-11-19','2026-11-20','2026-11-23','2026-11-24']
        atomic_json(self.root/'calendar.json',{'dates':self.calendar})
        self.now=datetime(2026,11,24,16,tzinfo=CHINA)
        self.config={'pool_id':'fixture','pool_version':2,'managed_symbols':[{'code':'002049','name':'fixture'}],
                     'start_date':'2026-11-18','min_history_days':3,'request_timeout':1}
        self.calls=[]
        self.mode='found'
        self.seed('002049')

    def frame(self,code,source,end='2026-11-23'):
        return pd.DataFrame([{'date':d,'code':code,'source':source+'.daily.qfq','adjust':'qfq',
                              'open':10,'high':11,'low':9,'close':10,'volume':100}
                             for d in self.calendar if d<=end])

    def seed(self,code):
        path=self.root/'cache'/f'{code}.csv';path.parent.mkdir(exist_ok=True)
        self.frame(code,'sina').query('date != "2026-11-19"').to_csv(path,index=False)
        atomic_json(path.with_suffix('.json'),{'start':'2026-11-18','as_of':'2026-11-23','source':'sina.daily.qfq','adjust':'qfq'})

    def provider(self,source,code,name,start,end,timeout,session):
        self.calls.append((source,code))
        if self.mode=='failed' or self.mode=='mixed' and source=='eastmoney': raise RuntimeError('fixture offline')
        f=self.frame(code,source,end)
        if self.mode in ('absent','mixed'): f=f.query('date != "2026-11-19"')
        if self.mode=='conflict': f=f.assign(open=20,high=21,low=19,close=20,volume=0)
        if self.mode=='truncated': f=f.query('date != "2026-11-18"')
        return f

    def run_review(self,**kwargs):
        with patch.object(SourceManager,'wait',return_value=0):
            return review(self.config,self.root,self.now,provider=self.provider,allowed=kwargs.get('allowed',lambda:True))

    def test_candidates_saved_separately_and_primary_and_signals_unchanged(self):
        atomic_json(self.root/'status.json',{'run_id':'original','last_success':{'signals':'original'}})
        paths=[self.root/'status.json',self.root/'cache/002049.csv',self.root/'cache/002049.json']
        before=[p.read_bytes() for p in paths]
        result=self.run_review();stock=result['stocks'][0]
        self.assertEqual(stock['missing_dates'],['2026-11-19'])
        self.assertEqual(stock['state'],'candidate_review')
        self.assertEqual(stock['dates'][0]['found_sources'],['eastmoney','tencent'])
        self.assertEqual(result['network_attempts'],2)
        for observation in stock['observations']:
            candidate=self.root/observation['candidate']
            self.assertTrue(candidate.exists())
            self.assertEqual(hashlib.sha256(candidate.read_bytes()).hexdigest(),observation['sha256'])
        self.assertEqual([p.read_bytes() for p in paths],before)

    def test_two_sources_missing_never_asserts_suspension_or_fills_zero(self):
        self.mode='absent';stock=self.run_review()['stocks'][0]
        self.assertEqual(stock['state'],'absence_observed')
        self.assertEqual(stock['dates'][0]['absent_sources'],['eastmoney','tencent'])
        self.assertIn('不能单独证明停牌',stock['note'])

    def test_failure_and_partial_absence_are_distinct_and_retry_is_bounded(self):
        self.mode='mixed';stock=self.run_review()['stocks'][0]
        self.assertEqual(stock['state'],'absence_observed');self.assertTrue(stock['retryable'])
        self.assertEqual(stock['observations'][0]['state'],'unavailable')
        self.run_review();self.assertEqual(len(self.calls),2)

    def test_failed_sources_cannot_be_evidence_of_absence(self):
        self.mode='failed';stock=self.run_review()['stocks'][0]
        self.assertEqual(stock['state'],'unresolved')
        self.assertEqual(stock['dates'][0]['absent_sources'],[])

    def test_price_conflicts_and_zero_volume_candidates_remain_flagged(self):
        self.mode='conflict';stock=self.run_review()['stocks'][0]
        self.assertEqual(stock['state'],'candidate_review')
        for o in stock['observations']:
            self.assertEqual(o['zero_volume_dates'],['2026-11-19'])
            self.assertEqual(len(o['price_conflict_dates']),2)

    def test_source_window_must_cover_both_known_primary_endpoints(self):
        self.mode='truncated';stock=self.run_review()['stocks'][0]
        self.assertEqual(stock['state'],'unresolved')
        self.assertTrue(all(o['state']=='unavailable' for o in stock['observations']))

    def test_daily_budget_is_reserved_before_request_and_caps_at_twelve(self):
        atomic_json(self.root/'daily-gap-review/budget.json',{'day':'2026-11-24','attempts':11,'limit':12})
        state=self.run_review();self.assertEqual(len(self.calls),1)
        self.assertEqual(read_json(self.root/'daily-gap-review/budget.json')['attempts'],12)
        self.assertTrue(state['stocks'][0]['retryable'])

    def test_at_most_three_symbols_per_batch_and_queued_fourth_resumes(self):
        self.config['managed_symbols']=[{'code':f'00200{i}','name':'fixture'} for i in range(4)]
        for s in self.config['managed_symbols']:self.seed(s['code'])
        first=self.run_review();self.assertEqual(first['network_attempts'],6)
        self.assertEqual(sum(s['state']=='queued' for s in first['stocks']),1)
        second=self.run_review();self.assertEqual(second['network_attempts'],2)
        self.assertEqual(sum(s['state']=='candidate_review' for s in second['stocks']),4)

    def test_cache_change_replaces_old_receipt_and_no_gap_needs_no_requests(self):
        self.run_review();self.frame('002049','sina').to_csv(self.root/'cache/002049.csv',index=False)
        second=self.run_review();self.assertEqual(len(self.calls),2)
        self.assertEqual(second['stocks'][0]['state'],'no_gaps')

    def test_yield_preserves_missing_dates_without_network(self):
        result=self.run_review(allowed=lambda:False)
        self.assertEqual(self.calls,[]);self.assertEqual(result['stocks'][0]['state'],'unresolved')
        self.assertEqual(result['stocks'][0]['missing_dates'],['2026-11-19'])

    def test_shared_daily_lock_and_trading_guard_prevent_network(self):
        with refresh_lock(self.root):
            with self.assertRaises((RuntimeError,OSError)): self.run_review()
        self.now=datetime(2026,11,24,12,tzinfo=CHINA)
        with self.assertRaises(ValueError):self.run_review()
        self.assertEqual(self.calls,[])


if __name__=='__main__':unittest.main()
