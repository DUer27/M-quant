import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../platform/quant-factor-platform/assets/app.js', import.meta.url), 'utf8');

function declaration(name) {
  return source.match(new RegExp(`^function ${name}\\(.*?^\\}`, 'ms'))?.[0] || '';
}

function renderContext(signalPack = null, catalog = null) {
  const elements = Object.fromEntries([
    'researchAgentCurrentStrategy', 'researchAgentCurrentStrategyId',
    'researchAgentLatestStatus', 'researchAgentLatestStatusDetail',
    'researchAgentDataDate', 'researchAgentEvidenceStatus', 'researchAgentEvidenceDetail',
  ].map((name) => [name, { textContent: '' }]));
  runInNewContext(`${declaration('dateOnly')}\n${declaration('renderResearchAgentContext')}\nrenderResearchAgentContext();`, {
    elements,
    currentStrategySignalPack: signalPack,
    currentPositionStressCatalog: catalog,
  });
  return elements;
}

test('research context renders the signal date without interrupting dashboard refresh', () => {
  const elements = renderContext({
    generatedAt: '2026-11-25T01:30:00.000Z',
    formalStrategies: [{ id: 'current-strategy', name: '当前策略', status: '已验证' }],
  }, {
    current: { strategyId: 'current-strategy', signalDate: '2026-11-24', gateStatus: '可观察' },
  });
  assert.equal(elements.researchAgentDataDate.textContent, '2026-11-24');
  assert.equal(elements.researchAgentCurrentStrategy.textContent, '当前策略');
  assert.equal(elements.researchAgentLatestStatus.textContent, '可观察');
  assert.equal(elements.researchAgentEvidenceStatus.textContent, '有策略证据');
});

test('research context falls back to the generated calendar date without timezone conversion', () => {
  const elements = renderContext({ generatedAt: '2026-11-25T00:30:00+08:00' }, {});
  assert.equal(elements.researchAgentDataDate.textContent, '2026-11-25');
});

test('research context renders missing data with its existing placeholders', () => {
  const elements = renderContext();
  assert.equal(elements.researchAgentDataDate.textContent, '-');
  assert.equal(elements.researchAgentCurrentStrategy.textContent, '暂无当前策略');
  assert.equal(elements.researchAgentEvidenceStatus.textContent, '证据待补齐');
});
