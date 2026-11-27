// Persistent scheduling decisions; collection and process ownership live in the controller.
export function newPolicy(saved = {}) {
  return { interval_seconds: 60, good_cycles: 0, next_start_at: null, notices: [], history: [], ...saved, active: null };
}
export function notify(policy, kind, message, now) {
  const entry = { id: `${now.getTime()}-${kind}`, kind, message, at: now.toISOString() };
  policy.notices = [...policy.notices, entry].slice(-20);
  return entry;
}
export function beginCycle(policy, now, previousRun) {
  policy.active = { started_at: now.toISOString(), previous_run: previousRun, deadline_seconds: 60, stopping: false };
  policy.next_start_at = null;
}
export function watchCycle(policy, now) {
  if (!policy.active || policy.active.stopping) return false;
  const seconds = (now - Date.parse(policy.active.started_at)) / 1000;
  const level = seconds >= 180 ? 300 : seconds >= 120 ? 180 : seconds >= 60 ? 120 : 60;
  if (level <= policy.active.deadline_seconds) return false;
  policy.active.deadline_seconds = level;
  policy.interval_seconds = Math.max(policy.interval_seconds, level);
  policy.good_cycles = 0;
  if (level === 300) {
    policy.active.stopping = true;
    notify(policy, 'timeout', '本轮超过180秒，正在结束采集；确认退出后冷却5分钟，保留上次数据。', now);
    return true;
  }
  notify(policy, 'slow', `本轮超过${level === 120 ? 60 : 120}秒，更新间隔临时延长至${policy.interval_seconds}秒；不会叠加采集。`, now);
  return false;
}
export function finishCycle(policy, { now, report, eligible, sourceTimes = {}, cooldownUntil = 0, error = '' }) {
  const active = policy.active;
  if (!active) return;
  const elapsed = Math.max(0, (now - Date.parse(active.started_at)) / 1000);
  const newRun = report?.run_id && report.run_id !== active.previous_run && report.state !== 'running';
  const complete = !!newRun && eligible && !error && !active.stopping;
  const oldTimes = policy.source_times || {};
  const advanced = Object.keys(sourceTimes).length > 0 && Object.entries(sourceTimes).every(([key, value]) =>
    !oldTimes[key] || Date.parse(value) > Date.parse(oldTimes[key]));
  if (complete && elapsed <= 60 && advanced) {
    policy.good_cycles++;
    policy.source_times = sourceTimes;
    if (policy.good_cycles >= 2 && policy.interval_seconds > 60) {
      policy.interval_seconds = 60;
      notify(policy, 'recovered', '连续两轮完整新数据在60秒内完成，已恢复每60秒更新。', now);
    }
  } else {
    policy.good_cycles = 0;
    policy.interval_seconds = Math.max(policy.interval_seconds,
      active.stopping ? 300 : !complete ? 120 : elapsed > 120 ? 180 : elapsed > 60 ? 120 : 60);
    if (!complete) notify(policy, 'incomplete', error || '本轮数据缺失、过期或更新未完成，暂缓下一轮；保留可用图表。', now);
  }
  if (cooldownUntil > now.getTime()) policy.cooldown_until = cooldownUntil;
  if (active.stopping) policy.cooldown_until = Math.max(policy.cooldown_until || 0, now.getTime() + 300_000);
  const cooldown = Math.max(policy.cooldown_until || 0, cooldownUntil);
  policy.next_start_at = new Date(Math.max(
    Date.parse(active.started_at) + policy.interval_seconds * 1000,
    now.getTime() + (active.stopping ? 300_000 : 5000), cooldown)).toISOString();
  policy.history = [...policy.history, { at: now.toISOString(), run_id: report?.run_id, elapsed_seconds: Math.round(elapsed * 1000) / 1000,
    complete, advanced, interval_seconds: policy.interval_seconds, quotes: report?.coverage?.quotes || 0,
    minutes: report?.coverage?.minutes || 0, error }].slice(-120);
  policy.active = null;
}
