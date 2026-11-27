import {chinaTime,duration} from './market-data.js';

export function renderIntradayLanes(panel,status,now=new Date(),connected=true){
  const root=panel.querySelector('[data-intraday="lanes"]');if(!root)return;
  root.replaceChildren();
  if(!status.split_collection){root.hidden=true;return;}root.hidden=false;
  for(const [kind,title]of [['quote','报价与盘口'],['minute','分钟K线样本']]){
    const lane=status.lanes?.[kind]||{},card=document.createElement('article');card.className='split-lane-card';
    const heading=document.createElement('h3');heading.textContent=title;card.append(heading);
    const line=text=>{const p=document.createElement('p');p.textContent=text;card.append(p);};
    const state={running:'正在采集',sample_available:'已返回样本',failed:'本次未完成',not_started:'等待首次分流采集'}[lane.state]||lane.state||'等待状态';
    line(`${connected?state:'连接中断，保留上次状态'} · 本次已获取${lane.coverage||0}/${lane.total||0}只 · 时效合格${lane.fresh||0}只`);
    line(`更新目标${lane.target_seconds||'—'}秒 · 当前间隔${lane.interval_seconds||'—'}秒 · ${lane.trigger==='automatic'?'自动':lane.trigger==='manual'?'手动':'尚未触发'} · 本次耗时${duration(lane.elapsed_seconds)}`);
    line(`来源时间：${chinaTime(lane.oldest_source_time)}—${chinaTime(lane.latest_source_time)}`);
    const age=lane.oldest_source_time?Math.max(0,(now-Date.parse(lane.oldest_source_time))/1000):null;
    line(`最旧来源时间距今${duration(age)} · 最近接收${chinaTime(lane.last_received_at)} · 页面同步${chinaTime(status.displayed_at)}`);
    line(`本池本日自动完成${lane.automatic_runs||0}轮 · 管理库配置v${lane.configured_pool_version||'—'} / 采集v${lane.running_pool_version||'—'}${lane.pool_pending?'，等待新名单采集':''}`);
    if(!connected)line('连接恢复后确认后台状态。');
    else if(!status.automatic_enabled)line('自动更新已暂停，当前任务可完成。');
    else if(status.current_context!=='trading')line('当前为休市样本，等待交易时段；不将盘后响应速度作为实时达标证据。');
    else line(lane.state==='running'?'本类型运行中，另一类型独立调度。':`下次本类型采集：${chinaTime(lane.next_start_at)||'等待后台安排'}`);
    if(lane.error)line(lane.error);
    if(lane.slow)line('本类型超过更新目标，已延长自身间隔；另一类型继续按自己的节奏运行。');
    if(kind==='minute')line('这里只显示分钟样本；是否已闭合仍待验证。');
    root.append(card);
  }
}
