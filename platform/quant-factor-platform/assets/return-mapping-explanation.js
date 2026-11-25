import { modelMath, targetMath, standardizationMath, neweyWestMath, operatorMath, portfolioMath, attributionMath, registeredFactorMath } from './return-mapping-math.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const rows = (value) => Array.isArray(value) ? value : [];
const topics = [
  ['factor', '因子如何构造', '从数据到信号'],
  ['mapping', '信号如何对应收益', '从暴露到预期收益'],
  ['portfolio', '组合权重如何产生', '收益与风险的取舍'],
  ['attribution', '收益如何分解', '预测贡献与实现误差'],
  ['diagnostics', '统计结果如何判断', '口径、共线性与稳健推断'],
];

export function explanationContext(state = {}) {
  const source = state.source === 'snapshot' ? 'snapshot' : 'draft';
  const report = state.report;
  const current = Boolean(report?.status === 'ok' && !state.dirty && !state.stale && !report.stale && report.configHash === state.configHash);
  const config = source === 'snapshot' ? report?.status === 'ok' ? report.config : null : state.config;
  return { source, config, method: config?.method, current, report };
}

function values(items) {
  return `<dl class="rm-key-values">${items.filter(([, value]) => value !== undefined).map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${escape(value ?? '未提供')}</dd></div>`).join('')}</dl>`;
}

function formula(title, content) {
  return `<details class="rm-explain-formula"><summary>${escape(title)}</summary>${content}</details>`;
}

function notice(text, warning = false) {
  return `<p class="rm-notice"${warning ? ' data-tone="warning"' : ''}>${escape(text)}</p>`;
}

function factorArticle(state, context) {
  const { config, source, report, current } = context;
  const explicit = rows(state.schema?.factors).find((item) => item.id === state.explanationFactorId);
  const entry = explicit ? { factorId: explicit.id, name: explicit.name, usage: explicit.meaning } : state.activeFactor;
  if (!entry) return { title: '因子如何构造', html: '<p class="rm-explain-lead">先在研究流水线选择一个因子，再从因子档案进入这里，查看它的来源、经济逻辑和构造方式。</p><button class="rm-context-link" type="button" data-rm-explain-research>前往研究流水线</button>' };
  const factor = explicit || rows(state.schema?.factors).find((item) => item.id === entry.factorId || rows(item.aliases).includes(entry.factorId));
  const setting = rows(config.factors).find((item) => item.id === factor?.id);
  const riskModel = config.method === 'risk_premium_fmb';
  const coefficient = !riskModel && source === 'snapshot' && setting?.enabled
    ? rows(report?.model?.coefficients).find((item) => item.factorId === factor?.id) : null;
  const binding = !factor ? '未绑定收益映射' : riskModel ? '此价格/量能算子不参与风险 β 估计' : !setting?.enabled ? '算子未启用' : coefficient ? current ? '已进入当前有效模型' : '历史快照中的因子，当前不可应用' : '已配置，尚无对应估计结果';
  const definition = factor ? operatorMath(factor, setting || { enabled: false }) : registeredFactorMath(entry);
  const gaps = rows(entry.dataGaps);
  return {
    title: entry.name || entry.factorId,
    html: `<p class="rm-explain-lead">${escape(entry.usage || factor?.meaning || '这是一个已登记的研究因子。先核对它使用了什么数据，以及高低分分别表达什么经济假设，再判断研究证据是否支持这个假设。')}</p>
      ${notice(binding, !coefficient)}
      ${values([['解释对象', factor ? '独立登记的本地计算算子' : '原登记研究因子'], ['因子编号', entry.factorId], ['来源', entry.dataSource || (factor ? '本地真实价格 / 量能序列' : '以原档案来源记录为准')], ['暴露单位', factor?.unit || '来源评分单位；不自动等同于预期收益'], ['所选口径下的窗口', setting ? `${setting.lookback} 个交易日` : factor ? '未配置；下方构造展示登记默认值' : '以原登记构造为准'], ['本地映射状态', binding]])}
      ${formula('查看构造公式与字母含义', definition)}
      ${coefficient ? values([[current ? '同版本条件收益系数' : '历史快照系数（不可应用）', Number.isFinite(coefficient.estimate) ? `${(coefficient.estimate * 100).toFixed(4)}%` : '不可用'], ['系数解释', coefficient.meaning || coefficient.unit || '以快照中的原始单位为准']]) : ''}
      <p class="rm-explain-boundary">${factor ? '本地算子与来源复合因子分别登记。名称相近，不代表公式、样本或收益映射相同。' : '原登记因子可以已有外部回填证据；未绑定本地模型时，不显示其他因子的收益系数。'}</p>
      ${gaps.length ? `<details class="rm-explain-formula"><summary>本地数据缺口</summary><ul>${gaps.map((gap) => `<li>${escape(gap)}</li>`).join('')}</ul></details>` : ''}`,
  };
}

function article(state, context) {
  const { config, method, report } = context;
  const methodInfo = rows(state.schema?.methods).find((item) => item.id === method);
  const period = `${config.horizon} ${config.frequency === 'monthly' ? '个月度观测期' : '个交易日'}`;
  if (state.section === 'factor') return factorArticle(state, context);
  if (state.section === 'portfolio') return {
    title: '组合权重如何产生',
    html: `<p class="rm-explain-lead">先从同一模型的预期收益中选出候选股票，再在持仓上限内平衡收益与风险。提高风险厌恶参数，会让优化更重视组合方差。</p>
      ${values([['候选数量上限', config.portfolio?.topN], ['风险厌恶参数', config.portfolio?.riskAversion], ['单股权重上限', config.portfolio?.maxWeight === undefined ? undefined : `${(config.portfolio.maxWeight * 100).toFixed(1)}%`], ['收益期限', period]])}
      ${formula('查看组合目标、约束与字母含义', portfolioMath(config))}
      <p class="rm-explain-boundary">协方差按持有期缩放属于风险近似。现在生成的优化组合，不会被回填成此前验证组合的历史业绩。</p>`,
  };
  if (state.section === 'attribution') return {
    title: '收益如何分解',
    html: `<p class="rm-explain-lead">先计算冻结模型在当时能够给出的预测贡献，再将实际收益与预测之间的差额列为实现误差。手续费和滑点单独核对。</p>
      ${formula('查看收益分解公式与字母含义', attributionMath(method))}
      <p class="rm-explain-boundary">这里解释的是预测组成与实现误差，不是因果归因，也不等同于用实际风险因子收益乘以 β 的传统业绩归因。各项加总正确，不代表模型能够预测未来。</p>`,
  };
  if (state.section === 'diagnostics') return {
    title: '统计结果如何判断',
    html: `<p class="rm-explain-lead">先确认收益标签的时间口径和样本边界，再看共线性、稳健标准误与留出检验。显著性、预测能力和经济意义需要分别判断。</p>
      ${values([['共线性处理', config.collinearity?.method === 'orthogonalize' ? '正交化并保留基底变换' : config.collinearity?.method === 'subset' ? '相关性 / VIF 子集筛选' : '未提供'], ['相关性阈值', config.collinearity?.correlationThreshold], ['VIF 阈值', config.collinearity?.vifThreshold], ['配置的 Newey–West 滞后阶数', method === 'local_surrogate' ? '此路径不输出 FMB/HAC t 值' : config.nwLags], ['收益期限', period]])}
      ${formula('收益标签与执行时点', targetMath(config))}
      ${method !== 'risk_premium_fmb' ? formula('缩尾、标准化与暴露单位', standardizationMath(config)) : notice('严格风险模型使用第一遍估计的原始 β 单位，不采用价格特征的截面 z-score。')}
      ${method !== 'local_surrogate' ? formula('Newey–West 稳健推断', neweyWestMath(config, context.source === 'snapshot' ? report : null)) : notice('局部代理关注邻域、参考点和解释保真度。局部斜率不解释为全样本统一的风险价格。')}
      <p class="rm-explain-boundary">完整的数值诊断和样本外结果仍在原回测结果中查看；这里说明它们的定义和适用边界。</p>`,
  };
  return {
    title: '信号如何对应收益',
    html: `<p class="rm-explain-lead">${escape(methodInfo?.interpretation || '用真实历史暴露与随后实现的收益建立映射，再用训练结束时冻结的参数生成持有期预期收益。')}</p>
      ${values([['映射方法', methodInfo?.label || method], ['预测期限', period], ['观测频率', config.frequency === 'monthly' ? '月末' : '交易日'], ['模型输入', method === 'risk_premium_fmb' ? '历史估计的风险 β、真实因子收益及无风险收益' : '由真实数据构造的标准化因子暴露']])}
      ${formula('查看映射公式与字母含义', modelMath(method, config))}
      <p class="rm-explain-boundary">${method === 'risk_premium_fmb' ? '风险价格需要完整的两遍估计及真实输入；缺少因子收益或无风险收益时不能用信号分数代替。' : method === 'local_surrogate' ? '局部线性代理解释非线性预测器附近的变化，不提供因果效应或统一风险溢价。' : '条件收益系数描述控制其他特征后的历史收益关联，不自动构成因果效应或严格风险溢价。'}</p>`,
  };
}

export function renderModelExplanation(state = {}) {
  const context = explanationContext(state);
  const section = topics.some(([id]) => id === state.section) ? state.section : 'mapping';
  const scope = `<label class="rm-field">解释口径<select data-rm-explanation-source aria-label="解释口径"><option value="draft"${context.source === 'draft' ? ' selected' : ''}>当前配置${state.dirty ? '（未保存）' : ''}</option><option value="snapshot"${context.source === 'snapshot' ? ' selected' : ''}>已估计模型快照${context.current ? '' : '（历史 / 尚未估计）'}</option></select></label>`;
  if (!context.config) return `${scope}${notice(context.source === 'snapshot' ? '尚无可解释的模型快照。可以切回当前配置了解模型，或到回测配置完成估计。' : '模型参数暂未读取。请等待服务连接，或在回测配置中重新连接。')}`;
  const selected = article({ ...state, section }, context);
  const subject = section === 'factor'
    ? state.explanationFactorId ? rows(state.schema?.factors).find((factor) => factor.id === state.explanationFactorId)?.name || '因子构造' : state.activeFactor?.name || '因子构造'
    : rows(state.schema?.methods).find((method) => method.id === context.method)?.label || '收益映射模型';
  const warnings = context.source === 'snapshot' ? rows(context.report?.warnings).map((item) => typeof item === 'string' ? item : item?.message || item?.reason).filter(Boolean) : [];
  const status = context.source === 'draft' ? state.dirty ? '当前配置含未保存修改；这里解释的是编辑中的参数，不展示旧模型的系数。' : '这里解释当前配置；参数说明不代表已有同版本的估计结果。'
    : context.current ? '这里解释当前有效模型的冻结参数，与预期收益和收益分解使用同一快照。' : '这里解释历史模型快照。参数或数据已变化时，该快照只供核对，不能继续应用。';
  return `<div class="rm-explain-heading"><div><p class="rm-explain-kicker">${escape(context.source === 'draft' ? '当前配置' : '冻结模型快照')}</p><h3>${escape(subject)}</h3></div>${scope}</div>
    ${notice(status, Boolean(state.dirty || context.source === 'snapshot' && !context.current))}
    ${context.source === 'snapshot' ? values([['模型编号', context.report?.modelId], ['参数指纹', context.report?.configHash], ['暴露时点', context.report?.data?.asOf]]) : ''}
    <div class="rm-explain-layout"><nav class="rm-explain-nav" aria-label="模型解释目录">${topics.map(([id, title, hint]) => `<button type="button" data-rm-explain-section="${id}"${section === id ? ' aria-current="page"' : ''}><strong>${title}</strong><small>${hint}</small></button>`).join('')}</nav>
    <article class="rm-explain-article"><h3 tabindex="-1" data-rm-explanation-heading>${escape(selected.title)}</h3>${selected.html}
    ${warnings.length ? `<details class="rm-explain-formula"><summary>所选快照的数据与模型提醒（${warnings.length}）</summary><ul>${warnings.map((message) => `<li>${escape(message)}</li>`).join('')}</ul></details>` : ''}
    <div class="rm-explain-actions"><button class="rm-context-link" type="button" data-rm-explain-config>前往回测配置调整参数</button></div></article></div>`;
}
