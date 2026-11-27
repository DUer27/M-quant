import assert from 'node:assert/strict';
import test from 'node:test';
import { mountIntradayTrial } from '../assets/intraday-trial.js';

test('trial panel labels after-hours samples and minute failure independently of quote success', async () => {
  const fields = new Map();
  function element() {
    return { textContent: '', children: [], style: {}, attrs: {}, disabled: false, handlers: {}, append(...children) { this.children.push(...children); },
      setAttribute(key, value) { this.attrs[key] = value; },
      replaceChildren() { this.children = []; }, addEventListener(name, handler) { this.handlers[name] = handler; } };
  }
  const panel = { querySelector(selector) {
    const name = selector.match(/"([^"]+)"/)[1];
    if (!fields.has(name)) fields.set(name, element());
    return fields.get(name);
  } };
  const old = { document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval };
  let poll, notices = [];
  try {
    globalThis.document = { querySelector: () => panel, createElement: element, createElementNS: element };
    globalThis.setInterval = (callback) => { poll = callback; return 0; };
    globalThis.fetch = async (_, options) => ({ ok: true, json: async () => options?.method ? { accepted: false, reason: 'fixture cooldown' } : {
      state: 'sample_available', current_context: 'market_closed', codes: ['000001'], elapsed_seconds: 2,
      scheduler: { notices, history: [], waiting_for_session: true, interval_seconds: 60 },
      quotes: [{ code: '000001', name: 'fixture', source: 'sina.quote', last: 10, bids: [{ price: 9.9, shares: 100 }],
        asks: [{ price: 10.1, shares: 200 }], volume_shares: 10000, amount_yuan: 100000, source_time: '2026-11-24T15:00:00+08:00' }],
      latest_checks: [{ kind: 'minute', ok: false }],
      rounds: [{ checks: [{ source: 'sina', kind: 'quote', ok: true, seconds: .5 }] }]
    } });
    mountIntradayTrial();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fields.get('state').textContent, '已获取样本');
    assert.match(fields.get('freshness').textContent, /休市期间不判定为盘中实时达标/);
    assert.match(fields.get('minutes').children[0].textContent, /报价成功不代表分钟接口也成功/);
    assert.match(fields.get('notice').textContent, /自动更新已暂停/);
    assert.equal(fields.get('quotes').children.length, 2);
    assert.match(fields.get('quotes').children[1].children[0].textContent, /000001/);
    await fields.get('probe').handlers.click();
    assert.equal(fields.get('notice').textContent, 'fixture cooldown');
    notices = [{ id: '1', message: 'fixture: over 60 seconds' }];
    poll(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fields.get('toast').hidden, false);
    assert.equal(fields.get('toast').textContent, 'fixture: over 60 seconds');
    fields.get('dismiss-toast').handlers.click();
    poll(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fields.get('toast').hidden, true);
  } finally { Object.assign(globalThis, old); }
});

test('panel separates partial minute recovery, validation failures and cooldown skips from HTTP success', async () => {
  const fields = new Map();
  const element = () => ({ textContent: '', children: [], style: {}, dataset: {},
    append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; },
    addEventListener() {}, setAttribute() {} });
  const panel = { querySelector(selector) {
    const name = selector.match(/"([^"]+)"/)[1];
    if (!fields.has(name)) fields.set(name, element()); return fields.get(name);
  } };
  const old = { document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval };
  try {
    globalThis.document = { querySelector: () => panel, createElement: element };
    globalThis.setInterval = () => 0;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ state: 'sample_available', codes: ['000001','000002','000003'],
      coverage: { quotes: 3, minutes: 1, total: 3 }, current_context: 'trading', quotes: [], rounds: [], scheduler: {},
      minutes: [{ code: '000001', current_ok: true, data: { source: 'sina.minute', count: 3, pending_count: 1 } }],
      latest_checks: [
        { source: 'sina', kind: 'minute', ok: true, request_sent: true, http_status: 200 },
        { source: 'sina', kind: 'minute', ok: false, request_sent: true, http_status: 200, failure_kind: 'validation' },
        { source: 'sina', kind: 'minute', ok: false, request_sent: false, failure_kind: 'cooldown' },
      ] }) });
    mountIntradayTrial({ isChartVisible: () => false });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fields.get('state').textContent, '报价已返回 · 分钟未完整');
    const text = fields.get('source-health').textContent;
    assert.match(text, /请求2次 \/ 网络返回2次 \/ 有效样本1只 \/ 跳过1只/);
    assert.match(text, /隔离尾部候选1条/); assert.match(text, /字段或时效检查未通过/); assert.match(text, /冷却跳过/);
  } finally { Object.assign(globalThis, old); }
});
