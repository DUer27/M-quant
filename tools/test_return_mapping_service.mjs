import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, validateConfig, projectCappedSimplex, optimizePortfolio, createReturnMappingService } from '../platform/quant-factor-platform/return-mapping-service.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('configuration refuses overlapping returns with insufficient HAC lags', () => {
  assert.throws(() => validateConfig({ horizon: 10, nwLags: 4 }), /至少/);
  assert.equal(validateConfig({ horizon: 10, nwLags: 9 }).nwLags, 9);
});
test('configuration rejects infeasible allocation and duplicate factors', () => {
  assert.throws(() => validateConfig({ portfolio: { topN: 5, maxWeight: 0.1 } }), /无法/);
  assert.throws(() => validateConfig({ factors: [DEFAULT_CONFIG.factors[0], DEFAULT_CONFIG.factors[0]] }), /重复/);
  assert.throws(() => validateConfig({ factors: DEFAULT_CONFIG.factors.map((f) => ({ ...f, enabled: false })) }), /至少/);
});
test('configuration refuses invalid dates and ambiguous directions', () => {
  assert.throws(() => validateConfig({ trainEnd: '2026-01-01', asOf: '2026-01-01' }), /必须早于/);
  assert.throws(() => validateConfig({ asOf: '2026-02-30' }), /日期/);
  assert.throws(() => validateConfig({ factors: [{ ...DEFAULT_CONFIG.factors[0], direction: 0 }] }), /方向/);
});
test('capped simplex projection preserves both the budget and concentration constraint', () => {
  const w = projectCappedSimplex([10, -2, 0.5, 0.2], 0.4);
  assert.ok(Math.abs(w.reduce((s, v) => s + v, 0) - 1) < 1e-10);
  assert.ok(w.every((v) => v >= 0 && v <= 0.4 + 1e-12));
  assert.ok(Math.abs(w[0] - 0.4) < 1e-10);
  assert.throws(() => projectCappedSimplex([0, 0], 0.4), /无法/);
});
function example() {
  return { modelId: 'test', configHash: 'frozen', config: { ...DEFAULT_CONFIG, portfolio: { ...DEFAULT_CONFIG.portfolio, topN: 2, maxWeight: 1, riskAversion: 1 } },
    predictions: [{ code: 'a', expectedReturn: 0.02 }, { code: 'b', expectedReturn: 0.01 }], risk: { codes: ['a', 'b'], covariance: [[0.04, 0], [0, 0.04]], horizon: 5 } };
}
test('optimizer matches the analytic two-asset solution and decomposes expected return', () => {
  const result = optimizePortfolio(example());
  const weights = new Map(result.weights.map((r) => [r.code, r.weight]));
  assert.ok(Math.abs(weights.get('a') - 0.625) < 1e-8);
  assert.ok(Math.abs(weights.get('b') - 0.375) < 1e-8);
  assert.ok(Math.abs(result.expectedReturn - result.weights.reduce((s, r) => s + r.contribution, 0)) < 1e-12);
});
test('optimizer respects a binding concentration cap', () => {
  const report = example(); report.config.portfolio.maxWeight = 0.55;
  const result = optimizePortfolio(report);
  assert.ok(Math.abs(result.weights[0].weight - 0.55) < 1e-8);
});
test('optimizer never silently replaces missing covariance with zero', () => {
  const report = example(); report.risk.covariance[0][1] = null;
  assert.throws(() => optimizePortfolio(report), /缺失/);
});

test('HTTP API serializes fits, preserves snapshots, and refuses stale parameters', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'return-mapping-test-'));
  const engine = join(folder, 'tools', 'factor_return_mapping.py');
  mkdirSync(join(folder, 'tools'));
  writeFileSync(engine, 'import sys,json,time\njson.load(sys.stdin)\ntime.sleep(.2)\nprint(json.dumps({"status":"ok","predictions":[],"backtest":{"observations":[]}}))\n');
  const sendJson = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const handler = createReturnMappingService({ root: folder, projectRoot: folder, pythonExecutable: process.env.PYTHON || 'python3', sendJson });
  const server = createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost').pathname)) sendJson(res, {}, 404); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/return-mapping-api`;
  const call = async (path, method = 'GET', value) => {
    const response = await fetch(`${endpoint}${path}`, { method, ...(value === undefined ? {} : { body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } }) });
    return { status: response.status, value: await response.json() };
  };
  try {
    const responses = await Promise.all([call('/fit', 'POST', {}), call('/fit', 'POST', {})]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const model = responses.find((r) => r.status === 200).value;
    const current = await call('/result'); assert.equal(current.value.stale, false);
    const before = await call('/config');
    const config = { ...before.value.config, local: { bandwidth: 0.9 } };
    assert.equal((await call('/config', 'PUT', { config, revision: 999 })).status, 409);
    assert.equal((await call('/config', 'PUT', { config, revision: before.value.revision })).status, 200);
    assert.equal((await call('/result')).value.stale, true);
    assert.equal((await call(`/expected-returns?modelId=${model.modelId}`)).status, 409);
    assert.equal((await call('/portfolio', 'POST', { modelId: model.modelId, configHash: model.configHash })).status, 409);
    appendFileSync(engine, '# changed implementation\n');
    assert.ok((await call('/result')).value.staleReasons.some((reason) => reason.includes('引擎')));
    assert.equal((await call('/attribution', 'POST', { modelId: model.modelId, configHash: 'other-model' })).status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve)); rmSync(folder, { recursive: true, force: true });
  }
});
