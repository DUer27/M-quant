import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export const SCHEMA_VERSION = 'return-mapping.v1';
export const DEFAULT_CONFIG = {
  schemaVersion: SCHEMA_VERSION, method: 'characteristic_fmb', frequency: 'daily', horizon: 5,
  universe: 'csi500', maxAssets: 60, minCrossSection: 15, minTrainPeriods: 120, holdoutPeriods: 40,
  trainStart: null, trainEnd: null, asOf: null, nwLags: 4, riskWindow: 120, riskFreeForecast: 'last_observed_compound', local: { bandwidth: 0.8 },
  collinearity: { method: 'subset', correlationThreshold: 0.9, vifThreshold: 10 },
  winsorizeQuantile: 0.01,
  factors: [
    { id: 'momentum', enabled: true, lookback: 20, direction: 1 },
    { id: 'reversal', enabled: true, lookback: 5, direction: -1 },
    { id: 'volatility', enabled: true, lookback: 20, direction: -1 },
    { id: 'volume_stability', enabled: true, lookback: 20, direction: -1 },
    { id: 'liquidity', enabled: false, lookback: 20, direction: 1 },
  ],
  portfolio: { riskAversion: 10, maxWeight: 0.2, topN: 10, feeRate: 0.0003, slippage: 0.0002 },
};
export const FACTORS = [
  { id: 'momentum', name: '价格动量', formula: 'direction × [close(t) / close(t−L) − 1]，默认direction=+1', unit: '原始值：收益比例；回归暴露：截面标准差', meaning: '独立登记的可调窗口价格变化；系数表示控制其他信号后每单位标准化暴露对应的未来持有期收益变化，不替换已有复合动量定义。', defaultLookback: 20, defaultDirection: 1, aliases: [] },
  { id: 'reversal', name: '短期反转', formula: 'direction × [close(t) / close(t−L) − 1]，默认direction=−1', unit: '原始值：收益比例；回归暴露：截面标准差', meaning: '独立登记的可调窗口反转暴露；正系数代表样本内反转关联，不替换已有固定窗口或复合因子。', defaultLookback: 5, defaultDirection: -1, aliases: [] },
  { id: 'volatility', name: '低波动暴露', formula: 'direction × std(log(close(t)/close(t−1)), L, ddof=1) × √252', unit: '原始值：年化波动比例；回归暴露：截面标准差', meaning: '默认方向为−1，使低波动股票暴露更高；与复合低波动质量因子分别登记。', defaultLookback: 20, defaultDirection: -1, aliases: [] },
  { id: 'volume_stability', name: '量能稳定暴露', formula: 'direction × std(volume, L, ddof=1) / mean(volume, L)', unit: '原始值：成交量变异系数；回归暴露：截面标准差', meaning: '默认方向为−1；成交量越稳定暴露越高。该OHLCV定义不冒充已有JQ复合因子。', defaultLookback: 20, defaultDirection: -1, aliases: [] },
  { id: 'liquidity', name: '成交额规模', formula: 'log(mean(amount, L))，amount必须为真实成交额', unit: '原始值：成交额对数；回归暴露：截面标准差', meaning: '衡量成交额体量，与市值可能相关；缺成交额不使用成交量替代，不解释为流动性溢价。', defaultLookback: 20, defaultDirection: 1, aliases: [] },
];
const METHODS = [
  { id: 'characteristic_fmb', label: '线性特征映射 · Fama–MacBeth截面法', formula: 'r(i,t→t+h) = a(t) + z(i,t)ᵀλ(t) + ε；μ(i)=ā+z(i)ᵀλ̄', interpretation: 'λ为每单位标准化特征的条件收益关联；不是风险价格，也不是因果效应。先逐期截面回归，再对λ时间均值计算Newey–West标准误。', requires: ['真实且对齐的历史暴露与未来收益标签'] },
  { id: 'risk_premium_fmb', label: '严格风险暴露定价 · 两遍Fama–MacBeth', formula: 'r(i,t)−rf(t)=α(i)+β(i)ᵀf(t)+e；E[r(i)−rf]=λ₀+β(i)ᵀλ', interpretation: '需要真实风险因子收益和无风险利率时间序列；没有这些输入时阻断估计，不能用信号分数冒充β。', requires: ['真实因子收益序列', '同频无风险收益序列', '第一遍β估计及估计误差说明'] },
  { id: 'parametric_operator', label: '可解释算子构造与收益校准', formula: 'x(j)=g(j,θ)(OHLCV)；z=standardize(x)；μ=ā+Σλ̄(j)z(j)', interpretation: '窗口、方向和算子公式直接驱动真实暴露构造，再以真实持有期收益校准尺度；原始分数不当作预期收益。', requires: ['明确窗口和方向的可计算算子', '真实收益标签'] },
  { id: 'local_surrogate', label: '非线性预测 · 局部线性代理', formula: 'μ=K(X,x)ᵀy/ΣK；gₓ(z)=b₀+Σb(j)(z(j)−x(j))', interpretation: '解释真实RBF核回归预测器附近的局部敏感度；报告邻域和保真度。局部斜率不代表风险溢价或因果效应。', requires: ['真实训练样本', '可运行非线性预测器', '局部保真度检验'] },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const numeric = (value, label, min, max, integer = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw fail(`${label}须为${min}至${max}之间的${integer ? '整数' : '数值'}。`);
  return value;
};
export function validateConfig(input = {}) {
  const c = { ...clone(DEFAULT_CONFIG), ...input, collinearity: { ...DEFAULT_CONFIG.collinearity, ...input.collinearity }, portfolio: { ...DEFAULT_CONFIG.portfolio, ...input.portfolio }, local: { ...DEFAULT_CONFIG.local, ...input.local } };
  c.schemaVersion = SCHEMA_VERSION;
  if (!METHODS.some((m) => m.id === c.method)) throw fail('未知收益映射模型。');
  if (!['daily', 'monthly'].includes(c.frequency)) throw fail('频率只支持daily或monthly。');
  if (c.universe !== 'csi500') throw fail('本版本使用明确披露的静态中证500研究子样本。');
  numeric(c.horizon, '预测周期', 1, c.frequency === 'monthly' ? 12 : 60, true);
  numeric(c.maxAssets, '股票数', 20, 200, true); numeric(c.minCrossSection, '最小截面股票数', 8, c.maxAssets, true);
  numeric(c.minTrainPeriods, '训练期数', 20, 1000, true); numeric(c.holdoutPeriods, '留出验证期数', 5, 120, true);
  numeric(c.nwLags, 'Newey–West滞后阶数', 0, 60, true);
  numeric(c.riskWindow, '第一遍β估计期数', 60, 504, true); numeric(c.local.bandwidth, '局部核带宽', 0.1, 5);
  if (c.riskFreeForecast !== 'last_observed_compound') throw fail('无风险收益预测当前仅支持明确披露的最近已知值持平复合假设。');
  if (c.nwLags >= c.minTrainPeriods) throw fail('Newey–West滞后阶数必须小于最少训练期数。');
  if (c.nwLags < c.horizon - 1) throw fail('重叠持有期收益要求Newey–West滞后阶数至少为预测周期减一。');
  numeric(c.winsorizeQuantile, '截尾比例', 0, 0.1);
  if (!['subset', 'orthogonalize'].includes(c.collinearity.method)) throw fail('共线性处理只支持子集筛选或有序正交化。');
  numeric(c.collinearity.correlationThreshold, '相关性阈值', 0.5, 0.9999); numeric(c.collinearity.vifThreshold, 'VIF阈值', 1.01, 100);
  for (const key of ['trainStart', 'trainEnd', 'asOf']) {
    if (c[key] === '') c[key] = null;
    if (c[key] !== null) {
      const date = typeof c[key] === 'string' ? new Date(`${c[key]}T00:00:00Z`) : null;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(c[key]) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== c[key]) throw fail(`${key}须为有效的YYYY-MM-DD日期。`);
    }
  }
  if (c.trainStart && c.trainEnd && c.trainStart > c.trainEnd) throw fail('训练开始日期不能晚于结束日期。');
  if (c.trainEnd && c.asOf && c.trainEnd >= c.asOf) throw fail('训练截止日期必须早于预测时点。');
  if (!Array.isArray(c.factors) || !c.factors.length || c.factors.length > FACTORS.length) throw fail('请选择有明确算子定义的因子。');
  const ids = new Set();
  c.factors = c.factors.map((f) => {
    if (!FACTORS.some((known) => known.id === f.id) || ids.has(f.id)) throw fail('因子标识未知或重复；不会用OHLCV代理替换同名旧因子。');
    ids.add(f.id); numeric(f.lookback, '因子窗口', 2, 252, true);
    if (typeof f.enabled !== 'boolean' || ![1, -1].includes(f.direction)) throw fail('因子须明确启用状态和±1方向。');
    return { id: f.id, enabled: f.enabled, lookback: f.lookback, direction: f.direction };
  });
  if (!c.factors.some((f) => f.enabled)) throw fail('至少启用一个因子。');
  numeric(c.portfolio.riskAversion, '风险厌恶系数', 0.1, 1000); numeric(c.portfolio.maxWeight, '个股权重上限', 0.01, 1);
  numeric(c.portfolio.topN, '组合候选数', 2, c.maxAssets, true);
  if (c.portfolio.maxWeight * c.portfolio.topN < 1 - 1e-10) throw fail('候选数乘权重上限小于1，无法构成全额投资组合。');
  numeric(c.portfolio.feeRate, '单边费率', 0, 0.02); numeric(c.portfolio.slippage, '单边滑点', 0, 0.02);
  return c;
}
export function projectCappedSimplex(values, cap) {
  if (values.length * cap < 1 - 1e-10) throw fail('有效股票不足，权重上限下无法满仓。');
  let lo = Math.min(...values) - 1; let hi = Math.max(...values);
  for (let n = 0; n < 80; n++) {
    const mid = (lo + hi) / 2;
    const total = values.reduce((s, v) => s + Math.min(cap, Math.max(0, v - mid)), 0);
    if (total > 1) lo = mid; else hi = mid;
  }
  return values.map((v) => Math.min(cap, Math.max(0, v - (lo + hi) / 2)));
}
export function optimizePortfolio(report, options = {}) {
  const policy = { ...report.config.portfolio, ...options };
  numeric(policy.topN, '组合候选数', 2, 200, true); numeric(policy.maxWeight, '个股权重上限', 0.01, 1); numeric(policy.riskAversion, '风险厌恶系数', 0.1, 1000);
  const risk = report.risk;
  if (!risk || !Array.isArray(risk.codes) || !Array.isArray(risk.covariance)) throw fail('尚无与模型快照对齐的真实风险协方差，不能运行组合优化。', 422);
  const codes = new Map(risk.codes.map((c, i) => [c, i]));
  const picks = (report.predictions || []).filter((p) => Number.isFinite(p.expectedReturn) && codes.has(p.code)).sort((a, b) => b.expectedReturn - a.expectedReturn).slice(0, policy.topN);
  if (!picks.length || picks.length * policy.maxWeight < 1 - 1e-10) throw fail('有效预测与风险样本不足，当前权重约束下无法满仓。', 422);
  const cov = picks.map((a) => picks.map((b) => risk.covariance[codes.get(a.code)]?.[codes.get(b.code)]));
  if (cov.some((row) => row.some((v) => typeof v !== 'number' || !Number.isFinite(v)))) throw fail('风险协方差含缺失值，不能以零替代。', 422);
  const n = picks.length; let w = Array(n).fill(1 / n);
  const lipschitz = Math.max(...cov.map((row) => row.reduce((s, v) => s + Math.abs(v), 0))) * policy.riskAversion;
  const step = 1 / Math.max(lipschitz, 1e-9); let iterations = 0;
  for (; iterations < 2000; iterations++) {
    const next = projectCappedSimplex(w.map((value, i) => value + step * (picks[i].expectedReturn - policy.riskAversion * cov[i].reduce((s, v, j) => s + v * w[j], 0))), policy.maxWeight);
    const delta = Math.max(...next.map((v, i) => Math.abs(v - w[i]))); w = next;
    if (delta < 1e-10) break;
  }
  const expectedReturn = picks.reduce((s, p, i) => s + p.expectedReturn * w[i], 0);
  const variance = w.reduce((s, v, i) => s + v * cov[i].reduce((t, c, j) => t + c * w[j], 0), 0);
  if (variance < -1e-10) throw fail('风险协方差不满足有效方差要求。', 422);
  return { status: 'ok', modelId: report.modelId, configHash: report.configHash, asOf: report.data?.asOf || report.predictions?.[0]?.date, horizon: report.config.horizon,
    weights: picks.map((p, i) => ({ code: p.code, name: p.name, weight: w[i], expectedReturn: p.expectedReturn, contribution: w[i] * p.expectedReturn })),
    expectedReturn, risk: Math.sqrt(Math.max(0, variance)), variance,
    objective: 'max μᵀw − (γ/2)wᵀΣw，Σw=1，0≤w≤单股上限', objectiveValue: expectedReturn - policy.riskAversion / 2 * variance,
    diagnostics: { iterations, weightSum: w.reduce((s, v) => s + v, 0), maximumWeight: Math.max(...w), policy, covariance: risk.sourceDates || risk.source || null },
    warnings: ['先按μ选TopN候选子集，再在子集内求解均方差；不声称全股票池全局最优。', '研究组合权重，不创建订单。μ与Σ均来自同一训练快照；协方差按预测周期缩放属于风险近似。', '该组合为当前历史时点的构建结果，不将其回填为已有验证组合的历史业绩。'],
  };
}

export function createReturnMappingService({ root, projectRoot, pythonExecutable, sendJson }) {
  const folder = join(root, 'data', 'return-mapping');
  const configPath = join(folder, 'config.json'); const latestPath = join(folder, 'latest.json'); const calibrationPath = join(folder, 'calibration.json');
  const engine = join(projectRoot, 'tools', 'factor_return_mapping.py');
  const loadedServiceHash = hash(readFileSync(new URL(import.meta.url), 'utf8'));
  let fitting = false;
  const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  function write(path, value) { mkdirSync(folder, { recursive: true }); const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); renameSync(temp, path); }
  const current = () => read(configPath, { config: clone(DEFAULT_CONFIG), revision: 0, configHash: hash(DEFAULT_CONFIG) });
  async function body(req) { let bytes = 0; const chunks = []; for await (const chunk of req) { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) throw fail('输入超过4MB，请减少样本。', 413); chunks.push(chunk); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw fail('请求须为有效JSON。'); } }
  function summary() {
    const directory = join(projectRoot, 'outputs', 'sources', 'akshare', 'raw', 'a_share_daily');
    const paths = existsSync(directory) ? readdirSync(directory).filter((f) => /^\d{6}\.csv$/.test(f)) : [];
    const text = paths.length ? readFileSync(join(directory, paths[0]), 'utf8').trim().split(/\r?\n/) : [];
    return { cachedAssetFiles: paths.length, sampleStart: text[1]?.split(',')[0] || null, sampleEnd: text.at(-1)?.split(',')[0] || null, source: 'AkShare与后续腾讯补采的本地qfq日线缓存', policy: '静态中证500成分的代码序等间隔研究子样本；不是历史时点成分池。缺字段不补零、不跨日期填充。预测时点以数据日期为准。', riskFactorReturnsAvailable: existsSync(calibrationPath) };
  }
  async function calculate(config, calibration) {
    if (!existsSync(engine)) throw fail('计算引擎尚未安装。', 503);
    return await new Promise((resolve, reject) => {
      const child = spawn(pythonExecutable, [engine], { cwd: projectRoot, env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; let errors = ''; let exceeded = false;
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(fail('计算超时，请减少股票数或训练范围。', 504)); }, 240000);
      child.stdout.on('data', (c) => { output += c; if (output.length > 32 * 1024 * 1024) { exceeded = true; child.kill('SIGTERM'); } });
      child.stderr.on('data', (c) => { if (errors.length < 8000) errors += c; });
      child.on('error', (error) => { clearTimeout(timer); reject(fail(`无法启动数学引擎：${error.message}`, 503)); });
      child.on('close', (code) => { clearTimeout(timer); if (exceeded) return reject(fail('计算输出过大，请缩小研究范围。', 413)); try { const result = JSON.parse(output); if (code !== 0 && !result.status) throw Error(errors || `exit ${code}`); resolve(result); } catch { reject(fail(`数学引擎未返回有效结果：${errors.slice(-1500) || `exit ${code}`}`, 500)); } });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ action: 'fit', projectRoot, config, ...(calibration ? { factorReturns: calibration } : {}) }));
    });
  }
  const getReport = (id) => {
    const modelId = id || read(latestPath, {}).modelId;
    if (!modelId) return null;
    if (!/^rm_[a-f0-9-]{36}$/.test(modelId)) throw fail('模型快照标识无效。');
    const report = read(join(folder, `${modelId}.json`), null);
    if (!report) throw fail('未找到对应的模型快照。', 404);
    return report;
  };
  function sourceSignature(data) {
    const paths = [data?.universeFile, ...(data?.codes || []).map((code) => `outputs/sources/akshare/raw/a_share_daily/${code}.csv`)];
    return hash(paths.filter(Boolean).map((path) => { const full = join(projectRoot, path); if (!existsSync(full)) return [path, null]; const stat = statSync(full); return [path, stat.size, stat.mtimeMs]; }));
  }
  function staleReasons(report) {
    const reasons = [];
    if (report.configHash !== current().configHash) reasons.push('映射参数已变化');
    if (report.calibrationHash !== (existsSync(calibrationPath) ? hash(read(calibrationPath)) : null)) reasons.push('风险因子校准数据已变化');
    if (!existsSync(engine) || report.engineHash !== hash(readFileSync(engine, 'utf8'))) reasons.push('计算引擎已变化');
    if (report.serviceHash !== hash(readFileSync(new URL(import.meta.url), 'utf8'))) reasons.push('映射服务实现已变化');
    if (report.data?.codes && report.sourceSignature !== sourceSignature(report.data)) reasons.push('行情或成分池数据已变化');
    return reasons;
  }
  return async (req, res, pathname) => {
    if (!pathname.startsWith('/return-mapping-api/')) return false;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (req.method === 'GET' && pathname === '/return-mapping-api/schema') {
        sendJson(res, { schemaVersion: SCHEMA_VERSION, methods: METHODS, factors: FACTORS, defaults: clone(DEFAULT_CONFIG), dataSummary: summary(), capabilities: { persistedSnapshots: true, nonlinearPredictor: 'RBF kernel regression', strictRiskDataRequired: true, portfolio: 'long_only_mean_variance', attribution: 'frozen_model_out_of_sample' } }); return true;
      }
      if (pathname === '/return-mapping-api/config' && req.method === 'GET') { sendJson(res, current()); return true; }
      if (pathname === '/return-mapping-api/config' && req.method === 'PUT') {
        if (fitting) throw fail('正在估计模型，请等待本次完成后再修改参数。', 409);
        const input = await body(req); if (fitting) throw fail('正在估计模型，请完成后再保存参数。', 409); const before = current();
        if (input.revision !== undefined && input.revision !== before.revision) throw fail('参数版本已变化，请刷新后保存。', 409);
        const config = validateConfig(input.config || input); const configHash = hash(config);
        const state = { config, revision: before.revision + (configHash === before.configHash ? 0 : 1), configHash };
        write(configPath, state); sendJson(res, state); return true;
      }
      if (pathname === '/return-mapping-api/calibration-data' && req.method === 'GET') {
        const data = read(calibrationPath, null);
        sendJson(res, { available: Boolean(data), factorIds: data?.factorIds || [], rows: data?.rows?.length || 0, frequency: data?.frequency || null, dataHash: data ? hash(data) : null, requiredSchema: { frequency: 'daily', units: 'decimal', factorIds: ['market', 'size', 'value'], rows: [{ date: 'YYYY-MM-DD', rf: '真实同频无风险收益，数值', market: '真实超额因子收益，数值', size: '真实因子收益，数值', value: '真实因子收益，数值' }] } }); return true;
      }
      if (pathname === '/return-mapping-api/calibration-data' && req.method === 'PUT') {
        if (fitting) throw fail('模型估计中，不能更换校准数据。', 409);
        const data = await body(req); if (fitting) throw fail('正在估计模型，不能更换校准数据。', 409);
        if (data.units !== 'decimal' || data.frequency !== 'daily' || !Array.isArray(data.factorIds) || !data.factorIds.length || data.factorIds.length > 5 || !Array.isArray(data.rows) || data.rows.length < 20) throw fail('请提供daily频率、decimal单位的真实因子收益和rf序列，至少20个日期。');
        if (new Set(data.factorIds).size !== data.factorIds.length || data.factorIds.some((id) => !/^[a-z][a-z0-9_]{0,30}$/.test(id) || ['date', 'rf', '__proto__', 'constructor'].includes(id))) throw fail('风险因子名称无效或重复。');
        const dates = new Set();
        for (const row of data.rows) {
          const date = new Date(`${row.date}T00:00:00Z`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date || dates.has(row.date) || ['rf', ...data.factorIds].some((key) => typeof row[key] !== 'number' || !Number.isFinite(row[key])) || row.rf <= -1) throw fail('日期须真实有效且唯一，rf和因子收益须为真实有限数值（rf大于−100%）；缺失不可补零。');
          dates.add(row.date);
        }
        const clean = { frequency: 'daily', units: 'decimal', factorIds: data.factorIds, rows: data.rows.map((r) => Object.fromEntries(['date', 'rf', ...data.factorIds].map((k) => [k, r[k]]))).sort((a, b) => a.date.localeCompare(b.date)) };
        write(calibrationPath, clean); sendJson(res, { status: 'ok', rows: clean.rows.length, factorIds: clean.factorIds, dataHash: hash(clean), message: '真实风险因子数据已保存；已有模型快照保持不变，请重新估计。' }); return true;
      }
      if (pathname === '/return-mapping-api/fit' && req.method === 'POST') {
        if (fitting) throw fail('已有模型正在估计，请等待完成。', 409);
        const input = await body(req); if (fitting) throw fail('已有模型正在估计，请等待完成。', 409); const state = current();
        if (input.config && hash(validateConfig(input.config)) !== state.configHash) throw fail('配置尚未保存，请先保存后再估计，确保各功能使用同一参数。', 409);
        if (input.revision !== undefined && input.revision !== state.revision) throw fail('参数版本已变化，请刷新后重新估计。', 409);
        fitting = true;
        try {
          const engineHash = existsSync(engine) ? hash(readFileSync(engine, 'utf8')) : null;
          if (loadedServiceHash !== hash(readFileSync(new URL(import.meta.url), 'utf8'))) throw fail('映射服务已更新，请重启服务后估计，避免代码版本混用。', 409);
          const calibration = read(calibrationPath, null); const result = await calculate(state.config, calibration);
          if (engineHash !== hash(readFileSync(engine, 'utf8'))) throw fail('计算期间引擎版本发生变化，请重新估计。', 409);
          const report = { ...result, modelId: `rm_${randomUUID()}`, schemaVersion: SCHEMA_VERSION, config: state.config, configHash: state.configHash, revision: state.revision, createdAt: new Date().toISOString(), engineHash, serviceHash: loadedServiceHash, calibrationHash: calibration ? hash(calibration) : null, sourceSignature: sourceSignature(result.data) };
          const asOf = report.data?.asOf || report.data?.latestPredictionDate;
          if (asOf) report.warnings = [...(report.warnings || []), `预测依据截至${String(asOf).slice(0, 10)}的历史缓存；运行日期不代表实时行情日期。`];
          write(join(folder, `${report.modelId}.json`), report); write(latestPath, { modelId: report.modelId });
          sendJson(res, report);
        } finally { fitting = false; }
        return true;
      }
      if (pathname === '/return-mapping-api/result' && req.method === 'GET') {
        const report = getReport(url.searchParams.get('modelId'));
        const reasons = report ? staleReasons(report) : [];
        sendJson(res, report ? { ...report, stale: reasons.length > 0, staleReasons: reasons } : { status: 'needs_run', message: '保存映射参数后，运行真实数据估计。' }); return true;
      }
      if (pathname === '/return-mapping-api/expected-returns' && req.method === 'GET') {
        const report = getReport(url.searchParams.get('modelId'));
        if (!report || report.status !== 'ok') throw fail('请先估计可用的模型快照。', 422);
        const reasons = staleReasons(report);
        if (reasons.length) throw fail(`当前快照不可用于新的组合输入：${reasons.join('；')}。`, 409);
        sendJson(res, { status: 'ok', modelId: report.modelId, configHash: report.configHash, asOf: report.data?.asOf, horizon: report.config.horizon, frequency: report.config.frequency, units: 'decimal_holding_period_return', mu: report.predictions, source: '冻结模型快照；预期收益、组合优化和归因共用该版本。' }); return true;
      }
      if (['/return-mapping-api/portfolio', '/return-mapping-api/attribution'].includes(pathname) && req.method === 'POST') {
        const input = await body(req);
        if (!input.modelId) throw fail('请明确选择模型快照modelId，避免混用参数。');
        const report = getReport(input.modelId);
        if (input.configHash && input.configHash !== report.configHash) throw fail('模型与参数指纹不匹配。', 409);
        if (report.status !== 'ok') throw fail('该模型尚未通过计算，不能生成组合或归因。', 422);
        if (pathname.endsWith('/portfolio')) {
          if (staleReasons(report).length) throw fail('参数、数据或计算实现已变化，请重新估计后再构建组合。', 409);
          const requested = input.options || input;
          for (const key of ['topN', 'riskAversion', 'maxWeight']) if (requested[key] !== undefined && requested[key] !== report.config.portfolio[key]) throw fail('组合约束须保存至同一套映射参数并重新估计，避免结果混用。', 409);
          sendJson(res, optimizePortfolio(report));
        } else {
          sendJson(res, { ...(report.attribution || {}), status: 'ok', modelId: report.modelId, configHash: report.configHash, observations: report.backtest?.observations || [], summary: report.attribution?.summary || report.backtest?.metrics || {}, warnings: report.warnings || [], policy: '使用该快照冻结系数与预先确定的验证组合；截距+因子贡献+残差=实际毛收益。成本单列；累计归因仅使用链接后的贡献。' });
        }
        return true;
      }
      throw fail('映射接口不存在。', 404);
    } catch (error) { sendJson(res, { status: 'error', error: error.message }, error.status || 500); return true; }
  };
}
