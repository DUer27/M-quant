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
  formalStrategyPolicy: document.querySelector('#formal-strategy-policy'),
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
  paperWatchLedgerJson: document.querySelector('#paper-watch-ledger-json'),
  paperWatchLedgerMessage: document.querySelector('#paper-watch-ledger-message'),
  paperWatchList: document.querySelector('#paper-watch-list'),
  paperWatchStatus: document.querySelector('#paper-watch-status'),
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
let draftStrategyExpanded = false;
let draftStrategyPage = 1;
let draftStrategyQuery = '';

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
  return `
    <div class="paper-watch-note">
      <strong>成熟策略推进矩阵</strong>
      <span class="tag ${goalMet ? 'good' : 'watch'}">
        ${escapeHtml(matrix.ready_strategy_count ?? 0)} / ${escapeHtml(matrix.target_ready_strategy_count ?? 2)}
      </span>
      <p>${escapeHtml(matrix.goal_status_name || '等待矩阵生成')}</p>
      ${blockers.length ? `<p>${escapeHtml(blockers.join('；'))}</p>` : ''}
      <details class="compact-details">
        <summary>查看策略成熟度明细</summary>
        <table class="mini-table">
          <thead>
            <tr>
              <th>策略</th>
              <th>类型</th>
              <th>决策</th>
              <th>计入</th>
              <th>收益</th>
              <th>回撤</th>
              <th>Sharpe</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((item) => `
              <tr>
                <td>${escapeHtml(item.strategy_name || item.id || '-')}</td>
                <td>${escapeHtml(item.category || '-')}</td>
                <td>${escapeHtml(item.decision_name || item.decision || '-')}</td>
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
                独立资金袖候选：
                ${escapeHtml(sleeveAudit.eligible_independent_sleeve_count ?? 0)} 个准入，
                ${escapeHtml(sleeveAudit.blocked_candidate_count ?? 0)} 个阻塞
              </summary>
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>候选</th>
                    <th>决策</th>
                    <th>计入</th>
                    <th>缺口</th>
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
                        <td>${escapeHtml(item.decision_name || item.decision || '-')}</td>
                        <td>${item.counts_as_independent_sleeve ? '是' : '否'}</td>
                        <td>${escapeHtml(gaps || '-')}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </details>
          ` : ''}
          <strong>下一步</strong>
          ${renderTextList(actions.map((item) => `${item.priority}. ${item.action} ${item.reason}`))}
          <strong>数据原则</strong>
          ${renderTextList([matrix.data_policy || '只读取已有真实证据，不生成收益。'])}
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
  return `
    <div class="paper-watch-note">
      <strong>交易可行性复核任务包</strong>
      <span class="tag ${imported ? 'good' : 'pending'}">${escapeHtml(pack.status || 'missing')}</span>
      <p>
        ${escapeHtml(target.strategy_name || target.strategy_id || '-')}：
        ${escapeHtml(target.signal_date || '-')}，
        入选 ${escapeHtml(target.selected_count ?? 0)} 只，
        当前 ${gate.can_start_observation ? '已可观察' : '仍需 JoinQuant 真实复核'}。
      </p>
      <p>
        通过门槛：可交易数量不少于 ${escapeHtml(passGate.min_tradable_count ?? 10)}，
        decision 必须为 ${escapeHtml(passGate.required_decision || 'tradeability_review_passed')}。
      </p>
      <div class="inline-actions">
        ${script.download_endpoint ? `<a class="inline-link" href="${escapeHtml(script.download_endpoint)}">下载交易复核脚本</a>` : ''}
        <button type="button" data-paper-watch-rebuild="true">刷新派生包</button>
      </div>
      <details class="compact-details">
        <summary>查看复核步骤和候选</summary>
        <div class="paper-watch-rules">
          <strong>执行步骤</strong>
          ${renderTextList(steps)}
          <strong>入选代码</strong>
          ${renderTextList(selectedCodes)}
          <strong>导入要求</strong>
          ${renderTextList([
            `导入接口：${passGate.import_endpoint || '/backtest-api/import-results'}`,
            `预期 source：${script.expected_source || 'joinquant_akshare_latest_signal_tradeability_review'}`,
            passGate.after_import_expected_effect || '导入后才允许继续判断是否解除阻塞。',
          ])}
        </div>
      </details>
    </div>
  `;
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
  if (elements.paperWatchStatus) {
    elements.paperWatchStatus.textContent = ready || conditional
      ? `${readyCount || 0}就绪/${conditionalCount || 0}条件`
      : '未就绪';
    elements.paperWatchStatus.className = `tag ${ready ? 'good' : conditional ? 'pending' : 'watch'}`;
  }
  elements.paperWatchList.innerHTML = routes.length
    ? `
      ${independence.summary ? `
        <div class="paper-watch-note">
          <strong>${escapeHtml(independence.decisionName || '独立性审计')}</strong>
          <span>独立资金袖 ${escapeHtml(independence.independentCapitalSleeves || 0)} 个</span>
          <p>${escapeHtml(independence.summary)}</p>
        </div>
      ` : ''}
      ${pack.localBacktest?.tradeabilityReviewScriptEndpoint ? `
        <div class="paper-watch-note">
          <strong>AkShare 最新信号需 JoinQuant 复核</strong>
          <span>${pack.localBacktest.latestTradeabilityReview ? '已有导入复核' : '等待真实复核 JSON'}</span>
          <p>本地 OHLCV 只证明策略历史表现，最新开仓前还要用 JoinQuant 检查停牌、ST、涨跌停、行业和市值暴露。</p>
          <a class="inline-link" href="${escapeHtml(pack.localBacktest.tradeabilityReviewScriptEndpoint)}">下载复核脚本</a>
        </div>
      ` : ''}
      ${pack.localBacktest?.regimeSwitch ? `
        <div class="paper-watch-note">
          <strong>${escapeHtml(pack.localBacktest.regimeSwitch.strategy_name || 'AkShare本地切换策略')}</strong>
          <span class="tag ${pack.localBacktest.regimeSwitch.decision === 'ready_local_switch_paper_watch' ? 'good' : 'watch'}">${escapeHtml(pack.localBacktest.regimeSwitch.decision || '-')}</span>
          <p>
            本地真实 OHLCV 合成高/低波动控制器：
            ${escapeHtml(pack.localBacktest.regimeSwitch.baseline?.sample_trades ?? 0)} 次调仓，
            收益 ${formatPercent(pack.localBacktest.regimeSwitch.baseline?.strategy_return, 2)}，
            回撤 ${formatPercent(pack.localBacktest.regimeSwitch.baseline?.max_drawdown, 2)}，
            Sharpe ${formatNumber(pack.localBacktest.regimeSwitch.baseline?.sharpe, 2)}。
          </p>
          ${pack.localBacktest?.regimeSwitchRobustness ? `
            <p>
              稳健性 ${escapeHtml(pack.localBacktest.regimeSwitchRobustness.decision || '-')}：
              留一年最差收益 ${formatPercent(pack.localBacktest.regimeSwitchRobustness.summary?.min_leave_one_year_return, 2)}，
              滚动12期正收益 ${formatPercent(pack.localBacktest.regimeSwitchRobustness.summary?.rolling_12_positive_ratio, 2)}，
              最差滚动收益 ${formatPercent(pack.localBacktest.regimeSwitchRobustness.summary?.worst_rolling_12_return, 2)}。
            </p>
          ` : ''}
          <p>${escapeHtml(pack.localBacktest.regimeSwitch.paper_scope || '进入模拟观察前仍需交易可行性复核。')}</p>
        </div>
      ` : ''}
      ${renderTradeabilityReviewTaskPack(pack.tradeabilityReviewTaskPack)}
      ${renderMaturityMatrix(pack.maturityMatrix)}
      ${pack.operationsPack ? `
        <div class="paper-watch-note">
          <strong>模拟观察运行包</strong>
          <span>${escapeHtml(pack.operationsPack.ready_sleeve_count ?? 0)} 可观察 / ${escapeHtml(pack.operationsPack.sleeve_count ?? 0)} 资金袖</span>
          <p>${escapeHtml(pack.operationsPack.data_policy || '')}</p>
          <p>已导入账本 ${escapeHtml(pack.operationsPack.importedLedgerCount ?? 0)} 条。</p>
          <p>
            初始账本：
            ${(pack.operationsPack.initial_ledger_rows || []).map((row) => (
              `${escapeHtml(row.sleeve_id || '-')}: ${escapeHtml(row.paper_action || '-')} / ${escapeHtml(row.gate_status || '-')}`
            )).join('；')}
          </p>
          ${(pack.operationsPack.latestLedgerRows || []).length ? `
            <p>
              最近记录：
              ${(pack.operationsPack.latestLedgerRows || []).map((row) => (
                `${escapeHtml(row.date || '-')}/${escapeHtml(row.sleeve_id || '-')}/${escapeHtml(row.paper_action || '-')}/权重 ${escapeHtml(row.planned_weight ?? '-')}`
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
      const executionRoleLabel = {
        primary_local_sleeve: '主观察',
        high_volatility_backup_sleeve: '高波动备选',
        candidate_monitor: '候选监控',
      }[execution.execution_role] || '';
      return `
        <article class="paper-watch-item">
          <div>
            <strong>${escapeHtml(route.strategy_name || route.strategy_id)}</strong>
            <span class="tag ${readinessTone}">${escapeHtml(readiness.decision || route.layer || '-')}</span>
            <span class="tag neutral">${escapeHtml(evidenceSystem)}</span>
            ${executionRoleLabel ? `<span class="tag neutral">${escapeHtml(executionRoleLabel)}</span>` : ''}
            ${tradeabilityLabel ? `<span class="tag ${tradeabilityTone}">${escapeHtml(tradeabilityLabel)}</span>` : ''}
          </div>
          <div class="paper-watch-metrics">
            <span>收益 ${(Number(route.strategy_return || 0) * 100).toFixed(2)}%</span>
            <span>回撤 ${(Number(route.max_drawdown || 0) * 100).toFixed(2)}%</span>
            <span>Sharpe ${Number(route.sharpe || 0).toFixed(2)}</span>
            ${route.avg_selected_count ? `<span>平均入选 ${Number(route.avg_selected_count || 0).toFixed(0)}</span>` : ''}
          </div>
          ${signal.action ? `
            <div class="paper-watch-metrics">
              <span>信号 ${escapeHtml(signal.action)}</span>
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
              <span>${escapeHtml(tradeabilityReview.decision || '-')}</span>
            </div>
          ` : signal.action === 'paper_watch_open_allowed' ? `
            <div class="paper-watch-metrics">
              <span>交易复核 待导入</span>
              <span>需 JoinQuant 真实 JSON</span>
            </div>
          ` : ''}
          <p>${escapeHtml(route.paper_scope || '')}</p>
          ${signal.reason ? `<p>${escapeHtml(signal.reason)}</p>` : ''}
          ${tradeabilityReview?.decision_reason ? `<p>${escapeHtml(tradeabilityReview.decision_reason)}</p>` : ''}
          ${readiness.decision_reason ? `<p>${escapeHtml(readiness.decision_reason)}</p>` : ''}
          <details class="compact-details">
            <summary>执行与审计规则</summary>
            <div class="paper-watch-rules">
              <strong>开仓边界</strong>
              ${renderTextList(execution.entry_gate || [
                route.paper_scope || '只允许在本路线审计通过的分层和股票池内观察',
                route.is_local_backtest ? '本路线来自 AkShare 本地真实OHLCV回测，需独立记录样本外净值并等待后续 JoinQuant/模拟盘复核。' : '',
              ].filter(Boolean))}
              <strong>就绪检查</strong>
              ${renderTextList(failedChecks.length
                ? failedChecks.map((item) => `${item.name}: ${item.detail}`)
                : ['当前无硬失败项'])}
              <strong>成本压力</strong>
              ${renderTextList(readiness.cost_stress ? [
                `1.5x成本收益 ${formatPercent(readiness.cost_stress.cost_1_5x?.strategy_return, 2)}`,
                `2.0x成本收益 ${formatPercent(readiness.cost_stress.cost_2_0x?.strategy_return, 2)}`,
              ] : [])}
              <strong>暂停规则</strong>
              ${renderTextList((execution.pause_rules || []).map((item) => item.meaning || item.rule))}
              <strong>最新候选</strong>
              ${renderTextList((signal.selected || []).slice(0, 20).map((item) => `${item.code} ${item.name || ''} score ${Number(item.score || 0).toFixed(3)}`))}
              <strong>JoinQuant 交易复核</strong>
              ${renderTextList(tradeabilityReview ? [
                `结论：${tradeabilityReview.decision}`,
                `可交易：${tradeabilityReview.tradable_count}/${tradeabilityReview.candidate_count}`,
                `数据边界：${tradeabilityReview.data_policy || 'JoinQuant 真实交易状态复核'}`,
              ] : signal.action === 'paper_watch_open_allowed' ? [
                '尚未导入 JoinQuant 复核 JSON，不能把本地最新信号视为已可开仓。',
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
    capital_source_count: '资金来源数',
    chip_health: '筹码健康',
    crowding_risk: '拥挤风险',
    emotion_weighted_kline_score: '情绪加权K线',
    flow_vs_ma: '资金相对均值',
    intraday_strength: '日内强度',
    intraday_ap_slope: '日内暗盘斜率',
    kdj_momentum: 'KDJ动能',
    kline_event_score: '单根K线评分',
    low_emotion_score: '低情绪反向',
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
    volume_price_resonance_60_5: '价量共振_60_5',
    active_ap_accumulation: '活跃暗盘吸筹',
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

function isTradingStrategyResult(result) {
  return result.result_type === 'trading_backtest' || result.result_type === 'strategy_trading_backtest' || result.result_type === 'local_strategy_backtest';
}

function strategyResultPerformanceLabel(result) {
  if (!isTradingStrategyResult(result)) {
    return result.date_range || `${result.sample_dates ?? '-'} 日 / ${result.sample_trades ?? '-'} 条`;
  }

  return [
    `净值 ${formatNumber(result.final_net_value ?? (1 + Number(result.strategy_return || 0)), 3)}`,
    `年化 ${formatPercent(result.strategy_annual_return ?? result.annual_return)}`,
    `回撤 ${formatPercent(result.max_drawdown)}`,
    `Sharpe ${formatNumber(result.sharpe, 2)}`,
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
        <span>最佳周期</span>
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
          <td><strong>${escapeHtml(strategyResultName(result))}</strong><br><small>${escapeHtml(resultStrategyId(result))}</small></td>
          <td>${escapeHtml(formatStrategyHorizon(result.horizon))}</td>
          <td>${escapeHtml(strategyResultMarketRegime(result))}<br><small>${formatPercent(result.market_vol_mean)}</small></td>
          <td>${escapeHtml(strategyResultSizeBucket(result))}<br><small>${formatSizeOrLiquidityMeta(result)}</small></td>
          <td>${escapeHtml(strategyResultPerformanceLabel(result))}</td>
          <td>${formatPercent(result.mean_return)}</td>
          <td>${formatPercent(result.daily_mean_return)}</td>
          <td>${formatPercent(result.daily_positive_ratio ?? result.positive_ratio)}</td>
          <td>${formatPercent(result.best_daily_return)} / ${formatPercent(result.worst_daily_return)}</td>
          <td>${formatNumber(result.avg_candidates_per_date, 1)}</td>
          <td>${escapeHtml(result.source || 'joinquant')}</td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
        </tr>
      `;
    })
    .join('');

  elements.strategyResultNotes.innerHTML = `
    <strong>结果边界：</strong>
    ${activeStrategyResult === 'all' ? '当前展示全部策略' : `当前策略：${escapeHtml(strategyResultName(visibleRows[0]))}`}；
    市场状态：${escapeHtml(activeRegimeOption.label)}；市值层：${escapeHtml(activeSizeOption.label)}；正收益记录 ${escapeHtml(positiveRows)} 条。
    分层结果只来自 JoinQuant 对应脚本导入的真实 JSON；未导入则不展示。
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
  elements.libraryComputedCount.textContent = computed.length;
  elements.libraryUnavailableCount.textContent = unavailable.length;
  elements.libraryKlineRuleCount.textContent = `${scoredRules.length}/${unscoredRules.length}`;
  elements.librarySourceFile.textContent = summary.source_file
    ? `当前数据源：${summary.source_file}`
    : '当前数据源：未加载';
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
            <br><small>${escapeHtml(id)}</small>
            <br><small>${escapeHtml(category)}${source ? ` / ${escapeHtml(source)}` : ''}</small>
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
              <small>${escapeHtml(fields)}</small>
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
            <th>RankIC</th>
            <th>RankIC t</th>
            <th>多空收益</th>
            <th>正收益占比</th>
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
            ${subLabel ? `<small>${escapeHtml(subLabel)}</small>` : ''}
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

function renderStrategyCard(strategy) {
  const [label, tone] = labelForStatus(strategy.status);
  const exportBase = `/strategy-api/joinquant-strategy-export.json?strategy=${encodeURIComponent(strategy.id)}`;
  const exportCsv = `/strategy-api/joinquant-strategy-export.csv?strategy=${encodeURIComponent(strategy.id)}`;
  const exportScript = `/strategy-api/joinquant-strategy-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const historicalScript = `/strategy-api/joinquant-strategy-historical-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const volatilityRegimeScript = `/strategy-api/joinquant-volatility-regime-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const marketCapScript = `/strategy-api/joinquant-market-cap-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const volatilitySizeScript = `/strategy-api/joinquant-volatility-size-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  const tradingBacktestScript = `/strategy-api/joinquant-trading-backtest-script.py?strategy=${encodeURIComponent(strategy.id)}`;
  return `
    <article class="strategy-item">
      <div class="strategy-head">
        <div>
          <h3>${escapeHtml(strategy.name)}</h3>
          <p>${escapeHtml(strategy.objective)}</p>
          <p>${escapeHtml(strategy.validationState || '')}</p>
        </div>
        <span class="tag ${tone}">${escapeHtml(label)}</span>
      </div>
      <div class="strategy-columns three strategy-summary">
        <div>
          <strong>角色</strong>
          <span>${escapeHtml(strategy.role)}</span>
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
          <button type="button" data-strategy-download="${escapeHtml(exportBase)}">路线JSON</button>
          <button type="button" data-strategy-download="${escapeHtml(exportCsv)}">策略CSV</button>
          <button type="button" data-strategy-download="${escapeHtml(exportScript)}">聚宽脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(historicalScript)}">历史脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(volatilityRegimeScript)}">波动率脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(marketCapScript)}">市值脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(volatilitySizeScript)}">交叉脚本</button>
          <button type="button" data-strategy-download="${escapeHtml(tradingBacktestScript)}">回测脚本</button>
        </div>`}
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

function filteredDraftStrategies(strategies) {
  const query = draftStrategyQuery.trim().toLowerCase();
  if (!query) return strategies;
  return strategies.filter((strategy) => strategySearchText(strategy).includes(query));
}

function syncDraftStrategyJump(strategies) {
  const selected = elements.draftStrategyJump.value;
  elements.draftStrategyJump.innerHTML = [
    '<option value="">全部草案</option>',
    ...strategies.map((strategy) => `<option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.name)}</option>`),
  ].join('');
  if (strategies.some((strategy) => strategy.id === selected)) {
    elements.draftStrategyJump.value = selected;
  }
}

function renderDraftStrategies(signalPack) {
  const strategies = signalPack.strategies || [];
  syncDraftStrategyJump(strategies);

  const filtered = filteredDraftStrategies(strategies);
  const pageSize = draftStrategyExpanded ? 4 : 2;
  const pageCount = draftStrategyExpanded ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  draftStrategyPage = Math.min(Math.max(1, draftStrategyPage), pageCount);
  const visibleStrategies = draftStrategyExpanded
    ? filtered.slice((draftStrategyPage - 1) * pageSize, draftStrategyPage * pageSize)
    : filtered.slice(0, pageSize);

  elements.strategyLiveList.innerHTML = visibleStrategies.length
    ? visibleStrategies.map(renderStrategyCard).join('')
    : '<div class="empty-state"><strong>没有匹配的草案策略</strong><span>换一个关键词再筛选。</span></div>';

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

function renderLiveStrategies(signalPack) {
  const metrics = signalPack.metrics || {};
  const formalStrategies = signalPack.formalStrategies || [];
  currentStrategySignalPack = signalPack;
  elements.strategyStrongCount.textContent = metrics.draftStrategies ?? (signalPack.strategies || []).length;
  elements.strategyObservationCount.textContent = metrics.entryCandidates ?? '-';
  elements.strategyPartialCount.textContent = metrics.capitalCandidates ?? metrics.partialStrategies ?? '-';
  elements.strategyBlockedCount.textContent = metrics.formalStrategies ?? formalStrategies.length;
  elements.strategySourceFile.textContent = signalPack.source?.file
    ? `当前策略数据源：${signalPack.source.file}；技术截面 ${signalPack.source.primaryRows ?? 0} 条，资金截面 ${signalPack.source.capitalRows ?? 0} 条`
    : '当前策略数据源：未加载';

  renderDraftStrategies(signalPack);

  const formalPolicy = signalPack.formalPolicy || {};
  elements.formalStrategyPolicy.textContent = formalPolicy.description || '正式策略池只接收已完成策略级回测的组合。';
  elements.formalStrategyList.innerHTML = formalStrategies.length
    ? formalStrategies.map(renderStrategyCard).join('')
    : `
      <div class="empty-state">
        <strong>${escapeHtml(formalPolicy.title || '暂无正式策略')}</strong>
        <span>${escapeHtml(formalPolicy.nextAction || '等待策略级回测结果。')}</span>
        ${renderTextList(formalPolicy.requiredEvidence)}
      </div>
    `;

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

  elements.importedBacktestList.innerHTML = importedResults
    .map((result) => {
      const isStrategy = isStrategyBacktestResult(result);
      const title = isStrategy
        ? result.strategy_name || result.summary?.[0]?.strategy_name || '策略实测结果'
        : result.factor_name || result.factor || result.name || 'JoinQuant结果';
      const detail = isStrategy
        ? `策略结果: ${escapeHtml(result.summary?.length ?? 1)} 条 / 来源: ${escapeHtml(result.source || result.summary?.[0]?.source || 'joinquant')}`
        : `IC: ${escapeHtml(result.ic_mean ?? result.ic ?? '-')} / RankIC: ${escapeHtml(result.rank_ic_mean ?? result.rankIc ?? '-')} / 来源: ${escapeHtml(result.source || 'joinquant')}`;
      return `
        <div class="status-item">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${detail}</span>
          </div>
          <span class="tag good">已导入</span>
        </div>
      `;
    })
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
  const [summary, factors, equity, risks, paperWatchRoutes, factorSummary, strategies, factorDefinitions, liveStrategies, backtestStatus, researchPipeline] = await Promise.all([
    request('/api/summary'),
    request('/factor-api/real-factor-results?limit=100'),
    request('/backtest-api/equity'),
    request('/api/risk'),
    request('/strategy-api/paper-watch-routes'),
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
  renderPaperWatchRoutes(paperWatchRoutes);
  drawChart(equity);
  renderFactorLibrary(factorSummary, strategies, factorDefinitions, researchPipeline);
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

elements.draftStrategyJump?.addEventListener('change', () => {
  const strategyId = elements.draftStrategyJump.value;
  const strategy = (currentStrategySignalPack?.strategies || []).find((item) => item.id === strategyId);
  draftStrategyQuery = strategy ? strategy.name : '';
  draftStrategyExpanded = Boolean(strategy);
  draftStrategyPage = 1;
  elements.draftStrategySearch.value = draftStrategyQuery;
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

elements.strategyLiveList?.addEventListener('click', (event) => {
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
});

elements.paperWatchList?.addEventListener('click', async (event) => {
  const rebuildButton = event.target.closest('[data-paper-watch-rebuild]');
  if (!rebuildButton) return;
  rebuildButton.disabled = true;
  rebuildButton.textContent = '刷新中';
  try {
    await request('/paper-watch-api/rebuild-derived-packs', { method: 'POST' });
    await refreshDashboard();
  } catch (error) {
    rebuildButton.disabled = false;
    rebuildButton.textContent = `刷新失败：${error.message}`;
  }
});

elements.downloadJoinquantCsv?.addEventListener('click', () => {
  window.location.href = '/backtest-api/joinquant-factor-export.csv';
});

elements.downloadJoinquantFactorScript?.addEventListener('click', () => {
  window.location.href = '/backtest-api/joinquant-factor-test-script.py';
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
  });
});

boot();
