import assert from 'node:assert/strict';
import test from 'node:test';
import { newPolicy, beginCycle, watchCycle, finishCycle } from '../intraday-policy.mjs';
import { recoveryQuality } from '../intraday-trial.mjs';

const epoch = Date.parse('2026-11-24T02:00:00Z');
const at = (seconds) => new Date(epoch + seconds * 1000);
function finish(p, seconds, overrides = {}) {
  finishCycle(p, { now: at(seconds), report: { run_id: String(seconds), state: 'sample_available' }, eligible: true,
    sourceTimes: { quote: at(seconds).toISOString(), minute: at(seconds - 30).toISOString() }, ...overrides });
}

test('normal completion keeps cadence aligned with start, rather than waiting another full minute', () => {
  const p = newPolicy(); beginCycle(p, at(0), 'old'); finish(p, 20);
  assert.equal(p.interval_seconds, 60);
  assert.equal(p.next_start_at, at(60).toISOString());
});

test('60/120-second warnings are emitted once and 180 seconds triggers a single stop', () => {
  const p = newPolicy(); beginCycle(p, at(0), 'old');
  assert.equal(watchCycle(p, at(59)), false); assert.equal(p.notices.length, 0);
  watchCycle(p, at(60)); watchCycle(p, at(61));
  assert.equal(p.interval_seconds, 120); assert.equal(p.notices.length, 1);
  watchCycle(p, at(120)); assert.equal(p.interval_seconds, 180);
  assert.equal(watchCycle(p, at(180)), true); assert.equal(watchCycle(p, at(181)), false);
  assert.equal(p.active.stopping, true); assert.equal(p.notices.length, 3);
  finish(p, 185);
  assert.equal(p.interval_seconds, 300); assert.equal(p.next_start_at, at(485).toISOString());
  assert.equal(p.cooldown_until, at(485).getTime());
});

test('two complete fast advancing cycles restore 60 seconds; one cycle cannot', () => {
  const p = newPolicy({ interval_seconds: 180 });
  beginCycle(p, at(0), 'old'); finish(p, 20); assert.equal(p.interval_seconds, 180);
  beginCycle(p, at(180), 'old2'); finish(p, 210);
  assert.equal(p.interval_seconds, 60); assert.equal(p.notices.at(-1).kind, 'recovered');
});

test('repeated source times, stale data and a reused run cannot falsely restore cadence', () => {
  for (const overrides of [
    { sourceTimes: { quote: at(1).toISOString(), minute: at(1).toISOString() } },
    { eligible: false }, { report: { run_id: 'old', state: 'sample_available' } },
    { report: { run_id: 'new', state: 'running' } }, { error: 'fixture error' }
  ]) {
    const p = newPolicy({ interval_seconds: 180, good_cycles: 1, source_times: { quote: at(1).toISOString(), minute: at(1).toISOString() } });
    beginCycle(p, at(0), 'old'); finish(p, 20, overrides);
    assert.equal(p.interval_seconds, 180); assert.equal(p.good_cycles, 0);
  }
});

test('rate-limit cooldown wins over cadence and restart preserves state', () => {
  const p = newPolicy(); beginCycle(p, at(0), 'old'); finish(p, 20, { cooldownUntil: at(600).getTime() });
  assert.equal(p.next_start_at, at(600).toISOString());
  const restored = newPolicy(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.cooldown_until, at(600).getTime()); assert.equal(restored.active, null);
});

test('source quality requires complete coherent quotes plus recent minute data for every stock', () => {
  const report = { codes: ['000001', '000063'], rounds: [{ checks: [
    { kind: 'quote', ok: true, data: ['000001','000063'].map((code) => ({ code, source_time: at(15).toISOString() })) },
    ...['000001','000063'].map((code) => ({ code, kind: 'minute', ok: true, data: { source_time: at(0).toISOString(), rows: [{}] } }))
  ] }] };
  assert.equal(recoveryQuality(report, at(30)).eligible, true);
  assert.equal(recoveryQuality(report, at(200)).eligible, false);
  report.rounds[0].checks[0].data.pop();
  assert.equal(recoveryQuality(report, at(30)).eligible, false);
});

test('completion at exactly 60 seconds remains a fast cycle', () => {
  const p = newPolicy({ interval_seconds: 120, good_cycles: 1 }); beginCycle(p, at(0), 'old'); finish(p, 60);
  assert.equal(p.interval_seconds, 60); assert.equal(p.good_cycles, 2);
});
