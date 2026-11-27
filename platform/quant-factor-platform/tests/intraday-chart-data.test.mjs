import test from 'node:test';
import assert from 'node:assert/strict';
import {changePercent,chinaDay,poolSnapshot,sampleAverages,timingSeries} from '../assets/intraday-chart-data.js';

const at='2026-11-26T14:00:00+08:00';
const q=(code,last=10,extra={})=>({code,last,previous_close:10,source:'sina.quote',source_time:at,amount_yuan:100,...extra});

test('pool statistics isolate source, date and stock pool and never double-count duplicates',()=>{
  const status={codes:['000001','000063','600519','600036'],quotes:[q('000001',11),q('000001',11),q('000063',9),
    q('600519',10,{source_time:'2026-11-25T15:00:00+08:00'}),q('000001',20,{source:'tencent.quote',amount_yuan:99999}),q('999999',12)]};
  const result=poolSnapshot(status,'sina.quote');assert.equal(result.quotes.length,3);assert.equal(result.sameDay.length,2);
  assert.equal(result.up,1);assert.equal(result.down,1);assert.equal(result.flat,0);assert.equal(result.unknown,2);
  assert.equal(result.turnover,200);assert.equal(result.amountCount,2);assert.equal(result.otherDay,1);
  assert.ok(Math.abs(result.median)<1e-8);
});

test('missing or zero prices and absent baselines stay unknown instead of flat',()=>{
  assert.equal(changePercent({last:0,previous_close:10}),null);
  const result=poolSnapshot({codes:['a','b','c'],quotes:[q('a',10,{previous_close:undefined}),q('b',0),q('c',10)]},'sina.quote');
  assert.equal(result.unknown,2);assert.equal(result.flat,1);assert.equal(result.valid.length,1);
});

test('empty turnover is missing while a genuine zero remains numeric',()=>{
  assert.equal(poolSnapshot({codes:['a'],quotes:[q('a',10,{amount_yuan:undefined})]},'sina.quote').turnover,null);
  assert.equal(poolSnapshot({codes:['a'],quotes:[q('a',10,{amount_yuan:0})]},'sina.quote').turnover,0);
});

test('breadth buckets keep edge values in a single bin',()=>{
  const values=[-6,-5,-2.5,-2,-.5,0,.5,2,5,6];
  const result=poolSnapshot({codes:values.map((_,i)=>String(i)),quotes:values.map((pct,i)=>q(String(i),10*(1+pct/100)))},'sina.quote');
  assert.equal(result.bins.reduce((a,b)=>a+b,0),values.length);assert.equal(result.flat,1);
  assert.deepEqual(result.bins,[2,1,2,1,1,1,2]);
});

test('sample average uses yuan divided by shares, not average closing prices',()=>{
  const values=sampleAverages([{close:50,volume_shares:100,amount_yuan:1000},{close:70,volume_shares:300,amount_yuan:6000}]);
  assert.equal(values[0].average,10);assert.equal(values[1].average,17.5);
  assert.deepEqual(sampleAverages([{close:10,volume_shares:100}]),[]);
  assert.deepEqual(sampleAverages([{volume_shares:0,amount_yuan:10}]),[]);
  assert.equal(sampleAverages([{volume_shares:0,amount_yuan:0}])[0].average,null);
});

test('Beijing calendar day is used for timezone-equivalent source timestamps',()=>{
  assert.equal(chinaDay('2026-11-25T16:01:00Z'),'2026-11-26');assert.equal(chinaDay('bad'),null);
});

test('interrupted downtime stays visible but cannot flatten measured-duration statistics',()=>{
  const history=[{elapsed_seconds:1,complete:true},{elapsed_seconds:31,complete:true},
    {elapsed_seconds:27482,run_id:null,error:'上次独立任务中断；保留缓存，等待重试'},
    {elapsed_seconds:180,complete:false,error:'实际任务超时'}];
  const result=timingSeries(history,60);assert.equal(result.slots.length,4);assert.equal(result.excluded,1);
  assert.equal(result.p50,31);assert.equal(result.p95,180);assert.equal(result.slots[2].interrupted,true);
});
