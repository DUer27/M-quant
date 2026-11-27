import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIntradayTrial, currentContext } from '../intraday-trial.mjs';

function fixture(now = new Date('2026-11-24T02:01:00Z'), automatic = false) {
  const root = mkdtempSync(join(tmpdir(), 'mquant-intraday-'));
  const runtime = join(root, 'outputs/live-market-data/intraday-trial');
  mkdirSync(runtime, { recursive: true });
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'config/intraday-trial.json'), JSON.stringify({ automatic_enabled: automatic, codes: ['000001'] }));
  writeFileSync(join(root, 'outputs/live-market-data/calendar.json'), JSON.stringify({ dates: ['2026-11-23', '2026-11-24', '2026-11-25'] }));
  const fake = new EventEmitter(); let calls = 0, args;
  const controller = createIntradayTrial({ projectRoot: root, platformRoot: root, python: 'fixture', now: () => now,
    spawnProcess: (...value) => { calls++; args = value; return fake; } });
  return { controller, fake, runtime, calls: () => calls, args: () => args, advance: (seconds) => now.setTime(now.getTime() + seconds * 1000), state: (value) => writeFileSync(join(runtime, 'status.json'), JSON.stringify(value)) };
}

test('session uses Beijing calendar and lunch pause', () => {
  assert.equal(currentContext(new Date('2026-11-24T04:00:00Z'), ['2026-11-24']), 'market_closed');
  assert.equal(currentContext(new Date('2026-11-24T02:00:00Z'), ['2026-11-24']), 'trading');
  assert.equal(currentContext(new Date('2026-11-24T02:00:00Z'), []), 'calendar_unknown');
});

test('independent validation window preserves daily failures and filters by start and collection profile', () => {
  const f = fixture(undefined, true);
  const previous = { run_id: 'old', record_id: 'old', at: '2026-11-24T02:00:30Z', started_at: '2026-11-24T02:00:00Z',
    trigger: 'automatic', codes: ['000001'], complete: false, advanced: false, elapsed_seconds: 10 };
  const folder = join(f.runtime, 'validation'); mkdirSync(folder);
  const path = join(folder, '2026-11-24.jsonl');
  writeFileSync(path, JSON.stringify(previous) + '\n');
  const begun = f.controller.beginValidation(); assert.equal(begun.accepted, true);
  f.advance(60);
  const good = { ...previous, run_id: 'new', record_id: 'new', started_at: '2026-11-24T02:01:10Z',
    at: '2026-11-24T02:01:40Z', complete: true, advanced: true, collection_profile: 'symbol-recovery.v3:eastmoney,sina' };
  const wrongProfile = { ...good, run_id: 'wrong', record_id: 'wrong', collection_profile: 'legacy' };
  writeFileSync(path, [previous, good, wrongProfile].map(r => JSON.stringify(r)).join('\n') + '\n');
  assert.equal(f.controller.validation().automatic_runs, 3);
  assert.equal(f.controller.validationSession().summary.automatic_runs, 1);
  assert.equal(f.controller.validationSession().summary.complete_rate, 1);
  assert.equal(f.controller.validationSession().summary.excluded_outside_session, 2);
  assert.equal(f.controller.validationSession().configuration_changed, false);
});

test('validation window refuses paused or nontrading start and flags configuration changes', () => {
  const paused = fixture(); assert.equal(paused.controller.beginValidation().accepted, false);
  const closed = fixture(new Date('2026-11-24T04:00:00Z'), true); assert.equal(closed.controller.beginValidation().accepted, false);
  const f = fixture(undefined, true); assert.equal(f.controller.beginValidation().accepted, true);
  // Locate the fixture config from the known root rather than changing any real config.
  const rootConfig = join(f.runtime, '..', '..', '..', 'config', 'intraday-trial.json');
  writeFileSync(rootConfig, JSON.stringify({ automatic_enabled: true, codes: ['000001'], minute_source_order: ['sina','eastmoney'] }));
  const session = f.controller.validationSession();
  assert.equal(session.configuration_changed, true); assert.equal(session.summary.ready_for_review, false);
});

test('old quotes remain stale even when collection succeeds quickly', () => {
  const f = fixture();
  f.state({ state: 'sample_available', codes: ['000001'], rounds: [{ checks: [{ ok: true, kind: 'quote', data: [{ code: '000001', source_time: '2026-11-23T15:00:00+08:00' }] }] }] });
  assert.equal(f.controller.status().fresh, false);
  assert.equal(f.controller.status().fresh_stocks, 0);
});

test('a quote loses freshness as wall-clock time advances and after hours is explicit', () => {
  const f = fixture(new Date('2026-11-24T11:00:00Z'));
  f.state({ state: 'sample_available', codes: ['000001'], rounds: [{ checks: [{ ok: true, kind: 'quote', data: [{ code: '000001', source_time: '2026-11-24T18:59:45+08:00' }] }] }] });
  assert.equal(f.controller.status().fresh, false);
  assert.equal(f.controller.status().current_context, 'market_closed');
});

test('only one worker runs, failure is visible and current status never enables automation', () => {
  const f = fixture();
  assert.equal(f.controller.start().accepted, true);
  assert.equal(f.controller.start().accepted, false);
  assert.equal(f.calls(), 1);
  assert.equal(f.controller.status().state, 'running');
  f.fake.emit('error', new Error('fixture'));
  f.fake.emit('close', 1);
  assert.equal(f.controller.status().state, 'failed');
  assert.equal(f.controller.status().automatic_enabled, false);
});

test('recent completed trial is throttled', () => {
  const f = fixture();
  f.state({ finished_at: '2026-11-24T10:00:45+08:00' });
  assert.equal(f.controller.start().accepted, false);
  assert.equal(f.calls(), 0);
});

test('minute fallback chooses a whole successful series and retains the failed source result', () => {
  const f = fixture();
  f.state({ state: 'sample_available', codes: ['000001'], rounds: [{ checks: [
    { kind: 'minute', code: '000001', source: 'eastmoney', ok: false, error: 'ProxyError' },
    { kind: 'minute', code: '000001', source: 'sina', ok: true, received_at: '2026-11-24T10:00:00+08:00', data: {
      source: 'sina.minute', rows: [{ time: '2026-11-24T09:59:00+08:00', close: 10, volume_shares: 100 }] } }
  ] }] });
  const minute = f.controller.status().minutes[0];
  assert.equal(minute.current_ok, true);
  assert.equal(minute.data.source, 'sina.minute');
  assert.equal(minute.source_failures[0].error, 'ProxyError');
  assert.equal(minute.data.rows.length, 1);
});

test('failed minute update retains the previous successful series with an explicit cache flag', () => {
  const f = fixture();
  mkdirSync(join(f.runtime, 'minute-cache'));
  const rows = [{ time: '2026-11-23T15:00:00+08:00', close: 10, volume_shares: 100 }];
  writeFileSync(join(f.runtime, 'minute-cache/000001.json'), JSON.stringify({ data: { source: 'sina.minute', rows }, run_id: 'previous', received_at: '2026-11-23T15:01:00+08:00' }));
  f.state({ codes: ['000001'], rounds: [{ checks: [{ code: '000001', kind: 'minute', ok: false, error: 'fixture failed' }] }] });
  const minute = f.controller.status().minutes[0];
  assert.equal(minute.cached, true);
  assert.equal(minute.current_ok, false);
  assert.equal(minute.run_id, 'previous');
  assert.equal(minute.data.rows[0].time, rows[0].time);
  assert.equal(minute.error, 'fixture failed');
});

test('enabled schedule starts a worker in trading hours, never overlaps, and pause prevents next starts', () => {
  const f = fixture(undefined, true);
  f.controller.tick(); assert.equal(f.calls(), 1);
  assert.ok(f.args()[1].includes('--automatic'));
  f.controller.tick(); assert.equal(f.calls(), 1);
  f.controller.setAutomatic(false);
  assert.equal(f.controller.status().automatic_enabled, false);
  f.fake.emit('close', 1); f.advance(600); f.controller.tick();
  assert.equal(f.calls(), 1);
});

test('automatic schedule never starts during lunch, weekends, after hours or unknown calendar', () => {
  for (const time of ['2026-11-24T04:00:00Z','2026-11-24T11:00:00Z','2026-11-22T02:00:00Z','2027-01-01T02:00:00Z']) {
    const f = fixture(new Date(time), true);
    f.controller.tick(); assert.equal(f.calls(), 0);
  }
});

test('quote failure retains previous success explicitly and never contributes to current fresh coverage', () => {
  const f = fixture();
  mkdirSync(join(f.runtime, 'quote-cache'));
  writeFileSync(join(f.runtime, 'quote-cache/sina-000001.json'), JSON.stringify({ data: { code: '000001', source: 'sina.quote', source_time: '2026-11-24T10:00:50+08:00' }, received_at: '2026-11-24T10:00:55+08:00' }));
  f.state({ codes: ['000001'], rounds: [{ checks: [{ source: 'sina', kind: 'quote', ok: false }] }] });
  const s = f.controller.status();
  assert.equal(s.quotes.length, 1); assert.equal(s.quotes[0].cached, true);
  assert.equal(s.fresh, false); assert.equal(s.current_quote_stocks, 0);
});

test('watchdog expands deadlines and keeps ownership until worker close after a hard timeout', () => {
  const f = fixture(); f.controller.start();
  f.advance(60); f.controller.tick();
  assert.equal(f.controller.status().scheduler.interval_seconds, 120);
  f.advance(60); f.controller.tick();
  assert.equal(f.controller.status().scheduler.interval_seconds, 180);
  f.advance(60);
  // Test process-tree termination using an injected worker with a kill method and no pid.
  f.fake.kill = () => {};
  f.controller.tick(); assert.equal(f.controller.start().accepted, false);
  f.fake.emit('close', 1);
  assert.equal(f.controller.status().scheduler.interval_seconds, 300);
  assert.equal(f.controller.start().accepted, false);
});

test('automatic cadence can start at the next minute after a 51-second run', () => {
  const f = fixture(undefined, true);
  f.controller.start('automatic');
  f.advance(51);
  const now = new Date('2026-11-24T02:01:51Z').toISOString();
  f.state({ run_id: 'new', state: 'sample_available', codes: ['000001'], finished_at: now, rounds: [{ checks: [
    { kind: 'quote', source: 'sina', ok: true, data: [{ code: '000001', source_time: now }] },
    { kind: 'minute', code: '000001', ok: true, data: { source_time: now, rows: [{}] } }
  ] }] });
  f.fake.emit('close', 0);
  assert.equal(f.controller.validation().automatic_runs, 1);
  assert.equal(f.controller.validation().ready_for_review, false);
  f.advance(9); f.controller.tick();
  assert.equal(f.calls(), 2);
  f.fake.emit('close', 1);
});

test('regressed provider data never replaces a newer saved quote or minute series', () => {
  const f = fixture();
  mkdirSync(join(f.runtime, 'quote-cache')); mkdirSync(join(f.runtime, 'minute-cache'));
  const newer = '2026-11-24T10:00:50+08:00', older = '2026-11-24T10:00:00+08:00';
  writeFileSync(join(f.runtime, 'quote-cache/sina-000001.json'), JSON.stringify({ data: { code: '000001', source_time: newer } }));
  writeFileSync(join(f.runtime, 'minute-cache/000001.json'), JSON.stringify({ data: { source_time: newer, rows: [] } }));
  f.state({ codes: ['000001'], rounds: [{ checks: [
    { kind: 'quote', source: 'sina', ok: true, data: [{ code: '000001', source_time: older }] },
    { kind: 'minute', code: '000001', ok: true, data: { source_time: older, rows: [] } }
  ] }] });
  const s = f.controller.status();
  assert.equal(s.quotes[0].source_time, newer); assert.equal(s.quotes[0].cached, true);
  assert.equal(s.minutes[0].data.source_time, newer); assert.equal(s.minutes[0].current_ok, false);
  assert.match(s.minutes[0].error, /倒退/);
});

test('newly launched cycle does not count the previous report as a new successful fetch', () => {
  const f = fixture();
  f.state({ run_id: 'previous', codes: ['000001'], rounds: [{ checks: [{ kind: 'quote', source: 'sina', ok: true,
    data: [{ code: '000001', source_time: '2026-11-24T10:00:50+08:00' }] }] }] });
  f.controller.start();
  assert.equal(f.controller.status().current_quote_stocks, 0);
  f.fake.emit('close', 0);
  assert.equal(f.controller.status().state, 'failed');
  assert.match(f.controller.status().error, /新运行记录/);
});

test('light summary omits all minute rows and single-stock endpoint rejects unconfigured paths', () => {
  const f=fixture(); mkdirSync(join(f.runtime,'minute-cache'));
  const data={source:'sina.minute',code:'000001',source_time:'2026-11-24T10:00:00+08:00',version:'v1',count:2,
    rows:[{time:'2026-11-24T09:59:00+08:00',close:10},{time:'2026-11-24T10:00:00+08:00',close:11}]};
  const saved={data,received_at:'2026-11-24T10:00:10+08:00',run_id:'fixture'};
  writeFileSync(join(f.runtime,'minute-cache/000001.json'),JSON.stringify(saved));
  writeFileSync(join(f.runtime,'minute-cache/000001.meta.json'),JSON.stringify({...saved,data:{...data,rows:undefined}}));
  f.state({run_id:'fixture',codes:['000001'],rounds:[{checks:[{kind:'minute',code:'000001',ok:true,data}]}]});
  const summary=f.controller.status({light:true});
  assert.equal(summary.minutes[0].data.rows,undefined);
  assert.equal(summary.latest_checks[0].data.rows,undefined);
  assert.equal(summary.minutes[0].data.version,'v1');
  assert.equal(f.controller.minute('000001').data.rows.length,2);
  assert.equal(f.controller.minute('000001').cached,false);
  writeFileSync(join(f.runtime,'minute-cache/000001.json'),JSON.stringify({...saved,data:{...data,version:'v2'}}));
  assert.equal(f.controller.minute('000001').cached,true);
  assert.equal(f.controller.minute('000001').fresh,false);
  assert.equal(f.controller.minute('000001').current_ok,false);
  assert.equal(f.controller.minute('../status'),null);
  assert.equal(f.controller.minute('000063'),null);
});

test('minute audit summary does not present an old day or mismatched series as current', () => {
  const f = fixture(); mkdirSync(join(f.runtime, 'minute-audit'));
  const audit = { code: '000001', day: '2026-11-24', source: 'sina.minute', version: 'v1', run_id: 'a',
    row_count: 30, history: [{ run_id: 'a' }] };
  const state = { run_id: 'a', codes: ['000001'], rounds: [{ checks: [{ kind: 'minute', code: '000001', ok: true,
    data: { source: 'sina.minute', source_time: '2026-11-24T10:00:00+08:00', version: 'v1' } }] }] };
  f.state(state);
  const path = join(f.runtime, 'minute-audit/000001.json');
  writeFileSync(path, JSON.stringify(audit));
  let summary = f.controller.status({ light: true }).minute_audit.samples[0];
  assert.equal(summary.current_run, true); assert.equal(summary.matches_displayed_series, true);
  assert.equal(summary.history, undefined);
  writeFileSync(path, JSON.stringify({ ...audit, version: 'old' }));
  assert.equal(f.controller.status({ light: true }).minute_audit.samples[0].matches_displayed_series, false);
  writeFileSync(path, JSON.stringify({ ...audit, day: '2026-11-23' }));
  assert.equal(f.controller.status({ light: true }).minute_audit.samples[0].current_run, false);
});

test('summary uses the selected minute recovery and the actual per-symbol quote receipt', () => {
  const f=fixture();
  const receipt='2026-11-24T10:00:55+08:00';
  f.state({codes:['000001'],rounds:[{checks:[
    {kind:'quote',source:'sina',ok:true,received_at:'2026-11-24T10:00:10+08:00',receipt_by_code:{'000001':receipt},
      data:[{code:'000001',source:'sina.quote',source_time:'2026-11-24T10:00:50+08:00'}]},
    {kind:'minute',code:'000001',ok:true,selected:false,data:{source:'sina.minute',source_time:'2026-11-24T09:50:00+08:00',rows:[{}]}},
    {kind:'minute',code:'000001',ok:true,selected:true,stage:'recovery',data:{source:'eastmoney.minute',source_time:'2026-11-24T10:00:00+08:00',rows:[{}]}},
  ]}]});
  const summary=f.controller.status({light:true});
  assert.equal(summary.minutes[0].data.source,'eastmoney.minute');assert.equal(summary.minutes[0].current_ok,true);
  assert.equal(summary.quotes[0].received_at,receipt);
});

test('backfill is closed-session only and manual latest collection preempts before spawning', () => {
  const f=fixture(new Date('2026-11-24T08:00:00Z'),true);
  writeFileSync(join(f.runtime,'backfill-status.json'),JSON.stringify({counts:{pending:1}}));
  f.fake.kill=()=>{f.fake.stopped=true;};
  assert.equal(f.controller.startBackfill().accepted,true);assert.equal(f.calls(),1);
  assert.ok(f.args()[1].includes('work-one'));
  const latest=f.controller.start();assert.equal(latest.accepted,true);assert.equal(latest.queued,true);
  assert.equal(f.fake.stopped,true);assert.equal(f.calls(),1);
  f.fake.emit('close',1);assert.equal(f.calls(),2);
  assert.ok(f.args()[1][0].endsWith('intraday_probe.py'));
  f.fake.emit('close',1);
  const trading=fixture(undefined,true);
  writeFileSync(join(trading.runtime,'backfill-status.json'),JSON.stringify({counts:{pending:1}}));
  assert.equal(trading.controller.startBackfill().accepted,false);assert.equal(trading.calls(),0);
});

test('backfill pause retains queue and latest active worker prevents backfill launch', () => {
  const f=fixture(new Date('2026-11-24T08:00:00Z'),true);
  writeFileSync(join(f.runtime,'backfill-status.json'),JSON.stringify({counts:{pending:1}}));
  assert.equal(f.controller.setBackfillEnabled(false).enabled,false);
  assert.equal(f.controller.startBackfill().accepted,false);
  f.controller.setBackfillEnabled(true);f.controller.start();
  assert.equal(f.controller.startBackfill().accepted,false);assert.equal(f.calls(),1);
  f.fake.emit('close',1);
});

test('trading session takeover stops background backfill and waits for release', () => {
  const f=fixture(new Date('2026-11-24T04:59:59Z'),true);
  writeFileSync(join(f.runtime,'backfill-status.json'),JSON.stringify({counts:{pending:1}}));
  f.fake.kill=()=>{f.fake.stopped=true;};
  f.controller.startBackfill();f.advance(2);f.controller.tick();
  assert.equal(f.fake.stopped,true);assert.equal(f.calls(),1);
  f.fake.emit('close',1);f.controller.tick();assert.equal(f.calls(),2);
  f.fake.emit('close',1);
});
