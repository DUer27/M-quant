import assert from 'node:assert/strict';
import test from 'node:test';
import { monitorModel, renderMonitor } from '../assets/intraday-monitor.js';

test('fresh quotes alone cannot make missing minute data appear ready', () => {
  const status = { automatic_enabled: true, state: 'sample_available', current_context: 'trading', fresh: true,
    codes: ['000001'], coverage: { quotes: 1, minutes: 0 }, scheduler: {}, minutes: [] };
  const model = monitorModel(status);
  assert.equal(model.tone, 'warning'); assert.match(model.description, /分钟0\/1只/);
});
import { nextTradingStart } from '../intraday-trial.mjs';
const now = new Date('2026-11-24T14:00:00Z');
function base() {
  return { automatic_enabled: true, current_context: 'market_closed', codes: ['000001','000063'],
    state: 'sample_available', trigger: 'manual', finished_at: '2026-11-24T13:59:00Z', elapsed_seconds: 31,
    current_quote_stocks: 2, minutes: [{ current_ok: true }, { current_ok: true }], displayed_at: now.toISOString(),
    scheduler: { waiting_for_session: true, interval_seconds: 60, next_session_at: '2026-11-25T01:30:00Z', history: [] }, validation: { automatic_runs: 0 } };
}
test('monitor separates enabled after-hours waiting from actual automatic execution', () => {
  const m = monitorModel(base(), now);
  assert.match(m.title, /已开启.*休市等待/); assert.match(m.lastResult, /手动采集/);
  assert.equal(m.autoRuns, 0); assert.equal(m.records.length, 0);
  assert.match(m.next, /下个交易日.*周三.*09:30/);assert.match(m.nextReason,/11小时30分/); assert.equal(m.quotePercent, 100);
});
test('running monitor distinguishes manual, automatic and requested termination', () => {
  const s = base(); s.state = 'running'; s.elapsed_seconds = 20; s.scheduler.active = { source: 'automatic' };
  assert.equal(monitorModel(s, now).title, '正在自动采集');
  assert.equal(monitorModel(s, now).next, '本轮完成后确定');
  s.scheduler.active.source = 'manual'; assert.equal(monitorModel(s, now).title, '正在手动采集');
  s.scheduler.active.stopping = true; assert.equal(monitorModel(s, now).tone, 'error');
});
test('paused, failed, calendar-unknown and connection-lost states never appear to be collecting', () => {
  const s = base(); s.automatic_enabled = false;
  assert.equal(monitorModel(s, now).next, '暂停中');
  s.automatic_enabled = true; s.current_context = 'calendar_unknown';
  assert.match(monitorModel(s, now).title, /日历/);
  s.current_context = 'trading'; s.scheduler.waiting_for_session = false; s.error = 'fixture';
  assert.match(monitorModel(s, now).title, /异常/);
  assert.equal(monitorModel(s, now, false).title, '监控连接中断');
  assert.equal(monitorModel(s, now, false).next, '连接恢复后确认');
});
test('countdown advances without source requests and history excludes manual and unclassified records', () => {
  const s = base();s.current_context='trading';s.scheduler.waiting_for_session=false;s.scheduler.history = [
    { at: now.toISOString(), trigger: 'manual' }, { at: now.toISOString() },
    { at: now.toISOString(), trigger: 'automatic', quotes: 2, minutes: 2, elapsed_seconds: 20, complete: true }
  ];
  s.scheduler.next_start_at = new Date(now.getTime()+60_000).toISOString();
  assert.match(monitorModel(s, now).next, /1分/);
  assert.match(monitorModel(s, new Date(now.getTime()+30_000)).next, /30.0秒/);
  assert.equal(monitorModel(s, now).records.length, 1);
});

test('Friday close waits until Monday and explains weekend rather than a 66-hour retry',()=>{
  const s=base(),at=new Date('2026-11-27T15:06:34+08:00');s.scheduler.next_session_at='2026-11-30T09:30:00+08:00';
  s.scheduler.next_start_at='2026-11-27T15:07:00+08:00';
  const model=monitorModel(s,at);assert.match(model.next,/周一.*09:30/);assert.match(model.nextReason,/周末/);
  assert.match(model.nextReason,/66小时23分/);assert.equal(model.nextAt,'2026-11-30T09:30:00+08:00');
  assert.match(model.description,/间隔目标仅在交易时段生效/);
});

test('lunch resume is distinct from weekend and manual or interrupted runs do not masquerade as automatic success',()=>{
  const s=base();s.scheduler.next_session_at='2026-11-27T13:00:00+08:00';
  assert.equal(monitorModel(s,new Date('2026-11-27T11:50:00+08:00')).next,'午休后 13:00');
  s.split_collection=true;s.lanes={quote:{history:[{at:'2026-11-26T05:30:00Z',trigger:'automatic',complete:true,run_id:'good'}]},
    minute:{history:[{at:'2026-11-26T13:38:58Z',trigger:'automatic',complete:false,run_id:null,error:'上次独立任务中断'},
      {at:'2026-11-27T07:05:00Z',trigger:'manual',complete:true,run_id:'manual',observation_only:true}]}};
  assert.equal(monitorModel(s,now).lastAuto,'2026-11-26T05:30:00Z');
});
test('next trading session follows actual calendar, lunch and future calendar availability', () => {
  const dates = ['2026-11-24','2026-11-25','2026-11-27','2026-11-30'];
  assert.equal(nextTradingStart(now, dates), '2026-11-25T01:30:00.000Z');
  assert.equal(nextTradingStart(new Date('2026-11-24T04:00:00Z'), dates), '2026-11-24T05:00:00.000Z');
  assert.equal(nextTradingStart(new Date('2026-11-27T14:00:00Z'), dates), '2026-11-30T01:30:00.000Z');
  assert.equal(nextTradingStart(now, ['2026-11-24']), null);
});
test('monitor renders real progress and an honest empty automatic timeline', () => {
  const fields = new Map(), old = globalThis.document;
  const element = () => ({ textContent: '', children: [], style: {}, attrs: {}, append(child) { this.children.push(child); },
    setAttribute(k,v) { this.attrs[k] = v; }, replaceChildren() { this.children = []; } });
  globalThis.document = { createElement: element };
  const panel = { querySelector(selector) {
    const key = selector.match(/"([^"]+)"/)[1]; if (!fields.has(key)) fields.set(key, element()); return fields.get(key);
  } };
  try {
    const s = base(); s.minutes[1].current_ok = false;
    renderMonitor(panel, s, now);
    assert.equal(fields.get('quote-progress').style.width, '100%');
    assert.equal(fields.get('minute-progress').style.width, '50%');
    assert.match(fields.get('timeline').children[0].textContent, /尚无自动采集记录/);
    assert.match(fields.get('last-auto').textContent, /尚无盘中自动/);
    renderMonitor(panel, s, now, false);
    assert.equal(fields.get('card').attrs['data-tone'], 'error');
  } finally { globalThis.document = old; }
});

test('monitor preserves last completed result during a new run and detects a stalled scheduler heartbeat', () => {
  const s = base(); s.state = 'running'; delete s.finished_at;
  s.scheduler.history = [{ at: '2026-11-24T13:59:00Z', trigger: 'manual', elapsed_seconds: 31, observation_only: true }];
  assert.match(monitorModel(s, now).lastResult, /手动采集/);
  assert.match(monitorModel(s, now).lastScope, /休市样本/);
  s.scheduler.last_tick_at = '2026-11-24T13:59:00Z';
  assert.equal(monitorModel(s, now).title, '后台调度响应延迟');
  s.scheduler.last_tick_at = now.toISOString();
  assert.match(monitorModel(s, now).heartbeat, /调度器最近检查/);
});
