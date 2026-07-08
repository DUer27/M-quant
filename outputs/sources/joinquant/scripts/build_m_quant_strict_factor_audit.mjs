import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve('/Users/Admin/Documents/Codex/2026-07-06/ke');
const importedPath = resolve(root, 'work/quant-factor-platform/data/imported-backtest-results.json');
const outputPath = resolve(root, 'outputs/factors/joinquant/m_quant_strict_factor_audit_20260708.json');

const primaryHorizons = new Set([5, 10, 20]);

function isStrategyResult(result) {
  return result?.result_type === 'strategy_backtest'
    || result?.result_type === 'strategy_regime_backtest'
    || result?.result_type === 'strategy_size_backtest'
    || result?.result_type === 'strategy_regime_size_backtest'
    || result?.result_type === 'trading_backtest'
    || result?.result_type === 'strategy_trading_backtest'
    || Array.isArray(result?.summary) && result.summary.some((item) => String(item?.result_type || '').startsWith('strategy_'));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function factorId(result) {
  return result.factor_name || result.factor || result.name || 'unknown';
}

function rankIc(result) {
  return number(result.rank_ic_mean ?? result.rankIc);
}

function rankIcT(result) {
  return number(result.rank_ic_t ?? result.rankIcT);
}

function longShort(result) {
  return number(result.long_short_mean ?? result.longShort);
}

function positiveRatio(result) {
  return number(result.long_short_positive_ratio ?? result.positiveRatio);
}

function sampleDates(result) {
  return number(result.sample_dates ?? result.sampleDates) || 0;
}

function primaryScore(result) {
  const ric = rankIc(result);
  const t = rankIcT(result);
  const ls = longShort(result);
  const pr = positiveRatio(result);
  const passes = ric !== null && t !== null && ls !== null && ric >= 0.015 && t >= 2 && ls > 0;
  return (
    (passes ? 100 : 0)
    + (ric !== null ? ric * 100 : -10)
    + (t !== null ? Math.max(-5, Math.min(5, t)) : -5)
    + (ls !== null ? ls * 20 : -10)
    + (pr !== null ? pr : 0)
  );
}

function decisionFor(best) {
  if (!best) return {
    level: 'waiting_test',
    label: '等待实测',
    reason: '没有 5/10/20 日历史实测结果。',
  };

  const ric = rankIc(best);
  const t = rankIcT(best);
  const ls = longShort(best);
  if (ric !== null && t !== null && ls !== null && ric >= 0.015 && t >= 2 && ls > 0) {
    return {
      level: 'strategy_candidate',
      label: '重点候选',
      reason: `${best.horizon}日 RankIC=${ric.toFixed(4)}，RankIC t=${t.toFixed(2)}，多空收益=${(ls * 100).toFixed(2)}%。`,
    };
  }
  if (ric !== null && ls !== null && ric > 0 && ls > 0) {
    return {
      level: 'watch',
      label: '继续观察',
      reason: `${best.horizon}日方向为正，但显著性或强度未达重点候选门槛。`,
    };
  }
  return {
    level: 'hold',
    label: '暂缓使用',
    reason: '5/10/20 主周期未同时满足 RankIC 为正、多空收益为正和显著性要求。',
  };
}

function flattenStrategyResults(records) {
  return records.flatMap((result) => {
    if (Array.isArray(result.summary)) {
      return result.summary
        .filter((item) => String(item?.result_type || '').startsWith('strategy_'))
        .map((item) => ({
          ...item,
          source: item.source || result.source,
          strategy_id: item.strategy_id || result.strategy_id,
          strategy_name: item.strategy_name || result.strategy_name,
        }));
    }
    return isStrategyResult(result) ? [result] : [];
  });
}

const imported = JSON.parse(readFileSync(importedPath, 'utf8'));
const factorResults = imported.filter((result) => !isStrategyResult(result) && factorId(result) !== 'unknown');
const strategyResults = flattenStrategyResults(imported);

const grouped = new Map();
for (const result of factorResults) {
  const id = factorId(result);
  if (!grouped.has(id)) grouped.set(id, []);
  grouped.get(id).push(result);
}

const factors = [...grouped.entries()].map(([id, results]) => {
  const primary = results
    .filter((result) => primaryHorizons.has(Number(result.horizon)) && sampleDates(result) >= 20)
    .sort((left, right) => primaryScore(right) - primaryScore(left));
  const best = primary[0] || null;
  const decision = decisionFor(best);
  return {
    factorId: id,
    displayName: results[0].factor_display_name || id,
    direction: results[0].direction || 'positive',
    decision,
    bestHorizon: best?.horizon ?? null,
    bestRankIc: best ? rankIc(best) : null,
    bestRankIcT: best ? rankIcT(best) : null,
    bestLongShort: best ? longShort(best) : null,
    bestPositiveRatio: best ? positiveRatio(best) : null,
    primaryResultCount: primary.length,
    totalResultCount: results.length,
    allResults: results
      .filter((result) => [1, 5, 10, 20].includes(Number(result.horizon)))
      .sort((left, right) => Number(left.horizon || 0) - Number(right.horizon || 0))
      .map((result) => ({
        horizon: Number(result.horizon),
        referenceOnly: Number(result.horizon) === 1,
        sampleDates: sampleDates(result),
        rankIc: rankIc(result),
        rankIcT: rankIcT(result),
        longShort: longShort(result),
        positiveRatio: positiveRatio(result),
        source: result.source || '',
      })),
  };
}).sort((left, right) => {
  const order = { strategy_candidate: 0, watch: 1, hold: 2, waiting_test: 3 };
  const levelDiff = (order[left.decision.level] ?? 9) - (order[right.decision.level] ?? 9);
  if (levelDiff !== 0) return levelDiff;
  return (right.bestRankIcT || -999) - (left.bestRankIcT || -999);
});

const selectedFactorIds = factors
  .filter((factor) => factor.decision.level === 'strategy_candidate')
  .map((factor) => factor.factorId);

const strategyRoutes = [
  {
    strategyId: 'jq_quality_profit_liquidity_v1',
    name: 'JQ质量利润流动性策略 v1',
    status: selectedFactorIds.includes('profit_growth_jq')
      && selectedFactorIds.includes('quality_growth_jq')
      && selectedFactorIds.includes('liquidity_quality_jq')
      ? 'ready_for_joinquant_strategy_backtest'
      : 'blocked_by_factor_screen',
    dataPolicy: '只由已通过真实 JoinQuant 因子实测筛选的关键决策因子生成；没有策略级收益前不展示绩效。',
    factors: [
      'profit_growth_jq',
      'quality_growth_jq',
      'liquidity_quality_jq',
    ].map((id) => {
      const factor = factors.find((item) => item.factorId === id);
      return {
        factorId: id,
        name: factor?.displayName || id,
        bestHorizon: factor?.bestHorizon ?? null,
        decision: factor?.decision.label || '等待实测',
        role: id === 'profit_growth_jq' ? '进攻核心' : id === 'quality_growth_jq' ? '质量确认' : '可交易性过滤',
      };
    }),
    blockedFactors: ['valuation_safety_jq', 'low_volatility_quality_jq', 'market_sensitivity_risk_jq']
      .map((id) => factors.find((item) => item.factorId === id))
      .filter(Boolean)
      .map((factor) => ({
        factorId: factor.factorId,
        name: factor.displayName,
        decision: factor.decision.label,
        reason: factor.decision.reason,
      })),
    nextAction: '需要在 JoinQuant 用 valuation/indicator/OHLCV 重建组合信号，做策略级 5/10/20 日和交易回测；当前不得写成已实测策略。',
  },
];

const output = {
  generatedAt: new Date().toISOString(),
  source: importedPath,
  dataPolicy: '严格只使用 imported-backtest-results.json 中的真实回填结果；策略结果与因子结果分离；1日只作参考。',
  thresholds: {
    primaryHorizons: [5, 10, 20],
    strategyCandidate: 'sample_dates >= 20 && RankIC >= 0.015 && RankIC t >= 2 && long_short_mean > 0',
    watch: 'RankIC > 0 && long_short_mean > 0 but below strategy candidate threshold',
  },
  counts: {
    importedRecords: imported.length,
    factorResultRecords: factorResults.length,
    strategyResultPackets: imported.filter(isStrategyResult).length,
    flattenedStrategyResultRecords: strategyResults.length,
    auditedFactors: factors.length,
    selectedFactors: selectedFactorIds.length,
  },
  selectedFactorIds,
  factors,
  strategyRoutes,
};

if (!existsSync(dirname(outputPath))) {
  mkdirSync(dirname(outputPath), { recursive: true });
}
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(outputPath);
