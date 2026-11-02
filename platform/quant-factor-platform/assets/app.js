import { preferences as fallbackPreferences } from '../preferences.js';

const appConfig = window.__QUANT_APP_CONFIG__ || {};

document.title = appConfig.title || fallbackPreferences.app.name;
document.querySelector('#api-url').textContent = appConfig.apiURL || '/api';
document.querySelector('#api-url').title = fieldHint('api_url');

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
  fundamental: '基本面',
  liquidity: '流动性',
  market: '市场',
  momentum: '动能',
  price_volume: '量价',
  risk: '风险',
  sector: '板块',
  sentiment: '情绪',
  trend: '趋势',
};

const elements = {
  activityActiveCount: document.querySelector('#activity-active-count'),
  activityBlockedCount: document.querySelector('#activity-blocked-count'),
  activityDormantCount: document.querySelector('#activity-dormant-count'),
  activityNotes: document.querySelector('#activity-notes'),
  activitySourceFile: document.querySelector('#activity-source-file'),
  activitySummary: document.querySelector('#activity-summary'),
  activityTable: document.querySelector('#activity-table'),
  activityWatchCount: document.querySelector('#activity-watch-count'),
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
  buildBigquantPaperWatchPack: document.querySelector('#build-bigquant-paper-watch-pack'),
  candidateFactorCount: document.querySelector('#candidate-factor-count'),
  demoFactorCount: document.querySelector('#demo-factor-count'),
  downloadJoinquantCsv: document.querySelector('#download-joinquant-csv'),
  downloadJoinquantFactorScript: document.querySelector('#download-joinquant-factor-script'),
  draftStrategyJump: document.querySelector('#draft-strategy-jump'),
  draftStrategyPagination: document.querySelector('#draft-strategy-pagination'),
  draftStrategySearch: document.querySelector('#draft-strategy-search'),
  draftStrategyToggle: document.querySelector('#draft-strategy-toggle'),
  factorTable: document.querySelector('#factor-table'),
  factorLibraryTable: document.querySelector('#factor-library-table'),
  factorRolePools: document.querySelector('#factor-role-pools'),
  fee: document.querySelector('#fee'),
  formMessage: document.querySelector('#form-message'),
  formalStrategyList: document.querySelector('#formal-strategy-list'),
  formalStrategyJump: document.querySelector('#formal-strategy-jump'),
  formalStrategyPagination: document.querySelector('#formal-strategy-pagination'),
  formalStrategyPolicy: document.querySelector('#formal-strategy-policy'),
  formalStrategySearch: document.querySelector('#formal-strategy-search'),
  formalStrategyToggle: document.querySelector('#formal-strategy-toggle'),
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
  paperWatchControls: document.querySelector('#paper-watch-controls'),
  paperWatchConsoleSummary: document.querySelector('#paper-watch-console-summary'),
  paperWatchLedgerJson: document.querySelector('#paper-watch-ledger-json'),
  paperWatchLedgerMessage: document.querySelector('#paper-watch-ledger-message'),
  paperWatchLedgerSummary: document.querySelector('#paper-watch-ledger-summary'),
  paperWatchList: document.querySelector('#paper-watch-list'),
  paperWatchBigquantSummary: document.querySelector('#paper-watch-bigquant-summary'),
  paperWatchJoinquantReport: document.querySelector('#paper-watch-joinquant-report'),
  paperWatchPerformanceReport: document.querySelector('#paper-watch-performance-report'),
  paperWatchRefreshMode: document.querySelector('#paper-watch-refresh-mode'),
  paperWatchRefreshSummary: document.querySelector('#paper-watch-refresh-summary'),
  paperWatchSignalList: document.querySelector('#paper-watch-signal-list'),
  paperWatchStatus: document.querySelector('#paper-watch-status'),
  paperWatchUpgradeList: document.querySelector('#paper-watch-upgrade-list'),
  runPaperWatchDailyRefresh: document.querySelector('#run-paper-watch-daily-refresh'),
  positionStressArtifacts: document.querySelector('#position-stress-artifacts'),
  positionStressCapital: document.querySelector('#position-stress-capital'),
  positionStressComplete: document.querySelector('#position-stress-complete'),
  positionStressDataTable: document.querySelector('#position-stress-data-table'),
  positionStressDateRange: document.querySelector('#position-stress-date-range'),
  positionStressDrawdown: document.querySelector('#position-stress-drawdown'),
  positionStressDiagnostics: document.querySelector('#position-stress-diagnostics'),
  positionStressEnd: document.querySelector('#position-stress-end'),
  positionStressEquityCanvas: document.querySelector('#position-stress-equity-canvas'),
  exportPositionStressEquity: document.querySelector('#export-position-stress-equity'),
  exportPositionStressTrades: document.querySelector('#export-position-stress-trades'),
  positionStressExportJson: document.querySelector('#position-stress-export-json'),
  positionStressExportCsv: document.querySelector('#position-stress-export-csv'),
  positionStressExportZip: document.querySelector('#position-stress-export-zip'),
  positionStressPaperExportStatus: document.querySelector('#position-stress-paper-export-status'),
  positionStressImportOhlcv: document.querySelector('#position-stress-import-ohlcv'),
  positionStressKlineCanvas: document.querySelector('#position-stress-kline-canvas'),
  positionStressKlineDaily: document.querySelector('#position-stress-kline-daily'),
  positionStressKlineMonthly: document.querySelector('#position-stress-kline-monthly'),
  positionStressKlineNote: document.querySelector('#position-stress-kline-note'),
  positionStressKlineReset: document.querySelector('#position-stress-kline-reset'),
  positionStressKlineSearch: document.querySelector('#position-stress-kline-search'),
  positionStressKlineSelect: document.querySelector('#position-stress-kline-select'),
  positionStressKlineTooltip: document.querySelector('#position-stress-kline-tooltip'),
  positionStressKlineYearly: document.querySelector('#position-stress-kline-yearly'),
  positionStressMessage: document.querySelector('#position-stress-message'),
  positionStressSelectedStrategy: document.querySelector('#position-stress-selected-strategy'),
  positionStressHistorySelect: document.querySelector('#position-stress-history-select'),
  positionStressUniverseContext: document.querySelector('#position-stress-universe-context'),
  positionStressReturn: document.querySelector('#position-stress-return'),
  positionStressResultSummary: document.querySelector('#position-stress-result-summary'),
  positionStressRowCount: document.querySelector('#position-stress-row-count'),
  positionStressRunStatus: document.querySelector('#position-stress-run-status'),
  positionStressScenarios: document.querySelector('#position-stress-scenarios'),
  positionStressSelectionList: document.querySelector('#position-stress-selection-list'),
  positionStressSource: document.querySelector('#position-stress-source'),
  positionStressStart: document.querySelector('#position-stress-start'),
  positionStressStrategySelect: document.querySelector('#position-stress-strategy-select'),
  positionStressStockCount: document.querySelector('#position-stress-stock-count'),
  positionStressHistoryMaxCount: document.querySelector('#position-stress-history-max-count'),
  positionStressTopN: document.querySelector('#position-stress-top-n'),
  positionStressMaxHoldings: document.querySelector('#position-stress-max-holdings'),
  positionStressTradeTable: document.querySelector('#position-stress-trade-table'),
  positionStressTrades: document.querySelector('#position-stress-trades'),
  positionStressWarnings: document.querySelector('#position-stress-warnings'),
  refreshPositionStress: document.querySelector('#refresh-position-stress'),
  importPositionStressOhlcv: document.querySelector('#import-position-stress-ohlcv'),
  runPositionStress: document.querySelector('#run-position-stress'),
  downloadPaperWatchLedgerCsv: document.querySelector('#download-paper-watch-ledger-csv'),
  downloadPaperWatchLedgerJson: document.querySelector('#download-paper-watch-ledger-json'),
  importPaperWatchLedger: document.querySelector('#import-paper-watch-ledger'),
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
  strategyGradeFilter: document.querySelector('#strategy-grade-filter'),
  strategyLevelIndex: document.querySelector('#strategy-level-index'),
  strategyLiveList: document.querySelector('#strategy-live-list'),
  strategyLibraryList: document.querySelector('#strategy-library-list'),
  strategyObservationCount: document.querySelector('#strategy-observation-count'),
  strategyPartialCount: document.querySelector('#strategy-partial-count'),
  strategyResultBestHorizon: document.querySelector('#strategy-result-best-horizon'),
  strategyResultCount: document.querySelector('#strategy-result-count'),
  strategyResultDirectory: document.querySelector('#strategy-result-directory'),
  strategyResultNotes: document.querySelector('#strategy-result-notes'),
  strategyResultRegimeFilter: document.querySelector('#strategy-result-regime-filter'),
  strategyResultSizeFilter: document.querySelector('#strategy-result-size-filter'),
  strategyResultStrategyCount: document.querySelector('#strategy-result-strategy-count'),
  strategyResultSummary: document.querySelector('#strategy-result-summary'),
  strategyResultTable: document.querySelector('#strategy-result-table'),
  strategyResultTradeCount: document.querySelector('#strategy-result-trade-count'),
  strategySourceFile: document.querySelector('#strategy-source-file'),
  strategyStrongCount: document.querySelector('#strategy-strong-count'),
  strategyUnavailableList: document.querySelector('#strategy-unavailable-list'),
  universe: document.querySelector('#universe'),
  validateTradeabilityReview: document.querySelector('#validate-tradeability-review'),
  validFactorCount: document.querySelector('#valid-factor-count'),
  validatedBestHorizon: document.querySelector('#validated-best-horizon'),
  validatedFactorDirectory: document.querySelector('#validated-factor-directory'),
  validatedFactorCount: document.querySelector('#validated-factor-count'),
  validatedHistoryCount: document.querySelector('#validated-history-count'),
  validatedResultCount: document.querySelector('#validated-result-count'),
  views: document.querySelectorAll('.view'),
};

let activeStrategyResult = 'all';
let activeStrategyRegimeResult = 'all';
let activeStrategySizeResult = 'all';
let activeValidatedFactor = 'all';
let activeResearchFactor = null;
let currentResearchPipeline = null;
let currentStrategySignalPack = null;
let currentPositionStressCatalog = null;
let currentPositionStressHistory = [];
let currentPositionStressReport = null;
let currentPositionStressExplicitStrategyId = '';
let positionStressKlinePeriod = 'daily';
let positionStressKlineSearchTimer = 0;
let positionStressKlineSearchRequestId = 0;
const positionStressKlineView = { start: 0, count: 70, dragging: false, dragX: 0, dragStart: 0, hoverIndex: null };
let draftStrategyExpanded = false;
let draftStrategyGrade = 'all';
let draftStrategyPage = 1;
let draftStrategyQuery = '';
let formalStrategyExpanded = false;
let formalStrategyPage = 1;
let formalStrategyQuery = '';

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

function fieldHint(name, value) {
  const key = String(name || '').trim();
  const text = String(value || key || '').trim();
  const hints = {
    amount_ma20_mean: '近 20 日平均成交额，用来看股票交易是否活跃。',
    api_url: '当前页面请求本地服务的接口地址。',
    close: '收盘价。',
    data_source: '这条数据来自哪个文件或外部数据源。',
    dea: 'MACD 指标里的慢线。',
    diff: 'MACD 指标里的快线。',
    factor_id: '因子的机器名，系统内部用它定位计算规则。',
    factor_variant: '这次检查使用的因子版本或变体名称。',
    gate_status: '准入状态，表示当前是否满足开始观察的条件。',
    high: '最高价。',
    huolipan: '获利盘比例，粗略表示当前有多少筹码处于盈利状态。',
    hslv: '换手率，用来看股票当天交易有多活跃。',
    liquidity_metric20_mean: '近 20 日流动性指标，用来看买卖是否顺畅。',
    low: '最低价。',
    ma5: '5 日均线，表示最近 5 个交易日的平均价格。',
    ma13: '13 日均线，表示最近 13 个交易日的平均价格。',
    ma20: '20 日均线，常用来观察短中期趋势。',
    ma30: '30 日均线，常用来观察中期趋势。',
    ma60: '60 日均线，常用来观察较长一段时间的趋势。',
    ma120: '120 日均线，常用来观察长期趋势。',
    ma250: '250 日均线，接近一年交易日的平均价格。',
    macd: 'MACD 指标，用来看价格动能变化。',
    market_cap: '市值，表示公司在市场上的总估值。',
    mavol5: '5 日平均成交量。',
    mavol10: '10 日平均成交量。',
    open: '开盘价。',
    paper_action: '模拟观察动作，例如允许观察、等待或暂停。',
    pinjunchengben: '平均成本，粗略表示市场持仓成本位置。',
    planned_weight: '计划观察比例，只用于账本记录，不代表真实下单。',
    qishijizhong: '70% 筹码集中度，用来看筹码是否集中。',
    qujianchonghe: '筹码区间重合度，用来看成本区间是否集中。',
    signal_state: '策略当天给出的信号状态。',
    sleeve_id: '观察账户编号，用来区分不同策略或资金分组。',
    source: '结果来源，说明这条记录由哪个真实检查流程生成。',
    source_file: '本页当前读取的数据文件路径，用来追溯结果从哪里来。',
    stockd: 'KDJ 指标里的 D 值。',
    stockj: 'KDJ 指标里的 J 值，常用来看短期过热或转弱。',
    stockk: 'KDJ 指标里的 K 值。',
    strategy_id: '策略的机器名，系统内部用它定位一套策略规则。',
    taolaopan: '套牢盘比例，粗略表示上方卖压。',
    turnover_ratio: '换手率，用来看交易活跃程度。',
    volume: '成交量。',
  };
  if (hints[text]) return hints[text];
  if (hints[key]) return hints[key];
  if (text.includes('_')) return '系统内部字段名，用来稳定匹配数据；悬浮查看不影响页面判断。';
  if (text.includes('\\') || text.includes('/')) return '本地文件路径，用来追溯这条数据来自哪个文件。';
  if (/^[a-z][a-z0-9_./-]*$/i.test(text)) return '系统内部名称或文件路径，用来追溯数据来源。';
  return '字段说明';
}

function explainable(value, name, className = 'field-token') {
  const displayValue = value === null || value === undefined || value === '' ? '-' : value;
  return `<span class="${escapeHtml(className)}" title="${escapeHtml(fieldHint(name, value))}">${escapeHtml(displayValue)}</span>`;
}

function explainFieldList(value) {
  const fields = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  if (!fields.length) return '-';
  return fields.map((field) => explainable(field, field)).join('<span class="field-separator">, </span>');
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

function syncCollapsibleData() {
  document.querySelectorAll('[data-collapsible-data]').forEach((box) => {
    const button = box.parentElement?.querySelector('[data-collapse-toggle]');
    if (!button) return;
    const expanded = box.classList.contains('is-expanded');
    const hasOverflow = box.scrollHeight > box.clientHeight + 8;
    button.hidden = !expanded && !hasOverflow;
    button.textContent = expanded ? '收起' : '展开全部';
  });
}

function bindCollapsibleData() {
  document.querySelectorAll('[data-collapse-toggle]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const box = button.parentElement?.querySelector('[data-collapsible-data]');
      if (!box) return;
      box.classList.toggle('is-expanded');
      syncCollapsibleData();
    });
  });
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
      const tone = risk.status === 'ready' ? 'good' : risk.status === 'blocked' ? 'watch' : 'pending';
      const max = Math.max(Number(risk.limit) || 100, Number(risk.value) || 0, 1);
      return `
        <div>
          <span title="${escapeHtml(risk.detail || '')}">${escapeHtml(risk.name)}</span>
          <meter min="0" max="${escapeHtml(max)}" value="${escapeHtml(risk.value ?? 0)}"></meter>
          <strong class="${tone}" title="${escapeHtml(risk.nextAction || '')}">${escapeHtml(risk.valueText || risk.value)}</strong>
        </div>
      `;
    })
    .join('');
}

function renderMaturityMatrix(matrix) {
  if (!matrix) return '';
  const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
  const blockers = Array.isArray(matrix.blockers) ? matrix.blockers : [];
  const actions = Array.isArray(matrix.next_actions) ? matrix.next_actions : [];
  const sleeveAudit = matrix.independent_sleeve_candidate_audit || {};
  const sleeveCandidates = Array.isArray(sleeveAudit.candidates) ? sleeveAudit.candidates : [];
  const goalMet = matrix.goal_status === 'target_met';
  const matrixConclusion = goalMet
    ? `已找到 ${matrix.ready_strategy_count ?? 0} 条可以开始模拟观察的策略。注意：这只是可以开始记录模拟观察，不代表可以实盘。`
    : `目前只有 ${matrix.ready_strategy_count ?? 0} 条策略可以观察，还没达到 ${matrix.target_ready_strategy_count ?? 2} 条目标。`;
  return `
    <div class="paper-watch-note">
      <strong>策略当前结论</strong>
      <span class="tag ${goalMet ? 'good' : 'watch'}">
        ${goalMet ? '已达标' : '未达标'}
      </span>
      <p>${escapeHtml(matrixConclusion)}</p>
      ${blockers.length ? `<p>${escapeHtml(plainScope(blockers.join('；')))}</p>` : ''}
      <details class="compact-details">
        <summary>查看详细检查记录</summary>
        <table class="mini-table">
          <thead>
            <tr>
              <th>策略</th>
              <th>当前判断</th>
              <th>是否算达标</th>
              <th>历史收益</th>
              <th>最大下跌</th>
              <th>稳定度</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((item) => `
              <tr>
                <td>${escapeHtml(item.strategy_name || item.id || '-')}</td>
                <td>${escapeHtml(plainStatus(item.decision_name || item.decision || '-'))}</td>
                <td>${item.counts_toward_two_strategy_goal ? '是' : '否'}</td>
                <td>${formatPercent(item.strategy_return, 2)}</td>
                <td>${formatPercent(item.max_drawdown, 2)}</td>
                <td>${formatNumber(item.sharpe, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="paper-watch-rules">
          ${sleeveCandidates.length ? `
            <details class="compact-details">
              <summary>
                其他候选策略：
                ${escapeHtml(sleeveAudit.eligible_independent_sleeve_count ?? 0)} 个可用，
                ${escapeHtml(sleeveAudit.blocked_candidate_count ?? 0)} 个暂时不能用
              </summary>
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>候选</th>
                    <th>当前判断</th>
                    <th>是否算达标</th>
                    <th>还缺什么</th>
                  </tr>
                </thead>
                <tbody>
                  ${sleeveCandidates.map((item) => {
                    const gaps = (Array.isArray(item.blocked_reasons) && item.blocked_reasons.length
                      ? item.blocked_reasons
                      : Array.isArray(item.required_next_evidence)
                        ? item.required_next_evidence
                        : []
                    ).join('；');
                    const candidateName = [
                      item.strategy_name || item.candidate_id || '-',
                      item.layer ? `(${item.layer})` : '',
                    ].filter(Boolean).join(' ');
                    return `
                      <tr>
                        <td>${escapeHtml(candidateName)}</td>
                        <td>${escapeHtml(plainStatus(item.decision_name || item.decision || '-'))}</td>
                        <td>${item.counts_as_independent_sleeve ? '是' : '否'}</td>
                        <td>${escapeHtml(plainScope(gaps || '-'))}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </details>
          ` : ''}
          <strong>下一步</strong>
          ${renderTextList(actions.map((item) => `${item.priority}. ${plainScope(item.action)} ${plainScope(item.reason)}`))}
          <strong>数据原则</strong>
          ${renderTextList([plainScope(matrix.data_policy || '只读取已有真实证据，不生成收益。')])}
        </div>
      </details>
    </div>
  `;
}

function renderTradeabilityReviewTaskPack(pack) {
  if (!pack) return '';
  const target = pack.target || {};
  const gate = pack.current_gate || {};
  const passGate = pack.pass_gate || {};
  const script = pack.joinquant_script || {};
  const steps = Array.isArray(pack.steps) ? pack.steps : [];
  const selectedCodes = Array.isArray(target.selected_codes) ? target.selected_codes : [];
  const imported = pack.status === 'review_passed' || pack.status === 'review_failed' || pack.status === 'review_imported';
  const canStart = Boolean(gate.can_start_observation);
  return `
    <div class="paper-watch-note">
      <strong>开仓前检查</strong>
      <span class="tag ${imported ? 'good' : 'pending'}">${escapeHtml(plainStatus(pack.status || 'missing'))}</span>
      <p>
        ${escapeHtml(target.strategy_name || target.strategy_id || '-')}：
        ${escapeHtml(target.signal_date || '-')}，
        入选 ${escapeHtml(target.selected_count ?? 0)} 只，
        当前${canStart ? '已经通过检查，可以开始模拟观察。' : '还没通过真实交易检查，先不要开始。'}
      </p>
      <p>
        要通过，至少要有 ${escapeHtml(passGate.min_tradable_count ?? 10)} 只股票确认可以买卖。
      </p>
      <div class="inline-actions">
        ${script.download_endpoint ? `<a class="inline-link" href="${escapeHtml(script.download_endpoint)}">下载交易复核脚本</a>` : ''}
        <button type="button" data-paper-watch-rebuild="true">刷新派生包</button>
      </div>
      <details class="compact-details">
        <summary>查看检查步骤和股票名单</summary>
        <div class="paper-watch-rules">
          <strong>要做什么</strong>
          ${renderTextList(steps.map(plainScope))}
          <strong>入选代码</strong>
          ${renderTextList(selectedCodes)}
          <strong>导入要求</strong>
          ${renderTextList([
            `导入接口：${passGate.import_endpoint || '/backtest-api/import-results'}`,
            `文件来源：${plainSource(script.expected_source || 'joinquant_akshare_latest_signal_tradeability_review')}`,
            plainScope(passGate.after_import_expected_effect || '导入后才允许继续判断是否解除阻塞。'),
          ])}
        </div>
      </details>
    </div>
  `;
}

function renderCoreMediumSmallPromotionTaskPack(pack) {
  if (!pack) return '';
  const target = pack.target || {};
  const baseline = target.baseline || {};
  const gate = pack.pass_gate || {};
  const script = pack.joinquant_script || {};
  const review = pack.latest_review || null;
  const reviewReady = review?.decision === gate.required_decision;
  const reviewRecords = Array.isArray(review?.records) ? review.records : [];
  const steps = Array.isArray(pack.steps) ? pack.steps : [];
  return `
    <div class="paper-watch-note">
      <strong>核心量价中波动小市值晋级复核</strong>
      <span class="tag ${reviewReady ? 'good' : review ? 'watch' : 'pending'}">${escapeHtml(pack.status || 'waiting')}</span>
      <p>
        ${escapeHtml(target.strategy_name || target.strategy_id || '-')}：
        ${escapeHtml(target.layer || '市场适中、小市值股票')}，
        历史收益 ${formatPercent(baseline.strategy_return, 2)}，
        最大下跌 ${formatPercent(baseline.max_drawdown, 2)}，
        稳定度 ${formatNumber(baseline.sharpe, 2)}。
      </p>
      <p>
        要晋级，必须刚好遇到目标市场环境，并且至少选出 ${escapeHtml(gate.min_selected_count ?? 10)} 只股票。
      </p>
      ${review ? `
        <p>
          最新导入：${escapeHtml(review.signal_date || '-')}，
          ${escapeHtml(plainStatus(review.market_regime || '-'))}，
          目标 ${escapeHtml(review.target_market_regime || '-')} / ${escapeHtml(review.target_market_cap_bucket || '-')}，
          入选 ${escapeHtml(review.selected_count ?? 0)} / 门槛 ${escapeHtml(review.min_selected_count ?? gate.min_selected_count ?? 10)}，
          结论：${escapeHtml(plainStatus(review.decision || '-'))}。
        </p>
        ${review.decision_reason ? `<p>${escapeHtml(review.decision_reason)}</p>` : ''}
      ` : ''}
      <div class="inline-actions">
        ${script.download_endpoint ? `<a class="inline-link" href="${escapeHtml(script.download_endpoint)}">下载核心量价复核脚本</a>` : ''}
      </div>
      <details class="compact-details">
        <summary>查看晋级步骤</summary>
        <div class="paper-watch-rules">
          ${renderTextList(steps.map(plainScope))}
          ${reviewRecords.length ? `
            <strong>最近复核候选</strong>
            ${renderTextList(reviewRecords.slice(0, 10).map((item) => (
              `${item.code || '-'} score ${formatNumber(item.strategy_score, 3)} / ${item.market_cap_bucket || '-'} / tradable_proxy=${item.tradable_proxy === false ? 'false' : 'true'}`
            )))}
          ` : ''}
          <strong>数据原则</strong>
          ${renderTextList([plainScope(pack.data_policy || '只生成复核任务，不生成结果。')])}
        </div>
      </details>
    </div>
  `;
}

function shortLog(text, max = 260) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function renderPaperWatchRefreshSummary(refresh) {
  if (!elements.paperWatchRefreshSummary) return;
  if (!refresh || refresh.status === 'missing') {
    elements.paperWatchRefreshSummary.innerHTML = `
      <div class="paper-watch-note compact">
        <strong>一键刷新</strong>
        <span class="tag pending">未运行</span>
        <p>本地快速模式只重建已有真实数据；联网模式会尝试 AkShare 数据源，失败会展示日志。</p>
      </div>
    `;
    return;
  }
  const steps = Array.isArray(refresh.steps) ? refresh.steps : [];
  const derivedSteps = Array.isArray(refresh.derived?.scripts) ? refresh.derived.scripts : [];
  const allSteps = [
    ...steps.map((step) => ({ ...step, group: '数据/信号' })),
    ...derivedSteps.map((step) => ({ ...step, group: '派生包' })),
  ];
  elements.paperWatchRefreshSummary.innerHTML = `
    <details class="compact-details" open>
      <summary>
        一键刷新结果
        <span class="tag ${refresh.ok ? 'good' : 'watch'}">${refresh.ok ? '完成' : '有失败'}</span>
        <span>${escapeHtml(refresh.mode || '-')} / ${escapeHtml(refresh.finished_at || refresh.generatedAt || '-')}</span>
      </summary>
      <div class="paper-watch-rules">
        <strong>数据原则</strong>
        ${renderTextList([refresh.data_policy || '只使用真实数据脚本，不生成收益。'])}
        <strong>执行线路</strong>
        ${allSteps.length ? allSteps.map((step) => `
          <div class="paper-watch-refresh-step">
            <span class="tag ${step.ok ? 'good' : 'watch'}">${escapeHtml(step.ok ? 'OK' : 'FAIL')}</span>
            <div>
              <strong>${escapeHtml(step.group)} / ${escapeHtml(step.name || step.path || '-')}</strong>
              <small>${escapeHtml(step.path || '')}</small>
              ${step.stdout ? `<p>${escapeHtml(shortLog(step.stdout))}</p>` : ''}
              ${step.stderr ? `<p>${escapeHtml(shortLog(step.stderr))}</p>` : ''}
            </div>
          </div>
        `).join('') : '<div class="empty-state compact">暂无执行步骤。</div>'}
      </div>
    </details>
  `;
}

function renderBigQuantPaperWatchPack(pack) {
  if (!elements.paperWatchBigquantSummary) return;
  if (!pack) {
    elements.paperWatchBigquantSummary.innerHTML = `
      <div class="paper-watch-note compact">
        <strong>BigQuant测试包</strong>
        <span class="tag pending">未生成</span>
        <p>点击生成后，会从当前准模拟盘运行包导出待测试输入；不会生成 BigQuant 结果。</p>
      </div>
    `;
    return;
  }
  const targets = Array.isArray(pack.targets) ? pack.targets : [];
  const readyTargets = targets.filter((target) => target.bigquant_test_status === 'ready_for_bigquant_real_test');
  const blockedTargets = targets.filter((target) => target.bigquant_test_status !== 'ready_for_bigquant_real_test');
  elements.paperWatchBigquantSummary.innerHTML = `
    <div class="paper-watch-note compact">
      <strong>BigQuant测试包</strong>
      <span class="tag ${readyTargets.length ? 'good' : 'watch'}">
        ${escapeHtml(readyTargets.length)} 可测 / ${escapeHtml(blockedTargets.length)} 阻塞
      </span>
      <p>${escapeHtml(pack.data_policy || '只导出待测试输入。')}</p>
      <p>
        运行包 ${escapeHtml(pack.readiness_summary?.operations_status || '-')}；
        最近刷新 ${pack.readiness_summary?.daily_refresh_ok ? 'OK' : '未完成或失败'} /
        ${escapeHtml(pack.readiness_summary?.daily_refresh_mode || '-')}。
      </p>
      <details class="compact-details">
        <summary>查看待测资金袖</summary>
        <div class="paper-watch-rules">
          ${targets.length ? targets.map((target) => `
            <div class="paper-watch-refresh-step">
              <span class="tag ${target.bigquant_test_status === 'ready_for_bigquant_real_test' ? 'good' : 'watch'}">
                ${escapeHtml(target.bigquant_test_priority || '-')}
              </span>
              <div>
                <strong>${escapeHtml(target.strategy_name || target.strategy_id || '-')}</strong>
                <small>
                  ${escapeHtml(target.sleeve_id || '-')} /
                  ${escapeHtml(target.paper_action || '-')} /
                  ${escapeHtml(target.signal_date || '-')} /
                  ${target.selected_count === null || target.selected_count === undefined ? '控制器口径' : `${escapeHtml(target.selected_count)}只`}
                </small>
                ${target.blocked_reasons?.length ? `<p>${escapeHtml(target.blocked_reasons.join('；'))}</p>` : ''}
              </div>
            </div>
          `).join('') : '<div class="empty-state compact">暂无准模拟盘资金袖。</div>'}
        </div>
      </details>
    </div>
  `;
}

function renderJoinQuantPaperWatchReport(report) {
  if (!elements.paperWatchJoinquantReport) return;
  if (!report || report.status === 'missing') {
    elements.paperWatchJoinquantReport.innerHTML = `
      <div class="paper-watch-note compact">
        <strong>JoinQuant准模拟报告</strong>
        <span class="tag pending">未生成</span>
        <p>选择 JoinQuant本地结果 后点击一键刷新，系统会自动导入复核结果、生成信号账本和报告。</p>
      </div>
    `;
    return;
  }
  const metrics = report.metrics || {};
  const sleeves = Array.isArray(report.sleeves) ? report.sleeves : [];
  const tone = report.status === 'ready_to_start_observation' ? 'good' : 'watch';
  elements.paperWatchJoinquantReport.innerHTML = `
    <div class="paper-watch-note compact">
      <strong>JoinQuant准模拟报告</strong>
      <span class="tag ${tone}">${escapeHtml(report.status || '-')}</span>
      <p>${escapeHtml(report.data_policy || '只汇总真实 JoinQuant 证据。')}</p>
      <div class="paper-watch-metrics">
        <span>信号日 ${escapeHtml(metrics.signal_date || '-')}</span>
        <span>可开 ${escapeHtml(metrics.open_allowed_sleeve_count ?? 0)}</span>
        <span>阻塞 ${escapeHtml(metrics.blocked_sleeve_count ?? 0)}</span>
        <span>账本 ${escapeHtml(metrics.auto_or_imported_ledger_count ?? 0)}</span>
      </div>
      <details class="compact-details">
        <summary>查看资金袖状态</summary>
        <div class="paper-watch-rules">
          ${sleeves.length ? sleeves.map((sleeve) => `
            <div class="paper-watch-refresh-step">
              <span class="tag ${sleeve.can_start_observation ? 'good' : 'watch'}">
                ${escapeHtml(sleeve.latest_action || '-')}
              </span>
              <div>
                <strong>${escapeHtml(sleeve.strategy_name || sleeve.strategy_id || '-')}</strong>
                <small>
                  ${escapeHtml(sleeve.sleeve_id || '-')} /
                  ${escapeHtml(sleeve.signal_date || '-')} /
                  ${sleeve.selected_count === null || sleeve.selected_count === undefined ? '控制器口径' : `${escapeHtml(sleeve.selected_count)}只`} /
                  ${escapeHtml(sleeve.gate_status || '-')}
                </small>
                ${sleeve.blocked_reasons?.length ? `<p>${escapeHtml(sleeve.blocked_reasons.join('；'))}</p>` : ''}
              </div>
            </div>
          `).join('') : '<div class="empty-state compact">暂无资金袖状态。</div>'}
          <strong>下一步</strong>
          ${renderTextList(Array.isArray(report.next_actions) ? report.next_actions : [])}
        </div>
      </details>
    </div>
  `;
}

function renderPaperWatchPerformanceReport(report) {
  if (!elements.paperWatchPerformanceReport) return;
  if (!report || report.status === 'missing') {
    elements.paperWatchPerformanceReport.innerHTML = `
      <div class="paper-watch-note compact">
        <strong>准模拟表现报告</strong>
        <span class="tag pending">未生成</span>
        <p>表现报告只读取真实 period_return / benchmark_return；没有收益时不生成净值。</p>
      </div>
    `;
    return;
  }
  const summary = report.summary || {};
  const sleeves = Array.isArray(report.sleeves) ? report.sleeves : [];
  elements.paperWatchPerformanceReport.innerHTML = `
    <div class="paper-watch-note compact">
      <strong>准模拟表现报告</strong>
      <span class="tag ${summary.promotion_candidate_count ? 'good' : summary.risk_pause_count ? 'watch' : 'pending'}">
        ${escapeHtml(summary.total_completed_return_rows ?? 0)} 条真实收益
      </span>
      <p>${escapeHtml(report.data_policy || '只读取真实收益字段。')}</p>
      <div class="paper-watch-metrics">
        <span>账本 ${escapeHtml(summary.total_ledger_rows ?? 0)}</span>
        <span>待收益 ${escapeHtml(summary.collect_returns_count ?? 0)}</span>
        <span>晋级候选 ${escapeHtml(summary.promotion_candidate_count ?? 0)}</span>
        <span>风险暂停 ${escapeHtml(summary.risk_pause_count ?? 0)}</span>
      </div>
      <details class="compact-details">
        <summary>查看策略表现阶段</summary>
        <div class="paper-watch-rules">
          ${sleeves.length ? sleeves.map((sleeve) => `
            <div class="paper-watch-refresh-step">
              <span class="tag ${escapeHtml(sleeve.stage?.tone || 'pending')}">
                ${escapeHtml(sleeve.stage?.stage_name || '-')}
              </span>
              <div>
                <strong>${escapeHtml(sleeve.strategy_name || sleeve.strategy_id || '-')}</strong>
                <small>
                  ${escapeHtml(sleeve.sleeve_id || '-')} /
                  收益样本 ${escapeHtml(sleeve.metrics?.completed_return_rows ?? 0)} /
                  胜率 ${formatPercent(sleeve.metrics?.win_rate, 1)} /
                  回撤 ${formatPercent(sleeve.metrics?.max_drawdown, 2)}
                </small>
                <p>${escapeHtml(sleeve.stage?.reason || '')}</p>
              </div>
            </div>
          `).join('') : '<div class="empty-state compact">暂无表现样本。</div>'}
        </div>
      </details>
    </div>
  `;
}

function renderPaperWatchConsole(consoleData) {
  if (!elements.paperWatchConsoleSummary || !consoleData) return;
  const metrics = consoleData.metrics || {};
  const sleeves = Array.isArray(consoleData.sleeves) ? consoleData.sleeves : [];
  const activeSleeves = sleeves.filter((sleeve) => sleeve.canStartObservation);
  elements.paperWatchConsoleSummary.innerHTML = [
    ['状态', consoleData.statusName || '-', consoleData.signalDate ? `最新信号 ${consoleData.signalDate}` : '等待最新信号'],
    ['可观察资金袖', metrics.readySleeveCount ?? 0, `${metrics.sleeveCount ?? sleeves.length} 条路线`],
    ['开放信号', metrics.openSignalCount ?? 0, '可进入观察记录'],
    ['账本记录', metrics.importedLedgerCount ?? 0, `${metrics.observedDays ?? 0} 个观察日`],
    ['活性良好', metrics.activeSleeveCount ?? 0, `${metrics.warmingSleeveCount ?? 0} 条样本积累`],
  ].map(([label, value, detail]) => `
    <div class="paper-watch-console-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join('');

  if (elements.paperWatchSignalList) {
    elements.paperWatchSignalList.innerHTML = sleeves.length
      ? sleeves.map((sleeve) => {
        const action = sleeve.latestSignal?.triggered_component_name
          || sleeve.latestSignal?.action
          || sleeve.latestAction
          || sleeve.gateStatus
          || '-';
        const blockedReason = Array.isArray(sleeve.blockedReasons) && sleeve.blockedReasons.length
          ? sleeve.blockedReasons[0]
          : '';
        return `
        <div class="paper-watch-mini-row">
          <div>
            <strong>${escapeHtml(sleeve.strategyName)}</strong>
            <span>${escapeHtml(sleeve.signalDate || '-')} / ${escapeHtml(action)}</span>
            ${blockedReason ? `<small>${escapeHtml(blockedReason)}</small>` : ''}
          </div>
          <span class="tag ${sleeve.canStartObservation ? 'good' : 'watch'}">
            ${sleeve.canStartObservation ? '可观察' : 'record_only'} /
            ${sleeve.selectedCount === null || sleeve.selectedCount === undefined ? '控制器口径' : `${escapeHtml(sleeve.selectedCount)}只`}
          </span>
        </div>
      `;
      }).join('')
      : '<div class="empty-state compact">暂无运行包信号。</div>';
  }

  if (elements.paperWatchLedgerSummary) {
    elements.paperWatchLedgerSummary.innerHTML = sleeves.length
      ? sleeves.map((sleeve) => `
        <div class="paper-watch-mini-row">
          <div>
            <strong>${escapeHtml(sleeve.strategyName)}</strong>
            <span>
              ${escapeHtml(sleeve.ledgerCount ?? 0)} 条 / ${escapeHtml(sleeve.observedDays ?? 0)} 日，
              收益 ${formatPercent(sleeve.avgPeriodReturn, 2)}，
              回撤 ${formatPercent(sleeve.worstDrawdown, 2)}
            </span>
          </div>
          <span class="tag ${escapeHtml(sleeve.activity?.tone || 'pending')}">${escapeHtml(sleeve.activity?.name || '-')}</span>
        </div>
      `).join('')
      : '<div class="empty-state compact">等待运行包。</div>';
  }

  if (elements.paperWatchUpgradeList) {
    const actions = Array.isArray(consoleData.nextActions) ? consoleData.nextActions : [];
    const pauseRules = Array.isArray(consoleData.pauseRules) ? consoleData.pauseRules : [];
    const upgradeRules = Array.isArray(consoleData.upgradeRules) ? consoleData.upgradeRules : [];
    elements.paperWatchUpgradeList.innerHTML = `
      <details class="compact-details" open>
        <summary>下一步</summary>
        ${renderTextList(actions)}
      </details>
      <details class="compact-details">
        <summary>暂停规则</summary>
        ${renderTextList(pauseRules)}
      </details>
      <details class="compact-details">
        <summary>升级模拟盘门槛</summary>
        ${renderTextList(upgradeRules)}
      </details>
    `;
  }
}

function renderPaperWatchRoutes(pack) {
  if (!elements.paperWatchList) return;
  const routes = Array.isArray(pack.routes) ? pack.routes : [];
  const counts = pack.readinessCounts || {};
  const independence = pack.independence || {};
  const readyCount = Number(pack.readyRouteCount ?? ((counts.ready_controlled_paper_watch || 0) + (counts.ready_local_paper_watch || 0)));
  const conditionalCount = Number(pack.conditionalRouteCount ?? ((counts.conditional_paper_watch || 0) + (counts.conditional_local_paper_watch || 0)));
  const ready = pack.readinessStatus === 'ready_controlled_paper_watch';
  const conditional = pack.readinessStatus === 'conditional_paper_watch';
  const consoleMetrics = pack.paperWatchConsole?.metrics || {};
  if (elements.paperWatchStatus) {
    elements.paperWatchStatus.textContent = pack.paperWatchConsole
      ? `${consoleMetrics.readySleeveCount || 0}资金袖/${consoleMetrics.openSignalCount || 0}信号`
      : ready || conditional
        ? `${readyCount || 0}就绪/${conditionalCount || 0}条件`
        : '未就绪';
    elements.paperWatchStatus.className = `tag ${ready ? 'good' : conditional ? 'pending' : 'watch'}`;
  }
  renderPaperWatchConsole(pack.paperWatchConsole);
  renderPaperWatchRefreshSummary(pack.dailyRefresh);
  renderJoinQuantPaperWatchReport(pack.joinQuantPaperWatchReport);
  renderPaperWatchPerformanceReport(pack.paperWatchPerformanceReport);
  renderBigQuantPaperWatchPack(pack.bigQuantTestPack);
  elements.paperWatchList.innerHTML = routes.length
    ? `
      ${independence.summary ? `
        <div class="paper-watch-note">
          <strong>是否重复使用同一套方法</strong>
          <span>${escapeHtml(independence.independentCapitalSleeves || 0)} 个独立观察账户</span>
          <p>${escapeHtml(plainScope(independence.summary))}</p>
        </div>
      ` : ''}
      ${pack.localBacktest?.tradeabilityReviewScriptEndpoint ? `
        <div class="paper-watch-note">
          <strong>AkShare 最新信号还要做交易检查</strong>
          <span>${pack.localBacktest.latestTradeabilityReview ? '已有导入复核' : '等待真实复核 JSON'}</span>
          <p>本地历史表现不错还不够。开始观察前，还要确认这些股票当天没有停牌、涨跌停等买不了卖不了的问题。</p>
          <a class="inline-link" href="${escapeHtml(pack.localBacktest.tradeabilityReviewScriptEndpoint)}">下载复核脚本</a>
        </div>
      ` : ''}
      ${pack.localBacktest?.regimeSwitch ? `
        <div class="paper-watch-note">
          <strong>${escapeHtml(pack.localBacktest.regimeSwitch.strategy_name || 'AkShare本地切换策略')}</strong>
          <span class="tag ${pack.localBacktest.regimeSwitch.decision === 'ready_local_switch_paper_watch' ? 'good' : 'watch'}">${escapeHtml(plainStatus(pack.localBacktest.regimeSwitch.decision || '-'))}</span>
          <p>
            用本地真实行情做过历史检查：
            ${escapeHtml(pack.localBacktest.regimeSwitch.baseline?.sample_trades ?? 0)} 次调仓，
            历史收益 ${formatPercent(pack.localBacktest.regimeSwitch.baseline?.strategy_return, 2)}，
            最大下跌 ${formatPercent(pack.localBacktest.regimeSwitch.baseline?.max_drawdown, 2)}，
            稳定度 ${formatNumber(pack.localBacktest.regimeSwitch.baseline?.sharpe, 2)}。
          </p>
          ${pack.localBacktest?.regimeSwitchRobustness ? `
            <p>
              稳定性检查：${escapeHtml(plainStatus(pack.localBacktest.regimeSwitchRobustness.decision || '-'))}。
              最差一年仍有 ${formatPercent(pack.localBacktest.regimeSwitchRobustness.summary?.min_leave_one_year_return, 2)}，
              连续 12 期赚钱比例 ${formatPercent(pack.localBacktest.regimeSwitchRobustness.summary?.rolling_12_positive_ratio, 2)}。
            </p>
          ` : ''}
          <p>${escapeHtml(plainScope(pack.localBacktest.regimeSwitch.paper_scope || '进入模拟观察前仍需交易可行性复核。'))}</p>
        </div>
      ` : ''}
      ${renderTradeabilityReviewTaskPack(pack.tradeabilityReviewTaskPack)}
      ${renderCoreMediumSmallPromotionTaskPack(pack.coreMediumSmallPromotionTaskPack)}
      ${renderMaturityMatrix(pack.maturityMatrix)}
      ${pack.operationsPack ? `
        <div class="paper-watch-note">
          <strong>模拟观察运行包</strong>
          <span>${escapeHtml(pack.operationsPack.ready_sleeve_count ?? 0)} 个可观察 / 共 ${escapeHtml(pack.operationsPack.sleeve_count ?? 0)} 个</span>
          <p>${escapeHtml(plainScope(pack.operationsPack.data_policy || ''))}</p>
          <p>已导入账本 ${escapeHtml(pack.operationsPack.importedLedgerCount ?? 0)} 条。</p>
          <p>
            初始账本：
            ${(pack.operationsPack.initial_ledger_rows || []).map((row) => (
              `${explainable(row.sleeve_id || '-', 'sleeve_id')}: ${explainable(plainStatus(row.paper_action || '-'), 'paper_action')} / ${explainable(plainStatus(row.gate_status || '-'), 'gate_status')}`
            )).join('；')}
          </p>
          ${(pack.operationsPack.latestLedgerRows || []).length ? `
            <p>
              最近记录：
              ${(pack.operationsPack.latestLedgerRows || []).map((row) => (
                `${escapeHtml(row.date || '-')}/${explainable(row.sleeve_id || '-', 'sleeve_id')}/${explainable(plainStatus(row.paper_action || '-'), 'paper_action')}/计划比例 ${explainable(row.planned_weight ?? '-', 'planned_weight')}`
              )).join('；')}
            </p>
          ` : ''}
        </div>
      ` : ''}
      ${routes.map((route) => {
      const execution = route.execution || {};
      const readiness = route.readiness || {};
      const signal = route.signal || {};
      const tradeabilityReview = route.tradeability_review || null;
      const tradeabilityTone = tradeabilityReview?.decision === 'tradeability_review_passed'
        ? 'good'
        : tradeabilityReview?.decision === 'tradeability_review_failed'
          ? 'watch'
          : signal.action === 'paper_watch_open_allowed'
            ? 'pending'
            : 'neutral';
      const tradeabilityLabel = tradeabilityReview?.decision === 'tradeability_review_passed'
        ? '复核通过'
        : tradeabilityReview?.decision === 'tradeability_review_failed'
          ? '复核未过'
          : signal.action === 'paper_watch_open_allowed'
            ? '待聚宽复核'
            : '';
      const failedChecks = (readiness.checks || []).filter((item) => !item.passed);
      const readinessTone = readiness.decision === 'ready_controlled_paper_watch' || readiness.decision === 'ready_local_paper_watch'
        ? 'good'
        : readiness.decision === 'not_ready'
          ? 'watch'
          : 'pending';
      const evidenceSystem = route.evidence_system || (route.is_local_backtest ? 'AkShare本地OHLCV' : 'JoinQuant');
      const canStart = readiness.decision === 'ready_controlled_paper_watch'
        || readiness.decision === 'ready_local_paper_watch';
      const directConclusion = canStart
        ? '结论：可以开始模拟观察，但要记录真实账本。'
        : readiness.decision === 'not_ready'
          ? '结论：现在还不能开始。'
          : '结论：先等指定市场条件出现。';
      const executionRoleLabel = {
        primary_local_sleeve: '主观察',
        high_volatility_backup_sleeve: '高波动备选',
        candidate_monitor: '候选监控',
      }[execution.execution_role] || '';
      return `
        <article class="paper-watch-item">
          <div>
            <strong>${route.strategy_name ? escapeHtml(route.strategy_name) : explainable(route.strategy_id, 'strategy_id')}</strong>
            <span class="tag ${readinessTone}">${escapeHtml(plainStatus(readiness.decision || route.layer || '-'))}</span>
            <span class="tag neutral">${escapeHtml(plainEvidence(evidenceSystem))}</span>
            ${executionRoleLabel ? `<span class="tag neutral">${escapeHtml(executionRoleLabel)}</span>` : ''}
            ${tradeabilityLabel ? `<span class="tag ${tradeabilityTone}">${escapeHtml(tradeabilityLabel)}</span>` : ''}
          </div>
          <p class="plain-conclusion">${escapeHtml(directConclusion)}</p>
          <div class="paper-watch-metrics">
            <span>历史收益 ${(Number(route.strategy_return || 0) * 100).toFixed(2)}%</span>
            <span>最大下跌 ${(Number(route.max_drawdown || 0) * 100).toFixed(2)}%</span>
            <span>稳定度 ${Number(route.sharpe || 0).toFixed(2)}</span>
            ${route.avg_selected_count ? `<span>平均入选 ${Number(route.avg_selected_count || 0).toFixed(0)}</span>` : ''}
          </div>
          ${signal.action ? `
            <div class="paper-watch-metrics">
              <span>信号 ${escapeHtml(plainStatus(signal.action))}</span>
              <span>日期 ${escapeHtml(signal.signal_date || '-')}</span>
              <span>候选 ${escapeHtml(signal.candidate_count ?? 0)}</span>
              <span>入选 ${escapeHtml(signal.selected_count ?? 0)}</span>
            </div>
          ` : ''}
          ${tradeabilityReview ? `
            <div class="paper-watch-metrics">
              <span>可交易 ${escapeHtml(tradeabilityReview.tradable_count ?? 0)}/${escapeHtml(tradeabilityReview.candidate_count ?? 0)}</span>
              <span>阻塞 ${escapeHtml(tradeabilityReview.blocked_count ?? 0)}</span>
              <span>复核 ${escapeHtml(tradeabilityReview.signal_date || '-')}</span>
              <span>${escapeHtml(plainStatus(tradeabilityReview.decision || '-'))}</span>
            </div>
          ` : signal.action === 'paper_watch_open_allowed' ? `
            <div class="paper-watch-metrics">
              <span>交易复核 待导入</span>
              <span>需 JoinQuant 真实 JSON</span>
            </div>
          ` : ''}
          <p>${escapeHtml(plainScope(route.paper_scope || ''))}</p>
          ${signal.reason ? `<p>${escapeHtml(plainScope(signal.reason))}</p>` : ''}
          ${tradeabilityReview?.decision_reason ? `<p>${escapeHtml(plainScope(tradeabilityReview.decision_reason))}</p>` : ''}
          ${readiness.decision_reason ? `<p>${escapeHtml(plainScope(readiness.decision_reason))}</p>` : ''}
          <details class="compact-details">
            <summary>查看执行规则</summary>
            <div class="paper-watch-rules">
              <strong>什么时候能开始</strong>
              ${renderTextList((execution.entry_gate || [
                route.paper_scope || '只允许在本路线审计通过的分层和股票池内观察',
                route.is_local_backtest ? '本路线来自 AkShare 本地真实OHLCV回测，需独立记录样本外净值并等待后续 JoinQuant/模拟盘复核。' : '',
              ].filter(Boolean)).map(plainScope))}
              <strong>没通过的检查</strong>
              ${renderTextList(failedChecks.length
                ? failedChecks.map((item) => `${plainScope(item.name)}: ${plainScope(item.detail)}`)
                : ['当前无硬失败项'])}
              <strong>交易成本变高后</strong>
              ${renderTextList(readiness.cost_stress ? [
                `成本提高 1.5 倍后，历史收益 ${formatPercent(readiness.cost_stress.cost_1_5x?.strategy_return, 2)}`,
                `成本提高 2 倍后，历史收益 ${formatPercent(readiness.cost_stress.cost_2_0x?.strategy_return, 2)}`,
              ] : [])}
              <strong>暂停规则</strong>
              ${renderTextList((execution.pause_rules || []).map((item) => plainScope(item.meaning || item.rule)))}
              <strong>最新候选</strong>
              ${renderTextList((signal.selected || []).slice(0, 20).map((item) => `${item.code} ${item.name || ''} 分数 ${Number(item.score || 0).toFixed(3)}`))}
              <strong>交易检查</strong>
              ${renderTextList(tradeabilityReview ? [
                `结论：${plainStatus(tradeabilityReview.decision)}`,
                `可交易：${tradeabilityReview.tradable_count}/${tradeabilityReview.candidate_count}`,
                `数据说明：${plainScope(tradeabilityReview.data_policy || 'JoinQuant 真实交易状态复核')}`,
              ] : signal.action === 'paper_watch_open_allowed' ? [
                '尚未导入 JoinQuant 检查结果，不能把本地最新信号当成已经可以买。',
              ] : [])}
            </div>
          </details>
        </article>
      `;
    }).join('')}
    `
    : '<div class="empty-state">暂无可进入模拟观察的受控路线。</div>';
  if (elements.paperWatchControls) {
    const overlapWarnings = (independence.overlaps || [])
      .map((item) => item.warning)
      .filter(Boolean);
    elements.paperWatchControls.innerHTML = [...(pack.requiredControls || []), ...(pack.globalControls || []), ...overlapWarnings]
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
  }
}

function labelForStatus(status) {
  if (status === 'computed') return ['已计算', 'good'];
  if (status === 'real_signal_computed') return ['真实信号已算', 'good'];
  if (status === 'strategy_candidate') return ['重点候选', 'good'];
  if (status === 'candidate_module') return ['候选模块', 'pending'];
  if (status === 'watch') return ['继续观察', 'pending'];
  if (status === 'tracking') return ['跟踪中', 'pending'];
  if (status === 'hold') return ['暂缓使用', 'watch'];
  if (status === 'market_state_only') return ['市场状态', 'pending'];
  if (status === 'strategy_waiting_backtest') return ['待策略复测', 'watch'];
  if (status === 'factor_tested_strategy_unvalidated') return ['因子已测策略待测', 'pending'];
  if (status === 'real_strategy_backtested') return ['策略已实测', 'good'];
  if (status === 'has_formal_candidates') return ['有正式候选', 'good'];
  if (status === 'experimental_candidate') return ['试验版', 'pending'];
  if (status === 'exportable') return ['可导出', 'good'];
  if (status === 'partial_real_data') return ['部分可用', 'pending'];
  if (status === 'joinquant_ready') return ['聚宽可测', 'good'];
  if (status === 'ready') return ['已就绪', 'good'];
  if (status === 'paper_trade_candidate') return ['准模拟盘', 'good'];
  if (status === 'ready_for_local_factor_test') return ['本地可测', 'good'];
  if (status === 'handled_by_joinquant') return ['交由聚宽', 'pending'];
  if (status === 'ready_for_joinquant_strategy_backtest') return ['待聚宽策略实测', 'pending'];
  if (status === 'joinquant_review_not_passed') return ['聚宽复核未过', 'watch'];
  if (status === 'blocked_by_factor_screen') return ['因子筛选未过', 'watch'];
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
    ak_breakout_confirmation: 'AkShare突破确认',
    ak_contraction_breakout_combo: 'AkShare收缩突破组合',
    ak_crowding_risk: 'AkShare拥挤风险',
    ak_liquidity_stability: 'AkShare流动性稳定',
    ak_mean_reversion_quality_combo: 'AkShare均值回归组合',
    ak_trend_quality: 'AkShare趋势质量',
    f_anti_crowding: '指数增长反拥挤',
    f_close_strength: '指数增长收盘强度',
    f_drawdown_control: '指数增长回撤控制',
    f_gap_risk_control: '指数增长跳空风险控制',
    f_long_momentum: '指数增长长期趋势',
    f_market_regime_fit: '指数增强市场适配',
    f_medium_momentum: '指数增长中期趋势',
    f_orderly_trend: '指数增强有序趋势',
    f_residual_low_volatility: '指数增强残差低波',
    f_short_reversal: '指数增长短期反转',
    f_volume_stability: '指数增长量能稳定',
    f_volume_confirmation: '指数增长量价确认',
    z_f_volume_confirmation: '指数增长量价确认',
    csi300_index_growth_anti_crowding: '沪深300指数增长反拥挤',
    csi300_index_growth_close_strength: '沪深300指数增长收盘强度',
    csi300_index_growth_drawdown_control: '沪深300指数增长回撤控制',
    csi300_index_growth_gap_risk_control: '沪深300指数增长跳空风险控制',
    csi300_index_growth_long_trend: '沪深300指数增长长期趋势',
    csi300_index_growth_low_volatility: '沪深300指数增长低波动',
    csi300_index_growth_medium_trend: '沪深300指数增长中期趋势',
    csi300_index_growth_short_reversal: '沪深300指数增长短期反转',
    csi300_index_growth_volume_price_confirmation: '沪深300指数增长量价确认',
    csi300_index_growth_volume_stability: '沪深300指数增长量能稳定',
    csi500_index_growth_anti_crowding: '中证500指数增长反拥挤',
    csi500_index_growth_close_strength: '中证500指数增长收盘强度',
    csi500_index_growth_drawdown_control: '中证500指数增长回撤控制',
    csi500_index_growth_gap_risk_control: '中证500指数增长跳空风险控制',
    csi500_index_growth_long_trend: '中证500指数增长长期趋势',
    csi500_index_growth_low_volatility: '中证500指数增长低波动',
    csi500_index_growth_medium_trend: '中证500指数增长中期趋势',
    csi500_index_growth_short_reversal: '中证500指数增长短期反转',
    csi500_index_growth_volume_price_confirmation: '中证500指数增长量价确认',
    csi500_index_growth_volume_stability: '中证500指数增长量能稳定',
    index_enhancement_csi300_anti_crowding: '沪深300指数增强反拥挤',
    index_enhancement_csi300_close_strength: '沪深300指数增强收盘强度',
    index_enhancement_csi300_drawdown_control: '沪深300指数增强回撤控制',
    index_enhancement_csi300_gap_risk_control: '沪深300指数增强跳空风险控制',
    index_enhancement_csi300_long_trend: '沪深300指数增强长期趋势',
    index_enhancement_csi300_low_volatility: '沪深300指数增强低波动',
    index_enhancement_csi300_medium_trend: '沪深300指数增强中期趋势',
    index_enhancement_csi300_short_reversal: '沪深300指数增强短期反转',
    index_enhancement_csi300_volume_price_confirmation: '沪深300指数增强量价确认',
    index_enhancement_csi300_volume_stability: '沪深300指数增强量能稳定',
    index_enhancement_csi500_anti_crowding: '中证500指数增强反拥挤',
    index_enhancement_csi500_close_strength: '中证500指数增强收盘强度',
    index_enhancement_csi500_drawdown_control: '中证500指数增强回撤控制',
    index_enhancement_csi500_gap_risk_control: '中证500指数增强跳空风险控制',
    index_enhancement_csi500_long_trend: '中证500指数增强长期趋势',
    index_enhancement_csi500_low_volatility: '中证500指数增强低波动',
    index_enhancement_csi500_medium_trend: '中证500指数增强中期趋势',
    index_enhancement_csi500_short_reversal: '中证500指数增强短期反转',
    index_enhancement_csi500_volume_price_confirmation: '中证500指数增强量价确认',
    index_enhancement_csi500_volume_stability: '中证500指数增强量能稳定',
    ak_volatility_contraction_quality: 'AkShare波动收缩质量',
    ak_volume_price_confirmation: 'AkShare量价确认',
    capital_source_count: '资金来源数',
    chip_health: '筹码健康',
    crowding_risk: '拥挤风险',
    flow_vs_ma: '资金相对均值',
    intraday_strength: '日内强度',
    intraday_ap_slope: '日内暗盘斜率',
    kdj_momentum: 'KDJ动能',
    kline_event_score: '单根K线评分',
    macd_acceleration: 'MACD动能加速',
    professional_sub_factors: '专业解释子因子',
    liquidity_quality_jq: '流动性质量_JQ',
    low_volatility_quality_jq: '低波动质量_JQ',
    market_sensitivity_risk_jq: '市场敏感风险_JQ',
    profit_growth_jq: '利润增长_JQ',
    quality_growth_jq: '质量成长_JQ',
    technical_composite: '技术综合强度',
    trend_alignment: '趋势排列',
    trend_extension_risk: '趋势过伸风险',
    valuation_safety_jq: '估值安全垫_JQ',
    volume_price_confirmation: '量价确认',
    volume_price_divergence_risk: '量价背离风险',
    active_ap_accumulation: '活跃暗盘吸筹',
    active_large_order_accumulation: '超大/大单吸筹代理',
    capital_follow_factor: '资金跟随因子',
    capital_follow_signal: '资金跟随信号',
    capital_overheat_risk: '资金过热风险',
    capital_persistence_2d: '2日资金持续性',
    event_volume_confirmation_factor: '异动放量确认因子',
    institution_retail_divergence_factor: '主散背离因子',
    institutional_contra_divergence: '主反向背离',
    main_force_alignment: '主力一致性',
    market_capital_regime: '市场资金状态',
    panic_reversal_factor: '恐慌反转因子',
    sector_capital_resonance_factor: '板块资金共振因子',
    sentiment_overheat_factor: '情绪过热因子',
  };
  return names[id] || id;
}

function formatNumber(value, digits = 4) {
  if (value === undefined || value === null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toFixed(digits);
}

function formatPercent(value, digits = 2) {
  if (value === undefined || value === null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${(number * 100).toFixed(digits)}%`;
}

function formatCurrency(value, digits = 0) {
  if (value === undefined || value === null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `¥${number.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function plainStatus(value) {
  const text = String(value || '').trim();
  const labels = {
    blocked_by_latest_signal_review: '最新检查没通过，先不要开始',
    candidate_monitor: '先观察，不操作',
    conditional_local_paper_watch: '等条件出现后再观察',
    conditional_paper_watch: '等条件出现后再观察',
    high_volatility: '市场波动较大',
    low_volatility: '市场较平稳',
    medium_volatility: '市场波动适中',
    missing_result: '缺少真实检查结果',
    not_ready: '还不能开始',
    open_allowed: '允许开始观察',
    paper_watch_open_allowed: '允许开始观察',
    promotion_signal_not_ready: '晋级条件没满足',
    promotion_signal_ready: '晋级条件满足',
    ready_controlled_paper_watch: '可以开始模拟观察',
    ready_for_controlled_paper_watch: '可以开始模拟观察',
    ready_local_paper_watch: '可以开始本地模拟观察',
    ready_local_switch_paper_watch: '本地切换策略已可观察',
    review_failed: '复核没通过',
    review_imported: '复核结果已导入',
    review_passed: '复核通过',
    target_met: '目标已达成',
    tradeability_review_failed: '交易检查没通过',
    tradeability_review_passed: '交易检查通过',
  };
  return labels[text] || text.replaceAll('_', ' ') || '-';
}

function plainSource(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.includes('akshare')) return 'AkShare 本地真实行情';
  if (text.includes('joinquant')) return 'JoinQuant 真实检查';
  if (text.includes('yiwan')) return 'Yiwan 采集数据';
  return text.replaceAll('_', ' ');
}

function plainEvidence(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text === 'AkShare本地OHLCV') return 'AkShare 本地真实行情';
  if (text === 'JoinQuant') return 'JoinQuant 真实检查';
  return plainSource(text);
}

function plainScope(text) {
  return String(text || '')
    .replaceAll('资金袖', '观察账户')
    .replaceAll('分层路线', '指定情况')
    .replaceAll('分层', '指定情况')
    .replaceAll('模拟盘', '模拟观察')
    .replaceAll('硬门槛', '必须满足的条件')
    .replaceAll('JoinQuant', 'JoinQuant')
    .replaceAll('JSON', '结果文件');
}

function plainFactorJudgement(result) {
  const dates = Number(result.sample_dates ?? 0);
  const longShort = Number(result.long_short_mean ?? result.longShort);
  const positiveRatio = Number(result.long_short_positive_ratio ?? result.positiveRatio);
  if (dates < 20) return '样本太少，只能先看着。';
  if (Number.isFinite(longShort) && longShort > 0 && Number.isFinite(positiveRatio) && positiveRatio >= 0.55) {
    return '历史检查偏正面，可以继续研究。';
  }
  if (Number.isFinite(longShort) && longShort > 0) return '有一点效果，但还不够稳。';
  return '这次结果偏弱，暂时别靠它做决定。';
}

function plainStrategyJudgement(result) {
  const strategyReturn = Number(result.strategy_return ?? result.mean_return ?? result.daily_mean_return);
  const positiveRatio = Number(result.daily_positive_ratio ?? result.positive_ratio ?? result.daily_win_rate);
  const drawdown = Number(result.max_drawdown);
  if (Number.isFinite(strategyReturn) && strategyReturn > 0 && Number.isFinite(positiveRatio) && positiveRatio >= 0.55) {
    return Number.isFinite(drawdown)
      ? `历史表现偏正面，最大下跌 ${formatPercent(drawdown)}。`
      : '历史表现偏正面，可以继续复核。';
  }
  if (Number.isFinite(strategyReturn) && strategyReturn > 0) return '历史有赚钱，但稳定性还要继续看。';
  return '这组历史结果不理想，先不要推进。';
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

function isStrategyBacktestResult(result) {
  return result?.result_type === 'strategy_backtest'
    || result?.result_type === 'strategy_regime_backtest'
    || result?.result_type === 'strategy_size_backtest'
    || result?.result_type === 'strategy_regime_size_backtest'
    || result?.result_type === 'trading_backtest'
    || result?.result_type === 'local_strategy_backtest'
    || result?.result_type === 'strategy_trading_backtest'
    || Array.isArray(result?.summary) && result.summary.some((item) => item?.result_type === 'strategy_backtest' || item?.result_type === 'strategy_regime_backtest' || item?.result_type === 'strategy_size_backtest' || item?.result_type === 'strategy_regime_size_backtest');
}

function flattenStrategyResults(results) {
  return results.flatMap((result) => {
    if (Array.isArray(result?.summary) && result.summary.some((item) => item?.result_type === 'strategy_backtest' || item?.result_type === 'strategy_regime_backtest' || item?.result_type === 'strategy_size_backtest' || item?.result_type === 'strategy_regime_size_backtest')) {
      return result.summary
        .filter((item) => item?.result_type === 'strategy_backtest' || item?.result_type === 'strategy_regime_backtest' || item?.result_type === 'strategy_size_backtest' || item?.result_type === 'strategy_regime_size_backtest')
        .map((item) => ({
          ...item,
          importedAt: result.importedAt,
          packetSample: result.sample,
          source: item.source || result.source,
          strategy_id: item.strategy_id || result.strategy_id,
          strategy_name: item.strategy_name || result.strategy_name,
        }));
    }

    if (result?.result_type === 'trading_backtest' || result?.result_type === 'strategy_trading_backtest' || result?.result_type === 'local_strategy_backtest') {
      return [{
        ...result,
        horizon: result.horizon || '交易回测',
        mean_return: result.strategy_return,
        daily_mean_return: result.strategy_annual_return,
        daily_positive_ratio: result.daily_win_rate,
        sample_trades: result.trade_count,
        source: result.source || 'joinquant_trading_backtest',
      }];
    }

    return result?.result_type === 'strategy_backtest' || result?.result_type === 'strategy_regime_backtest' || result?.result_type === 'strategy_size_backtest' || result?.result_type === 'strategy_regime_size_backtest' ? [result] : [];
  });
}

function resultStrategyId(result) {
  return result.strategy_id || result.strategyId || result.name || 'unknown_strategy';
}

function strategyResultName(result) {
  return result.strategy_name || result.strategyName || resultStrategyId(result);
}

function formatStrategyHorizon(value) {
  if (Number.isFinite(Number(value))) return `${value}日`;
  return value || '-';
}

function strategyResultMarketRegime(result) {
  if (result.market_regime_name) return result.market_regime_name;
  if (result.market_regime === 'high_volatility') return '高波动';
  if (result.market_regime === 'medium_volatility') return '中波动';
  if (result.market_regime === 'low_volatility') return '低波动';
  if (result.result_type === 'strategy_regime_backtest') return '分层未标注';
  if (result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest') return '交易回测';
  return '未分层';
}

function strategyResultRegimeKey(result) {
  if (result.market_regime === 'high_volatility') return 'high_volatility';
  if (result.market_regime === 'medium_volatility') return 'medium_volatility';
  if (result.market_regime === 'low_volatility') return 'low_volatility';
  if (result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest') return 'trading_backtest';
  return 'unsegmented';
}

const strategyRegimeOptions = [
  { key: 'all', label: '全部', description: '所有真实结果' },
  { key: 'high_volatility', label: '高波动', description: '沪深300波动率高分位' },
  { key: 'medium_volatility', label: '中波动', description: '沪深300波动率中位区间' },
  { key: 'low_volatility', label: '低波动', description: '沪深300波动率低分位' },
  { key: 'unsegmented', label: '未分层/交易回测', description: '普通历史检验或交易回测' },
];

function strategyResultSizeBucket(result) {
  if (result.market_cap_bucket_name) return result.market_cap_bucket_name;
  if (result.market_cap_bucket === 'large_cap') return '大市值';
  if (result.market_cap_bucket === 'mid_cap') return '中市值';
  if (result.market_cap_bucket === 'small_cap') return '小市值';
  if (result.liquidity_bucket === 'high_liquidity') return '高流动性';
  if (result.liquidity_bucket === 'mid_liquidity') return '中流动性';
  if (result.liquidity_bucket === 'low_liquidity') return '低流动性';
  if (result.result_type === 'strategy_size_backtest') return '市值未标注';
  if (result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest') return '交易回测';
  return '未分层';
}

function strategyResultSizeKey(result) {
  if (result.market_cap_bucket === 'large_cap') return 'large_cap';
  if (result.market_cap_bucket === 'mid_cap') return 'mid_cap';
  if (result.market_cap_bucket === 'small_cap') return 'small_cap';
  if (result.liquidity_bucket === 'high_liquidity') return 'high_liquidity';
  if (result.liquidity_bucket === 'mid_liquidity') return 'mid_liquidity';
  if (result.liquidity_bucket === 'low_liquidity') return 'low_liquidity';
  if (result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest') return 'trading_backtest';
  return 'unsegmented';
}

function formatMarketCap(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${formatNumber(number, 1)}亿`;
}

function formatSizeOrLiquidityMeta(result) {
  if (result.liquidity_metric20_mean !== null && result.liquidity_metric20_mean !== undefined && result.liquidity_metric20_mean !== '') {
    return `流动性 ${formatNumber(Number(result.liquidity_metric20_mean), 1)}`;
  }
  if (result.amount_ma20_mean !== null && result.amount_ma20_mean !== undefined && result.amount_ma20_mean !== '') {
    return `成交额 ${formatMarketCap(Number(result.amount_ma20_mean) / 100000000)}`;
  }
  return formatMarketCap(result.market_cap_mean);
}

const strategySizeOptions = [
  { key: 'all', label: '全部', description: '所有真实结果' },
  { key: 'large_cap', label: '大市值', description: '当日沪深300市值高分位' },
  { key: 'mid_cap', label: '中市值', description: '当日沪深300市值中位区间' },
  { key: 'small_cap', label: '小市值', description: '当日沪深300市值低分位' },
  { key: 'high_liquidity', label: '高流动性', description: 'AkShare 20日成交额高分位' },
  { key: 'mid_liquidity', label: '中流动性', description: 'AkShare 20日成交额中位区间' },
  { key: 'low_liquidity', label: '低流动性', description: 'AkShare 20日成交额低分位' },
  { key: 'unsegmented', label: '未分层/交易回测', description: '普通历史检验或交易回测' },
];

function strategyResultTone(result) {
  if (result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest') {
    const strategyReturn = Number(result.strategy_return ?? 0);
    const excessReturn = Number(result.excess_return ?? 0);
    if (strategyReturn > 0 && excessReturn > 0) return ['交易通过', 'good'];
    if (strategyReturn >= 0) return ['待优化', 'pending'];
    return ['偏弱', 'watch'];
  }

  const dates = Number(result.sample_dates ?? 0);
  const meanReturn = Number(result.daily_mean_return ?? result.mean_return ?? 0);
  const positiveRatio = Number(result.daily_positive_ratio ?? result.positive_ratio ?? 0);

  if (dates < 20) return ['跟踪中', 'pending'];
  if (meanReturn > 0 && positiveRatio >= 0.55) return ['可继续', 'good'];
  if (meanReturn > 0 && positiveRatio >= 0.5) return ['观察', 'pending'];
  return ['偏弱', 'watch'];
}

function plainStrategySummary(result) {
  return [
    `历史收益 ${formatPercent(result.strategy_return ?? result.mean_return ?? result.daily_mean_return)}`,
    `最大下跌 ${formatPercent(result.max_drawdown)}`,
    `赚钱次数占比 ${formatPercent(result.daily_positive_ratio ?? result.positive_ratio ?? result.daily_win_rate)}`,
  ].filter((item) => !item.endsWith(' -')).join(' / ');
}

function isTradingStrategyResult(result) {
  return result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest';
}

function strategyResultPerformanceLabel(result) {
  if (!isTradingStrategyResult(result)) {
    return result.date_range || `${result.sample_dates ?? '-'} 天记录 / ${result.sample_trades ?? '-'} 次样本`;
  }

  return [
    `历史收益 ${formatPercent(result.strategy_return)}`,
    `最大下跌 ${formatPercent(result.max_drawdown)}`,
    `稳定度 ${formatNumber(result.sharpe, 2)}`,
    `换手 ${formatNumber(result.avg_turnover ?? result.turnover, 2)}`,
  ].join(' / ');
}

function renderStrategyResultDirectory(rows) {
  const strategyMap = new Map();

  rows.forEach((result) => {
    const strategyId = resultStrategyId(result);
    const current = strategyMap.get(strategyId) || {
      count: 0,
      displayName: strategyResultName(result),
      trades: 0,
    };
    current.count += 1;
    current.trades += Number(result.sample_trades ?? 0);
    strategyMap.set(strategyId, current);
  });

  if (activeStrategyResult !== 'all' && !strategyMap.has(activeStrategyResult)) {
    activeStrategyResult = 'all';
  }

  const activeMeta = activeStrategyResult === 'all'
    ? {
      count: rows.length,
      displayName: '全部策略',
      trades: [...strategyMap.values()].reduce((sum, item) => sum + item.trades, 0),
    }
    : strategyMap.get(activeStrategyResult);

  const strategyButtons = [...strategyMap.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .map(([strategyId, meta]) => `
      <button class="factor-directory-button${activeStrategyResult === strategyId ? ' active' : ''}" data-strategy-result="${escapeHtml(strategyId)}" type="button">
        <strong>${escapeHtml(meta.displayName)}</strong>
        <span>${escapeHtml(meta.count)} 条 / ${escapeHtml(meta.trades)} 样本</span>
      </button>
    `)
    .join('');

  elements.strategyResultDirectory.innerHTML = `
    <details class="factor-directory-disclosure">
      <summary>
        <div>
          <span>策略目录</span>
          <strong>${escapeHtml(activeMeta?.displayName || '全部策略')}</strong>
          <small>${escapeHtml(activeMeta?.count ?? rows.length)} 条 / ${escapeHtml(activeMeta?.trades ?? 0)} 样本</small>
        </div>
        <em>点击展开</em>
      </summary>
      <div class="factor-directory-list">
        <button class="factor-directory-button${activeStrategyResult === 'all' ? ' active' : ''}" data-strategy-result="all" type="button">
          <strong>全部策略</strong>
          <span>${escapeHtml(rows.length)} 条</span>
        </button>
        ${strategyButtons}
      </div>
    </details>
  `;

  elements.strategyResultDirectory.querySelectorAll('[data-strategy-result]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStrategyResult = button.dataset.strategyResult || 'all';
      renderStrategyResultSummary(rows);
    });
  });
}

function renderStrategyRegimeFilter(rows) {
  const scopeRows = activeStrategyResult === 'all'
    ? rows
    : rows.filter((result) => resultStrategyId(result) === activeStrategyResult);

  const countByRegime = new Map(strategyRegimeOptions.map((option) => [
    option.key,
    { rows: 0, trades: 0 },
  ]));

  scopeRows.forEach((result) => {
    const key = strategyResultRegimeKey(result);
    const normalizedKey = key === 'trading_backtest' ? 'unsegmented' : key;
    const current = countByRegime.get(normalizedKey) || { rows: 0, trades: 0 };
    current.rows += 1;
    current.trades += Number(result.sample_trades ?? 0);
    countByRegime.set(normalizedKey, current);
  });

  const totalTrades = scopeRows.reduce((sum, result) => sum + Number(result.sample_trades ?? 0), 0);
  countByRegime.set('all', { rows: scopeRows.length, trades: totalTrades });

  if (!strategyRegimeOptions.some((option) => option.key === activeStrategyRegimeResult)) {
    activeStrategyRegimeResult = 'all';
  }

  const activeOption = strategyRegimeOptions.find((option) => option.key === activeStrategyRegimeResult) || strategyRegimeOptions[0];
  elements.strategyResultRegimeFilter.innerHTML = `
    <div class="strategy-regime-filter-head">
      <span>市场波动率筛选</span>
      <strong>${escapeHtml(activeOption.label)}</strong>
      <small>只展示已导入的真实策略实测结果</small>
    </div>
    <div class="strategy-regime-filter-actions">
      ${strategyRegimeOptions.map((option) => {
        const meta = countByRegime.get(option.key) || { rows: 0, trades: 0 };
        return `
          <button class="${activeStrategyRegimeResult === option.key ? 'active' : ''}" data-strategy-regime="${escapeHtml(option.key)}" type="button">
            <strong>${escapeHtml(option.label)}</strong>
            <span>${escapeHtml(meta.rows)} 条 / ${escapeHtml(meta.trades)} 样本</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  elements.strategyResultRegimeFilter.querySelectorAll('[data-strategy-regime]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStrategyRegimeResult = button.dataset.strategyRegime || 'all';
      renderStrategyResultSummary(rows);
    });
  });
}

function applyStrategyRegimeFilter(rows) {
  if (activeStrategyRegimeResult === 'all') return rows;
  return rows.filter((result) => {
    const key = strategyResultRegimeKey(result);
    if (activeStrategyRegimeResult === 'unsegmented') {
      return key === 'unsegmented' || key === 'trading_backtest';
    }
    return key === activeStrategyRegimeResult;
  });
}

function applyStrategySizeFilter(rows) {
  if (activeStrategySizeResult === 'all') return rows;
  return rows.filter((result) => {
    const key = strategyResultSizeKey(result);
    if (activeStrategySizeResult === 'unsegmented') {
      return key === 'unsegmented' || key === 'trading_backtest';
    }
    return key === activeStrategySizeResult;
  });
}

function renderStrategySizeFilter(rows) {
  const strategyScopedRows = activeStrategyResult === 'all'
    ? rows
    : rows.filter((result) => resultStrategyId(result) === activeStrategyResult);
  const scopeRows = applyStrategyRegimeFilter(strategyScopedRows);

  const countBySize = new Map(strategySizeOptions.map((option) => [
    option.key,
    { rows: 0, trades: 0 },
  ]));

  scopeRows.forEach((result) => {
    const key = strategyResultSizeKey(result);
    const normalizedKey = key === 'trading_backtest' ? 'unsegmented' : key;
    const current = countBySize.get(normalizedKey) || { rows: 0, trades: 0 };
    current.rows += 1;
    current.trades += Number(result.sample_trades ?? 0);
    countBySize.set(normalizedKey, current);
  });

  const totalTrades = scopeRows.reduce((sum, result) => sum + Number(result.sample_trades ?? 0), 0);
  countBySize.set('all', { rows: scopeRows.length, trades: totalTrades });

  if (!strategySizeOptions.some((option) => option.key === activeStrategySizeResult)) {
    activeStrategySizeResult = 'all';
  }

  const activeOption = strategySizeOptions.find((option) => option.key === activeStrategySizeResult) || strategySizeOptions[0];
  elements.strategyResultSizeFilter.innerHTML = `
    <div class="strategy-regime-filter-head">
      <span>市值分层筛选</span>
      <strong>${escapeHtml(activeOption.label)}</strong>
      <small>按 JoinQuant valuation.market_cap 实测分层</small>
    </div>
    <div class="strategy-regime-filter-actions">
      ${strategySizeOptions.map((option) => {
        const meta = countBySize.get(option.key) || { rows: 0, trades: 0 };
        return `
          <button class="${activeStrategySizeResult === option.key ? 'active' : ''}" data-strategy-size="${escapeHtml(option.key)}" type="button">
            <strong>${escapeHtml(option.label)}</strong>
            <span>${escapeHtml(meta.rows)} 条 / ${escapeHtml(meta.trades)} 样本</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  elements.strategyResultSizeFilter.querySelectorAll('[data-strategy-size]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStrategySizeResult = button.dataset.strategySize || 'all';
      renderStrategyResultSummary(rows);
    });
  });
}

function renderStrategyResultSummary(rows) {
  if (!rows.length) {
    activeStrategyResult = 'all';
    activeStrategyRegimeResult = 'all';
    activeStrategySizeResult = 'all';
    elements.strategyResultCount.textContent = '0';
    elements.strategyResultStrategyCount.textContent = '0';
    elements.strategyResultTradeCount.textContent = '0';
    elements.strategyResultBestHorizon.textContent = '-';
    elements.strategyResultDirectory.innerHTML = '<div class="factor-directory-empty">暂无策略实测结果。跑完 JoinQuant 策略检验后会自动生成目录。</div>';
    elements.strategyResultRegimeFilter.innerHTML = '';
    elements.strategyResultSizeFilter.innerHTML = '';
    elements.strategyResultSummary.innerHTML = `
      <div class="result-card">
        <span>策略实测</span>
        <strong>0</strong>
        <small>等待真实结果回填</small>
      </div>
    `;
    elements.strategyResultTable.innerHTML = '<tr><td colspan="12">暂无策略实测结果。</td></tr>';
    elements.strategyResultNotes.textContent = '这里不展示估算绩效，只展示 JoinQuant 实跑或研究环境真实计算结果。';
    return;
  }

  renderStrategyResultDirectory(rows);
  renderStrategyRegimeFilter(rows);
  renderStrategySizeFilter(rows);

  const strategyScopedRows = activeStrategyResult === 'all'
    ? rows
    : rows.filter((result) => resultStrategyId(result) === activeStrategyResult);
  const regimeScopedRows = applyStrategyRegimeFilter(strategyScopedRows);
  const visibleRows = applyStrategySizeFilter(regimeScopedRows);
  const activeRegimeOption = strategyRegimeOptions.find((option) => option.key === activeStrategyRegimeResult) || strategyRegimeOptions[0];
  const activeSizeOption = strategySizeOptions.find((option) => option.key === activeStrategySizeResult) || strategySizeOptions[0];

  if (!visibleRows.length) {
    const strategyLabel = activeStrategyResult === 'all'
      ? '全部策略'
      : strategyResultName(rows.find((result) => resultStrategyId(result) === activeStrategyResult) || {});
    elements.strategyResultCount.textContent = '0';
    elements.strategyResultStrategyCount.textContent = '0';
    elements.strategyResultTradeCount.textContent = '0';
    elements.strategyResultBestHorizon.textContent = '-';
    elements.strategyResultSummary.innerHTML = `
      <div class="result-card">
        <span>结果记录</span>
        <strong>0</strong>
        <small>${escapeHtml(strategyLabel)}</small>
      </div>
      <div class="result-card">
        <span>分层条件</span>
        <strong>${escapeHtml(activeRegimeOption.label)} / ${escapeHtml(activeSizeOption.label)}</strong>
        <small>暂无真实回填</small>
      </div>
      <div class="result-card">
        <span>样本交易</span>
        <strong>0</strong>
        <small>未显示任何候选/成交样本</small>
      </div>
      <div class="result-card">
        <span>最佳周期</span>
        <strong>-</strong>
        <small>等待真实分层结果</small>
      </div>
    `;
    elements.strategyResultTable.innerHTML = '<tr><td colspan="12">当前策略、市场状态与市值层筛选下暂无真实策略实测结果。</td></tr>';
    elements.strategyResultNotes.innerHTML = `
      <strong>结果边界：</strong>
      当前筛选为 ${escapeHtml(strategyLabel)} / ${escapeHtml(activeRegimeOption.label)} / ${escapeHtml(activeSizeOption.label)}。
      没有导入 JoinQuant 对应分层 JSON 前，这里不会展示该条件下绩效。
    `;
    return;
  }

  const strategyCount = new Set(visibleRows.map(resultStrategyId)).size;
  const tradeCount = visibleRows.reduce((sum, result) => sum + Number(result.sample_trades ?? 0), 0);
  const bestMean = visibleRows.reduce((best, result) => {
    const current = Number(result.daily_mean_return ?? result.mean_return);
    const previous = Number(best?.daily_mean_return ?? best?.mean_return);
    if (!Number.isFinite(current)) return best;
    if (!best || !Number.isFinite(previous) || current > previous) return result;
    return best;
  }, null);
  const positiveRows = visibleRows.filter((result) => Number(result.daily_mean_return ?? result.mean_return) > 0).length;

  elements.strategyResultCount.textContent = visibleRows.length;
  elements.strategyResultStrategyCount.textContent = strategyCount;
  elements.strategyResultTradeCount.textContent = tradeCount;
  elements.strategyResultBestHorizon.textContent = formatStrategyHorizon(bestMean?.horizon);

  elements.strategyResultSummary.innerHTML = `
    <div class="result-card result-card-wide">
      <span>直接结论</span>
      <strong>${escapeHtml(plainStrategyJudgement(bestMean || visibleRows[0]))}</strong>
      <small>只根据已导入的真实结果判断</small>
    </div>
    <div class="result-card">
      <span>结果记录</span>
      <strong>${escapeHtml(visibleRows.length)}</strong>
      <small>${escapeHtml(strategyCount)} 个策略</small>
    </div>
    <div class="result-card">
      <span>样本交易</span>
      <strong>${escapeHtml(tradeCount)}</strong>
      <small>候选/成交样本合计</small>
    </div>
    <div class="result-card">
      <span>分层条件</span>
      <strong>${escapeHtml(activeRegimeOption.label)} / ${escapeHtml(activeSizeOption.label)}</strong>
      <small>${escapeHtml(visibleRows.length)} 条真实结果</small>
    </div>
      <div class="result-card">
        <span>表现最好周期</span>
        <strong>${escapeHtml(formatStrategyHorizon(bestMean?.horizon))}</strong>
        <small>${formatPercent(bestMean?.daily_mean_return ?? bestMean?.mean_return)} 平均收益</small>
      </div>
  `;

  elements.strategyResultTable.innerHTML = visibleRows
    .slice()
    .sort((left, right) => {
      const strategyDiff = strategyResultName(left).localeCompare(strategyResultName(right), 'zh-Hans-CN');
      if (strategyDiff !== 0) return strategyDiff;
      const regimeDiff = strategyResultMarketRegime(left).localeCompare(strategyResultMarketRegime(right), 'zh-Hans-CN');
      if (regimeDiff !== 0) return regimeDiff;
      const sizeDiff = strategyResultSizeBucket(left).localeCompare(strategyResultSizeBucket(right), 'zh-Hans-CN');
      if (sizeDiff !== 0) return sizeDiff;
      return Number(left.horizon ?? 0) - Number(right.horizon ?? 0);
    })
    .map((result) => {
      const [label, tone] = strategyResultTone(result);
      return `
        <tr>
          <td><strong>${escapeHtml(strategyResultName(result))}</strong><br><small>${explainable(resultStrategyId(result), 'strategy_id')}</small></td>
          <td>${escapeHtml(formatStrategyHorizon(result.horizon))}</td>
          <td>${escapeHtml(strategyResultMarketRegime(result))}<br><small>${formatPercent(result.market_vol_mean)}</small></td>
          <td>${escapeHtml(strategyResultSizeBucket(result))}<br><small>${formatSizeOrLiquidityMeta(result)}</small></td>
          <td><strong>${escapeHtml(plainStrategyJudgement(result))}</strong><br><small>${escapeHtml(strategyResultPerformanceLabel(result))}</small></td>
          <td>${formatPercent(result.mean_return)}</td>
          <td>${formatPercent(result.daily_mean_return)}</td>
          <td>${formatPercent(result.daily_positive_ratio ?? result.positive_ratio)}</td>
          <td>${formatPercent(result.best_daily_return)} / ${formatPercent(result.worst_daily_return)}</td>
          <td>${formatNumber(result.avg_candidates_per_date, 1)}</td>
          <td>${explainable(plainSource(result.source || 'joinquant'), 'source')}</td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
        </tr>
      `;
    })
    .join('');

  elements.strategyResultNotes.innerHTML = `
    <strong>怎么看：</strong>
    “历史收益”表示过去这段测试里赚了多少；“最大下跌”表示中间最难受时亏到多少；“赚钱次数占比”表示有多少次结果是正的。
    <br><strong>边界：</strong>
    ${activeStrategyResult === 'all' ? '当前展示全部策略' : `当前策略：${escapeHtml(strategyResultName(visibleRows[0]))}`}；
    市场状态：${escapeHtml(activeRegimeOption.label)}；股票范围：${escapeHtml(activeSizeOption.label)}；赚钱记录 ${escapeHtml(positiveRows)} 条。
    只展示真实导入的检查结果，没导入就不编结论。
  `;
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
        <span>因子回测</span>
        <strong>0</strong>
        <small>等待 JoinQuant 回填</small>
      </div>
    `;
    elements.backtestResultTable.innerHTML = '<tr><td colspan="10">暂无因子回测结果。</td></tr>';
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
    <div class="result-card result-card-wide">
      <span>直接结论</span>
      <strong>${escapeHtml(plainFactorJudgement(bestLongShort || bestRankIc || visibleResults[0]))}</strong>
      <small>只代表当前导入结果，不代表实盘建议</small>
    </div>
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
      <span>排序最有效</span>
      <strong>${formatNumber(bestRankIc?.rank_ic_mean ?? bestRankIc?.rankIc)}</strong>
      <small>${escapeHtml(factorDisplayName(bestRankIc?.factor_name || bestRankIc?.factor || '-'))} / ${escapeHtml(bestRankIc?.horizon ?? '-')}日，越高说明排序越有用</small>
    </div>
    <div class="result-card">
      <span>好坏组差距最大</span>
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
          <td><strong>${escapeHtml(factorDisplayName(factor))}</strong><br><small>${explainable(result.factor_variant || factor, result.factor_variant ? 'factor_variant' : 'factor_id')}</small></td>
          <td>${escapeHtml(result.horizon ?? '-')}日</td>
          <td>${result.direction === 'negative' ? '风险越高越差' : '分数越高越好'}</td>
          <td>${escapeHtml(result.sample_dates ?? '-')} / ${formatNumber(result.coverage_mean, 0)}</td>
          <td>${formatNumber(result.rank_ic_mean ?? result.rankIc)}<br><small>排序有效度</small></td>
          <td>${formatNumber(result.rank_ic_t ?? result.rankIcT)}<br><small>稳定性参考</small></td>
          <td>${formatPercent(result.long_short_mean ?? result.longShort)}<br><small>好组减差组</small></td>
          <td>${formatPercent(result.long_short_positive_ratio ?? result.positiveRatio)}<br><small>赚钱次数占比</small></td>
          <td>${explainable(plainSource(result.source || 'joinquant'), 'source')}</td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
        </tr>
      `;
    })
    .join('');

  const singleDayCount = visibleResults.filter((item) => Number(item.sample_dates ?? 0) < 20).length;
  elements.backtestResultNotes.innerHTML = `
    <strong>怎么看：</strong>
    “排序有效度”越高，说明这个指标越能把表现较好的股票排到前面；“好坏组差距”越大，说明排前面的股票历史上比排后面的更好。
    <br><strong>边界：</strong>
    ${activeValidatedFactor === 'all' ? '当前展示全部因子。' : `当前筛选：${escapeHtml(factorDisplayName(activeValidatedFactor))}。`}
    已导入结果来自真实检查。${singleDayCount ? `${singleDayCount} 条样本太少，只能跟踪，不能定论。` : ''}
    这些结果只说明历史检查情况，不等于可以买入建议。
  `;
}

function renderFactorActivity(report) {
  if (!elements.activityTable) return;
  const metrics = report?.metrics || {};
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const source = report?.source || {};
  const summary = report?.summary || {};

  elements.activityActiveCount.textContent = metrics.activeCount ?? 0;
  elements.activityWatchCount.textContent = metrics.watchCount ?? 0;
  elements.activityDormantCount.textContent = metrics.dormantCount ?? 0;
  elements.activityBlockedCount.textContent = metrics.blockedCount ?? 0;
  elements.activitySourceFile.textContent = source.file || '未找到数据源';
  elements.activitySourceFile.title = fieldHint('source_file', source.file || '');

  elements.activitySummary.innerHTML = `
    <div class="result-card result-card-wide">
      <span>直接结论</span>
      <strong>${escapeHtml(summary.headline || '等待因子活性检查')}</strong>
      <small>${escapeHtml(summary.nextAction || '暂无下一步')}</small>
    </div>
    <div class="result-card">
      <span>覆盖因子</span>
      <strong>${escapeHtml(metrics.factorCount ?? entries.length)}</strong>
      <small>${escapeHtml(metrics.testedCount ?? 0)} 个已有真实结果</small>
    </div>
    <div class="result-card">
      <span>历史结果</span>
      <strong>${escapeHtml(metrics.historicalResultCount ?? 0)}</strong>
      <small>样本不少于 20 截面</small>
    </div>
    <div class="result-card">
      <span>最佳活性</span>
      <strong>${escapeHtml(summary.bestFactor?.activityScore ?? '-')}</strong>
      <small>${escapeHtml(summary.bestFactor?.name || '-')}</small>
    </div>
  `;

  elements.activityTable.innerHTML = entries.length
    ? entries.map((entry) => {
      const blockers = Array.isArray(entry.blockers) ? entry.blockers.filter(Boolean) : [];
      const evidence = [entry.evidence, blockers.length ? `缺口：${blockers.slice(0, 2).join('；')}` : '']
        .filter(Boolean)
        .join(' ');
      return `
        <tr>
          <td><strong>${escapeHtml(entry.name)}</strong><br><small>${explainable(entry.factorId, 'factor_id')}</small></td>
          <td><span class="tag ${escapeHtml(entry.activityTone || 'pending')}">${escapeHtml(entry.activityLabel || '-')}</span><br><small>${escapeHtml(entry.decision || '-')}</small></td>
          <td><strong>${escapeHtml(entry.activityScore ?? '-')}</strong></td>
          <td>${entry.bestHorizon ? `${escapeHtml(entry.bestHorizon)}日` : '-'}</td>
          <td>${formatNumber(entry.bestRankIc)}</td>
          <td>${formatNumber(entry.bestRankIcT, 2)}</td>
          <td>${formatPercent(entry.bestLongShort)}</td>
          <td>${escapeHtml(entry.resultCount ?? 0)} 条<br><small>历史 ${escapeHtml(entry.historicalCount ?? 0)} / 可导出 ${escapeHtml(entry.exportRows ?? 0)}</small></td>
          <td>${escapeHtml(evidence || '-')}</td>
          <td>${escapeHtml(entry.nextAction || '-')}</td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="10">暂无可检查因子。</td></tr>';

  elements.activityNotes.innerHTML = `
    <strong>怎么看：</strong>
    活跃表示已有足够真实历史结果，且排序有效度、稳定性和好坏组差距同步达标；观察表示方向可跟踪但显著性不足；休眠表示有信号但还缺真实回测；阻塞表示字段或样本不足。
    <br><strong>边界：</strong>
    ${escapeHtml(report?.dataPolicy || '只使用真实证据，不生成估算收益。')}
    当前因子截面 ${escapeHtml(source.uniqueDates ?? 0)} 日 / ${escapeHtml(source.uniqueStocks ?? 0)} 股，可导出 ${escapeHtml(source.exportableRows ?? 0)} 行。
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
  const dependenciesHtml = entry.dataDependencies?.length
    ? explainFieldList(entry.dataDependencies)
    : '当前没有登记字段依赖';

  elements.researchFactorDetail.innerHTML = `
    <div class="research-detail-head">
      <div>
        <h3>${escapeHtml(entry.name)}</h3>
        <small>${explainable(entry.factorId, 'factor_id')} / ${escapeHtml(categoryNames[entry.category] || entry.category || 'research')}</small>
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
        <div><span>排序有效度</span><strong>${formatNumber(entry.test?.bestRankIc)}</strong></div>
        <div><span>稳定性参考</span><strong>${formatNumber(entry.test?.bestRankIcT, 2)}</strong></div>
        <div><span>好坏组差距</span><strong>${formatPercent(entry.test?.bestLongShort)}</strong></div>
        <div><span>最佳周期</span><strong>${entry.test?.bestHorizon ? `${escapeHtml(entry.test.bestHorizon)}日` : '-'}</strong></div>
      </div>
    </div>
    <div class="research-section">
      <strong>数据依赖</strong>
      <p>${dependenciesHtml}</p>
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
  elements.researchSourceFile.title = pipeline.source?.file ? fieldHint('source_file', pipeline.source.file) : '';

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

const factorRoleMeta = {
  main_signal: {
    label: '主信号池',
    type: '收益预测',
    usage: '选股 / 加权',
    horizon: '10/20日待测',
    description: '优先回答“买什么、排第几”。',
    tone: 'good',
  },
  confirmation: {
    label: '确认信号池',
    type: '确认',
    usage: '策略确认 / 过滤',
    horizon: '5/10日待测',
    description: '减少假信号，提升入场质量。',
    tone: 'pending',
  },
  risk_filter: {
    label: '风险过滤池',
    type: '风险过滤',
    usage: '风控过滤 / 降权',
    horizon: '5日待测',
    description: '不直接追求高IC，重点看回撤和拥挤风险。',
    tone: 'watch',
  },
  environment: {
    label: '环境择时池',
    type: '环境择时',
    usage: '择时 / 仓位控制',
    horizon: '20日待测',
    description: '判断市场状态，决定是否开仓或降仓。',
    tone: 'neutral',
  },
  fundamental: {
    label: '基本面增强池',
    type: '基本面增强',
    usage: '中长期选股 / 质量增强',
    horizon: '20/60日待测',
    description: '用于质量、成长、估值等慢变量确认。',
    tone: 'good',
  },
};

function factorLibraryProfile(id, value, pipelineEntry) {
  const category = String(value.category || pipelineEntry?.category || '').toLowerCase();
  const identity = [
    id,
    value.displayName,
    pipelineEntry?.name,
  ].filter(Boolean).join(' ').toLowerCase();
  const detailText = [
    value.usage,
    value.note,
    value.signal,
    value.formula,
    pipelineEntry?.usage,
    pipelineEntry?.formula,
  ].filter(Boolean).join(' ').toLowerCase();
  const explicitRoleMap = {
    active_ap_accumulation: 'confirmation',
    active_large_order_accumulation: 'confirmation',
    capital_follow_signal: 'main_signal',
    capital_overheat_risk: 'risk_filter',
    capital_persistence_2d: 'main_signal',
    chip_health: 'risk_filter',
    crowding_risk: 'risk_filter',
    institutional_contra_divergence: 'confirmation',
    kdj_momentum: 'confirmation',
    kline_event_score: 'confirmation',
    liquidity_quality_jq: 'risk_filter',
    macd_acceleration: 'confirmation',
    main_force_alignment: 'confirmation',
    market_capital_regime: 'environment',
    f_anti_crowding: 'risk_filter',
    f_close_strength: 'confirmation',
    f_gap_risk_control: 'risk_filter',
    f_market_regime_fit: 'environment',
    f_medium_momentum: 'main_signal',
    f_orderly_trend: 'confirmation',
    f_residual_low_volatility: 'risk_filter',
    f_short_reversal: 'confirmation',
    f_volume_stability: 'confirmation',
    f_volume_confirmation: 'main_signal',
    profit_growth_jq: 'fundamental',
    quality_growth_jq: 'fundamental',
    sentiment_overheat_factor: 'risk_filter',
    technical_composite: 'main_signal',
    trend_alignment: 'main_signal',
    trend_extension_risk: 'risk_filter',
    volume_price_confirmation: 'main_signal',
    volume_price_divergence_risk: 'risk_filter',
  };

  let role = explicitRoleMap[id] || explicitRoleMap[value.definitionId] || 'main_signal';
  if (explicitRoleMap[id] || explicitRoleMap[value.definitionId]) {
    // Keep explicit project roles stable; these are named factors already used by策略/回测 modules.
  } else if (
    value.direction === 'negative'
    || pipelineEntry?.direction === 'negative'
    || category === 'risk'
    || category === 'sentiment'
    || category === 'liquidity'
    || /risk|crowding|overheat|divergence|extension/.test(identity)
    || /风险|拥挤|过热|背离|过伸/.test(identity)
  ) {
    role = 'risk_filter';
  } else if (category === 'market' || /regime|market|volatility/.test(identity) || /环境|择时|波动/.test(identity)) {
    role = 'environment';
  } else if (
    category === 'fundamental'
    || /profit|quality|growth|valuation|fundamental/.test(identity)
    || /盈利|质量|成长|估值|基本面/.test(identity)
  ) {
    role = 'fundamental';
  } else if (
    category === 'chip'
    || category === 'sector'
    || category === 'event'
    || /confirm|alignment|kline|macd|kdj|chip|sector|event/.test(identity)
    || /确认|形态|筹码|板块|异动/.test(detailText)
  ) {
    role = 'confirmation';
  }

  const meta = factorRoleMeta[role];
  const bestHorizon = pipelineEntry?.test?.bestHorizon;
  const horizon = bestHorizon ? `${bestHorizon}日（实测最佳）` : meta.horizon;
  const evidence = pipelineEntry?.resultCount > 0
    ? `JoinQuant 回填 ${pipelineEntry.resultCount} 条`
    : pipelineEntry?.exportRows > 0
      ? `可导出 ${pipelineEntry.exportRows} 行，待因子回测`
    : value.status === 'computed'
      ? '已有真实字段，待因子回测'
      : '待补数据/待回测';

  return {
    ...meta,
    evidence,
    horizon,
    role,
    statusLabel: pipelineEntry?.decision || labelForStatus(value.status)[0],
    statusTone: pipelineEntry?.decisionTone || labelForStatus(value.status)[1],
  };
}

function renderFactorRolePools(entries, pipeline) {
  if (!elements.factorRolePools) return;

  const pipelineMap = new Map((pipeline?.entries || []).map((entry) => [entry.factorId, entry]));
  const grouped = Object.fromEntries(Object.keys(factorRoleMeta).map((role) => [role, []]));

  entries.forEach(([id, value]) => {
    const pipelineEntry = pipelineMap.get(id) || pipelineMap.get(value.definitionId) || null;
    const profile = factorLibraryProfile(id, value, pipelineEntry);
    grouped[profile.role].push({
      id,
      name: value.displayName || factorDisplayName(id),
      profile,
      resultCount: pipelineEntry?.resultCount || 0,
      status: value.status,
    });
  });

  elements.factorRolePools.innerHTML = Object.entries(factorRoleMeta)
    .map(([role, meta]) => {
      const items = grouped[role].sort((left, right) => {
        if (right.resultCount !== left.resultCount) return right.resultCount - left.resultCount;
        return left.name.localeCompare(right.name, 'zh-CN');
      });
      const visible = items.slice(0, 5);

      return `
        <article class="factor-role-pool">
          <div class="factor-role-pool-head">
            <div>
              <h3>${escapeHtml(meta.label)}</h3>
              <p>${escapeHtml(meta.description)}</p>
            </div>
            <span class="tag ${escapeHtml(meta.tone)}">${items.length}</span>
          </div>
          <div class="factor-role-chip-list">
            ${visible.length ? visible.map((item) => `
              <span class="factor-role-chip">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.profile.horizon)} / ${escapeHtml(item.profile.statusLabel)}</small>
              </span>
            `).join('') : '<span class="factor-role-empty">暂无因子</span>'}
          </div>
        </article>
      `;
    })
    .join('');
}

function renderFactorLibrary(summary, strategies, factorDefinitions, researchPipeline) {
  const meta = summary.factor_meta || {};
  const availability = meta.availability || {};
  const entries = buildLibraryEntries(summary, factorDefinitions);
  const pipelineMap = new Map((researchPipeline?.entries || []).map((entry) => [entry.factorId, entry]));
  const computed = entries.filter(([, value]) => value.status === 'computed');
  const unavailable = entries.filter(([, value]) => value.status !== 'computed');
  const kline = availability.kline_event_score || {};
  const scoredRules = kline.rules || [];
  const unscoredRules = kline.unscored_rules || [];

  elements.libraryRowCount.textContent = meta.rows ?? '-';
  elements.librarySourceKind.textContent = summary.input_kind || '未知输入';
  elements.librarySourceKind.title = fieldHint('input_kind', summary.input_kind);
  elements.libraryComputedCount.textContent = computed.length;
  elements.libraryUnavailableCount.textContent = unavailable.length;
  elements.libraryKlineRuleCount.textContent = `${scoredRules.length}/${unscoredRules.length}`;
  elements.librarySourceFile.textContent = summary.source_file
    ? `当前数据源：${summary.source_file}`
    : '当前数据源：未加载';
  elements.librarySourceFile.title = summary.source_file ? fieldHint('source_file', summary.source_file) : '';
  renderFactorRolePools(entries, researchPipeline);

  elements.factorLibraryTable.innerHTML = entries
    .map(([id, value]) => {
      const [label, tone] = labelForStatus(value.status);
      const category = categoryNames[value.category] || value.category || '真实计算';
      const source = value.dataSource ? `来源：${value.dataSource}` : '';
      const pipelineEntry = pipelineMap.get(id) || pipelineMap.get(value.definitionId) || null;
      const profile = factorLibraryProfile(id, value, pipelineEntry);
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
            <br><small>${explainable(id, 'factor_id')}</small>
            <br><small>${escapeHtml(category)}${source ? ` / ${explainable(value.dataSource, 'data_source')}` : ''}</small>
          </td>
          <td>
            <span class="tag ${escapeHtml(profile.tone)}">${escapeHtml(profile.type)}</span>
            <br><small>${escapeHtml(profile.usage)}</small>
          </td>
          <td><strong>${escapeHtml(profile.horizon)}</strong></td>
          <td>
            <span class="tag ${escapeHtml(profile.statusTone || tone)}">${escapeHtml(profile.statusLabel || label)}</span>
            <br><small>${escapeHtml(profile.evidence)}</small>
          </td>
          <td>
            <span>${escapeHtml(note)}</span>
            ${value.usage ? `<br><small>${escapeHtml(value.usage)}</small>` : ''}
            <details class="library-detail">
              <summary>字段/口径</summary>
              <small>${explainFieldList(fields)}</small>
            </details>
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
          <td><strong>${escapeHtml(rule.name)}</strong><br><small>${explainable(rule.id, 'factor_id')}</small></td>
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

function renderTextList(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '<span>-</span>';
  return `<ul class="compact-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function factorItemId(item) {
  return typeof item === 'string' ? item : item.factorId;
}

function factorItemName(item) {
  return typeof item === 'string' ? factorDisplayName(item) : item.name || factorDisplayName(item.factorId);
}

function renderBacktestValue(value, type = 'number') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  if (type === 'percent') return formatPercent(value, 2);
  return formatNumber(value, 4);
}

function renderFactorBacktestDetail(item, strategyId) {
  if (typeof item === 'string') return '';
  const panelId = `${strategyId}-${item.factorId}-backtest`;
  const [statusLabel, statusTone] = labelForStatus(item.status);
  const rows = item.detail || [];
  return `
    <div id="${escapeHtml(panelId)}" class="factor-backtest-detail" hidden>
      <div class="factor-backtest-summary">
        <strong>${escapeHtml(factorItemName(item))}</strong>
        <span class="tag ${statusTone}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="strategy-columns three compact-columns">
        <div>
          <strong>策略角色</strong>
          <span>${escapeHtml(item.role || '-')}</span>
        </div>
        <div>
          <strong>最佳周期</strong>
          <span>${item.bestHorizon ? `${escapeHtml(item.bestHorizon)}日` : '待测'}</span>
        </div>
        <div>
          <strong>证据口径</strong>
          <span>${escapeHtml(item.evidence || '-')}</span>
        </div>
      </div>
      <table class="mini-table">
        <thead>
          <tr>
            <th>周期</th>
            <th>排序有效度</th>
            <th>稳定性参考</th>
            <th>好坏组差距</th>
            <th>赚钱次数占比</th>
            <th>样本日</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.horizon)}日${row.isReferenceOnly ? ' / 参考' : ''}</td>
              <td>${renderBacktestValue(row.rankIc)}</td>
              <td>${renderBacktestValue(row.rankIcT)}</td>
              <td>${renderBacktestValue(row.longShort, 'percent')}</td>
              <td>${renderBacktestValue(row.positiveRatio, 'percent')}</td>
              <td>${escapeHtml(row.sampleDates ?? '-')}</td>
            </tr>
          `).join('') : '<tr><td colspan="6">暂无真实回测明细。</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderFactorChips(items, strategyId = 'strategy') {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '<span>-</span>';
  return `
    <div class="factor-chip-list">
      ${list.map((item) => {
        const factorId = factorItemId(item);
        const panelId = `${strategyId}-${factorId}-backtest`;
        const label = typeof item === 'string'
          ? factorDisplayName(item)
          : item.bestHorizon
            ? `${factorItemName(item)} / ${item.bestHorizon}日`
            : `${factorItemName(item)} / 待测`;
        const subLabel = typeof item === 'string'
          ? ''
          : `${item.role || '因子'}${item.weight === null || item.weight === undefined ? '' : ` / 权重 ${item.weight}`}`;
        return `
          <button class="factor-chip strategy-factor-button" type="button" data-factor-panel="${escapeHtml(panelId)}">
            <span>${escapeHtml(label)}</span>
            ${subLabel ? `<small>${explainable(factorId, 'factor_id')} / ${escapeHtml(subLabel)}</small>` : ''}
          </button>
        `;
      }).join('')}
    </div>
    ${list.map((item) => renderFactorBacktestDetail(item, strategyId)).join('')}
  `;
}

function toneForAction(actionTone) {
  if (actionTone === 'good') return 'good';
  if (actionTone === 'watch') return 'watch';
  if (actionTone === 'pending') return 'pending';
  return 'neutral';
}

function renderStrategyCard(strategy, options = {}) {
  const [label, tone] = labelForStatus(strategy.status);
  const compactClass = options.compact ? ' compact-strategy-item' : '';
  const exportBase = `/strategy-api/joinquant-strategy-export.json?strategy=${encodeURIComponent(strategy.id)}`;
  const exportCsv = `/strategy-api/joinquant-strategy-export.csv?strategy=${encodeURIComponent(strategy.id)}`;
  const exportScript = `/strategy-api/joinquant-strategy-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const historicalScript = `/strategy-api/joinquant-strategy-historical-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const volatilityRegimeScript = `/strategy-api/joinquant-volatility-regime-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const marketCapScript = `/strategy-api/joinquant-market-cap-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const volatilitySizeScript = `/strategy-api/joinquant-volatility-size-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const tradingBacktestScript = `/strategy-api/joinquant-trading-backtest-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const paperSignalJson = `/strategy-api/paper-signal-export.json?strategy=${encodeURIComponent(strategy.id)}`;
  const paperSignalCsv = `/strategy-api/paper-signal-export.csv?strategy=${encodeURIComponent(strategy.id)}`;
  const paperSignalZip = `/strategy-api/paper-signal-export.zip?strategy=${encodeURIComponent(strategy.id)}`;
  const canSendToStress = strategy.canSendToPositionStress || strategy.positionStressReady;
  return `
    <article class="strategy-item${compactClass}">
      <div class="strategy-head">
        <div>
          <h3>${escapeHtml(strategy.name)}</h3>
          <small>${explainable(strategy.id, 'strategy_id')}</small>
          <p>${escapeHtml(strategy.objective)}</p>
          <p>${escapeHtml(strategy.validationState || '')}</p>
        </div>
        <div class="strategy-status-stack">
          <span class="tag ${tone}">${escapeHtml(label)}</span>
          <span class="tag neutral">${escapeHtml(strategy.displayGrade || strategyGradeLabel(strategy))}</span>
        </div>
      </div>
      <div class="strategy-columns three strategy-summary">
        <div>
          <strong>角色</strong>
          <span>${escapeHtml(strategy.role)}${strategy.sourcePoolLabel ? ` / ${escapeHtml(strategy.sourcePoolLabel)}` : ''}</span>
        </div>
        <div>
          <strong>信号 / 候选</strong>
          <span>${escapeHtml(strategy.computedSignalCount ?? 0)} / ${escapeHtml(strategy.candidateCount ?? 0)}</span>
        </div>
        <div>
          <strong>数据基础</strong>
          <span>${escapeHtml(strategy.dataBasis || '-')}</span>
        </div>
      </div>
      <div class="strategy-rule-grid">
        <div>
          <strong>使用因子</strong>
          ${renderFactorChips(strategy.factorState, strategy.id)}
        </div>
        <div>
          <strong>入池规则</strong>
          ${renderTextList(strategy.entryRules)}
        </div>
        <div>
          <strong>风控过滤</strong>
          ${renderTextList(strategy.riskFilters || strategy.riskControls)}
        </div>
        <div>
          <strong>组合规则</strong>
          ${renderTextList(strategy.portfolioRules)}
        </div>
      </div>
      <div class="strategy-formula">
        <strong>排序公式</strong>
        <span>${escapeHtml(strategy.rankingFormula || strategy.formula || '-')}</span>
      </div>
      <div class="strategy-next-action">
        <strong>下一步</strong>
        <span>${escapeHtml(strategy.nextAction || strategy.exportStatus || '-')}</span>
      </div>
      ${strategy.exportable === false
        ? `<div class="strategy-export-note">
          <strong>导出状态</strong>
          <span>${escapeHtml(strategy.exportStatus || '该策略路线等待专用 JoinQuant 重建脚本，不提供通用导出。')}</span>
          ${strategy.specialBacktestScriptEndpoint ? `
            <div class="strategy-export-actions inline-actions">
              <button type="button" data-strategy-download="${escapeHtml(strategy.specialBacktestScriptEndpoint)}">聚宽实测脚本</button>
            </div>
          ` : ''}
        </div>`
        : `<div class="strategy-export-actions">
          ${canSendToStress ? `<button class="primary-lite" type="button" data-position-stress-strategy="${escapeHtml(strategy.id)}">选为压测策略</button>` : ''}
          <button type="button" data-strategy-download="${escapeHtml(exportBase)}">路线JSON</button>
          <button type="button" data-strategy-download="${escapeHtml(exportCsv)}">策略CSV</button>
          <button type="button" data-strategy-download="${escapeHtml(exportScript)}">聚宽脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(historicalScript)}">历史脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(volatilityRegimeScript)}">波动率脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(marketCapScript)}">市值脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(volatilitySizeScript)}">交叉脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(tradingBacktestScript)}">回测脚本</button>
        </div>`}
      ${strategy.exportable === false && canSendToStress ? `
        <div class="strategy-export-actions inline-actions">
          <button class="primary-lite" type="button" data-position-stress-strategy="${escapeHtml(strategy.id)}">选为压测策略</button>
        </div>
      ` : ''}
    </article>
  `;
}

function strategySearchText(strategy) {
  return [
    strategy.name,
    strategy.objective,
    strategy.validationState,
    strategy.role,
    strategy.status,
    ...(strategy.factorState || []).map((factor) => [
      factorItemId(factor),
      factorItemName(factor),
      typeof factor === 'string' ? '' : factor.role,
      typeof factor === 'string' ? '' : factor.bestHorizon,
    ].join(' ')),
    ...(strategy.entryRules || []),
  ].join(' ').toLowerCase();
}

const strategyGradeMeta = {
  all: { label: '全部', description: '策略池全量路线' },
  paper_watch: { label: '准模拟盘', description: '可进入或接近模拟观察' },
  backtested: { label: '已实测', description: '已有真实策略级回测' },
  candidate: { label: '候选/待测', description: '已有逻辑但证据未满' },
  blocked: { label: '暂缓/阻塞', description: '当前不建议使用' },
};

function strategyGradeKey(strategy) {
  const status = strategy.status || '';
  if (status === 'paper_trade_candidate') return 'paper_watch';
  if (status === 'real_strategy_backtested' || status === 'real_position_overlay_backtested') return 'backtested';
  if (
    status === 'hold'
    || status === 'joinquant_review_not_passed'
    || status === 'requires_more_data'
    || status === 'requires_joinquant_or_history'
    || status === 'blocked_by_factor_screen'
    || status === 'insufficient_history'
    || status === 'blocked_by_resonance_history'
  ) {
    return 'blocked';
  }
  return 'candidate';
}

function strategyGradeRank(strategy) {
  const rank = {
    paper_watch: 0,
    backtested: 1,
    candidate: 2,
    blocked: 3,
  };
  return rank[strategyGradeKey(strategy)] ?? 9;
}

function strategyGradeLabel(strategy) {
  return strategyGradeMeta[strategyGradeKey(strategy)]?.label || '候选/待测';
}

function buildUnifiedStrategies(signalPack) {
  const stressReady = new Set((currentPositionStressCatalog?.strategies || [])
    .filter((item) => item.runnable)
    .map((item) => item.strategyId));
  const map = new Map();
  (signalPack.formalStrategies || []).forEach((strategy) => {
    map.set(strategy.id, { ...strategy, sourcePoolLabel: '高等级证据', displayGrade: strategyGradeLabel(strategy), canSendToPositionStress: stressReady.has(strategy.id) });
  });
  (signalPack.strategies || []).forEach((strategy) => {
    if (!map.has(strategy.id)) {
      map.set(strategy.id, { ...strategy, sourcePoolLabel: '研究路线', displayGrade: strategyGradeLabel(strategy), canSendToPositionStress: stressReady.has(strategy.id) });
    }
  });
  return [...map.values()].sort((left, right) => {
    const gradeDelta = strategyGradeRank(left) - strategyGradeRank(right);
    if (gradeDelta) return gradeDelta;
    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN');
  });
}

function filteredDraftStrategies(strategies) {
  const query = draftStrategyQuery.trim().toLowerCase();
  return strategies.filter((strategy) => {
    const matchesGrade = draftStrategyGrade === 'all' || strategyGradeKey(strategy) === draftStrategyGrade;
    const matchesQuery = !query || strategySearchText(strategy).includes(query);
    return matchesGrade && matchesQuery;
  });
}

function filteredFormalStrategies(strategies) {
  const query = formalStrategyQuery.trim().toLowerCase();
  if (!query) return strategies;
  return strategies.filter((strategy) => strategySearchText(strategy).includes(query));
}

function syncDraftStrategyJump(strategies) {
  const selected = elements.draftStrategyJump.value;
  elements.draftStrategyJump.innerHTML = [
    '<option value="">全部策略</option>',
    ...strategies.map((strategy) => `<option value="${escapeHtml(strategy.id)}" title="${escapeHtml(fieldHint('strategy_id', strategy.id))}">${escapeHtml(strategy.displayGrade || strategyGradeLabel(strategy))} · ${escapeHtml(strategy.name)}</option>`),
  ].join('');
  if (strategies.some((strategy) => strategy.id === selected)) {
    elements.draftStrategyJump.value = selected;
  }
}

function renderStrategyLevelIndex(strategies) {
  if (!elements.strategyLevelIndex) return;
  const counts = strategies.reduce((acc, strategy) => {
    const key = strategyGradeKey(strategy);
    acc[key] = (acc[key] || 0) + 1;
    acc.all += 1;
    return acc;
  }, { all: 0, paper_watch: 0, backtested: 0, candidate: 0, blocked: 0 });
  elements.strategyLevelIndex.innerHTML = Object.entries(strategyGradeMeta).map(([key, meta]) => `
    <button class="${draftStrategyGrade === key ? 'active' : ''}" type="button" data-strategy-grade="${escapeHtml(key)}">
      <span>${escapeHtml(meta.label)}</span>
      <strong>${counts[key] || 0}</strong>
      <small>${escapeHtml(meta.description)}</small>
    </button>
  `).join('');
}

function syncFormalStrategyJump(strategies) {
  if (!elements.formalStrategyJump) return;
  const selected = elements.formalStrategyJump.value;
  elements.formalStrategyJump.innerHTML = [
    '<option value="">全部正式策略</option>',
    ...strategies.map((strategy) => `<option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.name)}</option>`),
  ].join('');
  if (strategies.some((strategy) => strategy.id === selected)) {
    elements.formalStrategyJump.value = selected;
  }
}

function renderDraftStrategies(signalPack) {
  const strategies = buildUnifiedStrategies(signalPack);
  renderStrategyLevelIndex(strategies);
  syncDraftStrategyJump(strategies);

  const filtered = filteredDraftStrategies(strategies);
  const pageSize = draftStrategyExpanded ? 4 : 2;
  const pageCount = draftStrategyExpanded ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  draftStrategyPage = Math.min(Math.max(1, draftStrategyPage), pageCount);
  const visibleStrategies = draftStrategyExpanded
    ? filtered.slice((draftStrategyPage - 1) * pageSize, draftStrategyPage * pageSize)
    : filtered.slice(0, pageSize);

  elements.strategyLiveList.innerHTML = visibleStrategies.length
    ? visibleStrategies.map((strategy) => renderStrategyCard(strategy)).join('')
    : '<div class="empty-state"><strong>没有匹配的策略</strong><span>换一个等级、策略名、因子名、状态或周期再筛选。</span></div>';

  const hiddenCount = Math.max(0, filtered.length - visibleStrategies.length);
  elements.draftStrategyToggle.textContent = filtered.length <= 2
    ? '已全部显示'
    : draftStrategyExpanded
      ? '收起'
      : `展开其余 ${hiddenCount} 个`;
  elements.draftStrategyToggle.disabled = filtered.length <= 2;

  if (draftStrategyExpanded && filtered.length > 4) {
    elements.draftStrategyPagination.innerHTML = `
      <button type="button" data-draft-page="prev" ${draftStrategyPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${draftStrategyPage} / ${pageCount} 页</span>
      <button type="button" data-draft-page="next" ${draftStrategyPage >= pageCount ? 'disabled' : ''}>下一页</button>
    `;
  } else {
    elements.draftStrategyPagination.innerHTML = '';
  }
}

function renderFormalStrategies(signalPack) {
  const formalStrategies = signalPack.formalStrategies || [];
  const metrics = signalPack.metrics || {};
  currentStrategySignalPack = signalPack;
  elements.strategyStrongCount.textContent = metrics.draftStrategies ?? (signalPack.strategies || []).length;
  elements.strategyObservationCount.textContent = metrics.entryCandidates ?? '-';
  elements.strategyPartialCount.textContent = metrics.capitalCandidates ?? metrics.partialStrategies ?? '-';
  elements.strategyBlockedCount.textContent = metrics.formalStrategies ?? formalStrategies.length;
  elements.strategySourceFile.textContent = signalPack.source?.file
    ? `当前策略数据源：${signalPack.source.file}；技术截面 ${signalPack.source.primaryRows ?? 0} 条，资金截面 ${signalPack.source.capitalRows ?? 0} 条`
    : '当前策略数据源：未加载';
  elements.strategySourceFile.title = signalPack.source?.file ? fieldHint('source_file', signalPack.source.file) : '';

  renderDraftStrategies(signalPack);
  const formalPolicy = signalPack.formalPolicy || {};
  syncFormalStrategyJump(formalStrategies);

  elements.formalStrategyPolicy.textContent = formalPolicy.description || '正式策略池只接收已完成策略级回测的组合。';

  if (!formalStrategies.length) {
    elements.formalStrategyList.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(formalPolicy.title || '暂无正式策略')}</strong>
        <span>${escapeHtml(formalPolicy.nextAction || '等待策略级回测结果。')}</span>
        ${renderTextList(formalPolicy.requiredEvidence)}
      </div>
    `;
    if (elements.formalStrategyPagination) elements.formalStrategyPagination.innerHTML = '';
    if (elements.formalStrategyToggle) {
      elements.formalStrategyToggle.textContent = '暂无策略';
      elements.formalStrategyToggle.disabled = true;
    }
    return;
  }

  const filtered = filteredFormalStrategies(formalStrategies);
  const pageSize = formalStrategyExpanded ? 4 : 2;
  const pageCount = formalStrategyExpanded ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  formalStrategyPage = Math.min(Math.max(1, formalStrategyPage), pageCount);
  const visibleStrategies = formalStrategyExpanded
    ? filtered.slice((formalStrategyPage - 1) * pageSize, formalStrategyPage * pageSize)
    : filtered.slice(0, pageSize);

  elements.formalStrategyList.innerHTML = visibleStrategies.length
    ? visibleStrategies.map((strategy) => renderStrategyCard(strategy, { compact: true })).join('')
    : '<div class="empty-state"><strong>没有匹配的正式策略</strong><span>换一个策略名、因子名、状态或周期再筛选。</span></div>';

  const hiddenCount = Math.max(0, filtered.length - visibleStrategies.length);
  if (elements.formalStrategyToggle) {
    elements.formalStrategyToggle.textContent = filtered.length <= 2
      ? '已全部显示'
      : formalStrategyExpanded
        ? '收起'
        : `展开其余 ${hiddenCount} 个`;
    elements.formalStrategyToggle.disabled = filtered.length <= 2;
  }

  if (elements.formalStrategyPagination) {
    if (formalStrategyExpanded && filtered.length > 4) {
      elements.formalStrategyPagination.innerHTML = `
        <button type="button" data-formal-page="prev" ${formalStrategyPage <= 1 ? 'disabled' : ''}>上一页</button>
        <span>第 ${formalStrategyPage} / ${pageCount} 页</span>
        <button type="button" data-formal-page="next" ${formalStrategyPage >= pageCount ? 'disabled' : ''}>下一页</button>
      `;
    } else {
      elements.formalStrategyPagination.innerHTML = '';
    }
  }
}

function renderLiveStrategies(signalPack) {
  const metrics = signalPack.metrics || {};
  const formalStrategies = signalPack.formalStrategies || [];
  const unifiedStrategies = buildUnifiedStrategies(signalPack);
  currentStrategySignalPack = signalPack;
  elements.strategyStrongCount.textContent = unifiedStrategies.length;
  elements.strategyObservationCount.textContent = metrics.entryCandidates ?? '-';
  elements.strategyPartialCount.textContent = metrics.capitalCandidates ?? metrics.partialStrategies ?? '-';
  elements.strategyBlockedCount.textContent = unifiedStrategies.filter((strategy) => (
    strategyGradeKey(strategy) === 'paper_watch' || strategyGradeKey(strategy) === 'backtested'
  )).length || (metrics.formalStrategies ?? formalStrategies.length);
  elements.strategySourceFile.textContent = signalPack.source?.file
    ? `当前策略数据源：${signalPack.source.file}；技术截面 ${signalPack.source.primaryRows ?? 0} 条，资金截面 ${signalPack.source.capitalRows ?? 0} 条`
    : '当前策略数据源：未加载';

  renderDraftStrategies(signalPack);

  elements.strategyCandidateTable.innerHTML = (signalPack.candidates || [])
    .map((row) => {
      const tone = toneForAction(row.actionTone);
      return `
        <tr title="${escapeHtml(row.reason)}">
          <td><strong>${escapeHtml(row.strategyName || '-')}</strong><br><small>${escapeHtml(row.signalDate || '-')}</small></td>
          <td>${escapeHtml(String(row.code).padStart(6, '0'))} ${escapeHtml(row.name)}</td>
          <td>${formatNumber(row.decisionScore, 3)}</td>
          <td>${formatNumber(row.trend ?? row.capitalFollow, 2)}</td>
          <td>${formatNumber(row.volumePrice ?? row.capitalAp, 2)}</td>
          <td>${formatNumber(row.crowdingRisk ?? row.capitalOverheat, 2)}</td>
          <td>${formatNumber(row.divergenceRisk ?? row.capitalPersistence, 2)}</td>
          <td>${formatNumber(row.warningCount ?? row.capitalSourceCount, 0)}</td>
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
          ${item.nextAction ? `<span>下一步：${escapeHtml(item.nextAction)}</span>` : ''}
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
  elements.backtestSourceFile.title = source.file ? fieldHint('source_file', source.file) : '';

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

  const importedResults = status.importedResults || [];
  const factorResults = importedResults.filter((result) => !isStrategyBacktestResult(result));
  const strategyResults = flattenStrategyResults(importedResults);
  renderBacktestResultSummary(factorResults);
  renderStrategyResultSummary(strategyResults);

  const importedFactorResults = importedResults.filter((result) => !isStrategyBacktestResult(result));
  const importedStrategyResults = importedResults.filter(isStrategyBacktestResult);
  const renderImportedGroup = (title, rows, renderRow, emptyText) => `
    <div class="library-source"><strong>${escapeHtml(title)}</strong></div>
    ${rows.length ? rows.map(renderRow).join('') : `<div class="library-source">${escapeHtml(emptyText)}</div>`}
  `;
  elements.importedBacktestList.innerHTML = importedResults.length
    ? [
      renderImportedGroup('因子回测结果', importedFactorResults, (result) => {
        const factor = resultFactorId(result);
        const title = result.factor_display_name || factorDisplayName(factor);
        const detail = `排序有效度：${escapeHtml(result.rank_ic_mean ?? result.rankIc ?? '-')} / 好坏组差距：${formatPercent(result.long_short_mean ?? result.longShort)} / 来源：${escapeHtml(plainSource(result.source || 'joinquant'))}`;
        return `
          <div class="status-item">
            <div>
              <strong>${escapeHtml(title)}</strong>
              <span>${detail}</span>
            </div>
            <span class="tag pending">因子</span>
          </div>
        `;
      }, '暂无因子回测导入结果。'),
      renderImportedGroup('策略回测结果', importedStrategyResults, (result) => {
        const title = result.strategy_name || result.summary?.[0]?.strategy_name || '策略实测结果';
        const detail = `策略检查结果：${escapeHtml(result.summary?.length ?? 1)} 条 / 来源：${escapeHtml(plainSource(result.source || result.summary?.[0]?.source || 'joinquant'))}`;
        return `
          <div class="status-item">
            <div>
              <strong>${escapeHtml(title)}</strong>
              <span>${detail}</span>
            </div>
            <span class="tag good">策略</span>
          </div>
        `;
      }, '暂无策略回测导入结果。'),
    ].join('')
    : '<div class="library-source">暂无导入结果。等你在 JoinQuant 跑完，把真实结果 JSON 粘贴回来。</div>';
}

function positionStressKlineRows(item) {
  const rows = (item?.rows || [])
    .filter((row) => Number.isFinite(Number(row.high)) && Number.isFinite(Number(row.low)))
    .map((row) => ({
      ...row,
      amount: Number(row.amount),
      close: Number(row.close),
      high: Number(row.high),
      low: Number(row.low),
      open: Number(row.open),
      volume: Number(row.volume),
    }));
  if (positionStressKlinePeriod === 'daily') return rows;
  const buckets = new Map();
  rows.forEach((row) => {
    const key = positionStressKlinePeriod === 'yearly' ? String(row.date || '').slice(0, 4) : String(row.date || '').slice(0, 7);
    if (!key) return;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        ...row,
        amount: Number.isFinite(row.amount) ? row.amount : 0,
        date: key,
        high: row.high,
        low: row.low,
        volume: Number.isFinite(row.volume) ? row.volume : 0,
      });
      return;
    }
    current.close = row.close;
    current.high = Math.max(current.high, row.high);
    current.low = Math.min(current.low, row.low);
    current.volume += Number.isFinite(row.volume) ? row.volume : 0;
    current.amount += Number.isFinite(row.amount) ? row.amount : 0;
    current.strategy_score = row.strategy_score;
  });
  return [...buckets.values()];
}

function movingAverage(rows, windowSize) {
  return rows.map((_, index) => {
    if (index + 1 < windowSize) return null;
    const slice = rows.slice(index + 1 - windowSize, index + 1);
    return slice.reduce((sum, row) => sum + row.close, 0) / windowSize;
  });
}

function fitPositionStressKlineView(rows, force = false) {
  const maxCount = positionStressKlinePeriod === 'yearly' ? 12 : positionStressKlinePeriod === 'monthly' ? 36 : 90;
  const minCount = positionStressKlinePeriod === 'yearly' ? 2 : positionStressKlinePeriod === 'monthly' ? 6 : 18;
  const desired = Math.min(maxCount, Math.max(minCount, rows.length));
  if (force || !positionStressKlineView.count || positionStressKlineView.count > rows.length) {
    positionStressKlineView.count = desired;
    positionStressKlineView.start = Math.max(0, rows.length - desired);
  }
  positionStressKlineView.count = Math.min(Math.max(positionStressKlineView.count, minCount), Math.max(rows.length, minCount));
  positionStressKlineView.start = Math.min(Math.max(0, positionStressKlineView.start), Math.max(0, rows.length - positionStressKlineView.count));
}

function activePositionStressKlineItem() {
  const report = currentPositionStressReport || {};
  const klineItems = report.kline || [];
  return klineItems.find((item) => item.code === elements.positionStressKlineSelect?.value) || klineItems[0];
}

function setPositionStressKlineNote(message, tone = 'success') {
  if (!elements.positionStressKlineNote || !message) return;
  elements.positionStressKlineNote.textContent = message;
  elements.positionStressKlineNote.dataset.tone = tone;
}

function positionStressKlineDefaultNote(report = currentPositionStressReport) {
  const klineItems = report?.kline || [];
  const complete = Boolean(report?.complete || report?.runGate?.formalRunAllowed);
  const latestSelection = (report?.strategy?.dailySelections || []).at(-1);
  const selectedCount = latestSelection?.selectedCount ?? report?.strategy?.parameters?.topN ?? klineItems.length;
  return complete
    ? `展示最新调仓日入选股票 K 线：${klineItems.length}/${selectedCount} 只；也可搜索本地缓存中的任意股票。`
    : `展示当前已落地的最新入选股票 K 线：${klineItems.length}/${selectedCount} 只；也可搜索本地缓存中的任意股票。`;
}

function ensurePositionStressKlineItem(item) {
  if (!item?.code || !currentPositionStressReport) return;
  const klineItems = currentPositionStressReport.kline || [];
  const index = klineItems.findIndex((candidate) => candidate.code === item.code);
  if (index >= 0) {
    klineItems[index] = { ...klineItems[index], ...item };
  } else {
    klineItems.push({ ...item, fromLocalCache: true });
  }
  currentPositionStressReport.kline = klineItems;
  if (elements.positionStressKlineSelect && ![...elements.positionStressKlineSelect.options].some((option) => option.value === item.code)) {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = `${klineItems.length}. ${item.name || item.code} ${item.code} 本地缓存`;
    elements.positionStressKlineSelect.append(option);
  }
}

function positionStressKlineSearchText(item, index) {
  return [
    String(index + 1),
    item?.code,
    item?.security,
    item?.name,
  ].filter(Boolean).join(' ').toLowerCase();
}

function findPositionStressKlineItem(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return null;
  const klineItems = currentPositionStressReport?.kline || [];
  const numericIndex = /^\d+$/.test(term) ? Number(term) - 1 : -1;
  if (numericIndex >= 0 && numericIndex < klineItems.length) {
    return klineItems[numericIndex];
  }
  return klineItems.find((item, index) => positionStressKlineSearchText(item, index).includes(term)) || null;
}

function selectPositionStressKlineItem(item, options = {}) {
  if (!item || !elements.positionStressKlineSelect) return;
  ensurePositionStressKlineItem(item);
  elements.positionStressKlineSelect.value = item.code;
  if (options.syncSearch && elements.positionStressKlineSearch) {
    const klineItems = currentPositionStressReport?.kline || [];
    const index = klineItems.findIndex((candidate) => candidate.code === item.code);
    elements.positionStressKlineSearch.value = index >= 0 ? `${index + 1}. ${item.name || item.code}` : (item.name || item.code || '');
  }
  positionStressKlineView.hoverIndex = null;
  elements.positionStressKlineTooltip.hidden = true;
  refreshPositionStressKline({ resetView: options.resetView });
  if (options.note) setPositionStressKlineNote(options.note, options.noteTone || 'success');
}

async function searchPositionStressKlineCache(query) {
  const term = String(query || '').trim();
  if (!term) return null;
  const params = new URLSearchParams({ q: term });
  try {
    return await request(`/position-stress-api/kline-search?${params.toString()}`);
  } catch (error) {
    return null;
  }
}

async function handlePositionStressKlineSearch(query) {
  const requestId = ++positionStressKlineSearchRequestId;
  const item = findPositionStressKlineItem(query);
  if (item) {
    selectPositionStressKlineItem(item, { resetView: true });
    setPositionStressKlineNote(positionStressKlineDefaultNote(), 'success');
    return;
  }
  const term = String(query || '').trim();
  if (term.length < 2) {
    setPositionStressKlineNote(positionStressKlineDefaultNote(), 'success');
    return;
  }
  setPositionStressKlineNote('当前策略名单未命中，正在查找本地全市场行情缓存...', 'success');
  const response = await searchPositionStressKlineCache(term);
  if (requestId !== positionStressKlineSearchRequestId) return;
  if (response?.item) {
    selectPositionStressKlineItem(response.item, {
      note: response.message || `已从本地行情缓存加载 ${response.item.name || response.item.code}。`,
      resetView: true,
      syncSearch: true,
    });
    return;
  }
  setPositionStressKlineNote(`当前策略名单和本地行情缓存都没有命中：${term}`, 'error');
}

function drawPositionStressKline(item, options = {}) {
  const canvas = elements.positionStressKlineCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(760, Math.floor(rect.width || canvas.clientWidth || 1280));
  const cssHeight = Math.max(480, Math.floor(rect.height || 520));
  if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = cssWidth;
  const height = cssHeight;
  const rows = positionStressKlineRows(item);
  fitPositionStressKlineView(rows, options.resetView);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (!rows.length) {
    ctx.fillStyle = '#607086';
    ctx.font = '16px sans-serif';
    ctx.fillText('暂无K线数据', 48, height / 2);
    return;
  }

  const leftPad = 58;
  const rightPad = 72;
  const topPad = 36;
  const bottomPad = 34;
  const volumeHeight = 90;
  const gap = 16;
  const chartWidth = width - leftPad - rightPad;
  const priceHeight = height - topPad - bottomPad - volumeHeight - gap;
  const volumeTop = topPad + priceHeight + gap;
  const start = Math.floor(positionStressKlineView.start);
  const count = Math.min(Math.floor(positionStressKlineView.count), rows.length);
  const visible = rows.slice(start, start + count);
  const ma5 = movingAverage(rows, 5);
  const ma20 = movingAverage(rows, 20);
  const highs = visible.map((row) => row.high);
  const lows = visible.map((row) => row.low);
  const maVisible = [...ma5.slice(start, start + count), ...ma20.slice(start, start + count)].filter((value) => Number.isFinite(value));
  if (maVisible.length) {
    highs.push(Math.max(...maVisible));
    lows.push(Math.min(...maVisible));
  }
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const span = Math.max(maxPrice - minPrice, 0.01);
  const paddedMax = maxPrice + span * 0.10;
  const paddedMin = minPrice - span * 0.10;
  const paddedSpan = Math.max(paddedMax - paddedMin, 0.01);
  const maxVolume = Math.max(...visible.map((row) => Number.isFinite(row.volume) ? row.volume : 0), 1);

  function y(price) {
    return topPad + ((paddedMax - price) / paddedSpan) * priceHeight;
  }

  function x(index) {
    const slot = chartWidth / Math.max(visible.length, 1);
    return leftPad + slot * index + slot / 2;
  }

  ctx.strokeStyle = '#d7e0ea';
  ctx.lineWidth = 1;
  ctx.font = '12px sans-serif';
  for (let i = 0; i <= 5; i += 1) {
    const yy = topPad + (priceHeight / 5) * i;
    const price = paddedMax - (paddedSpan / 5) * i;
    ctx.beginPath();
    ctx.moveTo(leftPad, yy);
    ctx.lineTo(width - rightPad, yy);
    ctx.stroke();
    ctx.fillStyle = '#607086';
    ctx.fillText(formatNumber(price, 2), width - rightPad + 10, yy + 4);
  }

  const firstOpen = visible[0]?.open;
  const latestClose = visible.at(-1)?.close;
  [firstOpen, latestClose].filter((value) => Number.isFinite(value)).forEach((value, index) => {
    const yy = y(value);
    ctx.strokeStyle = index === 0 ? '#95a3b5' : '#146eb4';
    ctx.setLineDash(index === 0 ? [6, 5] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(leftPad, yy);
    ctx.lineTo(width - rightPad, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = index === 0 ? '#607086' : '#146eb4';
    ctx.fillText(index === 0 ? `开盘 ${formatNumber(value, 2)}` : `最新 ${formatNumber(value, 2)}`, leftPad + 8, yy - 6);
  });

  const slot = chartWidth / Math.max(visible.length, 1);
  const candleWidth = Math.max(4, Math.min(18, slot * 0.58));

  function drawLine(values, color, label, labelX) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let moved = false;
    values.slice(start, start + count).forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const xx = x(index);
      const yy = y(value);
      if (!moved) {
        ctx.moveTo(xx, yy);
        moved = true;
      } else {
        ctx.lineTo(xx, yy);
      }
    });
    if (moved) ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, labelX, topPad - 12);
  }

  drawLine(ma5, '#e0a326', 'MA5', leftPad + 260);
  drawLine(ma20, '#6d5bd0', 'MA20', leftPad + 308);

  visible.forEach((row, index) => {
    const xx = x(index);
    const open = row.open;
    const close = row.close;
    const high = row.high;
    const low = row.low;
    const up = close >= open;
    const color = up ? '#d64b4b' : '#0f8b6f';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xx, y(high));
    ctx.lineTo(xx, y(low));
    ctx.stroke();
    const top = y(Math.max(open, close));
    const bottom = y(Math.min(open, close));
    ctx.fillStyle = up ? 'rgba(214, 75, 75, 0.82)' : '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.fillRect(xx - candleWidth / 2, top, candleWidth, Math.max(bottom - top, 2));
    ctx.strokeRect(xx - candleWidth / 2, top, candleWidth, Math.max(bottom - top, 2));

    const volumeBarHeight = ((Number.isFinite(row.volume) ? row.volume : 0) / maxVolume) * (volumeHeight - 18);
    ctx.fillStyle = up ? 'rgba(214, 75, 75, 0.45)' : 'rgba(15, 139, 111, 0.45)';
    ctx.fillRect(xx - candleWidth / 2, volumeTop + volumeHeight - volumeBarHeight, candleWidth, volumeBarHeight);
  });

  const highRow = visible.reduce((best, row, index) => (row.high > best.row.high ? { row, index } : best), { row: visible[0], index: 0 });
  const lowRow = visible.reduce((best, row, index) => (row.low < best.row.low ? { row, index } : best), { row: visible[0], index: 0 });
  ctx.fillStyle = '#162033';
  ctx.font = '12px sans-serif';
  ctx.fillText(`高 ${formatNumber(highRow.row.high, 2)}`, x(highRow.index) + 6, y(highRow.row.high) - 6);
  ctx.fillText(`低 ${formatNumber(lowRow.row.low, 2)}`, x(lowRow.index) + 6, y(lowRow.row.low) + 16);

  ctx.strokeStyle = '#d7e0ea';
  ctx.beginPath();
  ctx.moveTo(leftPad, volumeTop);
  ctx.lineTo(width - rightPad, volumeTop);
  ctx.stroke();
  ctx.fillStyle = '#607086';
  ctx.fillText(`成交量 max ${formatNumber(maxVolume / 10000, 0)}万`, leftPad, volumeTop + 14);

  const tickEvery = Math.max(1, Math.ceil(visible.length / 8));
  visible.forEach((row, index) => {
    if (index % tickEvery !== 0 && index !== visible.length - 1) return;
    ctx.fillStyle = '#607086';
    ctx.fillText(positionStressKlinePeriod === 'daily' ? String(row.date).slice(5) : row.date, x(index) - 18, height - 12);
  });

  const hoverIndex = Number.isInteger(positionStressKlineView.hoverIndex) ? positionStressKlineView.hoverIndex : null;
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < visible.length) {
    const row = visible[hoverIndex];
    const xx = x(hoverIndex);
    ctx.strokeStyle = '#162033';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xx, topPad);
    ctx.lineTo(xx, volumeTop + volumeHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(leftPad, y(row.close));
    ctx.lineTo(width - rightPad, y(row.close));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = '#162033';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${item.name || item.code} ${item.code || ''}`, leftPad, 24);
  ctx.fillStyle = '#607086';
  ctx.font = '13px sans-serif';
  const periodLabel = positionStressKlinePeriod === 'yearly' ? '年K' : positionStressKlinePeriod === 'monthly' ? '月K' : '日K';
  ctx.fillText(`${periodLabel} ${visible.length}/${rows.length} 根 / 滚轮缩放 / 拖拽平移 / 策略分 ${formatNumber(item.latestScore, 4)}`, leftPad + 170, 24);
}

function formatAmountYi(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return `${formatNumber(number / 100000000, 2)}亿`;
}

function drawPositionStressEquity(curve = []) {
  const canvas = elements.positionStressEquityCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 42;
  const points = curve.filter((item) => Number.isFinite(Number(item.equity)));
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (!points.length) {
    ctx.fillStyle = '#607086';
    ctx.font = '15px sans-serif';
    ctx.fillText('暂无净值数据', padding, height / 2);
    return;
  }

  const values = points.map((item) => Number(item.equity));
  const min = Math.min(...values, 1);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, 0.01);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const paddedMin = min - span * 0.16;
  const paddedMax = max + span * 0.16;
  const paddedSpan = paddedMax - paddedMin;

  function point(value, index) {
    const x = padding + (chartWidth / Math.max(points.length - 1, 1)) * index;
    const y = padding + ((paddedMax - value) / paddedSpan) * chartHeight;
    return [x, y];
  }

  ctx.strokeStyle = '#d7e0ea';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const yy = padding + (chartHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, yy);
    ctx.lineTo(width - padding, yy);
    ctx.stroke();
  }

  const [baseX, baseY] = point(1, 0);
  ctx.strokeStyle = '#95a3b5';
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(width - padding, baseY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = '#146eb4';
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((item, index) => {
    const [x, y] = point(Number(item.equity), index);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((item, index) => {
    const [x, y] = point(Number(item.equity), index);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#146eb4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#607086';
    ctx.font = '12px sans-serif';
    ctx.fillText(String(item.date).slice(5), x - 16, height - 14);
  });

  ctx.fillStyle = '#162033';
  ctx.font = '15px sans-serif';
  ctx.fillText('组合净值', padding, 24);
  ctx.fillStyle = '#607086';
  ctx.font = '12px sans-serif';
  ctx.fillText(`起点 1.0000 / 终点 ${formatNumber(values.at(-1), 4)}`, padding + 76, 24);
}

function positionStressControlMismatches(report) {
  const mismatches = [];
  const dateRange = report?.requestedDateRange || {};
  const parameters = report?.strategy?.parameters || {};
  const start = elements.positionStressStart?.value || '';
  const end = elements.positionStressEnd?.value || '';
  const topN = Number(elements.positionStressTopN?.value || 0);
  const capital = Number(elements.positionStressCapital?.value || 0);
  const strategyId = currentPositionStressExplicitStrategyId || elements.positionStressStrategySelect?.value || '';
  if (start && dateRange.start && start !== dateRange.start) mismatches.push('开始日期');
  if (end && dateRange.end && end !== dateRange.end) mismatches.push('结束日期');
  if (Number.isFinite(topN) && topN > 0 && parameters.topN !== undefined && topN !== Number(parameters.topN)) mismatches.push('持仓数量');
  if (Number.isFinite(capital) && capital > 0 && parameters.capital !== undefined && capital !== Number(parameters.capital)) mismatches.push('初始资金');
  if (strategyId && report?.strategy?.id && strategyId !== report.strategy.id) mismatches.push('压测策略');
  return mismatches;
}
function positionStressCoverageLabel(mode) {
  const labels = {
    broad_pool_min_tradable: '宽股票池，按每日最低可交易样本覆盖',
    selected_codes_relaxed: '指定股票名单，放宽覆盖检查',
    auto_cache_all_relaxed: '全缓存全A，放宽覆盖检查',
    strict_pool_full_coverage: '核心股票池，要求严格全覆盖',
  };
  return labels[mode] || String(mode || '未标注').replaceAll('_', ' ');
}

function positionStressHistoryPoolLabel(item) {
  const size = Number(item?.universe?.size ?? item?.stockCount ?? 0);
  const source = String(item?.universe?.sourceFile || '').toLowerCase();
  if (size === 500 && source.includes('csi500_pool')) return '当前中证500专项';
  if (size === 3000 || source.includes('core_3000')) return '历史3000只核心池';
  if (size === 5578 || source.includes('auto_cache_all')) return '历史5578只全缓存全A';
  if (size) return `${size}只股票池`;
  return '股票池未标注';
}

function positionStressHistoryOptionLabel(item) {
  const range = item?.requestedDateRange || {};
  const dates = [range.start, range.end].filter(Boolean).join(' 至 ');
  const pool = positionStressHistoryPoolLabel(item);
  const status = item?.complete ? '完整' : (item?.status || '未完成');
  return `${pool} / ${dates || '日期未标注'} / ${item?.stockCount ?? '-'}只 / ${status}`;
}

function renderPositionStressHistory(history = []) {
  currentPositionStressHistory = Array.isArray(history) ? history : [];
  const historyMaxCount = Math.max(0, ...currentPositionStressHistory.map((item) => Number(item.stockCount || item.universe?.size || 0)));
  if (elements.positionStressHistoryMaxCount) elements.positionStressHistoryMaxCount.textContent = `历史最大覆盖：${historyMaxCount || '-'} 只`;
  const select = elements.positionStressHistorySelect;
  if (!select) return;
  const current = currentPositionStressReport || {};
  const currentPath = current.reportPath || '';
  const entries = [...currentPositionStressHistory];
  if (currentPath && !entries.some((item) => item.reportPath === currentPath)) {
    entries.unshift({
      complete: current.complete,
      coverage: { mode: current.coverage?.mode || '' },
      generatedAt: current.generatedAt || '',
      reportPath: currentPath,
      requestedDateRange: current.requestedDateRange || {},
      rowCount: current.rowCount,
      status: current.status,
      stockCount: current.stockCount,
      strategy: current.strategy || {},
      universe: current.universe || {},
    });
  }
  select.innerHTML = entries.length
    ? entries.map((item) => `<option value="${escapeHtml(item.reportPath || '')}">${escapeHtml(positionStressHistoryOptionLabel(item))}</option>`).join('')
    : '<option value="">暂无历史报告</option>';
  if (currentPath && entries.some((item) => item.reportPath === currentPath)) {
    select.value = currentPath;
  }
}


function renderPositionStressUniverseContext(report = {}) {
  if (!elements.positionStressUniverseContext) return;
  const universe = report.universe || {};
  const sourceFile = universe.sourceFile || report.artifacts?.universeFile || '未标注';
  const size = universe.size ?? report.stockCount ?? '-';
  const mode = report.coverage?.mode || '';
  const poolLabel = positionStressHistoryPoolLabel({ stockCount: report.stockCount, universe });
  const warning = Number(size) === 500 || String(sourceFile).toLowerCase().includes('csi500_pool')
    ? '当前最新报告是中证500专项池，股票数不代表全部历史压测。'
    : '历史压测应按报告标注的股票池口径比较，不能只看单个报告的股票数。';
  elements.positionStressUniverseContext.innerHTML = `
    <strong>当前口径：${escapeHtml(poolLabel)}</strong>
    <span>${escapeHtml(warning)}</span>
    <span>覆盖股票 ${escapeHtml(report.stockCount ?? '-')} 只 / 股票池规模 ${escapeHtml(size)} 只；股票池文件：${escapeHtml(sourceFile)}；覆盖模式：${escapeHtml(positionStressCoverageLabel(mode))}。</span>
    <span>历史版本包括3000只核心池和5578只全缓存全A（若存在），请通过上方选择器切换查看。</span>
  `;
}

function renderPositionStress(report) {
  if (!elements.positionStressComplete) return;
  currentPositionStressReport = report || {};
  renderPositionStressUniverseContext(currentPositionStressReport);
  const metrics = report?.strategy?.metrics || {};
  const parameters = report?.strategy?.parameters || {};
  const isConstrainedLiquidity = parameters.executionModel === 'constrained_liquidity' || metrics.executionModel === 'constrained_liquidity';
  const gate = report.runGate || {};
  const complete = Boolean(report.complete || gate.formalRunAllowed);
  const dateRange = report.requestedDateRange || {};
  const staleControls = positionStressControlMismatches(report);
  const controlsStale = staleControls.length > 0;
  const missingText = (report.missingDates || []).length ? `缺 ${report.missingDates.join(', ')}` : '日期完整';
  const statusTone = controlsStale ? 'pending' : complete ? 'good' : 'watch';

  elements.positionStressComplete.innerHTML = `<span class="tag ${statusTone}">${controlsStale ? '待重算' : complete ? '完整' : '缺数据'}</span>`;
  elements.positionStressDateRange.textContent = `${dateRange.start || '-'} 至 ${dateRange.end || '-'} / ${missingText}`;
  elements.positionStressStockCount.textContent = report.stockCount ?? '-';
  const reportTopN = Number(parameters.dailyTopN ?? parameters.topN ?? report.strategy?.dailyTopN ?? 0);
  const reportMaxHoldings = Number(parameters.maxHoldings ?? report.strategy?.maxHoldings ?? reportTopN);
  if (elements.positionStressTopN && reportTopN > 0) elements.positionStressTopN.value = reportTopN;
  if (elements.positionStressMaxHoldings && reportMaxHoldings > 0) elements.positionStressMaxHoldings.value = reportMaxHoldings;
  if (elements.positionStressTopN) elements.positionStressTopN.readOnly = true;
  if (elements.positionStressMaxHoldings) elements.positionStressMaxHoldings.readOnly = true;
  elements.positionStressRowCount.textContent = `${report.rowCount ?? 0} 行 / ${report.actualDates?.length ?? 0} 天`;
  elements.positionStressReturn.textContent = formatPercent(metrics.totalReturn, 2);
  elements.positionStressRunStatus.textContent = controlsStale ? '参数待重算' : isConstrainedLiquidity ? '真实成交约束' : report.strategy?.runStatus === 'complete_short_window' ? '短窗压测' : '仅链路预览';
  elements.positionStressDrawdown.textContent = formatPercent(metrics.maxDrawdown, 2);
  elements.positionStressTrades.textContent = `${metrics.tradeCount ?? 0} 笔 / ${metrics.simulatedReturnDays ?? 0} 天`;
  elements.positionStressMessage.textContent = controlsStale
    ? `参数已变更（${staleControls.join('、')}），点击运行重新计算。`
    : gate.reason || report.sourceMessage || '等待报告';
  elements.positionStressMessage.dataset.tone = controlsStale ? 'error' : complete ? 'success' : 'error';
  const reportFileText = report.reportPath ? `报告：${report.reportPath}` : '';
  elements.positionStressArtifacts.textContent = report.artifacts?.dailyCsv
    ? `行情文件：${report.artifacts.dailyCsv}${reportFileText ? ` / ${reportFileText}` : ''}`
    : reportFileText || '等待产物';
  elements.positionStressArtifacts.title = report.artifacts?.dailyCsv ? fieldHint('source_file', report.artifacts.dailyCsv) : '';
  if (elements.positionStressSelectedStrategy) {
    const runnable = currentPositionStressCatalog?.strategies || [];
    const reportStrategyId = report.strategy?.id || report.selectedStrategy?.strategyId || '';
    const hasPendingSelection = currentPositionStressExplicitStrategyId && currentPositionStressExplicitStrategyId !== reportStrategyId;
    const pendingStrategy = hasPendingSelection
      ? runnable.find((item) => item.strategyId === currentPositionStressExplicitStrategyId)
      : null;
    const selected = pendingStrategy || report.selectedStrategy || currentPositionStressCatalog?.current || null;
    const strategyName = pendingStrategy?.name || report.strategy?.name || selected?.name || '等待选择策略';
    const adapterNote = pendingStrategy
      ? '已选择，点击运行后将保存策略、执行策略选股并生成建仓压力测试结果。'
      : report.strategy?.adapterNote || selected?.runnableReason || '从策略池选择达标策略后，点击运行生成结果。';
    const gateStatus = pendingStrategy ? '待运行' : selected?.gateStatus || report.strategy?.adapter || '未运行';
    const selectedTopN = Number(pendingStrategy?.dailyTopN ?? selected?.dailyTopN ?? parameters.dailyTopN ?? parameters.topN ?? reportTopN);
    const selectedMaxHoldings = Number(pendingStrategy?.maxHoldings ?? selected?.maxHoldings ?? parameters.maxHoldings ?? reportMaxHoldings);
    elements.positionStressSelectedStrategy.innerHTML = `
      <div>
        <strong>${escapeHtml(strategyName)}</strong>
        <span>${escapeHtml(adapterNote)}</span>
        <span>每日选股：前${escapeHtml(selectedTopN)}只；最大持仓：${escapeHtml(selectedMaxHoldings)}只；两项由策略配置锁定。</span>
      </div>
      <span class="tag ${pendingStrategy ? 'pending' : selected ? 'good' : 'pending'}">${escapeHtml(selected ? gateStatus || '已选择' : '未选择')}</span>
    `;
  }

  drawPositionStressEquity(report.strategy?.equityCurve || []);
  if (elements.positionStressResultSummary) {
    const summaryCards = [
      ['总收益', formatPercent(metrics.totalReturn, 2)],
      ['期初资金', formatCurrency(metrics.initialCapital, 0)],
      ['期末资产', formatCurrency(metrics.endingValue, 0)],
      ['累计盈亏', formatCurrency(metrics.totalPnl, 0)],
      ['最大回撤', formatPercent(metrics.maxDrawdown, 2)],
      ['累计成本', formatCurrency(metrics.totalCostAmount, 0)],
      ['平均成交率', formatPercent(metrics.averageFillRatio, 1)],
      ['换手倍数', formatNumber(metrics.turnover, 2)],
      ['收益回撤比', formatNumber(metrics.returnDrawdownRatio, 2)],
      ['Calmar 类指标', formatNumber(metrics.calmarLike, 2)],
      ['收益波动比', formatNumber(metrics.returnVolatilityRatio, 2)],
      ['简化 Sharpe', formatNumber(metrics.simplifiedSharpe, 2)],
      ['平均盈利', formatPercent(metrics.averageWinReturn, 2)],
      ['平均亏损', formatPercent(metrics.averageLossReturn, 2)],
      ['盈亏比', formatNumber(metrics.profitLossRatio, 2)],
      ['盈利贡献', formatPercent(metrics.profitContribution, 2)],
      ['亏损贡献', formatPercent(metrics.lossContribution, 2)],
      ['收益集中度', formatNumber(metrics.returnConcentration, 2)],
      ['单日最大贡献', formatPercent(metrics.maxDailyContribution, 2)],
      ['单票最大贡献', formatPercent(metrics.maxSingleStockContribution, 2)],
      ['日胜率', formatPercent(metrics.dailyWinRate, 1)],
      ['交易胜率', formatPercent(metrics.tradeWinRate, 1)],
      ['平均单笔', formatPercent(metrics.averageTradeReturn, 2)],
      ['最差单笔', formatPercent(metrics.worstTradeReturn, 2)],
      ['成交订单', `${escapeHtml(metrics.tradeCount ?? 0)}/${escapeHtml(metrics.orderCount ?? 0)} 笔`],
      ['持仓覆盖', `${escapeHtml(metrics.uniqueHeldStocks ?? '-')}只`],
      ...(isConstrainedLiquidity ? [
        ['未成交买入', formatCurrency(metrics.unfilledBuyNotional, 0)],
        ['未卖出金额', formatCurrency(metrics.unfilledSellNotional, 0)],
        ['最大滞留金额', formatCurrency(metrics.maxLingeringNotional, 0)],
        ['最大滞留天数', `${escapeHtml(metrics.maxLingeringDays ?? 0)} 天`],
        ['最大参与率', formatPercent(metrics.maxSingleStockParticipation, 2)],
        ['95分位参与率', formatPercent(metrics.p95Participation, 2)],
      ] : []),
    ];
    elements.positionStressResultSummary.innerHTML = summaryCards.map(([label, value]) => `
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
    `).join('');
  }
  if (elements.positionStressDiagnostics) {
    const bestTrade = metrics.bestTrade || {};
    const worstTrade = metrics.worstTrade || {};
    const bestDay = metrics.bestDay || {};
    const worstDay = metrics.worstDay || {};
    const diagnostics = [
      ['最好单笔', `${bestTrade.name || '-'} ${formatPercent(bestTrade.return, 2)} / ${bestTrade.signalDate || '-'}`],
      ['最差单笔', `${worstTrade.name || '-'} ${formatPercent(worstTrade.return, 2)} / ${worstTrade.signalDate || '-'}`],
      ['最好交易日', `${bestDay.date || '-'} ${formatPercent(bestDay.dailyReturn, 2)}`],
      ['最差交易日', `${worstDay.date || '-'} ${formatPercent(worstDay.dailyReturn, 2)}`],
      ['调仓次数', `${metrics.rebalanceCount ?? '-'} 次`],
      ['平均持仓数', `${metrics.averageHoldingCount ?? '-'} 只`],
      ['期末资产', formatCurrency(metrics.endingValue, 0)],
      ['累计成本', formatCurrency(metrics.totalCostAmount, 0)],
      ['日波动', formatPercent(metrics.dailyVolatility, 2)],
      ['年化收益', formatPercent(metrics.annualizedReturn, 2)],
      ...(isConstrainedLiquidity ? [
        ['成交模型', '真实成交约束'],
        ['流动性事件', `${metrics.liquidityEventCount ?? 0} 次`],
      ] : []),
    ];
    elements.positionStressDiagnostics.innerHTML = diagnostics.map(([label, value]) => `
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
    `).join('');
  }

  const warnings = report.warnings || [];
  const tencentFallbackCount = warnings.filter((item) => String(item).includes('腾讯真实K线补齐')).length;
  const actualDateCount = (report.actualDates || []).length;
  const sourceRows = [
    `覆盖：${report.stockCount ?? 0} 只 / ${report.rowCount ?? 0} 行 / ${actualDateCount} 个交易日。`,
    report.dataPolicy,
    report.sourceMessage,
    tencentFallbackCount ? `${tencentFallbackCount} 只股票使用腾讯真实K线补齐，成交额字段为空；已有本地/东方财富成交额的行会优先保留。` : '',
    `短窗口说明：当前 ${actualDateCount || '-'} 个交易日只适合检查数据链路、建仓流程、K线展示和极短期执行压力，不适合作为策略有效性结论。`,
  ].filter(Boolean);
  const detailRows = [...warnings, ...(report.nextActions || [])].filter(Boolean);

  elements.positionStressWarnings.innerHTML = sourceRows.map((item, index) => `
    <div class="status-item">
      <div>
        <strong>${index === 0 ? '覆盖状态' : index === 1 ? '数据原则' : index === 2 ? '数据源状态' : index === 3 ? '补齐口径' : '测试边界'}</strong>
        <span>${escapeHtml(item)}</span>
      </div>
      <span class="tag ${complete ? 'good' : 'watch'}">${index === 0 ? (complete ? '完整' : '缺失') : '口径'}</span>
    </div>
  `).join('') + (detailRows.length ? `
    <details class="stress-source-log">
      <summary>查看数据源日志 ${detailRows.length} 条</summary>
      <div>
        ${detailRows.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}
      </div>
    </details>
  ` : '');

  elements.positionStressSelectionList.innerHTML = (report.strategy?.dailySelections || [])
    .map((day) => `
      <div class="status-item">
        <div>
          <strong>${escapeHtml(day.date)} 入选 ${escapeHtml(day.selectedCount)} 只</strong>
          <span>${escapeHtml((day.names || []).join('、'))}</span>
        </div>
        <span class="tag ${complete ? 'good' : 'pending'}">${complete ? '可运行' : '预览'}</span>
      </div>
    `).join('') || '<div class="library-source">暂无建仓选择。</div>';

  elements.positionStressScenarios.innerHTML = (report.stress || [])
    .map((scenario) => `
      <tr>
        <td><span class="tag neutral">${escapeHtml(scenario.category || '压力')}</span></td>
        <td><strong>${escapeHtml(scenario.name)}</strong></td>
        <td><strong class="${Number(scenario.resultReturn) >= 0 ? 'positive-number' : 'negative-number'}">${formatPercent(scenario.resultReturn, 2)}</strong></td>
        <td>${formatPercent(scenario.maxDrawdown, 2)}</td>
        <td>${escapeHtml(scenario.tradeCount ?? '-')}</td>
        <td>${formatCurrency(scenario.endingValue, 0)}</td>
        <td>${formatCurrency(scenario.totalCostAmount, 0)}</td>
        <td>${formatPercent(scenario.averageFillRatio, 1)}</td>
        <td>${escapeHtml(scenario.impact)}</td>
      </tr>
    `).join('') || '<tr><td colspan="9">暂无压力场景。</td></tr>';

  if (elements.positionStressTradeTable) {
    elements.positionStressTradeTable.innerHTML = (report.strategy?.trades || [])
      .map((trade) => `
        <tr>
          <td>${escapeHtml(trade.signalDate)}<br><small>${escapeHtml(trade.exitDate || '')}</small></td>
          <td><strong>${escapeHtml(trade.name)}</strong><br><small>${escapeHtml(trade.security || trade.code)}</small></td>
          <td>${formatPercent(trade.targetWeight, 1)} / ${formatPercent(trade.actualWeight, 1)}<br><small>${formatNumber(trade.shares, 0)} 股</small></td>
          <td>${formatCurrency(trade.filledNotional, 0)}<br><small>成交 ${formatPercent(trade.fillRatio, 1)}</small></td>
          <td>${formatCurrency(trade.pnl, 0)}<br><small>成本 ${formatCurrency(trade.costAmount, 0)}</small></td>
          <td><strong>${formatPercent(trade.return, 2)}</strong><br><small>${formatNumber(trade.entryPrice ?? trade.entryClose, 2)} -> ${formatNumber(trade.exitPrice ?? trade.exitClose, 2)}</small></td>
        </tr>
      `).join('') || '<tr><td colspan="6">暂无成交明细。</td></tr>';
  }

  elements.positionStressDataTable.innerHTML = (report.dataTable || []).slice(0, 120)
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td><strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(row.security || row.code)}</small></td>
        <td>${formatNumber(row.open, 2)} / ${formatNumber(row.high, 2)} / ${formatNumber(row.low, 2)} / ${formatNumber(row.close, 2)}</td>
        <td>${formatNumber(row.volume, 0)}<br><small>${formatAmountYi(row.amount)}</small></td>
        <td>${formatNumber(row.trend_alignment, 3)}</td>
        <td>${formatNumber(row.volume_price_confirmation, 3)}</td>
        <td>${formatNumber(row.crowding_risk, 3)}</td>
        <td><strong>${formatNumber(row.strategy_score, 3)}</strong></td>
        <td><span class="tag ${row.tradable ? 'good' : 'watch'}">${row.tradable ? '可交易' : '阻断'}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="9">暂无行情数据。</td></tr>';

  const klineItems = report.kline || [];
  const selectedCode = elements.positionStressKlineSelect.value;
  elements.positionStressKlineSelect.innerHTML = klineItems
    .map((item, index) => `<option value="${escapeHtml(item.code)}">${index + 1}. ${escapeHtml(item.name)} ${escapeHtml(item.code)}</option>`)
    .join('');
  if (selectedCode && klineItems.some((item) => item.code === selectedCode)) {
    elements.positionStressKlineSelect.value = selectedCode;
  }
  const activeItem = klineItems.find((item) => item.code === elements.positionStressKlineSelect.value) || klineItems[0];
  if (activeItem) {
    elements.positionStressKlineSelect.value = activeItem.code;
  }
  setPositionStressKlineNote(positionStressKlineDefaultNote(report), 'success');
  drawPositionStressKline(activeItem);
}

function renderPositionStressCatalog(catalog) {
  currentPositionStressCatalog = catalog;
  if (elements.positionStressStrategySelect) {
    const runnable = (catalog?.strategies || []).filter((item) => item.runnable);
    elements.positionStressStrategySelect.innerHTML = [
      '<option value="">从策略池选择</option>',
      ...runnable.map((item) => {
        const topN = Number(item.dailyTopN ?? item.execution?.dailyTopN ?? 10);
        const maxHoldings = Number(item.maxHoldings ?? item.execution?.maxHoldings ?? topN);
        return `<option value="${escapeHtml(item.strategyId)}">${escapeHtml(item.name)} · 选${topN}/持${maxHoldings}</option>`;
      }),
    ].join('');
    if (currentPositionStressExplicitStrategyId && runnable.some((item) => item.strategyId === currentPositionStressExplicitStrategyId)) {
      elements.positionStressStrategySelect.value = currentPositionStressExplicitStrategyId;
    } else if (catalog?.current?.strategyId && runnable.some((item) => item.strategyId === catalog.current.strategyId)) {
      elements.positionStressStrategySelect.value = catalog.current.strategyId;
    }
  }
  if (currentPositionStressReport) {
    renderPositionStress({ ...currentPositionStressReport, selectedStrategy: catalog.current || currentPositionStressReport.selectedStrategy });
  }
}

function selectedPositionStressStrategyId() {
  return String(elements.positionStressStrategySelect?.value || '').trim();
}

function requireSelectedPositionStressStrategy() {
  const strategyId = selectedPositionStressStrategyId();
  if (!strategyId) {
    elements.positionStressMessage.textContent = '请先从策略池选择压测策略，再运行建仓压力测试。';
    elements.positionStressMessage.dataset.tone = 'error';
    elements.positionStressStrategySelect?.focus();
    return '';
  }
  return strategyId;
}

function refreshPositionStressKline(options = {}) {
  drawPositionStressKline(activePositionStressKlineItem(), options);
}

function setPositionStressKlinePeriod(period) {
  positionStressKlinePeriod = ['daily', 'monthly', 'yearly'].includes(period) ? period : 'daily';
  elements.positionStressKlineDaily?.classList.toggle('active', positionStressKlinePeriod === 'daily');
  elements.positionStressKlineMonthly?.classList.toggle('active', positionStressKlinePeriod === 'monthly');
  elements.positionStressKlineYearly?.classList.toggle('active', positionStressKlinePeriod === 'yearly');
  positionStressKlineView.hoverIndex = null;
  elements.positionStressKlineTooltip.hidden = true;
  refreshPositionStressKline({ resetView: true });
}

function updatePositionStressKlineTooltip(event) {
  const canvas = elements.positionStressKlineCanvas;
  const tooltip = elements.positionStressKlineTooltip;
  if (!canvas || !tooltip) return;
  const item = activePositionStressKlineItem();
  const rows = positionStressKlineRows(item);
  if (!rows.length) return;
  fitPositionStressKlineView(rows);
  const rect = canvas.getBoundingClientRect();
  const leftPad = 58;
  const rightPad = 72;
  const chartWidth = rect.width - leftPad - rightPad;
  const count = Math.min(Math.floor(positionStressKlineView.count), rows.length);
  const slot = chartWidth / Math.max(count, 1);
  const localX = event.clientX - rect.left;
  const index = Math.min(Math.max(0, Math.floor((localX - leftPad) / slot)), count - 1);
  const row = rows[Math.floor(positionStressKlineView.start) + index];
  if (!row || localX < leftPad || localX > rect.width - rightPad) {
    tooltip.hidden = true;
    positionStressKlineView.hoverIndex = null;
    refreshPositionStressKline();
    return;
  }
  positionStressKlineView.hoverIndex = index;
  const change = row.open ? row.close / row.open - 1 : null;
  tooltip.innerHTML = `
    <strong>${escapeHtml(item?.name || item?.code || '')} ${escapeHtml(row.date)}</strong>
    开 ${formatNumber(row.open, 2)}　高 ${formatNumber(row.high, 2)}　低 ${formatNumber(row.low, 2)}　收 ${formatNumber(row.close, 2)}<br>
    涨跌 ${formatPercent(change, 2)}　成交量 ${formatNumber(row.volume / 10000, 1)}万<br>
    成交额 ${formatAmountYi(row.amount)}　策略分 ${formatNumber(row.strategy_score, 4)}
  `;
  const tipLeft = Math.min(Math.max(10, event.clientX - rect.left + 16), rect.width - 280);
  const tipTop = Math.min(Math.max(10, event.clientY - rect.top + 16), rect.height - 110);
  tooltip.style.left = `${tipLeft}px`;
  tooltip.style.top = `${tipTop}px`;
  tooltip.hidden = false;
  refreshPositionStressKline();
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
  const positionStressReportUrl = positionStressReportEndpoint();
  const [summary, factors, equity, risks, paperWatchRoutes, factorSummary, factorActivity, strategies, factorDefinitions, liveStrategies, backtestStatus, researchPipeline, positionStress, positionStressCatalog, positionStressHistory] = await Promise.all([
    request('/api/summary'),
    request('/factor-api/real-factor-results?limit=100'),
    request('/backtest-api/equity'),
    request('/api/risk'),
    request('/strategy-api/paper-watch-routes'),
    request('/factor-api/real-factor-summary'),
    request('/factor-api/activity'),
    request('/strategy-api/definitions'),
    request('/factor-api/indicator-factor-definitions'),
    request('/strategy-api/live-signals'),
    request('/backtest-api/research-status'),
    request('/research-api/pipeline'),
    request(positionStressReportUrl),
    request('/position-stress-api/strategies'),
    request('/position-stress-api/history'),
  ]);

  currentPositionStressCatalog = positionStressCatalog;
  renderSummary(summary);
  renderFactors(factors);
  renderRisk(risks);
  renderPaperWatchRoutes(paperWatchRoutes);
  drawChart(equity);
  renderFactorLibrary(factorSummary, strategies, factorDefinitions, researchPipeline);
  renderStrategyLibrary(strategies);
  renderLiveStrategies(liveStrategies);
  renderBacktestCenter(backtestStatus);
  renderFactorActivity(factorActivity);
  renderResearchPipeline(researchPipeline);
  renderPositionStress(positionStress);
  renderPositionStressHistory(positionStressHistory);
  renderPositionStressCatalog(positionStressCatalog);
  bindCollapsibleData();
  requestAnimationFrame(syncCollapsibleData);
}

function positionStressDateParams() {
  const params = new URLSearchParams();
  const start = elements.positionStressStart?.value || '';
  const end = elements.positionStressEnd?.value || '';
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return params;
}

function positionStressEndpoint(path) {
  const params = positionStressDateParams();
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function positionStressReportEndpoint() {
  return positionStressEndpoint('/position-stress-api/report');
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

elements.savePreferences?.addEventListener('click', async () => {
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

elements.runBacktest?.addEventListener('click', async () => {
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

elements.draftStrategySearch?.addEventListener('input', () => {
  draftStrategyQuery = elements.draftStrategySearch.value;
  draftStrategyPage = 1;
  if (currentStrategySignalPack) renderDraftStrategies(currentStrategySignalPack);
});

elements.strategyGradeFilter?.addEventListener('change', () => {
  draftStrategyGrade = elements.strategyGradeFilter.value || 'all';
  draftStrategyPage = 1;
  if (currentStrategySignalPack) renderDraftStrategies(currentStrategySignalPack);
});

elements.draftStrategyJump?.addEventListener('change', () => {
  const strategyId = elements.draftStrategyJump.value;
  const strategy = buildUnifiedStrategies(currentStrategySignalPack || {}).find((item) => item.id === strategyId);
  draftStrategyQuery = strategy ? strategy.name : '';
  draftStrategyGrade = strategy ? strategyGradeKey(strategy) : 'all';
  draftStrategyExpanded = Boolean(strategy);
  draftStrategyPage = 1;
  elements.draftStrategySearch.value = draftStrategyQuery;
  if (elements.strategyGradeFilter) elements.strategyGradeFilter.value = draftStrategyGrade;
  if (currentStrategySignalPack) renderDraftStrategies(currentStrategySignalPack);
});

elements.draftStrategyToggle?.addEventListener('click', () => {
  draftStrategyExpanded = !draftStrategyExpanded;
  draftStrategyPage = 1;
  if (currentStrategySignalPack) renderDraftStrategies(currentStrategySignalPack);
});

elements.draftStrategyPagination?.addEventListener('click', (event) => {
  const action = event.target?.dataset?.draftPage;
  if (!action || !currentStrategySignalPack) return;
  draftStrategyPage += action === 'next' ? 1 : -1;
  renderDraftStrategies(currentStrategySignalPack);
});

elements.strategyLevelIndex?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-strategy-grade]');
  if (!button || !currentStrategySignalPack) return;
  draftStrategyGrade = button.dataset.strategyGrade || 'all';
  draftStrategyPage = 1;
  if (elements.strategyGradeFilter) elements.strategyGradeFilter.value = draftStrategyGrade;
  renderDraftStrategies(currentStrategySignalPack);
});

elements.formalStrategySearch?.addEventListener('input', () => {
  formalStrategyQuery = elements.formalStrategySearch.value;
  formalStrategyPage = 1;
  if (currentStrategySignalPack) renderFormalStrategies(currentStrategySignalPack);
});

elements.formalStrategyJump?.addEventListener('change', () => {
  const strategyId = elements.formalStrategyJump.value;
  const strategy = (currentStrategySignalPack?.formalStrategies || []).find((item) => item.id === strategyId);
  formalStrategyQuery = strategy ? strategy.name : '';
  formalStrategyExpanded = Boolean(strategy);
  formalStrategyPage = 1;
  elements.formalStrategySearch.value = formalStrategyQuery;
  if (currentStrategySignalPack) renderFormalStrategies(currentStrategySignalPack);
});

elements.formalStrategyToggle?.addEventListener('click', () => {
  formalStrategyExpanded = !formalStrategyExpanded;
  formalStrategyPage = 1;
  if (currentStrategySignalPack) renderFormalStrategies(currentStrategySignalPack);
});

elements.formalStrategyPagination?.addEventListener('click', (event) => {
  const action = event.target?.dataset?.formalPage;
  if (!action || !currentStrategySignalPack) return;
  formalStrategyPage += action === 'next' ? 1 : -1;
  renderFormalStrategies(currentStrategySignalPack);
});

function handleStrategyCardClick(event) {
  const stressButton = event.target.closest('[data-position-stress-strategy]');
  if (stressButton) {
    const strategyId = stressButton.dataset.positionStressStrategy;
    currentPositionStressExplicitStrategyId = strategyId;
    showView('position-stress');
    elements.navButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.viewTarget === 'position-stress');
    });
    renderPositionStressCatalog(currentPositionStressCatalog || { strategies: [], current: null });
    if (currentPositionStressReport) renderPositionStress(currentPositionStressReport);
    elements.positionStressMessage.textContent = '已选择策略，点击运行生成选股和压测结果。';
    elements.positionStressMessage.dataset.tone = 'success';
    window.setTimeout(() => {
      elements.positionStressStrategySelect?.focus();
    }, 1000);
    return;
  }

  const downloadButton = event.target.closest('[data-strategy-download]');
  if (downloadButton) {
    window.location.href = downloadButton.dataset.strategyDownload;
    return;
  }

  const button = event.target.closest('.strategy-factor-button');
  if (!button) return;
  const article = button.closest('.strategy-item');
  const panelId = button.dataset.factorPanel;
  const panel = article?.querySelector(`#${CSS.escape(panelId)}`);
  if (!panel) return;
  const shouldOpen = panel.hidden;
  article.querySelectorAll('.factor-backtest-detail').forEach((detail) => {
    detail.hidden = true;
  });
  article.querySelectorAll('.strategy-factor-button').forEach((chip) => {
    chip.classList.remove('active');
  });
  panel.hidden = !shouldOpen;
  button.classList.toggle('active', shouldOpen);
}

elements.strategyLiveList?.addEventListener('click', handleStrategyCardClick);
elements.formalStrategyList?.addEventListener('click', handleStrategyCardClick);
elements.paperWatchList?.addEventListener('click', async (event) => {
  const rebuildButton = event.target.closest('[data-paper-watch-rebuild]');
  if (!rebuildButton) return;
  rebuildButton.disabled = true;
  try {
    await request('/paper-watch-api/rebuild-derived-packs', { method: 'POST' });
    await refreshDashboard();
  } catch (error) {
    rebuildButton.disabled = false;
    rebuildButton.textContent = `刷新失败：${error.message}`;
  }
});

elements.runPaperWatchDailyRefresh?.addEventListener('click', async () => {
  const button = elements.runPaperWatchDailyRefresh;
  const mode = elements.paperWatchRefreshMode?.value || 'local';
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = mode === 'joinquant_local'
    ? 'JoinQuant刷新中'
    : mode === 'local'
      ? '本地刷新中'
      : '联网刷新中';
  if (elements.paperWatchRefreshSummary) {
    elements.paperWatchRefreshSummary.innerHTML = `
      <div class="paper-watch-note compact">
        <strong>一键刷新运行中</strong>
        <span class="tag pending">${escapeHtml(mode)}</span>
        <p>${mode === 'joinquant_local'
          ? '正在扫描并导入 JoinQuant 真实结果，随后自动生成信号账本和报告。'
          : '正在执行真实数据流水线，时间取决于 AkShare 接口和股票池大小。'}</p>
      </div>
    `;
  }
  try {
    const response = await request('/paper-watch-api/run-daily-refresh', {
      body: JSON.stringify({ mode }),
      method: 'POST',
    });
    renderPaperWatchRefreshSummary(response.refresh);
    renderJoinQuantPaperWatchReport(response.refresh?.report);
    renderPaperWatchPerformanceReport(response.refresh?.report?.performance_report);
    await refreshDashboard();
  } catch (error) {
    if (elements.paperWatchRefreshSummary) {
      elements.paperWatchRefreshSummary.innerHTML = `
        <div class="paper-watch-note compact">
          <strong>一键刷新失败</strong>
          <span class="tag watch">失败</span>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText || '一键刷新数据';
  }
});

elements.buildBigquantPaperWatchPack?.addEventListener('click', async () => {
  const button = elements.buildBigquantPaperWatchPack;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '生成中';
  try {
    const response = await request('/paper-watch-api/build-bigquant-test-pack', { method: 'POST' });
    renderBigQuantPaperWatchPack(response.pack);
    button.textContent = '已生成';
  } catch (error) {
    if (elements.paperWatchBigquantSummary) {
      elements.paperWatchBigquantSummary.innerHTML = `
        <div class="paper-watch-note compact">
          <strong>BigQuant测试包生成失败</strong>
          <span class="tag watch">失败</span>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
    button.textContent = '生成失败';
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText || '生成BigQuant包';
    }, 900);
  }
});

elements.downloadJoinquantCsv?.addEventListener('click', () => {
  window.location.href = '/backtest-api/joinquant-factor-export.csv';
});

elements.downloadJoinquantFactorScript?.addEventListener('click', () => {
  window.location.href = '/backtest-api/joinquant-factor-test-script.py';
});

elements.positionStressHistorySelect?.addEventListener('change', async () => {
  const selectedPath = elements.positionStressHistorySelect.value;
  const selected = currentPositionStressHistory.find((item) => item.reportPath === selectedPath);
  if (!selectedPath || !selected) return;
  const range = selected.requestedDateRange || {};
  if (range.start && elements.positionStressStart) elements.positionStressStart.value = range.start;
  if (range.end && elements.positionStressEnd) elements.positionStressEnd.value = range.end;
  try {
    const params = new URLSearchParams();
    params.set('reportPath', selectedPath);
    if (range.start) params.set('start', range.start);
    if (range.end) params.set('end', range.end);
    const report = await request(`/position-stress-api/report?${params.toString()}`);
    renderPositionStress(report);
    renderPositionStressHistory(currentPositionStressHistory);
    elements.positionStressMessage.textContent = '已切换历史压力测试报告；未重新计算。';
    elements.positionStressMessage.dataset.tone = 'success';
  } catch (error) {
    elements.positionStressMessage.textContent = `历史报告加载失败：${error.message}`;
    elements.positionStressMessage.dataset.tone = 'error';
  }
});

elements.positionStressKlineSelect?.addEventListener('change', async () => {
  selectPositionStressKlineItem(activePositionStressKlineItem(), { resetView: true, syncSearch: true });
});

elements.positionStressKlineSearch?.addEventListener('input', () => {
  window.clearTimeout(positionStressKlineSearchTimer);
  positionStressKlineSearchTimer = window.setTimeout(() => {
    handlePositionStressKlineSearch(elements.positionStressKlineSearch.value);
  }, 220);
});

elements.positionStressKlineDaily?.addEventListener('click', () => setPositionStressKlinePeriod('daily'));
elements.positionStressKlineMonthly?.addEventListener('click', () => setPositionStressKlinePeriod('monthly'));
elements.positionStressKlineYearly?.addEventListener('click', () => setPositionStressKlinePeriod('yearly'));
elements.positionStressKlineReset?.addEventListener('click', () => refreshPositionStressKline({ resetView: true }));

elements.positionStressKlineCanvas?.addEventListener('wheel', (event) => {
  event.preventDefault();
  const item = activePositionStressKlineItem();
  const rows = positionStressKlineRows(item);
  if (!rows.length) return;
  const minCount = positionStressKlinePeriod === 'yearly' ? 2 : positionStressKlinePeriod === 'monthly' ? 6 : 18;
  const oldCount = positionStressKlineView.count || Math.min(rows.length, 70);
  const nextCount = Math.min(rows.length, Math.max(minCount, Math.round(oldCount * (event.deltaY > 0 ? 1.18 : 0.84))));
  const rect = elements.positionStressKlineCanvas.getBoundingClientRect();
  const ratio = Math.min(Math.max((event.clientX - rect.left - 58) / Math.max(rect.width - 130, 1), 0), 1);
  const anchor = positionStressKlineView.start + oldCount * ratio;
  positionStressKlineView.count = nextCount;
  positionStressKlineView.start = Math.round(anchor - nextCount * ratio);
  positionStressKlineView.hoverIndex = null;
  elements.positionStressKlineTooltip.hidden = true;
  refreshPositionStressKline();
}, { passive: false });

elements.positionStressKlineCanvas?.addEventListener('pointerdown', (event) => {
  positionStressKlineView.dragging = true;
  positionStressKlineView.dragX = event.clientX;
  positionStressKlineView.dragStart = positionStressKlineView.start;
  elements.positionStressKlineCanvas.setPointerCapture?.(event.pointerId);
});

elements.positionStressKlineCanvas?.addEventListener('pointermove', (event) => {
  if (positionStressKlineView.dragging) {
    const item = activePositionStressKlineItem();
    const rows = positionStressKlineRows(item);
    const rect = elements.positionStressKlineCanvas.getBoundingClientRect();
    const slot = Math.max((rect.width - 130) / Math.max(positionStressKlineView.count, 1), 1);
    const delta = Math.round((event.clientX - positionStressKlineView.dragX) / slot);
    positionStressKlineView.start = positionStressKlineView.dragStart - delta;
    fitPositionStressKlineView(rows);
    positionStressKlineView.hoverIndex = null;
    elements.positionStressKlineTooltip.hidden = true;
    refreshPositionStressKline();
    return;
  }
  updatePositionStressKlineTooltip(event);
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
  elements.positionStressKlineCanvas?.addEventListener(eventName, () => {
    positionStressKlineView.dragging = false;
    if (eventName === 'pointerleave') {
      positionStressKlineView.hoverIndex = null;
      elements.positionStressKlineTooltip.hidden = true;
      refreshPositionStressKline();
    }
  });
});

elements.refreshPositionStress?.addEventListener('click', async () => {
  try {
    const [report, catalog] = await Promise.all([
      request(positionStressReportEndpoint()),
      request('/position-stress-api/strategies'),
    ]);
    renderPositionStress(report);
    renderPositionStressCatalog(catalog);
    elements.positionStressMessage.textContent = '建仓压力测试报告已刷新';
    elements.positionStressMessage.dataset.tone = 'success';
  } catch (error) {
    elements.positionStressMessage.textContent = `刷新失败：${error.message}`;
    elements.positionStressMessage.dataset.tone = 'error';
  }
});

async function downloadPositionStressExcel(button, endpoint, filenamePrefix, successMessage, fallbackText) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '导出中';
  try {
    const response = await fetch(new URL(endpoint, window.location.origin));
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `导出接口返回 ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    elements.positionStressMessage.textContent = successMessage;
    elements.positionStressMessage.dataset.tone = 'success';
  } catch (error) {
    elements.positionStressMessage.textContent = `导出失败：${error.message}`;
    elements.positionStressMessage.dataset.tone = 'error';
  } finally {
    button.disabled = false;
    button.textContent = originalText || fallbackText;
  }
}

elements.exportPositionStressEquity?.addEventListener('click', async () => {
  await downloadPositionStressExcel(
    elements.exportPositionStressEquity,
    positionStressEndpoint('/position-stress-api/equity-export.xlsx'),
    'm-quant-position-stress-equity',
    '组合净值 Excel 已导出。',
    '导出Excel',
  );
});

elements.exportPositionStressTrades?.addEventListener('click', async () => {
  await downloadPositionStressExcel(
    elements.exportPositionStressTrades,
    positionStressEndpoint('/position-stress-api/trades-export.xlsx'),
    'm-quant-position-stress-trades',
    '成交明细 Excel 已导出。',
    '导出Excel',
  );
});

function selectedPaperExportStrategy() {
  const strategyId = selectedPositionStressStrategyId();
  if (!strategyId) {
    if (elements.positionStressPaperExportStatus) {
      elements.positionStressPaperExportStatus.dataset.tone = 'error';
      elements.positionStressPaperExportStatus.textContent = '请先选择压测策略。';
    }
    return '';
  }
  return strategyId;
}

function downloadPaperSignalFromStress(kind) {
  const strategyId = selectedPaperExportStrategy();
  if (!strategyId) return;
  const endpoints = {
    json: `/strategy-api/paper-signal-export.json?strategy=${encodeURIComponent(strategyId)}`,
    csv: `/strategy-api/paper-signal-export.csv?strategy=${encodeURIComponent(strategyId)}`,
    zip: `/strategy-api/paper-signal-export.zip?strategy=${encodeURIComponent(strategyId)}`,
  };
  window.location.href = endpoints[kind];
  if (elements.positionStressPaperExportStatus) {
    elements.positionStressPaperExportStatus.dataset.tone = 'success';
    elements.positionStressPaperExportStatus.textContent = `已按当前压测策略 ${strategyId} 准备模拟盘${kind.toUpperCase()}导出。`;
  }
}

elements.positionStressExportJson?.addEventListener('click', () => downloadPaperSignalFromStress('json'));
elements.positionStressExportCsv?.addEventListener('click', () => downloadPaperSignalFromStress('csv'));
elements.positionStressExportZip?.addEventListener('click', () => downloadPaperSignalFromStress('zip'));

elements.positionStressStrategySelect?.addEventListener('change', async () => {
  const strategyId = elements.positionStressStrategySelect.value;
  currentPositionStressExplicitStrategyId = strategyId;
  const strategy = (currentPositionStressCatalog?.strategies || []).find((item) => item.strategyId === strategyId);
  const dailyTopN = Number(strategy?.dailyTopN ?? strategy?.execution?.dailyTopN ?? 10);
  const maxHoldings = Number(strategy?.maxHoldings ?? strategy?.execution?.maxHoldings ?? dailyTopN);
  if (elements.positionStressTopN) {
    elements.positionStressTopN.value = dailyTopN;
    elements.positionStressTopN.readOnly = true;
  }
  if (elements.positionStressMaxHoldings) {
    elements.positionStressMaxHoldings.value = maxHoldings;
    elements.positionStressMaxHoldings.readOnly = true;
  }
  if (currentPositionStressReport) renderPositionStress(currentPositionStressReport);
  elements.positionStressMessage.textContent = strategyId
    ? `已锁定策略口径：每日选前${dailyTopN}只，最大持仓${maxHoldings}只；点击运行生成选股和压测结果。`
    : '请先选择压测策略。';
  elements.positionStressMessage.dataset.tone = strategyId ? 'success' : 'error';
});

[elements.positionStressStart, elements.positionStressEnd, elements.positionStressCapital]
  .filter(Boolean)
  .forEach((control) => {
    control.addEventListener('input', () => {
      if (currentPositionStressReport) renderPositionStress(currentPositionStressReport);
    });
    control.addEventListener('change', () => {
      if (currentPositionStressReport) renderPositionStress(currentPositionStressReport);
    });
  });

elements.runPositionStress?.addEventListener('click', async () => {
  const strategyId = requireSelectedPositionStressStrategy();
  if (!strategyId) return;
  const button = elements.runPositionStress;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '运行中';
  elements.positionStressMessage.textContent = '正在保存策略、执行策略选股并生成建仓压力测试结果。';
  elements.positionStressMessage.dataset.tone = 'success';
  try {
    const dailyTopN = Number(elements.positionStressTopN?.value || 10);
    const maxHoldings = Number(elements.positionStressMaxHoldings?.value || dailyTopN);
    const response = await request('/position-stress-api/run', {
      body: JSON.stringify({
        capital: Number(elements.positionStressCapital?.value || 1000000),
        end: elements.positionStressEnd?.value || '2026-07-22',
        maxHoldings,
        source: elements.positionStressSource?.value || 'auto',
        start: elements.positionStressStart?.value || '2025-01-01',
        strategyId,
        topN: dailyTopN,
      }),
      method: 'POST',
    });
    renderPositionStress(response.report);
    elements.positionStressMessage.textContent = response.message || response.report?.runGate?.reason || '运行完成';
    elements.positionStressMessage.dataset.tone = response.report?.runGate?.formalRunAllowed ? 'success' : 'error';
  } catch (error) {
    elements.positionStressMessage.textContent = `运行失败：${error.message}`;
    elements.positionStressMessage.dataset.tone = 'error';
  } finally {
    button.disabled = false;
    button.textContent = originalText || '运行';
  }
});

elements.importPositionStressOhlcv?.addEventListener('click', async () => {
  const strategyId = requireSelectedPositionStressStrategy();
  if (!strategyId) return;
  const button = elements.importPositionStressOhlcv;
  const originalText = button.textContent;
  const text = elements.positionStressImportOhlcv?.value?.trim() || '';
  if (!text) {
    elements.positionStressMessage.textContent = '请先粘贴真实行情 CSV 或 JSON。';
    elements.positionStressMessage.dataset.tone = 'error';
    return;
  }
  button.disabled = true;
  button.textContent = '导入中';
  try {
    const params = positionStressDateParams();
    params.set('strategyId', strategyId);
    const response = await request(`/position-stress-api/import-ohlcv?${params.toString()}`, {
      body: text,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      method: 'POST',
    });
    renderPositionStress(response.report);
    elements.positionStressImportOhlcv.value = '';
    elements.positionStressMessage.textContent = response.message || '真实行情已导入';
    elements.positionStressMessage.dataset.tone = response.report?.runGate?.formalRunAllowed ? 'success' : 'error';
  } catch (error) {
    elements.positionStressMessage.textContent = `导入失败：${error.message}`;
    elements.positionStressMessage.dataset.tone = 'error';
  } finally {
    button.disabled = false;
    button.textContent = originalText || '导入真实行情';
  }
});

elements.refreshBacktestCenter?.addEventListener('click', async () => {
  try {
    renderBacktestCenter(await request('/backtest-api/research-status'));
    elements.backtestImportMessage.textContent = '复测中心状态已刷新';
    elements.backtestImportMessage.dataset.tone = 'success';
  } catch (error) {
    elements.backtestImportMessage.textContent = `刷新失败：${error.message}`;
    elements.backtestImportMessage.dataset.tone = 'error';
  }
});

elements.validateTradeabilityReview?.addEventListener('click', async () => {
  try {
    const payload = JSON.parse(elements.backtestResultJson.value || '{}');
    const response = await request('/backtest-api/validate-tradeability-review', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
    elements.backtestImportMessage.textContent = response.message;
    elements.backtestImportMessage.dataset.tone = 'success';
  } catch (error) {
    elements.backtestImportMessage.textContent = `校验失败：${error.message}`;
    elements.backtestImportMessage.dataset.tone = 'error';
  }
});

elements.importBacktestResult?.addEventListener('click', async () => {
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

elements.importPaperWatchLedger?.addEventListener('click', async () => {
  try {
    const response = await request('/paper-watch-api/import-ledger', {
      body: elements.paperWatchLedgerJson.value || '',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      method: 'POST',
    });
    elements.paperWatchLedgerMessage.textContent = response.message;
    elements.paperWatchLedgerMessage.dataset.tone = 'success';
    elements.paperWatchLedgerJson.value = '';
    await refreshDashboard();
  } catch (error) {
    elements.paperWatchLedgerMessage.textContent = `导入失败：${error.message}`;
    elements.paperWatchLedgerMessage.dataset.tone = 'error';
  }
});

elements.downloadPaperWatchLedgerCsv?.addEventListener('click', () => {
  window.location.href = '/paper-watch-api/ledger-template.csv';
});

elements.downloadPaperWatchLedgerJson?.addEventListener('click', () => {
  window.location.href = '/paper-watch-api/ledger-template.json';
});

elements.askResearchAssistant?.addEventListener('click', async () => {
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
    requestAnimationFrame(syncCollapsibleData);
  });
});

window.addEventListener('resize', () => {
  requestAnimationFrame(syncCollapsibleData);
});

boot();
