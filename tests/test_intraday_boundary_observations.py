"""Isolated evidence fixtures. No synthetic observation is used by the platform."""
import json
import sys
import tempfile
import unittest
from datetime import datetime,timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from intraday_boundary_observations import BoundaryArchive,phase,export_observations
from intraday_probe import collect,CHINA
from market_data_refresh import atomic_json
import test_intraday_split as split_fixtures


class BoundaryObservationTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(tempfile.mkdtemp(prefix='boundary-observations-'))
        self.archive=BoundaryArchive(self.root)
        self.received='2026-11-25T10:01:10+08:00'
        self.now=datetime.fromisoformat(self.received)+timedelta(seconds=1)
        self.data={'code':'000001','source':'sina.minute','adjust':'none','version':'fixture-version',
                   'rows':[{'time':f'2026-11-25T10:0{i}:00+08:00','open':10,'high':11,'low':9,'close':10,'volume_shares':100,'amount_yuan':1000} for i in range(2)]}
        self.calendar=['2026-11-25','2026-11-26']

    def tearDown(self):self.archive.close()

    def record(self,**kwargs):
        return self.archive.record(kwargs.pop('data',self.data),kwargs.pop('received',self.received),kwargs.pop('run','fixture-run'),{},
                                   kwargs.pop('calendar',self.calendar),kwargs.pop('origin','live'),kwargs.pop('now',self.now))

    def test_valid_intraday_delivery_is_recorded_but_never_becomes_closed(self):
        result=self.record();self.assertTrue(result['intraday_evidence'])
        saved=self.archive.read_day('2026-11-25',['000001'])[0]
        self.assertEqual(saved['intraday_deliveries'],1);self.assertEqual(saved['phase_counts'],{'morning_continuous':1})
        self.assertFalse(saved['recent'][0]['closure_verified']);self.assertFalse(saved['recent'][0]['strategy_eligible'])

    def test_saved_import_and_late_recording_do_not_count_as_new_intraday_evidence(self):
        self.assertFalse(self.record(origin='imported_saved_delivery')['intraday_evidence'])
        self.assertFalse(self.record(run='late',now=self.now+timedelta(hours=2))['intraday_evidence'])
        saved=self.archive.read_day('2026-11-25',['000001'])[0];self.assertEqual(saved['deliveries'],2);self.assertEqual(saved['intraday_deliveries'],0)

    def test_duplicate_delivery_and_timezone_alias_do_not_inflate_count(self):
        self.record();self.assertEqual(self.record()['state'],'duplicate')
        self.assertEqual(self.record(received='2026-11-25T02:01:10+00:00')['state'],'duplicate')
        self.assertEqual(self.archive.read_day('2026-11-25',['000001'])[0]['deliveries'],1)

    def test_old_source_time_wrong_calendar_future_receipt_and_old_response_are_not_valid_intraday(self):
        self.assertFalse(self.record(calendar=[])['intraday_evidence'])
        self.assertFalse(self.record(run='future',now=self.now-timedelta(minutes=1))['intraday_evidence'])
        stale={**self.data,'rows':[{**row,'time':row['time'].replace('10:','09:')} for row in self.data['rows']]}
        self.assertFalse(self.record(data=stale,run='stale')['intraday_evidence'])
        self.record(received='2026-11-25T10:02:10+08:00',run='newer',now=self.now+timedelta(minutes=1))
        self.assertFalse(self.record(received='2026-11-25T10:01:20+08:00',run='older',now=self.now+timedelta(seconds=10))['intraday_evidence'])

    def test_afternoon_closing_auction_and_lunch_are_distinct_phases(self):
        self.assertEqual(phase('2026-11-25T14:56:59+08:00'),'afternoon_continuous')
        self.assertEqual(phase('2026-11-25T14:57:00+08:00'),'closing_auction')
        self.assertEqual(phase('2026-11-25T15:00:00+08:00'),'closing_auction')
        self.assertEqual(phase('2026-11-25T12:00:00+08:00'),'outside_session')

    def test_key_boundaries_survive_many_revisions_and_payload_is_bounded(self):
        labels=['09:30','11:30','13:00','14:57','15:00']+[f'14:{i:02}' for i in range(10,57)]
        rows=[{**self.data['rows'][0],'time':f'2026-11-25T{label}:00+08:00'} for label in labels]
        data={**self.data,'rows':rows};audit={'code':data['code'],'source':data['source'],'adjust':'none','version':data['version'],
                                          'received_at':'2026-11-25T15:01:00+08:00','run_id':'fixture-run',
                                          'bar_evidence':[{'label':r['time'],'changed_this_observation':True} for r in rows]}
        self.archive.record(data,audit['received_at'],'fixture-run',audit,self.calendar,now=datetime(2026,11,25,15,1,1,tzinfo=CHINA))
        event=self.archive.read_day('2026-11-25',['000001'])[0]['recent'][0]
        self.assertLessEqual(len(event['labels']),32)
        present={r['label'][11:16] for r in event['labels']}
        self.assertTrue(set(['09:30','11:30','13:00','14:57','15:00']).issubset(present))

    def test_daily_capacity_prevents_unbounded_growth(self):
        base=('000001','sina.minute','none','2026-11-25',self.received,self.received,'run','live','morning_continuous',0,'v','{}')
        with self.archive.db:self.archive.db.executemany('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[(str(i),*base) for i in range(600)])
        self.assertEqual(self.record()['state'],'daily_capacity')

    def test_export_respects_selected_samples_and_never_returns_another_day(self):
        self.record(origin='imported_saved_delivery');result=export_observations(self.root,['000001'],'2026-11-25')
        self.assertEqual(result['deliveries'],1);self.assertEqual(result['intraday_deliveries'],0)
        self.assertEqual(export_observations(self.root,['600519'],'2026-11-25')['deliveries'],0)
        self.assertEqual(self.archive.read_day('2026-11-26',['000001'])[0]['deliveries'],0)

    def test_invalid_code_source_timezone_and_duplicate_labels_are_rejected(self):
        for data in [{**self.data,'code':'../bad'},{**self.data,'source':'unknown'},{**self.data,'rows':[self.data['rows'][0]]*2}]:
            with self.assertRaises(ValueError):self.record(data=data)
        with self.assertRaises(ValueError):self.record(received='2026-11-25T10:01:10')

    def test_no_market_files_are_created_or_changed_by_archive(self):
        path=self.root/'status.json';path.write_text('fixture sentinel',encoding='utf-8');before=path.read_bytes()
        self.record();self.assertEqual(path.read_bytes(),before)
        self.assertFalse((self.root/'minute-cache').exists());self.assertFalse((self.root/'intraday.sqlite').exists())

    def test_collector_hook_archives_existing_sample_without_extra_source_requests(self):
        fixture=split_fixtures.SplitCollectorTests();fixture.setUp()
        with patch('intraday_probe.datetime',split_fixtures.FixedClock):
            result=collect(fixture.config,fixture.runtime,session_factory=fixture.factory(fixture.runtime),lane='minute')
        self.assertEqual(len(fixture.requests),1);self.assertEqual(result['coverage']['minutes'],1)
        self.assertEqual(result['rounds'][0]['checks'][0]['boundary_observation']['state'],'recorded')
        self.assertTrue((fixture.runtime/'minute-boundary-observations.sqlite').exists())

    def test_archive_failure_never_discards_valid_market_samples(self):
        fixture=split_fixtures.SplitCollectorTests();fixture.setUp()
        with patch('intraday_probe.datetime',split_fixtures.FixedClock),patch('intraday_boundary_observations.record_delivery',side_effect=OSError('fixture archive unavailable')):
            result=collect(fixture.config,fixture.runtime,session_factory=fixture.factory(fixture.runtime),lane='minute')
        self.assertEqual(len(fixture.requests),1);self.assertEqual(result['coverage']['minutes'],1)
        self.assertTrue((fixture.runtime/'minute-cache/000001.json').exists())
        self.assertEqual(result['minute_audit']['state'],'degraded')


if __name__=='__main__':unittest.main()
