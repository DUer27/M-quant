"""Passive, bounded source/label evidence archive. Never promotes closed bars."""
import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from intraday_storage import canonical, digest
from intraday_formation import summarize_formation
from market_data_refresh import read_json

CHINA=ZoneInfo('Asia/Shanghai')
BOUNDARIES=('09:30','11:30','13:00','14:57','15:00')


def stamp(value):
    value=datetime.fromisoformat(value)
    if value.tzinfo is None:raise ValueError('证据时间必须带时区')
    return value.astimezone(CHINA)


def phase(value):
    clock=stamp(value).strftime('%H:%M:%S')
    if '09:30:00'<=clock<'11:30:00':return 'morning_continuous'
    if clock=='11:30:00':return 'morning_boundary'
    if '13:00:00'<=clock<'14:57:00':return 'afternoon_continuous'
    if '14:57:00'<=clock<='15:00:00':return 'closing_auction'
    return 'outside_session'


class BoundaryArchive:
    def __init__(self,runtime):
        path=Path(runtime)/'minute-boundary-observations.sqlite'
        path.parent.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(path,timeout=.1)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS deliveries (
            id TEXT PRIMARY KEY,code TEXT NOT NULL,source TEXT NOT NULL,basis TEXT NOT NULL,
            day TEXT NOT NULL,received_at TEXT NOT NULL,recorded_at TEXT NOT NULL,run_id TEXT NOT NULL,
            origin TEXT NOT NULL,receipt_phase TEXT NOT NULL,intraday_evidence INTEGER NOT NULL,
            series_version TEXT NOT NULL,payload TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS deliveries_lookup ON deliveries(day,code,source,received_at);
          PRAGMA user_version=1;
        ''')

    def close(self):self.db.close()

    def record(self,data,received_at,run_id,audit,calendar,origin='live',now=None):
        if origin not in ('live','imported_saved_delivery'):raise ValueError('证据来源类型无效')
        if not re.fullmatch(r'(?:00|30|60)\d{4}',str(data.get('code',''))) or data.get('source') not in ('sina.minute','eastmoney.minute') or data.get('adjust')!='none':
            raise ValueError('证据股票、来源或口径不受支持')
        if not data.get('rows') or not run_id:raise ValueError('证据缺少序列或运行编号')
        receipt=stamp(received_at);recorded=now or datetime.now(CHINA)
        if recorded.tzinfo is None:raise ValueError('记录时间必须带时区')
        identity=digest({'code':data['code'],'source':data['source'],'basis':data['adjust'],'received_at':receipt.isoformat(),'run_id':run_id})
        if self.db.execute('SELECT 1 FROM deliveries WHERE id=?',(identity,)).fetchone():return {'state':'duplicate','new_record':False}
        rows=sorted(data['rows'],key=lambda r:stamp(r['time']))
        labels=[stamp(row['time']) for row in rows]
        if len(set(labels))!=len(labels) or len({value.date() for value in labels})!=1:raise ValueError('重复标签或混合交易日不记录证据')
        label_day=labels[-1].date().isoformat()
        # Counts are bounded across imported and live observations, including repeated deliveries.
        count=self.db.execute('SELECT COUNT(*) FROM deliveries WHERE day=? AND code=? AND source=? AND basis=?',(label_day,data['code'],data['source'],data['adjust'])).fetchone()[0]
        if count>=600:return {'state':'daily_capacity','new_record':False,'limit':600}
        phase_at_receipt=phase(received_at)
        calendar_known=bool(calendar and max(calendar)>=receipt.date().isoformat())
        eligible=origin=='live' and calendar_known and receipt.date().isoformat() in calendar and receipt.date().isoformat()==label_day and phase_at_receipt!='outside_session' and 0<=(recorded-receipt).total_seconds()<=30 and 0<=(receipt-labels[-1]).total_seconds()<=180
        previous=self.db.execute('SELECT received_at FROM deliveries WHERE day=? AND code=? AND source=? AND basis=? ORDER BY received_at DESC LIMIT 1',(label_day,data['code'],data['source'],data['adjust'])).fetchone()
        if previous and receipt<stamp(previous[0]):eligible=False
        evidence={row['label']:row for row in audit.get('bar_evidence',[])} if all(audit.get(key)==value for key,value in {'code':data['code'],'source':data['source'],'adjust':data['adjust'],'version':data.get('version'),'received_at':received_at,'run_id':run_id}.items()) else {}
        selected={row['time']:row for row in rows[-8:]}
        for row in rows:
            if stamp(row['time']).strftime('%H:%M') in BOUNDARIES:
                selected[row['time']]=row
        for row in reversed(rows):
            if len(selected)>=32:break
            if evidence.get(row['time'],{}).get('changed_this_observation'):selected[row['time']]=row
        selected_rows=sorted(selected.values(),key=lambda row:stamp(row['time']))
        payload={'id':identity,'code':data['code'],'source':data['source'],'adjust':data['adjust'],'day':label_day,
                 'run_id':run_id,'received_at':received_at,'recorded_at':recorded.isoformat(),'origin':origin,
                 'receipt_phase':phase_at_receipt,'intraday_evidence':bool(eligible),'calendar_confirmed':calendar_known,
                 'series_version':data.get('version') or digest(data['rows']),'series_rows':len(rows),
                 'first_label':rows[0]['time'],'last_label':rows[-1]['time'],
                 'receipt_minus_last_label_seconds':(receipt-labels[-1]).total_seconds(),
                 'observed_boundary_labels':[row['time'] for row in rows if stamp(row['time']).strftime('%H:%M') in BOUNDARIES],
                 'labels':[{'label':row['time'],'phase':phase(row['time']),'values':{key:value for key,value in row.items() if key not in ('time','closure_verified')},
                            'content_hash':digest({key:value for key,value in row.items() if key!='closure_verified'}),
                            'observation_evidence':evidence.get(row['time']), 'closure_verified':False} for row in selected_rows],
                 'pending_labels':[row['time'] for row in data.get('pending_rows',[])],
                 'comparison_state':audit.get('comparison_state'),'changed_labels':audit.get('changed_labels'),
                 'label_semantics':'unverified','closure_verified':False,'strategy_eligible':False}
        with self.db:
            self.db.execute('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',(identity,data['code'],data['source'],data['adjust'],label_day,receipt.isoformat(),recorded.isoformat(),run_id,origin,phase_at_receipt,int(eligible),payload['series_version'],canonical(payload)))
        return {'state':'recorded','new_record':True,'id':identity,'intraday_evidence':bool(eligible),'stored_labels':len(selected_rows)}

    def read_day(self,day,codes):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day):raise ValueError('日期格式无效')
        result=[]
        for code in codes:
            rows=self.db.execute('SELECT payload FROM deliveries WHERE day=? AND code=? ORDER BY received_at DESC LIMIT 12',(day,code)).fetchall()
            total,intraday=self.db.execute('SELECT COUNT(*),COALESCE(SUM(intraday_evidence),0) FROM deliveries WHERE day=? AND code=?',(day,code)).fetchone()
            phases={row[0]:row[1] for row in self.db.execute('SELECT receipt_phase,COUNT(*) FROM deliveries WHERE day=? AND code=? AND intraday_evidence=1 GROUP BY receipt_phase',(day,code))}
            archived=self.db.execute('SELECT payload FROM deliveries WHERE day=? AND code=? ORDER BY received_at',(day,code)).fetchall()
            formation=summarize_formation([json.loads(row[0]) for row in archived],day,code)
            result.append({'code':code,'day':day,'deliveries':total,'intraday_deliveries':intraday,'phase_counts':phases,
                           'formation':formation,'recent':[json.loads(row[0]) for row in rows]})
        return result


def record_delivery(runtime,data,received_at,run_id,audit,origin='live',now=None):
    calendar=read_json(Path(runtime).parent/'calendar.json',{}).get('dates',[])
    archive=BoundaryArchive(runtime)
    try:return archive.record(data,received_at,run_id,audit,calendar,origin,now)
    finally:archive.close()


def export_observations(runtime,codes,day):
    from market_data_refresh import atomic_json
    archive=BoundaryArchive(runtime)
    try:stocks=archive.read_day(day,codes)
    finally:archive.close()
    value={'schema':'minute-boundary-observations.v1','day':day,'sample_codes':codes,'stocks':stocks,
           'deliveries':sum(s['deliveries'] for s in stocks),'intraday_deliveries':sum(s['intraday_deliveries'] for s in stocks),
           'verified_closed_bars':0,'strategy_eligible':False,'max_deliveries_per_stock_source_day':600}
    atomic_json(Path(runtime)/'minute-boundary-observations'/f'{day}.json',value)
    return value
