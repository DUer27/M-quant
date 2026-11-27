// All latency figures use supplier timestamps, not exchange-certified event times.
export const beijingDay = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
};
export function validationRecord(report, cycle, { context, now, trigger }) {
  const checks = report.rounds?.at(-1)?.checks || [], codes = report.codes || [];
  const minuteCodes=report.minute_codes||codes;
  const quoteAges = [], minuteAges = [], sourceCounts = {}, failures = [];
  let quoteCount = 0, minuteCount = 0;
  for (const code of codes) {
    const quotes = checks.filter((c) => c.kind === 'quote' && c.ok).flatMap((c) => c.data || []).filter((q) => q.code === code);
    const ages = quotes.map((q) => (now - Date.parse(q.source_time)) / 1000).filter((age) => Number.isFinite(age) && age >= 0);
    if (quotes.length) quoteCount++;
    if (ages.length) quoteAges.push(Math.min(...ages));
    const minute = minuteCodes.includes(code) && checks.find((c) => c.kind === 'minute' && c.code === code && c.ok && c.selected !== false);
    if (minute?.data) {
      minuteCount++;
      const age = (now - Date.parse(minute.data.source_time)) / 1000;
      if (age >= 0 && Number.isFinite(age)) minuteAges.push(age);
      sourceCounts[minute.data.source] = (sourceCounts[minute.data.source] || 0) + 1;
    }
  }
  for (const check of checks) if (!check.ok) failures.push({ source: check.source, kind: check.kind, code: check.code,
    reason: check.error || check.reason || '字段检查未通过', cooldown: check.error === '来源冷却中' || check.seconds === 0 });
  return { schema: 'intraday-validation.v1', record_id: `${report.run_id || 'no-report'}:${cycle.at}`,
    run_id: report.run_id, at: cycle.at, started_at: cycle.started_at || report.started_at,
    trigger: trigger || report.trigger || 'unknown', observation_only: context !== 'trading' || !!cycle.observation_only,
    collection_profile: report.collection_profile || 'legacy',
    pool_version:report.pool_version,minute_codes:minuteCodes,
    elapsed_seconds: cycle.elapsed_seconds, total: codes.length, codes,
    quote_count: quoteCount, minute_count: minuteCount, complete: !!cycle.complete, advanced: !!cycle.advanced,
    fast: cycle.elapsed_seconds <= 60, interval_seconds: cycle.interval_seconds,
    max_quote_age_seconds: quoteAges.length === codes.length && codes.length ? Math.max(...quoteAges) : null,
    max_minute_age_seconds: minuteAges.length === minuteCodes.length && minuteCodes.length ? Math.max(...minuteAges) : null,
    source_counts: sourceCounts, failures, error: cycle.error || '',
    supplier_time_only: true };
}
function tradingSecondsBetween(start, end) {
  if (!(Number.isFinite(start) && Number.isFinite(end)) || end <= start) return 0;
  const day = beijingDay(start);
  if (beijingDay(end) !== day) return 0;
  return [['09:30','11:30'], ['13:00','15:00']].reduce((total, [a, b]) => {
    const left = Date.parse(`${day}T${a}:00+08:00`), right = Date.parse(`${day}T${b}:00+08:00`);
    return total + Math.max(0, Math.min(end, right) - Math.max(start, left)) / 1000;
  }, 0);
}
export function summarizeValidation(records, { day, codes, now = new Date(), enabled = true } = {}) {
  const key = [...(codes || [])].sort().join(',');
  const unique = [...new Map(records.filter((r) => r?.at && beijingDay(r.at) === day).map((r) => [r.record_id || r.run_id, r])).values()];
  const matching = unique.filter((r) => [...(r.codes || [])].sort().join(',') === key);
  const runs = matching.filter((r) => r.trigger === 'automatic' && !r.observation_only).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const reasons = [];
  const count = runs.length;
  const complete = runs.filter((r) => r.complete).length;
  const timely = runs.filter((r) => r.complete && r.advanced && r.fast).length;
  const durations = runs.map((r) => r.elapsed_seconds);
  const first = count ? Date.parse(runs[0].started_at) : null;
  const last = count ? Date.parse(runs.at(-1).started_at) : null;
  const observedSeconds = count > 1 ? tradingSecondsBetween(first, last) : 0;
  let largestGap = null;
  for (let i = 1; i < runs.length; i++) largestGap = Math.max(largestGap || 0, tradingSecondsBetween(Date.parse(runs[i-1].started_at), Date.parse(runs[i].started_at)));
  const expected = count ? Math.floor(observedSeconds / 60) + 1 : 0;
  const slots = new Set(runs.map((r) => Math.floor(tradingSecondsBetween(first, Date.parse(r.started_at)) / 60)));
  const missed = Math.max(0, expected - slots.size);
  const completeRate = count ? complete / count : null, timelyRate = expected ? timely / Math.max(expected, count) : null;
  // Provisional acceptance gate, never an automatic instruction to expand the pool.
  if (count < 30) reasons.push('至少需要30轮自动盘中记录');
  if (observedSeconds < 1800) reasons.push('至少需要30分钟交易时段观察窗口');
  if (completeRate == null || completeRate < .99) reasons.push('完整且新鲜的轮次占比需达到99%');
  if (timelyRate == null || timelyRate < .95) reasons.push('完整、新鲜、源时间推进且60秒内完成的比例需达到95%（计入窗口缺轮）');
  if (largestGap > 180) reasons.push('观察窗口出现超过180秒的采集启动间隔');
  const latestAt = count ? runs.at(-1).at : null;
  const tradingNow = beijingDay(now) === day && [['09:30','11:30'],['13:00','15:00']].some(([a,b]) => {
    const value = now.getTime(); return value >= Date.parse(`${day}T${a}:00+08:00`) && value <= Date.parse(`${day}T${b}:00+08:00`);
  });
  const silence = enabled && tradingNow && latestAt ? Math.max(0, (now - Date.parse(latestAt)) / 1000) : null;
  if (silence > 180) reasons.push('交易时段已超过180秒没有完成新一轮');
  const failures = {};
  for (const r of runs) for (const f of r.failures || []) {
    const label = `${f.source}/${f.kind}/${f.reason}`;
    failures[label] = (failures[label] || 0) + 1;
  }
  return { schema: 'intraday-validation-summary.v1', day, codes, evaluated_at: now.toISOString(),
    automatic_runs: count, excluded_observation_or_manual: matching.length - count, excluded_other_pools: unique.length - matching.length,
    observed_trading_minutes: Math.round(observedSeconds / 60 * 10) / 10, window_start: count ? runs[0].started_at : null,
    window_end: count ? runs.at(-1).started_at : null, expected_slots_in_window: expected, missed_slots: missed,
    complete_rate: completeRate, timely_rate: timelyRate, elapsed_p50_seconds: percentile(durations, .5), elapsed_p95_seconds: percentile(durations, .95),
    elapsed_max_seconds: durations.length ? Math.max(...durations) : null,
    max_quote_age_p95_seconds: percentile(runs.map((r) => r.max_quote_age_seconds), .95),
    max_minute_age_p95_seconds: percentile(runs.map((r) => r.max_minute_age_seconds), .95),
    largest_start_gap_seconds: largestGap, last_completed_at: latestAt, current_silence_seconds: silence,
    fallback_or_failure_counts: failures, ready_for_review: reasons.length === 0, reasons,
    interpretation: '仅评价本股票池已观察窗口；暂停和断线会影响窗口缺轮。达标后仍需人工复核，不自动扩池。源时间差不等于交易所端到端延迟。' };
}
