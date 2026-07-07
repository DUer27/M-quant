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
const realFactorResultsPath =
  '/Users/Admin/Documents/Codex/2026-07-06/ke/outputs/real-factors/yiwan-real-factor-results.json';
const realFactorSummaryPath =
  '/Users/Admin/Documents/Codex/2026-07-06/ke/outputs/real-factors/yiwan-real-factor-summary.json';
const researchFactorResultsPath =
  '/Users/Admin/Documents/Codex/2026-07-06/ke/outputs/research-factor-pipeline/yiwan-research-factor-results.json';
const researchFactorSummaryPath =
  '/Users/Admin/Documents/Codex/2026-07-06/ke/outputs/research-factor-pipeline/yiwan-research-factor-summary.json';
const strategyDefinitionsPath = join(dataDir, 'strategy-definitions.json');
const importedBacktestResultsPath = join(dataDir, 'imported-backtest-results.json');

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
  const rows = readFirstJsonFile([researchFactorResultsPath, realFactorResultsPath], []);
  const sourceSummary = readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {});

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

function readImportedBacktestResults() {
  return readJsonFile(importedBacktestResultsPath, []);
}

function buildBacktestResearchStatus() {
  const rows = readFirstJsonFile([researchFactorResultsPath, realFactorResultsPath], []);
  const summary = readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {});
  const uniqueDates = new Set(rows.map((row) => dateOnly(row.date || row.stock_date)).filter(Boolean));
  const uniqueStocks = new Set(rows.map((row) => row.stock_code || row.code).filter(Boolean));
  const exportRows = buildJoinQuantFactorRows();
  const importedResults = readImportedBacktestResults();

  const canRunLocalValidatedBacktest = uniqueDates.size >= 60;

  return {
    generatedAt: new Date().toISOString(),
    dataPolicy: '复测中心只展示真实数据状态、导出包和外部实跑结果；没有未来收益时不生成IC、胜率、年化收益。',
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

function buildLiveStrategySignals() {
  const rows = readFirstJsonFile([researchFactorResultsPath, realFactorResultsPath], []);
  const summary = readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {});
  const sortedRows = rows
    .map((row) => ({
      ...row,
      decisionScore: toNumber(row.technical_composite),
      ...actionForRow(row),
    }))
    .sort((left, right) => right.decisionScore - left.decisionScore);

  const labelCounts = sortedRows.reduce((counts, row) => {
    const label = row.factor_label || '未标记';
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});

  const entryCandidates = sortedRows.filter((row) => row.action === '入池候选');
  const observationCandidates = sortedRows.filter((row) => row.action === '低仓观察');
  const riskRows = sortedRows.filter((row) => row.action === '暂不入场');
  const klineRows = sortedRows.filter((row) => toNumber(row.kline_event_score) > 0 && row.factor_label !== '风险观察');

  return {
    generatedAt: new Date().toISOString(),
    dataPolicy: '当前策略信号只使用本地真实截面因子；未使用未来收益，不输出胜率、IC或年化收益。',
    source: {
      file: summary.source_file || researchFactorResultsPath,
      inputKind: summary.input_kind || 'unknown',
      rows: sortedRows.length,
    },
    metrics: {
      executableStrategies: 1,
      partialStrategies: 1,
      blockedStrategies: 2,
      entryCandidates: entryCandidates.length,
      observationCandidates: observationCandidates.length,
      riskRows: riskRows.length,
      strongRows: labelCounts['强势候选'] || 0,
      riskWatchRows: labelCounts['风险观察'] || 0,
    },
    strategies: [
      {
        id: 'core_decision_strategy',
        name: '核心决策因子策略',
        status: 'computed',
        role: '当前主策略',
        objective: '用趋势质量、量价确认和拥挤风险决定入池、观察或过滤。',
        formula: 'technical_composite with trend_alignment + volume_price_confirmation - crowding_risk controls',
        entryRules: [
          '强势候选：核心分高、趋势不过伸、量价背离低、拥挤风险可控',
          '观察候选：核心分达标但仍有过伸、交易拥挤或确认不足',
          '风险观察：风险警报较多或量价背离偏高，默认不入场',
        ],
        riskControls: [
          '不使用未来收益',
          '不使用未采集资金字段伪造资金因子',
          '拥挤风险和量价背离优先级高于单日涨幅',
        ],
        candidateCount: entryCandidates.length,
      },
      {
        id: 'kline_assisted_strategy',
        name: 'K线辅助确认策略',
        status: 'partial_real_data',
        role: '辅助策略',
        objective: '用华福单根K线评分辅助核心决策因子，不独立生成收益结论。',
        formula: 'kline_event_score + core decision filters',
        entryRules: [
          'K线分数为正时只作为加分解释',
          '风险观察样本即使K线为正也不直接入场',
          '倒锤头、低成交量纺锤线仅识别不计分',
        ],
        riskControls: [
          '完整情绪加权K线仍等待240日价量共振历史',
          '不复制研报收益数据',
        ],
        candidateCount: klineRows.length,
      },
      {
        id: 'capital_follow_strategy',
        name: '资金跟随策略',
        status: 'requires_more_data',
        role: '待激活',
        objective: '等待暗盘、主力、散户资金数据后生成资金确认。',
        formula: 'apzj/mpzj/shzj + 3/5日暗盘强度',
        entryRules: ['需要资金页批量数据'],
        riskControls: ['当前不计算，不伪造资金信号'],
        candidateCount: 0,
      },
      {
        id: 'market_regime_strategy',
        name: '市场情绪仓位策略',
        status: 'requires_more_data',
        role: '待激活',
        objective: '等待市场宽度和大盘资金数据后控制仓位开关。',
        formula: 'market breadth + big money flow + panic/overheat state',
        entryRules: ['需要大盘宽度和资金数据'],
        riskControls: ['当前不计算，不伪造市场环境信号'],
        candidateCount: 0,
      },
    ],
    candidates: sortedRows.slice(0, 40).map((row) => ({
      action: row.action,
      actionTone: row.actionTone,
      close: row.close,
      code: row.stock_code || row.code,
      crowdingRisk: row.crowding_risk,
      decisionScore: row.decisionScore,
      divergenceRisk: row.volume_price_divergence_risk,
      extensionRisk: row.trend_extension_risk,
      factorLabel: row.factor_label,
      name: row.stock_name || row.name,
      positionHint: row.positionHint,
      reason: row.factor_reason || row.rule,
      rule: row.rule,
      technicalRank: row.technical_rank,
      trend: row.trend_alignment,
      volumePrice: row.volume_price_confirmation,
      warningCount: row.crowding_alert_count,
    })),
    unavailable: [
      {
        id: 'capital_follow_strategy',
        reason: '缺少暗盘/主力/散户资金明细，等待 date_batch 或资金页数据。',
      },
      {
        id: 'market_regime_strategy',
        reason: '缺少市场宽度、大盘资金和多日市场环境数据。',
      },
      {
        id: 'validated_backtest',
        reason: '缺少未来收益和多日价格序列，不能输出真实回测表现。',
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
    sendJson(res, state.risk);
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
    sendJson(res, readFirstJsonFile([researchFactorSummaryPath, realFactorSummaryPath], {}));
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

  if (req.method === 'POST' && pathname === '/backtest-api/import-results') {
    const body = await readJsonBody(req);
    const nextResult = {
      ...body,
      importedAt: new Date().toISOString(),
      source: body.source || 'joinquant',
    };
    const nextResults = [nextResult, ...readImportedBacktestResults()].slice(0, 50);
    writeFileSync(importedBacktestResultsPath, `${JSON.stringify(nextResults, null, 2)}\n`);
    sendJson(res, {
      message: '复测结果已导入；本平台只展示你外部实跑的真实结果。',
      result: nextResult,
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
