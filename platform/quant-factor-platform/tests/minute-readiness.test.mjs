import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyMinuteSeries,createMinuteReadiness} from '../minute-readiness.mjs';

const row=time=>({time:`2026-11-25T${time}:00+08:00`,open:10,high:11,low:9,close:10,volume_shares:100,amount_yuan:1000,closure_verified:false});
const series=(labels=['10:00','10:01'])=>({code:'000001',source:'sina.minute',adjust:'none',version:'fixture-version',rows:labels.map(row),source_time:row(labels.at(-1)).time,closure_verified:false});
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'minute-policy-')),runtime=join(root,'outputs/live-market-data/intraday-trial');
  mkdirSync(join(runtime,'minute-cache'),{recursive:true});mkdirSync(join(runtime,'minute-audit'));
  const data=series(),received='2026-11-25T10:01:10+08:00';
  const saved={data,received_at:received,run_id:'fixture-run'};writeFileSync(join(runtime,'minute-cache/000001.json'),JSON.stringify(saved));
  let now=new Date('2026-11-25T10:01:15+08:00');
  const status={codes:['000001'],minute_codes:['000001'],configured_pool_version:2,current_context:'trading',
    minute_audit:{codes:['000001']},minutes:[{code:'000001',data:structuredClone(data),received_at:received,run_id:saved.run_id,current_ok:true,cached:false}]};
  return {root,runtime,data,saved,status,policy:createMinuteReadiness({projectRoot:root,now:()=>now}),setNow:value=>{now=new Date(value);}};
}
test('receiving-minute and boundary classes stay unverified even after time passes',()=>{
  const data=series(['09:30','10:00','10:01','11:30','13:00','15:00']);
  const result=classifyMinuteSeries(data,'2026-11-25T15:00:20+08:00');
  assert.equal(result.counts.possible_forming,1);assert.equal(result.counts.boundary_unverified,3);assert.equal(result.counts.closure_unverified,2);
  assert.ok(result.bars.every(b=>!b.strategy_eligible&&!b.closure_verified));
  const f=fixture();const before=f.policy.detail('000001',f.status);f.setNow('2026-11-25T15:30:00+08:00');
  assert.deepEqual(f.policy.detail('000001',f.status).counts,before.counts);assert.equal(f.policy.detail('000001',f.status).strategy_eligible,false);
});
test('internal missing labels are enumerated without counting lunch as missing',()=>{
  const one=classifyMinuteSeries(series(['10:00','10:03']),'2026-11-25T10:04:00+08:00');assert.equal(one.suspected_missing_labels,2);
  assert.deepEqual(one.gaps[0].labels,['2026-11-25T02:01:00.000Z','2026-11-25T02:02:00.000Z']);
  const lunch=classifyMinuteSeries(series(['11:30','13:00']),'2026-11-25T13:01:00+08:00');assert.equal(lunch.suspected_missing_labels,0);
  assert.equal(classifyMinuteSeries(series(['10:30']),'2026-11-25T13:01:00+08:00').gaps.length,0);
});
test('gaps touching the closing boundary are not misreported as ordinary missing bars',()=>{
  const value=classifyMinuteSeries(series(['14:57','15:00']),'2026-11-25T15:30:00+08:00');
  assert.equal(value.suspected_missing_labels,0);assert.equal(value.boundary_gap_labels,2);assert.equal(value.gaps[0].state,'boundary_gap_unverified');
});
test('future samples are isolated and duplicated malformed or invalid bars are not accepted as ordinary labels',()=>{
  const data=series(['10:00','10:02']);data.pending_rows=[row('10:03')];
  const result=classifyMinuteSeries(data,'2026-11-25T10:01:10+08:00');assert.equal(result.counts.isolated_future,2);assert.equal(result.counts.verified_closed,0);
  for(const bad of [{...data,rows:[row('10:00'),row('10:00')]},{...data,rows:[{...row('10:00'),high:8}]},{...data,rows:[{...row('10:00'),time:'bad'}]}])
    assert.ok(classifyMinuteSeries(bad,'2026-11-25T10:01:10+08:00').problems.length>0);
});
test('claimed closure flags and numerous unchanged observations cannot bypass the strategy gate',()=>{
  const f=fixture();const audit={version:f.data.version,run_id:f.saved.run_id,received_at:f.saved.received_at,source:f.data.source,adjust:'none',
    bar_evidence:f.data.rows.map(r=>({label:r.time,observations:100,unchanged_observations:100,revisions:0,later_label_seen:true,closure_verified:true,strategy_eligible:true}))};
  writeFileSync(join(f.runtime,'minute-audit/000001.json'),JSON.stringify(audit));
  f.saved.data.closure_verified=true;f.saved.data.rows[0].closure_verified=true;writeFileSync(join(f.runtime,'minute-cache/000001.json'),JSON.stringify(f.saved));
  const detail=f.policy.detail('000001',f.status);assert.equal(detail.evidence_available,2);assert.equal(detail.verified_closed_bars,0);
  assert.equal(detail.labels[0].evidence.unchanged_observations,100);assert.equal(detail.labels[0].closure_verified,false);
  const strategy=f.policy.strategy('000001',f.status);assert.equal(strategy.available,false);assert.deepEqual(strategy.bars,[]);assert.ok(strategy.blocking_codes.includes('closure_rule_unverified'));
});
test('audit evidence must match the exact source basis version run and receipt',()=>{
  for(const [key,value]of [['source','eastmoney.minute'],['adjust','qfq'],['version','wrong'],['run_id','other'],['received_at','2026-11-25T10:01:11+08:00']]){
    const f=fixture();const audit={version:f.data.version,run_id:f.saved.run_id,received_at:f.saved.received_at,source:f.data.source,adjust:'none',bar_evidence:[{label:f.data.rows[0].time,observations:2}],[key]:value};
    writeFileSync(join(f.runtime,'minute-audit/000001.json'),JSON.stringify(audit));assert.equal(f.policy.detail('000001',f.status).evidence_available,0);
  }
});
test('all-pool summaries are bounded and detailed labels only appear in selected-stock response',()=>{
  const f=fixture();const summary=f.policy.summary(f.status);assert.equal(summary.total,1);assert.deepEqual(summary.sample_codes,['000001']);
  assert.equal(summary.stocks[0].labels,undefined);assert.equal(summary.strategy_eligible_stocks,0);assert.equal(f.policy.detail('000001',f.status).labels.length,2);
  assert.equal(f.policy.detail('../bad',f.status),null);assert.equal(f.policy.strategy('000002',f.status),null);
});
test('new quote or new receipt cannot make cached old minute data ready',()=>{
  const f=fixture();f.status.minutes[0].current_ok=false;f.status.minutes[0].cached=true;
  const result=f.policy.detail('000001',f.status);assert.equal(result.time_state,'cached');assert.ok(result.blocking_codes.includes('not_current_collection'));
  assert.equal(result.received_at,f.saved.received_at);assert.equal(result.available,false);
});
test('future receipt historical dates and off-session samples remain blocked',()=>{
  const f=fixture();f.setNow('2026-11-25T10:01:00+08:00');assert.equal(f.policy.detail('000001',f.status).time_state,'invalid_time');
  f.setNow('2026-11-26T10:01:15+08:00');assert.equal(f.policy.detail('000001',f.status).time_state,'historical');
  f.setNow('2026-11-25T20:00:00+08:00');f.status.current_context='market_closed';assert.equal(f.policy.detail('000001',f.status).time_state,'off_session');
});
test('missing and corrupt caches stay blocked and readers never write to the market cache',()=>{
  const f=fixture();const path=join(f.runtime,'minute-cache/000001.json'),before=readFileSync(path,'utf8');
  f.policy.summary(f.status);f.policy.strategy('000001',f.status);assert.equal(readFileSync(path,'utf8'),before);
  writeFileSync(path,'invalid json');assert.ok(f.policy.detail('000001',f.status).blocking_codes.includes('cache_unreadable'));
  f.status.minute_codes=['000002'];assert.ok(f.policy.detail('000002',f.status).blocking_codes.includes('missing_series'));
});
test('underlying cache version changes immediately invalidate current-series alignment',()=>{
  const f=fixture();f.policy.summary(f.status);f.saved.data.version='new-version';writeFileSync(join(f.runtime,'minute-cache/000001.json'),JSON.stringify(f.saved));
  const next=f.policy.detail('000001',f.status);assert.equal(next.version,'new-version');assert.ok(next.blocking_codes.includes('cache_version_mismatch'));assert.equal(next.current_collection,false);
});
