import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinuteLoader } from '../assets/intraday-minute-loader.js';
const result = (code, version, received_at = '2026-11-24T10:00:00Z') => ({ code, received_at, data: { version, source: 'fixture.minute', rows: [{ close: 10 }] } });
test('only selected stock is fetched, unchanged version reuses its series', async () => {
  const requests = [];
  const loader = createMinuteLoader(async (url) => { requests.push(url); return { ok: true, json: async () => result('000001','v1') }; });
  await loader.load('000001','v1'); await loader.load('000001','v1');
  assert.equal(requests.length, 1); assert.match(requests[0], /code=000001/);
  const status = { minutes: [{ code: '000001', data: { version: 'v1' }, current_ok: true }, { code: '000063', data: { version: 'v2' } }] };
  const attached = loader.attach(status,'000001');
  assert.equal(attached.minutes[0].data.rows.length,1); assert.equal(attached.minutes[1].data.rows,undefined);
});
test('in-flight requests deduplicate and failed update retains previous graph with cache flag', async () => {
  let requests = 0, fail = false;
  const loader = createMinuteLoader(async () => { requests++; return { ok: !fail, json: async () => result('000001','v1') }; });
  await Promise.all([loader.load('000001','v1'),loader.load('000001','v1')]);
  assert.equal(requests,1); fail=true; await loader.load('000001','v2');
  const data=loader.attach({minutes:[{code:'000001',data:{version:'v2'},current_ok:true,fresh:true,
    received_at:'2026-11-24T10:02:00Z',run_id:'new'}]},'000001').minutes[0];
  assert.equal(data.cached,true); assert.equal(data.current_ok,false); assert.equal(data.data.version,'v1');
  assert.equal(data.fresh,false); assert.equal(data.received_at,'2026-11-24T10:00:00Z');
  assert.notEqual(data.run_id,'new');
  assert.match(loader.error('000001'),/保留/);
});
test('a late old response cannot replace newer minute data', async () => {
  const resolves=[];
  const loader=createMinuteLoader(() => new Promise(resolve=>resolves.push(resolve)));
  const old=loader.load('000001','old'), fresh=loader.load('000001','new');
  await Promise.resolve();
  resolves[1]({ok:true,json:async()=>result('000001','new','2026-11-24T10:02:00Z')});await fresh;
  resolves[0]({ok:true,json:async()=>result('000001','old','2026-11-24T10:01:00Z')});await old;
  assert.equal(loader.attach({minutes:[{code:'000001',data:{version:'new'}}]},'000001').minutes[0].data.version,'new');
});
