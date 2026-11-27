import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBackfill } from '../assets/intraday-backfill.js';

function render(status) {
  const old=globalThis.document,fields=new Map();
  const element=()=>({textContent:'',children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}});
  globalThis.document={createElement:element};
  const panel={querySelector(selector){const name=selector.match(/"([^"]+)"/)[1];if(!fields.has(name))fields.set(name,element());return fields.get(name);}};
  try{renderBackfill(panel,status);return fields;}finally{globalThis.document=old;}
}
test('empty backfill queue is honest and never invents a recovery job',()=>{
  const fields=render({current_context:'market_closed',backfill:{enabled:true,counts:{}}});
  assert.match(fields.get('backfill-state').textContent,/暂无待执行任务/);
  assert.match(JSON.stringify(fields.get('backfill-tasks')),/不会人为生成补采任务/);
  assert.equal(fields.get('backfill-run').disabled,true);
});
test('unsupported history and candidate-only completion are visible and trading disables runs',()=>{
  const fields=render({current_context:'trading',backfill:{enabled:true,counts:{pending:1,needs_historical_source:1,collected_unverified:1},
    requests_today:3,max_requests_per_day:20,candidate_rows:2,tasks:[{code:'000001',source:'sina.minute',day:'2026-11-23',state:'needs_historical_source',attempts:0,message:'需历史分钟来源'}]}});
  assert.match(fields.get('backfill-state').textContent,/交易时段让路/);
  assert.match(fields.get('backfill-summary').textContent,/需历史来源1项/);assert.match(fields.get('backfill-summary').textContent,/3\/20次/);
  assert.match(JSON.stringify(fields.get('backfill-tasks')),/需要历史分钟来源/);
  assert.equal(fields.get('backfill-run').disabled,true);
});
test('preempting and paused backfill never appear as active latest collection',()=>{
  assert.match(render({backfill:{enabled:true,worker_running:true,preempting:true}}).get('backfill-state').textContent,/给最新采集让路/);
  assert.match(render({backfill:{enabled:false}}).get('backfill-state').textContent,/已暂停/);
});

test('closing-boundary review is explained separately from failure and historical tasks do not fill the default table',()=>{
  const task={code:'000001',source:'sina.minute',day:'2026-11-27',state:'needs_boundary_review',first_label:'2026-11-27T14:58:00+08:00',last_label:'2026-11-27T14:59:00+08:00',remaining_labels:2,candidate_labels:2,attempts:0};
  const fields=render({current_context:'market_closed',minute_codes:['000001'],backfill:{enabled:true,counts:{needs_boundary_review:2},tasks:[task,{...task,day:'2026-11-25'}]}});
  assert.match(fields.get('backfill-state').textContent,/非失败|无失败重试/);assert.match(fields.get('backfill-explanation').textContent,/不能证明/);
  assert.match(fields.get('backfill-explanation').textContent,/不表示已补回/);assert.equal(fields.get('backfill-tasks').children.length,1);
  assert.equal(fields.get('backfill-tasks').children[0].children[3].textContent,'14:58—14:59');assert.match(fields.get('backfill-list-scope').textContent,/1\/2/);
  assert.equal(fields.get('backfill-run').disabled,true);
});

test('older actionable jobs and errors remain visible even under the latest-day filter',()=>{
  const fields=render({current_context:'market_closed',backfill:{enabled:true,worker_error:'fixture worker failed',counts:{needs_boundary_review:1,needs_review:1},
    tasks:[{code:'000001',day:'2026-11-27',state:'needs_boundary_review'},{code:'000001',day:'2026-11-25',state:'needs_review'}]}});
  assert.equal(fields.get('backfill-tasks').children.length,2);assert.match(fields.get('backfill-state').textContent,/需检查/);
  assert.match(fields.get('backfill-note').textContent,/worker failed/);
});
