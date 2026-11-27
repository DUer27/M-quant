import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { chinaSlot, createMarketDataController, expectedDailyDate } from '../market-data.mjs';

const calendar = ['2026-11-20', '2026-11-23', '2026-11-24'];
function fixture(now = new Date('2026-11-23T11:00:00Z')) {
  const root = mkdtempSync(join(tmpdir(), 'mquant-controller-'));
  const platform = join(root, 'platform');
  const runtime = join(root, 'outputs', 'live-market-data');
  mkdirSync(join(platform, 'config'), { recursive: true });
  mkdirSync(runtime, { recursive: true });
  const config = { enabled: true, label: 'fixture', profile: 'fixture', schedule_time: '18:30', completed_bar_after: '16:30', timezone: 'Asia/Shanghai', retry_interval_minutes: 30, max_auto_attempts_per_slot: 3 };
  writeFileSync(join(platform, 'config', 'market-data.json'), JSON.stringify(config));
  writeFileSync(join(runtime, 'calendar.json'), JSON.stringify({ dates: calendar }));
  let spawns = 0;
  const fake = new EventEmitter(); fake.stdout = new PassThrough(); fake.stderr = new PassThrough();
  const controller = createMarketDataController({ projectRoot: root, platformRoot: platform, runtimeDir: runtime, python: 'fixture-python', now: () => now, spawnProcess: () => { spawns++; return fake; } });
  return { controller, root, runtime, fake, spawns: () => spawns, state: (value) => writeFileSync(join(runtime, 'status.json'), JSON.stringify(value)) };
}

test('China clock uses prior closed day before cutoff and on weekends', () => {
  assert.equal(expectedDailyDate(calendar, new Date('2026-11-23T00:00:00Z'), '16:30'), '2026-11-20');
  assert.equal(expectedDailyDate(calendar, new Date('2026-11-22T11:00:00Z'), '16:30'), '2026-11-20');
  assert.equal(chinaSlot(new Date('2026-11-23T11:00:00Z'), '18:30'), '2026-11-23:eod');
  assert.equal(expectedDailyDate(calendar, new Date('2026-11-25T11:00:00Z'), '16:30'), null);
});

test('stale success is not exposed as ready or as a current signal', () => {
  const f = fixture();
  f.state({ state: 'ready', expected_date: '2026-11-20', last_success: { data_date: '2026-11-20', signals: 'never-read' } });
  assert.equal(f.controller.status().state, 'stale');
  assert.equal(f.controller.signals().available, false);
});

test('background spawn returns immediately and duplicate refresh does not spawn again', async () => {
  const f = fixture();
  assert.equal(f.controller.start().accepted, true);
  assert.equal(f.controller.start().accepted, false);
  assert.equal(f.spawns(), 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.controller.status().state, 'running');
  f.fake.emit('error', new Error('fixture start failed'));
  f.fake.emit('close', -1);
  assert.equal(f.controller.status().state, 'failed');
});

test('automatic refresh obeys successful slots, retry backoff, and attempt limits', () => {
  const f = fixture();
  f.state({ state: 'ready', auto_key: '2026-11-23:eod' });
  f.controller.tick(); assert.equal(f.spawns(), 0);
  f.state({ state: 'failed', auto_key: '2026-11-23:eod', auto_attempts: 1, updated_at: '2026-11-23T10:59:00Z' });
  f.controller.tick(); assert.equal(f.spawns(), 0);
  f.state({ state: 'failed', auto_key: '2026-11-23:eod', auto_attempts: 3, updated_at: '2026-11-23T09:00:00Z' });
  f.controller.tick(); assert.equal(f.spawns(), 0);
  f.state({ state: 'failed', auto_key: '2026-11-23:eod', auto_attempts: 1, updated_at: '2026-11-23T09:00:00Z' });
  f.controller.tick(); assert.equal(f.spawns(), 1);
  f.fake.emit('close', 1);
});

test('only matching observation-only signals are available', () => {
  const f = fixture();
  const path = join(f.runtime, 'signals.json');
  f.state({ state: 'ready', expected_date: '2026-11-23', last_success: { data_date: '2026-11-23', signals: path } });
  writeFileSync(path, JSON.stringify({ signal_date: '2026-11-23', observation_only: true, routes: [{ action: 'record_only' }] }));
  assert.equal(f.controller.signals().available, true);
  writeFileSync(path, JSON.stringify({ signal_date: '2026-11-23', observation_only: true, routes: [{ action: 'TARGET_PORTFOLIO' }] }));
  assert.equal(f.controller.signals().available, false);
});

test('status exposes metrics, failure history and scheduler separately from market freshness', () => {
  const f = fixture();
  const metrics = { elapsed_seconds: 12, cache_hits: 1, downloaded_stocks: 1, workers: 2, sources: {} };
  f.state({ state: 'ready', last_success: { data_date: '2026-11-23' }, metrics });
  writeFileSync(join(f.runtime, 'scheduler-status.json'), JSON.stringify({ state: 'failed', message: 'fixture interrupted' }));
  mkdirSync(join(f.runtime, 'runs'));
  writeFileSync(join(f.runtime, 'runs', 'fixture.json'), JSON.stringify({ state: 'failed', metrics, coverage: { total: 2, fresh: 1 } }));
  const status = f.controller.status();
  assert.equal(status.state, 'ready');
  assert.equal(status.scheduler.state, 'failed');
  assert.equal(status.metrics.elapsed_seconds, 12);
  assert.equal(status.recent_runs[0].coverage.fresh, 1);
});

test('automatic weekend checks do not spawn an unnecessary collection', () => {
  const f = fixture(new Date('2026-11-22T11:00:00Z'));
  f.controller.tick();
  assert.equal(f.spawns(), 0);
});

test('an automatic worker skip does not mark an unrelated saved run as failed', () => {
  const f = fixture();
  f.state({ state: 'ready', last_success: { data_date: '2026-11-23' }, pid: 123 });
  f.controller.start('automatic');
  f.fake.emit('close', 0);
  assert.equal(f.controller.status().state, 'ready');
});

test('signals saved by a relative runtime resolve against project root, not server working directory', () => {
  const f = fixture();
  const path = join(f.runtime, 'signals.json');
  f.state({ state: 'ready', last_success: { data_date: '2026-11-23', signals: relative(f.root, path) } });
  writeFileSync(path, JSON.stringify({ signal_date: '2026-11-23', observation_only: true, routes: [{ action: 'record_only' }] }));
  assert.equal(f.controller.signals().available, true);
});
