import { renderModelExplanation } from './return-mapping-explanation.js';

const API = '/return-mapping-api';
const roots = {
  config: document.querySelector('[data-rm-config-content]'),
  portfolio: document.querySelector('[data-rm-portfolio-content]'),
  attribution: document.querySelector('[data-rm-attribution-content]'),
  explanation: document.querySelector('[data-rm-explanation-content]'),
};
const state = {
  schema: null, config: null, revision: null, configHash: null,
  report: null, portfolio: null, attribution: null,
  dirty: false, stale: false, busy: false,
  activeFactor: window.mquantReturnMappingFactor || null,
  explanationSection: 'factor', explanationSource: 'draft', explanationFactorId: null,
  explanationOrigin: null, openingExplanation: false,
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const num = (value) => (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) ? Number(value) : null;
const number = (value, digits = 3) => num(value) === null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const percent = (value, digits = 2) => num(value) === null ? '—' : `${(Number(value) * 100).toFixed(digits)}%`;
const list = (value) => Array.isArray(value) ? value : [];
const methodInfo = () => list(state.schema?.methods).find((method) => method.id === state.config?.method) || {};
const activeReport = () => state.report?.status === 'ok' && !state.dirty && !state.stale && state.report.configHash === state.configHash;
const factorName = (id) => list(state.schema?.factors).find((factor) => factor.id === id)?.name || id || '截距';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('Content-Type') || '';
  const value = contentType.includes('application/json') ? await response.json() : { message: await response.text() };
  if (!response.ok) {
    const error = new Error(value.error || value.message || `请求失败（${response.status}）`);
    error.detail = value;
    throw error;
  }
  return value;
}

function notice(message, tone = '') {
  return `<div class="rm-notice"${tone ? ` data-tone="${esc(tone)}"` : ''}>${esc(message)}</div>`;
}

function warningsHtml(warnings) {
  const values = list(warnings).map((item) => typeof item === 'string' ? item : item.message || item.reason || item.label).filter(Boolean);
  return values.length ? `<ul class="rm-warning-list">${values.map((message) => `<li>${esc(message)}</li>`).join('')}</ul>` : '';
}

function simpleValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return number(value, 5);
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? item.name || item.factorId || item.id || item.reason || '见诊断明细' : item).join('、') || '无';
  if (typeof value === 'object') return value.label || value.message || value.reason || value.description || value.method || '详见模型诊断';
  return String(value);
}

function keyValues(rows) {
  return `<dl class="rm-key-values">${rows.filter(([, value]) => value !== undefined).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(simpleValue(value))}</dd></div>`).join('')}</dl>`;
}

function table(headers, rows, caption = '') {
  return `<div class="rm-table-wrap"><table>${caption ? `<caption class="rm-help">${esc(caption)}</caption>` : ''}<thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell, i) => `<td${i ? ' class="rm-number"' : ''}>${esc(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">暂无可展示记录。</td></tr>`}</tbody></table></div>`;
}

function versionText() {
  if (state.dirty) return '参数未保存 · 结果不可应用';
  if (state.stale) return '模型快照已过期 · 请重新估计';
  if (state.report?.status === 'blocked') return '数据不足 · 模型已阻塞';
  if (activeReport()) return `模型 ${state.report.modelId}`;
  return state.configHash ? `参数 ${state.configHash.slice(0, 10)} · 待估计` : '等待模型';
}

function renderVersions() {
  document.querySelectorAll('[data-rm-version]').forEach((element) => {
    element.textContent = versionText();
    element.className = `tag ${activeReport() ? 'good' : 'pending'}`;
    element.title = state.report?.modelId || state.configHash || '';
  });
  renderExplanationView();
}

function status(message, tone = '') {
  const element = document.querySelector('#rm-operation-status');
  if (element) {
    element.textContent = message;
    element.className = `rm-status${tone === 'error' ? ' rm-error' : ''}`;
  }
}

function busy(value) {
  state.busy = value;
  document.querySelectorAll('[data-rm-action]').forEach((button) => { button.disabled = value; });
  const form = document.querySelector('#rm-mapping-form');
  form?.setAttribute('aria-busy', String(value));
  if (form) form.inert = value;
}

function jump(view, anchor) {
  const direct = document.querySelector(`[data-view-target="${view}"]`);
  if (direct) direct.click();
  else {
    const group = ['backtest-center', 'validated-results', 'factor-activity', 'strategy-results'].includes(view) ? 'evidence-retest' : 'research-strategy';
    document.querySelector(`[data-view-target="${group}"]`)?.click();
    document.querySelector(`[data-subview-target="${view}"]`)?.click();
  }
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function renderConfig() {
  if (!roots.config || !state.config || !state.schema) return;
  const config = state.config;
  const method = methodInfo();
  const selected = new Map(list(config.factors).map((factor) => [factor.id, factor]));
  const data = state.schema.dataSummary || {};
  const sourceSummary = data.policy || data.message || data.description || data.note;
  roots.config.innerHTML = `
    ${keyValues([['本地行情范围（示例文件）', [data.sampleStart, data.sampleEnd].filter(Boolean).join(' 至 ')], ['本地日线文件数', data.cachedAssetFiles], ['数据来源', data.source]])}
    <form id="rm-mapping-form">
      <div class="rm-form-grid">
        <label class="rm-field rm-wide" for="rm-method">映射路径
          <select id="rm-method" name="method">${list(state.schema.methods).map((item) => `<option value="${esc(item.id)}"${item.id === config.method ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</select>
          <small id="rm-method-meaning">${esc(method.interpretation || '系数解释以所选模型与数据口径为准。')}</small>
        </label>
        <label class="rm-field" for="rm-frequency">观测频率<select id="rm-frequency" name="frequency"><option value="daily"${config.frequency === 'daily' ? ' selected' : ''}>交易日</option><option value="monthly"${config.frequency === 'monthly' ? ' selected' : ''}>月末</option></select></label>
        <label class="rm-field" for="rm-horizon">预测期限<input id="rm-horizon" name="horizon" type="number" min="1" max="${config.frequency === 'monthly' ? 12 : 60}" step="1" value="${esc(config.horizon)}" required /><small id="rm-period-unit">${config.frequency === 'monthly' ? '单位：月度观测期' : '单位：交易日'}；不自动年化预期收益。</small></label>
        <label class="rm-field" for="rm-nw-lags">Newey–West 滞后阶数<input id="rm-nw-lags" name="nwLags" type="number" min="0" max="60" step="1" value="${esc(config.nwLags)}" required /><small>稳健标准误作用于跨期系数；月度初始值为 12。</small></label>
        <label class="rm-field" for="rm-universe">股票池<select id="rm-universe" name="universe"><option value="csi500"${config.universe === 'csi500' ? ' selected' : ''}>本地中证500成分池</option></select><small>历史成分时点与样本偏差以模型数据诊断为准。</small></label>
        <label class="rm-field" for="rm-assets">子样本股票上限<input id="rm-assets" name="maxAssets" type="number" min="20" max="200" step="1" value="${esc(config.maxAssets)}" required /><small>按代码序等间隔取研究子样本；不按事后收益选股。</small></label>
        <label class="rm-field" for="rm-min-cross">每期最少完整股票数<input id="rm-min-cross" name="minCrossSection" type="number" min="8" max="200" step="1" value="${esc(config.minCrossSection)}" required /></label>
        <label class="rm-field" for="rm-train-periods">最少训练期数<input id="rm-train-periods" name="minTrainPeriods" type="number" min="20" max="1000" step="1" value="${esc(config.minTrainPeriods)}" required /><small>不满足时阻塞计算，不以零填补。</small></label>
        <label class="rm-field" for="rm-holdout">留出检验期数<input id="rm-holdout" name="holdoutPeriods" type="number" min="5" max="120" step="1" value="${esc(config.holdoutPeriods)}" required /><small>模型在训练结束时冻结，随后留出期不再参与拟合。</small></label>
        <label class="rm-field" id="rm-risk-free-field" for="rm-risk-free"${config.method === 'risk_premium_fmb' ? '' : ' hidden'}>未来无风险收益假设<select id="rm-risk-free" name="riskFreeForecast"><option value="last_observed_compound" selected>最近已知 rf 持平并按持有期复合</option></select><small>μ 总收益 = 预测无风险收益 + β 定价超额收益；不会读取未来 rf 来生成历史预测。</small></label>
        <label class="rm-field" id="rm-risk-window-field" for="rm-risk-window"${config.method === 'risk_premium_fmb' ? '' : ' hidden'}>第一遍 β 估计窗口<input id="rm-risk-window" name="riskWindow" type="number" min="60" max="504" step="1" value="${esc(config.riskWindow ?? 120)}" required /><small>使用过去真实因子收益及 rf；单位与严格风险模型支持频率一致。</small></label>
        <label class="rm-field" for="rm-as-of">预测时点<input id="rm-as-of" name="asOf" type="date" value="${esc(config.asOf || '')}" /><small>留空使用数据允许的最近时点。</small></label>
        <label class="rm-field" for="rm-train-start">训练起始日<input id="rm-train-start" name="trainStart" type="date" value="${esc(config.trainStart || '')}" /></label>
        <label class="rm-field" for="rm-train-end">训练截止日<input id="rm-train-end" name="trainEnd" type="date" value="${esc(config.trainEnd || '')}" /><small>引擎同时校验未来收益标签的截止时间。</small></label>
        <label class="rm-field" for="rm-collinearity">共线性处理<select id="rm-collinearity" name="collinearityMethod"><option value="subset"${config.collinearity.method === 'subset' ? ' selected' : ''}>相关性 / VIF 子集筛选</option><option value="orthogonalize"${config.collinearity.method === 'orthogonalize' ? ' selected' : ''}>正交化并保留基底变换</option></select></label>
        <label class="rm-field" for="rm-correlation">相关性阈值<input id="rm-correlation" name="correlationThreshold" type="number" min="0.5" max="0.999" step="0.01" value="${esc(config.collinearity.correlationThreshold)}" required /></label>
        <label class="rm-field" for="rm-vif">VIF 阈值<input id="rm-vif" name="vifThreshold" type="number" min="1.01" max="100" step="0.01" value="${esc(config.collinearity.vifThreshold)}" required /></label>
        <label class="rm-field" id="rm-local-bandwidth-field" for="rm-local-bandwidth"${config.method === 'local_surrogate' ? '' : ' hidden'}>局部解释核带宽<input id="rm-local-bandwidth" name="localBandwidth" type="number" min="0.1" max="5" step="0.1" value="${esc(config.local?.bandwidth ?? 0.8)}" required /><small>标准化暴露空间的邻域尺度；越小越局部，需同时查看保真度。</small></label>
        <label class="rm-field" for="rm-winsor">截面单侧缩尾比例<input id="rm-winsor" name="winsorizeQuantile" type="number" min="0" max="0.1" step="0.005" value="${esc(config.winsorizeQuantile)}" required /><small>例如 0.01 表示两侧各 1%；归一化与变换保存在模型中。</small></label>
      </div>
      <div id="rm-risk-factor-note"${config.method === 'risk_premium_fmb' ? '' : ' hidden'}>${notice('此路径改用导入的因子收益序列估计风险 β。下列价格/量能特征算子不参与 β 估计；严格风险定价未完成输入与第一遍估计前保持阻塞。')}</div>
      <fieldset class="rm-fieldset" id="rm-operator-fieldset"${config.method === 'risk_premium_fmb' ? ' hidden' : ''}><legend>因子暴露与参数化算子</legend>
        <p class="rm-help">窗口与方向直接参与计算。登记因子若无法由当前数据精确复现，会在因子逻辑中显示缺口，不自动替换。</p>
        <div class="rm-factor-editor">${list(state.schema.factors).map((factor) => {
          const setting = selected.get(factor.id) || { id: factor.id, enabled: false, lookback: factor.defaultLookback, direction: factor.defaultDirection };
          return `<div class="rm-factor-editor-row" data-rm-factor="${esc(factor.id)}"><label class="rm-factor-option"><input type="checkbox" name="factor:${esc(factor.id)}"${setting.enabled ? ' checked' : ''} /><span><strong>${esc(factor.name)}</strong><small>${esc(factor.unit)}</small></span></label><label class="rm-field" for="rm-lookback-${esc(factor.id)}">窗口<input id="rm-lookback-${esc(factor.id)}" data-rm-lookback type="number" min="2" max="252" step="1" value="${esc(setting.lookback)}" required /></label><label class="rm-field" for="rm-direction-${esc(factor.id)}">方向<select id="rm-direction-${esc(factor.id)}" data-rm-direction><option value="1"${Number(setting.direction) === 1 ? ' selected' : ''}>原方向 +1</option><option value="-1"${Number(setting.direction) === -1 ? ' selected' : ''}>反方向 −1</option></select></label><button type="button" class="rm-context-link rm-operator-logic" data-rm-explain="factor" data-rm-factor-id="${esc(factor.id)}">查看${esc(factor.name)}的构造解释</button></div>`;
        }).join('')}</div>
      </fieldset>
      <fieldset class="rm-fieldset"><legend>组合约束与交易成本</legend><p class="rm-help">这些参数也写入同一模型快照。修改后重新估计，组合和验证报告不会混用版本。</p><div class="rm-form-grid">
        <label class="rm-field" for="rm-config-top-n">最多持有股票数<input id="rm-config-top-n" name="portfolioTopN" type="number" min="2" max="200" step="1" value="${esc(config.portfolio.topN)}" required /></label>
        <label class="rm-field" for="rm-config-risk-aversion">风险厌恶 γ<input id="rm-config-risk-aversion" name="portfolioRiskAversion" type="number" min="0.1" max="1000" step="0.1" value="${esc(config.portfolio.riskAversion)}" required /><small>γ 越大，越重视组合方差。</small></label>
        <label class="rm-field" for="rm-config-max-weight">单股权重上限<input id="rm-config-max-weight" name="portfolioMaxWeight" type="number" min="0.01" max="1" step="0.01" value="${esc(config.portfolio.maxWeight)}" required /></label>
        <label class="rm-field" for="rm-config-fee">单边费率<input id="rm-config-fee" name="portfolioFeeRate" type="number" min="0" max="0.02" step="0.0001" value="${esc(config.portfolio.feeRate)}" required /><small>小数比例，0.0003 = 0.03%。</small></label>
        <label class="rm-field" for="rm-config-slippage">单边滑点<input id="rm-config-slippage" name="portfolioSlippage" type="number" min="0" max="0.02" step="0.0001" value="${esc(config.portfolio.slippage)}" required /></label>
      </div></fieldset>
      <details class="rm-import" id="rm-calibration-import"><summary>严格风险溢价模型：导入真实因子收益与无风险利率</summary>
        <p class="rm-help">风险暴露 Fama–MacBeth 需要先用历史因子收益估计 β，再做截面定价。当前导入支持明确的日度小数收益；必须逐期提供 rf，缺失时阻塞，不假定无风险利率为零。</p>
        <div class="rm-actions"><label class="rm-field" for="rm-calibration-file">选择校准数据文件<input id="rm-calibration-file" type="file" accept=".json,application/json" /></label><button data-rm-action="calibration" type="button">导入校准数据</button></div>
        <p class="rm-help">文件结构包含 factorIds、frequency、units: decimal 和 rows；每行包含 date、rf 及各因子的当期收益。只有真实对齐序列可用于严格风险溢价估计。</p>
        <p id="rm-calibration-status" class="rm-status" role="status">尚未读取校准数据状态。</p>
      </details>
      <div id="rm-data-requirements">${sourceSummary ? notice(sourceSummary) : ''}${method.requires ? warningsHtml(Array.isArray(method.requires) ? method.requires : [method.requires]) : ''}</div>
      <div class="rm-actions"><button data-rm-action="save" type="button">保存映射参数</button><button class="primary" data-rm-action="fit" type="submit">保存并估计模型</button><button data-rm-action="reload" type="button">读取已保存参数</button><span id="rm-operation-status" class="rm-status" role="status" aria-live="polite">${esc(state.revision ? `参数版本 ${state.revision}` : '参数待保存')}</span></div>
    </form>
    <div id="rm-model-result"></div>`;
  const form = document.querySelector('#rm-mapping-form');
  form.addEventListener('input', handleConfigChange);
  form.addEventListener('change', handleConfigChange);
  form.addEventListener('submit', (event) => { event.preventDefault(); fitModel(); });
  form.querySelector('[data-rm-action="save"]').addEventListener('click', saveClicked);
  form.querySelector('[data-rm-action="reload"]').addEventListener('click', reloadConfig);
  form.querySelector('[data-rm-action="calibration"]').addEventListener('click', importCalibration);
  readCalibrationStatus();
  renderModelResult();
  renderVersions();
}

function readForm() {
  const form = document.querySelector('#rm-mapping-form');
  if (!form) return clone(state.config);
  const fields = new FormData(form);
  const config = clone(state.config);
  for (const key of ['method', 'frequency', 'universe']) config[key] = String(fields.get(key));
  for (const key of ['horizon', 'nwLags', 'maxAssets', 'minCrossSection', 'minTrainPeriods', 'holdoutPeriods', 'winsorizeQuantile']) config[key] = Number(fields.get(key));
  for (const key of ['trainStart', 'trainEnd', 'asOf']) config[key] = String(fields.get(key) || '') || null;
  config.collinearity = {
    method: String(fields.get('collinearityMethod')),
    correlationThreshold: Number(fields.get('correlationThreshold')),
    vifThreshold: Number(fields.get('vifThreshold')),
  };
  config.local = { ...(config.local || {}), bandwidth: Number(fields.get('localBandwidth')) };
  config.riskWindow = Number(fields.get('riskWindow'));
  config.riskFreeForecast = String(fields.get('riskFreeForecast'));
  config.portfolio = {
    topN: Number(fields.get('portfolioTopN')), riskAversion: Number(fields.get('portfolioRiskAversion')),
    maxWeight: Number(fields.get('portfolioMaxWeight')), feeRate: Number(fields.get('portfolioFeeRate')),
    slippage: Number(fields.get('portfolioSlippage')),
  };
  config.factors = list(state.schema.factors).map((factor) => {
    const row = [...form.querySelectorAll('[data-rm-factor]')].find((element) => element.dataset.rmFactor === factor.id);
    return { id: factor.id, enabled: fields.has(`factor:${factor.id}`), lookback: Number(row.querySelector('[data-rm-lookback]').value), direction: Number(row.querySelector('[data-rm-direction]').value) };
  });
  return config;
}

function handleConfigChange(event) {
  if (event.target.name === 'frequency' && event.type === 'change') {
    const monthly = event.target.value === 'monthly';
    document.querySelector('#rm-horizon').value = monthly ? 1 : 5;
    document.querySelector('#rm-nw-lags').value = monthly ? 12 : 4;
    document.querySelector('#rm-train-periods').value = monthly ? 24 : 120;
    document.querySelector('#rm-holdout').value = monthly ? 6 : 40;
    document.querySelector('#rm-period-unit').textContent = monthly ? '单位：月度观测期；不自动年化预期收益。' : '单位：交易日；不自动年化预期收益。';
  }
  state.config = readForm();
  state.dirty = true;
  state.stale = Boolean(state.report);
  const method = methodInfo();
  document.querySelector('#rm-method-meaning').textContent = method.interpretation || '';
  const dataPolicy = state.schema?.dataSummary?.policy;
  document.querySelector('#rm-data-requirements').innerHTML = (dataPolicy ? notice(dataPolicy) : '') + (method.requires ? warningsHtml(Array.isArray(method.requires) ? method.requires : [method.requires]) : '');
  document.querySelector('#rm-operator-fieldset').hidden = state.config.method === 'risk_premium_fmb';
  document.querySelector('#rm-risk-factor-note').hidden = state.config.method !== 'risk_premium_fmb';
  document.querySelector('#rm-local-bandwidth-field').hidden = state.config.method !== 'local_surrogate';
  document.querySelector('#rm-risk-window-field').hidden = state.config.method !== 'risk_premium_fmb';
  document.querySelector('#rm-risk-free-field').hidden = state.config.method !== 'risk_premium_fmb';
  document.querySelector('#rm-horizon').max = state.config.frequency === 'monthly' ? 12 : 60;
  status('参数尚未保存。旧模型仅供查看，不能继续应用到组合。');
  renderVersions(); renderPortfolio(); renderAttribution(); renderFactorSummary();
}

function validateForm() {
  const form = document.querySelector('#rm-mapping-form');
  if (!form?.reportValidity()) return false;
  if (!readForm().factors.some((factor) => factor.enabled)) {
    status('请至少启用一个因子。', 'error');
    return false;
  }
  return true;
}

async function saveConfig() {
  if (!validateForm()) return false;
  const oldHash = state.configHash;
  const response = await request('/config', { method: 'PUT', body: JSON.stringify({ config: readForm(), revision: state.revision }) });
  state.config = response.config;
  state.revision = response.revision;
  state.configHash = response.configHash;
  state.dirty = false;
  state.stale = Boolean(state.report && (state.report.stale || state.report.configHash !== state.configHash));
  if (oldHash !== state.configHash) { state.portfolio = null; state.attribution = null; }
  renderVersions(); renderPortfolio(); renderAttribution(); renderFactorSummary();
  status(state.stale ? '参数已保存。请重新估计，使回测、μ 和归因使用同一版本。' : '映射参数已保存。');
  return true;
}

async function saveClicked() {
  if (state.busy) return;
  busy(true);
  try { await saveConfig(); } catch (error) { status(error.message, 'error'); } finally { busy(false); }
}

async function reloadConfig() {
  if (state.busy) return;
  busy(true);
  try {
    const response = await request('/config');
    state.config = response.config; state.revision = response.revision; state.configHash = response.configHash;
    state.dirty = false; state.stale = Boolean(state.report && (state.report.stale || state.report.configHash !== state.configHash));
    renderConfig(); renderPortfolio(); renderAttribution(); renderFactorSummary();
    status('已读取保存的参数。');
  } catch (error) { status(error.message, 'error'); } finally { busy(false); }
}

async function fitModel() {
  if (state.busy || !validateForm()) return;
  busy(true);
  try {
    if (!await saveConfig()) return;
    status('正在使用真实历史数据估计并进行留出检验，请稍候。');
    const report = await request('/fit', { method: 'POST', body: JSON.stringify({ revision: state.revision }) });
    state.report = report; state.portfolio = null; state.attribution = null;
    state.stale = Boolean(report.stale || report.configHash !== state.configHash);
    renderModelResult(); renderPortfolio(); renderAttribution(); renderFactorSummary(); renderVersions();
    if (report.status === 'ok') status('估计完成。参数快照已连接预期收益、组合与归因。');
    else status(report.message || report.reason || '当前数据或模型条件不满足，已阻塞计算。', 'error');
  } catch (error) { status(error.message, 'error'); } finally { busy(false); }
}

async function readCalibrationStatus() {
  const element = document.querySelector('#rm-calibration-status');
  if (!element) return;
  try {
    const value = await request('/calibration-data');
    const rowCount = num(value.rows) ?? list(value.rows || value.data?.rows).length;
    const ids = list(value.factorIds || value.data?.factorIds);
    element.textContent = value.message || (rowCount ? `已保存 ${rowCount} 期真实序列；因子：${ids.join('、')}。变更校准数据后须重新估计。` : '未导入真实因子收益与 rf；严格风险溢价路径将保持阻塞。');
  } catch (error) { element.textContent = `校准数据状态暂不可读取：${error.message}`; }
}

async function importCalibration() {
  if (state.busy) return;
  const element = document.querySelector('#rm-calibration-status');
  const file = document.querySelector('#rm-calibration-file')?.files?.[0];
  if (!file) { element.textContent = '请先选择真实校准数据 JSON 文件。'; return; }
  if (file.size > 4 * 1024 * 1024) { element.textContent = '校准文件超过 4 MB，请缩小到本次估计需要的因子和日期。'; return; }
  busy(true);
  element.textContent = '正在校验并保存校准序列。';
  try {
    const payload = JSON.parse(await file.text());
    if (!Array.isArray(payload.factorIds) || !Array.isArray(payload.rows) || payload.units !== 'decimal') throw new Error('文件须包含 factorIds、rows，并声明 units 为 decimal。');
    const value = await request('/calibration-data', { method: 'PUT', body: JSON.stringify(payload) });
    state.stale = Boolean(state.report); if (state.report) state.report.stale = true; state.portfolio = null; state.attribution = null;
    element.textContent = value.message || `已保存 ${payload.rows.length} 期真实序列。请重新估计模型。`;
    renderVersions(); renderPortfolio(); renderAttribution(); renderFactorSummary();
  } catch (error) { element.textContent = error.message; } finally { busy(false); }
}

function renderModelResult() {
  const root = document.querySelector('#rm-model-result');
  if (!root) return;
  const report = state.report;
  if (!report || report.status === 'needs_run') {
    root.innerHTML = notice('尚未估计收益映射。保存参数并估计后，系数、稳健标准误与真实检验结果会在这里展示。');
    return;
  }
  if (report.status !== 'ok') {
    root.innerHTML = notice(report.message || report.reason || '当前模型条件不满足。补齐所需数据后重新估计。', 'warning') + warningsHtml(report.warnings) + diagnosticHtml(report);
    return;
  }
  const model = report.model || {};
  const coefficients = list(model.coefficients);
  const intercept = typeof model.intercept === 'object' ? model.intercept?.mean ?? model.intercept?.estimate : model.intercept;
  const isLocal = model.method === 'local_surrogate';
  const local = model.localExplanation || {};
  root.innerHTML = `
    ${report.data?.asOf ? notice(`历史时点研究：当前暴露日期为 ${report.data.asOf}，行情截止 ${report.data.rawEnd || report.data.asOf}。以下 μ 属于该数据时点，不是运行当日的收益预测。`) : ''}
    <h3 class="rm-section-title">映射系数与经济含义</h3>
    <button class="rm-context-link" type="button" data-rm-explain="mapping" data-rm-explanation-source="snapshot">查看这份模型快照的数学解释</button>
    <p class="rm-help">${esc(model.interpretation || '')}</p>
    ${isLocal ? notice(`系数表描述参考股票 ${local.anchorCode || '待指定'} 附近的局部线性代理。每只股票的非线性预测和边际贡献分别计算，不将参考点斜率当成全池统一风险价格。`) : ''}
    ${table(['因子 / 项', '系数', '稳健标准误', '稳健 t 值', '单位与解释'], coefficients.map((item) => [factorName(item.factorId), percent(item.estimate, 4), percent(item.standardError, 4), number(item.tStatistic, 3), [item.unit, item.meaning].filter(Boolean).join('；')]), '系数以收益率显示；统计解释和经济单位以模型记录为准。')}
    ${keyValues([['截距', percent(intercept, 4)], ['模型版本', report.modelId], ['标准化口径', model.normalization], ['Newey–West 核', isLocal ? '局部代理不输出 FMB/HAC t 值' : model.neweyWest?.kernel], ['实际稳健滞后阶数', isLocal ? undefined : model.neweyWest?.effectiveLags], ['稳健估计的时间样本数', isLocal ? undefined : model.neweyWest?.timeObservations], ['共线性处理', model.collinearity?.method || report.config?.collinearity?.method], ['训练标签截止', model.estimationCutoff || report.data?.trainLabelEnd]])}
    ${isLocal ? keyValues([['局部参考股票', local.anchorCode], ['核带宽', local.bandwidth], ['解释保真度（加权 R²）', number(local.weightedRSquared)], ['局部参考样本数', local.referenceRows], ['局部系数口径', local.coefficientMeaning], ['解释显著性', local.standardErrors]]) : ''}
    <button class="rm-context-link" type="button" data-rm-explain="diagnostics" data-rm-explanation-source="snapshot">了解收益口径、标准化与稳健推断</button>
    ${collinearityHtml(model.collinearity)}
    ${diagnosticHtml(report)}
    ${backtestHtml(report.backtest)}
    ${warningsHtml(report.warnings)}
    <div class="rm-actions"><button type="button" data-rm-jump="portfolio">查看预期收益与组合</button><button type="button" data-rm-jump="attribution">查看收益分解</button></div>`;
  root.querySelector('[data-rm-jump="portfolio"]').addEventListener('click', () => jump('strategy-library', 'return-mapping-portfolio'));
  root.querySelector('[data-rm-jump="attribution"]').addEventListener('click', () => jump('validated-results', 'return-mapping-attribution'));
}

function collinearityHtml(transform) {
  if (!transform) return '';
  const names = Object.keys(transform.beforeVif || {});
  const dropped = list(transform.dropped);
  const rows = names.map((id) => [factorName(id), number(transform.beforeVif[id], 3), number(transform.afterVif?.[id], 3), dropped.find((item) => item.factorId === id)?.reason || (list(transform.names).includes(id) ? '保留' : '依变换基底解释')]);
  return `<details class="rm-diagnostics"><summary>共线性筛选与基底</summary><p class="rm-help">筛选只使用训练暴露；有序正交化保留变换矩阵。收益计算和上表系数均按模型记录的原始标准化暴露口径核对，被剔除项不解释为零收益效应。</p>${keyValues([['处理方式', transform.method], ['条件数', transform.conditionNumber], ['保留基底', transform.names]])}${table(['因子', '处理前 VIF', '处理后 VIF', '处理记录'], rows)}</details>`;
}

function diagnosticHtml(report) {
  const data = report.data || {};
  const diagnostics = report.diagnostics || {};
  const collinearity = report.model?.collinearity || {};
  const labels = {
    source: '数据来源', universe: '股票池', assetCount: '参与股票数', assets: '股票数',
    startDate: '数据起始', endDate: '数据截止', asOf: '暴露时点', rawStart: '行情起始', rawEnd: '行情截止', latestPredictionDate: '最新预测时点', rawTradingDates: '行情交易日数', loadedAssets: '已加载股票数', predictionAssets: '最新有效预测数', trainPeriods: '训练期数',
    trainStart: '训练起始', trainEnd: '训练暴露截止', trainLabelEnd: '训练收益标签截止', holdoutStart: '留出开始', holdoutPeriods: '留出期数', samplePeriods: '有效期数', noLookAhead: '训练标签先于留出期', fitPeriods: '有效截面估计期数', attributionMaxAbsoluteError: '归因最大核对误差',
    firstDate: '首个观测日', lastDate: '最后观测日', predictionDate: '预测日期',
    maxVif: '最大 VIF', conditionNumber: '条件数', droppedFactors: '被筛除因子',
    fidelityR2: '局部代理拟合度 R²', localR2: '局部拟合度 R²',
    estimationPeriods: '有效估计期数', effectiveLags: '实际稳健滞后阶数',
  };
  const values = { ...data, ...diagnostics, ...collinearity };
  const rows = Object.entries(labels).filter(([key]) => values[key] !== undefined).map(([key, label]) => [label, values[key]]);
  return rows.length ? `<details class="rm-diagnostics"><summary>样本范围与统计诊断</summary>${keyValues(rows)}</details>` : '';
}

function backtestHtml(backtest) {
  const observations = list(backtest?.observations);
  const metrics = backtest?.metrics || {};
  const stats = [
    ['留出观测数', metrics.observations ?? metrics.periods ?? observations.length],
    ['样本外平均预测收益', percent(metrics.meanExpectedReturn ?? metrics.averageExpectedReturn)],
    ['样本外平均实际收益', percent(metrics.meanRealizedReturn ?? metrics.averageRealizedReturn)],
    ['预测误差 RMSE', percent(metrics.predictionRMSE ?? metrics.rmse)],
    ['留出净值累计收益', percent(metrics.cumulativeNetReturn)],
    ['留出最大回撤', percent(metrics.maxDrawdown)],
  ];
  return `<h3 class="rm-section-title">留出检验</h3><p class="rm-help">训练收益标签在截止前成熟，随后冻结同一套系数检验留出期。这里展示模型未参与拟合的真实记录。</p>${backtest?.policy ? notice(backtest.policy) : ''}${keyValues(stats)}${observations.length ? table(['预测日期', '标签截止', '预期收益', '实际收益', '预测残差'], observations.slice(-12).map((row) => [row.date, row.labelEndDate, percent(row.expectedReturn), percent(row.realizedReturn), percent(row.residual)]), '最近 12 条留出记录；重叠持有期不可将收益简单相加。') : notice('当前报告尚无有效留出观测。', 'warning')}`;
}

function renderPortfolio() {
  if (!roots.portfolio) return;
  if (!activeReport()) {
    roots.portfolio.innerHTML = notice(state.dirty || state.stale ? '参数、校准数据或计算版本已变化，旧 μ 与组合已停止应用。请保存并重新估计。' : '先在回测中心保存映射参数并估计模型，再生成预期收益与组合。', state.dirty || state.stale ? 'warning' : '') + '<div class="rm-actions"><button type="button" data-rm-jump="config">前往信号到收益设置</button></div>';
    roots.portfolio.querySelector('[data-rm-jump]').addEventListener('click', () => jump('backtest-center', 'return-mapping-config'));
    return;
  }
  const report = state.report;
  const predictions = list(report.predictions);
  const config = state.config.portfolio;
  const portfolio = state.portfolio;
  const isRisk = report.model?.method === 'risk_premium_fmb';
  roots.portfolio.innerHTML = `
    ${report.data?.asOf ? notice(`预期收益的暴露时点：${report.data.asOf}；请与运行日期区分。`) : ''}
    <p class="rm-help">先按 μ 取 TopN 候选，再在候选内求解均值方差权重。协方差按收益期限缩放，属于风险近似；权重与约束使用同一模型快照。</p>
    ${keyValues([['模型', report.modelId], ['收益期限', `${report.config?.horizon ?? state.config.horizon} ${report.config?.frequency === 'monthly' ? '个月度观测期' : '个交易日'}`], ['暴露时点', predictions[0]?.date ?? report.data?.asOf], ['有效 μ 数', predictions.length], ['未来无风险收益假设', isRisk ? '最近已知 rf 持平并按持有期复合；并非未来已知值' : undefined]])}
    ${keyValues([['最多持有股票数', config.topN], ['风险厌恶 γ', config.riskAversion], ['单股权重上限', percent(config.maxWeight)], ['单边费率 / 滑点', `${percent(config.feeRate, 3)} / ${percent(config.slippage, 3)}`]])}
    <form id="rm-portfolio-form"><div class="rm-actions"><button class="primary" type="submit" data-rm-action="portfolio">用当前 μ 生成组合</button><button type="button" data-rm-change-constraints>调整组合参数</button><span id="rm-portfolio-status" role="status" class="rm-status">${portfolio?.status === 'ok' ? '组合已生成。' : '只读取当前模型快照中保存的组合约束。'}</span></div></form>
    ${table(['股票', '名称', '预期收益 μ', ...(isRisk ? ['预期超额收益', '无风险收益预测'] : []), '暴露日期'], predictions.slice(0, 20).map((row) => [row.code, row.name, percent(row.expectedReturn, 3), ...(isRisk ? [percent(row.expectedExcessReturn, 3), percent(row.riskFreeForecast, 3)] : []), row.date]), '当前预期收益预览（最多 20 行）；完整结果保存在模型快照。')}
    <div id="rm-portfolio-result">${portfolioHtml(portfolio)}</div>`;
  roots.portfolio.querySelector('#rm-portfolio-form').addEventListener('submit', runPortfolio);
  roots.portfolio.querySelector('[data-rm-change-constraints]').addEventListener('click', () => jump('backtest-center', 'rm-config-top-n'));
  busy(state.busy);
}

function portfolioHtml(portfolio) {
  if (!portfolio) return '';
  if (portfolio.status !== 'ok') return notice(portfolio.message || portfolio.reason || '组合约束不满足，未生成权重。', 'warning') + warningsHtml(portfolio.warnings);
  const weights = list(portfolio.weights);
  return `<h3 class="rm-section-title">组合权重</h3>${keyValues([['组合预期收益', percent(portfolio.expectedReturn, 3)], ['组合风险', typeof portfolio.risk === 'number' ? percent(portfolio.risk, 3) : portfolio.risk?.volatility === undefined ? portfolio.risk?.description : percent(portfolio.risk.volatility, 3)], ['权重合计', percent(weights.reduce((sum, row) => sum + (num(row.weight) ?? 0), 0), 2)], ['目标函数', portfolio.objective]])}${table(['股票', '名称', '权重', '预期收益', '预期收益贡献'], weights.map((row) => [row.code, row.name, percent(row.weight), percent(row.expectedReturn, 3), percent(row.contribution, 3)]))}${warningsHtml(portfolio.warnings)}`;
}

async function runPortfolio(event) {
  event.preventDefault();
  if (state.busy || !activeReport()) return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  busy(true);
  const message = document.querySelector('#rm-portfolio-status');
  if (message) message.textContent = '正在求解当前约束下的组合。';
  try {
    const result = await request('/portfolio', { method: 'POST', body: JSON.stringify({ modelId: state.report.modelId, configHash: state.configHash, topN: state.report.config.portfolio.topN, riskAversion: state.report.config.portfolio.riskAversion, maxWeight: state.report.config.portfolio.maxWeight }) });
    state.portfolio = result;
    document.querySelector('#rm-portfolio-result').innerHTML = portfolioHtml(result);
    if (message) message.textContent = result.status === 'ok' ? '组合已生成，约束与模型版本均已记录。' : result.message || '组合未生成。';
  } catch (error) { if (message) { message.textContent = error.message; message.classList.add('rm-error'); } } finally { busy(false); }
}

function renderAttribution() {
  if (!roots.attribution) return;
  if (!activeReport()) {
    roots.attribution.innerHTML = notice(state.dirty || state.stale ? '模型快照已过期。请先重新估计，保证收益分解与预测使用同一模型。' : '估计收益映射后，这里读取当时冻结模型的留出收益分解。', state.dirty || state.stale ? 'warning' : '');
    return;
  }
  const report = state.attribution || state.report.attribution || {};
  const observations = list(report.observations).length ? report.observations : list(state.report.backtest?.observations);
  const factorIds = [...new Set(observations.flatMap((row) => Object.keys(row.factorContributions || {})))];
  const rows = observations.slice(-15).map((row) => {
    const factorValues = row.factorContributions || {};
    const factorSum = Object.values(factorValues).reduce((sum, value) => sum + (num(value) ?? 0), 0);
    const complete = num(row.intercept) !== null && num(row.residual) !== null && num(row.realizedReturn) !== null && Object.values(factorValues).every((value) => num(value) !== null);
    const difference = complete ? Number(row.intercept) + factorSum + Number(row.residual) - Number(row.realizedReturn) : null;
    return [row.date, percent(row.intercept, 3), ...factorIds.map((id) => percent(factorValues[id], 3)), percent(row.residual, 3), percent(row.realizedReturn, 3), percent(row.cost, 3), percent(row.netReturn, 3), difference === null ? '缺字段' : Math.abs(difference) < 1e-8 ? '通过' : `差额 ${number(difference, 8)}`];
  });
  roots.attribution.innerHTML = `
    <p class="rm-help">这里核对冻结模型的预期收益组成与实现误差：因子列是预测贡献，残差包含未预期的市场变化。它不等同于用实际风险因子收益乘β的传统业绩归因，也不构成因果解释。交易费用单列核对；加总通过仅说明口径一致，不证明预测有效。</p>
    ${keyValues([['模型版本', state.report.modelId], ['参数指纹', state.report.configHash], ['留出观测数', observations.length], ['收益口径', report.summary?.returnBasis || report.returnBasis || report.basis || '逐期收益；不将重叠期限简单累加']])}
    <div class="rm-actions"><button data-rm-action="attribution" type="button">核对收益分解</button><span id="rm-attribution-status" class="rm-status" role="status">${esc(report.message || '从模型快照读取留出记录。')}</span></div>
    ${observations.length ? table(['日期', '截距', ...factorIds.map(factorName), '残差', '实际毛收益', '成本', '净收益', '加总校验'], rows, '最近 15 条留出记录；所有贡献均为收益率单位。') : notice('该模型尚无已成熟的留出收益标签，暂不能做后验分解。', 'warning')}
    ${warningsHtml(report.warnings)}`;
  roots.attribution.querySelector('[data-rm-action="attribution"]').addEventListener('click', runAttribution);
  busy(state.busy);
}

async function runAttribution() {
  if (state.busy || !activeReport()) return;
  busy(true);
  const message = document.querySelector('#rm-attribution-status');
  if (message) message.textContent = '正在核对同一模型快照的收益分解。';
  try {
    state.attribution = await request('/attribution', { method: 'POST', body: JSON.stringify({ modelId: state.report.modelId, configHash: state.configHash }) });
    renderAttribution();
  } catch (error) { if (message) { message.textContent = error.message; message.classList.add('rm-error'); } } finally { busy(false); }
}

function explanationIsVisible() {
  return document.querySelector('#model-explanation-view')?.classList.contains('active');
}

function renderExplanationView() {
  if (!roots.explanation || !explanationIsVisible()) return;
  try {
    roots.explanation.innerHTML = renderModelExplanation({
      ...state, section: state.explanationSection, source: state.explanationSource,
    });
  } catch (error) {
    roots.explanation.textContent = `模型解释暂不可用，请返回回测配置核对参数。原因：${error.message}`;
    console.error('Model explanation rendering failed', error);
  }
}

function rememberExplanationOrigin(trigger) {
  const view = document.querySelector('.view.active');
  if (!view || view.id === 'model-explanation-view') return;
  state.explanationOrigin = {
    view: view.id.replace(/-view$/, ''), x: window.scrollX, y: window.scrollY,
    trigger: trigger || document.activeElement,
  };
}

function focusExplanationHeading() {
  const target = roots.explanation?.querySelector('[data-rm-explanation-heading]') || roots.explanation;
  target?.setAttribute('tabindex', '-1');
  target?.focus({ preventScroll: true });
}

function openExplanation(section, source, factorId, trigger) {
  rememberExplanationOrigin(trigger || document.activeElement);
  state.explanationSection = section || 'factor';
  state.explanationSource = source || 'draft';
  state.explanationFactorId = factorId || null;
  state.openingExplanation = true;
  try { jump('model-explanation'); } finally { state.openingExplanation = false; }
  renderExplanationView();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  focusExplanationHeading();
}

function renderFactorSummary() {
  const root = document.querySelector('#research-factor-detail');
  const entry = state.activeFactor;
  const head = root?.querySelector('.research-detail-head');
  if (!head || !entry) return;
  let summary = root.querySelector('[data-rm-factor-summary]');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'rm-factor-summary';
    summary.dataset.rmFactorSummary = '';
    head.after(summary);
  }
  const factor = list(state.schema?.factors).find((item) => item.id === entry.factorId || list(item.aliases).includes(entry.factorId));
  const setting = list(state.config?.factors).find((item) => item.id === factor?.id);
  const mapping = !factor ? '未绑定本地收益映射' : state.config?.method === 'risk_premium_fmb' ? '当前风险模型使用历史风险暴露 β' : !setting?.enabled ? '本地算子未启用' : activeReport() && list(state.report?.model?.coefficients).some((item) => item.factorId === factor.id) ? '已有同版本收益映射' : '尚无可应用的同版本收益映射';
  summary.innerHTML = `<span>${esc(mapping)}</span><button class="rm-context-link" type="button" data-rm-explain="factor">查看模型解释</button>`;
  renderExplanationView();
}

document.addEventListener('click', (event) => {
  const navigation = event.target.closest?.('[data-view-target="model-explanation"]');
  if (!navigation || state.openingExplanation) return;
  rememberExplanationOrigin(navigation);
  // A native event may flush microtasks between capture and target listeners.
  // Wait for the application's navigation handler before reading visibility.
  window.requestAnimationFrame(() => {
    renderExplanationView();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    focusExplanationHeading();
  });
}, true);

document.addEventListener('click', (event) => {
  const entry = event.target.closest?.('[data-rm-explain]');
  if (entry) {
    event.preventDefault();
    const section = entry.dataset.rmExplain;
    const source = entry.dataset.rmExplanationSource || (['portfolio', 'attribution'].includes(section) ? 'snapshot' : 'draft');
    openExplanation(section, source, entry.dataset.rmFactorId, entry);
    return;
  }
  const section = event.target.closest?.('[data-rm-explain-section]');
  if (section) {
    state.explanationSection = section.dataset.rmExplainSection;
    renderExplanationView();
    roots.explanation.querySelector(`[data-rm-explain-section="${state.explanationSection}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest?.('[data-rm-explanation-back]')) {
    const origin = state.explanationOrigin;
    jump(origin?.view || 'research-pipeline');
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: origin?.x || 0, top: origin?.y || 0, behavior: 'auto' });
      if (origin?.trigger?.isConnected) origin.trigger.focus({ preventScroll: true });
    });
    return;
  }
  if (event.target.closest?.('[data-rm-explain-config]')) jump('backtest-center', 'return-mapping-config');
  if (event.target.closest?.('[data-rm-explain-research]')) jump('research-pipeline');
});

document.addEventListener('change', (event) => {
  if (!event.target.matches?.('[data-rm-explanation-source]')) return;
  state.explanationSource = event.target.value === 'snapshot' ? 'snapshot' : 'draft';
  renderExplanationView();
  roots.explanation.querySelector('[data-rm-explanation-source]')?.focus({ preventScroll: true });
});

window.addEventListener('mquant:research-factor', (event) => {
  state.activeFactor = event.detail;
  state.explanationFactorId = null;
  renderFactorSummary();
});

async function initialize() {
  renderFactorSummary();
  try {
    const [schema, saved, report] = await Promise.all([
      request('/schema'), request('/config'), request('/result'),
    ]);
    state.schema = schema; state.config = saved.config; state.revision = saved.revision; state.configHash = saved.configHash;
    state.report = report.status === 'needs_run' ? null : report;
    state.stale = Boolean(state.report && (state.report.stale || state.report.configHash !== state.configHash));
    renderConfig(); renderPortfolio(); renderAttribution(); renderFactorSummary(); renderVersions();
  } catch (error) {
    roots.config.innerHTML = notice(`收益映射服务尚未就绪：${error.message}`, 'warning') + '<div class="rm-actions"><button type="button" data-rm-retry>重新连接</button></div>';
    roots.config.querySelector('[data-rm-retry]').addEventListener('click', initialize);
  }
}

initialize();
