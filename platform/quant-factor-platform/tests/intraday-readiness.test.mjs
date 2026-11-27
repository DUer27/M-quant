import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMinuteReadiness} from '../assets/intraday-readiness.js';

async function fixture(run){
  const old={document:globalThis.document,fetch:globalThis.fetch},fields=new Map(),calls=[];
  const element=()=>({value:'',textContent:'',children:[],handlers:{},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},addEventListener(k,f){this.handlers[k]=f;}});
  const panel={querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];if(!fields.has(key))fields.set(key,element());return fields.get(key);}};
  const stock={code:'000001',version:'v1',run_id:'a',received_at:'2026-11-25T10:01:10+08:00',time_state:'current',evidence_available:1,current_collection:true,
    observation_rows:2,counts:{possible_forming:1,closure_unverified:1},suspected_missing_labels:0};
  const status={minute_readiness:{total:1,observation_stocks:1,strategy_eligible_stocks:0,verified_closed_bars:0,suspected_gap_stocks:0,sample_codes:['000001'],stocks:[stock],note:'fixture'}};
  let visible=true,responder=async()=>({ok:true,json:async()=>({...stock,blocking_codes:['closure_rule_unverified'],labels_total:2,labels:[{label:'2026-11-25T10:01:00+08:00',state:'possible_forming',evidence:{observations:2,unchanged_observations:2,revisions:0,later_label_seen:false}}],gaps:[]})});
  globalThis.document={createElement:element};globalThis.fetch=async url=>{calls.push(url);return responder(url);};
  try{await run({fields,calls,status,stock,controller:mountMinuteReadiness(panel,{isVisible:()=>visible}),setVisible:v=>{visible=v;},setResponder:r=>{responder=r;}});}finally{Object.assign(globalThis,old);}
}
test('quality panel exposes per-label evidence without claiming closed or strategy-ready',async()=>fixture(async f=>{
  await f.controller.render(f.status);assert.match(f.fields.get('readiness-summary').textContent,/可供策略使用0只/);assert.equal(f.calls.length,1);
  const details=f.fields.get('readiness-details');assert.match(details.children[1].textContent,/来源闭合规则未确认/);
  const table=details.children.find(n=>n.children?.[0]?.children?.length===7);assert.ok(table);assert.match(table.children[1].children[1].textContent,/可能形成中/);
  assert.equal(table.children[1].children.at(-1).textContent,'暂不可用');
}));
test('hidden quality panel and unchanged version do not repeat detailed requests',async()=>fixture(async f=>{
  f.setVisible(false);await f.controller.render(f.status);assert.equal(f.calls.length,0);
  f.setVisible(true);await f.controller.render(f.status);await f.controller.render(f.status);assert.equal(f.calls.length,1);
}));
test('a failed or mismatched detail response cannot be shown as current readiness',async()=>fixture(async f=>{
  f.setResponder(async()=>({ok:true,json:async()=>({...f.stock,version:'old',labels:[]})}));await f.controller.render(f.status);
  assert.match(f.fields.get('readiness-error').textContent,/版本正在切换/);
  f.setResponder(async()=>({ok:false}));await f.controller.render(f.status);assert.match(f.fields.get('readiness-error').textContent,/无法读取/);
}));
test('empty audit selection explains how to select samples and issues no detail request',async()=>fixture(async f=>{
  f.status.minute_readiness.sample_codes=[];await f.controller.render(f.status);assert.equal(f.calls.length,0);assert.match(f.fields.get('readiness-error').textContent,/最多3只/);
}));
test('overlapping refreshes reuse an in-flight detail request',async()=>fixture(async f=>{
  let release;const wait=new Promise(resolve=>{release=resolve;});
  f.setResponder(async()=>{await wait;return {ok:true,json:async()=>({...f.stock,blocking_codes:[],labels:[],labels_total:0,gaps:[]})};});
  const first=f.controller.render(f.status),second=f.controller.render(f.status);
  assert.equal(f.calls.length,1);release();await Promise.all([first,second]);assert.equal(f.calls.length,1);
}));
test('source review displays paused capture and imported observations without claiming live proof',async()=>fixture(async f=>{
  f.status.minute_source_verification={day:'2026-11-25',deliveries:1,intraday_deliveries:0,automatic_enabled:false,
    references:[{title:'交易所规则',url:'https://www.sse.com.cn'}],remaining_evidence:['标签含义'],
    stocks:[{code:'000001',deliveries:1,intraday_deliveries:0,recent:[{received_at:'2026-11-25T15:30:00+08:00',source:'sina.minute',receipt_phase:'outside_session',origin:'imported_saved_delivery',last_label:'2026-11-25T15:00:00+08:00',stored_labels:12}]}]};
  await f.controller.render(f.status);assert.match(f.fields.get('source-review-summary').textContent,/自动采集当前暂停/);assert.match(f.fields.get('source-review-summary').textContent,/有效盘中观测0份/);
  assert.match(f.fields.get('source-review-records').children[1].textContent,/导入，非新盘中观测/);
  assert.equal(f.fields.get('source-review-references').children[0].children[0].href,'https://www.sse.com.cn');
}));
