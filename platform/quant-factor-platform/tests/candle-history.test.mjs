import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {aggregateDailyCandles,createCandleHistory} from '../candle-history.mjs';
const row=(date,extra={})=>({date,code:'000001',open:10,high:12,low:9,close:11,volume:1.25,amount:1000,source:'sina.daily.qfq',adjust:'qfq',...extra});
const calendar=['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-30'];

test('weekly candles preserve OHLC and sum daily volume with hands-to-shares conversion',()=>{
  const rows=[row('2026-11-23'),row('2026-11-24',{open:11,high:13,low:10,close:12,volume:2.75,amount:3000})];
  const result=aggregateDailyCandles(rows,'week',calendar,'2026-11-27')[0];
  assert.deepEqual([result.open,result.high,result.low,result.close,result.volume_shares,result.amount_yuan],[10,13,9,12,400,4000]);
  assert.equal(result.missing_count,3);assert.equal(result.observed_complete,false);assert.equal(result.strategy_eligible,false);
});
test('period boundaries handle year changes and monthly periods without mixing baselines',()=>{
  const rows=[row('2025-12-30'),row('2026-01-02',{close:10.5})];
  const weekly=aggregateDailyCandles(rows,'week',[]);assert.equal(weekly.length,1);assert.equal(weekly[0].period_start,'2025-12-29');
  const monthly=aggregateDailyCandles(rows,'month',[]);assert.equal(monthly.length,2);assert.equal(monthly[1].period_start,'2026-01-01');
});
test('current period is partial, cutoff excludes unfinished daily data, missing amount stays missing',()=>{
  const rows=[row('2026-11-23',{amount:null}),row('2026-11-27',{close:12})];
  const result=aggregateDailyCandles(rows,'week',calendar,'2026-11-26')[0];
  assert.equal(result.last_date,'2026-11-23');assert.equal(result.pending_count,1);assert.equal(result.amount_yuan,null);
  assert.equal(result.missing_count,3);assert.equal(result.observed_complete,false);
});
test('unknown calendar and nontrading labels cannot establish a complete period',()=>{
  assert.equal(aggregateDailyCandles([row('2026-11-23')],'week',[])[0].calendar_known,false);
  const days=calendar.slice(0,5).map(day=>row(day));days.push(row('2026-11-28'));
  const result=aggregateDailyCandles(days,'week',calendar,'2026-11-30')[0];assert.equal(result.unexpected_count,1);assert.equal(result.observed_complete,false);
});
test('duplicate dates, invalid bars, mixed providers and mixed adjustment are rejected',()=>{
  for(const rows of [[row('2026-11-23'),row('2026-11-23')],[row('2026-11-23',{high:5})],
    [row('2026-11-23'),row('2026-11-24',{source:'tencent.daily.qfq'})],[row('2026-11-23'),row('2026-11-24',{adjust:'none'})]]){
    assert.throws(()=>aggregateDailyCandles(rows,'week',calendar));
  }
  assert.deepEqual(aggregateDailyCandles([],'week'),[]);
});
test('long daily history is reduced to at most twelve weekly or monthly candles',()=>{
  const rows=Array.from({length:600},(_,i)=>row(new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10)));
  assert.equal(aggregateDailyCandles(rows,'week').length,12);assert.equal(aggregateDailyCandles(rows,'month').length,12);
});
test('read-only history service enforces current pool and version and marks absent caches',()=>{
  const root=mkdtempSync(join(tmpdir(),'candle-history-')),config=join(root,'platform/quant-factor-platform/config'),cache=join(root,'outputs/live-market-data/cache');
  mkdirSync(config,{recursive:true});mkdirSync(cache,{recursive:true});
  writeFileSync(join(config,'stock-library.json'),JSON.stringify({version:2,stocks:[{code:'000001',name:'fixture',quote:true},{code:'000063',quote:true},{code:'600519',quote:false}]}));
  const path=join(cache,'000001.csv'),csv='date,code,open,high,low,close,volume,amount,source,adjust\n2026-11-23,000001,10,12,9,11,1.25,1000,sina.daily.qfq,qfq\n';writeFileSync(path,csv);
  const parseCsv=text=>{const [header,...lines]=text.trim().split('\n'),keys=header.split(',');return lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],v])));};
  const service=createCandleHistory({projectRoot:root,parseCsv,now:()=>new Date('2026-11-27T06:00:00Z')});
  const result=service.get('000001','week',2);assert.equal(result.state,'available');assert.equal(result.rows[0].volume_shares,125);
  assert.equal(result.daily_cutoff,'2026-11-26');assert.equal(readFileSync(path,'utf8'),csv);
  assert.equal(service.get('000001','week',1).status,409);assert.equal(service.get('600519','week',2).status,400);
  assert.equal(service.get('../bad','week',2).status,400);assert.equal(service.get('000001','intraday',2).status,400);
  assert.equal(service.get('000063','week',2).state,'missing');
});
