import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMinuteAudit } from '../assets/intraday-audit.js';

function render(status) {
  const fields = new Map(), old = globalThis.document;
  const element = () => ({ textContent: '', children: [], replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } });
  const panel = { querySelector(selector) {
    const key = selector.match(/"([^"]+)"/)[1];
    if (!fields.has(key)) fields.set(key, element());
    return fields.get(key);
  } };
  globalThis.document = { createElement: element };
  try { renderMinuteAudit(panel, status); return fields; }
  finally { globalThis.document = old; }
}
const sample = { code: '000001', source: 'sina.minute', day: '2026-11-25', last_label: '2026-11-25T10:01:00+08:00',
  row_count: 31, observation_count: 2, compared_labels: 30, changed_labels: 1, comparison_state: 'compared',
  possible_missing_labels: 2, possible_forming_count: 1, current_run: true, matches_displayed_series: true };

test('audit panel shows pending samples and never equates no observations with no gaps', () => {
  const fields = render({ minute_audit: { codes: ['000001'], samples: [{ code: '000001', state: 'not_observed' }] } });
  assert.match(fields.get('audit-summary').textContent, /本轮核查0只/);
  assert.match(fields.get('audit-details').children[0].textContent, /尚不能判断缺口或闭合状态/);
  assert.match(fields.get('audit-state').textContent, /待核实/);
});

test('audit panel presents revisions and candidate gaps without marking bars closed', () => {
  const fields = render({ minute_audit: { codes: ['000001'], samples: [{ ...sample,
    gap_examples: [{ after: '2026-11-25T09:31:00+08:00', before: '2026-11-25T09:34:00+08:00', candidate_labels: 2 }],
    observed_boundary_labels: ['2026-11-25T09:30:00+08:00'],
    pending_count: 1,
    source_switched_from: 'eastmoney.minute',
    change_examples: [{ label: sample.last_label, fields: ['close'] }] }] } });
  const text = fields.get('audit-details').children.map(child => child.textContent).join('\n');
  assert.match(fields.get('audit-summary').textContent, /本轮核查1只/);
  assert.match(text, /变化1条/); assert.match(text, /内部疑似缺2个标签/);
  assert.match(text, /可能形成中，未确认/); assert.match(text, /闭合未核实/);
  assert.match(text, /同源修订/); assert.match(text, /不补零/);
  assert.match(text, /已见边界标签/);
  assert.match(text, /已隔离1条下一分钟边界候选/);
  assert.match(text, /从东方财富切换，未跨来源比较修订/);
});

test('old or mismatched audit stays historical and audit errors are separate from source failures', () => {
  for (const flags of [{ current_run: false }, { matches_displayed_series: false }]) {
    const fields = render({ minute_audit: { codes: ['000001'], samples: [{ ...sample, ...flags }], errors: [{ code: '000001', error: 'OSError' }] } });
    assert.match(fields.get('audit-summary').textContent, /本轮核查0只/);
    assert.match(fields.get('audit-details').children[0].textContent, /上次核查，非本轮结果/);
    assert.match(fields.get('audit-state').textContent, /核查异常/);
    assert.ok(fields.get('audit-details').children.some(child => /行情缓存继续保留/.test(child.textContent)));
  }
});
