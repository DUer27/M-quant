import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liquidityQualityMath, registeredFactorMath } from '../platform/quant-factor-platform/assets/return-mapping-math.js';

test('liquidity identity uses five weighted component scores from its recorded source', () => {
  const rendered = liquidityQualityMath();
  const firstEquation = rendered.split('</figure>')[0];
  for (const weight of ['0.30', '0.24', '0.18', '0.16', '0.12']) assert.ok(firstEquation.includes(`<mn>${weight}</mn>`));
  for (const component of ['A', 'S', 'T', 'V', 'M']) assert.ok(firstEquation.includes(`<mi>q</mi><mrow><mi>${component}</mi>`));
  assert.ok(rendered.includes('joinquant_key_factor_mining_v1'));
  assert.ok(rendered.includes('平均秩除以有效样本数'));
  assert.ok(rendered.includes('缺失分项填为0.5'));
  assert.ok(rendered.includes('历史回填未记录公式版本或代码哈希'));
  const source = readFileSync(new URL('../outputs/sources/joinquant/scripts/m_quant_joinquant_key_factor_mining_v1.py', import.meta.url), 'utf8');
  for (const sourceTerm of ['0.30 * rank01(np.log1p(part["money_ma20"]), True)', '0.24 * rank01(part["money_stability"], True)', '0.18 * bounded_peak_score(part["turnover_ratio"], 1.5, 3.0)', '0.16 * bounded_peak_score(part["volume_ratio"], 1.2, 1.8)', '0.12 * rank01(part["market_cap"], True)']) assert.ok(source.includes(sourceTerm));
});

test('registered input dependencies are not mislabeled as symbols absent from a conceptual formula', () => {
  const result = registeredFactorMath({ formula: 'score = 成交额水平 + 成交额稳定性', dataDependencies: ['money', 'volume', 'valuation.market_cap'] });
  const caption = result.split('<figcaption')[1].split('</figcaption>')[0];
  assert.ok(caption.includes('score'));
  assert.ok(!caption.includes('<mi mathvariant="normal">money</mi>'));
  assert.ok(!caption.includes('<mi mathvariant="normal">volume</mi>'));
  assert.ok(result.includes('原始依赖字段（与公式符号分开展示）'));
  assert.ok(result.includes('概念性评分说明'));
});

test('exact field token matching handles dotted names and avoids substring matches', () => {
  const result = registeredFactorMath({ formula: 'score = money_ma20 + valuation.market_cap', dataDependencies: ['money', 'valuation.market_cap'] });
  const caption = result.split('<figcaption')[1].split('</figcaption>')[0];
  assert.ok(!caption.includes('<mi mathvariant="normal">money</mi>'));
  assert.ok(caption.includes('<mi mathvariant="normal">valuation.market_cap</mi>'));
});

test('untrusted registered formulas and field names remain escaped text', () => {
  const result = registeredFactorMath({ formula: '<img src=x onerror=alert(1)>', dataDependencies: ['<script>unsafe</script>'] });
  assert.ok(!result.includes('<img'));
  assert.ok(!result.includes('<script>'));
});
