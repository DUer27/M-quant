"""Synthetic saved deliveries only, never treated as real closure evidence."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from intraday_minute_evidence import label_evidence, initialize_existing
from intraday_minute_audit import observe_minute, audit_summary
from intraday_storage import minute_metadata
from market_data_refresh import atomic_json, read_json


class MinuteEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.data={'code':'000001','source':'sina.minute','adjust':'none','rows':[
            {'time':f'2026-11-25T10:0{i}:00+08:00','open':10,'high':11,'low':9,'close':10,'volume_shares':100,'amount_yuan':1000,'closure_verified':False} for i in range(2)]}
        self.data['source_time']=self.data['rows'][-1]['time']

    def prior(self,data=None,time='2026-11-25T10:01:10+08:00',run='a'):
        data=data or self.data
        return {'data':copy.deepcopy(data),'received_at':time,'run_id':run,'bar_evidence':label_evidence(data,time,run)}

    def test_later_unchanged_delivery_increments_evidence_but_never_confirms_closure(self):
        rows=label_evidence(self.data,'2026-11-25T15:30:00+08:00','b',self.prior())
        self.assertTrue(all(row['observations']==2 and row['unchanged_observations']==2 for row in rows))
        self.assertTrue(rows[0]['later_label_seen']);self.assertFalse(rows[-1]['later_label_seen'])
        self.assertTrue(all(not row['closure_verified'] and not row['strategy_eligible'] for row in rows))

    def test_same_delivery_same_run_or_same_receipt_does_not_inflate_observations(self):
        for time,run in [('2026-11-25T10:01:10+08:00','a'),('2026-11-25T10:02:00+08:00','a'),('2026-11-25T10:01:10+08:00','b')]:
            rows=label_evidence(self.data,time,run,self.prior())
            self.assertTrue(all(row['observations']==1 for row in rows))

    def test_revision_resets_stability_and_increments_revision_count(self):
        changed=copy.deepcopy(self.data);changed['rows'][0]['close']=10.5
        rows=label_evidence(changed,'2026-11-25T10:02:10+08:00','b',self.prior())
        self.assertEqual(rows[0]['observations'],2);self.assertEqual(rows[0]['unchanged_observations'],1)
        self.assertEqual(rows[0]['revisions'],1);self.assertTrue(rows[0]['changed_this_observation'])

    def test_source_and_basis_changes_start_independent_evidence(self):
        for key,value in [('source','eastmoney.minute'),('adjust','qfq')]:
            data={**self.data,key:value};rows=label_evidence(data,'2026-11-25T10:02:10+08:00','b',self.prior())
            self.assertTrue(all(row['observations']==1 and row['revisions']==0 for row in rows))

    def test_older_receipt_cannot_inflate_or_replace_the_last_receipt(self):
        rows=label_evidence(self.data,'2026-11-25T10:00:00+08:00','b',self.prior())
        self.assertEqual(rows[0]['last_received_at'],'2026-11-25T10:01:10+08:00')
        self.assertEqual(rows[0]['observations'],1)

    def test_existing_old_baseline_seeds_one_prior_observation_only(self):
        previous=self.prior();previous.pop('bar_evidence')
        rows=label_evidence(self.data,'2026-11-25T10:02:00+08:00','b',previous)
        self.assertEqual(rows[0]['observations'],2)

    def test_audit_persists_per_label_evidence_without_enlarging_summaries(self):
        with tempfile.TemporaryDirectory() as temp:
            first=observe_minute(temp,self.data,'2026-11-25T10:01:10+08:00','a')
            second=observe_minute(temp,self.data,'2026-11-25T10:02:10+08:00','b')
            self.assertEqual(second['bar_evidence'][0]['observations'],2)
            self.assertNotIn('bar_evidence',audit_summary(second))
            repeated=observe_minute(temp,self.data,'2026-11-25T10:02:10+08:00','b')
            self.assertEqual(repeated['bar_evidence'],second['bar_evidence'])
            self.assertEqual(first['verified_count'],0)

    def test_initialize_existing_keeps_original_market_data_and_run_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=Path(temp);data={**self.data,'version':minute_metadata(self.data)['version']}
            audit=observe_minute(runtime,data,'2026-11-25T10:01:10+08:00','a');audit.pop('bar_evidence')
            atomic_json(runtime/'minute-audit/000001.json',audit)
            atomic_json(runtime/'minute-cache/000001.json',{'data':data,'received_at':audit['received_at'],'run_id':'a'})
            path=runtime/'minute-cache/000001.json';before=path.read_bytes()
            result=initialize_existing(runtime,['000001'])
            self.assertEqual(result[0]['state'],'initialized_one_saved_delivery');self.assertEqual(path.read_bytes(),before)
            saved=read_json(runtime/'minute-audit/000001.json');self.assertEqual(saved['observation_count'],1)
            self.assertTrue(all(e['observations']==1 for e in saved['bar_evidence']))
            self.assertEqual(initialize_existing(runtime,['000001'])[0]['state'],'already_recorded')

    def test_mismatched_existing_delivery_is_not_initialized(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=Path(temp);atomic_json(runtime/'minute-cache/000001.json',{'data':self.data,'received_at':'2026-11-25T10:01:10+08:00','run_id':'a'})
            atomic_json(runtime/'minute-audit/000001.json',{'version':'other','run_id':'b'})
            self.assertEqual(initialize_existing(runtime,['000001'])[0]['state'],'cache_audit_mismatch')


if __name__=='__main__':unittest.main()
