const labels = { pending: '待补采', running: '执行中 / 中断后等待重排', retry_wait: '等待有限重试',
  collected_unverified: '候选已取得，待核实', resolved_from_latest: '后续采集已覆盖', needs_historical_source: '需要历史分钟来源',
  budget_wait: '今日额度已用完', needs_review: '需要人工核查' };
labels.needs_boundary_review = '边界待核实（非失败）';
labels.paused_removed='已移出分钟池，任务暂停';
const labelClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
const range=task=>Number.isFinite(Date.parse(task.first_label))&&Number.isFinite(Date.parse(task.last_label))
  ?`${labelClock.format(new Date(task.first_label))}—${labelClock.format(new Date(task.last_label))}`:'时间未提供';
export function renderBackfill(panel, status) {
  const field = name => panel.querySelector(`[data-intraday="${name}"]`);
  const data = status.backfill || {}, counts = data.counts || {};
  const open = (counts.pending || 0) + (counts.retry_wait || 0) + (counts.running || 0);
  field('backfill-summary').textContent = `待处理${open}项 · 已取得候选${counts.collected_unverified || 0}项 · 后续采集已覆盖${counts.resolved_from_latest || 0}项 · 需历史来源${counts.needs_historical_source || 0}项 · 需边界复核${counts.needs_boundary_review || 0}项 · 待核查${counts.needs_review || 0}项。今日补采额度使用${data.requests_today || 0}/${data.max_requests_per_day ?? 20}次（中断也占额度），独立保存${data.candidate_rows || 0}条待核实样本。${data.queue_at_capacity ? '队列已达100项上限，未入队缺口需后续复核。' : ''}`;
  const boundary=counts.needs_boundary_review||0,tasks=data.tasks||[];
  field('backfill-state').textContent = data.worker_error||data.error?'补采状态需检查':data.preempting ? '正在给最新采集让路' : data.worker_running ? '补采执行中'
    : !data.enabled ? '补采已暂停' : status.current_context === 'trading' ? '交易时段让路，任务保留'
      : status.current_context === 'calendar_unknown' ? '交易日历待确认' : open ? '休市按队列执行' : boundary&&!counts.needs_review&&!counts.needs_historical_source?'仅边界待核实 · 无失败重试':'暂无待执行任务';
  field('backfill-note').textContent = data.worker_error || data.error || `先跟踪${status.minute_audit?.codes?.length || 3}只样本的同源当日内部疑似缺口。每次处理1项，最新采集优先；跨日任务等待历史来源。补采数据独立保存，闭合规则仍待核实。`;
  const closing=tasks.filter(task=>task.state==='needs_boundary_review'&&range(task)==='14:58—14:59');
  field('backfill-explanation').textContent=boundary?`边界待核实${boundary}项包含历史记录，暂不计作采集失败。${closing.length?'14:58—14:59处于14:57—15:00收盘集合竞价阶段，需核实来源是否逐分钟出数；交易时段规则本身不能证明这两个标签应该缺失或已经完整。':''}此类记录不自动补采，也不合成K线；例如“未覆盖/目标 2/2”表示两项标签尚待核对，不表示已补回两条数据。`:'';
  field('backfill-toggle').textContent = data.enabled ? '暂停补采' : '启用补采';
  field('backfill-run').disabled = data.worker_running || !data.enabled || !open || ['trading', 'calendar_unknown'].includes(status.current_context);
  const table = field('backfill-tasks'); table.replaceChildren();
  const filter=field('backfill-filter').value||'latest',latest=tasks.map(task=>task.day).filter(Boolean).sort().at(-1);
  const shown=filter==='all'?tasks:tasks.filter(task=>task.state!=='paused_removed'&&(!status.minute_codes||status.minute_codes.includes(task.code))
    &&(task.day===latest||['pending','retry_wait','running','budget_wait','needs_historical_source','needs_review'].includes(task.state)));
  field('backfill-list-scope').textContent=`显示${shown.length}/${tasks.length}条已载入记录${filter==='all'?'（包含历史及移出股票）':` · 最近数据日${latest||'暂无'}，可执行/异常待处理项保留显示；历史记录可切换查看`}`;
  for (const task of shown) {
    const tr = document.createElement('tr');
    const source = ({ sina: '新浪', eastmoney: '东方财富' })[task.source?.split('.')[0]] || task.source;
    for (const value of [task.code, source, task.day, range(task),
      `${task.remaining_labels??'待核实'}/${task.candidate_labels??'待核实'}`, labels[task.state] || task.state, `${task.attempts??0}/3`, task.message]) {
      const td = document.createElement('td'); td.textContent = String(value ?? ''); tr.append(td);
    }
    table.append(tr);
  }
  if (!table.children.length) {
    const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 8;
    td.textContent = tasks.length?'当前筛选暂无任务，切换全部记录可查看历史；不会人为生成补采任务。':'尚未发现可入队的内部疑似缺口；不会人为生成补采任务。'; tr.append(td); table.append(tr);
  }
}
