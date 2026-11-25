import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../platform/quant-factor-platform/assets/return-mapping-explanation.js').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

function fixture() {
  return {
    source: 'draft', section: 'mapping', dirty: false, stale: false,
    configHash: 'current',
    config: { method: 'characteristic_fmb', frequency: 'daily', horizon: 5, nwLags: 4, factors: [{ id: 'momentum', enabled: true, lookback: 20, direction: 1 }], portfolio: { riskAversion: 7, topN: 10, maxWeight: 0.2 } },
    schema: { methods: [{ id: 'characteristic_fmb', label: '线性特征映射', interpretation: '控制其他特征后的收益关联。' }], factors: [{ id: 'momentum', name: '价格动量', aliases: [], defaultLookback: 20, defaultDirection: 1, meaning: '历史价格变化。', unit: '截面标准差' }] },
    report: { status: 'ok', modelId: 'frozen-model', configHash: 'old', config: { method: 'parametric_operator', frequency: 'daily', horizon: 30, nwLags: 29, factors: [{ id: 'momentum', enabled: true, lookback: 60, direction: -1 }], portfolio: { riskAversion: 22, topN: 5, maxWeight: 0.4 } }, model: { method: 'parametric_operator', coefficients: [{ factorId: 'momentum', estimate: 0.123456, meaning: '历史快照的系数' }] } },
    activeFactor: { factorId: 'momentum', name: '价格动量', usage: '观察历史价格变化。', formula: 'close(t) / close(t-20) - 1' },
  };
}

test('snapshot explanation keeps the frozen horizon instead of substituting edited parameters', () => {
  assert.equal(typeof module.explanationContext, 'function', 'the explanation context resolver is not implemented');
  const context = module.explanationContext({ ...fixture(), source: 'snapshot', dirty: true });
  assert.equal(context.config.horizon, 30);
  assert.equal(context.config.portfolio.riskAversion, 22);
  assert.equal(context.method, 'parametric_operator');
  assert.equal(context.current, false);
});

test('draft explanation never takes a coefficient from an older model', () => {
  assert.equal(typeof module.renderModelExplanation, 'function', 'the explanation renderer is not implemented');
  const html = module.renderModelExplanation({ ...fixture(), section: 'factor', dirty: true });
  assert.match(html, /未保存/);
  assert.match(html, /20个交易日/);
  assert.doesNotMatch(html, /12\.3456%/);
});

test('a missing snapshot is explicitly unavailable rather than explained using defaults', () => {
  assert.equal(typeof module.renderModelExplanation, 'function');
  const html = module.renderModelExplanation({ ...fixture(), source: 'snapshot', report: null });
  assert.match(html, /尚无.*快照/);
  assert.doesNotMatch(html, /<math/);
});

test('an unrelated registered factor does not inherit a global model coefficient', () => {
  assert.equal(typeof module.renderModelExplanation, 'function');
  const html = module.renderModelExplanation({ ...fixture(), source: 'snapshot', section: 'factor', activeFactor: { factorId: 'external', name: '外部复合因子', formula: 'score = quality + growth', dataDependencies: ['quality', 'growth'] } });
  assert.match(html, /未绑定收益映射/);
  assert.match(html, /quality/);
  assert.doesNotMatch(html, /12\.3456%/);
});

test('dynamic names and warnings are escaped in the explanation document', () => {
  assert.equal(typeof module.renderModelExplanation, 'function');
  const html = module.renderModelExplanation({ ...fixture(), section: 'factor', activeFactor: { factorId: 'external', name: '<img src=x onerror=alert(1)>', formula: 'score = x' }, report: { ...fixture().report, warnings: ['<script>alert(2)</script>'] } });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
});

test('portfolio symbols use the selected snapshot and formulas remain inside a closed disclosure', () => {
  assert.equal(typeof module.renderModelExplanation, 'function');
  const html = module.renderModelExplanation({ ...fixture(), source: 'snapshot', section: 'portfolio' });
  assert.match(html, /当前为22/);
  assert.doesNotMatch(html, /当前为7/);
  assert.match(html, /<details class="rm-explain-formula">/);
  assert.ok(html.indexOf('rm-equation-display') < html.indexOf('rm-symbol-list'));
  assert.doesNotMatch(html, /<(?:input|textarea)\b/);
});

test('risk pricing does not claim a configured price operator participates in beta estimation', () => {
  assert.equal(typeof module.renderModelExplanation, 'function');
  const data = fixture(); data.report.config.method = 'risk_premium_fmb'; data.report.model.method = 'risk_premium_fmb';
  const html = module.renderModelExplanation({ ...data, source: 'snapshot', section: 'factor' });
  assert.match(html, /不参与.*β/);
  assert.doesNotMatch(html, /12\.3456%/);
});

test('a global mapping explanation is not titled as an unrelated selected factor', () => {
  const html = module.renderModelExplanation({ ...fixture(), section: 'mapping', activeFactor: { factorId: 'external', name: '外部复合因子' } });
  assert.match(html, /<h3>线性特征映射<\/h3>/);
  assert.doesNotMatch(html, /<h3>外部复合因子<\/h3>/);
});
