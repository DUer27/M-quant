import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from stock_library import apply_stock_library
from intraday_backfill import BackfillQueue


class StockLibraryTests(unittest.TestCase):
    def test_worker_projection_uses_management_library_and_snapshot_bypasses_future_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'platform/quant-factor-platform/config/stock-library.json';path.parent.mkdir(parents=True)
            stocks=[{'code':'000001','name':'平安银行','daily':True,'quote':True,'minute':False,'audit':False,'priority':1},
                    {'code':'600519','name':'贵州茅台','daily':True,'quote':True,'minute':True,'audit':True,'priority':0}]
            path.write_text(json.dumps({'id':'fixture','version':2,'stocks':stocks}),encoding='utf-8')
            live=apply_stock_library({'codes':['000002']},'intraday',root)
            self.assertEqual(live['codes'],['600519','000001']);self.assertEqual(live['minute_codes'],['600519']);self.assertEqual(live['pool_version'],2)
            daily=apply_stock_library({},'daily',root);self.assertEqual([s['code'] for s in daily['managed_symbols']],live['codes'])
            self.assertEqual(apply_stock_library({'pool_snapshot':True,'codes':['000002']},'intraday',root)['codes'],['000002'])

    def test_removed_minute_stock_tasks_pause_and_resume_without_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=BackfillQueue(directory)
            try:
                data={'code':'000001','source':'sina.minute','adjust':'none','rows':[{'time':f'2026-11-25T13:0{i}:00+08:00'} for i in [1,3]]}
                queue.observe(data,'2026-11-25T14:00:00+08:00');queue.sync_pool(['600519'])
                self.assertEqual(queue.summary('2026-11-25')['counts']['paused_removed'],1)
                self.assertIsNone(queue.claim(10**10))
                queue.sync_pool(['000001']);self.assertEqual(queue.summary('2026-11-25')['counts']['pending'],1)
            finally:queue.close()

    def test_quote_only_worker_does_not_request_minutes(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        from intraday_probe import collect
        class Client:
            calls=0
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,*args,**kwargs):self.calls+=1;return SimpleNamespace(content=b'',status_code=200,raise_for_status=lambda:None)
        with tempfile.TemporaryDirectory() as directory,patch('intraday_probe.parse_quote_batch',return_value={'data':[],'validation_failures':[]}):
            client=Client();report=collect({'codes':['000001'],'minute_codes':[],'minute_audit_codes':[]},directory,session_factory=lambda:client)
            self.assertEqual(client.calls,2);self.assertEqual(report['coverage']['minutes'],0)
            self.assertEqual(report['minute_codes'],[])


if __name__=='__main__':unittest.main()
