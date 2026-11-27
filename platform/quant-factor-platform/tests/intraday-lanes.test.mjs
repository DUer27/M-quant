import test from 'node:test';
import assert from 'node:assert/strict';
import {renderIntradayLanes} from '../assets/intraday-lanes.js';

test('lane cards distinguish active minute work, fast quotes and stale source time',()=>{
  const element=()=>({textContent:'',children:[],append(...n){this.children.push(...n);},replaceChildren(){this.children=[];}});
  const old=globalThis.document;globalThis.document={createElement:element};const root=element();
  const status={split_collection:true,automatic_enabled:true,current_context:'trading',displayed_at:'2026-11-25T02:00:05Z',lanes:{
    quote:{state:'sample_available',coverage:50,total:50,fresh:50,target_seconds:15,interval_seconds:15,elapsed_seconds:1,oldest_source_time:'2026-11-25T02:00:00Z',last_received_at:'2026-11-25T02:00:04Z'},
    minute:{state:'running',coverage:10,total:50,fresh:0,target_seconds:60,interval_seconds:120,slow:true,oldest_source_time:'2026-11-24T07:00:00Z',last_received_at:'2026-11-25T02:00:02Z'}}};
  try{renderIntradayLanes({querySelector:()=>root},status,new Date(status.displayed_at));assert.equal(root.children.length,2);
    const text=root.children.map(c=>c.children.map(p=>p.textContent).join(' '));
    assert.match(text[0],/更新目标15秒/);assert.match(text[1],/本次已获取10\/50/);assert.match(text[1],/时效合格0只/);assert.match(text[1],/是否已闭合仍待验证/);
    renderIntradayLanes({querySelector:()=>root},status,new Date(),false);assert.match(root.children[0].children.map(n=>n.textContent).join(' '),/连接中断/);
  }finally{globalThis.document=old;}
});
