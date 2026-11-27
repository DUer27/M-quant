import assert from 'node:assert/strict';
import test from 'node:test';
import { mountMarketDataPanel, duration, chinaTime } from '../assets/market-data.js';

test('panel distinguishes cached work, network work, failures and scheduler outcome', async () => {
  const elements = new Map();
  function element() {
    return { textContent: '', dataset: {}, children: [], open: false, addEventListener() {},
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; } };
  }
  const panel = { querySelector(selector) {
    const key = selector.match(/"([^"]+)"/)[1];
    if (!elements.has(key)) elements.set(key, element());
    return elements.get(key);
  } };
  const original = { document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval };
  try {
    globalThis.document = { querySelector: () => panel, createElement: element };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      state: 'failed', label: 'fixture', last_success: { data_date: '2026-11-23' },
      coverage: { total: 2, fresh: 1, failed: 1 },
      metrics: { elapsed_seconds: 3, workers: 2, cache_hits: 1, downloaded_stocks: 0, timings: {}, sources: {} },
      failures: [{ code: '600000', reason: 'fixture missing target date' }],
      scheduler: { state: 'ready', finished_at: '2026-11-24T10:38:18Z', message: 'fixture' }
    }) });
    globalThis.setInterval = () => 0;
    mountMarketDataPanel();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(elements.get('coverage').textContent, /1\/2.*1 只待补齐/);
    assert.match(elements.get('timing').textContent, /缓存复用 1只，联网获取 0只/);
    assert.match(elements.get('scheduler').textContent, /更新完成/);
    assert.ok(elements.get('diagnostic-list').children.some((row) => row.textContent.includes('600000')));
    assert.equal(elements.get('state').textContent, '更新未完成');
  } finally {
    Object.assign(globalThis, original);
  }
});

test('missing legacy metrics remain unknown and display times use Beijing time', () => {
  assert.equal(duration(undefined), '未记录');
  assert.equal(chinaTime(null), '未记录');
  assert.match(chinaTime('2026-11-24T10:38:18Z'), /18:38:18/);
});
