"""Deterministic, isolated diagnostics/recovery fixtures; no live acceptance run."""
import copy
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from datetime import datetime
from unittest.mock import patch

import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from intraday_diagnostics import snapshot, compare, SymbolDiagnostics, RecoveryBudget
from intraday_probe import collect, parse_sina_minutes, CHINA


class DiagnosticsTests(unittest.TestCase):
    now = datetime(2026,11,25,13,32,20,tzinfo=CHINA)

    def raw(self, label='13:31', close='10'):
        return '=('+json.dumps([{'day':f'2026-11-25 {label}:00','open':'10','high':'11','low':'9','close':close,'volume':'100','amount':'1000'}])+');'

    def data(self, code='000001', label='13:31', close='10'):
        return parse_sina_minutes(self.raw(label,close),code,self.now)

    def test_same_label_distinguishes_revision_from_identical_payload_and_retains_times(self):
        old=snapshot('minute',self.data(),'2026-11-25T13:31:30+08:00','old')
        same=compare(snapshot('minute',self.data(),self.now.isoformat(),'new'),old)
        revised=compare(snapshot('minute',self.data(close='10.5'),self.now.isoformat(),'new'),old)
        self.assertEqual(same['state'],'label_unchanged_same');self.assertTrue(same['needs_recovery'])
        self.assertEqual(revised['state'],'label_unchanged_revised');self.assertEqual(revised['changed_latest_fields'],['close'])
        self.assertEqual(revised['previous_source_time'],old['source_time']);self.assertEqual(revised['received_at'],self.now.isoformat())

    def test_cross_source_receipt_regression_and_label_regression_are_not_normal_advances(self):
        old=snapshot('minute',self.data(),'2026-11-25T13:31:30+08:00','old')
        current=snapshot('minute',self.data(),self.now.isoformat(),'new');current['source']='eastmoney.minute'
        self.assertEqual(compare(current,old)['state'],'source_changed')
        current['source']=old['source'];current['received_at']='2026-11-25T13:31:00+08:00'
        self.assertEqual(compare(current,old)['state'],'older_receipt')
        current['received_at']=self.now.isoformat();current['source_time']='2026-11-25T13:30:00+08:00'
        self.assertEqual(compare(current,old)['state'],'label_regressed')

    def test_baseline_bootstraps_from_cache_and_persists_without_regression(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory);(runtime/'minute-cache').mkdir()
            (runtime/'minute-cache/000001.json').write_text(json.dumps({'data':self.data(),'run_id':'old','received_at':'2026-11-25T13:31:30+08:00'}),encoding='utf-8')
            tracker=SymbolDiagnostics(runtime,'new')
            observed=tracker.observe('minute',self.data(),self.now.isoformat())
            self.assertEqual(observed['previous_run_id'],'old')
            tracker.finish({'entries':tracker.attempts})
            later=SymbolDiagnostics(runtime,'later');back=later.observe('minute',self.data(label='13:30'),self.now.isoformat())
            self.assertEqual(back['state'],'label_regressed');later.finish({'entries':later.attempts})
            saved=json.loads((runtime/'symbol-diagnostics-state.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['minute:sina.minute:000001']['source_time'][11:16],'13:31')

    def test_budget_cooldown_source_block_and_deadline_are_explicit_and_persist(self):
        with tempfile.TemporaryDirectory() as directory:
            budget=RecoveryBudget(directory,1000,{'max_symbols':1,'max_requests':1})
            self.assertIsNone(budget.choose('minute:000001'));self.assertEqual(budget.choose('minute:000002'),'symbol_budget')
            self.assertEqual(budget.allow_request(1,True),'source_cooldown')
            self.assertEqual(budget.allow_request(50),'time_budget')
            budget.requests=1;self.assertEqual(budget.allow_request(1),'request_budget')
            budget.attempted('minute:000001',1000,'still_not_advanced');budget.save()
            self.assertEqual(RecoveryBudget(directory,1010).choose('minute:000001'),'symbol_cooldown')

    def test_corrupt_optional_state_is_reported_and_does_not_discard_successful_samples(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory)
            (runtime/'symbol-diagnostics-state.json').write_text('broken',encoding='utf-8')
            (runtime/'symbol-recovery-state.json').write_text('broken',encoding='utf-8')
            report,calls=self.run_fixture(directory)
            self.assertEqual(report['coverage']['minutes'],2)
            self.assertEqual(len(calls),2)
            self.assertEqual(report['symbol_diagnostics']['state'],'degraded')
            self.assertEqual(len(report['symbol_diagnostics']['errors']),2)

    def run_fixture(self, directory, primary_advanced=True, alternate_advanced=False, policy=None, codes=('000001','000002'), trading=True):
        owner=self
        class Clock:
            tick=0
            def monotonic(self):return self.tick
            def sleep(self,seconds):self.tick+=seconds
        clock=Clock();calls=[];counts={}
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,url,**kwargs):
                response=requests.Response();response.status_code=200;response._content=b'{}';response.encoding='utf-8'
                if 'quotes.sina' in url:
                    code=kwargs['params']['symbol'][2:];counts[code]=counts.get(code,0)+1;calls.append(('sina',code))
                    label='13:32' if code!='000001' or (counts[code]>1 and primary_advanced) else '13:31'
                    response._content=owner.raw(label).encode()
                elif 'eastmoney' in url:
                    code=kwargs['params']['secid'].split('.')[1];calls.append(('eastmoney',code))
                    label='13:32' if alternate_advanced else '13:31'
                    response._content=json.dumps({'data':{'code':code,'trends':[f'2026-11-25 {label},10,10,11,9,1,1000,10']}}).encode()
                return response
        runtime=Path(directory);(runtime/'minute-cache').mkdir(exist_ok=True)
        for code in codes:
            (runtime/'minute-cache'/f'{code}.json').write_text(json.dumps({'data':self.data(code),'received_at':'2026-11-25T13:31:30+08:00','run_id':'previous'}),encoding='utf-8')
        with patch('intraday_probe.parse_quote_batch',return_value={'data':[],'validation_failures':[]}), \
             patch('intraday_probe.datetime',wraps=datetime) as stamp,patch('intraday_probe.time.monotonic',clock.monotonic), \
             patch('intraday_probe.time.sleep',clock.sleep):
            stamp.now.return_value=self.now if trading else self.now.replace(hour=16)
            report=collect({'codes':list(codes),'minute_source_order':['sina','eastmoney'],'targeted_recovery':policy or {}},runtime,session_factory=Session)
        return report,calls

    def test_only_stagnant_symbol_retried_and_newer_result_becomes_the_only_selected_series(self):
        with tempfile.TemporaryDirectory() as directory:
            report,calls=self.run_fixture(directory)
            self.assertEqual(calls,[('sina','000001'),('sina','000002'),('sina','000001')])
            events=report['symbol_diagnostics']['recovery_events'];self.assertEqual(len(events),1);self.assertTrue(events[0]['recovered'])
            selected=[c for c in report['rounds'][0]['checks'] if c['kind']=='minute' and c['ok'] and c['selected']]
            self.assertEqual(len(selected),2);self.assertTrue(all(c['data']['source_time'][11:16]=='13:32' for c in selected))
            self.assertEqual(report['symbol_diagnostics']['extra_requests'],1)
            self.assertEqual(report['storage']['matched_series'],2)
            self.assertEqual(report['coverage']['minutes'],2)
            self.assertEqual(report['storage']['verified_minute_bars'],0)

    def test_source_switch_keeps_whole_newer_series_and_does_not_merge_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            report,calls=self.run_fixture(directory,primary_advanced=False,alternate_advanced=True)
            self.assertEqual(report['symbol_diagnostics']['recovery_events'][0]['outcome'],'advanced_after_switch')
            saved=json.loads((Path(directory)/'minute-cache/000001.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['data']['source'],'eastmoney.minute');self.assertEqual(len(saved['data']['rows']),1)

    def test_budget_limits_extra_requests_and_retains_initial_data_when_not_advanced(self):
        with tempfile.TemporaryDirectory() as directory:
            report,calls=self.run_fixture(directory,primary_advanced=False,alternate_advanced=True,policy={'max_requests':1})
            self.assertNotIn(('eastmoney','000001'),calls)
            self.assertEqual(report['symbol_diagnostics']['extra_requests'],1)
            self.assertFalse(report['symbol_diagnostics']['recovery_events'][0]['recovered'])
            saved=json.loads((Path(directory)/'minute-cache/000001.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['data']['source_time'][11:16],'13:31')

    def test_after_hours_or_symbol_cooldown_does_not_add_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            report,calls=self.run_fixture(directory,trading=False)
            self.assertEqual(len(calls),2);self.assertEqual(report['symbol_diagnostics']['extra_requests'],0)
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory)/'symbol-recovery-state.json').write_text(json.dumps({'minute:000001':{'next_allowed_at':time.time()+1000}}),encoding='utf-8')
            report,calls=self.run_fixture(directory)
            self.assertEqual(len(calls),2);self.assertEqual(report['symbol_diagnostics']['recovery_events'][0]['outcome'],'symbol_cooldown')

    def test_quote_retry_batches_only_lagging_symbol_and_merges_same_source_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory);(runtime/'quote-cache').mkdir()
            codes=['000001','000002'];calls=[];sina_calls=0
            for source in ['sina','tencent']:
                for code in codes:
                    row={'source':source+'.quote','code':code,'source_time':'2026-11-25T13:31:00+08:00','last':10}
                    (runtime/'quote-cache'/f'{source}-{code}.json').write_text(json.dumps({'data':row,'received_at':'2026-11-25T13:31:30+08:00','run_id':'old'}),encoding='utf-8')
            def quotes(parser,text,wanted,received):
                nonlocal sina_calls
                source='sina' if parser.__name__=='parse_sina' else 'tencent'
                if source=='sina':sina_calls+=1
                return {'data':[{'source':source+'.quote','code':code,'source_time':f'2026-11-25T13:{"31" if source=="sina" and sina_calls==1 and code=="000001" else "32"}:00+08:00','last':10} for code in wanted],'validation_failures':[]}
            owner=self
            class Session:
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def get(self,url,**kwargs):
                    calls.append(url);response=requests.Response();response.status_code=200;response.encoding='utf-8'
                    response._content=owner.raw('13:32').encode();return response
            with patch('intraday_probe.parse_quote_batch',side_effect=quotes),patch('intraday_probe.datetime',wraps=datetime) as stamp,patch('intraday_probe.time.sleep'):
                stamp.now.return_value=self.now
                report=collect({'codes':codes,'minute_source_order':['sina','eastmoney']},runtime,session_factory=Session)
            self.assertEqual(len(calls),5) # Two normal quote batches, two minutes, one targeted quote batch.
            self.assertEqual(calls[-1],'https://hq.sinajs.cn/list=sz000001')
            first=report['rounds'][0]['checks'][0]
            self.assertEqual(len(first['data']),2);self.assertEqual(first['data'][0]['source_time'][11:16],'13:32')
            self.assertEqual(first['receipt_by_code']['000001'],self.now.isoformat())
            self.assertEqual(report['symbol_diagnostics']['extra_requests'],1)
            self.assertTrue(report['symbol_diagnostics']['recovery_events'][0]['recovered'])


if __name__=='__main__':unittest.main()
