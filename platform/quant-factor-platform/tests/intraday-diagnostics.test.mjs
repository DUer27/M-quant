import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSymbolDiagnostics } from '../assets/intraday-diagnostics.js';
import { recoveryQuality } from '../intraday-trial.mjs';
import { validationRecord } from '../intraday-validation.mjs';

function draw(status, all = false) {
  const fields = new Map(), old = globalThis.document;
  const element = () => ({ textContent: '', children: [], append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; } });
  const panel = { querySelector(selector) { const key = selector.match(/"([^"]+)"/)[1]; if (!fields.has(key)) fields.set(key, element()); return fields.get(key); } };
  globalThis.document = { createElement: element };
  try { renderSymbolDiagnostics(panel, status, all); return fields; } finally { globalThis.document = old; }
}
test('diagnostic panel distinguishes same-label revision and identical content without asserting cache cause', () => {
  const fields = draw({ run_id: 'fixture', symbol_diagnostics: { state: 'ready', extra_requests: 1, policy: { max_requests: 4 },
    entries: [{ code: '000001', kind: 'minute', source: 'sina.minute', stage: 'initial', state: 'label_unchanged_revised', content_changed: true },
      { code: '000002', kind: 'minute', source: 'sina.minute', stage: 'initial', state: 'label_unchanged_same', content_changed: false }],
    recovery_events: [{ kind: 'minute', code: '000001', reason: 'label_unchanged_revised', outcome: 'advanced_after_switch', recovered: true, final_source: 'eastmoney.minute', attempts: [{ source: 'eastmoney', request_sent: true, outcome: 'returned' }] }] } });
  assert.match(fields.get('diagnostics-summary').textContent, /额外请求1\/4次 · 已恢复1项/);
  const text = JSON.stringify(fields.get('diagnostics-entries'));
  assert.match(text, /内容仍修订/);assert.match(text, /原因待核实/);
  assert.match(JSON.stringify(fields.get('diagnostics-recovery')), /备用源返回更新标签/);
});
test('healthy rows can be revealed and missing diagnostics remain unknown', () => {
  assert.match(draw({}).get('diagnostics-summary').textContent, /历史缺少逐股证据/);
  const status = { symbol_diagnostics: { entries: [{ code: '000001', stage: 'initial', state: 'advanced' }] } };
  assert.match(JSON.stringify(draw(status).get('diagnostics-entries')), /没有需关注项/);
  assert.match(JSON.stringify(draw(status, true).get('diagnostics-entries')), /源时间已推进/);
});
test('coverage and scheduling choose selected recovery data and ignore superseded response', () => {
  const now = new Date('2026-11-25T06:00:00Z');
  const old = { kind: 'minute', code: '000001', ok: true, selected: false, data: { source: 'sina.minute', source_time: '2026-11-25T13:50:00+08:00', rows: [{}] } };
  const recent = { ...old, selected: true, stage: 'recovery', data: { source: 'eastmoney.minute', source_time: '2026-11-25T13:59:00+08:00', rows: [{}] } };
  const quote = { kind: 'quote', source: 'sina', ok: true, data: [{ code: '000001', source_time: now.toISOString() }] };
  const report = { run_id: 'fixture', codes: ['000001'], rounds: [{ checks: [quote, old, recent] }] };
  const quality = recoveryQuality(report, now);assert.equal(quality.eligible, true);assert.equal(quality.times['minute:000001'], recent.data.source_time);
  const record = validationRecord(report, { at: now.toISOString(), elapsed_seconds: 30, complete: true, advanced: true }, { context: 'trading', now, trigger: 'manual' });
  assert.equal(record.max_minute_age_seconds, 60);assert.deepEqual(record.source_counts, { 'eastmoney.minute': 1 });
});
