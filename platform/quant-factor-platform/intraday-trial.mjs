import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { newPolicy, notify, beginCycle, watchCycle, finishCycle } from './intraday-policy.mjs';
import { beijingDay, validationRecord, summarizeValidation } from './intraday-validation.mjs';
import { readLibrary, effectiveConfig, snapshotConfig } from './stock-library.mjs';
import { createSplitIntraday } from './split-intraday.mjs';

export function currentContext(now, dates) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const clock = `${parts.hour}:${parts.minute}:${parts.second}`;
  if (!dates?.length || [...dates].sort().at(-1) < day) return 'calendar_unknown';
  if (!dates.includes(day)) return 'non_trading_day';
  return (clock >= '09:30:00' && clock <= '11:30:00' || clock >= '13:00:00' && clock <= '15:00:00') ? 'trading' : 'market_closed';
}
export function nextTradingStart(now, dates) {
  const today = beijingDay(now);
  for (const day of [...(dates || [])].sort()) {
    if (day < today) continue;
    for (const clock of ['09:30', '13:00']) {
      const value = new Date(`${day}T${clock}:00+08:00`);
      if (value.getTime() > now.getTime()) return value.toISOString();
    }
  }
  return null;
}
function read(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}
function write(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8'); renameSync(temporary, path);
}
export function recoveryQuality(report, now) {
  const times = {}, codes = report.codes || [], checks = report.rounds?.at(-1)?.checks || [];
  if (!codes.length) return { eligible: false, times };
  // Recovery requires one coherent complete quote source, not a mixture of cached or stale rows.
  const source = checks.find((check) => check.kind === 'quote' && check.ok && codes.every((code) => check.data?.some((row) => {
    const age = (now - Date.parse(row.source_time)) / 1000;
    return row.code === code && age >= 0 && age <= 90;
  })));
  if (!source) return { eligible: false, times };
  for (const code of codes) {
    const quote = source.data.find((row) => row.code === code);
    times[`quote:${code}`] = quote.source_time;
  }
  for (const code of report.minute_codes || codes) {
    const minute = checks.find(check => check.kind === 'minute' && check.ok && check.selected !== false && check.code === code && check.data?.rows?.length);
    const age = minute ? (now - Date.parse(minute.data.source_time)) / 1000 : Infinity;
    if (!(age >= 0 && age <= 180)) return { eligible: false, times: {} };
    times[`minute:${code}`] = minute.data.source_time;
  }
  return { eligible: true, times };
}

export function createIntradayTrial(options) {
  const legacy=createLegacyIntradayTrial(options);
  const cfg=read(join(options.platformRoot,'config/intraday-trial.json'),{});
  return cfg.split_collection?.enabled?createSplitIntraday({...options,legacy,currentContext,nextTradingStart}):legacy;
}
function createLegacyIntradayTrial({ projectRoot, platformRoot, python, spawnProcess = spawn, now = () => new Date() }) {
  const runtime = join(projectRoot, 'outputs', 'live-market-data', 'intraday-trial');
  const configPath = join(platformRoot, 'config', 'intraday-trial.json');
  const policyPath = join(runtime, 'schedule-state.json');
  const reportPath = join(runtime, 'status.json');
  const backfillProcessPath = join(runtime, 'backfill-process.json');
  mkdirSync(runtime, { recursive: true });
  const saved = read(policyPath, {});
  const policy = newPolicy(saved);
  // A live worker from an earlier server instance remains owned until its process exits.
  let external = saved.active;
  let child = null, started = 0, error = '', timer = null, lastTickAt = null;
  const backfillSaved = read(backfillProcessPath, {});
  let backfillChild = null, backfillProcess = backfillSaved.active || null;
  let lastBackfillAt = backfillSaved.last_started_at || 0, backfillError = '', pendingLatest = null;
  function config() { return effectiveConfig(read(configPath, { automatic_enabled: false }), readLibrary(projectRoot), 'intraday'); }
  function context() { return currentContext(now(), read(join(projectRoot, 'outputs', 'live-market-data', 'calendar.json'), {}).dates || []); }
  function persist() { write(policyPath, { ...policy, active: policy.active || external || null }); }
  function persistBackfill() { write(backfillProcessPath, { active: backfillProcess, last_started_at: lastBackfillAt }); }
  function backfillAlive() {
    if (backfillChild) return true;
    if (!backfillProcess?.pid) return false;
    try { process.kill(backfillProcess.pid, 0); return true; } catch {
      backfillProcess = null; persistBackfill(); return false;
    }
  }
  function stopBackfill(reason) {
    if (!backfillAlive() || backfillProcess?.stopping) return;
    backfillProcess = { ...backfillProcess, stopping: true, stop_reason: reason }; persistBackfill();
    if (process.platform === 'win32' && backfillProcess.pid) {
      const killer = spawnProcess('taskkill.exe', ['/PID', String(backfillProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => { backfillError = '补采尚未退出，等待释放运行锁后启动最新采集。'; });
    } else backfillChild?.kill('SIGKILL');
  }
  function startBackfill() {
    if (context() === 'trading' || context() === 'calendar_unknown') return { accepted: false, reason: '补采仅在已确认的休市时段执行' };
    if (config().backfill?.enabled === false) return { accepted: false, reason: '补采已暂停' };
    if (child || externalAlive() || pendingLatest) return { accepted: false, reason: '最新行情优先，补采等待' };
    if (backfillAlive()) return { accepted: false, reason: '已有补采任务正在运行' };
    const info = read(join(runtime, 'backfill-status.json'), {});
    if (!['pending', 'retry_wait', 'running'].some(state => info.counts?.[state] > 0)) return { accepted: false, reason: '暂无可执行补采任务' };
    backfillError = ''; lastBackfillAt = now().getTime();
    try {
      backfillChild = spawnProcess(python, [join(projectRoot, 'tools', 'intraday_backfill.py'), 'work-one', '--config', snapshotConfig(projectRoot,config(),'backfill'), '--runtime', runtime],
        { cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' } });
      backfillProcess = { pid: backfillChild.pid, started_at: now().toISOString(), stopping: false }; persistBackfill();
    } catch { backfillChild = null; backfillProcess = null; backfillError = '补采进程启动失败'; return { accepted: false, reason: backfillError }; }
    for (const stream of [backfillChild.stdout, backfillChild.stderr]) stream?.on('data', data => appendFileSync(join(runtime, 'backfill-worker.log'), data));
    backfillChild.once('error', () => { backfillError = '补采进程无法启动'; });
    backfillChild.once('close', (code) => {
      if (code !== 0 && !backfillProcess?.stopping) backfillError = '补采本轮未完成，队列将保留任务。';
      backfillChild = null; backfillProcess = null; persistBackfill();
      if (pendingLatest) { const source = pendingLatest; pendingLatest = null; start(source); }
    });
    return { accepted: true };
  }
  function setBackfillEnabled(enabled) {
    const cfg = read(configPath,{}); cfg.backfill = { ...cfg.backfill, enabled: !!enabled }; write(configPath, cfg);
    if (!enabled) stopBackfill('paused');
    return { enabled: !!enabled };
  }
  function externalAlive() {
    if (!external?.pid) { external = null; return false; }
    try { process.kill(external.pid, 0); return true; } catch {
      external = null;
      policy.interval_seconds = Math.max(policy.interval_seconds, 120);
      policy.next_start_at = new Date(now().getTime() + 120_000).toISOString();
      notify(policy, 'interrupted', '上次后台进程已结束，保留已有行情；两分钟后按交易时段重试。', now());
      persist(); return false;
    }
  }
  function validation(day = beijingDay(now()), session = null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('验收日期格式应为YYYY-MM-DD');
    const path = join(runtime, 'validation', day + '.jsonl');
    let records = [];
    try { records = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }); } catch { /* No observations yet. */ }
    const cfg = config();
    const before = records.length;
    if (session) records = records.filter((record) => Date.parse(record.started_at) >= Date.parse(session.started_at)
      && record.collection_profile === session.collection_profile && record.pool_version===session.pool_version);
    const result = summarizeValidation(records, { day, codes: session?.codes || cfg.codes || [], now: now(), enabled: !!cfg.automatic_enabled });
    if (session) result.excluded_outside_session = before - records.length;
    return result;
  }
  function validationSession() {
    const saved = read(join(runtime, 'validation-session.json'), null);
    if (!saved) return null;
    const cfg = config();
    const profile = (cfg.split_collection?.enabled?'split-collection.v1:':'symbol-recovery.v3:') + (cfg.minute_source_order || ['eastmoney', 'sina']).join(',');
    const changed = [...(cfg.codes || [])].sort().join(',') !== [...saved.codes].sort().join(',') || profile !== saved.collection_profile
      || cfg.pool_version !== saved.pool_version;
    const summary = validation(saved.day, saved);
    if (changed) {
      summary.ready_for_review = false; summary.reasons.push('当前股票池或来源顺序已变化，需要重新建立验收窗口');
    }
    return { ...saved, configuration_changed: changed, summary };
  }
  function beginValidation() {
    if (context() !== 'trading') return { accepted: false, reason: '请在交易时段开始连续验收' };
    const cfg = config();
    if (!cfg.automatic_enabled) return { accepted: false, reason: '请先启用自动更新，再开始连续验收' };
    const session = { schema: 'intraday-validation-session.v1', id: randomUUID(), day: beijingDay(now()),
      started_at: now().toISOString(), codes: cfg.codes || [], pool_version:cfg.pool_version,
      collection_profile: 'symbol-recovery.v3:' + (cfg.minute_source_order || ['eastmoney', 'sina']).join(','),
      note: '本次窗口与全天记录分别评估，历史失败记录继续保留。' };
    const folder = join(runtime, 'validation-sessions'); mkdirSync(folder, { recursive: true });
    write(join(folder, session.id + '.json'), session);
    write(join(runtime, 'validation-session.json'), session);
    return { accepted: true, session };
  }
  function status({ light = false } = {}) {
    const report = light ? read(join(runtime, 'status-light.json'), null) || read(reportPath, { state: 'not_started', rounds: [] })
      : read(reportPath, { state: 'not_started', rounds: [] });
    const market = context(), cfg = config();
    const activePool = policy.active || external;
    const codes = activePool?.pool_codes || cfg.codes || report.codes || [];
    const minuteCodes = activePool?.minute_codes || cfg.minute_codes || codes;
    const awaitingNewReport = !!(policy.active || external) && (policy.active || external).previous_run === report.run_id;
    const latest = awaitingNewReport ? [] : report.rounds?.at(-1)?.checks || [];
    const quoteRows = [];
    for (const source of ['sina', 'tencent']) for (const code of codes) {
      const current = latest.find((check) => check.ok && check.kind === 'quote' && check.source === source)?.data?.find((row) => row.code === code);
      const saved = read(join(runtime, 'quote-cache', `${source}-${code}.json`), {});
      const useCurrent = current && (!saved.data || Date.parse(current.source_time) >= Date.parse(saved.data.source_time));
      const row = useCurrent ? current : saved.data;
      if (!row) continue;
      const age = (now().getTime() - Date.parse(row.source_time)) / 1000;
      quoteRows.push({ ...row, age_seconds: Math.round(age), fresh: !!useCurrent && market === 'trading' && age >= 0 && age <= 90,
        cached: !useCurrent, received_at: useCurrent ? latest.find((c) => c.source === source && c.kind === 'quote')?.receipt_by_code?.[code]
          || latest.find((c) => c.source === source && c.kind === 'quote')?.received_at : saved.received_at });
    }
    const readyCodes = new Set(quoteRows.filter((row) => row.fresh).map((row) => row.code));
    const minutes = minuteCodes.map((code) => {
      const candidates = latest.filter((check) => check.kind === 'minute' && check.code === code && (check.selected !== false || !check.ok));
      const current = candidates.find((check) => check.ok) || candidates.at(-1);
      const saved = light ? read(join(runtime, 'minute-cache', code + '.meta.json'), null) || read(join(runtime, 'minute-cache', code + '.json'), {})
        : read(join(runtime, 'minute-cache', code + '.json'), {});
      const useCurrent = current?.ok && (!saved.data || Date.parse(current.data.source_time) >= Date.parse(saved.data.source_time));
      const data = useCurrent ? current.data : saved.data;
      const age = data ? (now().getTime() - Date.parse(data.source_time)) / 1000 : Infinity;
      const payload = light && data ? Object.fromEntries(Object.entries(data).filter(([key]) => !['rows', 'pending_rows'].includes(key))) : data;
      return { code, data: payload, received_at: useCurrent ? current.received_at : saved.received_at,
        current_ok: !!useCurrent, cached: !!data && !useCurrent, fresh: !!useCurrent && market === 'trading' && age >= 0 && age <= 180,
        error: current && !current.ok ? current.error || current.reason || '校验未通过' : current?.ok && !useCurrent ? '本轮时间倒退，保留较新的成功数据' : '',
        source_failures: candidates.filter((check) => !check.ok).map((check) => ({ source: check.source, error: check.error })),
        run_id: useCurrent ? report.run_id : saved.run_id };
    });
    const running = !!child || externalAlive();
    const auditCodes = (activePool?.audit_codes || cfg.minute_audit_codes || codes.slice(0, 3)).filter((code) => minuteCodes.includes(code)).slice(0, 3);
    const minuteAudit = { ...report.minute_audit, codes: auditCodes, samples: auditCodes.map((code) => {
      const saved = read(join(runtime, 'minute-audit', code + '.json'), null);
      if (!saved) return { code, state: 'not_observed' };
      const { history, bar_evidence, ...audit } = saved;
      const displayed = minutes.find((entry) => entry.code === code);
      return { ...audit, current_run: !awaitingNewReport && saved.run_id === report.run_id && saved.day === beijingDay(now()),
        matches_displayed_series: !!displayed?.data?.version && saved.version === displayed.data.version && saved.source === displayed.data.source };
    }) };
    return { ...report, codes, minute_codes:minuteCodes, configured_pool_version:cfg.pool_version, running_pool_version:activePool?.pool_version || report.pool_version,
      pool_pending:!!cfg.pool_version && (activePool?.pool_version || report.pool_version)!==cfg.pool_version,
      state: running ? 'running' : error ? 'failed' : report.state === 'running' ? 'interrupted' : report.state,
      error, current_context: market, fresh: !!codes.length && readyCodes.size === codes.length, fresh_stocks: readyCodes.size,
      current_quote_stocks: new Set(quoteRows.filter((q) => !q.cached).map((q) => q.code)).size,
      automatic_enabled: !!cfg.automatic_enabled, account_connected: false, minutes,
      scheduler: { interval_seconds: policy.interval_seconds, next_start_at: cfg.automatic_enabled && market === 'trading' ? policy.next_start_at : null,
        last_tick_at: lastTickAt,
        next_session_at: cfg.automatic_enabled && market !== 'trading' ? nextTradingStart(now(), read(join(projectRoot, 'outputs', 'live-market-data', 'calendar.json'), {}).dates) : null,
        waiting_for_session: market !== 'trading', active: policy.active || external, good_cycles: policy.good_cycles,
        notices: policy.notices, history: light ? policy.history.slice(-20) : policy.history, service_required: true },
      storage: report.storage || read(join(runtime, 'storage-status.json'), { state: 'not_initialized', mode: 'shadow' }),
      source_health: read(join(runtime, 'provider-health.json'), {}),
      backfill: { ...read(join(runtime, 'backfill-status.json'), report.backfill || { state: 'not_initialized' }),
        enabled: config().backfill?.enabled !== false, worker_running: backfillAlive(), preempting: !!backfillProcess?.stopping,
        pending_latest: pendingLatest, worker_error: backfillError },
      minute_audit: minuteAudit,
      validation: validation(), validation_session: validationSession(),
      rounds: report.rounds?.map((round) => ({ ...round, checks: round.checks.map(({ data, ...check }) => check) })) || [],
      quotes: quoteRows, latest_checks: latest.map((check) => ({ ...check, data: check.kind === 'minute' && check.data
        ? light ? Object.fromEntries(Object.entries(check.data).filter(([key]) => !['rows', 'pending_rows'].includes(key))) : { ...check.data, rows: (check.data.rows || []).slice(-3) } : undefined })),
      elapsed_seconds: child ? Math.round((now().getTime() - started) / 1000) : report.elapsed_seconds,
      warning: running && policy.active?.deadline_seconds > 60 ? policy.notices.at(-1)?.message : '', displayed_at: now().toISOString() };
  }
  function minute(code) {
    if (!/^\d{6}$/.test(code)) return null;
    const info = status({ light: true }).minutes.find((entry) => entry.code === code);
    if(!info)return null;
    const saved = read(join(runtime, 'minute-cache', code + '.json'), {});
    if (!saved.data) return { ...info, code, data: null };
    const sameVersion = info?.data?.version && info.data.version === saved.data.version;
    return { ...info, code, data: saved.data, received_at: saved.received_at, run_id: saved.run_id,
      cached: sameVersion ? info.cached : true, current_ok: sameVersion ? info.current_ok : false,
      fresh: sameVersion ? info.fresh : false };
  }
  function stopOwned(owned) {
    if (process.platform === 'win32' && owned.pid) {
      const killer = spawnProcess('taskkill.exe', ['/PID', String(owned.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => { error = '结束超时进程失败；停止新采集，等待原进程退出。'; });
    } else owned.kill('SIGKILL');
  }
  function start(source = 'manual') {
    if (child || externalAlive()) return { accepted: false, reason: '上一轮采集仍在运行' };
    const previous = read(reportPath, {});
    if ((policy.cooldown_until || 0) > now().getTime()) return { accepted: false, reason: '数据源要求冷却，稍后再试。' };
    if (source === 'manual' && previous.finished_at && now().getTime() - Date.parse(previous.finished_at) < 30_000) return { accepted: false, reason: '为避免频繁请求，请在上次采集完成30秒后再试。' };
    const cfg = config();
    if (source === 'automatic' && (!cfg.automatic_enabled || context() !== 'trading')) return { accepted: false, reason: '非交易时段或自动更新暂停' };
    if (backfillAlive()) {
      pendingLatest = source; stopBackfill('latest_data_priority');
      return { accepted: true, queued: true, reason: '补采正在让路，退出后立即启动最新采集' };
    }
    error = ''; started = now().getTime();
    beginCycle(policy, now(), previous.run_id);
    try {
      policy.active.pool_codes=cfg.codes;policy.active.minute_codes=cfg.minute_codes||cfg.codes;policy.active.pool_version=cfg.pool_version;
      policy.active.audit_codes=cfg.minute_audit_codes;
      const args = [join(projectRoot, 'tools', 'intraday_probe.py'), '--config', snapshotConfig(projectRoot,cfg,'intraday'), '--runtime', runtime];
      if (source === 'automatic') args.push('--automatic');
      child = spawnProcess(python, args, { cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' } });
      policy.active.pid = child.pid;
      policy.active.source = source;
      persist();
    } catch {
      child = null; error = '采集进程无法启动';
      finishCycle(policy, { now: now(), report: {}, eligible: false, error }); persist();
      return { accepted: false, reason: error };
    }
    const owned = child;
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (data) => appendFileSync(join(runtime, 'worker.log'), data));
    const watchdog = setInterval(() => { if (watchCycle(policy, now())) stopOwned(owned); persist(); }, 1000);
    watchdog.unref();
    child.once('error', () => { error = '采集进程启动失败，请检查本地运行环境'; });
    child.once('close', (code) => {
      clearInterval(watchdog); child = null;
      const cycleStart = policy.active?.started_at;
      const report = read(reportPath, {}), quality = recoveryQuality(report, now());
      if (code !== 0 && !error) error = '本轮采集未完成，请查看来源失败记录。';
      if (!error && (report.run_id === policy.active?.previous_run || report.state === 'running')) error = '后台结束但未产生完整的新运行记录，保留上次数据。';
      // A failed individual provider must not delay healthy alternatives. Only all-unavailable cooldowns block the whole task.
      const providers = read(join(runtime, 'provider-health.json'), {});
      const blocks = (kind, sources) => sources.map((s) => (providers[s + '.' + kind]?.blocked_until || 0) * 1000);
      const quoteCooldown = Math.min(...blocks('quote', ['sina', 'tencent']));
      const minuteCooldown = Math.min(...blocks('minute', ['sina', 'eastmoney']));
      const cooldownUntil = Math.max(quoteCooldown > now().getTime() ? quoteCooldown : 0, minuteCooldown > now().getTime() ? minuteCooldown : 0);
      if (context() !== 'trading' && code === 0 && !error && !policy.active?.stopping) {
        // Closing/lunch samples cannot prove live freshness or count towards recovery.
        policy.history = [...policy.history, { at: now().toISOString(), run_id: report.run_id,
          elapsed_seconds: (now().getTime() - started) / 1000, complete: false, advanced: false,
          observation_only: true, interval_seconds: policy.interval_seconds,
          quotes: report.coverage?.quotes || 0, minutes: report.coverage?.minutes || 0 }].slice(-120);
        policy.active = null; policy.good_cycles = 0; policy.next_start_at = null;
      } else finishCycle(policy, { now: now(), report, eligible: quality.eligible,
        sourceTimes: quality.times, cooldownUntil, error });
      const cycle = policy.history.at(-1);
      if (cycle) {
        cycle.trigger = source;
        const record = validationRecord(report, { ...cycle, started_at: cycleStart }, { context: context(), now: now(), trigger: source });
        const folder = join(runtime, 'validation'); mkdirSync(folder, { recursive: true });
        appendFileSync(join(folder, beijingDay(now()) + '.jsonl'), JSON.stringify(record) + '\n', 'utf8');
      }
      persist();
    });
    return { accepted: true };
  }
  function tick() {
    lastTickAt = now().toISOString();
    if (child) {
      if (backfillAlive()) stopBackfill('latest_data_priority');
      if (watchCycle(policy, now())) stopOwned(child);
      persist(); return;
    }
    if (externalAlive()) { if (backfillAlive()) stopBackfill('latest_data_priority'); return; }
    if (backfillAlive()) {
      if (context() === 'trading' || context() === 'calendar_unknown' || now().getTime() - Date.parse(backfillProcess.started_at) > 20_000) stopBackfill('yield_or_timeout');
      return;
    }
    if (pendingLatest) { const source = pendingLatest; pendingLatest = null; start(source); return; }
    if (context() !== 'trading') {
      if (context() !== 'calendar_unknown' && config().backfill?.enabled !== false && now().getTime() - lastBackfillAt >= 60_000) startBackfill();
      return;
    }
    if (!config().automatic_enabled) return;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
    const pool = [...(config().codes || [])].sort().join(',');
    if (policy.session_day !== day || policy.session_pool !== pool) {
      policy.session_day = day; policy.session_pool = pool; policy.good_cycles = 0; policy.source_times = {};
    }
    if (policy.next_start_at && now().getTime() < Date.parse(policy.next_start_at)) return;
    start('automatic');
  }
  function schedule() {
    if (timer) return () => clearInterval(timer);
    timer = setInterval(() => { try { tick(); } catch (e) { console.error('[intraday]', e.message); } }, 1000);
    timer.unref();
    return () => { clearInterval(timer); timer = null; };
  }
  function setAutomatic(enabled) {
    const cfg = read(configPath,{}); cfg.automatic_enabled = !!enabled; write(configPath, cfg);
    notify(policy, enabled ? 'enabled' : 'paused', enabled ? '交易时段自动更新已启用。' : '自动更新已暂停；当前采集可完成。', now());
    persist(); return { enabled: !!enabled };
  }
  function health(){return {mode:'combined',automatic_enabled:!!config().automatic_enabled,scheduled:!!timer,
    scheduler_last_tick_at:lastTickAt,current_context:context(),lanes:{combined:{running:!!child||externalAlive(),
      started_at:policy.active?.started_at||null,last_completed_at:policy.history?.at(-1)?.at||null,
      interval_seconds:policy.interval_seconds||60,target_seconds:60,next_start_at:policy.next_start_at||null,enabled:!!config().codes?.length}}};}
  return { status, start, tick, schedule, health, setAutomatic, validation, minute, validationSession, beginValidation, startBackfill, setBackfillEnabled,
    preemptBackfill:()=>stopBackfill('split_latest_priority'),
    backgroundBusy:()=>!!child||externalAlive()||backfillAlive()||!!pendingLatest };
}
