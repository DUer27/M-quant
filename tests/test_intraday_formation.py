"""Isolated formation comparisons; never publish fixtures as live market evidence."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from intraday_formation import summarize_formation


class FormationTests(unittest.TestCase):
    def delivery(self,run='a',received='10:01:10',last='10:01',source='sina.minute'):
        label=lambda value:'2026-11-26T'+value+':00+08:00'
        values={'open':10,'high':11,'low':9,'close':10,'volume_shares':100,'amount_yuan':1000}
        return {'code':'000001','day':'2026-11-26','source':source,'adjust':'none','run_id':run,
                'origin':'live','intraday_evidence':True,'received_at':'2026-11-26T'+received+'+08:00',
                'last_label':label(last),'labels':[{'label':label(t),'values':dict(values)} for t in ['10:00','10:01']]}

    def summarize(self,deliveries):
        return summarize_formation(deliveries,'2026-11-26','000001')

    def test_revisions_after_later_label_are_visible_without_promoting_closure(self):
        first=self.delivery();second=self.delivery('b','10:02:10','10:02')
        second['labels'][0]['values']['close']=10.5
        result=self.summarize([second,first]);source=result['sources'][0]
        self.assertEqual(source['observations'],2);self.assertEqual(source['label_advances'],1)
        self.assertEqual(source['overlap_comparisons'],2);self.assertEqual(source['revision_comparisons'],1)
        self.assertEqual(source['revisions_after_later_label'],1)
        self.assertEqual(source['recent_changes'][0]['fields'],['close'])
        self.assertFalse(result['closure_verified']);self.assertFalse(result['strategy_eligible'])

    def test_sources_and_basis_do_not_share_comparison_baselines(self):
        second=self.delivery('b','10:02:10',source='eastmoney.minute');second['labels'][0]['values']['close']=11
        unsupported=copy.deepcopy(second);unsupported['adjust']='qfq'
        result=self.summarize([self.delivery(),second,unsupported])
        self.assertEqual(len(result['sources']),2)
        self.assertTrue(all(s['overlap_comparisons']==0 for s in result['sources']))
        self.assertEqual(result['excluded']['invalid_evidence'],1)

    def test_imports_old_days_and_non_intraday_do_not_inflate_observations(self):
        imported=self.delivery();imported['origin']='imported_saved_delivery'
        invalid=self.delivery('old');invalid['day']='2026-11-25'
        late=self.delivery('late');late['intraday_evidence']=False
        result=self.summarize([imported,invalid,late])
        self.assertEqual(result['sources'],[]);self.assertEqual(result['excluded'],{'not_live_intraday':2,'invalid_evidence':1})

    def test_retries_and_timezone_equivalent_receipts_are_not_independent_rounds(self):
        first=self.delivery();retry=self.delivery(received='10:01:20')
        alias=self.delivery('b',received='10:01:20');alias['received_at']='2026-11-26T02:01:20+00:00'
        source=self.summarize([first,retry,alias])['sources'][0]
        self.assertEqual(source['observations'],1);self.assertEqual(source['collapsed_same_run'],1)
        self.assertEqual(source['duplicate_receipts'],1)

    def test_stagnation_regression_and_volume_changes_are_preserved(self):
        first=self.delivery();second=self.delivery('b','10:02:10');second['labels'][1]['values']['volume_shares']=200
        third=self.delivery('c','10:03:10',last='10:00');third['labels']=third['labels'][:1]
        source=self.summarize([first,second,third])['sources'][0]
        self.assertEqual(source['label_stagnations'],1);self.assertEqual(source['label_regressions'],1)
        self.assertEqual(source['revision_comparisons'],1);self.assertEqual(source['revisions_after_later_label'],0)

    def test_boundary_labels_are_evidence_only_and_recent_output_is_bounded(self):
        delivery=self.delivery(received='11:30:00',last='11:30')
        row=delivery['labels'][0]
        delivery['labels']=[{**row,'label':f'2026-11-26T11:{m:02}:00+08:00'} for m in range(20,31)]
        source=self.summarize([delivery])['sources'][0]
        self.assertEqual(source['boundary_observations'],{'11:30':1});self.assertEqual(source['observed_labels'],11)
        self.assertEqual(source['boundary_nearby_receipts'],{'11:30':1})
        self.assertEqual(len(source['recent_labels']),8)

    def test_afternoon_response_with_lunch_label_is_not_live_lunch_boundary_evidence(self):
        delivery=self.delivery(received='13:20:10',last='13:20')
        row=delivery['labels'][0]
        delivery['labels']=[{**row,'label':'2026-11-26T11:30:00+08:00'},
                            {**row,'label':'2026-11-26T13:20:00+08:00'}]
        source=self.summarize([delivery])['sources'][0]
        self.assertEqual(source['boundary_observations'],{'11:30':1})
        self.assertEqual(source['boundary_nearby_receipts'],{})

    def test_timezone_alias_labels_compare_by_instant_and_invalid_numeric_is_rejected(self):
        first=self.delivery();second=self.delivery('b','10:02:10')
        second['labels'][0]['label']='2026-11-26T02:00:00+00:00'
        source=self.summarize([first,second])['sources'][0];self.assertEqual(source['overlap_comparisons'],2)
        invalid=self.delivery();invalid['labels'][0]['values']['close']=float('nan')
        self.assertEqual(self.summarize([invalid])['excluded']['invalid_evidence'],1)


if __name__=='__main__':unittest.main()
