import { preferences as fallbackPreferences } from '../preferences.js';

const appConfig = window.__QUANT_APP_CONFIG__ || {};

document.title = appConfig.title || fallbackPreferences.app.name;
document.querySelector('#api-url').textContent = appConfig.apiURL || '/api';

const factorAvailabilityAliases = {
  chip_health_factor: 'chip_health',
  kdj_momentum_factor: 'kdj_momentum',
  macd_acceleration_factor: 'macd_acceleration',
  technical_composite_factor: 'technical_composite',
  trend_alignment_factor: 'trend_alignment',
  volume_trend_confirm_factor: 'volume_price_confirmation',
};

const categoryNames = {
  capital_flow: '资金',
  chip: '筹码',
  composite: '综合',
  event: '异动',
  momentum: '动能',
  price_volume: '量价',
  sector: '板块',
  sentiment: '情绪',
  trend: '趋势',
};

const elements = {
  benchmark: document.querySelector('#benchmark'),
  backtestDateCount: document.querySelector('#backtest-date-count'),
  backtestExternalStatus: document.querySelector('#backtest-external-status'),
  backtestFactorCount: document.querySelector('#backtest-factor-count'),
  backtestFactorTable: document.querySelector('#backtest-factor-table'),
  backtestImportMessage: document.querySelector('#backtest-import-message'),
  backtestLocalStatus: document.querySelector('#backtest-local-status'),
  backtestResultNotes: document.querySelector('#backtest-result-notes'),
  backtestResultJson: document.querySelector('#backtest-result-json'),
  backtestResultSummary: document.querySelector('#backtest-result-summary'),
  backtestResultTable: document.querySelector('#backtest-result-table'),
  backtestRowCount: document.querySelector('#backtest-row-count'),
  backtestSourceFile: document.querySelector('#backtest-source-file'),
  backtestStatusList: document.querySelector('#backtest-status-list'),
  candidateFactorCount: document.querySelector('#candidate-factor-count'),
  demoFactorCount: document.querySelector('#demo-factor-count'),
  downloadJoinquantCsv: document.querySelector('#download-joinquant-csv'),
  factorTable: document.querySelector('#factor-table'),
  factorLibraryTable: document.querySelector('#factor-library-table'),
  fee: document.querySelector('#fee'),
  formMessage: document.querySelector('#form-message'),
  importedBacktestList: document.querySelector('#imported-backtest-list'),
  importBacktestResult: document.querySelector('#import-backtest-result'),
  joinquantExportSummary: document.querySelector('#joinquant-export-summary'),
  joinquantStepList: document.querySelector('#joinquant-step-list'),
  klineRulesTable: document.querySelector('#kline-rules-table'),
  libraryComputedCount: document.querySelector('#library-computed-count'),
  libraryKlineRuleCount: document.querySelector('#library-kline-rule-count'),
  libraryRowCount: document.querySelector('#library-row-count'),
  librarySourceFile: document.querySelector('#library-source-file'),
  librarySourceKind: document.querySelector('#library-source-kind'),
  libraryUnavailableCount: document.querySelector('#library-unavailable-count'),
  navButtons: document.querySelectorAll('.nav button[data-view-target]'),
  pendingFactorCount: document.querySelector('#pending-factor-count'),
  rebalance: document.querySelector('#rebalance'),
  askResearchAssistant: document.querySelector('#ask-research-assistant'),
  refreshBacktestCenter: document.querySelector('#refresh-backtest-center'),
  researchActionList: document.querySelector('#research-action-list'),
  researchAssistantFactor: document.querySelector('#research-assistant-factor'),
  researchAssistantInput: document.querySelector('#research-assistant-input'),
  researchAssistantMessages: document.querySelector('#research-assistant-messages'),
  researchAssistantStatus: document.querySelector('#research-assistant-status'),
  researchBlockedCount: document.querySelector('#research-blocked-count'),
  researchCandidateCount: document.querySelector('#research-candidate-count'),
  researchFactorCount: document.querySelector('#research-factor-count'),
  researchFactorDetail: document.querySelector('#research-factor-detail'),
  researchFactorList: document.querySelector('#research-factor-list'),
  researchSourceFile: document.querySelector('#research-source-file'),
  researchTestedCount: document.querySelector('#research-tested-count'),
  risk: document.querySelector('#risk-control'),
  savePreferences: document.querySelector('#save-preferences'),
  runBacktest: document.querySelector('#run-backtest'),
  strategyBlockedCount: document.querySelector('#strategy-blocked-count'),
  strategyCandidateTable: document.querySelector('#strategy-candidate-table'),
  strategyFactorList: document.querySelector('#strategy-factor-list'),
  strategyLiveList: document.querySelector('#strategy-live-list'),
  strategyLibraryList: document.querySelector('#strategy-library-list'),
  strategyObservationCount: document.querySelector('#strategy-observation-count'),
  strategyPartialCount: document.querySelector('#strategy-partial-count'),
  strategySourceFile: document.querySelector('#strategy-source-file'),
  strategyStrongCount: document.querySelector('#strategy-strong-count'),
  strategyUnavailableList: document.querySelector('#strategy-unavailable-list'),
  universe: document.querySelector('#universe'),
  validFactorCount: document.querySelector('#valid-factor-count'),
  validatedBestHorizon: document.querySelector('#validated-best-horizon'),
  validatedFactorDirectory: document.querySelector('#validated-factor-directory'),
  validatedFactorCount: document.querySelector('#validated-factor-count'),
  validatedHistoryCount: document.querySelector('#validated-history-count'),
  validatedResultCount: document.querySelector('#validated-result-count'),
  views: document.querySelectorAll('.view'),
};

let activeValidatedFactor = 'all';
let activeResearchFactor = null;
let currentResearchPipeline = null;

function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

function getPreferencePayload() {
  return {
    benchmark: elements.benchmark.value,
    feeRate: Number(elements.fee.value),
    rebalanceFrequency: elements.rebalance.value,
    riskControl: elements.risk.checked,
    slippage: fallbackPreferences.quant.defaultSlippage,
    universe: elements.universe.value,
  };
}

function setFormMessage(message, tone = 'muted') {
  elements.formMessage.textContent = message;
  elements.formMessage.dataset.tone = tone;
}

function renderSummary(summary) {
  elements.candidateFactorCount.textContent = summary.candidateFactorCount;
  elements.validFactorCount.textContent = summary.validFactorCount;
  elements.pendingFactorCount.textContent = summary.pendingFactorCount;
  elements.demoFactorCount.textContent = summary.demoFactorCount;
}

function renderFactors(rows) {
  elements.factorTable.innerHTML = rows
    .map((row) => {
      const tagClass = row.factor_label === '强势候选'
        ? 'good'
        : row.factor_label === '观察候选'
        ? 'pending'
        : row.factor_label === '弱势过滤'
          ? 'watch'
          : row.factor_label === '风险观察'
            ? 'watch'
            : 'neutral';
      const stockCode = String(row.stock_code).padStart(6, '0');
      const klineNotes = [row.kline_patterns, row.kline_unscored_patterns ? `未计分：${row.kline_unscored_patterns}` : '']
        .filter(Boolean)
        .join('；');
      const reason = row.factor_reason || klineNotes;
      return `
        <tr title="${reason}">
          <td>${stockCode} ${row.stock_name}</td>
          <td>${Number(row.technical_composite).toFixed(2)}</td>
          <td>${Number(row.trend_alignment).toFixed(2)}</td>
          <td>${Number(row.trend_extension_risk ?? 0).toFixed(2)}</td>
          <td>${Number(row.volume_price_confirmation).toFixed(2)}</td>
          <td>${Number(row.volume_price_divergence_risk ?? 0).toFixed(2)}</td>
          <td>${Number(row.intraday_strength).toFixed(2)}</td>
          <td>${Number(row.close_position_strength ?? 0.5).toFixed(2)}</td>
          <td>${Number(row.upper_shadow_pressure ?? 0).toFixed(2)}</td>
          <td>${Number(row.volume_blowoff_risk ?? 0).toFixed(2)}</td>
          <td>${Number(row.kline_event_score || 0).toFixed(0)}</td>
          <td>${Number(row.crowding_risk).toFixed(2)}</td>
          <td>${Number(row.transaction_crowding_risk ?? 0).toFixed(2)}</td>
          <td>${Number(row.crowding_alert_count ?? 0).toFixed(0)}</td>
          <td><span class="tag ${tagClass}">${row.factor_label}</span></td>
        </tr>
      `;
    })
    .join('');
}

function renderPreferences(preferences) {
  elements.universe.value = preferences.universe;
  elements.benchmark.value = preferences.benchmark;
  elements.rebalance.value = preferences.rebalanceFrequency;
  elements.fee.value = String(preferences.feeRate);
  elements.risk.checked = preferences.riskControl;
}

function renderRisk(risks) {
  const riskList = document.querySelector('.risk-list');
  riskList.innerHTML = risks
    .map((risk) => {
      const tone = risk.value > risk.limit ? 'watch' : 'good';
      return `
        <div>
          <span>${risk.name}</span>
          <meter min="0" max="100" value="${risk.value}"></meter>
          <strong class="${tone}">${risk.value}%</strong>
        </div>
      `;
    })
    .join('');
}

function labelForStatus(status) {
  if (status === 'computed') return ['已计算', 'good'];
  if (status === 'exportable') return ['可导出', 'good'];
  if (status === 'partial_real_data') return ['部分可用', 'pending'];
  if (status === 'joinquant_ready') return ['聚宽可测', 'good'];
  if (status === 'ready_for_local_factor_test') return ['本地可测', 'good'];
  if (status === 'handled_by_joinquant') return ['交由聚宽', 'pending'];
  if (status === 'insufficient_history' || status === 'blocked_by_resonance_history') return ['历史不足', 'watch'];
  if (status === 'requires_more_data') return ['待采集字段', 'watch'];
  if (status === 'requires_joinquant_or_history') return ['需外部复测', 'watch'];
  if (status === 'blocked') return ['被阻塞', 'watch'];
  if (status === 'missing_field') return ['缺字段', 'watch'];
  if (status === 'unavailable') return ['不可用', 'watch'];
  return [status || '待确认', 'neutral'];
}

function factorDisplayName(id) {
  const names = {
    chip_health: '筹码健康',
    crowding_risk: '拥挤风险',
    emotion_weighted_kline_score: '情绪加权K线',
    intraday_strength: '日内强度',
    kdj_momentum: 'KDJ动能',
    kline_event_score: '单根K线评分',
    low_emotion_score: '低情绪反向',
    macd_acceleration: 'MACD动能加速',
    professional_sub_factors: '专业解释子因子',
    technical_composite: '技术综合强度',
    trend_alignment: '趋势排列',
    volume_price_confirmation: '量价确认',
    volume_price_resonance_60_5: '价量共振_60_5',
    capital_follow_factor: '资金跟随因子',
    event_volume_confirmation_factor: '异动放量确认因子',
    institution_retail_divergence_factor: '主散背离因子',
    panic_reversal_factor: '恐慌反转因子',
    sector_capital_resonance_factor: '板块资金共振因子',
    sentiment_overheat_factor: '情绪过热因子',
  };
  return names[id] || id;
}

function formatNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toFixed(digits);
}

function formatPercent(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${(number * 100).toFixed(digits)}%`;
}

function resultTone(result) {
  const rankIc = Number(result.rank_ic_mean ?? result.rankIc ?? 0);
  const longShort = Number(result.long_short_mean ?? result.longShort ?? 0);
  const dates = Number(result.sample_dates ?? 0);

  if (dates < 20) return ['跟踪中', 'pending'];
  if (rankIc >= 0.015 && longShort > 0) return ['较好', 'good'];
  if (rankIc > 0 && longShort > 0) return ['观察', 'pending'];
  return ['偏弱', 'watch'];
}

function resultFactorId(result) {
  return result.factor_name || result.factor || result.name || 'unknown';
}

function renderValidatedFactorDirectory(results) {
  const factorMap = new Map();

  results.forEach((result) => {
    const factor = resultFactorId(result);
    const current = factorMap.get(factor) || {
      count: 0,
      displayName: factorDisplayName(factor),
      historicalCount: 0,
    };
    current.count += 1;
    if (Number(result.sample_dates ?? 0) >= 20) current.historicalCount += 1;
    factorMap.set(factor, current);
  });

  if (activeValidatedFactor !== 'all' && !factorMap.has(activeValidatedFactor)) {
    activeValidatedFactor = 'all';
  }

  const factorButtons = [...factorMap.entries()]
    .sort((left, right) => {
      const countDiff = right[1].count - left[1].count;
      if (countDiff !== 0) return countDiff;
      return left[1].displayName.localeCompare(right[1].displayName, 'zh-Hans-CN');
    })
    .map(([factor, meta]) => {
      const active = activeValidatedFactor === factor ? ' active' : '';
      const historicalText = meta.historicalCount ? ` / 历史 ${meta.historicalCount}` : '';
      return `
        <button class="factor-directory-button${active}" data-validated-factor="${escapeHtml(factor)}" type="button">
          <strong>${escapeHtml(meta.displayName)}</strong>
          <span>${escapeHtml(meta.count)} 条${historicalText}</span>
        </button>
      `;
    })
    .join('');
  const activeMeta = activeValidatedFactor === 'all'
    ? {
      count: results.length,
      displayName: '全部因子',
      historicalCount: [...factorMap.values()].reduce((sum, item) => sum + item.historicalCount, 0),
    }
    : factorMap.get(activeValidatedFactor);
  const activeHistoricalText = activeMeta?.historicalCount ? ` / 历史 ${activeMeta.historicalCount}` : '';

  elements.validatedFactorDirectory.innerHTML = `
    <details class="factor-directory-disclosure">
      <summary>
        <div>
          <span>因子目录</span>
          <strong>${escapeHtml(activeMeta?.displayName || '全部因子')}</strong>
          <small>${escapeHtml(activeMeta?.count ?? results.length)} 条${activeHistoricalText}</small>
        </div>
        <em>点击展开</em>
      </summary>
      <div class="factor-directory-list">
        <button class="factor-directory-button${activeValidatedFactor === 'all' ? ' active' : ''}" data-validated-factor="all" type="button">
          <strong>全部因子</strong>
          <span>${escapeHtml(results.length)} 条</span>
        </button>
        ${factorButtons}
      </div>
    </details>
  `;

  elements.validatedFactorDirectory.querySelectorAll('[data-validated-factor]').forEach((button) => {
    button.addEventListener('click', () => {
      activeValidatedFactor = button.dataset.validatedFactor || 'all';
      renderBacktestResultSummary(results);
    });
  });
}

function renderBacktestResultSummary(results) {
  if (!results.length) {
    activeValidatedFactor = 'all';
    elements.validatedResultCount.textContent = '0';
    elements.validatedFactorCount.textContent = '0';
    elements.validatedHistoryCount.textContent = '0';
    elements.validatedBestHorizon.textContent = '-';
    elements.validatedFactorDirectory.innerHTML = `
      <div class="factor-directory-empty">暂无可筛选因子。导入 JoinQuant 实跑结果后会自动生成目录。</div>
    `;
    elements.backtestResultSummary.innerHTML = `
      <div class="result-card">
        <span>实测结果</span>
        <strong>0</strong>
        <small>等待 JoinQuant 回填</small>
      </div>
    `;
    elements.backtestResultTable.innerHTML = '<tr><td colspan="10">暂无实测结果。</td></tr>';
    elements.backtestResultNotes.textContent = '当前只展示真实导入结果，不生成估算绩效。';
    return;
  }

  renderValidatedFactorDirectory(results);

  const visibleResults = activeValidatedFactor === 'all'
    ? results
    : results.filter((item) => resultFactorId(item) === activeValidatedFactor);
  const factorCount = new Set(visibleResults.map((item) => resultFactorId(item)).filter(Boolean)).size;
  const bestRankIc = visibleResults.reduce((best, item) => {
    const current = Number(item.rank_ic_mean ?? item.rankIc);
    const previous = Number(best?.rank_ic_mean ?? best?.rankIc);
    if (!Number.isFinite(current)) return best;
    if (!best || !Number.isFinite(previous) || current > previous) return item;
    return best;
  }, null);
  const bestLongShort = visibleResults.reduce((best, item) => {
    const current = Number(item.long_short_mean ?? item.longShort);
    const previous = Number(best?.long_short_mean ?? best?.longShort);
    if (!Number.isFinite(current)) return best;
    if (!best || !Number.isFinite(previous) || current > previous) return item;
    return best;
  }, null);
  const historicalCount = visibleResults.filter((item) => Number(item.sample_dates ?? 0) >= 20).length;
  elements.validatedResultCount.textContent = visibleResults.length;
  elements.validatedFactorCount.textContent = factorCount;
  elements.validatedHistoryCount.textContent = historicalCount;
  elements.validatedBestHorizon.textContent = bestLongShort?.horizon ? `${bestLongShort.horizon}日` : '-';

  elements.backtestResultSummary.innerHTML = `
    <div class="result-card">
      <span>${activeValidatedFactor === 'all' ? '结果记录' : '当前因子结果'}</span>
      <strong>${escapeHtml(visibleResults.length)}</strong>
      <small>${activeValidatedFactor === 'all' ? `${escapeHtml(factorCount)} 个因子` : escapeHtml(factorDisplayName(activeValidatedFactor))}</small>
    </div>
    <div class="result-card">
      <span>历史样本结果</span>
      <strong>${escapeHtml(historicalCount)}</strong>
      <small>样本期不少于 20 个截面</small>
    </div>
    <div class="result-card">
      <span>最佳 RankIC</span>
      <strong>${formatNumber(bestRankIc?.rank_ic_mean ?? bestRankIc?.rankIc)}</strong>
      <small>${escapeHtml(factorDisplayName(bestRankIc?.factor_name || bestRankIc?.factor || '-'))} / ${escapeHtml(bestRankIc?.horizon ?? '-')}日</small>
    </div>
    <div class="result-card">
      <span>最佳多空</span>
      <strong>${formatPercent(bestLongShort?.long_short_mean ?? bestLongShort?.longShort)}</strong>
      <small>${escapeHtml(factorDisplayName(bestLongShort?.factor_name || bestLongShort?.factor || '-'))} / ${escapeHtml(bestLongShort?.horizon ?? '-')}日</small>
    </div>
  `;

  elements.backtestResultTable.innerHTML = visibleResults
    .slice()
    .sort((left, right) => {
      const leftDates = Number(left.sample_dates ?? 0);
      const rightDates = Number(right.sample_dates ?? 0);
      if (rightDates !== leftDates) return rightDates - leftDates;
      return String(resultFactorId(left)).localeCompare(String(resultFactorId(right)));
    })
    .map((result) => {
      const [label, tone] = resultTone(result);
      const factor = resultFactorId(result);
      return `
        <tr>
          <td><strong>${escapeHtml(factorDisplayName(factor))}</strong><br><small>${escapeHtml(result.factor_variant || factor)}</small></td>
          <td>${escapeHtml(result.horizon ?? '-')}日</td>
          <td>${result.direction === 'negative' ? '风险越高越差' : '分数越高越好'}</td>
          <td>${escapeHtml(result.sample_dates ?? '-')} / ${formatNumber(result.coverage_mean, 0)}</td>
          <td>${formatNumber(result.rank_ic_mean ?? result.rankIc)}</td>
          <td>${formatNumber(result.rank_ic_t ?? result.rankIcT)}</td>
          <td>${formatPercent(result.long_short_mean ?? result.longShort)}</td>
          <td>${formatPercent(result.long_short_positive_ratio ?? result.positiveRatio)}</td>
          <td>${escapeHtml(result.source || 'joinquant')}</td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
        </tr>
      `;
    })
    .join('');

  const singleDayCount = visibleResults.filter((item) => Number(item.sample_dates ?? 0) < 20).length;
  elements.backtestResultNotes.innerHTML = `
    <strong>结果边界：</strong>
    ${activeValidatedFactor === 'all' ? '当前展示全部因子。' : `当前筛选：${escapeHtml(factorDisplayName(activeValidatedFactor))}。`}
    已导入结果来自 JoinQuant 实跑。${singleDayCount ? `${singleDayCount} 条为单日截面，只能跟踪，不能定论。` : ''}
    历史重建结果基于 JoinQuant OHLCV，和 Yiwan 全字段因子不是完全等价复刻。
  `;
}

function renderResearchDetail(entry) {
  if (!entry) {
    elements.researchFactorDetail.innerHTML = '<div class="library-source">暂无因子档案。</div>';
    return;
  }

  const [realStatusLabel, realStatusTone] = labelForStatus(entry.realStatus);
  const dataGaps = entry.dataGaps?.length
    ? entry.dataGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('')
    : '<li>当前没有额外缺口记录。</li>';
  const dependencies = entry.dataDependencies?.length
    ? entry.dataDependencies.join(', ')
    : '当前没有登记字段依赖';

  elements.researchFactorDetail.innerHTML = `
    <div class="research-detail-head">
      <div>
        <h3>${escapeHtml(entry.name)}</h3>
        <small>${escapeHtml(entry.factorId)} / ${escapeHtml(categoryNames[entry.category] || entry.category || 'research')}</small>
      </div>
      <span class="tag ${escapeHtml(entry.decisionTone)}">${escapeHtml(entry.decision)}</span>
    </div>
    <div class="research-detail-grid">
      <div>
        <span>阶段</span>
        <strong>${escapeHtml(entry.stage)}</strong>
      </div>
      <div>
        <span>真实状态</span>
        <strong><span class="tag ${realStatusTone}">${escapeHtml(realStatusLabel)}</span></strong>
      </div>
      <div>
        <span>回填结果</span>
        <strong>${escapeHtml(entry.resultCount)} 条</strong>
      </div>
      <div>
        <span>可导出行</span>
        <strong>${escapeHtml(entry.exportRows)}</strong>
      </div>
    </div>
    <div class="research-section">
      <strong>研究假设</strong>
      <p>${escapeHtml(entry.usage || entry.formula || '当前只登记为研究对象。')}</p>
    </div>
    <div class="research-section">
      <strong>因子公式/口径</strong>
      <p>${escapeHtml(entry.formula || '-')}</p>
    </div>
    <div class="research-section">
      <strong>实测证据</strong>
      <p>${escapeHtml(entry.evidence)}</p>
      <div class="research-detail-grid compact">
        <div><span>RankIC</span><strong>${formatNumber(entry.test?.bestRankIc)}</strong></div>
        <div><span>RankIC t</span><strong>${formatNumber(entry.test?.bestRankIcT, 2)}</strong></div>
        <div><span>多空收益</span><strong>${formatPercent(entry.test?.bestLongShort)}</strong></div>
        <div><span>最佳周期</span><strong>${entry.test?.bestHorizon ? `${escapeHtml(entry.test.bestHorizon)}日` : '-'}</strong></div>
      </div>
    </div>
    <div class="research-section">
      <strong>数据依赖</strong>
      <p>${escapeHtml(dependencies)}</p>
    </div>
    <div class="research-section">
      <strong>数据缺口</strong>
      <ul>${dataGaps}</ul>
    </div>
    <div class="research-section action">
      <strong>下一步</strong>
      <p>${escapeHtml(entry.nextAction)}</p>
    </div>
  `;
}

function renderResearchPipeline(pipeline) {
  currentResearchPipeline = pipeline;
  const entries = pipeline.entries || [];
  const metrics = pipeline.metrics || {};

  if (!activeResearchFactor || !entries.some((entry) => entry.factorId === activeResearchFactor)) {
    activeResearchFactor = entries[0]?.factorId || null;
  }

  elements.researchFactorCount.textContent = metrics.factorCount ?? '-';
  elements.researchTestedCount.textContent = metrics.testedCount ?? '-';
  elements.researchCandidateCount.textContent = metrics.strategyCandidateCount ?? '-';
  elements.researchBlockedCount.textContent = metrics.blockedCount ?? '-';
  elements.researchSourceFile.textContent = pipeline.source?.file
    ? `当前研究数据源：${pipeline.source.file}`
    : '当前研究数据源：未加载';

  elements.researchAssistantStatus.innerHTML = `
    <span class="tag ${pipeline.assistant?.llmStatus === 'configured' ? 'good' : 'pending'}">
      ${pipeline.assistant?.llmStatus === 'configured' ? 'LLM 已配置' : '本地约束助手'}
    </span>
    <span>${escapeHtml(pipeline.assistant?.policy || '只基于项目真实数据输出建议。')}</span>
  `;

  elements.researchFactorList.innerHTML = entries
    .map((entry) => `
      <button class="research-factor-item${entry.factorId === activeResearchFactor ? ' active' : ''}" data-research-factor="${escapeHtml(entry.factorId)}" type="button">
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.stage)} / ${escapeHtml(entry.resultCount)} 条实测</span>
        </div>
        <span class="tag ${escapeHtml(entry.decisionTone)}">${escapeHtml(entry.decision)}</span>
      </button>
    `)
    .join('');

  elements.researchFactorList.querySelectorAll('[data-research-factor]').forEach((button) => {
    button.addEventListener('click', () => {
      activeResearchFactor = button.dataset.researchFactor;
      renderResearchPipeline(currentResearchPipeline);
    });
  });

  elements.researchAssistantFactor.innerHTML = `
    <option value="">全局问题</option>
    ${entries.map((entry) => `
      <option value="${escapeHtml(entry.factorId)}"${entry.factorId === activeResearchFactor ? ' selected' : ''}>
        ${escapeHtml(entry.name)}
      </option>
    `).join('')}
  `;

  const selected = entries.find((entry) => entry.factorId === activeResearchFactor);
  renderResearchDetail(selected);

  elements.researchActionList.innerHTML = entries
    .slice(0, 8)
    .map((entry) => `
      <div class="status-item">
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.nextAction)}</span>
        </div>
        <span class="tag ${escapeHtml(entry.decisionTone)}">${escapeHtml(entry.decision)}</span>
      </div>
    `)
    .join('');

  if (!elements.researchAssistantMessages.innerHTML) {
    elements.researchAssistantMessages.innerHTML = `
      <div class="assistant-message">
        <strong>研究助手</strong>
        <ul>
          <li>我已经接入当前因子定义、真实计算状态和 JoinQuant 回填结果。</li>
          <li>没有配置外部 LLM 前，我只用本地规则做解释和下一步建议。</li>
          <li>所有建议都标记为待验证，不会当作真实收益结论。</li>
        </ul>
      </div>
    `;
  }
}

function appendAssistantMessage(role, lines) {
  const content = Array.isArray(lines)
    ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : `<p>${escapeHtml(lines)}</p>`;
  elements.researchAssistantMessages.insertAdjacentHTML('beforeend', `
    <div class="assistant-message ${role === 'user' ? 'user' : ''}">
      <strong>${role === 'user' ? '你' : '研究助手'}</strong>
      ${content}
    </div>
  `);
  elements.researchAssistantMessages.scrollTop = elements.researchAssistantMessages.scrollHeight;
}

function buildLibraryEntries(summary, factorDefinitions) {
  const meta = summary.factor_meta || {};
  const availability = meta.availability || {};
  const consumedAvailabilityIds = new Set();
  const merged = [];

  for (const definition of factorDefinitions) {
    const availabilityId = factorAvailabilityAliases[definition.id] || definition.id;
    const realState = availability[availabilityId];

    if (realState) {
      consumedAvailabilityIds.add(availabilityId);
      merged.push([
        availabilityId,
        {
          ...realState,
          category: definition.category,
          dataSource: definition.dataSource,
          definitionId: definition.id,
          direction: definition.direction,
          displayName: definition.name,
          formula: realState.formula || definition.formula,
          note: realState.note || definition.signal,
          requiredFields: definition.requiredFields,
          usage: definition.usage,
        },
      ]);
      continue;
    }

    merged.push([
      definition.id,
      {
        category: definition.category,
        dataSource: definition.dataSource,
        direction: definition.direction,
        displayName: definition.name,
        fields: definition.requiredFields,
        formula: definition.formula,
        reason: `当前采集包没有完整的 ${definition.requiredFields.join(', ')} 字段或对应板块明细，只登记逻辑，不计算结果。`,
        signal: definition.signal,
        status: 'requires_more_data',
        usage: definition.usage,
      },
    ]);
  }

  for (const [id, value] of Object.entries(availability)) {
    if (!consumedAvailabilityIds.has(id)) {
      merged.push([id, value]);
    }
  }

  const statusOrder = {
    computed: 0,
    partial_real_data: 1,
    insufficient_history: 2,
    blocked_by_resonance_history: 3,
    unavailable: 4,
    requires_more_data: 5,
  };

  return merged.sort((left, right) => {
    const leftOrder = statusOrder[left[1].status] ?? 9;
    const rightOrder = statusOrder[right[1].status] ?? 9;

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return factorDisplayName(left[0]).localeCompare(factorDisplayName(right[0]), 'zh-CN');
  });
}

function renderFactorLibrary(summary, strategies, factorDefinitions) {
  const meta = summary.factor_meta || {};
  const availability = meta.availability || {};
  const entries = buildLibraryEntries(summary, factorDefinitions);
  const computed = entries.filter(([, value]) => value.status === 'computed');
  const unavailable = entries.filter(([, value]) => value.status !== 'computed');
  const kline = availability.kline_event_score || {};
  const scoredRules = kline.rules || [];
  const unscoredRules = kline.unscored_rules || [];

  elements.libraryRowCount.textContent = meta.rows ?? '-';
  elements.librarySourceKind.textContent = summary.input_kind || '未知输入';
  elements.libraryComputedCount.textContent = computed.length;
  elements.libraryUnavailableCount.textContent = unavailable.length;
  elements.libraryKlineRuleCount.textContent = `${scoredRules.length}/${unscoredRules.length}`;
  elements.librarySourceFile.textContent = summary.source_file
    ? `当前数据源：${summary.source_file}`
    : '当前数据源：未加载';

  elements.factorLibraryTable.innerHTML = entries
    .map(([id, value]) => {
      const [label, tone] = labelForStatus(value.status);
      const category = categoryNames[value.category] || value.category || '真实计算';
      const source = value.dataSource ? `来源：${value.dataSource}` : '';
      const fields = Array.isArray(value.fields) && value.fields.length > 0
        ? value.fields.join(', ')
        : Array.isArray(value.requiredFields) && value.requiredFields.length > 0
          ? value.requiredFields.join(', ')
        : value.formula || '-';
      const note = value.reason || value.note || value.signal || value.formula || '基于当前真实明细数据计算';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(value.displayName || factorDisplayName(id))}</strong>
            <br><small>${escapeHtml(id)}</small>
            <br><small>${escapeHtml(category)}${source ? ` / ${escapeHtml(source)}` : ''}</small>
          </td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(fields)}</td>
          <td>
            ${escapeHtml(note)}
            ${value.usage ? `<br><small>${escapeHtml(value.usage)}</small>` : ''}
          </td>
        </tr>
      `;
    })
    .join('');

  const klineRows = [
    ...scoredRules.map((rule) => ({ ...rule, statusText: '计入总分' })),
    ...unscoredRules.map((rule) => ({ ...rule, statusText: '仅识别' })),
  ];

  elements.klineRulesTable.innerHTML = klineRows
    .map((rule) => {
      const score = rule.score === null || rule.score === undefined ? '-' : rule.score;
      const holding = rule.holding_days === null || rule.holding_days === undefined ? '-' : `${rule.holding_days}日`;
      const kelly = typeof rule.kelly === 'number' ? percent(rule.kelly, 2) : '-';

      return `
        <tr>
          <td><strong>${escapeHtml(rule.name)}</strong><br><small>${escapeHtml(rule.id)}</small></td>
          <td>${escapeHtml(score)}</td>
          <td>${escapeHtml(holding)}</td>
          <td>${escapeHtml(kelly)}</td>
          <td>${escapeHtml(rule.statusText)}；${escapeHtml(rule.source)}</td>
        </tr>
      `;
    })
    .join('');

  const strategy = strategies[0] || {};
  elements.strategyFactorList.innerHTML = (strategy.factors || [])
    .map((factor) => {
      const [label, tone] = labelForStatus(factor.currentStatus);
      return `
        <div class="status-item">
          <div>
            <strong>${escapeHtml(factor.name)}</strong>
            <span>${escapeHtml(factor.formula)}</span>
          </div>
          <span class="tag ${tone}">${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join('');
}

function renderStrategyLibrary(strategies) {
  elements.strategyLibraryList.innerHTML = strategies
    .map((strategy) => {
      const [label, tone] = labelForStatus(strategy.status);
      const effective = strategy.currentRealDataState?.effectiveNow || [];
      const pending = strategy.currentRealDataState?.notEffectiveYet || [];
      return `
        <article class="strategy-item">
          <div class="strategy-head">
            <div>
              <h3>${escapeHtml(strategy.name)}</h3>
              <p>${escapeHtml(strategy.dataPolicy)}</p>
            </div>
            <span class="tag ${tone}">${escapeHtml(label)}</span>
          </div>
          <div class="strategy-columns">
            <div>
              <strong>当前可用</strong>
              <span>${escapeHtml(effective.join(', ') || '-')}</span>
            </div>
            <div>
              <strong>等待数据</strong>
              <span>${escapeHtml(pending.join(', ') || '-')}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function toneForAction(actionTone) {
  if (actionTone === 'good') return 'good';
  if (actionTone === 'watch') return 'watch';
  if (actionTone === 'pending') return 'pending';
  return 'neutral';
}

function renderLiveStrategies(signalPack) {
  const metrics = signalPack.metrics || {};
  elements.strategyStrongCount.textContent = metrics.entryCandidates ?? '-';
  elements.strategyObservationCount.textContent = metrics.observationCandidates ?? '-';
  elements.strategyPartialCount.textContent = metrics.partialStrategies ?? '-';
  elements.strategyBlockedCount.textContent = metrics.blockedStrategies ?? '-';
  elements.strategySourceFile.textContent = signalPack.source?.file
    ? `当前策略数据源：${signalPack.source.file}`
    : '当前策略数据源：未加载';

  elements.strategyLiveList.innerHTML = (signalPack.strategies || [])
    .map((strategy) => {
      const [label, tone] = labelForStatus(strategy.status);
      return `
        <article class="strategy-item">
          <div class="strategy-head">
            <div>
              <h3>${escapeHtml(strategy.name)}</h3>
              <p>${escapeHtml(strategy.objective)}</p>
            </div>
            <span class="tag ${tone}">${escapeHtml(label)}</span>
          </div>
          <div class="strategy-columns three">
            <div>
              <strong>角色</strong>
              <span>${escapeHtml(strategy.role)}</span>
            </div>
            <div>
              <strong>候选数</strong>
              <span>${escapeHtml(strategy.candidateCount)}</span>
            </div>
            <div>
              <strong>公式</strong>
              <span>${escapeHtml(strategy.formula)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  elements.strategyCandidateTable.innerHTML = (signalPack.candidates || [])
    .map((row) => {
      const tone = toneForAction(row.actionTone);
      return `
        <tr title="${escapeHtml(row.reason)}">
          <td>${escapeHtml(String(row.code).padStart(6, '0'))} ${escapeHtml(row.name)}</td>
          <td>${Number(row.decisionScore).toFixed(3)}</td>
          <td>${Number(row.trend).toFixed(2)}</td>
          <td>${Number(row.volumePrice).toFixed(2)}</td>
          <td>${Number(row.crowdingRisk).toFixed(2)}</td>
          <td>${Number(row.divergenceRisk).toFixed(2)}</td>
          <td>${Number(row.warningCount).toFixed(0)}</td>
          <td><span class="tag ${tone}">${escapeHtml(row.action)}</span></td>
          <td>${escapeHtml(row.positionHint)}</td>
          <td>${escapeHtml(row.reason)}</td>
        </tr>
      `;
    })
    .join('');

  elements.strategyUnavailableList.innerHTML = (signalPack.unavailable || [])
    .map((item) => `
      <div class="status-item">
        <div>
          <strong>${escapeHtml(item.id)}</strong>
          <span>${escapeHtml(item.reason)}</span>
        </div>
        <span class="tag watch">等待数据</span>
      </div>
    `)
    .join('');
}

function renderBacktestCenter(status) {
  const metrics = status.metrics || {};
  const source = status.source || {};
  const [localLabel, localTone] = labelForStatus(metrics.localStatus);
  const [externalLabel, externalTone] = labelForStatus(metrics.externalStatus);

  elements.backtestRowCount.textContent = source.rows ?? '-';
  elements.backtestDateCount.textContent = `${source.uniqueDates ?? 0} 个交易日 / ${source.uniqueStocks ?? 0} 只股票`;
  elements.backtestFactorCount.textContent = metrics.exportableFactors ?? '-';
  elements.backtestLocalStatus.innerHTML = `<span class="tag ${localTone}">${escapeHtml(localLabel)}</span>`;
  elements.backtestExternalStatus.innerHTML = `<span class="tag ${externalTone}">${escapeHtml(externalLabel)}</span>`;
  elements.backtestSourceFile.textContent = source.file
    ? `当前复测数据源：${source.file}`
    : '当前复测数据源：未加载';

  elements.backtestStatusList.innerHTML = (status.blockers || [])
    .map((item) => {
      const [label, tone] = labelForStatus(item.status);
      return `
        <div class="status-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </div>
          <span class="tag ${tone}">${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join('');

  elements.joinquantExportSummary.innerHTML = `
    <div class="status-item">
      <div>
        <strong>导出格式</strong>
        <span>每个因子都可单独下载；全部导出仅作为批量研究备用。</span>
      </div>
      <span class="tag good">${escapeHtml(metrics.exportableRows ?? 0)} 行</span>
    </div>
    <div class="status-item">
      <div>
        <strong>数据边界</strong>
        <span>${escapeHtml(status.dataPolicy)}</span>
      </div>
      <span class="tag pending">无绩效</span>
    </div>
  `;

  elements.backtestFactorTable.innerHTML = (status.factors || [])
    .map((factor) => {
      const [label, tone] = labelForStatus(factor.status);
      return `
        <tr>
          <td><strong>${escapeHtml(factor.name)}</strong><br><small>${escapeHtml(factor.id)}</small></td>
          <td>${factor.direction === 'negative' ? '风险越高越差' : '分数越高越好'}</td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(factor.usage)}</td>
          <td>${escapeHtml(factor.blocker)}</td>
          <td>
            <button
              class="table-action"
              data-factor-export="${escapeHtml(factor.id)}"
              type="button"
            >下载该因子</button>
            <br><small>${escapeHtml(factor.exportRows ?? 0)} 行</small>
          </td>
        </tr>
      `;
    })
    .join('');

  elements.backtestFactorTable.querySelectorAll('[data-factor-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const factor = button.dataset.factorExport;
      window.location.href = `/backtest-api/joinquant-factor-export.csv?factor=${encodeURIComponent(factor)}`;
    });
  });

  elements.joinquantStepList.innerHTML = (status.joinquant?.steps || [])
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');

  renderBacktestResultSummary(status.importedResults || []);

  elements.importedBacktestList.innerHTML = (status.importedResults || [])
    .map((result) => `
      <div class="status-item">
        <div>
          <strong>${escapeHtml(result.factor_name || result.factor || result.name || 'JoinQuant结果')}</strong>
          <span>IC: ${escapeHtml(result.ic_mean ?? result.ic ?? '-')} / RankIC: ${escapeHtml(result.rank_ic_mean ?? result.rankIc ?? '-')} / 来源: ${escapeHtml(result.source || 'joinquant')}</span>
        </div>
        <span class="tag good">已导入</span>
      </div>
    `)
    .join('') || '<div class="library-source">暂无导入结果。等你在 JoinQuant 跑完，把真实结果 JSON 粘贴回来。</div>';
}

function showView(viewName) {
  elements.views.forEach((view) => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });

  elements.navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.viewTarget === viewName);
  });
}

function drawChart(equity) {
  const canvas = document.querySelector('#equity-chart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 44;
  const strategy = equity.strategy;
  const benchmark = equity.benchmark;
  const allValues = [...strategy, ...benchmark];
  const min = Math.min(...allValues) - 0.04;
  const max = Math.max(...allValues) + 0.04;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d7e0ea';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = padding + ((height - padding * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  function point(value, index, length) {
    const x = padding + ((width - padding * 2) / (length - 1)) * index;
    const y = height - padding - ((value - min) / (max - min)) * (height - padding * 2);
    return [x, y];
  }

  function line(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    values.forEach((value, index) => {
      const [x, y] = point(value, index, values.length);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  line(benchmark, '#95a3b5');
  line(strategy, '#146eb4');

  ctx.fillStyle = '#162033';
  ctx.font = '16px sans-serif';
  ctx.fillText('策略组合', padding, 26);
  ctx.fillStyle = '#146eb4';
  ctx.fillRect(padding + 78, 16, 24, 4);
  ctx.fillStyle = '#607086';
  ctx.fillText('基准指数', padding + 124, 26);
  ctx.fillStyle = '#95a3b5';
  ctx.fillRect(padding + 202, 16, 24, 4);
}

async function refreshDashboard() {
  const [summary, factors, equity, risks, factorSummary, strategies, factorDefinitions, liveStrategies, backtestStatus, researchPipeline] = await Promise.all([
    request('/api/summary'),
    request('/factor-api/real-factor-results?limit=100'),
    request('/backtest-api/equity'),
    request('/api/risk'),
    request('/factor-api/real-factor-summary'),
    request('/strategy-api/definitions'),
    request('/factor-api/indicator-factor-definitions'),
    request('/strategy-api/live-signals'),
    request('/backtest-api/research-status'),
    request('/research-api/pipeline'),
  ]);

  renderSummary(summary);
  renderFactors(factors);
  renderRisk(risks);
  drawChart(equity);
  renderFactorLibrary(factorSummary, strategies, factorDefinitions);
  renderStrategyLibrary(strategies);
  renderLiveStrategies(liveStrategies);
  renderBacktestCenter(backtestStatus);
  renderResearchPipeline(researchPipeline);
}

async function boot() {
  try {
    const preferences = await request('/api/preferences');
    renderPreferences(preferences);
    await refreshDashboard();
    setFormMessage('已连接本地后端 API', 'success');
  } catch (error) {
    setFormMessage(`加载失败：${error.message}`, 'error');
  }
}

elements.savePreferences.addEventListener('click', async () => {
  try {
    await request('/api/preferences', {
      body: JSON.stringify(getPreferencePayload()),
      method: 'PUT',
    });
    await refreshDashboard();
    setFormMessage('配置已保存', 'success');
  } catch (error) {
    setFormMessage(`保存失败：${error.message}`, 'error');
  }
});

elements.runBacktest.addEventListener('click', async () => {
  try {
    const result = await request('/backtest-api/run', {
      body: JSON.stringify(getPreferencePayload()),
      method: 'POST',
    });

    renderSummary(result.summary);
    drawChart(result.equity);
    setFormMessage(result.message, 'success');
  } catch (error) {
    setFormMessage(`回测失败：${error.message}`, 'error');
  }
});

elements.downloadJoinquantCsv.addEventListener('click', () => {
  window.location.href = '/backtest-api/joinquant-factor-export.csv';
});

elements.refreshBacktestCenter.addEventListener('click', async () => {
  try {
    renderBacktestCenter(await request('/backtest-api/research-status'));
    elements.backtestImportMessage.textContent = '复测中心状态已刷新';
    elements.backtestImportMessage.dataset.tone = 'success';
  } catch (error) {
    elements.backtestImportMessage.textContent = `刷新失败：${error.message}`;
    elements.backtestImportMessage.dataset.tone = 'error';
  }
});

elements.importBacktestResult.addEventListener('click', async () => {
  try {
    const payload = JSON.parse(elements.backtestResultJson.value || '{}');
    const response = await request('/backtest-api/import-results', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
    elements.backtestImportMessage.textContent = response.message;
    elements.backtestImportMessage.dataset.tone = 'success';
    elements.backtestResultJson.value = '';
    renderBacktestCenter(await request('/backtest-api/research-status'));
  } catch (error) {
    elements.backtestImportMessage.textContent = `导入失败：${error.message}`;
    elements.backtestImportMessage.dataset.tone = 'error';
  }
});

elements.askResearchAssistant.addEventListener('click', async () => {
  const message = elements.researchAssistantInput.value.trim();
  const factorId = elements.researchAssistantFactor.value || activeResearchFactor || '';
  if (!message && !factorId) {
    appendAssistantMessage('assistant', '先选择一个因子，或输入一个研究问题。');
    return;
  }

  appendAssistantMessage('user', message || `分析 ${factorDisplayName(factorId)}`);
  elements.askResearchAssistant.disabled = true;

  try {
    const response = await request('/research-api/assistant', {
      body: JSON.stringify({ factorId, message }),
      method: 'POST',
    });
    appendAssistantMessage('assistant', response.answer || []);
    elements.researchAssistantInput.value = '';
  } catch (error) {
    appendAssistantMessage('assistant', `助手失败：${error.message}`);
  } finally {
    elements.askResearchAssistant.disabled = false;
  }
});

elements.navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showView(button.dataset.viewTarget);
  });
});

boot();
