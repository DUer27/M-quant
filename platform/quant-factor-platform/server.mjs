import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5555);
const dataDir = join(root, 'data');
const statePath = join(dataDir, 'state.json');
const projectRootCandidates = [
  process.env.M_QUANT_DATA_ROOT,
  join(root, '..', '..'),
  join(root, '..', '..', '..'),
].filter(Boolean).map((path) => normalize(path));
const projectRoot = projectRootCandidates.find((path) => existsSync(join(path, 'outputs'))) || projectRootCandidates[0];
const outputPath = (...parts) => join(projectRoot, 'outputs', ...parts);
const realFactorResultsPath = outputPath('real-factors', 'yiwan-real-factor-results.json');
const realFactorSummaryPath = outputPath('real-factors', 'yiwan-real-factor-summary.json');
const researchFactorResultsPath = outputPath('research-factor-pipeline', 'yiwan-research-factor-results.json');
const researchFactorSummaryPath = outputPath('research-factor-pipeline', 'yiwan-research-factor-summary.json');
const capitalFactorResultsPath = outputPath('capital-flow-factors', 'yiwan-capital-factor-results.json');
const capitalFactorSummaryPath = outputPath('capital-flow-factors', 'yiwan-capital-factor-summary.json');
const strategyDefinitionsPath = join(dataDir, 'strategy-definitions.json');
const importedBacktestResultsPath = join(dataDir, 'imported-backtest-results.json');
const strictFactorAuditPath = outputPath('factors', 'joinquant', 'm_quant_strict_factor_audit_20260708.json');
const akshareHistorySummaryPath = outputPath('sources', 'akshare', 'results', 'a_share_daily_history_summary.json');
const akshareOhlcvBacktestPath = outputPath('sources', 'akshare', 'results', 'akshare_ohlcv_factor_backtest_results.json');
const akshareStrategyValidationPath = outputPath('sources', 'akshare', 'results', 'akshare_strategy_candidate_validation.json');
const akshareFactorQualityAuditPath = outputPath('sources', 'akshare', 'results', 'akshare_factor_quality_audit.json');
const strategyMaturityAuditPath = outputPath('strategies', 'joinquant', 'strategy_maturity_audit_20260709.json');
const paperWatchRoutesPath = outputPath('strategies', 'joinquant', 'paper_watch_routes_20260709.json');
const paperWatchExecutionPackPath = outputPath('strategies', 'joinquant', 'paper_watch_execution_pack_20260709.json');
const paperWatchReadinessAuditPath = outputPath('strategies', 'joinquant', 'paper_watch_readiness_audit_20260709.json');
const jqQualityProfitLiquidityBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_jq_quality_profit_liquidity_strategy_backtest.py');
const capitalFollowBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_capital_follow_strategy_backtest.py');
const klineAssistedBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_emotion_weighted_kline_strategy_backtest.py');
const akshareCandidateReviewScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_akshare_ohlcv_candidate_review.py');
const joinquantFactorTestScriptPath = outputPath('joinquant', 'm_quant_joinquant_factor_test.py');
const primaryStrategyHorizons = [5, 10, 20];

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const seedState = {
  factors: [
    {
      category: 'price_volume',
      description: '近20个交易日价格趋势强度，偏向捕捉中短期趋势延续。',
      direction: 'positive',
      ic: 0.071,
      id: 'momentum_20d',
      longShortReturn: 0.098,
      name: '动量_20D',
      rankIc: 0.083,
      status: '有效',
      window: 20,
    },
    {
      category: 'price_volume',
      description: '近5个交易日短周期反转信号，适合和动量类因子组合降相关。',
      direction: 'negative',
      ic: 0.042,
      id: 'reversal_5d',
      longShortReturn: 0.052,
      name: '反转_5D',
      rankIc: 0.057,
      status: '观察',
      window: 5,
    },
    {
      category: 'risk',
      description: '近60个交易日波动率，负IC表示低波动组合更可能获得超额收益。',
      direction: 'negative',
      ic: -0.038,
      id: 'volatility_60d',
      longShortReturn: 0.041,
      name: '波动率_60D',
      rankIc: -0.044,
      status: '有效',
      window: 60,
    },
    {
      category: 'liquidity',
      description: '成交额变化率，用于识别资金关注度和流动性改善。',
      direction: 'positive',
      ic: 0.052,
      id: 'turnover_change',
      longShortReturn: 0.067,
      name: '成交额变化',
      rankIc: 0.061,
      status: '有效',
      window: 20,
    },
    {
      category: 'fundamental',
      description: '盈利稳定性和利润质量的综合打分，当前信号偏弱，建议继续观察。',
      direction: 'positive',
      ic: 0.034,
      id: 'earnings_quality',
      longShortReturn: 0.039,
      name: '盈利质量',
      rankIc: 0.049,
      status: '观察',
      window: 252,
    },
  ],
  preferences: {
    benchmark: '000300.SH',
    feeRate: 0.0003,
    rebalanceFrequency: 'monthly',
    riskControl: true,
    slippage: 0.0002,
    universe: '沪深300',
  },
  risk: [
    { limit: 60, name: '行业偏离', value: 42 },
    { limit: 45, name: '个股集中度', value: 28 },
    { limit: 70, name: '换手率', value: 57 },
    { limit: 50, name: '暴露约束', value: 35 },
  ],
};

const indicatorFields = [
  { group: '均线', key: 'ma5', label: 'MA5', meaning: '5日均线位置或偏离' },
  { group: '均线', key: 'ma13', label: 'MA13', meaning: '13日均线位置或偏离' },
  { group: '均线', key: 'ma20', label: 'MA20', meaning: '20日均线位置或偏离' },
  { group: '均线', key: 'ma30', label: 'MA30', meaning: '30日均线位置或偏离' },
  { group: '均线', key: 'ma60', label: 'MA60', meaning: '60日均线位置或偏离' },
  { group: '均线', key: 'ma120', label: 'MA120', meaning: '120日均线位置或偏离' },
  { group: '均线', key: 'ma250', label: 'MA250', meaning: '250日均线位置或偏离' },
  { group: '均量', key: 'mavol5', label: 'MAVOL5', meaning: '5日成交量均值或量能状态' },
  { group: '均量', key: 'mavol10', label: 'MAVOL10', meaning: '10日成交量均值或量能状态' },
  { group: 'KDJ', key: 'stockk', label: 'K', meaning: 'KDJ K值' },
  { group: 'KDJ', key: 'stockd', label: 'D', meaning: 'KDJ D值' },
  { group: 'KDJ', key: 'stockj', label: 'J', meaning: 'KDJ J值' },
  { group: '筹码', key: 'taolaopan', label: '套牢盘', meaning: '上方套牢筹码压力' },
  { group: '筹码', key: 'pinjunchengben', label: '平均成本', meaning: '市场平均持仓成本' },
  { group: '筹码', key: 'huolipan', label: '获利盘', meaning: '当前获利筹码比例' },
  { group: '筹码', key: 'qujianchonghe', label: '区间重合', meaning: '筹码集中或价格区间重合程度' },
  { group: '筹码', key: 'jiushijizhong', label: '90%集中度', meaning: '90%筹码集中区间' },
  { group: '筹码', key: 'qishijizhong', label: '70%集中度', meaning: '70%筹码集中区间' },
  { group: 'MACD', key: 'macd', label: 'MACD', meaning: 'MACD柱体动能' },
  { group: 'MACD', key: 'diff', label: 'DIFF', meaning: '快慢线差值' },
  { group: 'MACD', key: 'dea', label: 'DEA', meaning: 'DIFF平滑线' },
  { group: '暗盘资金', key: 'apzj', label: '暗盘资金', meaning: '暗盘/主动资金昨日表现' },
  { group: '明盘资金', key: 'mpzj', label: '明盘资金', meaning: '明盘资金昨日表现' },
  { group: '散户资金', key: 'shzj', label: '散户资金', meaning: '散户资金昨日表现' },
  { group: '暗盘资金', key: 'ap_d3', label: '暗盘3日', meaning: '暗盘资金近3日强度' },
  { group: '暗盘资金', key: 'ap_d5', label: '暗盘5日', meaning: '暗盘资金近5日强度' },
  { group: '暗盘资金', key: 'ap_d7', label: '暗盘7日', meaning: '暗盘资金近7日强度' },
  { group: '概率', key: 'up', label: '上涨概率', meaning: '页面中的上涨概率/胜率排序字段' },
  { group: '交易状态', key: 'zdfd', label: '涨跌幅', meaning: '个股或板块涨跌幅' },
  { group: '交易状态', key: 'hslv', label: '换手率', meaning: '市场交易活跃度' },
  { group: '交易状态', key: 'lbi', label: '量比', meaning: '当前成交量相对近期均量的强弱' },
  { group: '板块资金', key: 'zljlr', label: '主力净流入', meaning: '主力资金净流入' },
  { group: '板块资金', key: 'cddjlr', label: '超大单净流入', meaning: '超大单资金净流入' },
  { group: '板块资金', key: 'ddjlr', label: '大单净流入', meaning: '大单资金净流入' },
  { group: '市场宽度', key: 'up_zdfd', label: '上涨家数/上涨强度', meaning: '大盘页上涨宽度字段' },
  { group: '市场宽度', key: 'down_zdfd', label: '下跌家数/下跌强度', meaning: '大盘页下跌宽度字段' },
];

const indicatorFactorDefinitions = [
  {
    category: 'trend',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = 0.30*均线方向 + 0.25*价格站位 + 0.20*均线堆叠 + 0.15*趋势成熟度 + 0.10*不过度乖离',
    id: 'trend_alignment_factor',
    name: '均线多头排列因子',
    requiredFields: ['ma5', 'ma13', 'ma20', 'ma60', 'ma120', 'ma250'],
    signal: '分数越高，说明方向、结构、价格位置和趋势成熟度越健康；过度偏离均线会扣分。',
    usage: '适合作为入场方向过滤器；强趋势但过伸时不直接追入，等待量价确认或回踩。',
  },
  {
    category: 'price_volume',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = 量能支持 + 价格动作质量 + 量价同步 + 趋势背景 + 成交额/实体质量 - 量价背离 - 爆量出货风险',
    id: 'volume_trend_confirm_factor',
    name: '量价确认因子',
    requiredFields: ['mavol5', 'mavol10', 'ma5', 'ma20', 'ma60'],
    signal: '健康放量、强收盘、上涨有成交支持时加分；放量下跌、长上影放量、爆量高换手会扣分。',
    usage: '适合作为入场确认因子；它回答上涨有没有成交质量，不单独代替趋势和风控。',
  },
  {
    category: 'momentum',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = KDJ方向 + K-D强弱 + J值适中度 + 收盘位置 - KDJ过热惩罚',
    id: 'kdj_momentum_factor',
    name: 'KDJ动能因子',
    requiredFields: ['stockk', 'stockd', 'stockj'],
    signal: 'K强于D且J值处于有效区间时加分；J值极端高位或高位走弱时扣分。',
    usage: '适合短周期择时，不建议单独用于长期选股。',
  },
  {
    category: 'chip',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = 获利盘舒适度 + 低套牢盘 + 低筹码拥挤 + 现价相对平均成本舒适区',
    id: 'chip_health_factor',
    name: '筹码健康因子',
    requiredFields: ['huolipan', 'taolaopan', 'jiushijizhong', 'qishijizhong', 'pinjunchengben'],
    signal: '获利盘适中偏强、套牢盘低、筹码不过度集中且现价不过度偏离成本时，筹码结构更健康。',
    usage: '适合作为风控和持仓质量过滤器，避免筹码压力过大的股票。',
  },
  {
    category: 'momentum',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = MACD方向 + 柱体强度排名 + DIFF-DEA扩张 + 零轴状态',
    id: 'macd_acceleration_factor',
    name: 'MACD动能加速因子',
    requiredFields: ['macd', 'diff', 'dea'],
    signal: '零轴上方加速、DIFF强于DEA、柱体强度扩张时加分；零轴下方修复只给有限加分。',
    usage: '适合和均线多头排列因子搭配，减少震荡期误判。',
  },
  {
    category: 'composite',
    dataSource: 'yiwan indicators schema',
    direction: 'positive',
    formula: 'score = 趋势/量价/MACD/KDJ/筹码/日内强度加权 - 核心拥挤风险扣分',
    id: 'technical_composite_factor',
    name: '技术综合强度因子',
    requiredFields: ['ma5', 'ma13', 'ma20', 'ma60', 'mavol5', 'mavol10', 'stockk', 'stockd', 'stockj', 'macd', 'diff', 'dea', 'huolipan', 'taolaopan'],
    signal: '综合趋势、量能、短线动能、MACD、筹码和日内结构，同时扣除高拥挤风险。',
    usage: '可作为第一版股票池排序因子，后续必须用历史样本验证IC和分组收益。',
  },
  {
    category: 'fundamental',
    dataSource: 'joinquant valuation/indicator + OHLCV',
    direction: 'positive',
    formula: 'score = 低PE + 低PB + 低PS + 合理换手 + 市值稳定性',
    id: 'valuation_safety_jq',
    name: '估值安全垫_JQ',
    requiredFields: ['valuation.pe_ratio', 'valuation.pb_ratio', 'valuation.ps_ratio', 'valuation.turnover_ratio', 'valuation.market_cap'],
    signal: '估值越便宜、换手不过热且市值稳定性越好，估值安全垫越强。',
    usage: '用于过滤趋势策略中的高估拥挤票，适合和质量成长、量价确认共同进入策略。',
  },
  {
    category: 'fundamental',
    dataSource: 'joinquant indicator',
    direction: 'positive',
    formula: 'score = ROE + ROA + 毛利率 + 净利率 + 营收同比 + 净利同比',
    id: 'quality_growth_jq',
    name: '质量成长_JQ',
    requiredFields: ['indicator.roe', 'indicator.roa', 'indicator.gross_profit_margin', 'indicator.net_profit_margin', 'indicator.inc_total_revenue_year_on_year', 'indicator.inc_net_profit_year_on_year'],
    signal: '盈利质量和收入/利润成长同时改善时分数更高。',
    usage: '作为核心基本面确认因子，优先参与中长周期策略组合。',
  },
  {
    category: 'fundamental',
    dataSource: 'joinquant indicator',
    direction: 'positive',
    formula: 'score = 净利同比 + 营收同比 + EPS + ROE + 经营现金流收入比',
    id: 'profit_growth_jq',
    name: '利润增长_JQ',
    requiredFields: ['indicator.inc_net_profit_year_on_year', 'indicator.inc_total_revenue_year_on_year', 'indicator.eps', 'indicator.roe', 'indicator.ocf_to_revenue'],
    signal: '利润扩张、收入配合、EPS和ROE共同走强时，盈利增长确认度更高。',
    usage: '当前优先级最高的基本面进攻因子之一，用于构建质量成长策略路线。',
  },
  {
    category: 'liquidity',
    dataSource: 'joinquant OHLCV/valuation',
    direction: 'positive',
    formula: 'score = 成交额水平 + 成交额稳定性 + 合理换手 + 合理量比 + 市值承载力',
    id: 'liquidity_quality_jq',
    name: '流动性质量_JQ',
    requiredFields: ['money', 'volume', 'valuation.turnover_ratio', 'valuation.market_cap'],
    signal: '成交额足、稳定性好、换手和量比不过热时，真实可交易性更强。',
    usage: '用于确认策略可执行性和降低冲击成本，进入正式策略前必须保留。',
  },
  {
    category: 'risk',
    dataSource: 'joinquant OHLCV',
    direction: 'positive',
    formula: 'score = 低20日波动 + 低60日波动 + 低回撤 + 成交额稳定 + 流动性',
    id: 'low_volatility_quality_jq',
    name: '低波动质量_JQ',
    requiredFields: ['close', 'money', 'stock_return'],
    signal: '波动和回撤越低、交易越稳定，防守质量越高。',
    usage: '用于低波动/防守策略路线，也可作为高波动环境下的风险过滤。',
  },
  {
    category: 'risk',
    dataSource: 'joinquant OHLCV/index return',
    direction: 'negative',
    formula: 'risk = Beta60 + 60日波动 + 60日回撤 + 高换手',
    id: 'market_sensitivity_risk_jq',
    name: '市场敏感风险_JQ',
    requiredFields: ['stock_return', 'index_return', 'valuation.turnover_ratio'],
    signal: 'Beta、波动、回撤和换手越高，市场敏感风险越高。',
    usage: '风险因子，高分不代表买入；用于控制组合对市场冲击的暴露。',
  },
  {
    category: 'capital_flow',
    dataSource: 'yiwan darkFactor/mainForce schema',
    direction: 'positive',
    formula: 'score = 0.35*rank(apzj) + 0.25*rank(ap_d3) + 0.20*rank(ap_d5) + 0.10*rank(mpzj) - 0.10*rank(shzj)',
    id: 'capital_follow_factor',
    name: '资金跟随因子',
    requiredFields: ['apzj', 'ap_d3', 'ap_d5', 'mpzj', 'shzj'],
    signal: '暗盘资金和明盘资金持续流入，同时散户资金不过热，说明大资金可能在持续推动。',
    usage: '作为顺势选股的主因子，和均线多头排列、量价确认搭配更稳。',
  },
  {
    category: 'capital_flow',
    dataSource: 'yiwan darkFactor schema',
    direction: 'positive',
    formula: 'score = rank(apzj + mpzj) - rank(shzj) + I(ap_d3>0) + I(ap_d5>0)',
    id: 'institution_retail_divergence_factor',
    name: '主散背离因子',
    requiredFields: ['apzj', 'mpzj', 'shzj', 'ap_d3', 'ap_d5'],
    signal: '大资金强、散户弱时加分，尝试捕捉资金从分歧到一致前的阶段。',
    usage: '适合用来避免散户一致追高，偏向寻找大资金提前介入的股票。',
  },
  {
    category: 'sentiment',
    dataSource: 'yiwan darkFactor/market schema',
    direction: 'negative',
    formula: 'risk = rank(up) + rank(shzj) + rank(hslv) + rank(lbi) - rank(ap_d5)',
    id: 'sentiment_overheat_factor',
    name: '情绪过热因子',
    requiredFields: ['up', 'shzj', 'hslv', 'lbi', 'ap_d5'],
    signal: '上涨概率、散户资金、换手和量比同时过高，但暗盘资金不再增强时，视为拥挤交易。',
    usage: '这是风险因子，分数高不代表买入，更多用于降仓、过滤或止盈。',
  },
  {
    category: 'sentiment',
    dataSource: 'yiwan market breadth/schema',
    direction: 'positive',
    formula: 'score = rank(down_zdfd) + rank(abs(zdfd)) + I(zljlr>=0) + I(cddjlr>=0) - rank(shzj)',
    id: 'panic_reversal_factor',
    name: '恐慌反转因子',
    requiredFields: ['down_zdfd', 'zdfd', 'zljlr', 'cddjlr', 'shzj'],
    signal: '市场下跌宽度较大或个股跌幅较深，但主力/超大单没有同步流出，可能出现恐慌错杀。',
    usage: '适合做左侧观察池，需要叠加止损和次日确认，不适合无脑抄底。',
  },
  {
    category: 'sector',
    dataSource: 'yiwan plateData schema',
    direction: 'positive',
    formula: 'score = rank(sector_zdfd) + rank(sector_zljlr) + rank(stock_zljlr) + corr(sector_dde_z, stock_zdfd)',
    id: 'sector_capital_resonance_factor',
    name: '板块资金共振因子',
    requiredFields: ['sector_stock_detail_info', 'sector_stock_detail_chart', 'zljlr', 'cddjlr', 'zdfd'],
    signal: '板块走势、板块资金和个股资金同向增强时，个股更可能获得持续关注。',
    usage: '用于从强势板块中筛股票，避免孤立个股信号。',
  },
  {
    category: 'event',
    dataSource: 'yiwan unusualChange/mainForce schema',
    direction: 'positive',
    formula: 'score = rank(unusual_change_strength) + rank(lbi) + rank(hslv) + rank(zljlr) - rank(ltsz)',
    id: 'event_volume_confirmation_factor',
    name: '异动放量确认因子',
    requiredFields: ['unusualChange', 'lbi', 'hslv', 'zljlr', 'ltsz'],
    signal: '异动出现时，如果量比、换手和主力净流入同步放大，且流通市值不过大，则信号更敏感。',
    usage: '适合做短线事件池，后续需要按开盘/盘中/收盘时间分层验证。',
  },
];

function buildIndicatorDerivedFactors() {
  return [
    {
      category: 'trend',
      description: '由 MA5、MA13、MA20、MA60、MA120、MA250 推导，衡量均线是否形成多头排列。',
      direction: 'positive',
      formula: 'I(ma5>ma13)+I(ma13>ma20)+I(ma20>ma60)+I(ma60>ma120)+I(ma120>ma250)',
      ic: 0.058,
      id: 'trend_alignment_factor',
      longShortReturn: 0.074,
      name: '均线多头排列因子',
      rankIc: 0.066,
      source: '根据 yiwan 指标字段设计，非该站真实回测数据',
      status: '待验证',
      window: 60,
    },
    {
      category: 'price_volume',
      description: '由 MAVOL5/MAVOL10 和均线状态推导，用于识别有成交量确认的趋势。',
      direction: 'positive',
      formula: 'rank(mavol5/mavol10)+rank(均线多头排列)',
      ic: 0.049,
      id: 'volume_trend_confirm_factor',
      longShortReturn: 0.063,
      name: '量价确认因子',
      rankIc: 0.057,
      source: '根据 yiwan 指标字段设计，非该站真实回测数据',
      status: '待验证',
      window: 20,
    },
    {
      category: 'momentum',
      description: '由 K、D、J 推导，捕捉短线动能改善，同时对J值过热做惩罚。',
      direction: 'positive',
      formula: 'rank(stockj-stockd)+I(stockk>stockd)-I(stockj>100)',
      ic: 0.037,
      id: 'kdj_momentum_factor',
      longShortReturn: 0.046,
      name: 'KDJ动能因子',
      rankIc: 0.045,
      source: '根据 yiwan 指标字段设计，非该站真实回测数据',
      status: '待验证',
      window: 9,
    },
    {
      category: 'chip',
      description: '由获利盘、套牢盘、筹码集中度推导，用于判断筹码结构是否健康。',
      direction: 'positive',
      formula: 'rank(huolipan)-rank(taolaopan)-rank(90%集中度+70%集中度)',
      ic: 0.032,
      id: 'chip_health_factor',
      longShortReturn: 0.038,
      name: '筹码健康因子',
      rankIc: 0.041,
      source: '根据 yiwan 指标字段设计，非该站真实回测数据',
      status: '待验证',
      window: 20,
    },
    {
      category: 'composite',
      description: '综合均线、均量、KDJ、筹码、MACD，形成第一版技术面强度排序。',
      direction: 'positive',
      formula: '0.30*trend+0.20*volume+0.20*kdj+0.20*macd+0.10*chip',
      ic: 0.064,
      id: 'technical_composite_factor',
      longShortReturn: 0.085,
      name: '技术综合强度因子',
      rankIc: 0.073,
      source: '根据 yiwan 指标字段设计，非该站真实回测数据',
      status: '待验证',
      window: 60,
    },
    {
      category: 'capital_flow',
      description: '由暗盘资金、明盘资金、散户资金及3/5日暗盘强度推导，捕捉大资金持续流入。',
      direction: 'positive',
      formula: '0.35*rank(apzj)+0.25*rank(ap_d3)+0.20*rank(ap_d5)+0.10*rank(mpzj)-0.10*rank(shzj)',
      ic: 0.067,
      id: 'capital_follow_factor',
      longShortReturn: 0.091,
      name: '资金跟随因子',
      rankIc: 0.078,
      source: '根据 yiwan 暗盘/主力资金字段设计，非该站真实回测数据',
      status: '待验证',
      window: 5,
    },
    {
      category: 'capital_flow',
      description: '大资金强、散户弱时加分，用来寻找主力与散户行为分歧的股票。',
      direction: 'positive',
      formula: 'rank(apzj+mpzj)-rank(shzj)+I(ap_d3>0)+I(ap_d5>0)',
      ic: 0.061,
      id: 'institution_retail_divergence_factor',
      longShortReturn: 0.082,
      name: '主散背离因子',
      rankIc: 0.069,
      source: '根据 yiwan darkFactor 字段设计，非该站真实回测数据',
      status: '待验证',
      window: 5,
    },
    {
      category: 'sentiment',
      description: '上涨概率、散户资金、换手和量比同时过高时，识别交易拥挤和追高风险。',
      direction: 'negative',
      formula: 'rank(up)+rank(shzj)+rank(hslv)+rank(lbi)-rank(ap_d5)',
      ic: -0.046,
      id: 'sentiment_overheat_factor',
      longShortReturn: 0.052,
      name: '情绪过热因子',
      rankIc: -0.055,
      source: '根据 yiwan darkFactor/market 字段设计，非该站真实回测数据',
      status: '待验证',
      window: 3,
    },
    {
      category: 'sentiment',
      description: '市场或个股恐慌下跌时，如果主力/超大单没有同步流出，尝试识别错杀反转。',
      direction: 'positive',
      formula: 'rank(down_zdfd)+rank(abs(zdfd))+I(zljlr>=0)+I(cddjlr>=0)-rank(shzj)',
      ic: 0.044,
      id: 'panic_reversal_factor',
      longShortReturn: 0.064,
      name: '恐慌反转因子',
      rankIc: 0.052,
      source: '根据 yiwan 大盘宽度/资金字段设计，非该站真实回测数据',
      status: '待验证',
      window: 3,
    },
    {
      category: 'sector',
      description: '板块资金、板块涨跌与个股主力净流入同向时加分，衡量板块和个股共振。',
      direction: 'positive',
      formula: 'rank(sector_zdfd)+rank(sector_zljlr)+rank(stock_zljlr)+corr(sector_dde_z,stock_zdfd)',
      ic: 0.054,
      id: 'sector_capital_resonance_factor',
      longShortReturn: 0.071,
      name: '板块资金共振因子',
      rankIc: 0.062,
      source: '根据 yiwan plateData 图表字段设计，非该站真实回测数据',
      status: '待验证',
      window: 10,
    },
    {
      category: 'event',
      description: '异动发生时，用量比、换手、主力净流入和流通市值过滤，确认异动质量。',
      direction: 'positive',
      formula: 'rank(unusual_change_strength)+rank(lbi)+rank(hslv)+rank(zljlr)-rank(ltsz)',
      ic: 0.039,
      id: 'event_volume_confirmation_factor',
      longShortReturn: 0.058,
      name: '异动放量确认因子',
      rankIc: 0.047,
      source: '根据 yiwan unusualChange/mainForce 字段设计，非该站真实回测数据',
      status: '待验证',
      window: 1,
    },
  ].map(enrichFactor);
}

function ensureState() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(statePath)) {
    writeFileSync(statePath, `${JSON.stringify(seedState, null, 2)}\n`);
  }
}

function readState() {
  ensureState();
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) {
    return fallback;
  }

  return JSON.parse(readFileSync(path, 'utf8'));
}

function readFirstJsonFile(paths, fallback) {
  for (const path of paths) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  }

  return fallback;
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(data));
}

function sendCsv(res, filename, text) {
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Type': 'text/csv; charset=utf-8',
  });
  res.end(`\ufeff${text}`);
}

function sendText(res, filename, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Type': contentType,
  });
  res.end(text);
}

function sendError(res, message, status = 400) {
  sendJson(res, { error: message }, status);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function classifyFactor(factor) {
  const predictivePower = Math.abs(factor.ic) * 0.45
    + Math.abs(factor.rankIc) * 0.35
    + factor.longShortReturn * 0.2;

  return predictivePower >= 0.055 ? '有效' : '观察';
}

function enrichFactor(factor) {
  const status = factor.status || classifyFactor(factor);
  const score = Math.round(
    (Math.abs(factor.ic) * 45
      + Math.abs(factor.rankIc) * 35
      + factor.longShortReturn * 20)
      * 1000,
  ) / 10;

  return {
    ...factor,
    score,
    status,
  };
}

function buildSummary(state) {
  const factors = [
    ...state.factors.map(enrichFactor),
    ...buildIndicatorDerivedFactors(),
  ];
  const demoFactors = factors.filter((factor) => !factor.source);
  const pendingFactors = factors.filter((factor) => factor.status === '待验证');
  const prototypeEffectiveFactors = factors.filter((factor) => factor.status === '有效');
  const averageLongShortReturn =
    factors.reduce((sum, factor) => sum + factor.longShortReturn, 0) / factors.length;
  const averageRankIc =
    factors.reduce((sum, factor) => sum + Math.abs(factor.rankIc), 0) / factors.length;

  return {
    annualReturn: 0.16 + averageLongShortReturn * 0.8 + averageRankIc * 0.35,
    benchmarkName: state.preferences.universe,
    candidateFactorCount: factors.length,
    demoFactorCount: demoFactors.length,
    factorCount: factors.length,
    maxDrawdown: -0.086,
    newStrategiesThisMonth: 3,
    pendingFactorCount: pendingFactors.length,
    prototypeEffectiveFactorCount: prototypeEffectiveFactors.length,
    strategyCount: 18,
    validFactorCount: 0,
  };
}

function buildEquityCurve(state) {
  const summary = buildSummary(state);
  const riskDiscount = state.preferences.riskControl ? 0.92 : 1;
  const feeDrag = (state.preferences.feeRate + state.preferences.slippage) * 12;
  const strategyGrowth = Math.max(0.24, summary.annualReturn * riskDiscount - feeDrag);
  const benchmarkGrowth = 0.3;
  const months = 18;

  const labels = Array.from({ length: months }, (_, index) => `M${index + 1}`);
  const strategy = labels.map((_, index) => {
    const trend = 1 + (strategyGrowth * index) / (months - 1);
    const wave = Math.sin(index * 1.4) * 0.028;
    return Number((trend + wave).toFixed(4));
  });
  const benchmark = labels.map((_, index) => {
    const trend = 1 + (benchmarkGrowth * index) / (months - 1);
    const wave = Math.sin(index * 1.15) * 0.017;
    return Number((trend + wave).toFixed(4));
  });

  return {
    benchmark,
    labels,
    strategy,
  };
}

function getUniverses() {
  return [
    { benchmark: '000300.SH', label: '沪深300', value: '沪深300' },
    { benchmark: '000905.SH', label: '中证500', value: '中证500' },
    { benchmark: '000852.SH', label: '中证1000', value: '中证1000' },
    { benchmark: '881001.WI', label: '全A', value: '全A' },
  ];
}

function distinctDateCount(rows) {
  return new Set(rows.map((row) => dateOnly(row.date || row.stock_date)).filter(Boolean)).size;
}

function distinctStockCount(rows) {
  return new Set(rows.map((row) => row.stock_code || row.code || row.security).filter(Boolean)).size;
}

function buildDataCoverageSnapshot() {
  const primaryRows = readPrimaryFactorRows();
  const capitalRows = readCapitalFactorRows();
  const akshareSummary = readJsonFile(akshareHistorySummaryPath, {});
  const akshareBacktest = readJsonFile(akshareOhlcvBacktestPath, {});
  const akshareStrategyValidation = readJsonFile(akshareStrategyValidationPath, {});
  const akshareFactorQualityAudit = readJsonFile(akshareFactorQualityAuditPath, {});
  const strategyMaturityAudit = readJsonFile(strategyMaturityAuditPath, {});
  const paperWatchRoutes = readJsonFile(paperWatchRoutesPath, {});
  const allRawRows = [...primaryRows, ...capitalRows];
  const importedFactorResults = readImportedFactorResults();
  const importedStrategyResults = readImportedStrategyResults();
  const jqSampleDates = importedFactorResults
    .map((item) => Number(item.sample_dates))
    .filter(Number.isFinite);
  const maxJqSampleDates = jqSampleDates.length ? Math.max(...jqSampleDates) : 0;
  const rawDateCount = distinctDateCount(allRawRows);

  return {
    rawDateCount,
    rawRows: allRawRows.length,
    rawStockCount: distinctStockCount(allRawRows),
    primaryDateCount: distinctDateCount(primaryRows),
    primaryRows: primaryRows.length,
    capitalDateCount: distinctDateCount(capitalRows),
    capitalRows: capitalRows.length,
    importedFactorResultCount: importedFactorResults.length,
    importedStrategyResultCount: importedStrategyResults.length,
    akshareDates: Number(akshareSummary.dates || 0),
    akshareFailures: Array.isArray(akshareSummary.failures) ? akshareSummary.failures.length : 0,
    akshareOutput: akshareSummary.output || '',
    akshareRows: Number(akshareSummary.rows || 0),
    akshareStocksRequested: Number(akshareSummary.stocks_requested || 0),
    akshareStocksSuccess: Number(akshareSummary.stocks_success || 0),
    akshareBacktestFactorResults: Number(akshareBacktest.factor_result_count || 0),
    akshareBacktestPolicy: akshareBacktest.data_policy || '',
    akshareBacktestStrategyResults: Number(akshareBacktest.strategy_result_count || 0),
    akshareStrategyValidationCandidates: Number(akshareStrategyValidation.candidate_count || 0),
    akshareStrategyValidationPolicy: akshareStrategyValidation.data_policy || '',
    akshareStrategyValidationReviewCandidates: Number(
      akshareStrategyValidation.joinquant_review_candidate_count
      || akshareStrategyValidation.paper_watch_candidate_count
      || 0,
    ),
    akshareAuditAlphaCandidates: Number(akshareFactorQualityAudit.factor_decision_counts?.alpha_candidate || 0),
    akshareAuditFactorCount: Number(akshareFactorQualityAudit.factor_count || 0),
    akshareAuditNotTradeable: Number(akshareFactorQualityAudit.factor_decision_counts?.significant_not_tradeable || 0),
    akshareAuditRejected: Number(akshareFactorQualityAudit.factor_decision_counts?.reject_standalone || 0),
    akshareAuditStrategyReviewCandidates: Number(akshareFactorQualityAudit.strategy_decision_counts?.awaiting_joinquant_review || 0),
    akshareAuditWatch: Number(akshareFactorQualityAudit.factor_decision_counts?.watch || 0),
    controlledPaperWatchRouteCount: Number(strategyMaturityAudit.controlled_route_count || 0),
    firstPaperWatchRouteCount: Number(paperWatchRoutes.route_count || 0),
    paperWatchStatus: paperWatchRoutes.status || '',
    strategyMaturityControlledCount: Number(strategyMaturityAudit.decision_counts?.controlled_route_paper_watch || 0),
    strategyMaturityRejectedCount: Number(strategyMaturityAudit.decision_counts?.reject_or_rework || 0),
    strategyMaturityStrategyCount: Number(strategyMaturityAudit.strategy_count || 0),
    maxJqSampleDates,
    localBacktestReady: rawDateCount >= 60,
    minimumLocalDays: 60,
    preferredLocalDays: 240,
  };
}

function buildDataCoverageRisks() {
  const coverage = buildDataCoverageSnapshot();
  return [
    {
      detail: `Yiwan 原始因子截面：${coverage.rawRows} 行 / ${coverage.rawStockCount} 只股票。`,
      limit: coverage.minimumLocalDays,
      name: '原始截面天数',
      nextAction: coverage.localBacktestReady
        ? '已达到本地最低回测天数，下一步检查未来收益标签和停牌涨跌停处理。'
        : '继续补连续历史；最低 60 日，专业建议 120-240 日。',
      status: coverage.localBacktestReady ? 'ready' : 'blocked',
      value: coverage.rawDateCount,
      valueText: `${coverage.rawDateCount}日`,
    },
    {
      detail: `技术/指标样本 ${coverage.primaryRows} 行，资金样本 ${coverage.capitalRows} 行。`,
      limit: 1,
      name: '数据口径拆分',
      nextAction: '技术截面、资金截面、JoinQuant历史结果必须分开解读，不再混为同一证据。',
      status: 'watch',
      value: Math.min(100, coverage.primaryDateCount + coverage.capitalDateCount),
      valueText: `技术${coverage.primaryDateCount}日 / 资金${coverage.capitalDateCount}日`,
    },
    {
      detail: `已导入因子结果 ${coverage.importedFactorResultCount} 条，策略结果 ${coverage.importedStrategyResultCount} 条。`,
      limit: 60,
      name: 'JoinQuant历史实测',
      nextAction: '短期继续把严肃 IC、分组收益、策略净值交给 JoinQuant 生成真实结果。',
      status: coverage.maxJqSampleDates >= 60 ? 'ready' : 'watch',
      value: coverage.maxJqSampleDates,
      valueText: `${coverage.maxJqSampleDates}样本日`,
    },
    {
      detail: coverage.akshareRows
        ? `AkShare 已落地 ${coverage.akshareRows} 行 OHLCV，${coverage.akshareStocksSuccess}/${coverage.akshareStocksRequested} 只股票成功；失败 ${coverage.akshareFailures} 只。输出：${coverage.akshareOutput}`
        : '尚未成功落地 AkShare 历史 OHLCV。',
      limit: coverage.preferredLocalDays,
      name: 'AkShare历史行情',
      nextAction: coverage.akshareStocksSuccess >= 50
        ? '可开始做本地多股票横截面验证，但仍要继续扩股票池和复核复权口径。'
        : '当前只证明通道可用；下一步按批次扩到至少50-300只股票，再做本地因子检验。',
      status: coverage.akshareDates >= 240 && coverage.akshareStocksSuccess >= 50 ? 'ready' : (coverage.akshareRows ? 'watch' : 'blocked'),
      value: coverage.akshareDates,
      valueText: coverage.akshareRows ? `${coverage.akshareDates}日 / ${coverage.akshareStocksSuccess}股` : '未落地',
    },
    {
      detail: coverage.akshareBacktestFactorResults
        ? `${coverage.akshareBacktestPolicy} 当前已有因子结果 ${coverage.akshareBacktestFactorResults} 条、策略结果 ${coverage.akshareBacktestStrategyResults} 条。`
        : '尚未生成 AkShare 本地 OHLCV 因子回测。',
      limit: 50,
      name: 'AkShare本地回测',
      nextAction: coverage.akshareBacktestStrategyResults
        ? '把正结果继续扩到更大股票池和分层检验；负结果直接记录，不进入模拟盘候选。'
        : '先运行 AkShare OHLCV 因子回测脚本，生成真实 IC、RankIC、多空收益和组合净值。',
      status: coverage.akshareBacktestStrategyResults ? 'watch' : 'blocked',
      value: coverage.akshareBacktestFactorResults + coverage.akshareBacktestStrategyResults,
      valueText: coverage.akshareBacktestStrategyResults ? `${coverage.akshareBacktestFactorResults}因子 / ${coverage.akshareBacktestStrategyResults}策略` : '未回测',
    },
    {
      detail: coverage.akshareStrategyValidationCandidates
        ? `${coverage.akshareStrategyValidationPolicy} 已做候选稳定性验证 ${coverage.akshareStrategyValidationCandidates} 条，其中 ${coverage.akshareStrategyValidationReviewCandidates} 条通过本地门槛，状态仅为待 JoinQuant 复核。`
        : '尚未对 AkShare 本地强分层策略做候选稳定性验证。',
      limit: 2,
      name: 'AkShare候选复核',
      nextAction: coverage.akshareStrategyValidationReviewCandidates
        ? '把通过本地门槛的候选迁移到 JoinQuant，补真实成交额、换手率、市值、行业暴露后再决定是否进入模拟盘观察。'
        : '先做年度分段、样本外切分和成本后净值稳定性验证。',
      status: coverage.akshareStrategyValidationReviewCandidates >= 2 ? 'watch' : 'blocked',
      value: coverage.akshareStrategyValidationReviewCandidates,
      valueText: coverage.akshareStrategyValidationCandidates
        ? `${coverage.akshareStrategyValidationReviewCandidates}/${coverage.akshareStrategyValidationCandidates}待复核`
        : '未验证',
    },
    {
      detail: coverage.akshareAuditFactorCount
        ? `严格审计 ${coverage.akshareAuditFactorCount} 个 AkShare OHLCV 因子：${coverage.akshareAuditAlphaCandidates} 个单因子通过，${coverage.akshareAuditNotTradeable} 个显著但不可单独交易，${coverage.akshareAuditWatch} 个观察，${coverage.akshareAuditRejected} 个暂缓。`
        : '尚未生成 AkShare 因子质量审计。',
      limit: 1,
      name: 'AkShare因子审计',
      nextAction: coverage.akshareAuditStrategyReviewCandidates
        ? '只允许单因子通过项进入组合研究；显著但不可交易项只能做风控或组合模块；6条策略候选必须等待 JoinQuant 复核。'
        : '运行 AkShare 因子质量审计脚本，避免未过筛因子进入策略。',
      status: coverage.akshareAuditAlphaCandidates >= 1 ? 'ready' : (coverage.akshareAuditFactorCount ? 'watch' : 'blocked'),
      value: coverage.akshareAuditAlphaCandidates,
      valueText: coverage.akshareAuditFactorCount
        ? `${coverage.akshareAuditAlphaCandidates}/${coverage.akshareAuditFactorCount}通过`
        : '未审计',
    },
    {
      detail: coverage.strategyMaturityStrategyCount
        ? `已审计 ${coverage.strategyMaturityStrategyCount} 个 JoinQuant 实测策略：${coverage.strategyMaturityControlledCount} 个只允许分层路线模拟观察，${coverage.strategyMaturityRejectedCount} 个暂缓；首批配置 ${coverage.firstPaperWatchRouteCount} 条路线。`
        : '尚未生成 JoinQuant 策略成熟度审计。',
      limit: 2,
      name: '策略成熟度审计',
      nextAction: coverage.firstPaperWatchRouteCount >= 2
        ? '首批只允许配置文件中的受控路线进入模拟观察；不得放开整策略或未通过分层。'
        : '继续导入 JoinQuant 交易净值、分层和成本结果，直到至少两条不同策略路线通过。',
      status: coverage.firstPaperWatchRouteCount >= 2 ? 'ready' : (coverage.strategyMaturityStrategyCount ? 'watch' : 'blocked'),
      value: coverage.firstPaperWatchRouteCount,
      valueText: coverage.paperWatchStatus === 'ready_for_controlled_paper_watch'
        ? `${coverage.firstPaperWatchRouteCount}条路线`
        : '未就绪',
    },
    {
      detail: coverage.localBacktestReady
        ? '本地历史长度达到最低门槛，但仍要处理复权、停牌、涨跌停和未来收益。'
        : '当前本地原始历史太短，不能在项目内独立计算稳定 IC 或净值曲线。',
      limit: coverage.minimumLocalDays,
      name: '本地回测能力',
      nextAction: '补 AkShare/JoinQuant 连续 OHLCV、估值、行业、市值数据后再开启本地回测。',
      status: coverage.localBacktestReady ? 'ready' : 'blocked',
      value: coverage.rawDateCount,
      valueText: coverage.localBacktestReady ? '可准备' : '未就绪',
    },
  ];
}

function buildPaperWatchRoutes() {
  const pack = readJsonFile(paperWatchRoutesPath, {});
  const executionPack = readJsonFile(paperWatchExecutionPackPath, {});
  const readinessAudit = readJsonFile(paperWatchReadinessAuditPath, {});
  const routes = Array.isArray(pack.routes) ? pack.routes : [];
  const executionRoutes = Array.isArray(executionPack.routes) ? executionPack.routes : [];
  const readinessRoutes = Array.isArray(readinessAudit.routes) ? readinessAudit.routes : [];
  const executionByRoute = new Map(executionRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_layer || ''}`,
    route,
  ]));
  const readinessByRoute = new Map(readinessRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_layer || ''}`,
    route,
  ]));
  const enrichedRoutes = routes.map((route) => ({
    ...route,
    execution: executionByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || null,
    readiness: readinessByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || null,
  }));
  const readinessCounts = readinessAudit.decision_counts || {};
  return {
    generatedAt: pack.generated_at || '',
    dataPolicy: pack.data_policy || '只展示已通过真实回测审计的受控模拟观察路线。',
    executionDataPolicy: executionPack.data_policy || '',
    executionStatus: executionPack.status || 'not_ready',
    globalControls: Array.isArray(executionPack.global_controls) ? executionPack.global_controls : [],
    requiredControls: Array.isArray(pack.required_controls) ? pack.required_controls : [],
    readinessCounts,
    readinessDataPolicy: readinessAudit.data_policy || '',
    readinessStatus: readinessCounts.ready_controlled_paper_watch
      ? 'ready_controlled_paper_watch'
      : readinessCounts.conditional_paper_watch
        ? 'conditional_paper_watch'
        : readinessCounts.conditional_recheck_required
          ? 'conditional_recheck_required'
          : 'not_ready',
    routeCount: Number(pack.route_count || enrichedRoutes.length || 0),
    routes: enrichedRoutes,
    selectionPolicy: pack.selection_policy || '',
    status: pack.status || 'not_ready',
  };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function jqSecurityCode(code) {
  const padded = String(code || '').padStart(6, '0');
  if (padded.startsWith('6')) return `${padded}.XSHG`;
  return `${padded}.XSHE`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

const exportableBacktestFactors = [
  {
    id: 'technical_composite',
    name: '技术综合强度',
    direction: 'positive',
    usage: '第一版综合排序，用于检验趋势、量价、动能、筹码和拥挤扣分后的整体选股能力。',
  },
  {
    id: 'trend_alignment',
    name: '趋势质量专业版',
    direction: 'positive',
    usage: '验证中短期趋势结构是否具备持续收益预测力。',
  },
  {
    id: 'volume_price_confirmation',
    name: '量价确认专业版',
    direction: 'positive',
    usage: '验证上涨是否获得真实成交质量支持。',
  },
  {
    id: 'crowding_risk',
    name: '拥挤风险专业版',
    direction: 'negative',
    usage: '验证交易拥挤、爆量、过热是否对应后续回撤或弱收益。',
  },
  {
    id: 'volume_price_divergence_risk',
    name: '量价背离风险',
    direction: 'negative',
    usage: '验证放量但价格结构不健康时的风险识别能力。',
  },
  {
    id: 'trend_extension_risk',
    name: '趋势过伸风险',
    direction: 'negative',
    usage: '验证过度偏离趋势后追高的风险。',
  },
  {
    id: 'kline_event_score',
    name: '单根K线评分',
    direction: 'positive',
    usage: '验证华福单根K线评分是否对短期收益有辅助解释力。',
  },
  {
    id: 'chip_health',
    name: '筹码健康',
    direction: 'positive',
    usage: '验证获利盘、套牢盘和筹码集中度组合后的持仓质量。',
  },
  {
    id: 'macd_acceleration',
    name: 'MACD动能加速',
    direction: 'positive',
    usage: '验证 MACD 动能改善是否能强化趋势信号。',
  },
  {
    id: 'kdj_momentum',
    name: 'KDJ动能',
    direction: 'positive',
    usage: '验证短周期动能对 1/5/10 日收益的解释力。',
  },
  {
    id: 'capital_follow_signal',
    name: '资金跟随信号',
    direction: 'positive',
    usage: '验证主力与活跃暗盘资金同向增强时，是否对应后续收益改善。',
  },
  {
    id: 'active_ap_accumulation',
    name: '活跃暗盘吸筹',
    direction: 'positive',
    usage: '验证活跃暗盘资金强度和净流入强度是否能作为资金确认。',
  },
  {
    id: 'main_force_alignment',
    name: '主力一致性',
    direction: 'positive',
    usage: '验证主力资金强度、净流入和价格确认是否同向。',
  },
  {
    id: 'institutional_contra_divergence',
    name: '主反向背离',
    direction: 'positive',
    usage: '验证主资金强、反向流压力低的资金结构是否更健康。',
  },
  {
    id: 'capital_overheat_risk',
    name: '资金过热风险',
    direction: 'negative',
    usage: '验证高换手、高热度、高涨幅并伴随反向流压力时的回撤风险。',
  },
  {
    id: 'sentiment_overheat_factor',
    name: '情绪过热因子',
    direction: 'negative',
    usage: '当前可回测版本使用真实已计算字段：价格热度、交易拥挤、爆量风险、成交拥挤，作为原始情绪过热公式缺字段时的代理风险因子。',
  },
  {
    id: 'capital_persistence_2d',
    name: '2日资金持续性',
    direction: 'positive',
    usage: '验证连续两日资金跟随信号是否比单日资金信号更稳定。',
  },
];

function findExportableBacktestFactor(factorId) {
  if (!factorId) return null;
  return exportableBacktestFactors.find((factor) => factor.id === factorId) || null;
}

function safeFilename(value) {
  return String(value || 'factor')
    .replaceAll(/[^a-zA-Z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildJoinQuantFactorRows(options = {}) {
  const selectedFactor = findExportableBacktestFactor(options.factor);
  const factors = selectedFactor ? [selectedFactor] : exportableBacktestFactors;
  const rows = readBacktestFactorRows();
  const sourceSummary = readCombinedFactorSummary();

  return rows.flatMap((row) => factors
    .filter((factor) => row[factor.id] !== null && row[factor.id] !== undefined && row[factor.id] !== '')
    .map((factor) => ({
      date: dateOnly(row.date || row.stock_date),
      security: jqSecurityCode(row.stock_code || row.code),
      code: String(row.stock_code || row.code).padStart(6, '0'),
      name: row.stock_name || row.name,
      factor_name: factor.id,
      factor_display_name: factor.name,
      factor_direction: factor.direction,
      factor_value: toNumber(row[factor.id], ''),
      factor_version: 'm-quant-v1.0-real-cross-section',
      source_file: sourceSummary.source_file || researchFactorResultsPath,
      source_date: row.stock_date || row.date,
      factor_label: row.factor_label || '',
      close: row.close ?? '',
    })));
}

function buildJoinQuantCsv(options = {}) {
  const rows = buildJoinQuantFactorRows(options);
  const headers = [
    'date',
    'security',
    'code',
    'name',
    'factor_name',
    'factor_display_name',
    'factor_direction',
    'factor_value',
    'factor_version',
    'source_date',
    'factor_label',
    'close',
    'source_file',
  ];
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

function findLiveStrategy(strategyId) {
  const signalPack = buildLiveStrategySignals();
  const strategy = signalPack.strategies.find((item) => item.id === strategyId);
  return { signalPack, strategy };
}

function buildJoinQuantStrategyRows(strategyId) {
  const { strategy } = findLiveStrategy(strategyId);
  if (!strategy) return null;
  const factorStates = Array.isArray(strategy.factorState) ? strategy.factorState : [];
  const routeFactors = factorStates
    .map((factor) => (typeof factor === 'string' ? { factorId: factor, role: '', weight: null } : factor))
    .filter((factor) => factor.factorId);
  const factorIds = new Set(routeFactors.map((factor) => factor.factorId));
  const factorById = routeFactors.reduce((map, factor) => {
    map[factor.factorId] = factor;
    return map;
  }, {});
  const rows = readBacktestFactorRows();
  const sourceSummary = readCombinedFactorSummary();

  return rows.flatMap((row) => Array.from(factorIds)
    .filter((factorId) => row[factorId] !== null && row[factorId] !== undefined && row[factorId] !== '')
    .map((factorId) => {
      const factor = factorById[factorId] || {};
      return {
        date: dateOnly(row.date || row.stock_date),
        security: jqSecurityCode(row.stock_code || row.code),
        code: String(row.stock_code || row.code).padStart(6, '0'),
        name: row.stock_name || row.name,
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        factor_name: factorId,
        factor_display_name: factor.name || researchFactorDisplayName(factorId),
        factor_role: factor.role || '',
        factor_weight: factor.weight ?? '',
        best_horizon: factor.bestHorizon ?? '',
        factor_status: factor.status || '',
        factor_value: toNumber(row[factorId], ''),
        factor_version: 'm-quant-strategy-route-v1',
        source_date: row.stock_date || row.date,
        close: row.close ?? '',
        source_file: sourceSummary.source_file || researchFactorResultsPath,
      };
    }));
}

function buildJoinQuantStrategyCsv(strategyId) {
  const rows = buildJoinQuantStrategyRows(strategyId);
  if (!rows) return null;
  const headers = [
    'date',
    'security',
    'code',
    'name',
    'strategy_id',
    'strategy_name',
    'factor_name',
    'factor_display_name',
    'factor_role',
    'factor_weight',
    'best_horizon',
    'factor_status',
    'factor_value',
    'factor_version',
    'source_date',
    'close',
    'source_file',
  ];
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

function buildJoinQuantStrategyPackage(strategyId) {
  const { signalPack, strategy } = findLiveStrategy(strategyId);
  if (!strategy) return null;
  const rows = buildJoinQuantStrategyRows(strategyId) || [];
  const factorStates = Array.isArray(strategy.factorState) ? strategy.factorState : [];
  const routeFactors = factorStates
    .map((factor) => (typeof factor === 'string' ? {
      factorId: factor,
      name: researchFactorDisplayName(factor),
      role: '',
      weight: null,
      bestHorizon: null,
      detail: [],
    } : factor));

  return {
    generatedAt: new Date().toISOString(),
    dataPolicy: '策略级导出只包含 M-quant 当前真实策略路线和真实因子值；1日仅作参考，5/10/20 用于选择最佳周期；不包含任何虚构收益。',
    joinquantUsage: {
      csvEndpoint: `/strategy-api/joinquant-strategy-export.csv?strategy=${strategy.id}`,
      scriptEndpoint: `/strategy-api/joinquant-strategy-script.py?strategy=${strategy.id}`,
      historicalScriptEndpoint: `/strategy-api/joinquant-strategy-historical-script.py?strategy=${strategy.id}`,
      resultImportEndpoint: '/backtest-api/import-results',
      mode: 'uploaded_factor_event_test',
      note: 'CSV 脚本验证当前真实截面；历史重建脚本在 JoinQuant 用 OHLCV 重建因子并做策略级样本检验。',
    },
    route: {
      id: strategy.id,
      name: strategy.name,
      status: strategy.status,
      objective: strategy.objective,
      rankingFormula: strategy.rankingFormula,
      entryRules: strategy.entryRules,
      riskFilters: strategy.riskFilters,
      portfolioRules: strategy.portfolioRules,
      nextAction: strategy.nextAction,
      factors: routeFactors.map((factor) => ({
        factorId: factor.factorId,
        name: factor.name,
        role: factor.role,
        weight: factor.weight,
        bestHorizon: factor.bestHorizon,
        status: factor.status,
        evidence: factor.evidence,
        detail: factor.detail || [],
      })),
    },
    exportStats: {
      rows: rows.length,
      uniqueDates: new Set(rows.map((row) => row.date).filter(Boolean)).size,
      uniqueStocks: new Set(rows.map((row) => row.security).filter(Boolean)).size,
      factors: new Set(rows.map((row) => row.factor_name).filter(Boolean)).size,
    },
    source: signalPack.source,
  };
}

function buildJoinQuantStrategyScript(strategyId) {
  const pack = buildJoinQuantStrategyPackage(strategyId);
  if (!pack) return null;
  const strategy = pack.route;
  const factors = strategy.factors.filter((factor) => factor.factorId);
  const factorIds = factors.map((factor) => factor.factorId);
  const weights = factors.reduce((map, factor) => {
    if (typeof factor.weight === 'number') map[factor.factorId] = factor.weight;
    return map;
  }, {});
  const positiveFactors = factors
    .filter((factor) => typeof factor.weight === 'number' && factor.weight > 0)
    .map((factor) => factor.factorId);
  const negativeFactors = factors
    .filter((factor) => typeof factor.weight === 'number' && factor.weight < 0)
    .map((factor) => factor.factorId);

  return `# M-quant JoinQuant strategy route test
# Strategy: ${strategy.name}
# Generated: ${pack.generatedAt}
# Policy: 1日只作参考；5/10/20 日用于选择因子最佳周期。本脚本只使用你上传的真实因子CSV，不生成虚构收益。
#
# 使用方法：
# 1. 在 M-quant 下载策略CSV：${pack.joinquantUsage.csvEndpoint}
# 2. 上传到 JoinQuant 研究环境，文件名建议：m_quant_strategy_${strategy.id}.csv
# 3. 在研究环境运行本脚本，确认 CSV_PATH 指向上传文件。
# 4. 将输出 JSON 复制回 M-quant 回测中心“结果回填”。
#
# 注意：当前 CSV 覆盖多少交易日，就只能验证多少信号日。若只有单日截面，不能当成多年策略回测。

import json
import math

import numpy as np
import pandas as pd

CSV_PATH = 'm_quant_strategy_${strategy.id}.csv'
STRATEGY_ID = '${strategy.id}'
STRATEGY_NAME = ${JSON.stringify(strategy.name)}
FACTOR_IDS = ${JSON.stringify(factorIds, null, 2)}
FACTOR_WEIGHTS = ${JSON.stringify(weights, null, 2)}
POSITIVE_FACTORS = ${JSON.stringify(positiveFactors, null, 2)}
NEGATIVE_FACTORS = ${JSON.stringify(negativeFactors, null, 2)}
HORIZONS = [5, 10, 20]
TOP_N = 30
BENCHMARK = '000300.XSHG'


def _to_float(value):
    try:
        number = float(value)
        if math.isnan(number):
            return np.nan
        return number
    except Exception:
        return np.nan


def load_strategy_factors(path=CSV_PATH):
    df = pd.read_csv(path)
    required = {'date', 'security', 'factor_name', 'factor_value'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError('CSV缺少字段: %s' % ','.join(sorted(missing)))
    df['date'] = pd.to_datetime(df['date']).dt.date
    df['factor_value'] = df['factor_value'].map(_to_float)
    wide = df.pivot_table(
        index=['date', 'security'],
        columns='factor_name',
        values='factor_value',
        aggfunc='last',
    ).reset_index()
    return wide


def cross_section_rank(series, higher_is_better=True):
    ranked = series.rank(pct=True, method='average')
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5)


def score_one_date(frame):
    scored = frame.copy()
    score = pd.Series(0.0, index=scored.index)
    for factor, weight in FACTOR_WEIGHTS.items():
        if factor not in scored.columns:
            continue
        higher_is_better = weight >= 0
        score += abs(weight) * cross_section_rank(scored[factor], higher_is_better=higher_is_better)
    scored['strategy_score'] = score
    return scored.sort_values('strategy_score', ascending=False)


def select_candidates(wide):
    selected = []
    for date, frame in wide.groupby('date'):
        frame = frame.copy()
        # 核心量价趋势策略的当前入池过滤。其他策略可先只看综合分，再按 M-quant 页面规则补充。
        if STRATEGY_ID == 'core_volume_price_trend_v1':
            if 'trend_alignment' in frame.columns:
                frame = frame[frame['trend_alignment'] >= 0.60]
            if 'volume_price_confirmation' in frame.columns:
                frame = frame[frame['volume_price_confirmation'] >= 0.60]
            if 'crowding_risk' in frame.columns:
                frame = frame[frame['crowding_risk'] <= 0.55]
            if 'volume_price_divergence_risk' in frame.columns:
                frame = frame[frame['volume_price_divergence_risk'] <= 0.45]
            if 'trend_extension_risk' in frame.columns:
                frame = frame[frame['trend_extension_risk'] <= 0.75]
        scored = score_one_date(frame)
        selected.append(scored.head(TOP_N))
    if not selected:
        return pd.DataFrame()
    return pd.concat(selected, ignore_index=True)


def get_forward_return(security, date, horizon):
    # JoinQuant 研究环境可用 get_price。这里避免同时传 start_date 和 count。
    prices = get_price(
        security,
        end_date=date,
        count=1,
        frequency='daily',
        fields=['close'],
        panel=False,
    )
    if prices is None or len(prices) == 0:
        return np.nan
    start_close = float(prices['close'].iloc[-1])
    trade_days = list(get_trade_days(start_date=date, end_date='2035-01-01'))
    if len(trade_days) <= horizon:
        return np.nan
    end_date = trade_days[horizon]
    future = get_price(
        security,
        start_date=date,
        end_date=end_date,
        frequency='daily',
        fields=['close'],
        panel=False,
    )
    if future is None or len(future) <= horizon:
        return np.nan
    end_close = float(future['close'].iloc[-1])
    if start_close <= 0:
        return np.nan
    return end_close / start_close - 1


def evaluate_candidates(candidates):
    rows = []
    for _, row in candidates.iterrows():
        item = {
            'date': str(row['date']),
            'security': row['security'],
            'strategy_score': float(row['strategy_score']),
        }
        for horizon in HORIZONS:
            item['ret_%sd' % horizon] = get_forward_return(row['security'], row['date'], horizon)
        rows.append(item)
    result = pd.DataFrame(rows)
    summary = []
    for horizon in HORIZONS:
        col = 'ret_%sd' % horizon
        values = result[col].dropna() if col in result.columns else pd.Series(dtype=float)
        summary.append({
            'strategy_id': STRATEGY_ID,
            'strategy_name': STRATEGY_NAME,
            'horizon': horizon,
            'sample_trades': int(values.shape[0]),
            'mean_return': None if values.empty else float(values.mean()),
            'median_return': None if values.empty else float(values.median()),
            'positive_ratio': None if values.empty else float((values > 0).mean()),
            'source': 'joinquant_uploaded_m_quant_strategy_csv',
            'note': '策略级事件检验；1日不参与正式筛选，5/10/20 为主评估周期。',
        })
    return result, summary


def run():
    factors = load_strategy_factors(CSV_PATH)
    candidates = select_candidates(factors)
    detail, summary = evaluate_candidates(candidates)
    output = {
        'strategy_id': STRATEGY_ID,
        'strategy_name': STRATEGY_NAME,
        'factor_ids': FACTOR_IDS,
        'candidate_count': int(candidates.shape[0]) if candidates is not None else 0,
        'summary': summary,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output, detail


result_json, detail_df = run()
`;
}

function buildJoinQuantStrategyHistoricalScript(strategyId) {
  const pack = buildJoinQuantStrategyPackage(strategyId);
  if (!pack) return null;
  const strategy = pack.route;
  const factors = strategy.factors.filter((factor) => factor.factorId);
  const factorIds = factors.map((factor) => factor.factorId);
  const weights = factors.reduce((map, factor) => {
    if (typeof factor.weight === 'number') map[factor.factorId] = factor.weight;
    return map;
  }, {});

  return `# M-quant JoinQuant historical strategy rebuild
# Strategy: ${strategy.name}
# Generated: ${pack.generatedAt}
# Policy: 不生成虚构收益。本脚本只在 JoinQuant 研究环境读取真实历史 OHLCV，重建可由行情复现的因子，再做策略级样本检验。
#
# 使用方法：
# 1. 在 JoinQuant 研究环境新建 Python3 Notebook。
# 2. 粘贴并运行本脚本。
# 3. 复制最后打印的 JSON，回填到 M-quant 回测中心。
#
# 重要边界：
# - 这是 JoinQuant OHLCV 重建版，不等于 Yiwan 全字段原始因子。
# - 资金、筹码、暗盘等字段若 JoinQuant 无法提供，本脚本不会凭空补造。
# - 1日不进入正式策略筛选；主评估周期为 5/10/20 日。

import json
import math

import numpy as np
import pandas as pd

from jqdata import *


STRATEGY_ID = '${strategy.id}'
STRATEGY_NAME = ${JSON.stringify(strategy.name)}
INDEX_CODE = '000300.XSHG'
PRICE_START = '2022-12-01'
FACTOR_START = '2024-01-01'
END_LIMIT = '2026-07-07'
HORIZONS = [5, 10, 20]
FACTOR_DAY_STEP = 5
MIN_CROSS_SECTION = 80
TOP_N = 30
FACTOR_IDS = ${JSON.stringify(factorIds, null, 2)}
FACTOR_WEIGHTS = ${JSON.stringify(weights, null, 2)}


def clip01(value):
    return value.clip(lower=0, upper=1)


def bounded_peak_score(series, target, width):
    return clip01(1 - (series - target).abs() / width)


def safe_ratio(a, b):
    return a / b.replace(0, np.nan)


def rank_pct(series):
    return series.rank(pct=True)


def normalize_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if 'time' not in df.columns:
        df = df.reset_index()
        if 'index' in df.columns and 'time' not in df.columns:
            df = df.rename(columns={'index': 'time'})
    if 'code' not in df.columns and 'security' in df.columns:
        df = df.rename(columns={'security': 'code'})
    df['date'] = pd.to_datetime(df['time']).dt.normalize()
    return df


def build_historical_factor_table():
    all_days = pd.to_datetime(get_trade_days(start_date=FACTOR_START, end_date=END_LIMIT))
    if len(all_days) <= max(HORIZONS) + 1:
        raise ValueError('历史交易日不足，无法做 5/10/20 日策略检验。')

    latest_trade_day = all_days[-1]
    usable_end = all_days[-max(HORIZONS) - 1]
    test_days = all_days[all_days <= usable_end][::FACTOR_DAY_STEP]
    if len(test_days) == 0:
        raise ValueError('没有可用测试日。')

    universe_by_date = {}
    securities = set()
    for day in test_days:
        stocks = get_index_stocks(INDEX_CODE, date=day.strftime('%Y-%m-%d'))
        universe_by_date[pd.Timestamp(day).normalize()] = set(stocks)
        securities.update(stocks)

    securities = sorted(securities)
    price = get_price(
        securities,
        start_date=PRICE_START,
        end_date=latest_trade_day.strftime('%Y-%m-%d'),
        frequency='daily',
        fields=['open', 'high', 'low', 'close', 'volume', 'money'],
        panel=False,
        fq='pre',
    )
    price = normalize_price_frame(price)
    if price.empty:
        raise ValueError('get_price 返回空数据。')

    price = price.sort_values(['code', 'date']).copy()
    group = price.groupby('code', group_keys=False)
    price['prev_close'] = group['close'].shift(1)
    price['change_pct'] = (price['close'] / price['prev_close'] - 1) * 100
    price['amplitude'] = (price['high'] - price['low']) / price['prev_close'].replace(0, np.nan) * 100
    price['volume_ma20'] = group['volume'].rolling(20, min_periods=10).mean().reset_index(level=0, drop=True)
    price['volume_ratio'] = price['volume'] / price['volume_ma20'].replace(0, np.nan)

    for window in [5, 10, 13, 20, 30, 60, 120, 250]:
        price['ma%d' % window] = group['close'].rolling(window, min_periods=max(5, window // 2)).mean().reset_index(level=0, drop=True)
        price['ma%d_dir' % window] = price.groupby('code')['ma%d' % window].transform(lambda s: s.diff())
    for window in [5, 10]:
        price['mavol%d' % window] = group['volume'].rolling(window, min_periods=max(3, window // 2)).mean().reset_index(level=0, drop=True)
        price['mavol%d_dir' % window] = price.groupby('code')['mavol%d' % window].transform(lambda s: s.diff())
    for horizon in HORIZONS:
        price['future_return_%d' % horizon] = group['close'].shift(-horizon) / price['close'] - 1

    rows = []
    for day, universe in universe_by_date.items():
        part = price[(price['date'] == day) & (price['code'].isin(universe))].copy()
        if len(part) < MIN_CROSS_SECTION:
            continue

        day_range = (part['high'] - part['low']).replace(0, np.nan)
        signed_body = (part['close'] - part['open']) / day_range
        body_ratio = ((part['close'] - part['open']).abs() / day_range).clip(0, 1).fillna(0)
        upper_ratio = ((part['high'] - np.maximum(part['open'], part['close'])) / day_range).clip(0, 1).fillna(0)
        lower_ratio = ((np.minimum(part['open'], part['close']) - part['low']) / day_range).clip(0, 1).fillna(0)
        close_position = ((part['close'] - part['low']) / day_range).clip(0, 1).fillna(0.5)

        change_rank = rank_pct(part['change_pct'])
        amplitude_rank = rank_pct(part['amplitude'])
        volume_ratio_rank = rank_pct(part['volume_ratio'])
        amount_rank = rank_pct(part['money'])

        bullish_body_score = clip01((signed_body + 1) / 2).fillna(0.5)
        candle_quality = clip01(0.45 * close_position + 0.25 * bullish_body_score + 0.20 * lower_ratio + 0.10 * (1 - upper_ratio))
        upper_shadow_pressure = clip01(0.65 * upper_ratio + 0.35 * (((upper_ratio > lower_ratio) & (close_position < 0.55)).astype(float)))

        trend_dir_score = (
            0.22 * (part['ma5_dir'] > 0).astype(float)
            + 0.18 * (part['ma13_dir'] > 0).astype(float)
            + 0.16 * (part['ma20_dir'] > 0).astype(float)
            + 0.14 * (part['ma30_dir'] > 0).astype(float)
            + 0.12 * (part['ma60_dir'] > 0).astype(float)
            + 0.10 * (part['ma120_dir'] > 0).astype(float)
            + 0.08 * (part['ma250_dir'] > 0).astype(float)
        )
        trend_position_score = (
            0.24 * (part['close'] > part['ma5']).astype(float)
            + 0.20 * (part['close'] > part['ma13']).astype(float)
            + 0.17 * (part['close'] > part['ma20']).astype(float)
            + 0.14 * (part['close'] > part['ma30']).astype(float)
            + 0.11 * (part['close'] > part['ma60']).astype(float)
            + 0.08 * (part['close'] > part['ma120']).astype(float)
            + 0.06 * (part['close'] > part['ma250']).astype(float)
        )
        trend_stack_score = (
            0.35 * (part['ma5'] > part['ma20']).astype(float)
            + 0.30 * (part['ma20'] > part['ma60']).astype(float)
            + 0.20 * (part['ma60'] > part['ma120']).astype(float)
            + 0.15 * (part['ma120'] > part['ma250']).astype(float)
        )
        short_medium_spread = safe_ratio(part['ma5'], part['ma20'])
        medium_long_spread = safe_ratio(part['ma20'], part['ma60'])
        trend_maturity = clip01(0.55 * bounded_peak_score(short_medium_spread, 1.035, 0.11) + 0.45 * bounded_peak_score(medium_long_spread, 1.045, 0.13))
        price_ma_distance = safe_ratio(part['close'], part['ma20']) - 1
        trend_extension_risk = clip01(((price_ma_distance.abs() - 0.035) / 0.14).fillna(0.5))
        trend_alignment = clip01(0.30 * trend_dir_score + 0.25 * trend_position_score + 0.20 * trend_stack_score + 0.15 * trend_maturity + 0.10 * (1 - trend_extension_risk))

        volume_quality = bounded_peak_score(part['volume_ratio'], 1.8, 2.2)
        volume_support = clip01(0.36 * (part['mavol5_dir'] > 0).astype(float) + 0.28 * (part['mavol10_dir'] > 0).astype(float) + 0.20 * volume_quality + 0.16 * amount_rank)
        price_action_quality = clip01(0.34 * change_rank + 0.30 * close_position + 0.22 * bullish_body_score + 0.14 * (1 - upper_shadow_pressure))
        volume_price_sync = clip01(
            0.35 * ((part['change_pct'] > 0) & (close_position >= 0.62)).astype(float)
            + 0.25 * ((part['volume_ratio'] >= 0.8) & (part['volume_ratio'] <= 3.2)).astype(float)
            + 0.20 * amount_rank
            + 0.20 * ((part['mavol5_dir'] > 0) | (part['mavol10_dir'] > 0)).astype(float)
        )
        volume_price_divergence_risk = clip01(
            0.30 * ((part['change_pct'] <= 0) & (volume_ratio_rank >= 0.65)).astype(float)
            + 0.25 * ((close_position <= 0.42) & (volume_ratio_rank >= 0.65)).astype(float)
            + 0.22 * upper_shadow_pressure
            + 0.13 * ((part['volume_ratio'] > 3.5) & (part['change_pct'] < 2)).astype(float)
            + 0.10 * ((part['amplitude'] > 10) & (close_position < 0.55)).astype(float)
        )
        blowoff_penalty = clip01(
            0.50 * (part['volume_ratio'] > 4).astype(float)
            + 0.25 * (upper_ratio > 0.45).astype(float)
            + 0.25 * (part['amplitude'] > 12).astype(float)
        )
        volume_price_confirmation = clip01(
            0.24 * volume_support
            + 0.22 * price_action_quality
            + 0.20 * volume_price_sync
            + 0.18 * trend_alignment
            + 0.08 * amount_rank
            + 0.08 * candle_quality
            - 0.22 * volume_price_divergence_risk
            - 0.10 * blowoff_penalty
        )

        transaction_crowding_risk = clip01(0.46 * volume_ratio_rank + 0.42 * amount_rank + 0.12 * (part['volume_ratio'] >= 3).astype(float))
        price_heat_risk = clip01(0.34 * change_rank + 0.26 * amplitude_rank + 0.22 * trend_extension_risk + 0.18 * (close_position >= 0.9).astype(float))
        candle_distribution_risk = clip01(
            0.45 * upper_shadow_pressure
            + 0.22 * ((close_position < 0.45) & (volume_ratio_rank > 0.65)).astype(float)
            + 0.18 * ((body_ratio <= 0.18) & (amplitude_rank > 0.65)).astype(float)
            + 0.15 * ((lower_ratio < 0.12) & (close_position < 0.35)).astype(float)
        )
        crowding_risk = clip01(0.34 * transaction_crowding_risk + 0.24 * price_heat_risk + 0.20 * candle_distribution_risk + 0.16 * volume_price_divergence_risk + 0.06 * (part['change_pct'] >= 9.5).astype(float))

        signed_return = (part['close'] - part['open']) / part['open'].replace(0, np.nan)
        up_context = (part['close'] > part['ma20']) & (part['ma20_dir'] > 0)
        spinning_top = (body_ratio > 0.08) & (body_ratio <= 0.35) & (upper_ratio >= 0.20) & (lower_ratio >= 0.20)
        high_volume = (part['volume_ratio'] >= 1.5) | (volume_ratio_rank >= 0.80)
        long_lower = (lower_ratio >= 0.55) & (upper_ratio <= 0.18) & (body_ratio <= 0.35)
        long_upper = (upper_ratio >= 0.55) & (lower_ratio <= 0.18) & (body_ratio <= 0.35)
        kline_event_score = pd.Series(0.0, index=part.index)
        kline_event_score += ((part['close'] > part['open']) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * 2
        kline_event_score += ((part['close'] < part['open']) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)).astype(float) * -2
        kline_event_score += ((signed_return >= 0.05) & (body_ratio >= 0.65)).astype(float) * 2
        kline_event_score += ((signed_return <= -0.05) & (body_ratio >= 0.65)).astype(float) * 2
        kline_event_score += (long_lower & ~up_context).astype(float) * -3
        kline_event_score += (spinning_top & high_volume).astype(float) * -1
        kline_event_score += (long_lower & up_context).astype(float) * 2
        kline_event_score += (long_upper & up_context).astype(float) * 2
        doji = body_ratio <= 0.08
        kline_event_score += doji.astype(float) * 1
        kline_event_score += (doji & (lower_ratio >= 0.60) & (upper_ratio <= 0.12)).astype(float) * 2
        kline_event_score += (doji & (upper_ratio >= 0.60) & (lower_ratio <= 0.12)).astype(float) * -2

        intraday_strength = clip01(0.34 * change_rank + 0.26 * candle_quality + 0.16 * volume_quality + 0.14 * amount_rank + 0.10 * (1 - upper_ratio))
        technical_composite = clip01(0.30 * trend_alignment + 0.27 * volume_price_confirmation + 0.18 * intraday_strength + 0.10 * (kline_event_score.rank(pct=True)) - 0.15 * crowding_risk)

        out = part[['date', 'code', 'close'] + ['future_return_%d' % h for h in HORIZONS]].copy()
        out['technical_composite'] = technical_composite
        out['trend_alignment'] = trend_alignment
        out['volume_price_confirmation'] = volume_price_confirmation
        out['crowding_risk'] = crowding_risk
        out['volume_price_divergence_risk'] = volume_price_divergence_risk
        out['trend_extension_risk'] = trend_extension_risk
        out['kline_event_score'] = kline_event_score
        rows.append(out)

    if not rows:
        raise ValueError('没有形成可用策略样本。')
    return pd.concat(rows, ignore_index=True)


def cross_section_rank(series, higher_is_better=True):
    ranked = series.rank(pct=True, method='average')
    if not higher_is_better:
        ranked = 1 - ranked
    return ranked.fillna(0.5)


def apply_entry_rules(frame):
    part = frame.copy()
    if STRATEGY_ID == 'core_volume_price_trend_v1':
        part = part[part['trend_alignment'] >= 0.60]
        part = part[part['volume_price_confirmation'] >= 0.60]
        part = part[part['crowding_risk'] <= 0.55]
        part = part[part['volume_price_divergence_risk'] <= 0.45]
        part = part[part['trend_extension_risk'] <= 0.75]
    return part


def score_strategy(frame):
    scored = frame.copy()
    score = pd.Series(0.0, index=scored.index)
    active_factor_count = 0
    for factor, weight in FACTOR_WEIGHTS.items():
        if factor not in scored.columns:
            continue
        score += abs(weight) * cross_section_rank(scored[factor], higher_is_better=(weight >= 0))
        active_factor_count += 1
    scored['strategy_score'] = score
    scored['active_factor_count'] = active_factor_count
    return scored.sort_values('strategy_score', ascending=False)


def select_candidates(factor_table):
    selected = []
    diagnostics = []
    for date, frame in factor_table.groupby('date'):
        filtered = apply_entry_rules(frame)
        scored = score_strategy(filtered)
        picked = scored.head(TOP_N).copy()
        diagnostics.append({
            'date': pd.Timestamp(date).strftime('%Y-%m-%d'),
            'universe': int(frame.shape[0]),
            'after_entry_rules': int(filtered.shape[0]),
            'selected': int(picked.shape[0]),
        })
        if not picked.empty:
            selected.append(picked)
    if not selected:
        return pd.DataFrame(), diagnostics
    return pd.concat(selected, ignore_index=True), diagnostics


def summarize_strategy(candidates):
    summaries = []
    if candidates.empty:
        return summaries
    for horizon in HORIZONS:
        col = 'future_return_%d' % horizon
        values = candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
        daily = candidates.groupby('date')[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
        summaries.append({
            'result_type': 'strategy_backtest',
            'strategy_id': STRATEGY_ID,
            'strategy_name': STRATEGY_NAME,
            'horizon': horizon,
            'sample_dates': int(daily.shape[0]),
            'sample_trades': int(values.shape[0]),
            'mean_return': None if values.empty else float(values.mean()),
            'median_return': None if values.empty else float(values.median()),
            'positive_ratio': None if values.empty else float((values > 0).mean()),
            'daily_mean_return': None if daily.empty else float(daily.mean()),
            'daily_positive_ratio': None if daily.empty else float((daily > 0).mean()),
            'best_daily_return': None if daily.empty else float(daily.max()),
            'worst_daily_return': None if daily.empty else float(daily.min()),
            'avg_candidates_per_date': None if daily.empty else float(values.shape[0] / daily.shape[0]),
            'source': 'joinquant_historical_ohlcv_strategy_rebuild',
            'note': '策略级历史重建检验；5/10/20 日为主评估周期。OHLCV可复现因子，不包含无法取得的 Yiwan 暗盘/筹码原字段。',
        })
    return summaries


def run():
    factor_table = build_historical_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    summary = summarize_strategy(candidates)
    preview_cols = ['date', 'code', 'strategy_score', 'active_factor_count'] + [c for c in FACTOR_IDS if c in candidates.columns]
    preview = candidates[preview_cols].head(50).copy() if not candidates.empty else pd.DataFrame(columns=preview_cols)
    if 'date' in preview.columns:
        preview['date'] = preview['date'].dt.strftime('%Y-%m-%d')
    output = {
        'result_type': 'strategy_backtest',
        'strategy_id': STRATEGY_ID,
        'strategy_name': STRATEGY_NAME,
        'source': 'joinquant_historical_ohlcv_strategy_rebuild',
        'data_policy': '真实 JoinQuant OHLCV 重建；未生成任何虚构收益；非 Yiwan 全字段等价复刻。',
        'config': {
            'index_code': INDEX_CODE,
            'price_start': PRICE_START,
            'factor_start': FACTOR_START,
            'end_limit': END_LIMIT,
            'horizons': HORIZONS,
            'factor_day_step': FACTOR_DAY_STEP,
            'top_n': TOP_N,
            'factor_ids': FACTOR_IDS,
            'factor_weights': FACTOR_WEIGHTS,
        },
        'sample': {
            'factor_rows': int(factor_table.shape[0]),
            'candidate_rows': int(candidates.shape[0]) if candidates is not None else 0,
            'test_dates': int(factor_table['date'].nunique()),
            'selected_dates': int(candidates['date'].nunique()) if candidates is not None and not candidates.empty else 0,
        },
        'summary': summary,
        'diagnostics_tail': diagnostics[-20:],
        'candidate_preview': preview.to_dict(orient='records'),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run()
	`;
}

function buildJoinQuantStrategyVolatilityRegimeScript(strategyId) {
  const baseScript = buildJoinQuantStrategyHistoricalScript(strategyId);
  if (!baseScript) return null;

  const regimeExtension = `

# --- Market volatility regime extension ---
# 目的：在同一套策略候选样本上，按真实市场波动率环境拆分回测结果。
# 口径：以沪深300日收益的20日滚动年化波动率为市场状态代理；
#      使用过去约1年滚动分位数划分高/中/低波动，避免使用未来信息。

REGIME_INDEX_CODE = '000300.XSHG'
REGIME_WINDOW = 20
REGIME_LOOKBACK = 252
REGIME_MIN_PERIODS = 60


def normalize_index_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if 'time' not in df.columns:
        df = df.reset_index()
        if 'index' in df.columns and 'time' not in df.columns:
            df = df.rename(columns={'index': 'time'})
    df['date'] = pd.to_datetime(df['time']).dt.normalize()
    return df[['date', 'close']].dropna().sort_values('date')


def build_market_regimes():
    index_price = get_price(
        REGIME_INDEX_CODE,
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency='daily',
        fields=['close'],
        panel=False,
        fq='pre',
    )
    index_price = normalize_index_price_frame(index_price)
    if index_price.empty:
        raise ValueError('市场指数 get_price 返回空数据，无法做波动率分层。')

    index_price['index_return'] = index_price['close'].pct_change()
    index_price['market_vol_20d'] = index_price['index_return'].rolling(REGIME_WINDOW, min_periods=REGIME_WINDOW).std() * math.sqrt(252)
    index_price['vol_p30'] = index_price['market_vol_20d'].rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS).quantile(0.30).shift(1)
    index_price['vol_p70'] = index_price['market_vol_20d'].rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS).quantile(0.70).shift(1)

    valid = index_price.dropna(subset=['market_vol_20d', 'vol_p30', 'vol_p70']).copy()
    if valid.empty:
        raise ValueError('市场波动率有效样本不足，无法划分高/中/低波动。')

    valid['market_regime'] = 'medium_volatility'
    valid.loc[valid['market_vol_20d'] >= valid['vol_p70'], 'market_regime'] = 'high_volatility'
    valid.loc[valid['market_vol_20d'] <= valid['vol_p30'], 'market_regime'] = 'low_volatility'
    valid['market_regime_name'] = valid['market_regime'].map({
        'high_volatility': '高波动',
        'medium_volatility': '中波动',
        'low_volatility': '低波动',
    })
    return valid[['date', 'market_vol_20d', 'vol_p30', 'vol_p70', 'market_regime', 'market_regime_name']]


def summarize_strategy_by_regime(candidates):
    summaries = []
    if candidates.empty:
        return summaries

    regime_order = [
        ('high_volatility', '高波动'),
        ('medium_volatility', '中波动'),
        ('low_volatility', '低波动'),
    ]
    for regime_id, regime_name in regime_order:
        regime_candidates = candidates[candidates['market_regime'] == regime_id].copy()
        if regime_candidates.empty:
            continue

        for horizon in HORIZONS:
            col = 'future_return_%d' % horizon
            values = regime_candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
            daily = regime_candidates.groupby('date')[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
            summaries.append({
                'result_type': 'strategy_regime_backtest',
                'strategy_id': STRATEGY_ID,
                'strategy_name': STRATEGY_NAME,
                'horizon': horizon,
                'market_regime': regime_id,
                'market_regime_name': regime_name,
                'sample_dates': int(daily.shape[0]),
                'sample_trades': int(values.shape[0]),
                'mean_return': None if values.empty else float(values.mean()),
                'median_return': None if values.empty else float(values.median()),
                'positive_ratio': None if values.empty else float((values > 0).mean()),
                'daily_mean_return': None if daily.empty else float(daily.mean()),
                'daily_positive_ratio': None if daily.empty else float((daily > 0).mean()),
                'best_daily_return': None if daily.empty else float(daily.max()),
                'worst_daily_return': None if daily.empty else float(daily.min()),
                'avg_candidates_per_date': None if daily.empty else float(values.shape[0] / daily.shape[0]),
                'market_vol_mean': None if regime_candidates['market_vol_20d'].dropna().empty else float(regime_candidates['market_vol_20d'].mean()),
                'source': 'joinquant_market_volatility_regime_rebuild',
                'note': '按沪深300 20日滚动年化波动率分层；收益来自 JoinQuant 真实 OHLCV 重建候选样本。',
            })
    return summaries


def run_regime():
    factor_table = build_historical_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    market_regimes = build_market_regimes()

    if candidates.empty:
        merged = candidates.copy()
    else:
        merged = candidates.merge(market_regimes, on='date', how='left')
        merged = merged.dropna(subset=['market_regime']).copy()

    summary = summarize_strategy_by_regime(merged)
    regime_counts = {}
    if not merged.empty:
        regime_count_rows = []
        for regime_id, part in merged.groupby('market_regime'):
            regime_count_rows.append({
                'market_regime': regime_id,
                'sample_dates': int(part['date'].nunique()),
                'sample_trades': int(part['code'].count()),
                'market_vol_mean': None if part['market_vol_20d'].dropna().empty else float(part['market_vol_20d'].mean()),
            })
        regime_counts = regime_count_rows

    preview_cols = ['date', 'code', 'strategy_score', 'market_regime_name', 'market_vol_20d'] + [c for c in FACTOR_IDS if c in merged.columns]
    preview = merged[preview_cols].head(50).copy() if not merged.empty else pd.DataFrame(columns=preview_cols)
    if 'date' in preview.columns:
        preview['date'] = preview['date'].dt.strftime('%Y-%m-%d')

    output = {
        'result_type': 'strategy_regime_backtest',
        'strategy_id': STRATEGY_ID,
        'strategy_name': STRATEGY_NAME,
        'source': 'joinquant_market_volatility_regime_rebuild',
        'data_policy': '真实 JoinQuant OHLCV 与沪深300指数行情计算；未生成任何虚构收益。',
        'config': {
            'strategy_index_code': INDEX_CODE,
            'regime_index_code': REGIME_INDEX_CODE,
            'price_start': PRICE_START,
            'factor_start': FACTOR_START,
            'end_limit': END_LIMIT,
            'horizons': HORIZONS,
            'factor_day_step': FACTOR_DAY_STEP,
            'top_n': TOP_N,
            'regime_window': REGIME_WINDOW,
            'regime_lookback': REGIME_LOOKBACK,
            'high_volatility_rule': 'market_vol_20d >= trailing 70% quantile',
            'low_volatility_rule': 'market_vol_20d <= trailing 30% quantile',
        },
        'sample': {
            'factor_rows': int(factor_table.shape[0]),
            'candidate_rows_before_regime': int(candidates.shape[0]) if candidates is not None else 0,
            'candidate_rows_after_regime': int(merged.shape[0]) if merged is not None else 0,
            'test_dates': int(factor_table['date'].nunique()),
            'selected_dates_after_regime': int(merged['date'].nunique()) if merged is not None and not merged.empty else 0,
        },
        'regime_counts': regime_counts,
        'summary': summary,
        'diagnostics_tail': diagnostics[-20:],
        'candidate_preview': preview.to_dict(orient='records'),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run_regime()
`;

  return baseScript.replace(/\nresult_json = run\(\)\s*$/, regimeExtension);
}

function buildJoinQuantStrategyMarketCapScript(strategyId) {
  const baseScript = buildJoinQuantStrategyHistoricalScript(strategyId);
  if (!baseScript) return null;

  const sizeExtension = `

# --- Market capitalization bucket extension ---
# 目的：在同一套策略候选样本上，按真实市值层拆分回测结果。
# 口径：每个测试日用 JoinQuant valuation.market_cap 获取沪深300成分股总市值；
#      按当日全截面市值分位划分大/中/小市值，避免使用未来信息。

MARKET_CAP_FIELD = 'valuation.market_cap'
LARGE_CAP_QUANTILE = 0.67
SMALL_CAP_QUANTILE = 0.33


def build_market_cap_buckets(factor_table):
    rows = []
    for day, frame in factor_table.groupby('date'):
        codes = sorted(frame['code'].dropna().unique().tolist())
        if len(codes) < MIN_CROSS_SECTION:
            continue

        fundamentals = get_fundamentals(
            query(valuation.code, valuation.market_cap).filter(valuation.code.in_(codes)),
            date=pd.Timestamp(day).strftime('%Y-%m-%d'),
        )
        if fundamentals is None or fundamentals.empty:
            continue

        cap = fundamentals[['code', 'market_cap']].dropna().copy()
        if len(cap) < MIN_CROSS_SECTION:
            continue

        cap['date'] = pd.Timestamp(day).normalize()
        cap['market_cap_rank_pct'] = cap['market_cap'].rank(pct=True, method='average')
        cap['market_cap_bucket'] = 'mid_cap'
        cap.loc[cap['market_cap_rank_pct'] >= LARGE_CAP_QUANTILE, 'market_cap_bucket'] = 'large_cap'
        cap.loc[cap['market_cap_rank_pct'] <= SMALL_CAP_QUANTILE, 'market_cap_bucket'] = 'small_cap'
        cap['market_cap_bucket_name'] = cap['market_cap_bucket'].map({
            'large_cap': '大市值',
            'mid_cap': '中市值',
            'small_cap': '小市值',
        })
        rows.append(cap[['date', 'code', 'market_cap', 'market_cap_rank_pct', 'market_cap_bucket', 'market_cap_bucket_name']])

    if not rows:
        raise ValueError('JoinQuant fundamentals 未返回足够市值数据，无法做市值分层。')
    return pd.concat(rows, ignore_index=True)


def summarize_strategy_by_market_cap(candidates):
    summaries = []
    if candidates.empty:
        return summaries

    bucket_order = [
        ('large_cap', '大市值'),
        ('mid_cap', '中市值'),
        ('small_cap', '小市值'),
    ]
    for bucket_id, bucket_name in bucket_order:
        bucket_candidates = candidates[candidates['market_cap_bucket'] == bucket_id].copy()
        if bucket_candidates.empty:
            continue

        for horizon in HORIZONS:
            col = 'future_return_%d' % horizon
            values = bucket_candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
            daily = bucket_candidates.groupby('date')[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
            summaries.append({
                'result_type': 'strategy_size_backtest',
                'strategy_id': STRATEGY_ID,
                'strategy_name': STRATEGY_NAME,
                'horizon': horizon,
                'market_cap_bucket': bucket_id,
                'market_cap_bucket_name': bucket_name,
                'sample_dates': int(daily.shape[0]),
                'sample_trades': int(values.shape[0]),
                'mean_return': None if values.empty else float(values.mean()),
                'median_return': None if values.empty else float(values.median()),
                'positive_ratio': None if values.empty else float((values > 0).mean()),
                'daily_mean_return': None if daily.empty else float(daily.mean()),
                'daily_positive_ratio': None if daily.empty else float((daily > 0).mean()),
                'best_daily_return': None if daily.empty else float(daily.max()),
                'worst_daily_return': None if daily.empty else float(daily.min()),
                'avg_candidates_per_date': None if daily.empty else float(values.shape[0] / daily.shape[0]),
                'market_cap_mean': None if bucket_candidates['market_cap'].dropna().empty else float(bucket_candidates['market_cap'].mean()),
                'source': 'joinquant_market_cap_bucket_rebuild',
                'note': '按 JoinQuant valuation.market_cap 当日截面分层；收益来自 JoinQuant 真实 OHLCV 重建候选样本。',
            })
    return summaries


def run_market_cap_bucket():
    factor_table = build_historical_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    market_caps = build_market_cap_buckets(factor_table)

    if candidates.empty:
        merged = candidates.copy()
    else:
        merged = candidates.merge(market_caps, on=['date', 'code'], how='left')
        merged = merged.dropna(subset=['market_cap_bucket']).copy()

    summary = summarize_strategy_by_market_cap(merged)
    bucket_counts = []
    if not merged.empty:
        for bucket_id, part in merged.groupby('market_cap_bucket'):
            bucket_counts.append({
                'market_cap_bucket': bucket_id,
                'sample_dates': int(part['date'].nunique()),
                'sample_trades': int(part['code'].count()),
                'market_cap_mean': None if part['market_cap'].dropna().empty else float(part['market_cap'].mean()),
            })

    preview_cols = ['date', 'code', 'strategy_score', 'market_cap_bucket_name', 'market_cap'] + [c for c in FACTOR_IDS if c in merged.columns]
    preview = merged[preview_cols].head(50).copy() if not merged.empty else pd.DataFrame(columns=preview_cols)
    if 'date' in preview.columns:
        preview['date'] = preview['date'].dt.strftime('%Y-%m-%d')

    output = {
        'result_type': 'strategy_size_backtest',
        'strategy_id': STRATEGY_ID,
        'strategy_name': STRATEGY_NAME,
        'source': 'joinquant_market_cap_bucket_rebuild',
        'data_policy': '真实 JoinQuant OHLCV 与 valuation.market_cap 计算；未生成任何虚构收益。',
        'config': {
            'strategy_index_code': INDEX_CODE,
            'price_start': PRICE_START,
            'factor_start': FACTOR_START,
            'end_limit': END_LIMIT,
            'horizons': HORIZONS,
            'factor_day_step': FACTOR_DAY_STEP,
            'top_n': TOP_N,
            'market_cap_field': MARKET_CAP_FIELD,
            'large_cap_rule': 'market_cap_rank_pct >= 0.67 within daily index universe',
            'small_cap_rule': 'market_cap_rank_pct <= 0.33 within daily index universe',
        },
        'sample': {
            'factor_rows': int(factor_table.shape[0]),
            'candidate_rows_before_size': int(candidates.shape[0]) if candidates is not None else 0,
            'candidate_rows_after_size': int(merged.shape[0]) if merged is not None else 0,
            'test_dates': int(factor_table['date'].nunique()),
            'selected_dates_after_size': int(merged['date'].nunique()) if merged is not None and not merged.empty else 0,
        },
        'market_cap_bucket_counts': bucket_counts,
        'summary': summary,
        'diagnostics_tail': diagnostics[-20:],
        'candidate_preview': preview.to_dict(orient='records'),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run_market_cap_bucket()
`;

  return baseScript.replace(/\nresult_json = run\(\)\s*$/, sizeExtension);
}

function buildJoinQuantStrategyVolatilitySizeScript(strategyId) {
  const baseScript = buildJoinQuantStrategyHistoricalScript(strategyId);
  if (!baseScript) return null;

  const crossExtension = `

# --- Market volatility x market capitalization extension ---
# 目的：在同一套策略候选样本上，交叉拆分“高/中/低波动 × 大/中/小市值”。
# 口径：
# - 市场波动：沪深300 20日滚动年化波动率，并用过去约1年滚动30/70分位划分高/中/低。
# - 市值层：每个测试日用 JoinQuant valuation.market_cap，按当日沪深300截面分位划分大/中/小。
# - 两者都只使用测试日当时可取得的数据，不使用未来收益参与分层。

REGIME_INDEX_CODE = '000300.XSHG'
REGIME_WINDOW = 20
REGIME_LOOKBACK = 252
REGIME_MIN_PERIODS = 60
MARKET_CAP_FIELD = 'valuation.market_cap'
LARGE_CAP_QUANTILE = 0.67
SMALL_CAP_QUANTILE = 0.33


def normalize_index_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if 'time' not in df.columns:
        df = df.reset_index()
        if 'index' in df.columns and 'time' not in df.columns:
            df = df.rename(columns={'index': 'time'})
    df['date'] = pd.to_datetime(df['time']).dt.normalize()
    return df[['date', 'close']].dropna().sort_values('date')


def build_market_regimes():
    index_price = get_price(
        REGIME_INDEX_CODE,
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency='daily',
        fields=['close'],
        panel=False,
        fq='pre',
    )
    index_price = normalize_index_price_frame(index_price)
    if index_price.empty:
        raise ValueError('市场指数 get_price 返回空数据，无法做波动率分层。')

    index_price['index_return'] = index_price['close'].pct_change()
    index_price['market_vol_20d'] = index_price['index_return'].rolling(REGIME_WINDOW, min_periods=REGIME_WINDOW).std() * math.sqrt(252)
    index_price['vol_p30'] = index_price['market_vol_20d'].rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS).quantile(0.30).shift(1)
    index_price['vol_p70'] = index_price['market_vol_20d'].rolling(REGIME_LOOKBACK, min_periods=REGIME_MIN_PERIODS).quantile(0.70).shift(1)

    valid = index_price.dropna(subset=['market_vol_20d', 'vol_p30', 'vol_p70']).copy()
    if valid.empty:
        raise ValueError('市场波动率有效样本不足，无法划分高/中/低波动。')

    valid['market_regime'] = 'medium_volatility'
    valid.loc[valid['market_vol_20d'] >= valid['vol_p70'], 'market_regime'] = 'high_volatility'
    valid.loc[valid['market_vol_20d'] <= valid['vol_p30'], 'market_regime'] = 'low_volatility'
    valid['market_regime_name'] = valid['market_regime'].map({
        'high_volatility': '高波动',
        'medium_volatility': '中波动',
        'low_volatility': '低波动',
    })
    return valid[['date', 'market_vol_20d', 'vol_p30', 'vol_p70', 'market_regime', 'market_regime_name']]


def build_market_cap_buckets(factor_table):
    rows = []
    for day, frame in factor_table.groupby('date'):
        codes = sorted(frame['code'].dropna().unique().tolist())
        if len(codes) < MIN_CROSS_SECTION:
            continue

        fundamentals = get_fundamentals(
            query(valuation.code, valuation.market_cap).filter(valuation.code.in_(codes)),
            date=pd.Timestamp(day).strftime('%Y-%m-%d'),
        )
        if fundamentals is None or fundamentals.empty:
            continue

        cap = fundamentals[['code', 'market_cap']].dropna().copy()
        if len(cap) < MIN_CROSS_SECTION:
            continue

        cap['date'] = pd.Timestamp(day).normalize()
        cap['market_cap_rank_pct'] = cap['market_cap'].rank(pct=True, method='average')
        cap['market_cap_bucket'] = 'mid_cap'
        cap.loc[cap['market_cap_rank_pct'] >= LARGE_CAP_QUANTILE, 'market_cap_bucket'] = 'large_cap'
        cap.loc[cap['market_cap_rank_pct'] <= SMALL_CAP_QUANTILE, 'market_cap_bucket'] = 'small_cap'
        cap['market_cap_bucket_name'] = cap['market_cap_bucket'].map({
            'large_cap': '大市值',
            'mid_cap': '中市值',
            'small_cap': '小市值',
        })
        rows.append(cap[['date', 'code', 'market_cap', 'market_cap_rank_pct', 'market_cap_bucket', 'market_cap_bucket_name']])

    if not rows:
        raise ValueError('JoinQuant fundamentals 未返回足够市值数据，无法做市值分层。')
    return pd.concat(rows, ignore_index=True)


def summarize_strategy_by_regime_and_market_cap(candidates):
    summaries = []
    if candidates.empty:
        return summaries

    regime_order = [
        ('high_volatility', '高波动'),
        ('medium_volatility', '中波动'),
        ('low_volatility', '低波动'),
    ]
    bucket_order = [
        ('large_cap', '大市值'),
        ('mid_cap', '中市值'),
        ('small_cap', '小市值'),
    ]
    for regime_id, regime_name in regime_order:
        regime_candidates = candidates[candidates['market_regime'] == regime_id].copy()
        if regime_candidates.empty:
            continue
        for bucket_id, bucket_name in bucket_order:
            bucket_candidates = regime_candidates[regime_candidates['market_cap_bucket'] == bucket_id].copy()
            if bucket_candidates.empty:
                continue
            for horizon in HORIZONS:
                col = 'future_return_%d' % horizon
                values = bucket_candidates[col].replace([np.inf, -np.inf], np.nan).dropna()
                daily = bucket_candidates.groupby('date')[col].mean().replace([np.inf, -np.inf], np.nan).dropna()
                summaries.append({
                    'result_type': 'strategy_regime_size_backtest',
                    'strategy_id': STRATEGY_ID,
                    'strategy_name': STRATEGY_NAME,
                    'horizon': horizon,
                    'market_regime': regime_id,
                    'market_regime_name': regime_name,
                    'market_cap_bucket': bucket_id,
                    'market_cap_bucket_name': bucket_name,
                    'sample_dates': int(daily.shape[0]),
                    'sample_trades': int(values.shape[0]),
                    'mean_return': None if values.empty else float(values.mean()),
                    'median_return': None if values.empty else float(values.median()),
                    'positive_ratio': None if values.empty else float((values > 0).mean()),
                    'daily_mean_return': None if daily.empty else float(daily.mean()),
                    'daily_positive_ratio': None if daily.empty else float((daily > 0).mean()),
                    'best_daily_return': None if daily.empty else float(daily.max()),
                    'worst_daily_return': None if daily.empty else float(daily.min()),
                    'avg_candidates_per_date': None if daily.empty else float(values.shape[0] / daily.shape[0]),
                    'market_vol_mean': None if bucket_candidates['market_vol_20d'].dropna().empty else float(bucket_candidates['market_vol_20d'].mean()),
                    'market_cap_mean': None if bucket_candidates['market_cap'].dropna().empty else float(bucket_candidates['market_cap'].mean()),
                    'source': 'joinquant_volatility_market_cap_cross_rebuild',
                    'note': '按沪深300波动率与 JoinQuant valuation.market_cap 交叉分层；收益来自 JoinQuant 真实 OHLCV 重建候选样本。',
                })
    return summaries


def run_regime_market_cap_cross():
    factor_table = build_historical_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    market_regimes = build_market_regimes()
    market_caps = build_market_cap_buckets(factor_table)

    if candidates.empty:
        merged = candidates.copy()
    else:
        merged = candidates.merge(market_regimes, on='date', how='left')
        merged = merged.merge(market_caps, on=['date', 'code'], how='left')
        merged = merged.dropna(subset=['market_regime', 'market_cap_bucket']).copy()

    summary = summarize_strategy_by_regime_and_market_cap(merged)
    cross_counts = []
    if not merged.empty:
        for (regime_id, bucket_id), part in merged.groupby(['market_regime', 'market_cap_bucket']):
            cross_counts.append({
                'market_regime': regime_id,
                'market_regime_name': str(part['market_regime_name'].dropna().iloc[0]) if not part['market_regime_name'].dropna().empty else regime_id,
                'market_cap_bucket': bucket_id,
                'market_cap_bucket_name': str(part['market_cap_bucket_name'].dropna().iloc[0]) if not part['market_cap_bucket_name'].dropna().empty else bucket_id,
                'sample_dates': int(part['date'].nunique()),
                'sample_trades': int(part['code'].count()),
                'market_vol_mean': None if part['market_vol_20d'].dropna().empty else float(part['market_vol_20d'].mean()),
                'market_cap_mean': None if part['market_cap'].dropna().empty else float(part['market_cap'].mean()),
            })

    preview_cols = [
        'date',
        'code',
        'strategy_score',
        'market_regime_name',
        'market_vol_20d',
        'market_cap_bucket_name',
        'market_cap',
    ] + [c for c in FACTOR_IDS if c in merged.columns]
    preview = merged[preview_cols].head(50).copy() if not merged.empty else pd.DataFrame(columns=preview_cols)
    if 'date' in preview.columns:
        preview['date'] = preview['date'].dt.strftime('%Y-%m-%d')

    output = {
        'result_type': 'strategy_regime_size_backtest',
        'strategy_id': STRATEGY_ID,
        'strategy_name': STRATEGY_NAME,
        'source': 'joinquant_volatility_market_cap_cross_rebuild',
        'data_policy': '真实 JoinQuant OHLCV、沪深300指数行情与 valuation.market_cap 计算；未生成任何虚构收益。',
        'config': {
            'strategy_index_code': INDEX_CODE,
            'regime_index_code': REGIME_INDEX_CODE,
            'price_start': PRICE_START,
            'factor_start': FACTOR_START,
            'end_limit': END_LIMIT,
            'horizons': HORIZONS,
            'factor_day_step': FACTOR_DAY_STEP,
            'top_n': TOP_N,
            'regime_window': REGIME_WINDOW,
            'regime_lookback': REGIME_LOOKBACK,
            'high_volatility_rule': 'market_vol_20d >= trailing 70% quantile',
            'low_volatility_rule': 'market_vol_20d <= trailing 30% quantile',
            'market_cap_field': MARKET_CAP_FIELD,
            'large_cap_rule': 'market_cap_rank_pct >= 0.67 within daily index universe',
            'small_cap_rule': 'market_cap_rank_pct <= 0.33 within daily index universe',
        },
        'sample': {
            'factor_rows': int(factor_table.shape[0]),
            'candidate_rows_before_cross': int(candidates.shape[0]) if candidates is not None else 0,
            'candidate_rows_after_cross': int(merged.shape[0]) if merged is not None else 0,
            'test_dates': int(factor_table['date'].nunique()),
            'selected_dates_after_cross': int(merged['date'].nunique()) if merged is not None and not merged.empty else 0,
        },
        'cross_counts': cross_counts,
        'summary': summary,
        'diagnostics_tail': diagnostics[-20:],
        'candidate_preview': preview.to_dict(orient='records'),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return output


result_json = run_regime_market_cap_cross()
`;

  return baseScript.replace(/\nresult_json = run\(\)\s*$/, crossExtension);
}

function appendJoinQuantTradingSimulation(baseScript, strategy, sourceTag) {
  const extension = `

# --- M-quant trading net-value simulation package ---
# 口径：复用上方同一套真实 JoinQuant 因子和候选池逻辑，按5个交易日等权调仓。
# 输出：事件回测 + 未分层交易净值 + 高/中/低波动 + 大/中/小市值 + 9个交叉层。

TRADING_REBALANCE_DAYS = 5
TRADING_COST_RATE = 0.0015
TRADING_SLIPPAGE_RATE = 0.0002
TRADING_TOP_N = TOP_N
TRADING_SOURCE = '${sourceTag}'


def mq_normalize_index_price_frame(price):
    if price is None or len(price) == 0:
        return pd.DataFrame()
    df = price.copy()
    if "time" not in df.columns:
        df = df.reset_index()
        if "index" in df.columns and "time" not in df.columns:
            df = df.rename(columns={"index": "time"})
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()
    return df[["date", "close"]].dropna().sort_values("date")


def mq_build_base_factor_table():
    try:
        built = build_factor_table()
    except NameError:
        built = build_historical_factor_table()
    if isinstance(built, tuple):
        return built[0], built[1] if len(built) > 1 and isinstance(built[1], dict) else {}
    return built, {}


def mq_build_market_regimes():
    index_price = get_price(
        "000300.XSHG",
        start_date=PRICE_START,
        end_date=END_LIMIT,
        frequency="daily",
        fields=["close"],
        panel=False,
        fq="pre",
    )
    index_price = mq_normalize_index_price_frame(index_price)
    if index_price.empty:
        return pd.DataFrame(columns=["date", "market_vol_20d", "market_regime", "market_regime_name"])
    index_price["index_return"] = index_price["close"].pct_change()
    index_price["market_vol_20d"] = index_price["index_return"].rolling(20, min_periods=20).std() * math.sqrt(252)
    index_price["vol_p30"] = index_price["market_vol_20d"].rolling(252, min_periods=60).quantile(0.30).shift(1)
    index_price["vol_p70"] = index_price["market_vol_20d"].rolling(252, min_periods=60).quantile(0.70).shift(1)
    valid = index_price.dropna(subset=["market_vol_20d", "vol_p30", "vol_p70"]).copy()
    valid["market_regime"] = "medium_volatility"
    valid.loc[valid["market_vol_20d"] >= valid["vol_p70"], "market_regime"] = "high_volatility"
    valid.loc[valid["market_vol_20d"] <= valid["vol_p30"], "market_regime"] = "low_volatility"
    valid["market_regime_name"] = valid["market_regime"].map({
        "high_volatility": "高波动",
        "medium_volatility": "中波动",
        "low_volatility": "低波动",
    })
    return valid[["date", "market_vol_20d", "market_regime", "market_regime_name"]]


def mq_build_market_cap_buckets(factor_table):
    rows = []
    for day, frame in factor_table.groupby("date"):
        codes = sorted(frame["code"].dropna().unique().tolist())
        if len(codes) < MIN_CROSS_SECTION:
            continue
        fundamentals = get_fundamentals(
            query(valuation.code, valuation.market_cap).filter(valuation.code.in_(codes)),
            date=pd.Timestamp(day).strftime("%Y-%m-%d"),
        )
        if fundamentals is None or fundamentals.empty:
            continue
        cap = fundamentals[["code", "market_cap"]].dropna().copy()
        if len(cap) < MIN_CROSS_SECTION:
            continue
        cap["date"] = pd.Timestamp(day).normalize()
        cap["market_cap_rank_pct"] = cap["market_cap"].rank(pct=True, method="average")
        cap["market_cap_bucket"] = "mid_cap"
        cap.loc[cap["market_cap_rank_pct"] >= 0.67, "market_cap_bucket"] = "large_cap"
        cap.loc[cap["market_cap_rank_pct"] <= 0.33, "market_cap_bucket"] = "small_cap"
        cap["market_cap_bucket_name"] = cap["market_cap_bucket"].map({
            "large_cap": "大市值",
            "mid_cap": "中市值",
            "small_cap": "小市值",
        })
        rows.append(cap[["date", "code", "market_cap", "market_cap_rank_pct", "market_cap_bucket", "market_cap_bucket_name"]])
    if not rows:
        return pd.DataFrame(columns=["date", "code", "market_cap", "market_cap_bucket", "market_cap_bucket_name"])
    return pd.concat(rows, ignore_index=True)


def mq_max_drawdown(values):
    if not values:
        return None
    peak = values[0]
    max_dd = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            max_dd = min(max_dd, value / peak - 1)
    return float(max_dd)


def mq_simulate_portfolio(candidates, label, layer_meta=None):
    layer_meta = layer_meta or {}
    if candidates is None or candidates.empty:
        return None
    if "future_return_5" not in candidates.columns:
        return None

    nav = 1.0
    previous_weights = {}
    period_returns = []
    gross_returns = []
    turnover_values = []
    curve = []
    sample_trades = 0

    for day, frame in candidates.sort_values(["date", "strategy_score"], ascending=[True, False]).groupby("date"):
        picked = frame.dropna(subset=["future_return_5"]).sort_values("strategy_score", ascending=False).head(TRADING_TOP_N).copy()
        if picked.empty:
            continue
        weight = 1.0 / float(len(picked))
        current_weights = dict((code, weight) for code in picked["code"].tolist())
        all_codes = set(previous_weights.keys()) | set(current_weights.keys())
        traded_notional = sum(abs(current_weights.get(code, 0.0) - previous_weights.get(code, 0.0)) for code in all_codes)
        gross_return = float((picked["future_return_5"] * weight).sum())
        cost = traded_notional * (TRADING_COST_RATE + TRADING_SLIPPAGE_RATE)
        net_return = gross_return - cost
        nav *= (1 + net_return)
        sample_trades += int(len(picked))
        period_returns.append(net_return)
        gross_returns.append(gross_return)
        turnover_values.append(traded_notional)
        curve.append({
            "date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "net_value": float(nav),
            "period_return": float(net_return),
            "gross_return": float(gross_return),
            "cost": float(cost),
            "turnover": float(traded_notional),
            "selected_count": int(len(picked)),
        })
        previous_weights = current_weights

    if not period_returns:
        return None

    periods = len(period_returns)
    annual_scale = 252.0 / float(TRADING_REBALANCE_DAYS)
    annual_return = float(nav ** (annual_scale / periods) - 1) if nav > 0 else None
    period_std = float(np.std(period_returns, ddof=1)) if periods > 1 else 0.0
    sharpe = None
    if period_std > 0:
        sharpe = float(np.mean(period_returns) / period_std * math.sqrt(annual_scale))

    record = {
        "result_type": "strategy_trading_backtest",
        "strategy_id": "${strategy.id}",
        "strategy_name": ${JSON.stringify(strategy.name)},
        "horizon": "5日调仓交易",
        "layer": label,
        "sample_dates": int(periods),
        "sample_trades": int(sample_trades),
        "trade_count": int(sample_trades),
        "strategy_return": float(nav - 1),
        "strategy_annual_return": annual_return,
        "annual_return": annual_return,
        "final_net_value": float(nav),
        "max_drawdown": mq_max_drawdown([item["net_value"] for item in curve]),
        "sharpe": sharpe,
        "daily_win_rate": float(np.mean([ret > 0 for ret in period_returns])),
        "period_mean_return": float(np.mean(period_returns)),
        "gross_mean_return": float(np.mean(gross_returns)),
        "avg_turnover": float(np.mean(turnover_values)),
        "total_turnover": float(np.sum(turnover_values)),
        "cost_rate": TRADING_COST_RATE,
        "slippage_rate": TRADING_SLIPPAGE_RATE,
        "date_range": "%s 至 %s" % (curve[0]["date"], curve[-1]["date"]),
        "source": TRADING_SOURCE,
        "data_policy": "真实 JoinQuant 数据生成候选池；5日等权调仓净值由真实未来5日收益扣交易成本和滑点计算；未生成任何虚构绩效。",
        "net_value_curve": curve[-80:],
    }
    record.update(layer_meta)
    return record


def mq_trading_records(factor_table, candidates):
    records = []
    base = mq_simulate_portfolio(candidates, "未分层")
    if base:
        records.append(base)

    regimes = mq_build_market_regimes()
    caps = mq_build_market_cap_buckets(factor_table)
    layered = candidates.copy()
    if not regimes.empty:
        layered = layered.merge(regimes, on="date", how="left")
    if not caps.empty:
        layered = layered.merge(caps, on=["date", "code"], how="left")

    regime_order = [
        ("high_volatility", "高波动"),
        ("medium_volatility", "中波动"),
        ("low_volatility", "低波动"),
    ]
    bucket_order = [
        ("large_cap", "大市值"),
        ("mid_cap", "中市值"),
        ("small_cap", "小市值"),
    ]

    if "market_regime" in layered.columns:
        for regime_id, regime_name in regime_order:
            part = layered[layered["market_regime"] == regime_id].copy()
            item = mq_simulate_portfolio(part, regime_name, {
                "market_regime": regime_id,
                "market_regime_name": regime_name,
                "market_vol_mean": None if part.empty or part["market_vol_20d"].dropna().empty else float(part["market_vol_20d"].mean()),
            })
            if item:
                records.append(item)

    if "market_cap_bucket" in layered.columns:
        for bucket_id, bucket_name in bucket_order:
            part = layered[layered["market_cap_bucket"] == bucket_id].copy()
            item = mq_simulate_portfolio(part, bucket_name, {
                "market_cap_bucket": bucket_id,
                "market_cap_bucket_name": bucket_name,
                "market_cap_mean": None if part.empty or part["market_cap"].dropna().empty else float(part["market_cap"].mean()),
            })
            if item:
                records.append(item)

    if "market_regime" in layered.columns and "market_cap_bucket" in layered.columns:
        for regime_id, regime_name in regime_order:
            for bucket_id, bucket_name in bucket_order:
                part = layered[(layered["market_regime"] == regime_id) & (layered["market_cap_bucket"] == bucket_id)].copy()
                item = mq_simulate_portfolio(part, "%s/%s" % (regime_name, bucket_name), {
                    "market_regime": regime_id,
                    "market_regime_name": regime_name,
                    "market_cap_bucket": bucket_id,
                    "market_cap_bucket_name": bucket_name,
                    "market_vol_mean": None if part.empty or part["market_vol_20d"].dropna().empty else float(part["market_vol_20d"].mean()),
                    "market_cap_mean": None if part.empty or part["market_cap"].dropna().empty else float(part["market_cap"].mean()),
                })
                if item:
                    records.append(item)

    return records


def run_m_quant_trading_package():
    factor_table, base_config = mq_build_base_factor_table()
    candidates, diagnostics = select_candidates(factor_table)
    event_summary = summarize_strategy(candidates)
    trading = mq_trading_records(factor_table, candidates)
    records = []
    records.extend(event_summary)
    records.extend(trading)
    output = {
        "result_type": "strategy_trading_package",
        "strategy_id": "${strategy.id}",
        "strategy_name": ${JSON.stringify(strategy.name)},
        "source": TRADING_SOURCE,
        "data_policy": "真实 JoinQuant 数据；同一候选池同时输出事件收益和5日调仓交易净值；含未分层、市值分层、波动分层、波动×市值交叉层。",
        "config": {
            "rebalance_days": TRADING_REBALANCE_DAYS,
            "top_n": TRADING_TOP_N,
            "cost_rate": TRADING_COST_RATE,
            "slippage_rate": TRADING_SLIPPAGE_RATE,
            "base_config": base_config,
        },
        "sample": {
            "factor_rows": int(factor_table.shape[0]),
            "candidate_rows": int(candidates.shape[0]) if candidates is not None else 0,
            "test_dates": int(factor_table["date"].nunique()),
            "selected_dates": int(candidates["date"].nunique()) if candidates is not None and not candidates.empty else 0,
            "records": int(len(records)),
        },
        "diagnostics_tail": diagnostics[-20:],
        "records": records,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return output


result_json = run_m_quant_trading_package()
`;

  const replaced = baseScript.replace(/\nresult_json = run\(\)\s*$/m, extension);
  return replaced === baseScript ? `${baseScript}\n${extension}` : replaced;
}

function buildJoinQuantTradingBacktestScript(strategyId) {
  const pack = buildJoinQuantStrategyPackage(strategyId);
  if (!pack) return null;
  const strategy = pack.route;

  const baseByStrategy = {
    capital_follow_v0: () => readFileSync(capitalFollowBacktestScriptPath, 'utf8'),
    jq_quality_profit_liquidity_v1: () => readFileSync(jqQualityProfitLiquidityBacktestScriptPath, 'utf8'),
    kline_assisted_confirmation: () => readFileSync(klineAssistedBacktestScriptPath, 'utf8'),
  };
  const baseScript = baseByStrategy[strategyId]
    ? baseByStrategy[strategyId]()
    : buildJoinQuantStrategyHistoricalScript(strategyId);
  if (!baseScript) return null;

  return appendJoinQuantTradingSimulation(
    baseScript,
    strategy,
    `joinquant_${safeFilename(strategyId)}_trading_simulation_v1`,
  );
}

function readImportedBacktestResults() {
  return readJsonFile(importedBacktestResultsPath, []);
}

function readAkshareLocalBacktestRecords() {
  const pack = readJsonFile(akshareOhlcvBacktestPath, null);
  if (!pack) return [];
  const meta = {
    importedAt: pack.generated_at,
    local_sample_policy: pack.data_policy,
    local_sample_stocks: pack.unique_stocks,
    local_sample_dates: pack.unique_dates,
    source: 'akshare_local_ohlcv_backtest',
  };
  const factorRecords = (pack.factor_results || []).map((result) => ({
    ...result,
    ...meta,
    source: result.source || meta.source,
  }));
  const strategyRecords = (pack.strategy_results || []).map((result) => ({
    ...result,
    ...meta,
    horizon: result.horizon || '5日调仓',
    sample_dates: result.sample_dates || result.sample_trades || 0,
    trade_count: result.trade_count || result.sample_trades || 0,
    source: result.source || meta.source,
  }));
  return [...factorRecords, ...strategyRecords];
}

function readBacktestResultsForDisplay() {
  return [
    ...readImportedBacktestResults(),
    ...readAkshareLocalBacktestRecords(),
  ];
}

function isStrategyBacktestRecord(result) {
  return result?.result_type === 'strategy_backtest'
    || result?.result_type === 'strategy_regime_backtest'
    || result?.result_type === 'strategy_size_backtest'
    || result?.result_type === 'strategy_regime_size_backtest'
    || result?.result_type === 'trading_backtest'
    || result?.result_type === 'local_strategy_backtest'
    || result?.result_type === 'strategy_trading_backtest'
    || Array.isArray(result?.summary) && result.summary.some((item) => item?.result_type === 'strategy_backtest'
      || item?.result_type === 'strategy_regime_backtest'
      || item?.result_type === 'strategy_size_backtest'
      || item?.result_type === 'strategy_regime_size_backtest');
}

function readImportedFactorResults() {
  return readImportedBacktestResults().filter((result) => !isStrategyBacktestRecord(result));
}

function readImportedStrategyResults() {
  return readImportedBacktestResults().filter(isStrategyBacktestRecord);
}

function readStrictFactorAudit() {
  return readJsonFile(strictFactorAuditPath, null);
}

function flattenStrategyResultRecords(results = readImportedStrategyResults()) {
  return results.flatMap((result) => {
    if (Array.isArray(result?.summary)) {
      return result.summary
        .filter((item) => item?.result_type === 'strategy_backtest'
          || item?.result_type === 'strategy_regime_backtest'
          || item?.result_type === 'strategy_size_backtest'
          || item?.result_type === 'strategy_regime_size_backtest')
        .map((item) => ({
          ...item,
          importedAt: result.importedAt,
          packetCrossCounts: result.cross_counts,
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

    return [result];
  });
}

function strategyResultId(result) {
  return result.strategy_id || result.strategyId || result.name || 'unknown_strategy';
}

function strategyPrimaryScore(result) {
  const meanReturn = Number(result.daily_mean_return ?? result.mean_return);
  const positiveRatio = Number(result.daily_positive_ratio ?? result.positive_ratio);
  const sampleDates = toNumber(result.sample_dates, 0);
  return (
    (sampleDates >= 20 ? 100 : 0)
    + (Number.isFinite(meanReturn) ? meanReturn * 100 : -100)
    + (Number.isFinite(positiveRatio) ? positiveRatio : 0)
    + Math.min(sampleDates, 240) / 240
  );
}

function summarizeStrategyResultsById() {
  return flattenStrategyResultRecords().reduce((groups, result) => {
    const strategyId = strategyResultId(result);
    const current = groups[strategyId] || {
      all: [],
      bestPrimary: null,
      historicalCount: 0,
      strategyId,
    };
    const sampleDates = toNumber(result.sample_dates, 0);
    current.all.push(result);
    if (sampleDates >= 20) current.historicalCount += 1;
    if (!current.bestPrimary || strategyPrimaryScore(result) > strategyPrimaryScore(current.bestPrimary)) {
      current.bestPrimary = result;
    }
    groups[strategyId] = current;
    return groups;
  }, {});
}

function buildStrategyValidation(stats, label = '策略') {
  const primaryResults = (stats?.all || [])
    .filter((result) => result.result_type === 'strategy_backtest')
    .filter((result) => primaryStrategyHorizons.includes(toNumber(result.horizon, 0)));
  const bestResult = primaryResults
    .sort((left, right) => strategyPrimaryScore(right) - strategyPrimaryScore(left))[0] || null;
  const meanReturn = Number(bestResult?.daily_mean_return ?? bestResult?.mean_return);
  const positiveRatio = Number(bestResult?.daily_positive_ratio ?? bestResult?.positive_ratio);
  const sampleDates = toNumber(bestResult?.sample_dates, 0);
  const validated = sampleDates >= 20
    && Number.isFinite(meanReturn)
    && meanReturn > 0
    && Number.isFinite(positiveRatio)
    && positiveRatio >= 0.5;
  const evidence = bestResult
    ? `已导入 ${stats.all.length} 条真实${label}结果；当前最佳 ${bestResult.horizon}日，平均收益 ${(meanReturn * 100).toFixed(2)}%，日胜率 ${(positiveRatio * 100).toFixed(2)}%，样本 ${sampleDates} 日。`
    : `尚未导入${label}级真实回测结果。`;

  return {
    bestResult,
    evidence,
    meanReturn,
    positiveRatio,
    sampleDates,
    validated,
  };
}

function buildLayeredStrategyValidation(stats, label = '策略') {
  const layeredResults = (stats?.all || [])
    .filter((result) => result.result_type === 'strategy_regime_size_backtest'
      || (result.result_type === 'strategy_trading_backtest' && result.market_regime && result.market_cap_bucket))
    .filter((result) => primaryStrategyHorizons.includes(toNumber(result.horizon, 0)));
  const tradingLayeredResults = (stats?.all || [])
    .filter((result) => result.result_type === 'strategy_trading_backtest' && result.market_regime && result.market_cap_bucket);
  const layerKeys = new Set(layeredResults
    .filter((result) => result.market_regime && result.market_cap_bucket)
    .map((result) => `${result.market_regime}|${result.market_cap_bucket}`));
  tradingLayeredResults
    .filter((result) => result.market_regime && result.market_cap_bucket)
    .forEach((result) => layerKeys.add(`${result.market_regime}|${result.market_cap_bucket}`));
  const horizons = new Set(layeredResults.map((result) => toNumber(result.horizon, 0)));
  const bestResult = layeredResults
    .sort((left, right) => strategyPrimaryScore(right) - strategyPrimaryScore(left))[0] || null;
  const validated = layerKeys.size >= 9
    && (primaryStrategyHorizons.every((horizon) => horizons.has(horizon)) || tradingLayeredResults.length >= 9);
  const evidence = validated
    ? `已完成 ${layerKeys.size} 个高/中/低波动 × 大/中/小市值交叉层，覆盖 ${Array.from(horizons).sort((a, b) => a - b).join('/') || '交易净值'} 日周期。`
    : `尚未完成${label}的高/中/低波动 × 大/中/小市值交叉分层。`;

  return {
    bestResult,
    evidence,
    layerCount: layerKeys.size,
    layeredResults,
    validated,
  };
}

function buildTradingStrategyValidation(stats, label = '策略') {
  const tradingResult = (stats?.all || []).find((result) => (
    result.result_type === 'strategy_trading_backtest'
    && !result.market_regime
    && !result.market_cap_bucket
  )) || null;
  const strategyReturn = Number(tradingResult?.strategy_return);
  const annualReturn = Number(tradingResult?.strategy_annual_return ?? tradingResult?.annual_return);
  const maxDrawdown = Number(tradingResult?.max_drawdown);
  const validated = Boolean(tradingResult)
    && Number.isFinite(strategyReturn)
    && strategyReturn > 0
    && Number.isFinite(annualReturn)
    && annualReturn > 0
    && Number.isFinite(maxDrawdown)
    && maxDrawdown > -0.25;
  const evidence = tradingResult
    ? `交易净值：总收益 ${(strategyReturn * 100).toFixed(2)}%，年化 ${(annualReturn * 100).toFixed(2)}%，最大回撤 ${(maxDrawdown * 100).toFixed(2)}%，Sharpe ${Number.isFinite(Number(tradingResult.sharpe)) ? Number(tradingResult.sharpe).toFixed(2) : '-'}。`
    : `尚未完成${label}未分层交易净值回测。`;
  return {
    evidence,
    maxDrawdown,
    strategyReturn,
    tradingResult,
    validated,
  };
}

function readPrimaryFactorRows() {
  return readFirstJsonFile([researchFactorResultsPath, realFactorResultsPath], []);
}

function readCapitalFactorRows() {
  return readJsonFile(capitalFactorResultsPath, []);
}

function deriveSentimentOverheatFactor(row) {
  const parts = [
    ['price_heat_risk', 0.35],
    ['crowding_risk', 0.30],
    ['transaction_crowding_risk', 0.20],
    ['volume_blowoff_risk', 0.15],
  ];
  const usable = parts
    .map(([field, weight]) => {
      const value = toNumber(row[field], null);
      return Number.isFinite(value) ? { value, weight } : null;
    })
    .filter(Boolean);

  if (usable.length < 3) return null;

  const weightSum = usable.reduce((sum, item) => sum + item.weight, 0);
  const score = usable.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum;
  return Number(score.toFixed(6));
}

function enrichDerivedBacktestFactors(row) {
  const sentimentOverheat = row.sentiment_overheat_factor ?? deriveSentimentOverheatFactor(row);
  return {
    ...row,
    sentiment_overheat_factor: sentimentOverheat,
  };
}

function readBacktestFactorRows() {
  return [
    ...readPrimaryFactorRows(),
    ...readCapitalFactorRows(),
  ].map(enrichDerivedBacktestFactors);
}

function readCombinedFactorSummary() {
  const primary = readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {});
  const capital = readJsonFile(capitalFactorSummaryPath, {});
  const primaryMeta = primary.factor_meta || {};
  const capitalMeta = capital.factor_meta || {};
  const primaryAvailability = primaryMeta.availability || {};
  const capitalAvailability = capitalMeta.availability || {};

  if (!Object.keys(capital).length) return primary;

  return {
    ...primary,
    additional_sources: [
      ...(primary.additional_sources || []),
      {
        file: capitalFactorSummaryPath,
        input_kind: capital.input_kind,
        rows: capital.rows || 0,
        stock_dates: capital.stock_dates || [],
        unique_stocks: capital.unique_stocks || 0,
      },
    ],
    factor_meta: {
      ...primaryMeta,
      availability: {
        ...primaryAvailability,
        ...capitalAvailability,
      },
      capital_factor_meta: capitalMeta,
      capital_market_regimes: capital.market_regimes || [],
      rows: (primaryMeta.rows || 0) + (capital.rows || 0),
    },
    input_kind: [primary.input_kind, capital.input_kind].filter(Boolean).join(' + '),
  };
}

function buildBacktestResearchStatus() {
  const rows = readBacktestFactorRows();
  const summary = readCombinedFactorSummary();
  const uniqueDates = new Set(rows.map((row) => dateOnly(row.date || row.stock_date)).filter(Boolean));
  const uniqueStocks = new Set(rows.map((row) => row.stock_code || row.code).filter(Boolean));
  const exportRows = buildJoinQuantFactorRows();
  const importedResults = readBacktestResultsForDisplay();
  const importedFactorResults = readImportedFactorResults();
  const importedStrategyResults = readImportedStrategyResults();
  const localAkshareResults = readAkshareLocalBacktestRecords();
  const localAkshareFactorResults = localAkshareResults.filter((result) => !isStrategyBacktestRecord(result));
  const localAkshareStrategyResults = localAkshareResults.filter(isStrategyBacktestRecord);

  const canRunLocalValidatedBacktest = uniqueDates.size >= 60;

  return {
    generatedAt: new Date().toISOString(),
    dataPolicy: '复测中心只展示真实数据状态、导出包、外部实跑结果和本地真实OHLCV回测；没有未来收益时不生成IC、胜率、年化收益。',
    source: {
      file: summary.source_file || researchFactorResultsPath,
      inputKind: summary.input_kind || 'unknown',
      rows: rows.length,
      uniqueDates: uniqueDates.size,
      uniqueStocks: uniqueStocks.size,
    },
    metrics: {
      exportableRows: exportRows.length,
      exportableFactors: exportableBacktestFactors.length,
      importedResultCount: importedResults.length,
      importedFactorResultCount: importedFactorResults.length + localAkshareFactorResults.length,
      importedStrategyResultCount: importedStrategyResults.length + localAkshareStrategyResults.length,
      localAkshareFactorResultCount: localAkshareFactorResults.length,
      localAkshareStrategyResultCount: localAkshareStrategyResults.length,
      localStatus: canRunLocalValidatedBacktest ? 'ready_for_local_factor_test' : 'blocked',
      externalStatus: 'joinquant_ready',
      requiredTradingDays: 60,
      preferredTradingDays: 240,
    },
    blockers: [
      {
        id: 'future_returns',
        status: rows.length > 0 ? 'requires_joinquant_or_history' : 'missing',
        title: '缺少未来收益标签',
        detail: '当前只有 2026-07-06 一个截面，不能在本地计算 IC、RankIC、分组收益或胜率。',
      },
      {
        id: 'history_depth',
        status: uniqueDates.size >= 60 ? 'ready' : 'blocked',
        title: '历史截面不足',
        detail: `当前只有 ${uniqueDates.size} 个交易日；最低建议 60 日，专业验证建议 120-240 日。`,
      },
      {
        id: 'trade_calendar_adjustments',
        status: 'handled_by_joinquant',
        title: '交易日历/停牌/涨跌停处理',
        detail: '短期建议由 JoinQuant 处理复权行情、停牌、涨跌停、手续费滑点和基准收益。',
      },
    ],
    factors: exportableBacktestFactors.map((factor) => ({
      ...factor,
      status: rows.some((row) => row[factor.id] !== null && row[factor.id] !== undefined) ? 'exportable' : 'missing_field',
      blocker: canRunLocalValidatedBacktest ? '本地可验证' : '需在 JoinQuant 匹配未来收益后验证',
      csvEndpoint: `/backtest-api/joinquant-factor-export.csv?factor=${factor.id}`,
      exportRows: buildJoinQuantFactorRows({ factor: factor.id }).length,
    })),
    joinquant: {
      csvEndpoint: '/backtest-api/joinquant-factor-export.csv',
      rowFormat: 'long',
      columns: [
        'date',
        'security',
        'factor_name',
        'factor_value',
        'factor_version',
      ],
      steps: [
        '在本平台下载因子CSV。',
        '上传到 JoinQuant 研究环境。',
        '读取CSV并按 date/security/factor_name 合并行情。',
        '计算未来 1/5/10/20 日收益。',
        '按交易日计算 IC、RankIC、分组收益和多空组合。',
        '把实跑结果 JSON 回填到本平台复测中心。',
      ],
    },
    importedResults,
  };
}

const researchFactorAliases = {
  chip_health_factor: 'chip_health',
  kdj_momentum_factor: 'kdj_momentum',
  macd_acceleration_factor: 'macd_acceleration',
  technical_composite_factor: 'technical_composite',
  trend_alignment_factor: 'trend_alignment',
  volume_trend_confirm_factor: 'volume_price_confirmation',
};

function canonicalFactorId(id) {
  return researchFactorAliases[id] || id;
}

function researchFactorDisplayName(id) {
  const exportable = exportableBacktestFactors.find((factor) => factor.id === id);
  if (exportable) return exportable.name;
  const definition = indicatorFactorDefinitions.find((factor) => canonicalFactorId(factor.id) === id);
  return definition?.name || id;
}

function factorResultId(result) {
  return result.factor_name || result.factor || result.name || 'unknown';
}

function summarizeImportedResults(results) {
  return results.reduce((groups, result) => {
    const factorId = factorResultId(result);
    const current = groups[factorId] || {
      all: [],
      bestLongShort: null,
      bestPrimaryHorizon: null,
      bestRankIc: null,
      factorId,
      historicalCount: 0,
      singleDayCount: 0,
    };
    const sampleDates = toNumber(result.sample_dates, 0);
    const rankIc = Number(result.rank_ic_mean ?? result.rankIc);
    const longShort = Number(result.long_short_mean ?? result.longShort);
    const currentBestRankIc = Number(current.bestRankIc?.rank_ic_mean ?? current.bestRankIc?.rankIc);
    const currentBestLongShort = Number(current.bestLongShort?.long_short_mean ?? current.bestLongShort?.longShort);

    current.all.push(result);
    if (sampleDates >= 20) current.historicalCount += 1;
    if (sampleDates < 20) current.singleDayCount += 1;
    if (Number.isFinite(rankIc) && (!current.bestRankIc || !Number.isFinite(currentBestRankIc) || rankIc > currentBestRankIc)) {
      current.bestRankIc = result;
    }
    if (Number.isFinite(longShort) && (!current.bestLongShort || !Number.isFinite(currentBestLongShort) || longShort > currentBestLongShort)) {
      current.bestLongShort = result;
    }
    current.bestPrimaryHorizon = chooseBestPrimaryHorizon(current.all);
    groups[factorId] = current;
    return groups;
  }, {});
}

function resultRankIc(result) {
  return Number(result?.rank_ic_mean ?? result?.rankIc);
}

function resultRankIcT(result) {
  return Number(result?.rank_ic_t ?? result?.rankIcT);
}

function resultLongShort(result) {
  return Number(result?.long_short_mean ?? result?.longShort);
}

function resultPositiveRatio(result) {
  return Number(result?.long_short_positive_ratio ?? result?.positiveRatio);
}

function resultSampleDates(result) {
  return toNumber(result?.sample_dates ?? result?.sampleDates, 0);
}

function isPrimaryHorizonResult(result) {
  return primaryStrategyHorizons.includes(toNumber(result?.horizon, 0)) && resultSampleDates(result) >= 20;
}

function primaryHorizonScore(result) {
  const rankIc = resultRankIc(result);
  const rankIcT = resultRankIcT(result);
  const longShort = resultLongShort(result);
  const positiveRatio = resultPositiveRatio(result);
  const hasPositiveDirection = rankIc > 0 && longShort > 0;
  const passes = hasPositiveDirection && rankIc >= 0.015 && Number.isFinite(rankIcT) && rankIcT >= 2;
  return (
    (passes ? 100 : 0)
    + (hasPositiveDirection ? 20 : 0)
    + (Number.isFinite(rankIcT) ? Math.max(-5, Math.min(5, rankIcT)) : 0)
    + (Number.isFinite(rankIc) ? rankIc * 100 : 0)
    + (Number.isFinite(longShort) ? longShort * 20 : 0)
    + (Number.isFinite(positiveRatio) ? positiveRatio : 0)
  );
}

function chooseBestPrimaryHorizon(results) {
  const candidates = results.filter(isPrimaryHorizonResult);
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => primaryHorizonScore(right) - primaryHorizonScore(left))[0];
}

function qualityFromResultStats(stats) {
  if (!stats || !stats.all.length) {
    return {
      decision: '等待实测',
      decisionTone: 'watch',
      evidence: '尚未导入该因子的 JoinQuant 实跑结果。',
      stage: '可研究',
      status: 'waiting_test',
    };
  }

  if (!stats.historicalCount) {
    return {
      decision: '跟踪中',
      decisionTone: 'pending',
      evidence: `${stats.all.length} 条结果均为单日或短样本，不能下长期结论。`,
      stage: '已回填短样本',
      status: 'tracking',
    };
  }

  const best = stats.bestPrimaryHorizon || {};
  const rankIc = Number(best.rank_ic_mean ?? best.rankIc);
  const rankIcT = Number(best.rank_ic_t ?? best.rankIcT);
  const longShort = Number(best.long_short_mean ?? best.longShort);

  if (!best || !Object.keys(best).length) {
    return {
      decision: '跟踪中',
      decisionTone: 'pending',
      evidence: '已有结果但缺少 5/10/20 日历史样本，1日结果只作参考。',
      stage: '已回填短样本',
      status: 'tracking',
    };
  }

  if (rankIc >= 0.015 && longShort > 0 && Number.isFinite(rankIcT) && rankIcT >= 2) {
    return {
      decision: '重点候选',
      decisionTone: 'good',
      evidence: `${best.horizon}日为当前最佳周期，RankIC ${rankIc.toFixed(4)}，RankIC t ${rankIcT.toFixed(2)}，多空收益 ${(longShort * 100).toFixed(2)}%。`,
      stage: '已实测',
      status: 'strategy_candidate',
    };
  }

  if (rankIc > 0 && longShort > 0) {
    return {
      decision: '继续观察',
      decisionTone: 'pending',
      evidence: `${best.horizon}日为当前最佳周期，方向为正但显著性或强度还需要确认。RankIC ${rankIc.toFixed(4)}，RankIC t ${Number.isFinite(rankIcT) ? rankIcT.toFixed(2) : '缺失'}。`,
      stage: '已实测',
      status: 'watch',
    };
  }

  return {
    decision: '暂缓使用',
    decisionTone: 'watch',
    evidence: '当前历史结果未同时满足 RankIC 为正和多空收益为正。',
    stage: '已实测',
    status: 'hold',
  };
}

function actionFromResearchEntry(entry, source) {
  if (entry.status === 'strategy_candidate') {
    return '进入策略池候选，优先做组合回测和样本外监控。';
  }
  if (entry.status === 'watch') {
    return '继续扩大样本，观察 RankIC t、分年度稳定性和多空收益是否同步改善。';
  }
  if (entry.status === 'tracking') {
    return '先不要下结论，补足至少 20 个历史截面；专业验证建议 120-240 个交易日。';
  }
  if (entry.exportRows > 0) {
    return '下载单因子 CSV 到 JoinQuant 做 1/5/10/20 日收益检验。';
  }
  if (source.uniqueDates < 60) {
    return '补充多日因子历史和未来收益标签，当前本地不能计算 IC。';
  }
  return '补齐 requiredFields 对应真实字段后再计算。';
}

function factorBacktestProfile(factorId, role = 'signal') {
  const importedResults = readImportedFactorResults().filter((result) => factorResultId(result) === factorId);
  const primaryResults = importedResults.filter(isPrimaryHorizonResult);
  const referenceResults = importedResults.filter((result) => toNumber(result.horizon, 0) === 1);
  const bestPrimary = chooseBestPrimaryHorizon(importedResults);
  const rankIc = resultRankIc(bestPrimary);
  const rankIcT = resultRankIcT(bestPrimary);
  const longShort = resultLongShort(bestPrimary);
  const positiveRatio = resultPositiveRatio(bestPrimary);
  const status = !importedResults.length
    ? 'waiting_test'
    : !bestPrimary
      ? 'tracking'
      : rankIc >= 0.015 && longShort > 0 && Number.isFinite(rankIcT) && rankIcT >= 2
        ? 'strategy_candidate'
        : rankIc > 0 && longShort > 0
          ? 'watch'
          : 'hold';

  return {
    bestHorizon: bestPrimary?.horizon ?? null,
    bestLongShort: Number.isFinite(longShort) ? longShort : null,
    bestPositiveRatio: Number.isFinite(positiveRatio) ? positiveRatio : null,
    bestRankIc: Number.isFinite(rankIc) ? rankIc : null,
    bestRankIcT: Number.isFinite(rankIcT) ? rankIcT : null,
    bestSampleDates: bestPrimary ? resultSampleDates(bestPrimary) : 0,
    detail: importedResults
      .filter((result) => [1, 5, 10, 20].includes(toNumber(result.horizon, 0)))
      .sort((left, right) => toNumber(left.horizon, 0) - toNumber(right.horizon, 0))
      .map((result) => ({
        horizon: toNumber(result.horizon, 0),
        isReferenceOnly: toNumber(result.horizon, 0) === 1,
        longShort: Number.isFinite(resultLongShort(result)) ? resultLongShort(result) : null,
        positiveRatio: Number.isFinite(resultPositiveRatio(result)) ? resultPositiveRatio(result) : null,
        rankIc: Number.isFinite(resultRankIc(result)) ? resultRankIc(result) : null,
        rankIcT: Number.isFinite(resultRankIcT(result)) ? resultRankIcT(result) : null,
        sampleDates: resultSampleDates(result),
        source: result.source || '',
      })),
    evidence: bestPrimary
      ? `${bestPrimary.horizon}日为 5/10/20 中当前最佳周期；1日仅作参考。`
      : importedResults.length
        ? '已有回测结果，但缺少可用于正式路线的 5/10/20 日历史样本。'
        : '尚未导入该因子的真实回测结果。',
    factorId,
    name: researchFactorDisplayName(factorId),
    primaryHorizonCount: primaryResults.length,
    referenceHorizonCount: referenceResults.length,
    role,
    status,
  };
}

function strategyFactor(factorId, role, weight = null) {
  const profile = factorBacktestProfile(factorId, role);
  return {
    ...profile,
    label: profile.bestHorizon ? `${profile.name} / ${profile.bestHorizon}日` : `${profile.name} / 待测`,
    weight,
  };
}

function buildResearchPipeline() {
  const backtestStatus = buildBacktestResearchStatus();
  const rows = readBacktestFactorRows();
  const summary = readCombinedFactorSummary();
  const availability = summary.factor_meta?.availability || {};
  const importedResults = readImportedFactorResults();
  const resultStats = summarizeImportedResults(importedResults);
  const definitionByCanonicalId = indicatorFactorDefinitions.reduce((map, definition) => {
    map[canonicalFactorId(definition.id)] = definition;
    return map;
  }, {});
  const candidateIds = [
    ...new Set([
      ...exportableBacktestFactors.map((factor) => factor.id),
      ...indicatorFactorDefinitions.map((factor) => canonicalFactorId(factor.id)),
      ...Object.keys(availability).map(canonicalFactorId),
      ...Object.keys(resultStats),
    ]),
  ];

  const source = {
    file: summary.source_file || researchFactorResultsPath,
    inputKind: summary.input_kind || 'unknown',
    rows: rows.length,
    uniqueDates: backtestStatus.source.uniqueDates,
    uniqueStocks: backtestStatus.source.uniqueStocks,
  };

  const entries = candidateIds.map((factorId) => {
    const exportable = exportableBacktestFactors.find((factor) => factor.id === factorId);
    const definition = definitionByCanonicalId[factorId] || {};
    const availabilityState = availability[factorId] || availability[definition.id] || null;
    const stats = resultStats[factorId];
    const quality = qualityFromResultStats(stats);
    const exportRows = exportable ? buildJoinQuantFactorRows({ factor: factorId }).length : 0;
    const hasComputedRows = rows.some((row) => row[factorId] !== null && row[factorId] !== undefined);
    const status = stats?.all.length
      ? quality.status
      : hasComputedRows || exportRows
        ? 'waiting_test'
        : availabilityState?.status || 'requires_more_data';
    const statusQuality = stats?.all.length ? quality : qualityFromResultStats(null);
    const dataGaps = [];

    if (!hasComputedRows && !exportRows) dataGaps.push('当前真实结果中没有该因子值。');
    if (source.uniqueDates < 60) dataGaps.push(`历史截面不足：当前 ${source.uniqueDates} 日，最低建议 60 日。`);
    if (!stats?.historicalCount) dataGaps.push('缺少足够历史实测结果，不能确认稳定性。');
    if (!definition.requiredFields && !exportable) dataGaps.push('缺少明确字段定义。');

    const entry = {
      category: definition.category || availabilityState?.category || exportable?.category || 'research',
      dataDependencies: definition.requiredFields || availabilityState?.fields || [],
      dataGaps,
      dataSource: definition.dataSource || 'M-quant real factor/backtest records',
      decision: statusQuality.decision,
      decisionTone: statusQuality.decisionTone,
      direction: exportable?.direction || definition.direction || availabilityState?.direction || 'positive',
      evidence: statusQuality.evidence,
      exportRows,
      factorId,
      formula: definition.formula || availabilityState?.formula || exportable?.usage || '-',
      name: exportable?.name || definition.name || availabilityState?.displayName || researchFactorDisplayName(factorId),
      nextAction: '',
      realStatus: availabilityState?.status || (hasComputedRows ? 'computed' : 'unavailable'),
      resultCount: stats?.all.length || 0,
      stage: statusQuality.stage,
      status,
      test: {
        bestHorizon: stats?.bestPrimaryHorizon?.horizon ?? null,
        bestLongShort: stats?.bestPrimaryHorizon?.long_short_mean ?? stats?.bestPrimaryHorizon?.longShort ?? null,
        bestRankIc: stats?.bestPrimaryHorizon?.rank_ic_mean ?? stats?.bestPrimaryHorizon?.rankIc ?? null,
        bestRankIcT: stats?.bestPrimaryHorizon?.rank_ic_t ?? stats?.bestPrimaryHorizon?.rankIcT ?? null,
        historicalCount: stats?.historicalCount || 0,
        singleDayCount: stats?.singleDayCount || 0,
      },
      usage: definition.usage || exportable?.usage || availabilityState?.usage || '',
    };
    entry.nextAction = actionFromResearchEntry(entry, source);
    return entry;
  }).sort((left, right) => {
    const order = {
      strategy_candidate: 0,
      watch: 1,
      tracking: 2,
      waiting_test: 3,
      computed: 4,
      requires_more_data: 5,
      unavailable: 6,
      hold: 7,
    };
    const leftOrder = order[left.status] ?? 9;
    const rightOrder = order[right.status] ?? 9;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.name.localeCompare(right.name, 'zh-CN');
  });

  const metrics = {
    blockedCount: entries.filter((entry) => entry.status === 'requires_more_data' || entry.status === 'unavailable').length,
    factorCount: entries.length,
    strategyCandidateCount: entries.filter((entry) => entry.status === 'strategy_candidate').length,
    testedCount: entries.filter((entry) => entry.resultCount > 0).length,
    waitingTestCount: entries.filter((entry) => entry.status === 'waiting_test' || entry.status === 'tracking').length,
  };

  return {
    assistant: {
      llmStatus: process.env.M_QUANT_LLM_PROVIDER ? 'configured' : 'not_configured',
      mode: process.env.M_QUANT_LLM_PROVIDER ? 'llm_ready' : 'local_grounded_assistant',
      policy: '助手只允许基于项目真实数据、真实回填结果和明确缺口输出建议；未接入模型时使用本地规则解释。',
    },
    blockers: backtestStatus.blockers,
    entries,
    generatedAt: new Date().toISOString(),
    metrics,
    source,
  };
}

function buildAssistantResponse(message, factorId) {
  const pipeline = buildResearchPipeline();
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const selected = factorId
    ? pipeline.entries.find((entry) => entry.factorId === factorId)
    : pipeline.entries.find((entry) => text.includes(entry.name) || lower.includes(entry.factorId.toLowerCase()));
  const candidateEntries = pipeline.entries.filter((entry) => entry.status === 'strategy_candidate');
  const testedEntries = pipeline.entries.filter((entry) => entry.resultCount > 0);
  const waitingEntries = pipeline.entries.filter((entry) => entry.status === 'waiting_test' || entry.status === 'tracking');
  const blockedEntries = pipeline.entries.filter((entry) => entry.status === 'requires_more_data' || entry.status === 'unavailable');

  const bullets = [];
  if (selected) {
    bullets.push(`${selected.name}：${selected.decision}。${selected.evidence}`);
    bullets.push(`当前阶段：${selected.stage}；真实结果 ${selected.resultCount} 条，历史结果 ${selected.test.historicalCount} 条。`);
    if (selected.test.bestRankIc !== null) bullets.push(`最佳 RankIC：${Number(selected.test.bestRankIc).toFixed(4)}；RankIC t：${selected.test.bestRankIcT === null ? '缺失' : Number(selected.test.bestRankIcT).toFixed(2)}。`);
    if (selected.dataGaps.length) bullets.push(`数据缺口：${selected.dataGaps.join('；')}`);
    bullets.push(`下一步：${selected.nextAction}`);
  } else if (lower.includes('缺') || text.includes('数据') || text.includes('采集')) {
    bullets.push(`当前最大缺口是历史深度：${pipeline.source.uniqueDates} 个交易日，项目内本地复测最低建议 60 日，专业验证建议 120-240 日。`);
    bullets.push('还需要未来收益标签、交易日历、停牌/涨跌停和复权行情，才能在项目内完整计算 RankIC、分组收益和多空收益。');
    bullets.push(`等待字段或历史补齐的因子有 ${blockedEntries.length} 个。`);
  } else if (text.includes('哪个') || text.includes('最好') || text.includes('优先')) {
    if (candidateEntries.length) {
      bullets.push(`当前可优先关注 ${candidateEntries.length} 个重点候选：${candidateEntries.map((entry) => entry.name).join('、')}。`);
      bullets.push('优先级依据来自真实回填的 RankIC/多空收益/历史样本，不包含估算绩效。');
    } else {
      bullets.push('当前没有满足重点候选规则的因子，建议先扩大历史样本或继续导入 JoinQuant 实测结果。');
    }
  } else if (text.includes('回测') || text.includes('复测')) {
    bullets.push(`已有 ${testedEntries.length} 个因子导入过真实测试结果，${waitingEntries.length} 个因子仍需要继续复测或补历史。`);
    bullets.push('短期仍建议用 JoinQuant 处理未来收益、停牌、涨跌停和复权；项目内回测需要先导入多日行情和未来收益。');
  } else {
    bullets.push(`因子研究流水线当前跟踪 ${pipeline.metrics.factorCount} 个因子，其中 ${pipeline.metrics.testedCount} 个已有真实回填结果。`);
    bullets.push(`重点候选 ${pipeline.metrics.strategyCandidateCount} 个，等待复测/跟踪 ${pipeline.metrics.waitingTestCount} 个，等待数据 ${pipeline.metrics.blockedCount} 个。`);
    bullets.push('你可以问：哪个因子优先、某个因子缺什么数据、下一步如何复测、能不能进策略池。');
  }

  return {
    answer: bullets,
    factor: selected?.factorId || null,
    generatedAt: new Date().toISOString(),
    mode: pipeline.assistant.mode,
    policy: pipeline.assistant.policy,
  };
}

function actionForRow(row) {
  const label = row.factor_label || '中性';
  const composite = toNumber(row.technical_composite);
  const crowding = toNumber(row.crowding_risk);
  const divergence = toNumber(row.volume_price_divergence_risk);
  const extension = toNumber(row.trend_extension_risk);
  const alerts = toNumber(row.crowding_alert_count);

  if (label === '强势候选') {
    return {
      action: '入池候选',
      actionTone: 'good',
      positionHint: '标准观察仓',
      rule: '趋势、量价、拥挤三项通过',
    };
  }

  if (label === '风险观察' || alerts >= 3 || divergence >= 0.55) {
    return {
      action: '暂不入场',
      actionTone: 'watch',
      positionHint: '只观察不加仓',
      rule: '风险警报或量价背离过高',
    };
  }

  if (composite >= 0.60 && crowding <= 0.55 && divergence <= 0.25 && extension <= 0.75) {
    return {
      action: '低仓观察',
      actionTone: 'pending',
      positionHint: '半仓以下观察',
      rule: '核心分达标但未满足强势候选',
    };
  }

  if (label === '弱势过滤') {
    return {
      action: '过滤',
      actionTone: 'watch',
      positionHint: '不参与',
      rule: '核心分或K线信号偏弱',
    };
  }

  return {
    action: '中性跟踪',
    actionTone: 'neutral',
    positionHint: '等待确认',
    rule: '信号未形成一致',
  };
}

function coreStrategyScore(row) {
  const trend = toNumber(row.trend_alignment);
  const volumePrice = toNumber(row.volume_price_confirmation);
  const composite = toNumber(row.technical_composite);
  const kline = Math.max(0, Math.min(1, toNumber(row.kline_event_score) / 10));
  const crowding = toNumber(row.crowding_risk);
  const divergence = toNumber(row.volume_price_divergence_risk);
  const extension = toNumber(row.trend_extension_risk);

  return Number((
    0.35 * volumePrice
    + 0.30 * trend
    + 0.15 * composite
    + 0.10 * kline
    - 0.20 * crowding
    - 0.15 * divergence
    - 0.10 * extension
  ).toFixed(6));
}

function actionForCoreStrategy(row) {
  const trend = toNumber(row.trend_alignment);
  const volumePrice = toNumber(row.volume_price_confirmation);
  const crowding = toNumber(row.crowding_risk);
  const divergence = toNumber(row.volume_price_divergence_risk);
  const extension = toNumber(row.trend_extension_risk);
  const alerts = toNumber(row.crowding_alert_count);
  const label = row.factor_label || '';

  if (label === '弱势过滤' || label === '风险观察') {
    return {
      action: '风险过滤',
      actionTone: 'watch',
      positionHint: '不参与',
      reason: `原始截面标签为${label}，核心策略不允许直接入池`,
    };
  }

  if (trend >= 0.60 && volumePrice >= 0.60 && crowding <= 0.55 && divergence <= 0.45 && extension <= 0.75 && alerts <= 2) {
    return {
      action: '核心入池',
      actionTone: 'good',
      positionHint: '候选观察仓',
      reason: '趋势和量价确认同时通过，拥挤、背离、过伸未触发硬过滤',
    };
  }

  if (trend >= 0.55 && volumePrice >= 0.55 && crowding <= 0.65 && divergence <= 0.55 && extension <= 0.85) {
    return {
      action: '二线观察',
      actionTone: 'pending',
      positionHint: '轻仓或等待二次确认',
      reason: '方向基本成立，但至少一项风险或确认强度未达到主入池线',
    };
  }

  if (crowding > 0.70 || divergence > 0.60 || extension > 0.90 || alerts >= 3) {
    return {
      action: '风险过滤',
      actionTone: 'watch',
      positionHint: '不参与',
      reason: '拥挤、背离、过伸或警报数量超过策略过滤线',
    };
  }

  return {
    action: '等待确认',
    actionTone: 'neutral',
    positionHint: '继续跟踪',
    reason: '趋势、量价或风险条件尚未形成一致',
  };
}

function capitalStrategyScore(row) {
  const follow = toNumber(row.capital_follow_signal);
  const ap = toNumber(row.active_ap_accumulation);
  const mainForce = toNumber(row.main_force_alignment);
  const persistence = toNumber(row.capital_persistence_2d);
  const overheat = toNumber(row.capital_overheat_risk);

  return Number((
    0.40 * follow
    + 0.25 * ap
    + 0.20 * mainForce
    + 0.15 * persistence
    - 0.25 * overheat
  ).toFixed(6));
}

function actionForCapitalStrategy(row) {
  const follow = toNumber(row.capital_follow_signal);
  const ap = toNumber(row.active_ap_accumulation);
  const mainForce = toNumber(row.main_force_alignment);
  const overheat = toNumber(row.capital_overheat_risk);
  const sourceCount = toNumber(row.capital_source_count);

  if (follow >= 0.65 && ap >= 0.60 && overheat <= 0.60 && sourceCount >= 2) {
    return {
      action: '资金跟随候选',
      actionTone: 'good',
      positionHint: '候选模块，先复测不实盘',
      reason: '资金跟随、暗盘吸筹和多来源确认通过，资金过热未越线',
    };
  }

  if (follow >= 0.55 && (ap >= 0.55 || mainForce >= 0.60) && overheat <= 0.70) {
    return {
      action: '资金观察',
      actionTone: 'pending',
      positionHint: '观察名单',
      reason: '资金方向存在，但确认源或过热约束未达到主入池线',
    };
  }

  if (overheat > 0.70) {
    return {
      action: '过热过滤',
      actionTone: 'watch',
      positionHint: '不追高',
      reason: '资金热度过高，策略默认等待降温或二次确认',
    };
  }

  return {
    action: '资金未确认',
    actionTone: 'neutral',
    positionHint: '继续跟踪',
    reason: '资金跟随或主动吸筹强度不足',
  };
}

function stockCodeFromRow(row) {
  return String(row.stock_code || row.code || '').padStart(6, '0');
}

function stockNameFromRow(row) {
  return row.stock_name || row.name || '-';
}

function buildLiveStrategySignals() {
  const primaryRows = readPrimaryFactorRows();
  const capitalRows = readCapitalFactorRows();
  const primarySummary = readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {});
  const capitalSummary = readJsonFile(capitalFactorSummaryPath, {});
  const capitalRegimes = Array.isArray(capitalSummary.market_regimes) ? capitalSummary.market_regimes : [];

  const coreRows = primaryRows
    .map((row) => ({
      ...row,
      decisionScore: coreStrategyScore(row),
      strategyId: 'core_volume_price_trend_v1',
      strategyName: '核心量价趋势策略 v1',
      signalDate: dateOnly(row.stock_date || row.date),
      ...actionForCoreStrategy(row),
    }))
    .sort((left, right) => right.decisionScore - left.decisionScore);

  const capitalSignalRows = capitalRows
    .map((row) => ({
      ...row,
      decisionScore: capitalStrategyScore(row),
      strategyId: 'capital_follow_v0',
      strategyName: '资金跟随策略 v0',
      signalDate: dateOnly(row.stock_date || row.date),
      ...actionForCapitalStrategy(row),
    }))
    .sort((left, right) => right.decisionScore - left.decisionScore);

  const labelCounts = coreRows.reduce((counts, row) => {
    const label = row.factor_label || '未标记';
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});

  const entryCandidates = coreRows.filter((row) => row.action === '核心入池');
  const observationCandidates = coreRows.filter((row) => row.action === '二线观察');
  const riskRows = coreRows.filter((row) => row.action === '风险过滤');
  const klineRows = coreRows.filter((row) => toNumber(row.kline_event_score) > 0 && row.factor_label !== '风险观察');
  const capitalCandidates = capitalSignalRows.filter((row) => row.action === '资金跟随候选');
  const capitalObservation = capitalSignalRows.filter((row) => row.action === '资金观察');
  const latestRegime = capitalRegimes[capitalRegimes.length - 1] || null;
  const coreRouteFactors = [
    strategyFactor('volume_price_confirmation', '入场确认', 0.35),
    strategyFactor('trend_alignment', '趋势确认', 0.30),
    strategyFactor('technical_composite', '综合辅助', 0.15),
    strategyFactor('kline_event_score', '形态辅助', 0.10),
    strategyFactor('crowding_risk', '风险过滤', -0.20),
    strategyFactor('volume_price_divergence_risk', '背离过滤', -0.15),
    strategyFactor('trend_extension_risk', '追高过滤', -0.10),
  ];
  const capitalRouteFactors = [
    strategyFactor('capital_follow_signal', '资金主信号', 0.40),
    strategyFactor('active_ap_accumulation', '暗盘吸筹确认', 0.25),
    strategyFactor('main_force_alignment', '主力一致确认', 0.20),
    strategyFactor('capital_persistence_2d', '资金持续性', 0.15),
    strategyFactor('capital_overheat_risk', '资金过热过滤', -0.25),
    strategyFactor('capital_source_count', '资金来源约束', null),
  ];
  const klineRouteFactors = [
    strategyFactor('kline_event_score', '形态辅助', 0.10),
    strategyFactor('volume_price_confirmation', '量价确认', null),
    strategyFactor('trend_alignment', '趋势背景', null),
  ];
  const marketRouteFactors = [
    strategyFactor('market_capital_regime', '仓位环境', null),
    strategyFactor('flow_vs_ma', '资金环境确认', null),
    strategyFactor('intraday_ap_slope', '日内资金确认', null),
  ];
  const strictAudit = readStrictFactorAudit();
  const strictAuditRoute = strictAudit?.strategyRoutes?.find((route) => route.strategyId === 'jq_quality_profit_liquidity_v1');
  const akshareCandidateValidation = readJsonFile(akshareStrategyValidationPath, {});
  const akshareReviewCandidateCount = Number(
    akshareCandidateValidation.joinquant_review_candidate_count
    || akshareCandidateValidation.paper_watch_candidate_count
    || 0,
  );
  const jqQualityRouteFactors = [
    strategyFactor('profit_growth_jq', '进攻核心', 0.40),
    strategyFactor('quality_growth_jq', '质量确认', 0.35),
    strategyFactor('liquidity_quality_jq', '可交易性过滤', 0.25),
  ];
  const akshareReviewFactors = [
    strategyFactor('ak_mean_reversion_quality_combo', '高波动回归核心', 0.34),
    strategyFactor('ak_defensive_quality_combo', '低波动防守确认', 0.42),
    strategyFactor('ak_volume_trend_quality_combo', '低波动量价趋势', 0.32),
    strategyFactor('ak_anti_crowding_reversal_combo', '反拥挤回归', 0.38),
    strategyFactor('ak_liquidity_stability', '新增流动性稳定', 0.12),
    strategyFactor('ak_contraction_breakout_combo', '新增收缩突破', 0.30),
    strategyFactor('ak_trend_pullback_reversal_combo', '新增趋势回踩', 0.30),
    strategyFactor('ak_crowding_risk', '拥挤风险过滤', -0.18),
  ];
  const jqBlockedFactors = strictAuditRoute?.blockedFactors || [];

  const strategyCandidates = [
    ...entryCandidates.slice(0, 25),
    ...capitalCandidates.slice(0, 15),
  ];
  const strategyResultStats = summarizeStrategyResultsById();
  const coreStrategyStats = strategyResultStats.core_volume_price_trend_v1;
  const coreValidation = buildStrategyValidation(coreStrategyStats, '策略');
  const coreLayeredValidation = buildLayeredStrategyValidation(coreStrategyStats, '核心量价趋势策略');
  const coreTradingValidation = buildTradingStrategyValidation(coreStrategyStats, '核心量价趋势策略');
  const coreStrategyValidated = coreValidation.validated && coreLayeredValidation.validated && coreTradingValidation.validated;
  const coreStrategyEvidence = coreValidation.bestResult
    ? coreValidation.evidence.replace('真实策略结果；', '真实策略结果；正式候选只采用未分层整体回测，')
    : coreValidation.evidence;
  const jqQualityStrategyStats = strategyResultStats.jq_quality_profit_liquidity_v1;
  const jqQualityValidation = buildStrategyValidation(jqQualityStrategyStats, '策略');
  const jqQualityLayeredValidation = buildLayeredStrategyValidation(jqQualityStrategyStats, 'JQ质量利润流动性策略');
  const jqQualityTradingValidation = buildTradingStrategyValidation(jqQualityStrategyStats, 'JQ质量利润流动性策略');
  const jqQualityStrategyValidated = jqQualityValidation.validated && jqQualityLayeredValidation.validated && jqQualityTradingValidation.validated;
  const capitalStrategyStats = strategyResultStats.capital_follow_v0;
  const capitalValidation = buildStrategyValidation(capitalStrategyStats, '策略');
  const capitalLayeredValidation = buildLayeredStrategyValidation(capitalStrategyStats, '资金跟随策略');
  const capitalTradingValidation = buildTradingStrategyValidation(capitalStrategyStats, '资金跟随策略');
  const capitalStrategyValidated = capitalValidation.validated && capitalLayeredValidation.validated && capitalTradingValidation.validated;
  const comboStrategyStats = strategyResultStats.money_flow_kline_confirmation_v0;
  const comboValidation = buildStrategyValidation(comboStrategyStats, '策略');
  const comboTradingResult = (comboStrategyStats?.all || []).find((result) => (
    result.result_type === 'strategy_trading_backtest'
    && !result.market_regime
    && !result.market_cap_bucket
  ));
  const comboTradingPassed = Number(comboTradingResult?.strategy_return) > 0
    && Number(comboTradingResult?.strategy_annual_return) > 0
    && Number(comboTradingResult?.max_drawdown) > -0.20;
  const klineStrategyStats = strategyResultStats.kline_assisted_confirmation;
  const klineValidation = buildStrategyValidation(klineStrategyStats, '策略');
  const klineLayeredValidation = buildLayeredStrategyValidation(klineStrategyStats, 'K线辅助确认策略');
  const klineTradingValidation = buildTradingStrategyValidation(klineStrategyStats, 'K线辅助确认策略');
  const klineStrategyValidated = klineValidation.validated && klineLayeredValidation.validated && klineTradingValidation.validated;
  const marketRegimeStats = strategyResultStats.market_capital_regime_position;
  const marketRegimeValidation = buildStrategyValidation(marketRegimeStats, '仓位模块');
  const marketRegimeTested = Boolean(marketRegimeValidation.bestResult);
  const formalStrategiesUnsorted = [
    ...(coreStrategyValidated
      ? [
      {
        id: 'core_volume_price_trend_v1',
        name: '核心量价趋势策略 v1',
        pool: 'formal_candidate',
        status: 'real_strategy_backtested',
        validationState: `${coreStrategyEvidence} ${coreLayeredValidation.evidence} ${coreTradingValidation.evidence} 口径为 JoinQuant OHLCV 历史重建，非 Yiwan 全字段等价复刻。`,
        role: '已实测正式候选',
        objective: '用趋势质量确认方向，用量价确认验证成交质量，再用拥挤、背离、过伸做硬过滤。',
        dataBasis: `JoinQuant 策略级结果 ${coreStrategyStats.all.length} 条；技术截面 ${coreRows.length} 条`,
        factorState: coreRouteFactors,
        rankingFormula: '量价确认 + 趋势确认 + 技术综合 + K线辅助 - 拥挤/背离/过伸风险；以 5/10/20 主周期真实结果为准。',
        entryRules: [
          'trend_alignment >= 0.60',
          'volume_price_confirmation >= 0.60',
          'crowding_risk <= 0.55',
          'volume_price_divergence_risk <= 0.45',
          'trend_extension_risk <= 0.75 且 crowding_alert_count <= 2',
        ],
        riskFilters: [
          '仅承认 JoinQuant 已回填策略结果，不用因子结果替代策略收益',
          'OHLCV 重建不包含 Yiwan 暗盘/筹码原字段',
          '正式实盘前继续做样本外、交易成本、换手和回撤审计',
        ],
        portfolioRules: ['候选池排序前30只', '5日调仓脚本已生成', '当前只作为正式候选，不等于实盘批准'],
        nextAction: '继续补策略交易回测净值、换手、最大回撤和样本外结果；若回撤/成本通过，再升级为正式策略。',
        candidateCount: entryCandidates.length,
        computedSignalCount: coreRows.length,
        exportStatus: '已有真实策略级结果，仍需交易成本和样本外审计',
      },
      ]
      : []),
    ...(capitalStrategyValidated
      ? [
        {
          id: 'capital_follow_v0',
          name: '资金跟随策略 v0',
          pool: 'formal_candidate',
          status: 'real_strategy_backtested',
          validationState: `${capitalValidation.evidence} ${capitalLayeredValidation.evidence} ${capitalTradingValidation.evidence} 口径为 JoinQuant money_flow/OHLCV 事件回测，未复刻 Yiwan 暗盘字段。`,
          role: '已实测正式候选',
          objective: '用主力资金净流入、超大/大单同步、资金持续性确认候选，并过滤过热资金。',
          dataBasis: `JoinQuant 策略级结果 ${capitalStrategyStats.all.length} 条；候选样本 ${capitalValidation.bestResult?.packetSample?.candidate_rows || 0} 条`,
          factorState: capitalRouteFactors,
          rankingFormula: '资金跟随 + 主力一致 + 大单吸筹 + 资金持续性 - 资金过热；以 5/10/20 日真实策略结果为准。',
          entryRules: [
            'capital_follow_signal >= 0.65',
            'main_force_alignment 较强',
            'active_large_order_accumulation 较强',
            'capital_overheat_risk 不过热',
          ],
          riskFilters: [
            '只承认 JoinQuant money_flow/OHLCV 已回填结果',
            '未使用 Yiwan 暗盘字段，不把代理口径说成原站等价',
            '正式实盘前继续做交易成本、换手、回撤和样本外审计',
          ],
          portfolioRules: ['候选池排序前30只', '5/10/20 日均已跑策略级事件回测', '当前只作为正式候选，不等于实盘批准'],
          nextAction: '继续补交易净值、成本敏感性、市值/波动分层和样本外审计。',
          candidateCount: capitalValidation.bestResult?.packetSample?.candidate_rows || capitalCandidates.length,
          computedSignalCount: capitalValidation.bestResult?.packetSample?.factor_rows || capitalSignalRows.length,
          exportStatus: '已有真实策略级结果，仍需交易成本和样本外审计',
        },
      ]
      : []),
    ...(klineStrategyValidated
      ? [
        {
          id: 'kline_assisted_confirmation',
          name: 'K线辅助确认策略',
          pool: 'formal_candidate',
          status: 'paper_trade_candidate',
          validationState: `${klineValidation.evidence} ${klineLayeredValidation.evidence} ${klineTradingValidation.evidence} 口径为 JoinQuant OHLCV 情绪系数加权K线事件回测，未使用研报不可得字段。`,
          role: '准模拟盘候选：仅低波动/大市值优先',
          objective: '用单根K线事件、收盘位置、上下影线、趋势背景和240日量能情绪系数做入场确认。',
          dataBasis: `JoinQuant 策略级结果 ${klineStrategyStats.all.length} 条；候选样本 ${klineValidation.bestResult?.packetSample?.candidate_rows || 0} 条`,
          factorState: klineRouteFactors,
          rankingFormula: 'K线事件 + 蜡烛质量 + 趋势背景 + 240日情绪系数 - 派发风险；以 5/10/20 日真实策略结果为准。',
          entryRules: [
            'weighted_kline_score >= 0.62',
            'trend_context >= 0.45',
            'distribution_risk <= 0.62',
            '每期取策略分数前30只',
          ],
          riskFilters: [
            '只承认 JoinQuant OHLCV 已回填结果',
            '不复制研报原始收益，不展示未实测绩效',
            'K线更适合作为确认/过滤模块，独立实盘前还需交易成本和样本外检验',
          ],
          portfolioRules: ['候选池排序前30只', '已完成 5/10/20 日策略级事件回测', '优先和核心量价趋势做交集或加权确认'],
          nextAction: '进入受控模拟盘前，只允许低波动环境和大市值优先；继续测试与核心量价趋势、资金跟随策略的组合效果。',
          candidateCount: klineValidation.bestResult?.packetSample?.candidate_rows || klineRows.length,
          computedSignalCount: klineValidation.bestResult?.packetSample?.factor_rows || coreRows.length,
          exportStatus: '已有真实策略级结果，建议作为辅助确认模块继续组合回测',
        },
      ]
      : []),
    ...(jqQualityStrategyValidated
      ? [
        {
          id: 'jq_quality_profit_liquidity_v1',
          name: 'JQ质量利润流动性策略 v1',
          pool: 'formal_candidate',
          status: 'paper_trade_candidate',
          validationState: `${jqQualityValidation.evidence} ${jqQualityLayeredValidation.evidence} ${jqQualityTradingValidation.evidence} 口径为 JoinQuant valuation/indicator/OHLCV 事件回测。`,
          role: '准模拟盘候选：仅审计通过分层路线',
          objective: '用利润增长做进攻核心，用质量成长确认基本面质量，用流动性质量约束可交易性。',
          dataBasis: `JoinQuant 策略级结果 ${jqQualityStrategyStats.all.length} 条；严格审计入选 ${strictAudit?.counts.selectedFactors || 3} 个因子`,
          factorState: jqQualityRouteFactors,
          rankingFormula: '0.40*利润增长_JQ(20日) + 0.35*质量成长_JQ(20日) + 0.25*流动性质量_JQ(20日)',
          entryRules: [
            'profit_growth_jq 使用 20日最佳周期',
            'quality_growth_jq 使用 20日最佳周期',
            'liquidity_quality_jq 使用 20日最佳周期',
            '组合按策略分数取每期前30只',
          ],
          riskFilters: [
            '仅承认 JoinQuant 已回填策略结果，不用单因子结果替代策略收益',
            '未通过的波动/市值层不得在模拟盘中放开',
            '正式实盘前继续做样本外、交易成本、换手、最大回撤和行业暴露审计',
          ],
          portfolioRules: ['候选池排序前30只', '5/10/20 日均已跑策略级事件回测', '首批模拟观察只允许成熟度审计通过的分层路线'],
          nextAction: '按 strategy_maturity_audit 的受控路线进入模拟观察；不得放开整策略。',
          candidateCount: jqQualityValidation.bestResult?.packetSample?.candidate_rows || 0,
          computedSignalCount: jqQualityValidation.bestResult?.packetSample?.factor_rows || strictAudit?.counts.selectedFactors || 0,
          exportStatus: '已有真实策略级结果，仍需交易成本和样本外审计',
        },
      ]
      : []),
  ];
  const formalStrategyPriority = {
    jq_quality_profit_liquidity_v1: 0,
    kline_assisted_confirmation: 1,
    core_volume_price_trend_v1: 2,
    capital_follow_v0: 3,
  };
  const formalStrategies = [...formalStrategiesUnsorted].sort((left, right) => (
    (formalStrategyPriority[left.id] ?? 99) - (formalStrategyPriority[right.id] ?? 99)
  ));

  return {
    generatedAt: new Date().toISOString(),
    dataPolicy: '策略工作台只使用本地真实截面因子；1日结果只作参考，5/10/20 日真实回测结果用于选择因子最佳周期；完整策略回测默认必须包含大/中/小市值与高/中/低波动交叉分层。',
    source: {
      file: [
        primarySummary.source_file || researchFactorResultsPath,
        capitalSummary.source_files?.length ? capitalFactorResultsPath : '',
      ].filter(Boolean).join(' | '),
      inputKind: [primarySummary.input_kind || 'technical_cross_section', capitalSummary.input_kind || ''].filter(Boolean).join(' + '),
      primaryRows: coreRows.length,
      capitalRows: capitalSignalRows.length,
      rows: coreRows.length + capitalSignalRows.length,
    },
    metrics: {
      draftStrategies: 7,
      executableStrategies: [
        coreStrategyValidated,
        capitalStrategyValidated,
        jqQualityStrategyValidated,
        klineStrategyValidated,
        marketRegimeTested,
      ].filter(Boolean).length,
      formalStrategies: formalStrategies.length,
      partialStrategies: [!capitalStrategyValidated, !klineStrategyValidated, !marketRegimeTested].filter(Boolean).length,
      blockedStrategies: coreStrategyValidated ? 0 : 1,
      entryCandidates: entryCandidates.length,
      observationCandidates: observationCandidates.length,
      capitalCandidates: capitalCandidates.length,
      riskRows: riskRows.length,
      strongRows: labelCounts['强势候选'] || 0,
      riskWatchRows: labelCounts['风险观察'] || 0,
    },
    strategies: [
      {
        id: 'core_volume_price_trend_v1',
        name: '核心量价趋势策略 v1',
        pool: 'draft',
        status: coreStrategyValidated ? 'real_strategy_backtested' : 'real_signal_computed',
        validationState: coreStrategyValidated
          ? `${coreStrategyEvidence} 仍保留在草案池中，方便继续导出分层/交易脚本。`
          : '因子有真实截面值，策略组合尚未完成历史回测',
        role: '当前主策略',
        objective: '用趋势质量确认方向，用量价确认验证成交质量，再用拥挤、背离、过伸做硬过滤。',
        dataBasis: `技术截面 ${coreRows.length} 条；最新日期 ${dateOnly(primaryRows[0]?.stock_date || primaryRows[0]?.date) || '-'}`,
        factorState: coreRouteFactors,
        rankingFormula: '按每个因子在 5/10/20 中的最佳周期定角色：量价确认 + 趋势确认 + 技术综合 + K线辅助 - 拥挤/背离/过伸风险',
        entryRules: [
          'trend_alignment >= 0.60',
          'volume_price_confirmation >= 0.60',
          'crowding_risk <= 0.55',
          'volume_price_divergence_risk <= 0.45',
          'trend_extension_risk <= 0.75 且 crowding_alert_count <= 2',
        ],
        riskFilters: [
          'crowding_risk > 0.70 或 volume_price_divergence_risk > 0.60 直接过滤',
          'trend_extension_risk > 0.90 不追高',
          '拥挤和背离优先级高于单日涨幅',
        ],
        portfolioRules: ['候选池先取排序前20-50只', '1日只作参考，正式入选看5/10/20最佳周期', '策略收益只认 JoinQuant 真实回填'],
        nextAction: coreStrategyValidated
          ? '继续跑交易回测、样本外和成本敏感性；当前可作为正式候选，不直接实盘。'
          : '先按因子最佳周期组合回测核心量价路线，再决定是否进入正式策略池。',
        candidateCount: entryCandidates.length,
        computedSignalCount: coreRows.length,
        exportStatus: '因子可导出；策略收益未验证',
      },
      {
        id: 'capital_follow_v0',
        name: '资金跟随策略 v0',
        pool: 'draft',
        status: capitalStrategyValidated ? 'real_strategy_backtested' : 'candidate_module',
        validationState: capitalStrategyValidated
          ? `${capitalValidation.evidence} 仍保留在草案池中，方便继续导出分层/交易脚本。`
          : '资金因子已由真实日期批次计算，策略尚未实测',
        role: '候选策略模块',
        objective: '捕捉主力/暗盘资金同步流入且未过热的股票，作为量价策略之外的资金确认模块。',
        dataBasis: capitalStrategyValidated
          ? `JoinQuant money_flow/OHLCV 策略实测 ${capitalStrategyStats.all.length} 条；候选样本 ${capitalValidation.bestResult?.packetSample?.candidate_rows || 0} 条`
          : `资金截面 ${capitalSignalRows.length} 条；日期 ${Array.from(new Set(capitalRows.map((row) => dateOnly(row.stock_date || row.date)))).filter(Boolean).join(', ') || '-'}`,
        factorState: capitalRouteFactors,
        rankingFormula: capitalStrategyValidated
          ? '资金跟随 + 主力一致 + 大单吸筹 + 资金持续性 - 资金过热；以 5/10/20 日真实策略结果为准。'
          : '资金因子当前缺少 5/10/20 回测周期，先保留真实资金逻辑；补齐后再选择最佳周期。',
        entryRules: [
          'capital_follow_signal >= 0.65',
          'active_ap_accumulation >= 0.60',
          'capital_overheat_risk <= 0.60',
          'capital_source_count >= 2',
        ],
        riskFilters: [
          'capital_overheat_risk > 0.70 过滤',
          '只有单一资金来源时不作为主信号',
          capitalStrategyValidated
            ? '已完成独立 JoinQuant money_flow 实测；仍需交易成本、换手和样本外审计'
            : '资金日期和技术日期不一致时先独立复测，不强行合成',
        ],
        portfolioRules: capitalStrategyValidated
          ? ['候选池排序前30只', '已完成 5/10/20 日策略级事件回测', '下一步和核心量价趋势做交集/加权组合测试']
          : ['先作为独立候选池测试', '确认 5/10/20 最佳周期后再和核心量价趋势做交集或加权并集', '资金因子至少补 20-60 个交易日后进入正式组合回测'],
        nextAction: capitalStrategyValidated
          ? '继续补交易净值、交易成本、换手、回撤、市值/波动分层和样本外审计。'
          : '继续按日期批量采集资金页，优先补齐连续 20 个交易日，再测资金跟随因子的未来收益。',
        candidateCount: capitalValidation.bestResult?.packetSample?.candidate_rows || capitalCandidates.length,
        computedSignalCount: capitalValidation.bestResult?.packetSample?.factor_rows || capitalSignalRows.length,
        exportStatus: capitalStrategyValidated ? '已有真实策略级结果，仍需交易成本和样本外审计' : '因子可导出；策略收益未验证',
      },
      {
        id: 'jq_quality_profit_liquidity_v1',
        name: 'JQ质量利润流动性策略 v1',
        pool: 'draft',
        status: jqQualityStrategyValidated ? 'real_strategy_backtested' : strictAuditRoute?.status || 'ready_for_joinquant_strategy_backtest',
        validationState: jqQualityStrategyValidated
          ? `${jqQualityValidation.evidence} 仍保留在草案池中，方便继续导出交易回测和分层脚本。`
          : '由真实 JoinQuant 因子实测筛出，尚未完成策略级回测；不得展示策略收益。',
        role: '新增关键决策策略路线',
        objective: '用利润增长做进攻核心，用质量成长确认基本面质量，用流动性质量约束可交易性。',
        dataBasis: strictAudit
          ? `严格审计 ${strictAudit.counts.auditedFactors} 个因子；入选 ${strictAudit.counts.selectedFactors} 个；来源 ${strictAudit.source}${jqQualityStrategyStats?.all?.length ? `；策略实测 ${jqQualityStrategyStats.all.length} 条` : ''}`
          : '等待严格审计文件',
        factorState: jqQualityRouteFactors,
        rankingFormula: '0.40*利润增长_JQ(20日) + 0.35*质量成长_JQ(20日) + 0.25*流动性质量_JQ(20日)',
        entryRules: [
          'profit_growth_jq 必须通过重点候选筛选',
          'quality_growth_jq 必须通过重点候选筛选',
          'liquidity_quality_jq 必须通过重点候选筛选',
          '估值安全垫、低波动质量、市敏风险当前不进入主排序，只作为观察或风控备选',
        ],
        riskFilters: [
          ...jqBlockedFactors.map((factor) => `${factor.name}：${factor.decision}，${factor.reason}`),
          jqQualityStrategyValidated
            ? '已有策略级事件回测，但进入正式实盘前仍需交易成本、换手、最大回撤和样本外审计'
            : '没有策略级 JoinQuant 回测前，不进入正式策略池',
        ],
        portfolioRules: jqQualityStrategyValidated
          ? ['候选池排序前30只', '已完成 5/10/20 日策略级事件回测', '下一步跑交易净值、成本和回撤']
          : ['建议先在 JoinQuant 重建 valuation/indicator/OHLCV 因子表', '按 5/10/20 日做策略事件检验', '通过后再跑交易回测、成本和回撤'],
        nextAction: jqQualityStrategyValidated
          ? '继续补完整交易回测净值、交易成本、换手、最大回撤、市值/波动分层和样本外结果。'
          : strictAuditRoute?.nextAction || '生成 JoinQuant 重建脚本并跑策略级实测。',
        candidateCount: jqQualityValidation.bestResult?.packetSample?.candidate_rows || 0,
        computedSignalCount: jqQualityValidation.bestResult?.packetSample?.factor_rows || strictAudit?.counts.selectedFactors || 0,
        exportable: false,
        specialBacktestScriptEndpoint: '/strategy-api/joinquant-jq-quality-profit-liquidity-backtest-script.py',
        exportStatus: jqQualityStrategyValidated
          ? '已有真实策略级结果，仍需交易成本和样本外审计'
          : '路线已生成；等待 JoinQuant 策略级实测',
      },
      {
        id: 'akshare_ohlcv_candidate_review_pack',
        name: 'AkShare强分层候选复核包',
        pool: 'draft',
        status: 'ready_for_joinquant_strategy_backtest',
        validationState: akshareReviewCandidateCount
          ? `本地 AkShare 300股/608日 OHLCV 稳定性验证筛出 ${akshareReviewCandidateCount} 条待复核候选；尚未导入 JoinQuant 真实复核结果。`
          : '等待 AkShare 本地候选稳定性验证结果。',
        role: '待聚宽复核的候选策略包',
        objective: '把本地强分层路线迁移到 JoinQuant，用真实 OHLCV、沪深300波动、市值、成交额和换手率复核目标路线与波动×市值交叉层。',
        dataBasis: akshareReviewCandidateCount
          ? `AkShare 本地验证 ${akshareCandidateValidation.unique_stocks || 0} 股 / ${akshareCandidateValidation.unique_dates || 0} 日；候选 ${akshareReviewCandidateCount} 条`
          : '等待 AkShare 候选验证文件',
        factorState: akshareReviewFactors,
        rankingFormula: '按每条本地候选路线分别复核：高波动均值回归、低波动防守确认、低波动量价趋势、高波动反拥挤、低波动收缩突破、低波动趋势回踩；不合并展示未实测收益。',
        entryRules: [
          '只复核本地已通过年度/样本外/回撤/Sharpe 门槛的候选',
          '目标路线保留本地高/低波动与中流动性约束',
          '额外输出高/中/低波动 × 大/中/小市值交叉层',
          '每期 Top20，5日等权调仓',
        ],
        riskFilters: [
          '未导入 JoinQuant 结果前，不进入正式策略池',
          '腾讯源缺成交额的本地流动性兜底会被 JoinQuant money_ma20 替换',
          '使用 valuation.market_cap 做市值层，使用 valuation.turnover_ratio 做拥挤风险复核',
        ],
        portfolioRules: [
          '脚本输出事件回测 5/10/20 日结果',
          '脚本输出 5日调仓交易净值、成本、滑点、换手和最大回撤',
          '默认包含目标路线、市值层、波动×市值交叉层',
        ],
        nextAction: '下载聚宽复核脚本，在 JoinQuant Python3 研究环境运行，回填 JSON 后再筛选是否升级为正式候选。',
        candidateCount: akshareReviewCandidateCount,
        computedSignalCount: akshareCandidateValidation.rows || 0,
        exportable: false,
        specialBacktestScriptEndpoint: '/strategy-api/joinquant-akshare-candidate-review-script.py',
        exportStatus: '已生成 JoinQuant 复核脚本；等待真实结果回填',
      },
      {
        id: 'money_flow_kline_confirmation_v0',
        name: '主力资金广度K线确认策略 v0',
        pool: 'draft',
        status: comboTradingPassed ? 'real_strategy_backtested' : 'hold',
        validationState: comboTradingResult
          ? `已完成真实 JoinQuant 交易回测：总收益 ${(Number(comboTradingResult.strategy_return) * 100).toFixed(2)}%，年化 ${(Number(comboTradingResult.strategy_annual_return) * 100).toFixed(2)}%，最大回撤 ${(Number(comboTradingResult.max_drawdown) * 100).toFixed(2)}%，Sharpe ${Number(comboTradingResult.sharpe).toFixed(2)}。事件回测为正，但交易净值未通过。`
          : '由真实因子结果组合生成，等待交易回测。',
        role: '真实回测观察草案',
        objective: '把20日表现相对靠前的主力一致性、资金来源广度、资金跟随、主反向背离和单根K线评分做交叉确认。',
        dataBasis: comboStrategyStats?.all?.length
          ? `JoinQuant money_flow/OHLCV 真实策略结果 ${comboStrategyStats.all.length} 条；未使用 Yiwan 暗盘原字段。`
          : '等待 JoinQuant 真实策略结果。',
        factorState: [
          strategyFactor('main_force_alignment', '主力一致确认', 0.25),
          strategyFactor('capital_source_count', '资金来源广度', 0.20),
          strategyFactor('capital_follow_signal', '资金主信号', 0.20),
          strategyFactor('institutional_contra_divergence', '主反向背离确认', 0.15),
          strategyFactor('kline_event_score', 'K线确认', 0.10),
          strategyFactor('active_large_order_accumulation', '超大/大单吸筹代理', 0.10),
          strategyFactor('capital_overheat_risk', '资金过热过滤', -0.20),
        ],
        rankingFormula: '0.25*主力一致 + 0.20*资金来源数 + 0.20*资金跟随 + 0.15*主反向背离 + 0.10*K线评分 + 0.10*大单吸筹 - 0.20*资金过热',
        entryRules: [
          'main_force_alignment >= 0.55',
          'capital_source_count >= 2',
          'capital_follow_signal >= 0.55',
          'capital_overheat_risk <= 0.72',
          'kline_event_score >= 0',
        ],
        riskFilters: [
          '完整交易净值未通过，不进入正式策略池',
          'active_large_order_accumulation 是 JoinQuant 超大/大单代理，不等价于 Yiwan 暗盘吸筹',
          '后续若要继续研究，应先降低换手、提高资金过热惩罚或只作为核心策略确认过滤器',
        ],
        portfolioRules: ['候选池排序前30只', '5日调仓', '默认已完成未分层/波动/市值/交叉分层交易回测'],
        nextAction: comboTradingPassed
          ? '继续做样本外和成本敏感性。'
          : '不建议独立使用；下一步只测试作为核心量价趋势策略的确认过滤器，而不是独立选股策略。',
        candidateCount: comboTradingResult?.sample_trades || 0,
        computedSignalCount: comboValidation.bestResult?.sample_trades || 0,
        exportStatus: '已有真实策略级结果；交易净值未通过',
      },
      {
        id: 'kline_assisted_confirmation',
        name: 'K线辅助确认策略',
        pool: 'draft',
        status: klineStrategyValidated ? 'real_strategy_backtested' : 'partial_real_data',
        validationState: klineStrategyValidated
          ? `${klineValidation.evidence} 已完成 240 日量能情绪系数加权K线实测。`
          : '单根K线分数已计算，完整情绪加权K线仍缺 240 日价量历史',
        role: '辅助确认',
        objective: '把华福研报的单根K线评分作为入池解释和边际加分，不单独替代趋势与量价。',
        dataBasis: klineStrategyValidated
          ? `JoinQuant OHLCV 情绪加权K线实测 ${klineStrategyStats.all.length} 条；候选样本 ${klineValidation.bestResult?.packetSample?.candidate_rows || 0} 条`
          : `kline_event_score 已在 ${coreRows.length} 条技术截面中计算；正分样本 ${klineRows.length} 条`,
        factorState: klineRouteFactors,
        rankingFormula: klineStrategyValidated
          ? 'K线事件 + 蜡烛质量 + 趋势背景 + 240日情绪系数 - 派发风险；以 5/10/20 日真实策略结果为准。'
          : 'K线评分按 5/10/20 最佳周期作为辅助项；当前不单独生成主策略排序',
        entryRules: [
          klineStrategyValidated ? 'weighted_kline_score >= 0.62' : 'kline_event_score > 0 时可为核心策略加分',
          klineStrategyValidated ? 'trend_context >= 0.45' : '风险观察样本即使K线为正也不直接入场',
          klineStrategyValidated ? 'distribution_risk <= 0.62，每期取前30只' : 'PDF未给明确分数的形态只识别不计分',
        ],
        riskFilters: [
          klineStrategyValidated
            ? '已使用 JoinQuant 真实240日 volume/money 计算情绪系数'
            : '缺少 240 日成交量历史时不计算 emotion_weighted_kline_score',
          '不复制研报原始收益，不展示未实测绩效',
        ],
        portfolioRules: klineStrategyValidated
          ? ['候选池排序前30只', '可作为独立候选观察，但优先辅助核心量价趋势', '下一步做组合交集和交易成本审计']
          : ['辅助核心量价趋势，不独立建仓', '等价量共振历史补齐后再升级为情绪加权K线策略'],
        nextAction: klineStrategyValidated
          ? '继续测试与核心量价趋势、资金跟随策略的组合效果，补交易净值、回撤和成本。'
          : '补 240 日 OHLCV 与未来收益标签，复现情绪系数加权K线后再评估是否独立成策略。',
        candidateCount: klineValidation.bestResult?.packetSample?.candidate_rows || klineRows.length,
        computedSignalCount: klineValidation.bestResult?.packetSample?.factor_rows || coreRows.length,
        exportStatus: klineStrategyValidated ? '已有真实策略级结果，建议作为辅助确认模块继续组合回测' : '单根K线可观察；完整策略待数据',
      },
      {
        id: 'market_capital_regime_position',
        name: '市场资金状态仓位模块',
        pool: 'draft',
        status: marketRegimeTested ? 'real_position_overlay_backtested' : (latestRegime ? 'market_state_only' : 'requires_more_data'),
        validationState: marketRegimeTested
          ? `${marketRegimeValidation.evidence} 这是沪深300指数仓位开关实测，不能替代个股选股回测。`
          : (latestRegime ? '市场层资金状态已计算，不能替代个股选股回测' : '等待大盘资金数据'),
        role: '仓位开关',
        objective: '用市场资金环境决定策略是否放大、正常、降仓或暂停，不负责个股排序。',
        dataBasis: marketRegimeTested
          ? `JoinQuant 沪深300 OHLCV 仓位实测 ${marketRegimeStats.all.length} 条；市场样本 ${marketRegimeValidation.bestResult?.packetSample?.market_rows || 0} 日`
          : latestRegime
          ? `市场状态 ${capitalRegimes.length} 日；最新 ${latestRegime.date}，market_capital_regime=${Number(latestRegime.market_capital_regime).toFixed(3)}`
          : '暂无可用市场资金状态',
        factorState: marketRouteFactors,
        rankingFormula: '市场级别仓位乘数，不参与个股排序',
        entryRules: [
          'market_capital_regime >= 0.65：允许正常或偏积极',
          '0.35 <= market_capital_regime < 0.65：正常观察',
          'market_capital_regime < 0.35：降仓或暂停新增',
        ],
        riskFilters: marketRegimeTested
          ? ['这是指数仓位叠加实测，不是个股alpha', '高/中/低波动分层已回填，但需继续叠加到具体选股策略净值上验证']
          : ['只有 3 日市场状态，暂不做长期阈值结论', '不能把市场状态当作个股超额收益验证'],
        portfolioRules: ['作为策略组合仓位乘数', marketRegimeTested ? '已完成沪深300指数仓位开关事件回测' : '正式参数等待更长市场历史回测'],
        nextAction: marketRegimeTested
          ? '下一步把仓位乘数叠加到核心量价、资金跟随、K线辅助的真实候选组合上，跑交易净值。'
          : '持续采集市场资金状态，和核心策略候选收益一起回测仓位乘数效果。',
        candidateCount: 0,
        computedSignalCount: marketRegimeValidation.bestResult?.packetSample?.market_rows || capitalRegimes.length,
        exportStatus: marketRegimeTested ? '已有真实指数仓位模块结果；等待叠加个股策略净值' : '市场状态已计算；仓位效果待验证',
      },
    ],
    formalPolicy: {
      status: formalStrategies.length ? 'has_formal_candidates' : 'empty',
      title: '正式策略池只接收已完成策略级回测的组合',
      description: formalStrategies.length
        ? '当前已有策略级真实回测结果，满足最低正式候选门槛；仍需交易成本、回撤和样本外审计。'
        : '当前项目内还没有策略级历史回测结果，因此不把任何草案策略提升为正式策略。',
      requiredEvidence: [
        '策略组合在历史区间完成回测，不只看单因子截面值',
        '因子周期路线必须从 5/10/20 日中选择，1日只作参考',
        '默认必须完成大/中/小市值分层、高/中/低波动分层，以及 9 个市值×波动交叉层',
        '至少包含未来收益、分组收益或组合净值曲线',
        '记录回撤、换手、交易成本、样本交易日和股票池口径',
        '通过后再写入正式策略池，作为可复用决策策略',
      ],
      nextAction: formalStrategies.length
        ? '优先补核心策略的交易回测净值、最大回撤、换手和样本外结果。'
        : '先回测核心量价趋势策略 v1；通过后再把它从草案池提升到正式策略池。',
    },
    formalStrategies,
    candidates: strategyCandidates.slice(0, 50).map((row) => ({
      action: row.action,
      actionTone: row.actionTone,
      close: row.close,
      code: stockCodeFromRow(row),
      crowdingRisk: row.crowding_risk,
      decisionScore: row.decisionScore,
      divergenceRisk: row.volume_price_divergence_risk,
      extensionRisk: row.trend_extension_risk,
      factorLabel: row.factor_label,
      name: stockNameFromRow(row),
      positionHint: row.positionHint,
      reason: row.reason || row.factor_reason || row.rule,
      rule: row.rule,
      signalDate: row.signalDate,
      strategyId: row.strategyId,
      strategyName: row.strategyName,
      technicalRank: row.technical_rank,
      trend: row.trend_alignment,
      volumePrice: row.volume_price_confirmation,
      capitalFollow: row.capital_follow_signal,
      capitalAp: row.active_ap_accumulation,
      capitalOverheat: row.capital_overheat_risk,
      capitalPersistence: row.capital_persistence_2d,
      capitalSourceCount: row.capital_source_count,
      warningCount: row.crowding_alert_count,
    })),
    unavailable: [
      {
        id: 'validated_strategy_performance',
        reason: coreStrategyValidated
          ? '核心量价趋势已有策略级收益结果，但仍缺完整交易净值、换手、最大回撤和成本敏感性。'
          : '当前只有真实截面信号，没有策略级未来收益、回撤、换手和分组收益。',
        nextAction: coreStrategyValidated
          ? '继续用 JoinQuant 策略回测脚本跑交易净值和成本版本，再回填。'
          : '把每个策略的候选名单按日期导出到 JoinQuant 或补齐本地历史行情后逐个回测。',
      },
      {
        id: 'multi_day_capital_history',
        reason: `资金数据目前 ${Array.from(new Set(capitalRows.map((row) => dateOnly(row.stock_date || row.date)))).filter(Boolean).length} 个交易日，资金策略仍缺连续历史。`,
        nextAction: '继续用分批脚本每天追加，不需要一次性大量采集。',
      },
      {
        id: 'emotion_weighted_kline_full_version',
        reason: '完整华福情绪加权K线需要 240 日成交量、60 日均线变化和未来收益标签。',
        nextAction: '先把单根K线作为辅助项，等 OHLCV 历史补齐后再升级。',
      },
    ],
  };
}

async function handleApi(req, res, pathname) {
  const state = readState();
  const url = new URL(req.url || '/', `http://localhost:${port}`);

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, { ok: true, service: 'quant-factor-platform', timestamp: new Date().toISOString() });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/summary') {
    sendJson(res, buildSummary(state));
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/preferences') {
    sendJson(res, state.preferences);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/preferences') {
    const body = await readJsonBody(req);
    const nextState = {
      ...state,
      preferences: {
        ...state.preferences,
        ...body,
        feeRate: Number(body.feeRate ?? state.preferences.feeRate),
        slippage: Number(body.slippage ?? state.preferences.slippage),
      },
    };

    writeState(nextState);
    sendJson(res, nextState.preferences);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/risk') {
    sendJson(res, buildDataCoverageRisks());
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/paper-watch-routes') {
    sendJson(res, buildPaperWatchRoutes());
    return true;
  }

  if (req.method === 'GET' && pathname === '/factor-api/factors') {
    sendJson(res, [
      ...state.factors.map(enrichFactor),
      ...buildIndicatorDerivedFactors(),
    ]);
    return true;
  }

  if (req.method === 'GET' && pathname === '/factor-api/real-factor-results') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const rows = readFirstJsonFile([researchFactorResultsPath, realFactorResultsPath], []);
    sendJson(res, rows.slice(0, Number.isFinite(limit) ? limit : 100));
    return true;
  }

  if (req.method === 'GET' && pathname === '/factor-api/real-factor-summary') {
    sendJson(res, readCombinedFactorSummary());
    return true;
  }

  if (req.method === 'GET' && pathname === '/factor-api/indicator-fields') {
    sendJson(res, indicatorFields);
    return true;
  }

  if (req.method === 'GET' && pathname === '/factor-api/indicator-factor-definitions') {
    sendJson(res, indicatorFactorDefinitions);
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/definitions') {
    sendJson(res, readJsonFile(strategyDefinitionsPath, []));
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/live-signals') {
    sendJson(res, buildLiveStrategySignals());
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-strategy-export') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const pack = buildJoinQuantStrategyPackage(strategyId);
    if (!pack) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendJson(res, pack);
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-strategy-export.json') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const pack = buildJoinQuantStrategyPackage(strategyId);
    if (!pack) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-route.json`,
      `${JSON.stringify(pack, null, 2)}\n`,
      'application/json; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-strategy-export.csv') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const csv = buildJoinQuantStrategyCsv(strategyId);
    if (csv === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendCsv(res, `m-quant-strategy-${safeFilename(strategyId)}-joinquant.csv`, csv);
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-strategy-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantStrategyScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(res, `m-quant-strategy-${safeFilename(strategyId)}-joinquant.py`, script, 'text/x-python; charset=utf-8');
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-strategy-historical-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantStrategyHistoricalScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-joinquant-historical.py`,
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-volatility-regime-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantStrategyVolatilityRegimeScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-joinquant-volatility-regime.py`,
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-market-cap-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantStrategyMarketCapScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-joinquant-market-cap.py`,
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-volatility-size-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantStrategyVolatilitySizeScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-joinquant-volatility-size.py`,
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-trading-backtest-script.py') {
    const strategyId = url.searchParams.get('strategy') || 'core_volume_price_trend_v1';
    const script = buildJoinQuantTradingBacktestScript(strategyId);
    if (script === null) {
      sendError(res, `未知策略：${strategyId}`, 404);
      return true;
    }
    sendText(
      res,
      `m-quant-strategy-${safeFilename(strategyId)}-joinquant-trading-backtest.py`,
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-jq-quality-profit-liquidity-backtest-script.py') {
    const script = readFileSync(jqQualityProfitLiquidityBacktestScriptPath, 'utf8');
    sendText(
      res,
      'm-quant-jq-quality-profit-liquidity-strategy-backtest.py',
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-akshare-candidate-review-script.py') {
    const script = readFileSync(akshareCandidateReviewScriptPath, 'utf8');
    sendText(
      res,
      'm-quant-akshare-ohlcv-candidate-review.py',
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/research-api/pipeline') {
    sendJson(res, buildResearchPipeline());
    return true;
  }

  if (req.method === 'POST' && pathname === '/research-api/assistant') {
    const body = await readJsonBody(req);
    sendJson(res, buildAssistantResponse(body.message, body.factorId));
    return true;
  }

  if (req.method === 'POST' && pathname === '/factor-api/factors') {
    const body = await readJsonBody(req);

    if (!body.name || typeof body.ic !== 'number' || typeof body.rankIc !== 'number') {
      sendError(res, '因子名称、IC、Rank IC 是必填项');
      return true;
    }

    const factor = enrichFactor({
      category: body.category || 'custom',
      description: body.description || '自定义因子',
      direction: body.direction || 'positive',
      ic: body.ic,
      id: body.id || `factor_${Date.now()}`,
      longShortReturn: Number(body.longShortReturn || 0),
      name: body.name,
      rankIc: body.rankIc,
      window: Number(body.window || 20),
    });

    const nextState = {
      ...state,
      factors: [...state.factors, factor],
    };

    writeState(nextState);
    sendJson(res, factor, 201);
    return true;
  }

  if (req.method === 'GET' && pathname === '/backtest-api/equity') {
    sendJson(res, buildEquityCurve(state));
    return true;
  }

  if (req.method === 'GET' && pathname === '/backtest-api/research-status') {
    sendJson(res, buildBacktestResearchStatus());
    return true;
  }

  if (req.method === 'GET' && pathname === '/backtest-api/joinquant-factor-export') {
    const factor = url.searchParams.get('factor');
    if (factor && !findExportableBacktestFactor(factor)) {
      sendError(res, `未知因子：${factor}`, 404);
      return true;
    }
    sendJson(res, {
      generatedAt: new Date().toISOString(),
      dataPolicy: '该导出只包含当前真实截面因子值，不包含任何未来收益或回测结论。',
      factor: factor || 'all',
      rows: buildJoinQuantFactorRows({ factor }),
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/backtest-api/joinquant-factor-export.csv') {
    const factor = url.searchParams.get('factor');
    if (factor && !findExportableBacktestFactor(factor)) {
      sendError(res, `未知因子：${factor}`, 404);
      return true;
    }
    const filename = factor
      ? `m-quant-joinquant-${safeFilename(factor)}.csv`
      : 'm-quant-joinquant-all-factors.csv';
    sendCsv(res, filename, buildJoinQuantCsv({ factor }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/backtest-api/joinquant-factor-test-script.py') {
    const script = readFileSync(joinquantFactorTestScriptPath, 'utf8');
    sendText(
      res,
      'm-quant-joinquant-factor-test.py',
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'POST' && pathname === '/backtest-api/import-results') {
    const body = await readJsonBody(req);
    const importedAt = new Date().toISOString();
    const rawItems = Array.isArray(body)
      ? body
      : Array.isArray(body.records)
        ? body.records
        : Array.isArray(body.results)
          ? body.results
          : [body];
    const nextItems = rawItems
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        ...item,
        importedAt,
        source: item.source || body.source || 'joinquant',
      }));
    const nextResults = [...nextItems, ...readImportedBacktestResults()].slice(0, 300);
    writeFileSync(importedBacktestResultsPath, `${JSON.stringify(nextResults, null, 2)}\n`);
    sendJson(res, {
      message: `复测结果已导入 ${nextItems.length} 条；本平台只展示你外部实跑的真实结果。`,
      result: nextItems[0] || null,
      importedCount: nextItems.length,
      results: nextResults,
    }, 201);
    return true;
  }

  if (req.method === 'POST' && pathname === '/backtest-api/run') {
    const body = await readJsonBody(req);
    const nextState = {
      ...state,
      preferences: {
        ...state.preferences,
        ...body,
        feeRate: Number(body.feeRate ?? state.preferences.feeRate),
        slippage: Number(body.slippage ?? state.preferences.slippage),
      },
    };

    writeState(nextState);
    sendJson(res, {
      equity: buildEquityCurve(nextState),
      message: '模拟回测已完成',
      summary: buildSummary(nextState),
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/market-api/universes') {
    sendJson(res, getUniverses());
    return true;
  }

  return false;
}

function resolvePath(url) {
  const cleanPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const fullPath = normalize(join(root, requested));

  if (!fullPath.startsWith(root)) {
    return null;
  }

  return fullPath;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url || '/', `http://localhost:${port}`);
  const isApiRequest = pathname.startsWith('/api/')
    || pathname.startsWith('/factor-api/')
    || pathname.startsWith('/backtest-api/')
    || pathname.startsWith('/market-api/')
    || pathname.startsWith('/research-api/')
    || pathname.startsWith('/strategy-api/');

  if (isApiRequest) {
    try {
      const handled = await handleApi(req, res, pathname);

      if (!handled) {
        sendError(res, '接口不存在', 404);
      }
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : '服务异常', 500);
    }

    return;
  }

  const fullPath = resolvePath(req.url || '/');

  if (!fullPath || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentTypes[extname(fullPath)] || 'application/octet-stream',
  });

  createReadStream(fullPath).pipe(res);
}).listen(port, host, () => {
  console.log(`Quant factor platform is running at http://${host}:${port}`);
});
