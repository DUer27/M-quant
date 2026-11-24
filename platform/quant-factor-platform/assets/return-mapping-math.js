// Presentation only. The displayed symbols describe the existing calculation engine.
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = (name, value) => `<${name}>${value}</${name}>`;
const v = (value) => tag('mi', html(value));
const n = (value) => tag('mn', html(value));
const o = (value) => tag('mo', html(value));
const row = (...values) => tag('mrow', values.join(''));
const idx = (symbol, ...indices) => tag('msub', v(symbol) + row(...indices.flatMap((value, i) => [i ? o(',') : '', typeof value === 'number' ? n(value) : v(value)])));
const sub = (symbol, index) => tag('msub', symbol + index);
const sup = (symbol, power) => tag('msup', symbol + power);
const bar = (symbol) => `<mover accent="true">${symbol}${o('¯')}</mover>`;
const hat = (symbol) => `<mover accent="true">${symbol}${o('ˆ')}</mover>`;
const frac = (a, b) => tag('mfrac', a + b);
const sqrt = (a) => tag('msqrt', a);
const par = (...a) => row(o('('), ...a, o(')'));
const normal = (text) => `<mi mathvariant="normal">${html(text)}</mi>`;
const call = (name, ...args) => row(normal(name), par(...args.flatMap((a, i) => i ? [o(','), a] : [a])));
const sum = (index, lower, upper, content) => row(tag('munderover', o('∑') + row(v(index), o('='), lower) + upper), content);
const product = (index, lower, upper, content) => row(tag('munderover', o('∏') + row(v(index), o('='), lower) + upper), content);
const lines = (...expressions) => `<mtable columnalign="left" rowspacing="0.65em">${expressions.map((expression) => `<mtr><mtd>${expression}</mtd></mtr>`).join('')}</mtable>`;
const held = (symbol, ...indices) => sup(idx(symbol, ...indices), par(v('h')));
const z = () => idx('z', 'i', 'j', 't');
const x = () => idx('x', 'i', 'j', 't');
const lambda = () => sub(bar(v('λ')), v('j'));
const finite = (value, fallback) => Number.isFinite(Number(value)) && value !== null ? Number(value) : fallback;
const period = (config = {}) => config.frequency === 'monthly' ? `${config.horizon ?? 1}个月度观测期` : `${config.horizon ?? 5}个交易日`;
const math = (expression, label = '', display = false) => `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}${label ? ` aria-label="${html(label)}"` : ''}>${expression}</math>`;

export function equationBlock(expression, symbols, { label = '', note = '', title = '' } = {}) {
  return `${title ? `<h4 class="rm-equation-title">${html(title)}</h4>` : ''}<figure class="rm-equation-block"><div class="rm-equation-display">${math(expression, label, true)}</div><figcaption class="rm-equation-caption"><p class="rm-equation-lead">其中：</p><dl class="rm-symbol-list">${symbols.map(([symbol, meaning]) => `<div><dt>${math(symbol)}</dt><dd>${html(meaning)}</dd></div>`).join('')}</dl>${note ? `<p class="rm-equation-note">${html(note)}</p>` : ''}</figcaption></figure>`;
}

export function modelMath(method = 'characteristic_fmb', config = {}) {
  const indices = [[v('i'), '股票编号。'], [v('j'), '因子编号。'], [v('t'), '形成信号时的观测日期；只能使用此时已经可获得的数据。'], [v('h'), `预测持有期；当前为${period(config)}。`], [v('K'), '本路径登记的原始因子数量；实际保留子集或基底见诊断，被筛除项不作独立系数解释。']];
  if (method === 'risk_premium_fmb') {
    const beta = hat(idx('β', 'i', 'j'));
    const stage1 = row(idx('r', 'i', 's'), o('−'), idx('r', 'f', 's'), o('='), idx('α', 'i'), o('+'), sum('j', n(1), v('K'), row(idx('β', 'i', 'j'), idx('f', 'j', 's'))), o('+'), idx('e', 'i', 's'));
    const stage2 = row(held('R', 'i', 't'), o('−'), held('R', 'f', 't'), o('='), idx('λ', 0, 't'), o('+'), sum('j', n(1), v('K'), row(beta, idx('λ', 'j', 't'))), o('+'), idx('u', 'i', 't'));
    const forecast = row(hat(idx('μ', 'i', 't')), o('='), hat(held('R', 'f', 't')), o('+'), sub(bar(v('λ')), n(0)), o('+'), sum('j', n(1), v('K'), row(beta, lambda())));
    return equationBlock(lines(stage1, stage2, forecast), [...indices, [v('s'), `第一遍β估计阶段的历史交易日；窗口当前为${config.riskWindow ?? 120}期，与后续λ估计及留出检验分开。`], [idx('r', 'i', 's'), '股票i在历史日s的收盘到收盘收益率，用于估计第一遍风险暴露。'], [idx('r', 'f', 's'), '真实、同频的无风险收益率；来自导入序列，不默认填零。'], [idx('f', 'j', 's'), '导入的第j个风险因子在日s的真实因子收益率。'], [idx('α', 'i'), '第一遍时间序列回归的股票截距。'], [idx('β', 'i', 'j'), '第一遍模型中的待估风险暴露参数。'], [beta, '第一遍估计并冻结的风险暴露β，使用原始β单位，不做截面z-score。'], [held('R', 'i', 't'), '信号形成后、按平台开收盘执行口径计算的实际持有期收益。'], [held('R', 'f', 't'), '对应持有期内真实无风险收益的复合值，用于历史超额收益标签。'], [idx('λ', 0, 't'), '第二遍截面回归在当期估计的定价截距。'], [idx('λ', 'j', 't'), '第二遍截面回归估计的当期风险价格。'], [lambda(), '训练期风险价格的时间平均；表示每增加一单位β所对应的持有期预期超额收益。'], [sub(bar(v('λ')), n(0)), '第二遍截面定价截距的时间平均，不等同于无风险收益。'], [hat(held('R', 'f', 't')), '未来无风险收益的预测：采用时点t可获得的最近无风险日收益，按持有期持平复合。'], [hat(idx('μ', 'i', 't')), '股票i在时点t的持有期预期总收益率，包含预测无风险收益。'], [row(idx('e', 'i', 's'), o(','), idx('u', 'i', 't')), '分别为第一遍时间序列回归和第二遍截面回归的残差。']], { label: '严格风险暴露模型，第一遍估计β，第二遍估计风险价格，再生成总预期收益', note: '仅在导入真实因子收益和无风险收益后可估计；Newey–West调整不等同于Shanken修正。' });
  }
  if (method === 'local_surrogate') {
    const psi = (value) => call('ψ', value);
    const zz = idx('z', 'n');
    const kernel = call('K', psi(v('z')), psi(zz), v('ρ'));
    const prediction = row(call('m', v('z')), o('='), frac(sum('n', n(1), v('N'), row(kernel, idx('R', 'n'))), sum('n', n(1), v('N'), kernel)));
    const kernelFormula = row(call('K', v('a'), v('c'), v('ρ')), o('='), call('exp', row(o('−'), frac(sup(row(o('‖'), v('a'), o('−'), v('c'), o('‖')), n(2)), row(n(2), sup(v('ρ'), n(2)))))));
    const surrogate = row(call('g', v('z'), idx('z', 0)), o('='), call('m', idx('z', 0)), o('+'), sum('j', n(1), v('K'), row(row(idx('b', 'j'), par(idx('z', 0))), par(idx('z', 'j'), o('−'), idx('z', 0, 'j')))));
    return equationBlock(lines(prediction, kernelFormula, surrogate), [[v('z'), '当前股票的标准化因子暴露向量。'], [v('j'), '暴露分量或因子编号。'], [v('K'), '回转到原始暴露坐标后的因子维度；实际保留基底见诊断。'], [v('n'), '真实历史训练样本编号。'], [row(v('a'), o(','), v('c')), '进行高斯核距离计算的两个变换后暴露向量。'], [idx('z', 'n'), '第n条真实历史训练样本的暴露向量。'], [idx('R', 'n'), '第n条训练样本已经成熟的真实持有期收益标签。'], [v('N'), '非线性预测器实际使用的历史训练样本数；不含留出期未来收益。'], [call('ψ', v('z')), '训练阶段确定并冻结的共线性处理变换。'], [call('K', v('a'), v('c'), v('ρ')), '对变换后的两个暴露向量计算的高斯核权重。'], [v('ρ'), `核带宽，对应界面的带宽参数，当前为${finite(config.local?.bandwidth, 0.8)}；控制邻域范围。`], [call('m', v('z')), '真实RBF核回归预测器给出的持有期预期收益。'], [idx('z', 0), '当前解释的参考股票暴露点。'], [row(idx('b', 'j'), par(idx('z', 0))), '在参考点邻域用加权最小二乘得到的第j个局部代理斜率；核带宽使用独立符号ρ表示。'], [call('g', v('z'), idx('z', 0)), '锚定参考点预测值的局部线性代理；仅在邻域内解释非线性预测器。']], { label: '非线性核回归预测和参考点局部线性代理', note: '局部斜率不是风险溢价。报告的加权R²衡量解释保真度，不是未来收益预测准确率。各股票的预测贡献使用各自位置的核预测器梯度。' });
  }
  const exposure = method === 'parametric_operator' ? row(x(), o('='), idx('d', 'j'), call('g', idx('X', 'i', 't'), idx('θ', 'j'))) : null;
  const regression = row(held('R', 'i', 't'), o('='), idx('a', 't'), o('+'), sum('j', n(1), v('K'), row(idx('λ', 'j', 't'), z())), o('+'), held('ε', 'i', 't'));
  const forecast = row(hat(idx('μ', 'i', 't')), o('='), bar(v('a')), o('+'), sum('j', n(1), v('K'), row(lambda(), z())));
  const averaging = row(lambda(), o('='), frac(n(1), v('T')), sum('τ', n(1), v('T'), hat(idx('λ', 'j', 'τ'))));
  const symbols = [...indices, [held('R', 'i', 't'), '股票i在时点t形成信号后实现的持有期收益率，执行口径见下方收益定义。'], [z(), '第j个有向原始因子经同日截面缩尾和标准化后的暴露；一单位等于一个截面标准差。'], [idx('a', 't'), '每期截面回归的截距。'], [idx('λ', 'j', 't'), '每期截面回归中，第j个标准化因子的条件收益系数。'], [row(bar(v('a')), o(','), lambda()), '训练期逐期截距及因子系数的时间平均；训练完成后冻结用于预测。'], [v('T'), '有效且在研究交易日历中连续的训练截面数。'], [v('τ'), '训练截面序号；不包含验证期或未来信息。'], [hat(idx('μ', 'i', 't')), `股票i在时点t的${period(config)}预期收益率。`], [held('ε', 'i', 't'), '实际持有期收益与当期截面模型解释部分之差。']];
  if (exposure) symbols.push([idx('X', 'i', 't'), '在时点t已知的真实价格、成交量等历史输入。'], [call('g', idx('X', 'i', 't'), idx('θ', 'j')), '数学定义明确、可实际计算的第j个因子构造算子。'], [idx('θ', 'j'), '算子参数，例如历史窗口；修改后会重新构造暴露并估计映射。'], [idx('d', 'j'), '算子方向，取+1或−1。'], [x(), '乘方向之后、标准化之前的原始因子值。']);
  return equationBlock(lines(...(exposure ? [exposure] : []), regression, averaging, forecast), symbols, { label: '逐期截面回归，时间平均系数，再由因子暴露生成预期收益', note: '这里的系数表示控制其他特征后的收益关联，不解释为因果效应或严格经济风险溢价。正交化后按保存的基底变换回转到原标准化暴露口径。' });
}

export function targetMath(config = {}) {
  const monthly = config.frequency === 'monthly';
  const closeTime = monthly ? call('M', row(v('t'), o('+'), v('h'))) : row(v('t'), o('+'), v('h'));
  const openTime = monthly ? call('N', v('t')) : row(v('t'), o('+'), n(1));
  const equation = row(held('R', 'i', 't'), o('='), frac(sub(v('C'), row(v('i'), o(','), closeTime)), sub(v('O'), row(v('i'), o(','), openTime))), o('−'), n(1));
  return equationBlock(equation, [[held('R', 'i', 't'), '用于估计和验证映射的实际持有期收益，采用收益比例单位。'], [v('C'), '真实收盘价，来自当前历史行情缓存。'], [v('O'), '真实开盘价；信号在t收盘后形成，不能假定以同一收盘价成交。'], [v('i'), '股票编号。'], [v('t'), monthly ? '月末信号观测期。' : '信号形成的交易日。'], [v('h'), `持有期限，当前为${period(config)}。`], ...(monthly ? [[call('M', row(v('t'), o('+'), v('h'))), '信号月之后第h个月的最后一个实际交易日。'], [call('N', v('t')), '信号月之后第一个实际交易日。']] : [])], { title: '实际收益标签', note: monthly ? '月末形成信号，下月首个交易日开盘进入，第h个月末收盘退出；未完成的末月不当作完整月末。' : 't收盘形成信号，t+1开盘进入，t+h收盘退出。缺失价格不跨日填充；训练收益标签须早于留出期开始。' });
}

export function standardizationMath(config = {}) {
  const tilde = (symbol) => `<mover accent="true">${symbol}${o('~')}</mover>`;
  const xx = tilde(x());
  const equation = lines(row(xx, o('='), call('clip', x(), idx('Q', 'η', 'j', 't'), idx('Q', '1−η', 'j', 't'))), row(z(), o('='), frac(row(xx, o('−'), idx('m', 'j', 't')), idx('s', 'j', 't'))));
  return equationBlock(equation, [[v('i'), '股票编号。'], [v('j'), '因子编号。'], [v('t'), '信号形成日期。'], [x(), '方向已生效的原始因子值；缺字段仍为缺失。'], [xx, '按同一日期有效研究子样本截面分位数缩尾后的因子值。'], [v('η'), `单侧缩尾分位比例，当前为${(finite(config.winsorizeQuantile, 0.01) * 100).toFixed(1)}%。`], [idx('Q', 'η', 'j', 't'), '第j个因子在日期t的下侧截面分位点；上侧使用1−η分位点。'], [call('clip', v('x'), v('l'), v('u')), '把x限制在下界l与上界u之间。'], [idx('m', 'j', 't'), '缩尾后有效截面的均值。'], [idx('s', 'j', 't'), '缩尾后有效截面的总体标准差，ddof=0。'], [z(), '最终输入映射的标准化暴露。']], { title: '暴露标准化', note: '标准差为零的列不能识别独立收益系数；系统会进行共线性诊断。每期标准化只使用该期已知截面。严格风险β路径不使用此截面标准化。' });
}

export function neweyWestMath(config = {}, report = null) {
  const gamma = (lag) => row(sub(hat(v('γ')), v('j')), par(lag));
  const variance = sub(hat(normal('Var')), normal('NW'));
  const vjt = (time) => sub(v('v'), row(v('j'), o(','), time));
  const equation = lines(row(vjt(v('τ')), o('='), hat(idx('λ', 'j', 'τ')), o('−'), lambda()), row(gamma(v('ℓ')), o('='), frac(n(1), v('T')), sum('τ', row(v('ℓ'), o('+'), n(1)), v('T'), row(vjt(v('τ')), vjt(row(v('τ'), o('−'), v('ℓ')))))), row(variance, par(lambda()), o('='), frac(row(gamma(n(0)), o('+'), n(2), sum('ℓ', n(1), v('q'), row(par(n(1), o('−'), frac(v('ℓ'), row(v('q'), o('+'), n(1)))), gamma(v('ℓ'))))), row(v('T'), o('−'), n(1)))), row(sub(normal('SE'), normal('NW')), par(lambda()), o('='), sqrt(row(variance, par(lambda()))), o(','), sub(v('t'), normal('NW')), o('='), frac(lambda(), row(sub(normal('SE'), normal('NW')), par(lambda())))));
  const nw = report?.model?.neweyWest || {};
  return equationBlock(equation, [[v('j'), '因子编号。'], [hat(idx('λ', 'j', 'τ')), '第τ个训练截面估计的第j个因子系数。'], [lambda(), '第j个逐期截面系数的训练期均值。'], [v('T'), `有效训练截面数${nw.timeObservations ? `，当前为${nw.timeObservations}` : ''}。`], [v('τ'), '连续研究交易日历中的训练截面序号。'], [vjt(v('τ')), '当期系数相对其时间均值的偏离。'], [gamma(v('ℓ')), '间隔ℓ个观测期的系数偏离样本自协方差。'], [v('ℓ'), '自协方差的滞后阶数。'], [v('q'), `Newey–West最大滞后阶数，当前${nw.effectiveLags ?? config.nwLags ?? 4}阶；和因子历史窗口L不同。`], [par(n(1), o('−'), frac(v('ℓ'), row(v('q'), o('+'), n(1)))), 'Bartlett核权重；离当前越远的滞后权重越小。'], [row(variance, par(lambda())), '均值系数的稳健方差；分母T−1对应当前实现的有限样本校正。'], [sub(normal('SE'), normal('NW')), '稳健标准误，为稳健方差的平方根。'], [sub(v('t'), normal('NW')), '用均值系数除以稳健标准误得到的统计量，不是日期t。']], { title: 'Newey–West稳健推断', note: '调整作用于逐期系数的时间均值。持有期标签重叠时q至少为h−1；训练系数序列缺期会阻塞计算。严格风险路径未进行Shanken修正。' });
}

export function operatorMath(factor = {}, setting = {}) {
  const id = factor.id;
  const ll = idx('L', 'j');
  const dd = idx('d', 'j');
  const c = (time) => sub(v('C'), row(v('i'), o(','), time));
  const lookbackReturn = row(frac(c(v('t')), c(row(v('t'), o('−'), ll))), o('−'), n(1));
  let formula;
  const symbols = [[x(), '股票i、第j个算子、日期t的有向原始因子值；之后再进行截面缩尾及标准化。'], [v('i'), '股票编号。'], [v('j'), '因子编号。'], [v('t'), '当前信号日期。'], [ll, `历史窗口，当前${setting.lookback ?? factor.defaultLookback ?? 20}个交易日；窗口参数实际参与计算。`], [dd, `方向参数，当前${(setting.direction ?? factor.defaultDirection ?? 1) === -1 ? '−1' : '+1'}。`]];
  if (id === 'momentum' || id === 'reversal') {
    formula = row(x(), o('='), dd, par(lookbackReturn));
    symbols.push([c(v('t')), '日期t的真实收盘价。'], [c(row(v('t'), o('−'), ll)), '同一股票在共同交易日历中向前L个交易日的真实收盘价。']);
  } else if (id === 'volatility') {
    formula = row(x(), o('='), dd, sub(normal('std'), ll), par(call('ln', frac(c(v('s')), c(row(v('s'), o('−'), n(1)))))), sqrt(n(252)));
    symbols.push([v('s'), '窗口内的历史交易日。'], [c(v('s')), '历史日s的收盘价。'], [sub(normal('std'), ll), '最近L个有效日对数收益的样本标准差，ddof=1。'], [sqrt(n(252)), '按每年252个交易日进行波动率年化；不代表预期收益年化。']);
  } else if (id === 'volume_stability') {
    formula = row(x(), o('='), dd, frac(row(sub(normal('std'), ll), par(idx('V', 'i', 's'))), row(sub(normal('mean'), ll), par(idx('V', 'i', 's')))));
    symbols.push([v('s'), '窗口内的历史交易日。'], [idx('V', 'i', 's'), '股票i在历史日s的真实成交量。'], [sub(normal('std'), ll), '最近L个交易日成交量的样本标准差，ddof=1。'], [sub(normal('mean'), ll), '最近L个交易日成交量的算术均值。']);
  } else if (id === 'liquidity') {
    formula = row(x(), o('='), dd, call('ln', row(sub(normal('mean'), ll), par(idx('A', 'i', 's')))));
    symbols.push([v('s'), '窗口内的历史交易日。'], [idx('A', 'i', 's'), '股票i在历史日s的真实成交额；不能用成交量替代。'], [sub(normal('mean'), ll), '最近L个交易日成交额的算术均值。'], [normal('ln'), '自然对数；数据源的成交额单位按快照保存。']);
  } else return registeredFactorMath({ formula: factor.formula, dataDependencies: factor.requiredFields || [] });
  return equationBlock(formula, symbols, { label: `${factor.name || id}的可执行算子公式及符号解释`, note: `${factor.meaning || ''}${setting.enabled === false ? ' 当前算子未启用。' : ''} 原始算子与既有复合因子分别登记。` });
}

export function portfolioMath(config = {}) {
  const transpose = (symbol) => sup(symbol, normal('T'));
  const optimization = row(sub(normal('max'), v('w')), row(transpose(v('μ')), v('w')), o('−'), frac(v('γ'), n(2)), transpose(v('w')), v('Σ'), v('w'));
  const constraints = row(sum('i', n(1), v('N'), idx('w', 'i')), o('='), n(1), o(','), n(0), o('≤'), idx('w', 'i'), o('≤'), idx('w', 'max'));
  return equationBlock(lines(row(idx('μ', 'p'), o('='), transpose(v('μ')), v('w')), optimization, constraints), [[v('μ'), '同一冻结模型快照生成的股票持有期预期收益向量。'], [v('w'), '待求解的股票组合权重向量。'], [idx('μ', 'p'), '组合持有期预期收益，为各股票预期收益的权重和。'], [v('Σ'), '训练期真实收益估计的风险协方差矩阵，并按持有期近似缩放。'], [v('γ'), `风险厌恶系数，当前为${config.portfolio?.riskAversion ?? 10}；越大越重视降低方差。`], [normal('T'), '右上角T表示向量转置，不是训练期数。'], [v('N'), `先按μ筛出的候选子集大小，配置上限${config.portfolio?.topN ?? 10}只。`], [idx('w', 'i'), '股票i在组合中的权重；只做多，权重之和等于1。'], [idx('w', 'max'), `单只股票权重上限，当前${(finite(config.portfolio?.maxWeight, 0.2) * 100).toFixed(1)}%。`]], { label: '组合预期收益、均方差目标和权重约束', note: '先选TopN候选子集，再在子集内优化。这里的Σ是协方差矩阵；公式中的∑是求和符号。当前优化组合不回填为此前等权验证组合的历史业绩。' });
}

export function attributionMath(method = 'characteristic_fmb') {
  const gross = sup(idx('R', 'p', 't'), normal('gross'));
  const net = sup(idx('R', 'p', 't'), normal('net'));
  return equationBlock(lines(row(gross, o('='), idx('a', 'p', 't'), o('+'), sum('j', n(1), v('K'), idx('c', 'p', 'j', 't')), o('+'), idx('e', 'p', 't')), row(net, o('='), gross, o('−'), idx('κ', 't'))), [[v('p'), '当前留出验证组合。'], [v('t'), '该期信号形成日期；各期持有区间不重叠。'], [v('j'), '因子编号。'], [v('K'), '原始因子坐标数量；筛除项不作独立系数解释，保留基底见诊断。'], [gross, '组合该持有期的实际毛收益率。'], [idx('a', 'p', 't'), method === 'risk_premium_fmb' ? '冻结风险定价模型的组合截距项，并包含当时可获得的无风险收益预测。' : method === 'local_surrogate' ? '各股票局部展开的锚定截距按权重汇总，用于精确还原核预测。' : '冻结模型截距按该期组合权重汇总后的贡献。'], [idx('c', 'p', 'j', 't'), method === 'local_surrogate' ? '第j个预测贡献：各股票暴露乘其自身位置的核预测器边际梯度，再按组合权重汇总；不是参考点WLS斜率。' : method === 'risk_premium_fmb' ? '第j个预测贡献：冻结β乘训练期平均风险价格，再按当期组合权重汇总。' : '第j个预测贡献：冻结系数乘当期标准化暴露，再按组合权重汇总。'], [idx('e', 'p', 't'), '实际毛收益减去模型预期部分的实现误差，包含未预期市场变化。'], [idx('κ', 't'), '该期双边手续费与滑点成本。'], [net, '实际毛收益扣除成本后的净收益。']], { label: '实际毛收益的预测成分与残差分解以及净收益口径', note: '该式核对同一冻结模型的预测成分与实现误差，不等同于实际因子收益乘β的传统业绩归因。加总正确不证明预测有效。' });
}

export function liquidityQualityMath() {
  const q = (name) => idx('q', name);
  const clip = (value) => call('clip', value, n(0), n(1));
  const rank = (value) => row(sub(v('R'), v('t')), par(value));
  const meanAmount = (window) => sup(sub(bar(v('A')), row(v('i'), o(','), v('t'))), n(window));
  const meanVolume = sup(sub(bar(v('V')), row(v('i'), o(','), v('t'))), n(20));
  const amountStd = sup(idx('s', 'A', 'i', 't'), n(60));
  const stability = frac(n(1), row(n(1), o('+'), frac(amountStd, meanAmount(60))));
  const turnover = idx('τ', 'i', 't');
  const volumeRatio = idx('ν', 'i', 't');
  const marketCap = sub(normal('Cap'), row(v('i'), o(','), v('t')));
  const weights = [['A', .30], ['S', .24], ['T', .18], ['V', .16], ['M', .12]];
  const score = row(idx('S', 'i', 't'), o('='), clip(row(...weights.flatMap(([name, weight], index) => [index ? o('+') : '', n(weight.toFixed(2)), q(name)]))));
  const main = equationBlock(score, [[idx('S', 'i', 't'), '股票i在日期t的流动性质量评分，取值0至1；该分数不是预期收益率。'], [q('A'), '成交额水平子评分：对20期平均成交额的log1p值做同日截面排名。'], [q('S'), '成交额稳定性子评分：先计算60期成交额稳定性，再做同日截面排名。'], [q('T'), '合理换手子评分：按原接口换手率，以目标1.5、宽度3.0进行峰值评分。'], [q('V'), '合理量比子评分：当前成交量除以20期均量，再以目标1.2、宽度1.8进行峰值评分。'], [q('M'), '市值承载力子评分：对原始市值字段做同日截面排名。'], [call('clip', v('x'), n(0), n(1)), '把结果限制在0至1之间。'], [row(v('i'), o(','), v('t')), '分别表示股票编号和该因子的历史观测日。']], { label: '当前JoinQuant来源脚本的流动性质量五项加权评分', note: '0.30、0.24、0.18、0.16、0.12为原脚本预设权重，不是本地收益映射估计的回归系数。' });
  const amountScore = rank(call('ln', row(n(1), o('+'), meanAmount(20))));
  const components = lines(
    row(q('A'), o('='), amountScore),
    row(q('S'), o('='), rank(stability)),
    row(q('T'), o('='), call('P', turnover, n('1.5'), n('3.0'))),
    row(q('V'), o('='), call('P', volumeRatio, n('1.2'), n('1.8'))),
    row(q('M'), o('='), rank(marketCap)),
    row(volumeRatio, o('='), frac(idx('V', 'i', 't'), meanVolume)),
  );
  const detail = equationBlock(components, [[q('A'), '上式的成交额水平子评分。'], [q('S'), '上式的成交额稳定性子评分。'], [q('T'), '上式的合理换手子评分。'], [q('V'), '上式的合理量比子评分。'], [q('M'), '上式的市值承载力子评分。'], [meanAmount(20), '最近20条历史记录的成交额均值，原脚本要求至少10个有效观测。'], [meanAmount(60), '最近60条历史记录的成交额均值，原脚本要求至少20个有效观测。'], [amountStd, '最近60条历史记录的成交额样本标准差，ddof=1，至少20个有效观测。'], [turnover, '原估值接口的turnover_ratio字段；直接使用原始数值，原脚本不先除以100。'], [volumeRatio, '量比：当期真实成交量除以20期平均成交量。'], [idx('V', 'i', 't'), '股票i在日期t的真实成交量。'], [meanVolume, '最近20条历史记录的成交量均值，至少10个有效观测。'], [marketCap, '原估值接口market_cap字段；这里使用其截面排序，不直接混加原市值。'], [sub(v('R'), v('t')), '同日有效截面的平均秩百分位排名，具体定义见下一式。'], [v('P'), '围绕指定中心值和宽度的峰值评分函数，具体定义见下一式。'], [normal('ln'), '自然对数；ln(1+x)对应来源代码中的log1p(x)。']], { title: '五个子评分与中间变量', label: '五个子评分的实际变换与窗口', note: '原始字段先经过各自的统计、排序或峰值变换，再按权重合成；成交额、成交量、换手率和市值不是直接相加。' });
  const helper = equationBlock(lines(row(call('P', v('x'), v('c'), v('w')), o('='), clip(row(n(1), o('−'), frac(row(o('|'), v('x'), o('−'), v('c'), o('|')), v('w'))))), row(rank(v('x')), o('='), frac(call('rank_avg', v('x')), idx('N', 't')))), [[v('x'), '待评分的某一原始指标值。'], [v('c'), '峰值评分的中心目标；换手率取1.5，量比取1.2。'], [v('w'), '峰值评分宽度；换手率取3.0，量比取1.8。'], [call('P', v('x'), v('c'), v('w')), '距离目标越近得分越高，最后限制在0至1之间。'], [call('rank_avg', v('x')), '该日截面中的平均秩，并列值取平均名次。'], [idx('N', 't'), '该原始指标在日期t的有限非缺失样本数。'], [sub(v('R'), v('t')), '平均秩除以有效样本数；对应pandas rank(pct=True, method="average")，并非(rank−1)/(N−1)。']], { title: '排序与峰值函数', label: '原来源脚本的排序和峰值函数', note: '原外部脚本会把排名/峰值评分中的缺失分项填为0.5；这是该来源的历史处理口径，与新本地收益映射的缺失阻塞策略不同。这里照实展示，不修改旧脚本或重算回填结果。' });
  const source = 'outputs/sources/joinquant/scripts/m_quant_joinquant_key_factor_mining_v1.py';
  return `<section data-rm-definition-source="joinquant_key_factor_mining_v1"><p class="rm-help">以下按当前来源脚本逐项还原公式与符号；与回填记录的source对应。</p>${main}<details class="rm-diagnostics"><summary>展开：子评分、窗口及缺失处理</summary>${detail}${helper}</details><p class="rm-help"><a href="/research-api/source?path=${encodeURIComponent(source)}" target="_blank" rel="noopener">查看当前来源脚本</a>。历史回填未记录公式版本或代码哈希，因此不声称已完成历史版本的哈希级核验。外部实测采用收盘到收盘收益，新本地映射采用次日开盘进入，两者分别标记。</p></section>`;
}

export function registeredFactorMath(entry = {}) {
  if (entry.factorId === 'liquidity_quality_jq') return liquidityQualityMath();
  const dictionary = { close: '真实收盘价。', open: '真实开盘价。', high: '真实最高价。', low: '真实最低价。', volume: '真实成交量。', money: '真实成交额。', amount: '真实成交额。', stockk: 'KDJ指标的K值。', stockd: 'KDJ指标的D值。', stockj: 'KDJ指标的J值。', macd: 'MACD柱体动能字段。', diff: 'MACD快慢线差值。', dea: 'DIFF的平滑线。', hslv: '登记数据源的换手率。', lbi: '登记数据源的量比。', apzj: '登记数据源的暗盘资金字段。', mpzj: '登记数据源的明盘资金字段。', shzj: '登记数据源的散户资金字段。', huolipan: '登记数据源的获利盘比例。', taolaopan: '登记数据源的套牢盘比例。' };
  const fields = Array.isArray(entry.dataDependencies) ? entry.dataDependencies : [];
  const formula = entry.formula || '';
  const symbolAppears = (field) => {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_.])${escaped}(?=$|[^A-Za-z0-9_.])`).test(formula);
  };
  const describe = (field) => dictionary[field] || (/^ma\d+$/.test(field) ? `${field.slice(2)}个交易日均线字段。` : /^mavol\d+$/.test(field) ? `${field.slice(5)}个交易日均量字段。` : '原登记依赖字段；确切统计口径以来源文件和研究证据为准。');
  const symbols = fields.filter(symbolAppears).map((field) => [normal(field), describe(field)]);
  if (/score/.test(entry.formula || '')) symbols.unshift([normal('score'), '该原登记公式给出的因子评分；尚未校准为收益率时不能直接当作μ。']);
  if (/rank/.test(entry.formula || '')) symbols.push([normal('rank'), '原登记的截面排序算子；具体归一化和样本口径以该因子来源实现为准。']);
  const registeredInputs = fields.length ? `<details class="rm-diagnostics"><summary>原始依赖字段（与公式符号分开展示）</summary><dl class="rm-symbol-list">${fields.map((field) => `<div><dt><code>${html(field)}</code></dt><dd>${html(describe(field))}</dd></div>`).join('')}</dl></details>` : '';
  const isConceptual = /[\u4e00-\u9fff]/.test(formula);
  const classification = isConceptual ? '<p class="rm-help">以下为原登记的概念性评分说明；尚未登记完整的权重及变换口径，不将其标为已核对的可执行数学式。</p>' : '';
  const equation = symbols.length ? equationBlock(tag('mtext', html(formula || '尚未登记可执行公式。')), symbols, { label: '原登记公式及其中实际出现的符号', note: '这里只解释公式中实际出现的字母；输入依赖另列，不冒充公式里的变量。' }) : `<div class="rm-formula">${html(formula || '尚未登记可执行公式。')}</div><p class="rm-help">尚未登记可逐一对应的数学符号定义。</p>`;
  return classification + equation + registeredInputs;
}
