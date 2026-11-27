import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readLibrary,effectiveConfig,snapshotConfig,dailyPoolHash } from './stock-library.mjs';

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function optionalJson(path, fallback = null) {
  try { return readJson(path, fallback); } catch { return fallback; }
}

function chinaParts(now) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return { day, clock: `${values.hour}:${values.minute}` };
}

export function chinaSlot(now, scheduleTime) {
  const { day, clock } = chinaParts(now);
  return clock >= scheduleTime ? `${day}:eod` : `${day}:previous-close`;
}

export function expectedDailyDate(dates, now, completedAfter) {
  const { day, clock } = chinaParts(now);
  if (!dates.length || [...dates].sort().at(-1) < day) return null;
  return dates.filter((date) => date < day || date === day && clock >= completedAfter).sort().at(-1) || null;
}

export function createMarketDataController({ projectRoot, platformRoot, python, runtimeDir, spawnProcess = spawn, now = () => new Date() }) {
  const configPath = join(platformRoot, 'config', 'market-data.json');
  const runtime = runtimeDir || process.env.M_QUANT_MARKET_DATA_DIR || join(projectRoot, 'outputs', 'live-market-data');
  const statusPath = join(runtime, 'status.json');
  let child = null, activeConfig = null;

  function configuration() { return effectiveConfig(readJson(configPath),readLibrary(projectRoot),'daily'); }
  function rawStatus() {
    try { return readJson(statusPath, {}); }
    catch { return { state: 'failed', message: '更新记录损坏，需要重新校验；未将旧数据标为最新。' }; }
  }
  function running(state = rawStatus()) {
    if (child) return true;
    if (state.state !== 'running' || !state.pid) return false;
    try { process.kill(state.pid, 0); return true; } catch { return false; }
  }
  function status() {
    const config = configuration();
    const state = rawStatus();
    if (running(state)) state.state = 'running';
    else if (state.state === 'running') {
      state.state = 'failed';
      state.message = '上次更新中断；保留上次成功快照，等待重新更新。';
    }
    const calendar = readJson(join(runtime, 'calendar.json'), { dates: [] });
    const expected = expectedDailyDate(calendar.dates || [], now(), config.completed_bar_after);
    if (expected) state.expected_date = expected;
    if (['ready', 'attention'].includes(state.state) && (!expected || state.last_success?.data_date !== expected)) {
      state.state = 'stale';
      state.message = expected ? `最近完整交易日为 ${expected}，等待新行情通过校验。` : '交易日历需要更新，当前不能确认行情时效。';
    }
    if (['ready','attention'].includes(state.state) && dailyPoolHash(config) && state.last_success?.pool_hash!==dailyPoolHash(config)) {
      state.state='stale';state.message='日线股票池已变化，新名单尚未完成数据准备；旧快照保留。';
      state.previous_coverage=state.coverage;state.coverage={total:config.managed_symbols.length,completed:0,fresh:0,failed:0};
    }
    const scheduler = optionalJson(join(runtime, 'scheduler-status.json'));
    if (scheduler?.state === 'running' && scheduler.wrapper_pid) {
      try { process.kill(scheduler.wrapper_pid, 0); } catch {
        scheduler.state = 'failed'; scheduler.message = '系统任务执行中断，需检查回执和错误日志；行情状态单独显示。';
      }
    }
    return { ...state, state: state.state || 'not_started', label: state.state==='running'?(activeConfig?.label||state.label||config.label):config.label, profile: config.profile,
      enabled: config.enabled, schedule_time: config.schedule_time, timezone: config.timezone,configured_pool_version:config.pool_version,
      running_pool_version:activeConfig?.pool_version||state.pool_version,pool_pending:!!config.pool_version&&(activeConfig?.pool_version||state.pool_version)!==config.pool_version,
      scheduler,
      recent_runs: existsSync(join(runtime, 'runs')) ? readdirSync(join(runtime, 'runs')).filter((name) => name.endsWith('.json')).sort().reverse().slice(0, 10).map((name) => {
        const run = optionalJson(join(runtime, 'runs', name), {});
        return { run_id: run.run_id, state: run.state, data_date: run.last_success?.data_date, expected_date: run.expected_date,
          started_at: run.started_at, finished_at: run.finished_at, coverage: run.coverage, metrics: run.metrics };
      }) : [],
      scope_note: '仅更新配置中的股票池，不代表全市场完成；观察信号不改变策略准入。' };
  }
  function signals() {
    const state = status();
    if (state.state !== 'ready' || !state.last_success?.signals || state.last_success.data_date !== state.expected_date) {
      return { available: false, reason: state.message || '尚无通过检查的新观察信号。' };
    }
    const pack = readJson(resolve(projectRoot, state.last_success.signals));
    if (pack?.signal_date !== state.expected_date || !pack?.observation_only || pack.routes?.some((route) => route.action !== 'record_only')) {
      return { available: false, reason: '信号日期或观察状态未通过校验。' };
    }
    return { available: true, ...pack, universe_label: state.label, stocks: state.last_success.stocks };
  }
  function start(source = 'manual') {
    if (running()) return { accepted: false, status: status() };
    const config = configuration();
    mkdirSync(runtime, { recursive: true });
    const autoKey = chinaSlot(now(), config.schedule_time);
    const logPath = join(runtime, 'worker.log');
    const args = [join(projectRoot, 'tools', 'market_data_refresh.py'), '--config', snapshotConfig(projectRoot,config,'daily'), '--runtime', runtime, '--auto-key', autoKey];
    if (source === 'automatic') args.push('--automatic');
    activeConfig=config;
    child = spawnProcess(python, args, {
      cwd: projectRoot, windowsHide: true, timeout: 1_800_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (data) => appendFileSync(logPath, data));
    }
    let spawnError = '';
    const ownedPid = child.pid;
    child.once('error', (error) => { spawnError = String(error.message); });
    child.once('close', (code) => {
      child = null; activeConfig=null;
      const state = rawStatus();
      if (state.state === 'running' && state.pid && ownedPid && state.pid !== ownedPid && running(state)) return;
      if (code === 0 && state.pid !== ownedPid && !spawnError) return; // locked/automatic skip; no owned run was created
      if (spawnError || state.state === 'running' || !state.state) {
        const failure = { ...state, state: 'failed', message: spawnError || `更新进程异常结束（${code}），未确认新数据完整。`, updated_at: now().toISOString(), auto_key: autoKey,
          auto_attempts: (state.auto_key === autoKey ? state.auto_attempts || 0 : 0) + 1 };
        const temporary = statusPath + '.' + randomUUID() + '.tmp';
        writeFileSync(temporary, JSON.stringify(failure, null, 2));
        renameSync(temporary, statusPath);
      }
    });
    return { accepted: true, source, status: { ...status(), state: 'running' } };
  }
  function tick() {
    const config = configuration();
    if (!config.enabled || running()) return;
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(now());
    if (['Sat', 'Sun'].includes(weekday)) return;
    const state = rawStatus();
    const key = chinaSlot(now(), config.schedule_time);
    if (state.auto_key === key) {
      if (state.state === 'ready') return; // Pool changes are reflected by status; daily auto slot remains bounded.
      if ((state.auto_attempts || 0) >= config.max_auto_attempts_per_slot) return;
      const elapsed = now().getTime() - Date.parse(state.updated_at || state.started_at || 0);
      if (elapsed < config.retry_interval_minutes * 60_000) return;
    }
    start('automatic');
  }
  function schedule() {
    const safeTick = () => { try { tick(); } catch (error) { console.error('[market-data]', error.message); } };
    const first = setTimeout(safeTick, 10_000);
    const timer = setInterval(safeTick, 60_000);
    first.unref(); timer.unref();
    return () => { clearTimeout(first); clearInterval(timer); };
  }
  return { status, signals, start, tick, schedule, isRunning:()=>running() };
}
