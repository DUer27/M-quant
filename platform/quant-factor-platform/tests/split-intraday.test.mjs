import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createIntradayTrial} from '../intraday-trial.mjs';
import {laneQuality} from '../split-intraday.mjs';

function fixture(automatic=true){
  const root=mkdtempSync(join(tmpdir(),'split-intraday-')),platform=join(root,'platform/quant-factor-platform'),runtime=join(root,'outputs/live-market-data/intraday-trial');
  mkdirSync(join(platform,'config'),{recursive:true});mkdirSync(runtime,{recursive:true});
  const config={automatic_enabled:automatic,codes:['000001'],minute_codes:['000001'],minute_audit_codes:[],pool_version:2,
    split_collection:{enabled:true,quote_interval_seconds:15,minute_interval_seconds:60}};
  writeFileSync(join(platform,'config/intraday-trial.json'),JSON.stringify(config));
  writeFileSync(join(root,'outputs/live-market-data/calendar.json'),JSON.stringify({dates:['2026-11-25','2026-11-26']}));
  let clock=new Date('2026-11-25T02:00:00Z');const calls=[];
  const options={projectRoot:root,platformRoot:platform,python:'fixture',now:()=>clock,spawnProcess:(...args)=>{
    const child=new EventEmitter();child.kill=()=>{child.killed=true;};calls.push({args,child,kind:args[1]?.[args[1].indexOf('--lane')+1]});return child;}};
  const controller=createIntradayTrial(options);
  function publish(kind,run='new-'+kind,sourceTime=clock.toISOString(),pool_version=2){
    const row={code:'000001',source:'sina.quote',source_time:sourceTime,last:10,bids:[],asks:[],name:'fixture'};
    const minute={code:'000001',source:'sina.minute',source_time:sourceTime,count:1,version:run,rows:[{time:sourceTime,close:10}],closure_verified:false};
    const data=kind==='quote'?[row]:minute;
    const report={lane:kind,run_id:run,state:'sample_available',pool_version,codes:['000001'],minute_codes:kind==='quote'?[]:['000001'],
      finished_at:clock.toISOString(),started_at:clock.toISOString(),elapsed_seconds:1,coverage:{quotes:kind==='quote'?1:0,minutes:kind==='minute'?1:0,total:1},
      rounds:[{checks:[{kind,source:'sina',stage:'initial',ok:true,selected:true,code:kind==='minute'?'000001':undefined,data,received_at:clock.toISOString()}]}]};
    const target=kind==='quote'?join(runtime,'quote-lane'):runtime;
    writeFileSync(join(target,'status.json'),JSON.stringify(report));writeFileSync(join(target,'status-light.json'),JSON.stringify(report));
    if(kind==='minute'){mkdirSync(join(runtime,'minute-cache'),{recursive:true});for(const suffix of ['.json','.meta.json'])writeFileSync(join(runtime,'minute-cache','000001'+suffix),JSON.stringify({data:minute,run_id:run,received_at:clock.toISOString()}));}
    return report;
  }
  return {root,platform,runtime,controller,calls,options,publish,setClock:v=>{clock=new Date(v);}};
}
test('quote starts again at its own cadence while the minute process remains busy',()=>{
  const f=fixture();f.controller.tick();assert.deepEqual(f.calls.map(c=>c.kind),['quote','minute']);
  f.setClock('2026-11-25T02:00:02Z');f.publish('quote');f.calls[0].child.emit('close',0);
  f.setClock('2026-11-25T02:00:15Z');f.controller.tick();assert.deepEqual(f.calls.map(c=>c.kind),['quote','minute','quote']);
  const status=f.controller.status({light:true});assert.equal(status.lanes.minute.state,'running');assert.equal(status.lanes.quote.state,'running');
  assert.equal(status.lanes.quote.run_id,null);assert.equal(status.lanes.quote.previous_run_id,'new-quote');assert.equal(status.lanes.quote.metrics,null);
});
test('minute failure and provider cooldown never postpone the healthy quote schedule',()=>{
  const f=fixture();f.controller.tick();f.publish('quote');f.calls[0].child.emit('close',0);
  writeFileSync(join(f.runtime,'provider-health.json'),JSON.stringify({'sina.minute':{blocked_until:9999999999},'eastmoney.minute':{blocked_until:9999999999}}));
  f.calls[1].child.emit('close',1);assert.equal(f.controller.status().lanes.minute.interval_seconds,120);
  assert.equal(f.controller.status().lanes.quote.interval_seconds,15);
  f.setClock('2026-11-25T02:00:15Z');f.controller.tick();assert.equal(f.calls.at(-1).kind,'quote');
});
test('manual quote refresh can run during a manual minute collection',()=>{
  const f=fixture(false);assert.equal(f.controller.start('manual','minute').accepted,true);
  assert.equal(f.controller.start('manual','quote').accepted,true);
  assert.equal(f.controller.start('manual','quote').accepted,false);
  assert.deepEqual(f.calls.map(c=>c.kind),['minute','quote']);
});
test('independent watchdog stops only the timed-out minute worker',()=>{
  const f=fixture();f.controller.tick();f.publish('quote');f.calls[0].child.emit('close',0);
  f.setClock('2026-11-25T02:03:01Z');f.controller.tick();
  assert.equal(f.calls[1].child.killed,true);assert.equal(f.calls[0].child.killed,undefined);
  assert.equal(f.calls.at(-1).kind,'quote');assert.equal(f.calls.at(-1).child.killed,undefined);
  assert.ok(f.controller.status().scheduler.notices.some(n=>n.kind==='timeout'&&n.message.includes('分钟')));
});
test('a fresh quote does not make an old minute cache current or fresh',()=>{
  const f=fixture();f.controller.start();f.publish('quote');f.publish('minute','old-minute','2026-11-24T07:00:00Z');
  f.calls[0].child.emit('close',0);f.calls[1].child.emit('close',0);
  const s=f.controller.status({light:true});assert.equal(s.lanes.quote.fresh,1);assert.equal(s.lanes.minute.fresh,0);assert.equal(s.fresh,false);
  assert.equal(s.minutes[0].received_at,'2026-11-25T02:00:00.000Z');assert.equal(s.minutes[0].data.source_time,'2026-11-24T07:00:00Z');
});
test('newer cached quote is retained when a later request returns regressed data',()=>{
  const f=fixture();f.controller.start('manual','quote');f.publish('quote','old','2026-11-25T01:59:30Z');
  const cache=join(f.runtime,'quote-lane/quote-cache');mkdirSync(cache);
  writeFileSync(join(cache,'sina-000001.json'),JSON.stringify({data:{code:'000001',source:'sina.quote',source_time:'2026-11-25T02:00:00Z',last:11},received_at:'2026-11-25T02:00:00Z',run_id:'newer'}));
  const q=f.controller.status().quotes[0];assert.equal(q.last,11);assert.equal(q.cached,true);assert.equal(q.fresh,false);
});
test('restart preserves ownership of an active lane without blocking the other lane',()=>{
  const f=fixture();f.controller.start('manual','quote');const state=JSON.parse(readFileSync(join(f.runtime,'split-schedule.json'),'utf8'));state.quote.active.pid=process.pid;
  writeFileSync(join(f.runtime,'split-schedule.json'),JSON.stringify(state));
  const restored=createIntradayTrial(f.options);assert.equal(restored.start('manual','quote').accepted,false);
  assert.equal(restored.start('manual','minute').accepted,true);
});
test('after-hours automatic work waits, manual results remain observations and validation stays deferred',()=>{
  const f=fixture();f.setClock('2026-11-25T08:00:00Z');f.controller.tick();assert.equal(f.calls.length,0);
  f.controller.start();f.publish('quote');f.calls[0].child.emit('close',0);
  const s=f.controller.status();assert.equal(s.lanes.quote.history[0].observation_only,true);assert.equal(s.lanes.quote.fresh,0);
  assert.equal(f.controller.beginValidation().accepted,false);
});
test('quality rejects missing timestamps, empty minute series and future source times',()=>{
  const now=new Date('2026-11-25T02:00:00Z');
  for(const source_time of [null,'bad','2026-11-25T02:01:00Z'])assert.equal(laneQuality({rounds:[{checks:[{kind:'quote',ok:true,data:[{code:'000001',source_time}]}]}]},'quote',['000001'],now).eligible,false);
  assert.equal(laneQuality({rounds:[{checks:[{kind:'minute',code:'000001',ok:true,data:{source_time:now.toISOString(),rows:[]}}]}]},'minute',['000001'],now).eligible,false);
});
test('pause prevents future starts while active lane results can finish',()=>{
  const f=fixture();f.controller.tick();f.controller.setAutomatic(false);
  f.publish('quote');f.publish('minute');f.calls[0].child.emit('close',0);f.calls[1].child.emit('close',0);
  f.setClock('2026-11-25T02:02:00Z');f.controller.tick();assert.equal(f.calls.length,2);assert.equal(f.controller.status().automatic_enabled,false);
});
test('pool edits keep active worker snapshots fixed and require new version data for fresh coverage',()=>{
  const f=fixture();f.controller.start();
  writeFileSync(join(f.platform,'config/stock-library.json'),JSON.stringify({id:'fixture',version:3,stocks:[{code:'600519',name:'fixture',daily:true,quote:true,minute:true,audit:false,priority:1}]}));
  f.publish('quote');f.publish('minute');
  const frozen=JSON.parse(readFileSync(f.calls[0].args[1][2],'utf8'));assert.deepEqual(frozen.codes,['000001']);
  const s=f.controller.status();assert.deepEqual(s.codes,['600519']);assert.equal(s.pool_pending,true);assert.equal(s.lanes.quote.coverage,0);assert.equal(s.fresh,false);
  f.calls[0].child.emit('close',0);f.setClock('2026-11-25T02:00:16Z');f.controller.tick();
  const next=JSON.parse(readFileSync(f.calls.at(-1).args[1][2],'utf8'));assert.equal(next.pool_version,3);assert.deepEqual(next.codes,['600519']);
});
test('independent lanes recover their target only after two fast advancing complete runs',()=>{
  const f=fixture();f.controller.tick();f.calls[0].child.emit('close',1);
  f.publish('minute');f.calls[1].child.emit('close',0);
  assert.equal(f.controller.status().lanes.quote.interval_seconds,30);
  f.setClock('2026-11-25T02:00:30Z');f.controller.tick();const first=f.calls.at(-1);assert.equal(first.kind,'quote');f.publish('quote','advance-1');first.child.emit('close',0);
  assert.equal(f.controller.status().lanes.quote.interval_seconds,30);
  f.setClock('2026-11-25T02:01:00Z');f.controller.tick();const second=f.calls.filter(c=>c.kind==='quote').at(-1);f.publish('quote','advance-2');second.child.emit('close',0);
  assert.equal(f.controller.status().lanes.quote.interval_seconds,15);
  assert.ok(f.controller.status().scheduler.notices.some(n=>n.kind==='recovered'&&n.message.includes('报价')));
});
