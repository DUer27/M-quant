import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMinuteFormation} from '../assets/intraday-formation.js';

const element=()=>({textContent:'',children:[],handlers:{},append(...items){this.children.push(...items);},addEventListener(key,handler){this.handlers[key]=handler;}});
const allText=node=>[node.textContent,...(node.children||[]).map(allText)].join(' ');

test('formation panel exposes revisions and boundaries without claiming closed bars',()=>{
  const old=globalThis.document;globalThis.document={createElement:element};
  try{
    const root=element(),at='2026-11-26T10:01:10+08:00';
    renderMinuteFormation(root,{note:'60秒采样不能还原完整形成过程',sources:[{source:'sina.minute',observations:2,label_advances:1,label_stagnations:0,label_regressions:0,
      overlap_comparisons:2,revision_comparisons:1,revisions_after_later_label:1,last_received_at:at,boundary_observations:{'09:30':2},
      recent_labels:[{label:at,first_seen_at:at,last_seen_at:at,observations:2,revisions:1,later_label_seen:true,values:{open:10,high:11,low:9,close:10.5,volume_shares:200,amount_yuan:2000}}],
      recent_changes:[{label:at,received_at:at,fields:['close'],previous:{close:10},current:{close:10.5},after_later_label_observed:true}]}]});
    const text=allText(root);assert.match(text,/已见后续标签后修订1次/);assert.match(text,/11:30 未见/);
    assert.match(text,/未见不等于缺失/);assert.match(text,/闭合待验证/);assert.match(text,/收 10 → 10.5/);
    assert.match(text,/成交量（股）/);assert.match(text,/60秒采样/);
  }finally{globalThis.document=old;}
});

test('missing or import-only formation explains evidence absence without network calls',()=>{
  const old=globalThis.document;globalThis.document={createElement:element};
  try{const root=element();renderMinuteFormation(root,null);assert.equal(root.children.length,0);
    renderMinuteFormation(root,{sources:[]});assert.match(allText(root),/尚无可比较的真实盘中记录/);
  }finally{globalThis.document=old;}
});

test('automatic panel refresh preserves an expanded comparison table',()=>{
  const old=globalThis.document;globalThis.document={createElement:element};
  try{
    const formation={day:'2026-11-26',code:'600519',sources:[{source:'sina.minute',adjust:'none'}]},first=element();
    renderMinuteFormation(first,formation);const details=first.children.at(-1);details.open=true;details.handlers.toggle();
    const next=element();renderMinuteFormation(next,formation);assert.equal(next.children.at(-1).open,true);
  }finally{globalThis.document=old;}
});
