import { chinaTime, duration } from './market-data.js';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'});
const sessionFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const sessionClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
function sessionDescription(at,now){
  if(!at||!Number.isFinite(Date.parse(at)))return {label:'等待后台安排',reason:'等待确认下一交易时段。'};
  const next=new Date(at),today=dayFormat.format(now),day=dayFormat.format(next),gap=Math.round((Date.parse(day)-Date.parse(today))/86400_000);
  const clock=sessionClock.format(next);
  if(gap===0)return {label:clock==='13:00'?'午休后 13:00':`今天 ${clock}`,reason:clock==='13:00'?'午间休市，13:00恢复盘中自动采集。':'休市等待下一交易时段，间隔目标仅在交易时段生效。'};
  const todayWeek=new Date(today+'T00:00:00Z').getUTCDay(),nextWeek=new Date(day+'T00:00:00Z').getUTCDay();
  const weekend=nextWeek===1&&gap<=3&&gap>=1&&[0,5,6].includes(todayWeek);
  return {label:`下个交易日 · ${sessionFormat.format(next)}`,reason:weekend?'当前常规盘中采集已结束或周末休市，周末不自动采集；更新间隔目标仅在交易时段生效。':'按本地交易日历等待下一开盘；休市等待不表示采集超时或退避。'};
}

export function monitorModel(status, now = new Date(), connected = true) {
  const scheduler = status.scheduler || {}, active = scheduler.active;
  const enabled = !!status.automatic_enabled, running = status.state === 'running';
  const session=sessionDescription(scheduler.next_session_at,now);
  const records = (scheduler.history || []).filter((r) => r.trigger === 'automatic').slice(-8).reverse();
  let title, tone, description;
  if (!connected) {
    title = '监控连接中断'; tone = 'error'; description = '无法确认后台当前状态，以下保留上次收到的数据。';
  } else if (enabled && scheduler.last_tick_at && now.getTime() - Date.parse(scheduler.last_tick_at) > 15_000) {
    title = '后台调度响应延迟'; tone = 'warning'; description = '超过15秒未收到新的调度检查时间，暂不能确认自动任务正常，请检查平台服务。';
  } else if (running) {
    title = active?.source === 'automatic' ? '正在自动采集' : '正在手动采集';
    tone = active?.stopping ? 'error' : 'running';
    description = active?.stopping ? '本轮超时，等待后台退出确认；不会叠加新任务。' : `本轮已运行 ${duration(status.elapsed_seconds)}，报价会先于分钟数据显示。`;
    if(status.split_collection)description='报价和分钟各自采集、发布和退避；下方分别显示真实更新时间。';
  } else if (status.backfill?.pending_latest) {
    title = '最新采集等待补采让路'; tone = 'running'; description = '正在结束补采，释放运行锁后启动最新采集，不并行争用来源额度。';
  } else if (!enabled) {
    title = '自动采集已暂停'; tone = 'paused'; description = '当前不会自动发起新采集，点击“启用自动更新”可恢复。';
  } else if (status.current_context === 'calendar_unknown') {
    title = '等待交易日历确认'; tone = 'warning'; description = '无法确认交易时段，暂不自动请求行情。';
  } else if (scheduler.waiting_for_session) {
    title = '自动采集已开启 · 休市等待'; tone = 'waiting'; description = session.reason;
  } else if (status.error || status.state === 'interrupted') {
    title = '采集异常 · 等待重试'; tone = 'warning'; description = status.error || '上轮任务中断，保留上次成功数据。';
  } else if (status.coverage && status.coverage.minutes < ((status.minute_codes||status.codes)?.length || 0)) {
    title = '报价与分钟需分别检查'; tone = 'warning'; description = `上轮报价${status.coverage.quotes}/${status.codes.length}只，分钟${status.coverage.minutes}/${(status.minute_codes||status.codes).length}只；保留旧缓存，未完成项会单独重试。`;
  } else if (status.finished_at && !status.fresh) {
    title = '上轮数据时效待检查'; tone = 'warning'; description = '后台已开启，但上轮数据尚未满足完整新鲜度要求；等待下一轮检查。';
  } else {
    title = '自动采集待命'; tone = 'waiting'; description = `后台按${scheduler.interval_seconds || 60}秒间隔启动采集，无需点击或保持网页打开。`;
  }
  const nextAt = !running && enabled ? scheduler.waiting_for_session?scheduler.next_session_at||scheduler.next_start_at:scheduler.next_start_at||scheduler.next_session_at : null;
  const delta = nextAt ? Math.ceil((Date.parse(nextAt) - now.getTime()) / 1000) : null;
  const next = !connected ? '连接恢复后确认' : running ? '本轮完成后确定' : !enabled ? '暂停中' : delta == null
    ? status.current_context === 'calendar_unknown' ? '交易日历不足' : '等待后台安排'
    : delta <= 0 ? '等待后台启动' : scheduler.waiting_for_session?sessionDescription(nextAt,now).label:delta >= 3600 ? `约${Math.floor(delta / 3600)}小时${Math.floor(delta % 3600 / 60)}分后` : `约${duration(delta)}后`;
  const countdown=delta>0?delta>=3600?`距开盘约${Math.floor(delta/3600)}小时${Math.floor(delta%3600/60)}分`:`距开盘约${duration(delta)}`:'';
  const nextReason=connected&&enabled&&!running&&scheduler.waiting_for_session?`${session.reason}${countdown?' '+countdown+'。':''}`:'';
  const lastCycle = scheduler.history?.at(-1);
  const lastFinishedAt = status.finished_at || lastCycle?.at;
  const lastTrigger = status.finished_at ? status.trigger : lastCycle?.trigger;
  const trigger = lastTrigger === 'automatic' ? '自动采集' : lastTrigger === 'manual' ? '手动采集' : '来源未记录';
  const observedOnly = status.finished_at ? status.market_context ? status.market_context !== 'trading' : !!lastCycle?.observation_only : !!lastCycle?.observation_only;
  const total = status.codes?.length || 0;
  const minuteTotal=(status.minute_codes||status.codes)?.length||0;
  const quotes = status.current_quote_stocks || 0, minutes = (status.minutes || []).filter((m) => m.current_ok).length;
  return { title, tone, description, next, nextAt, enabled, records, total, minuteTotal, quotes, minutes,
    quotePercent: total ? Math.min(100, quotes / total * 100) : 0,
    minutePercent: minuteTotal ? Math.min(100, minutes / minuteTotal * 100) : 0,
    autoRuns: status.validation?.automatic_runs || 0,
    lastAuto:status.split_collection?Object.values(status.lanes||{}).flatMap(lane=>lane.history||[]).filter(r=>r.trigger==='automatic'&&r.complete&&!r.observation_only&&!r.error&&r.run_id).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]?.at
      :records.find(r=>r.complete&&!r.observation_only&&!r.error)?.at||status.validation?.last_completed_at,
    nextReason,
    lastResult: lastFinishedAt ? `${trigger} · ${chinaTime(lastFinishedAt)} · ${duration(status.finished_at ? status.elapsed_seconds : lastCycle?.elapsed_seconds)}` : '尚无完成记录',
    lastScope: !lastFinishedAt ? '完成第一轮后会显示实际结果。' : observedOnly ? '最近一次为休市样本，不计入盘中自动采集验收。' : '接口覆盖不等于时效达标，请结合下方新鲜度。',
    heartbeat: connected && scheduler.last_tick_at
      ? `调度器最近检查 ${chinaTime(scheduler.last_tick_at)} · 页面同步 ${chinaTime(status.displayed_at)}（北京时间）`
      : `${connected ? '后台状态已同步，等待调度心跳' : '上次同步'} ${chinaTime(status.displayed_at)}（北京时间）` };
}

export function renderMonitor(panel, status, now, connected = true) {
  const f = (name) => panel.querySelector(`[data-monitor="${name}"]`);
  const model = monitorModel(status, now, connected);
  f('card').setAttribute('data-tone', model.tone);
  f('status').textContent = model.title;
  f('description').textContent = model.description;
  f('enabled').textContent = model.enabled ? '已开启' : '已暂停';
  f('interval').textContent = status.split_collection?`报价${status.lanes?.quote?.interval_seconds||15}秒 / 分钟${status.lanes?.minute?.interval_seconds||60}秒`:`${status.scheduler?.interval_seconds || 60}秒`;
  f('next').textContent = model.next;
  f('next-at').textContent = model.nextAt ? `${chinaTime(model.nextAt)}（北京时间）` : '';
  f('next-reason').textContent=model.nextReason;
  f('auto-count').textContent = status.split_collection?`报价${status.lanes?.quote?.automatic_runs||0}轮 / 分钟${status.lanes?.minute?.automatic_runs||0}轮`:`${model.autoRuns}轮`;
  f('last-auto').textContent = model.lastAuto ? `最近自动完成 ${chinaTime(model.lastAuto)}` : '尚无盘中自动完成记录';
  f('result').textContent = model.lastResult;
  f('scope').textContent = model.lastScope;
  f('heartbeat').textContent = model.heartbeat;
  f('quotes').textContent = `${model.quotes}/${model.total}只`;
  f('minutes').textContent = `${model.minutes}/${model.minuteTotal}只`;
  for (const kind of ['quote', 'minute']) {
    const progress = f(kind + '-progress');
    const percent = kind === 'quote' ? model.quotePercent : model.minutePercent;
    progress.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
  const list = f('timeline'); list.replaceChildren();
  const records=status.split_collection?Object.entries(status.lanes||{}).flatMap(([lane,value])=>(value.history||[]).filter(r=>r.trigger==='automatic').map(r=>({...r,lane,total:value.total}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8):model.records;
  if (!records.length) {
    const item = document.createElement('li');
    item.textContent = '尚无自动采集记录。手动采集结果不会显示为自动运行；开关开启后，等待交易时段执行。';
    list.append(item);
  }
  for (const record of records) {
    const item = document.createElement('li');
    item.textContent = `${chinaTime(record.at)} · 自动采集 · 报价${record.quotes}只 / 分钟${record.minutes}只 · ${duration(record.elapsed_seconds)} · ${record.complete ? '通过时效检查' : record.observation_only ? '休市完成，不计入验收' : '未通过完整时效检查'}`;
    if(status.split_collection)item.textContent=`${chinaTime(record.at)} · 自动${record.lane==='quote'?'报价':'分钟'} · 覆盖${record.coverage}/${record.total}只 · ${duration(record.elapsed_seconds)} · ${record.observation_only?'休市完成，不计入验收':record.complete?'通过本类型时间检查':'本类型时效需检查'}`;
    list.append(item);
  }
  return model;
}
