import { preferences as fallbackPreferences } from '../preferences.js';

const appConfig = window.__QUANT_APP_CONFIG__ || {};

document.title = appConfig.title || fallbackPreferences.app.name;
document.querySelector('#api-url').textContent = appConfig.apiURL || '/api';

const elements = {
  benchmark: document.querySelector('#benchmark'),
  candidateFactorCount: document.querySelector('#candidate-factor-count'),
  demoFactorCount: document.querySelector('#demo-factor-count'),
  factorTable: document.querySelector('#factor-table'),
  fee: document.querySelector('#fee'),
  formMessage: document.querySelector('#form-message'),
  pendingFactorCount: document.querySelector('#pending-factor-count'),
  rebalance: document.querySelector('#rebalance'),
  risk: document.querySelector('#risk-control'),
  savePreferences: document.querySelector('#save-preferences'),
  runBacktest: document.querySelector('#run-backtest'),
  universe: document.querySelector('#universe'),
  validFactorCount: document.querySelector('#valid-factor-count'),
};

function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
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
      const reason = row.factor_reason || row.kline_patterns || '';
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
  const [summary, factors, equity, risks] = await Promise.all([
    request('/api/summary'),
    request('/factor-api/real-factor-results?limit=100'),
    request('/backtest-api/equity'),
    request('/api/risk'),
  ]);

  renderSummary(summary);
  renderFactors(factors);
  renderRisk(risks);
  drawChart(equity);
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

boot();
