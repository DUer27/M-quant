import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandleLoader} from '../assets/candle-loader.js';
const data=(code='000001',period='week',pool_version=2)=>({code,period,pool_version,state:'available',rows:[{open:10}],version:'fixture'});

test('history reads only the selected stock and period, deduplicates and reuses for a minute',async()=>{
  const requests=[];let now=0,release;const wait=new Promise(resolve=>{release=resolve;});
  const loader=createCandleLoader(async url=>{requests.push(url);await wait;return {ok:true,json:async()=>data()};},()=>now);
  const first=loader.load('000001','week',2),second=loader.load('000001','week',2);await Promise.resolve();assert.equal(requests.length,1);
  release();await Promise.all([first,second]);await loader.load('000001','week',2);assert.equal(requests.length,1);
  now=60_001;await loader.load('000001','week',2);assert.equal(requests.length,2);assert.match(requests[0],/pool_version=2/);
});
test('failed refresh keeps old history marked and backs off local reads',async()=>{
  let now=0,calls=0;const loader=createCandleLoader(async()=>{calls++;if(calls>1)throw new Error('fixture disconnected');return {ok:true,json:async()=>data()};},()=>now);
  await loader.load('000001','week',2);now=60_001;await loader.load('000001','week',2);
  assert.ok(loader.view('000001','week',2).data);assert.match(loader.view('000001','week',2).error,/disconnected/);
  now++;await loader.load('000001','week',2);assert.equal(calls,2);
});
test('stale pool or different-stock responses cannot appear in the requested chart',async()=>{
  const loader=createCandleLoader(async()=>({ok:true,json:async()=>data('600519','week',1)}));
  await loader.load('000001','week',2);assert.equal(loader.view('000001','week',2).data,null);assert.match(loader.view('000001','week',2).error,/不匹配/);
});
test('week and month caches remain separate and closed periods never trigger minute downloads',async()=>{
  const urls=[],loader=createCandleLoader(async url=>{urls.push(url);return {ok:true,json:async()=>data('000001',url.includes('period=month')?'month':'week')};});
  await loader.load('000001','week',2);await loader.load('000001','month',2);
  assert.equal(loader.view('000001','week',2).data.period,'week');assert.equal(loader.view('000001','month',2).data.period,'month');
  assert.ok(urls.every(url=>url.startsWith('/market-data-api/intraday/candles?')));
});
