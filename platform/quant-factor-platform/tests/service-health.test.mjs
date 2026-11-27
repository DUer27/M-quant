import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServiceHealth,projectIdentity} from '../service-health.mjs';
import {serviceModel,renderServiceHealth} from '../assets/service-health.js';

function fixture(){const root=mkdtempSync(join(tmpdir(),'service-health-')),dir=join(root,'outputs/live-market-data/service');mkdirSync(dir,{recursive:true});
  let now=new Date('2026-11-26T14:00:00Z'),collectorCalls=0;
  const health=createServiceHealth({projectRoot:root,now:()=>now,collector:()=>{collectorCalls++;return {scheduler_last_tick_at:now.toISOString()};}});
  const save=(file,value)=>writeFileSync(join(dir,file),JSON.stringify(value));
  return {root,dir,health,save,setNow:value=>{now=new Date(value);},calls:()=>collectorCalls};}

test('probe carries process identity and lightweight heartbeat without market status or archive reads',()=>{
  const f=fixture(),probe=f.health.probe();assert.equal(probe.ok,true);assert.equal(probe.project_id,projectIdentity(f.root));
  assert.ok(probe.instance_id);assert.equal(f.calls(),1);assert.ok(Buffer.byteLength(JSON.stringify(probe))<4096);
  assert.equal(f.health.summary().supervisor.managed,false);assert.equal(f.calls(),1);
});
test('stale mismatched and future supervisor heartbeats cannot appear managed',()=>{
  const f=fixture(),state={state:'healthy',enabled:true,project_id:projectIdentity(f.root),heartbeat_at:'2026-11-26T14:00:00Z'};
  f.save('supervisor-status.json',state);assert.equal(f.health.summary().supervisor.managed,true);
  f.setNow('2026-11-26T14:01:00Z');assert.equal(f.health.summary().supervisor.managed,false);
  f.setNow('2026-11-26T13:59:00Z');assert.equal(f.health.summary().supervisor.fresh,false);
  f.save('supervisor-status.json',{...state,project_id:'different'});assert.equal(f.health.summary().supervisor.state,'not_managed');
});
test('event summaries are bounded and corrupt events do not fail the collection summary',()=>{
  const f=fixture();f.save('supervisor-status.json',{state:'healthy',enabled:true,project_id:projectIdentity(f.root),heartbeat_at:'2026-11-26T14:00:00Z'});
  f.save('supervisor-events.json',Array.from({length:120},(_,id)=>({id})));assert.equal(f.health.summary().events.length,8);assert.equal(f.health.summary().events[0].id,119);
  f.save('supervisor-events.json',{});assert.deepEqual(f.health.summary().events,[]);
});
test('connected source warnings, manual stop and missing protection have distinct meanings',()=>{
  const value={supervisor:{fresh:true,state:'healthy',mode:'owned'}};
  assert.equal(serviceModel(value).tone,'healthy');assert.equal(serviceModel(value,false).tone,'error');
  value.supervisor.state='collection_warning';assert.match(serviceModel(value).description,/不通过重启掩盖来源问题/);
  value.supervisor.state='stopped';assert.equal(serviceModel(value).tone,'paused');
  value.supervisor.state='healthy';value.supervisor.fresh=false;assert.match(serviceModel(value).title,/心跳/);
  assert.match(serviceModel(null).title,/尚未接通/);
});
test('service panel preserves warning and recovery history without implying closed minute data',()=>{
  const old=globalThis.document,fields=new Map(),element=()=>({children:[],textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){this.children=[];},append(v){this.children.push(v);}});
  globalThis.document={createElement:element};const panel={querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];if(!fields.has(key))fields.set(key,element());return fields.get(key);}};
  try{renderServiceHealth(panel,{supervisor:{fresh:true,state:'restart_limited',next_retry_at:'2026-11-26T14:05:00Z'},events:[{at:'2026-11-26T14:00:00Z',message:'平台服务已恢复'}]});
    assert.match(fields.get('state').textContent,/启动保护/);assert.match(fields.get('retry').textContent,/预计重试/);
    assert.match(fields.get('events').children[0].textContent,/服务已恢复/);
    renderServiceHealth(panel,null,false);assert.equal(fields.get('card').attrs['data-tone'],'error');
  }finally{globalThis.document=old;}
});
