import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createHistoryPreparation,historyQuietTime} from '../history-preparation.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'history-controller-')),platform=join(root,'platform/quant-factor-platform'),runtime=join(root,'outputs/live-market-data');
  mkdirSync(join(platform,'config'),{recursive:true});mkdirSync(join(runtime,'history-preparation'),{recursive:true});
  const config={enabled:true,start_date:'2024-01-01',min_history_days:240,completed_bar_after:'16:30'};
  const stock={code:'600519',name:'fixture',daily:true,quote:true,minute:true,audit:false,priority:1};
  writeFileSync(join(platform,'config/market-data.json'),JSON.stringify(config));
  writeFileSync(join(platform,'config/stock-library.json'),JSON.stringify({id:'fixture',version:2,stocks:[stock]}));
  writeFileSync(join(runtime,'calendar.json'),JSON.stringify({dates:['2026-11-23','2026-11-24','2026-11-25']}));
  let time=new Date('2026-11-24T08:00:00Z'),busy=false;const calls=[];
  const controller=createHistoryPreparation({projectRoot:root,platformRoot:platform,python:'fixture',now:()=>time,busy:()=>busy,
    spawnProcess:(...args)=>{const child=new EventEmitter();child.pid=undefined;child.kill=()=>{child.killed=true;};calls.push({args,child});return child;}});
  return {root,platform,runtime,controller,config,calls,setTime:v=>{time=new Date(v);},setBusy:v=>{busy=v;}};
}

function gapFixture(){
  const f=fixture();mkdirSync(join(f.runtime,'cache'));
  for(const suffix of ['csv','json'])writeFileSync(join(f.runtime,'cache',`600519.${suffix}`),'fixture');
  const cache_stamp=Object.fromEntries(['csv','json'].map(suffix=>{const s=statSync(join(f.runtime,'cache',`600519.${suffix}`),{bigint:true});return[suffix,{size:Number(s.size),mtime_ms:Number(s.mtimeNs/1000000n)}];}));
  const receipt={code:'600519',state:'checked',as_of:'2026-11-23',missing_sessions:1,cache_stamp,requirements:{start_date:'2024-01-01',min_history_days:240,adjust:'qfq',rule:'history-start.v2'}};
  writeFileSync(join(f.runtime,'history-preparation/status.json'),JSON.stringify({state:'checked',pool_version:2,stocks:[receipt]}));
  return {...f,receipt};
}

test('history waits through trading/lunch and when another collector is busy',()=>{
  const f=fixture();f.setTime('2026-11-24T04:00:00Z');assert.equal(f.controller.start({expectedVersion:2}).accepted,false);
  f.setTime('2026-11-24T08:00:00Z');f.setBusy(true);assert.equal(f.controller.start({expectedVersion:2}).accepted,false);
  assert.equal(f.calls.length,0);assert.equal(historyQuietTime(new Date(),[]),false);
});
test('manual preparation rejects stale drafts, uses immutable version and excludes duplicate workers',()=>{
  const f=fixture();assert.throws(()=>f.controller.start({expectedVersion:1}),/版本/);
  assert.equal(f.controller.start({expectedVersion:2}).accepted,true);
  assert.equal(f.controller.start({expectedVersion:2}).accepted,false);
  const snapshot=JSON.parse(readFileSync(f.calls[0].args[1][2],'utf8'));
  assert.equal(snapshot.pool_version,2);assert.equal(snapshot.pool_snapshot,true);assert.equal(snapshot.managed_symbols[0].code,'600519');
});
test('receipt is checked separately from freshness and invalidates when cache changes',()=>{
  const f=fixture();mkdirSync(join(f.runtime,'cache'));
  for(const suffix of ['csv','json'])writeFileSync(join(f.runtime,'cache',`600519.${suffix}`),'fixture');
  const cache_stamp=Object.fromEntries(['csv','json'].map(suffix=>{const s=statSync(join(f.runtime,'cache',`600519.${suffix}`),{bigint:true});return[suffix,{size:Number(s.size),mtime_ms:Number(s.mtimeNs/1000000n)}];}));
  writeFileSync(join(f.runtime,'history-preparation/status.json'),JSON.stringify({state:'checked',pool_version:2,stocks:[{code:'600519',state:'checked',as_of:'2026-11-20',cache_stamp,requirements:{start_date:'2024-01-01',min_history_days:240,adjust:'qfq',rule:'history-start.v2'}}]}));
  let state=f.controller.status();assert.equal(state.coverage.checked,1);assert.equal(state.stocks[0].fresh,false);
  writeFileSync(join(f.runtime,'cache/600519.csv'),'changed fixture');
  state=f.controller.status();assert.equal(state.coverage.checked,0);assert.equal(state.stocks[0].current,false);assert.equal(state.state,'pending');
});
test('pause survives restart-style reads without flattening the original config',()=>{
  const f=fixture();assert.equal(f.controller.setEnabled(false).enabled,false);f.controller.tick();assert.equal(f.calls.length,0);
  const config=JSON.parse(readFileSync(join(f.platform,'config/market-data.json'),'utf8'));
  assert.equal(config.min_history_days,240);assert.equal(config.managed_symbols,undefined);
  f.controller.setEnabled(true);f.controller.tick();assert.equal(f.calls.length,1);
});
test('interruption retains receipts and automatic failures have bounded retries',()=>{
  const f=fixture();f.controller.tick();f.calls[0].child.emit('close',1);
  assert.equal(f.controller.status().state,'interrupted');
  f.setTime('2026-11-24T08:10:00Z');f.controller.tick();assert.equal(f.calls.length,1);
  f.setTime('2026-11-24T08:31:00Z');f.controller.tick();assert.equal(f.calls.length,2);f.calls[1].child.emit('close',1);
  f.setTime('2026-11-24T09:02:00Z');f.controller.tick();assert.equal(f.calls.length,3);f.calls[2].child.emit('close',1);
  f.setTime('2026-11-24T09:33:00Z');f.controller.tick();assert.equal(f.calls.length,3);
});
test('running historical work yields when a latest-data task begins',()=>{
  const f=fixture();f.controller.start({expectedVersion:2});f.setBusy(true);f.controller.tick();assert.equal(f.calls[0].child.killed,true);
});
test('gap review runs only on request with a fixed pool and excludes concurrent history work',()=>{
  const f=gapFixture();f.controller.tick();assert.equal(f.calls.length,0);
  assert.throws(()=>f.controller.start({expectedVersion:1,reviewGaps:true}),/版本/);
  assert.equal(f.controller.start({expectedVersion:2,reviewGaps:true}).accepted,true);
  assert.match(f.calls[0].args[1][0],/daily_gap_review.py$/);
  assert.equal(f.controller.status().state,'checked');assert.equal(f.controller.status().gap_review.state,'running');
  assert.equal(f.controller.start({expectedVersion:2}).accepted,false);
});
test('gap request respects daily provider-attempt budget',()=>{
  const f=gapFixture();mkdirSync(join(f.runtime,'daily-gap-review'));
  writeFileSync(join(f.runtime,'daily-gap-review/budget.json'),JSON.stringify({day:'2026-11-24',attempts:12,limit:12}));
  const result=f.controller.start({expectedVersion:2,reviewGaps:true});assert.equal(result.accepted,false);assert.match(result.reason,/12次/);
});
test('reviewed gaps are not fetched again and cache changes invalidate old evidence',()=>{
  const f=gapFixture();mkdirSync(join(f.runtime,'daily-gap-review'));
  writeFileSync(join(f.runtime,'daily-gap-review/status.json'),JSON.stringify({state:'reviewed',pool_version:2,
    stocks:[{...f.receipt,state:'candidate_review',missing_dates:['2026-11-19'],retryable:false}]}));
  assert.equal(f.controller.status().gap_review.stocks[0].current,true);
  assert.equal(f.controller.start({expectedVersion:2,reviewGaps:true}).accepted,false);
  writeFileSync(join(f.runtime,'cache/600519.csv'),'modified fixture');
  assert.equal(f.controller.status().gap_review.stocks[0].state,'stale');
  assert.equal(f.controller.start({expectedVersion:2,reviewGaps:true}).accepted,false);
});
