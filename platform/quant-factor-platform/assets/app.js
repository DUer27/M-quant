import { preferences as fallbackPreferences } from '../preferences.js';

const appConfig = window.__QUANT_APP_CONFIG__ || {};

document.title = appConfig.title || fallbackPreferences.app.name;
document.querySelector('#api-url').textContent = appConfig.apiURL || '/api';

const elements = {
  benchmark: document.querySelector('#benchmark'),
  candidateFactorCount: document.querySelector('#candidate-factor-count'),
  demoFactorCount: document.querySelector('#demo-factor-count'),
  factorTable: document.querySelector('#factor-table'),
  factorLibraryTable: document.querySelector('#factor-library-table'),
  fee: document.querySelector('#fee'),
  formMessage: document.querySelector('#form-message'),
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
  risk: document.querySelector('#risk-control'),
  savePreferences: document.querySelector('#save-preferences'),
  runBacktest: document.querySelector('#run-backtest'),
  strategyFactorList: document.querySelector('#strategy-factor-list'),
  strategyLibraryList: document.querySelector('#strategy-library-list'),
  universe: document.querySelector('#universe'),
  validFactorCount: document.querySelector('#valid-factor-count'),
  views: document.querySelectorAll('.view'),
};

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
          <td>${Number(row.volume_price_confirmation).toFixed(2)}</td>
          <td>${Number(row.kline_event_score || 0).toFixed(0)}</td>
          <td>${Number(row.crowding_risk).toFixed(2)}</td>
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
  if (status === 'partial_real_data') return ['部分可用', 'pending'];
  if (status === 'insufficient_history' || status === 'blocked_by_resonance_history') return ['历史不足', 'watch'];
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
    technical_composite: '技术综合强度',
    trend_alignment: '趋势排列',
    volume_price_confirmation: '量价确认',
    volume_price_resonance_60_5: '价量共振_60_5',
  };
  return names[id] || id;
}

function renderFactorLibrary(summary, strategies) {
  const meta = summary.factor_meta || {};
  const availability = meta.availability || {};
  const entries = Object.entries(availability);
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
      const fields = Array.isArray(value.fields) && value.fields.length > 0
        ? value.fields.join(', ')
        : value.formula || '-';
      const note = value.reason || value.note || value.formula || '基于当前真实明细数据计算';

      return `
        <tr>
          <td><strong>${escapeHtml(factorDisplayName(id))}</strong><br><small>${escapeHtml(id)}</small></td>
          <td><span class="tag ${tone}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(fields)}</td>
          <td>${escapeHtml(note)}</td>
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
  const [summary, factors, equity, risks, factorSummary, strategies] = await Promise.all([
    request('/api/summary'),
    request('/factor-api/real-factor-results?limit=100'),
    request('/backtest-api/equity'),
    request('/api/risk'),
    request('/factor-api/real-factor-summary'),
    request('/strategy-api/definitions'),
  ]);

  renderSummary(summary);
  renderFactors(factors);
  renderRisk(risks);
  drawChart(equity);
  renderFactorLibrary(factorSummary, strategies);
  renderStrategyLibrary(strategies);
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

elements.navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showView(button.dataset.viewTarget);
  });
});

boot();
