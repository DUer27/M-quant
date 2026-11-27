import {chinaTime} from './market-data.js';

export function serviceModel(value,connected=true){
  const supervisor=value?.supervisor;
  if(!connected)return {title:'平台连接中断',tone:'error',description:'暂时无法确认采集是否运行；保留已有显示，恢复后读取后台中断与重启记录。'};
  if(!supervisor||supervisor.state==='not_managed')return {title:'守护尚未接通',tone:'warning',description:'当前网页可连接平台，但尚不能确认异常退出后会自动恢复。'};
  if(supervisor.state==='stopped')return {title:'守护已手动停止',tone:'paused',description:'停止请求已保存，不会自动拉起；采集开关没有被更改。'};
  if(!supervisor.fresh)return {title:'守护心跳待确认',tone:'warning',description:'超过35秒未收到有效守护心跳，不能视为常驻保护正常。'};
  const messages={restart_limited:['启动保护中','15分钟内启动尝试达到上限，保留数据并等待重试时间。'],
    retry_wait:['等待恢复服务','平台异常后正在退避，避免反复启动。'],checking:['正在复查平台连接','健康检查未通过，等待连续复查后决定是否恢复。'],
    starting:['正在启动平台','启动过程尚未完成，不能据此认定行情已更新。'],needs_attention:['后台服务需检查','守护未结束未经接管的服务，请结合事件检查原因。'],
    collection_warning:['守护在线 · 采集需检查','服务与调度仍可响应，但采集缺轮或来源时间需检查；不通过重启掩盖来源问题。']};
  if(messages[supervisor.state])return {title:messages[supervisor.state][0],tone:'warning',description:supervisor.last_error||messages[supervisor.state][1]};
  if(supervisor.state!=='healthy')return {title:'守护状态待核实',tone:'warning',description:'收到尚未识别的守护状态，不能据此确认保护正常。'};
  return {title:supervisor.mode==='owned'?'后台守护在线':'守护在线 · 监测手动服务',tone:'healthy',
    description:supervisor.mode==='owned'?'独立检查平台与采集调度；异常退出后有限恢复。守护在线不代表行情来源成功。':'正在监测已有手动服务；其无响应时保留事件，不强制结束未经接管的进程。'};
}

export function renderServiceHealth(panel,value,connected=true){
  const f=name=>panel.querySelector(`[data-service="${name}"]`),model=serviceModel(value,connected);
  f('card').setAttribute('data-tone',model.tone);f('state').textContent=model.title;f('description').textContent=model.description;
  f('heartbeat').textContent=value?.supervisor?.heartbeat_at?`守护最近检查 ${chinaTime(value.supervisor.heartbeat_at)}`:'尚无守护心跳';
  f('retry').textContent=value?.supervisor?.next_retry_at?`预计重试 ${chinaTime(value.supervisor.next_retry_at)}`:'异常恢复受次数与退避限制，手动停止不会被自动撤销。';
  const root=f('events');root.replaceChildren();
  for(const event of value?.events||[]){const li=document.createElement('li');li.textContent=`${chinaTime(event.at)} · ${event.message}`;root.append(li);}
  if(!value?.events?.length){const li=document.createElement('li');li.textContent='暂无守护事件，不把缺少记录当成长期运行证明。';root.append(li);}
  return model;
}
