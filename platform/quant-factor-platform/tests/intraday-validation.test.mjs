import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeValidation, validationRecord, beijingDay } from '../intraday-validation.mjs';

const day = '2026-11-24', codes = ['000001'], epoch = Date.parse(day + 'T09:31:00+08:00');
const time = (n) => new Date(epoch + n * 1000).toISOString();
function record(n, changes = {}) {
  return { record_id: String(n), at: time(n * 60 + 10), started_at: time(n * 60), trigger: 'automatic',
    observation_only: false, elapsed_seconds: 10, total: 1, codes, complete: true, advanced: true, fast: true,
    max_quote_age_seconds: 15, max_minute_age_seconds: 60, failures: [], ...changes };
}
const summarize = (rows) => summarizeValidation(rows, { day, codes, now: new Date(day + 'T19:00:00+08:00') });

test('no observations cannot pass, and Beijing dates are used', () => {
  const s = summarize([]); assert.equal(s.ready_for_review, false);
  assert.equal(s.complete_rate, null); assert.equal(s.elapsed_p95_seconds, null);
  assert.equal(beijingDay('2026-11-23T18:00:00Z'), day);
});
test('only automatic trading observations for identical pool are included and duplicates are ignored', () => {
  const rows = [record(0), record(0), record(1, { observation_only: true }), record(2, { trigger: 'manual' }), record(3, { codes: ['000063'] })];
  const s = summarize(rows); assert.equal(s.automatic_runs, 1);
  assert.equal(s.excluded_observation_or_manual, 2); assert.equal(s.excluded_other_pools, 1);
});
test('31 timely automatic cycles over 30 minutes meet a provisional review gate', () => {
  const s = summarize(Array.from({ length: 31 }, (_, n) => record(n)));
  assert.equal(s.ready_for_review, true); assert.equal(s.observed_trading_minutes, 30);
  assert.equal(s.expected_slots_in_window, 31); assert.equal(s.missed_slots, 0);
  assert.equal(s.complete_rate, 1); assert.equal(s.timely_rate, 1);
  assert.equal(s.elapsed_p95_seconds, 10);
});
test('missing cycles and fast repeated data count against minute target attainment', () => {
  const rows = Array.from({ length: 31 }, (_, n) => record(n)).filter((r) => !['4','5','6'].includes(r.record_id));
  rows[10].advanced = false;
  const s = summarize(rows); assert.equal(s.missed_slots, 3);
  assert.equal(s.ready_for_review, false); assert.ok(s.timely_rate < .95);
  assert.ok(s.reasons.some((r) => r.includes('180秒')));
});
test('lunch interval does not create false missing minute slots', () => {
  const s = summarize([record(0, { started_at: day+'T11:29:00+08:00', at: day+'T11:29:10+08:00' }),
    record(1, { started_at: day+'T13:01:00+08:00', at: day+'T13:01:10+08:00' })]);
  assert.equal(s.observed_trading_minutes, 2); assert.equal(s.largest_start_gap_seconds, 120);
});
test('a silent collector cannot keep showing ready during a trading session', () => {
  const rows = Array.from({ length: 31 }, (_, n) => record(n));
  const s = summarizeValidation(rows, { day, codes, now: new Date(time(35*60)), enabled: true });
  assert.equal(s.ready_for_review, false); assert.ok(s.current_silence_seconds > 180);
});
test('per-run metrics preserve source failures, missing coverage and supplier timestamp meaning', () => {
  const report = { codes: ['000001','000063'], run_id: 'fixture', started_at: time(0), rounds: [{ checks: [
    { source: 'sina', kind: 'quote', ok: true, data: [{ code: '000001', source_time: time(0) }] },
    { source: 'eastmoney', kind: 'minute', code: '000001', ok: false, error: 'ProxyError', seconds: .1 },
    { source: 'sina', kind: 'minute', code: '000001', ok: true, data: { source_time: time(0), source: 'sina.minute' } }
  ] }] };
  const r = validationRecord(report, { at: time(20), elapsed_seconds: 20, complete: false, advanced: false },
    { context: 'trading', now: new Date(time(20)), trigger: 'automatic' });
  assert.equal(r.quote_count, 1); assert.equal(r.minute_count, 1);
  assert.equal(r.max_quote_age_seconds, null); assert.equal(r.max_minute_age_seconds, null);
  assert.equal(r.failures.length, 1); assert.equal(r.supplier_time_only, true);
});
