import { chinaTime } from './market-data.js';

const states = { first_observation: '首次观测，暂无同源对照', new_day: '新交易日', advanced: '源时间已推进',
  stale_source: '源时间仍滞后',
  label_unchanged_revised: '标签未变，内容仍修订', label_unchanged_same: '标签与内容均未变，原因待核实',
  label_regressed: '源时间倒退', older_receipt: '收到旧响应', source_changed: '来源改变，不混合比较',
  validation: '字段或时效检查未通过', network: '网络连接失败', rate_limit: '限流或访问限制',
  cooldown: '来源冷却，未请求', circuit_skip: '连接故障跳过', recovery_budget: '复查预算已用完，未请求', local: '本地保存异常', request_failed: '请求未完成' };
const outcomes = { advanced_after_retry: '同源复查后推进', advanced_after_switch: '备用源返回更新标签',
  returned: '已返回响应，继续检查标签', missing_symbol: '响应缺少该股票',
  still_not_advanced: '复查后仍未推进，保留原成功样本', symbol_cooldown: '该股票复查冷却中', symbol_budget: '本轮复查股票额度已用完',
  request_budget: '本轮额外请求额度已用完', time_budget: '本轮复查时间已用完', outside_session: '非交易时段，未额外请求',
  disabled: '定向恢复已关闭', budget_or_source_cooldown: '请求预算或来源冷却，未额外请求', source_cooldown: '来源冷却，未请求' };
const sourceName = source => ({ sina: '新浪', tencent: '腾讯', eastmoney: '东方财富' })[source?.split('.')[0]] || source || '未知';

export function renderSymbolDiagnostics(panel, status, showAll = false) {
  const field = name => panel.querySelector(`[data-intraday="${name}"]`);
  const data = status.symbol_diagnostics;
  const list = field('diagnostics-entries'), events = field('diagnostics-recovery');
  list.replaceChildren(); events.replaceChildren();
  if (!data) { field('diagnostics-summary').textContent = '等待本轮逐股诊断；历史缺少逐股证据，不据此补造原因。'; return; }
  const entries = data.entries || [], recovery = data.recovery_events || [];
  const initial = entries.filter(entry => entry.stage === 'initial');
  const attention = initial.filter(entry => entry.needs_recovery || !['advanced', 'new_day', 'first_observation'].includes(entry.state));
  field('diagnostics-summary').textContent = `${status.run_id || ''} · 初次观测${initial.length}项 · 需关注${attention.length}项 · 额外请求${data.extra_requests || 0}/${data.policy?.max_requests || 0}次 · 已恢复${recovery.filter(event => event.recovered).length}项。标签未变不等于网络失败，内容修订也不代表已经闭合。${status.current_context && status.current_context !== 'trading' ? '当前非交易时段，时间差仅作记录，不触发复查或判定盘中达标。' : ''}${data.state === 'degraded' ? '诊断保存异常：' + (data.errors || []).join('、') : ''}`;
  if(status.split_collection)field('diagnostics-summary').textContent='分流观测：报价与分钟按各自运行记录比较，额外请求预算各自独立；下列为合计。'+field('diagnostics-summary').textContent;
  for (const entry of entries.filter(entry => showAll || entry.needs_recovery || entry.stage === 'recovery' || !['advanced', 'new_day', 'first_observation'].includes(entry.state))) {
    const tr = document.createElement('tr');
    for (const value of [entry.code, `${sourceName(entry.source)} · ${entry.kind === 'minute' ? '分钟' : '报价'}`,
      entry.stage === 'recovery' ? '定向复查' : '初次采集', states[entry.state] || entry.state,
      chinaTime(entry.previous_source_time), chinaTime(entry.source_time), chinaTime(entry.received_at),
      entry.content_changed == null ? '无对照' : entry.content_changed ? '已变化' : '未变化',
      Number.isFinite(entry.source_age_seconds) ? `${entry.source_age_seconds}秒` : '未知']) {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    }
    list.append(tr);
  }
  if (!list.children.length) {
    const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 9;
    td.textContent = '当前没有需关注项；可切换“全部观测”查看每股源时间与接收时间。';tr.append(td);list.append(tr);
  }
  for (const event of recovery) {
    const line = document.createElement('p');
    const times = event.final_source_time ? `${chinaTime(event.initial_source_time)} → ${chinaTime(event.final_source_time)}` : `源标签${chinaTime(event.initial_source_time)}`;
    line.textContent = `${event.code} · ${event.kind === 'minute' ? '分钟' : '报价'} · ${states[event.reason] || event.reason} · ${outcomes[event.outcome] || event.outcome} · ${times}${event.final_source ? ' · ' + sourceName(event.final_source) : ''}；实际请求${(event.attempts || []).filter(attempt => attempt.request_sent).length}次。`;
    events.append(line);
    for (const attempt of event.attempts || []) {
      const detail = document.createElement('p'); detail.className = 'library-source';
      detail.textContent = `${sourceName(attempt.source)} · ${attempt.request_sent ? '已请求' : '未请求'} · ${outcomes[attempt.outcome] || states[attempt.outcome] || attempt.outcome} · 收到${chinaTime(attempt.received_at)} · 源标签${chinaTime(attempt.source_time)}`;
      events.append(detail);
    }
  }
  if (!recovery.length) { const line = document.createElement('p'); line.textContent = '本轮尚无定向复查；正常股票沿用原采集路径。'; events.append(line); }
}
