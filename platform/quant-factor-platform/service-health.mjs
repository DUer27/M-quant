import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export function projectIdentity(projectRoot){return createHash('sha256').update(resolve(projectRoot).replaceAll('\\','/').toLowerCase()).digest('hex');}
export function createServiceHealth({projectRoot,collector=()=>({}),now=()=>new Date(),pid=process.pid}){
  const identity={service:'quant-factor-platform',project_id:projectIdentity(projectRoot),instance_id:randomUUID(),pid,started_at:now().toISOString()};
  const runtime=join(projectRoot,'outputs/live-market-data/service');
  function read(name,fallback){try{return JSON.parse(readFileSync(join(runtime,name),'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}}
  function probe(){return {ok:true,...identity,at:now().toISOString(),collector:collector()};}
  function summary(){
    const saved=read('supervisor-status.json',null),age=saved?(now()-Date.parse(saved.heartbeat_at))/1000:null;
    const fresh=Number.isFinite(age)&&age>=-5&&age<=35;
    const matching=saved?.project_id===identity.project_id;
    const events=read('supervisor-events.json',[]);
    return {schema:'service-health.v1',server:{...identity,at:now().toISOString()},
      supervisor:{state:matching?saved.state:'not_managed',fresh:matching&&fresh,heartbeat_at:matching?saved.heartbeat_at:null,
        managed:!!(matching&&fresh&&saved.enabled),mode:matching?saved.mode:null,next_retry_at:matching?saved.next_retry_at:null,
        restart_count_window:matching?saved.restart_count_window||0:0,last_error:matching?saved.last_error||'':''},
      events:matching&&Array.isArray(events)?events.slice(-8).reverse():[],
      note:'守护存活不代表行情来源成功；服务停止时网页只能提示连接中断，恢复后显示已保存事件。'};
  }
  return {probe,summary};
}
