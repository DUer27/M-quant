export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '未记录';
  return seconds < 60 ? `${seconds.toFixed(1)}秒` : `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
}

export function chinaTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '未记录';
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export function mountMarketDataPanel({ isVisible = () => true } = {}) {
  const panel = document.querySelector('#market-data-panel');
  if (!panel) return;
  const field = (name) => panel.querySelector(`[data-market="${name}"]`);
  const refreshButton = field('refresh');
  const details = field('signals');
  const sourceNames = { eastmoney: '东方财富', tencent: '腾讯', sina: '新浪' };
  function paragraph(parent, value) {
    const row = document.createElement('p'); row.textContent = value; parent.append(row);
  }

  function diagnostics(status) {
    const metrics = status.metrics;
    field('timing').textContent = `本轮完成：${chinaTime(status.finished_at)}（北京时间） · 耗时：${duration(metrics?.elapsed_seconds)}${metrics ? ` · 缓存复用 ${metrics.cache_hits}只，联网获取 ${metrics.downloaded_stocks}只 · 配置并发 ${metrics.workers}` : ''}`;
    const receipt = status.scheduler;
    const schedulerLabels = { running: '执行中', ready: '更新完成', skipped: '检查完成，无需重复更新', failed: '执行异常' };
    field('scheduler').textContent = receipt
      ? `系统定时任务：${schedulerLabels[receipt.state] || receipt.state} · ${chinaTime(receipt.finished_at || receipt.started_at)} · ${receipt.message || ''}`
      : '系统定时任务：等待新版任务回执；行情状态与定时任务结果分别记录。';
    const list = field('diagnostic-list'); list.replaceChildren();
    if (metrics) {
      const t = metrics.timings || {};
      paragraph(list, `阶段耗时：交易日历 ${duration(t.calendar_seconds)}；采集与缓存校验 ${duration(t.acquisition_seconds)}；保存快照 ${duration(t.snapshot_seconds)}；观察计算 ${duration(t.signals_seconds)}。校验累计工作量 ${duration(t.validation_worker_seconds)}（并发任务之和，不能与总耗时相加）。`);
      for (const [source, m] of Object.entries(metrics.sources || {})) {
        const cooldown = m.blocked_until ? Math.max(0, Math.ceil(m.blocked_until - Date.now() / 1000)) : 0;
        paragraph(list, `${sourceNames[source] || source}：请求 ${m.requests}次，成功 ${m.successes}次，失败 ${m.failures}次；请求累计 ${duration(m.request_seconds)}，排队累计 ${duration(m.wait_seconds)}；冷却跳过 ${m.skipped}次${cooldown ? `，约${cooldown}秒后可探测恢复` : ''}${m.last_error ? `；最近异常 ${m.last_error}` : ''}。`);
      }
    } else paragraph(list, '此轮早于耗时记录升级，没有可用于速度比较的详细指标。');
    if (status.active_queue) paragraph(list, `正在处理：${status.active_queue === 'backfill' ? '新增股票历史补齐队列' : '已有股票更新队列'}`);
    for (const failure of status.failures || []) paragraph(list, `待补齐 ${failure.code}：${failure.reason}`);
    for (const stock of status.stock_details || []) {
      if (stock.state === 'ready') paragraph(list, `${stock.code} ${stock.name}：截至${stock.data_date} · ${stock.cached ? '缓存校验' : stock.source} · ${stock.rows}行 · ${duration(stock.seconds)}`);
    }
    const history = field('run-list'); history.replaceChildren();
    for (const run of status.recent_runs || []) {
      paragraph(history, `${chinaTime(run.finished_at || run.started_at)} · ${run.state === 'ready' ? '完成' : run.state === 'attention' ? '信号需检查' : '未完成'} · 目标${run.expected_date || '未知'} · ${run.coverage?.fresh || 0}/${run.coverage?.total || 0}只 · ${duration(run.metrics?.elapsed_seconds)}${run.metrics ? `（联网${run.metrics.downloaded_stocks}只/缓存${run.metrics.cache_hits}只）` : ''}`);
    }
    if (!status.recent_runs?.length) paragraph(history, '尚无历史运行记录。');
  }

  async function json(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error('行情更新服务暂时不可用');
    return response.json();
  }
  async function refreshStatus() {
    try {
      const status = await json('/market-data-api/status');
      const labels = { not_started: '尚未更新', running: '更新中', ready: '已更新', attention: '行情已更新，信号需检查', failed: '更新未完成', stale: '等待新数据' };
      field('state').textContent = labels[status.state] || status.state;
      field('state').dataset.state = status.state;
      field('scope').textContent = status.label;
      field('date').textContent = status.last_success?.data_date || '尚无通过校验的数据';
      const count = status.coverage || {};
      field('coverage').textContent = count.total ? `${count.fresh || 0}/${count.total} 只通过检查${count.failed ? `，${count.failed} 只待补齐` : ''}` : '等待首次校验';
      field('schedule').textContent = (status.enabled
        ? `周一至周五 ${status.schedule_time} 自动检查（北京时间）；电脑需开机并登录，启动平台后会补查`
        : '自动更新已暂停，仍可手动更新行情') + (status.pool_pending ? `；管理库v${status.configured_pool_version}，最近/当前轮v${status.running_pool_version||'旧配置'}，新名单下轮使用。` : '');
      field('message').textContent = status.message || status.scope_note;
      diagnostics(status);
      refreshButton.disabled = status.state === 'running';
      refreshButton.textContent = status.state === 'running' ? '正在更新…' : '立即更新行情';
      if (details.open && status.state === 'ready') await refreshSignals();
      else if (status.state !== 'ready') field('signal-list').textContent = '新数据通过完整性检查后，才会展示本轮观察信号。';
    } catch (error) {
      field('state').textContent = '连接中断';
      field('state').dataset.state = 'failed';
      field('message').textContent = error.message;
      refreshButton.disabled = false;
    }
  }
  async function refreshSignals() {
    const pack = await json('/market-data-api/signals');
    const list = field('signal-list');
    list.replaceChildren();
    if (!pack.available) { list.textContent = pack.reason; return; }
    const note = document.createElement('p');
    note.textContent = `${pack.signal_date} · ${pack.universe_label} · 观察信号仅供复核，不自动下单。`;
    list.append(note);
    for (const route of pack.routes || []) {
      const row = document.createElement('p');
      const codes = (route.selected || []).slice(0, 10).map((item) => item.code).join('、');
      row.textContent = `${route.strategy_name || route.strategy_id}：候选 ${route.candidate_count || 0} 只，入选 ${route.selected_count || 0} 只，仅记录。${codes ? ` ${codes}` : ''}`;
      list.append(row);
    }
  }
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    try {
      await json('/market-data-api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await refreshStatus();
    } catch (error) {
      field('message').textContent = error.message;
      refreshButton.disabled = false;
    }
  });
  details.addEventListener('toggle', () => {
    if (details.open) refreshSignals().catch((error) => { field('signal-list').textContent = error.message; });
  });
  if (isVisible()) refreshStatus();
  setInterval(() => { if (!document.hidden && isVisible()) refreshStatus(); }, 10_000);
  return { refresh: refreshStatus };
}
