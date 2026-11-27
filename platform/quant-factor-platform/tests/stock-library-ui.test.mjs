import assert from 'node:assert/strict';
import test from 'node:test';
import {mountStockLibrary} from '../assets/stock-library.js';

async function fixture(run){
  const fields=new Map(),calls=[],old={document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
  const element=()=>({textContent:'',value:'',children:[],attrs:{},handlers:{},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.handlers[k]=f;}});
  const panel={querySelector(selector){const name=selector.match(/"([^"]+)"/)[1];if(!fields.has(name))fields.set(name,element());return fields.get(name);}};
  const stocks=[{code:'000001',name:'平安银行',daily:true,quote:true,minute:true,audit:false,priority:1},
    {code:'600519',name:'贵州茅台',daily:false,quote:false,minute:false,audit:false,priority:1}];
  let version=1,preparation={state:'checked',enabled:true,quiet_time:true,coverage:{total:1,checked:1,failed:0,queued:0},message:'fixture'};
  stocks[0].availability={daily_cache:true,daily_history:{current:true,rows:700,as_of:'2026-11-23',fresh:false}};
  globalThis.document={querySelector:()=>panel,createElement:element};globalThis.setInterval=()=>0;
  globalThis.fetch=async(url,options)=>{
    const body=options?JSON.parse(options.body):null;calls.push({url,body});
    let result={version,stocks,versions:[version],note:'fixture',history_preparation:preparation};
    if(body?.action==='prepare-history')result={accepted:true};
    if(body?.action==='review-daily-gaps')result={accepted:true};
    if(body?.action==='history-automatic'){preparation={...preparation,enabled:body.enabled};result=preparation;}
    if(body?.action==='preview')result={stocks:body.stocks,changes:[{code:'600519',name:'贵州茅台',fields:['quote'],before:stocks[1],after:body.stocks[1]}],next_version:version+1,counts:{daily:1,quote:2,minute:1}};
    if(body?.action==='save'){version++;stocks.splice(0,stocks.length,...body.stocks);result={changed:true};}
    return{ok:true,json:async()=>result};
  };
  try{const controller=mountStockLibrary();await new Promise(resolve=>setImmediate(resolve));await run({fields,calls,controller,preparation});}finally{Object.assign(globalThis,old);}
}
test('management UI loads counts, dependency switches and previews before saving',async()=>fixture(async({fields,calls})=>{
  assert.match(fields.get('summary').textContent,/管理库2只/);
  const row=fields.get('rows').children[1],quote=row.children[3].children[0];quote.checked=true;quote.handlers.change();
  assert.equal(fields.get('apply').disabled,true);
  await fields.get('preview').handlers.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fields.get('apply').disabled,false);assert.match(fields.get('message').textContent,/当前采集轮不改变/);
  await fields.get('apply').handlers.click();assert.ok(calls.some(call=>call.body?.action==='save'));
  assert.match(fields.get('message').textContent,/下一轮采集使用/);
}));
test('batch imports remain inactive and duplicate codes never silently overwrite',async()=>fixture(async({fields})=>{
  fields.set('import',{value:'600036,招商银行'});fields.get('add').handlers.click();
  assert.match(fields.get('summary').textContent,/管理库3只/);assert.match(fields.get('message').textContent,/默认不采集/);
  fields.get('import').value='600036,重复名称';fields.get('add').handlers.click();assert.match(fields.get('message').textContent,/已在管理库/);
  assert.match(fields.get('summary').textContent,/管理库3只/);
}));
test('hidden stock manager does not fetch until selected',async()=>{
  const old=globalThis.document,oldInterval=globalThis.setInterval,oldFetch=globalThis.fetch;let calls=0;
  const node={addEventListener(){}};
  globalThis.document={querySelector:()=>({querySelector:()=>node})};globalThis.setInterval=()=>0;globalThis.fetch=()=>{calls++;throw Error('unexpected');};
  try{mountStockLibrary({isVisible:()=>false});assert.equal(calls,0);}finally{globalThis.document=old;globalThis.setInterval=oldInterval;globalThis.fetch=oldFetch;}
});
test('history UI separates checked old history from up-to-date daily data',async()=>fixture(async({fields})=>{
  assert.match(fields.get('preparation').textContent,/已校验1\/1/);
  const status=fields.get('rows').children[0].children[7].textContent;
  assert.match(status,/历史校验700条/);assert.match(status,/日线待更新/);assert.doesNotMatch(status,/日期已达标/);
}));
test('preparation uses saved version and is blocked while a stock edit is unsaved',async()=>fixture(async({fields,calls})=>{
  await fields.get('prepare').handlers.click();
  assert.ok(calls.some(call=>call.body?.action==='prepare-history'&&call.body.expected_version===1));
  const checkbox=fields.get('rows').children[1].children[3].children[0];checkbox.checked=true;checkbox.handlers.change();
  const before=calls.length;await fields.get('prepare').handlers.click();assert.equal(calls.length,before);assert.equal(fields.get('prepare').disabled,true);
}));
test('pausing historical preparation preserves unsaved stock edits',async()=>fixture(async({fields,calls})=>{
  const checkbox=fields.get('rows').children[1].children[3].children[0];checkbox.checked=true;checkbox.handlers.change();
  await fields.get('history-toggle').handlers.click();
  assert.ok(calls.some(call=>call.body?.action==='history-automatic'&&call.body.enabled===false));
  assert.match(fields.get('summary').textContent,/草稿未保存/);assert.equal(fields.get('prepare').disabled,true);
}));
test('gap view exposes dates and source failures, and excludes stale candidates from totals',async()=>fixture(async({fields,controller,preparation})=>{
  const stock={code:'000001',name:'fixture',state:'candidate_review',current:true,missing_dates:['2026-11-19'],checked_at:'2026-11-24',
    dates:[{state:'candidate_available'}],observations:[{source:'tencent',state:'observed',found_dates:['2026-11-19'],absent_dates:[],price_conflict_dates:['2026-11-18'],zero_volume_dates:[]},{source:'eastmoney',state:'unavailable',reason:'ProxyError'}]};
  preparation.gap_review={state:'reviewed',suspect_stocks:1,budget:{attempts:2,limit:12},stocks:[stock]};
  await controller.refresh();assert.match(fields.get('gap-summary').textContent,/找到候选1个日期/);
  const text=fields.get('gap-details').children[0].children.map(n=>n.textContent).join(' ');
  assert.match(text,/2026-11-19/);assert.match(text,/ProxyError/);assert.match(text,/价格差异1个日期/);
  stock.current=false;stock.state='stale';await controller.refresh();assert.match(fields.get('gap-summary').textContent,/找到候选0个日期/);
}));
test('gap review uses saved version and rejects an unsaved edit locally',async()=>fixture(async({fields,calls})=>{
  await fields.get('review-gaps').handlers.click();assert.ok(calls.some(c=>c.body?.action==='review-daily-gaps'&&c.body.expected_version===1));
  const box=fields.get('rows').children[1].children[3].children[0];box.checked=true;box.handlers.change();
  const count=calls.length;await fields.get('review-gaps').handlers.click();assert.equal(calls.length,count);assert.equal(fields.get('review-gaps').disabled,true);
}));
