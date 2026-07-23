import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { basename, extname, join, normalize } from 'node:path';
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
const bundledPythonPath = '/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const pythonExecutable = existsSync(bundledPythonPath) ? bundledPythonPath : (process.env.PYTHON || 'python3');
const realFactorResultsPath = outputPath('real-factors', 'yiwan-real-factor-results.json');
const realFactorSummaryPath = outputPath('real-factors', 'yiwan-real-factor-summary.json');
const researchFactorResultsPath = outputPath('research-factor-pipeline', 'yiwan-research-factor-results.json');
const researchFactorSummaryPath = outputPath('research-factor-pipeline', 'yiwan-research-factor-summary.json');
const capitalFactorResultsPath = outputPath('capital-flow-factors', 'yiwan-capital-factor-results.json');
const capitalFactorSummaryPath = outputPath('capital-flow-factors', 'yiwan-capital-factor-summary.json');
const strategyDefinitionsPath = join(dataDir, 'strategy-definitions.json');
const importedBacktestResultsPath = join(dataDir, 'imported-backtest-results.json');
const importedTradeabilityReviewsPath = join(dataDir, 'imported-tradeability-reviews.json');
const importedCoreMediumSmallSignalReviewsPath = join(dataDir, 'imported-core-medium-small-signal-reviews.json');
const importedPaperWatchLedgerPath = join(dataDir, 'imported-paper-watch-ledger.json');
const positionStressSelectionPath = join(dataDir, 'position-stress-selection.json');
const strictFactorAuditPath = outputPath('factors', 'joinquant', 'm_quant_strict_factor_audit_20260708.json');
const akshareHistorySummaryPath = outputPath('sources', 'akshare', 'results', 'a_share_daily_history_summary.json');
const akshareDailyCacheDir = outputPath('sources', 'akshare', 'raw', 'a_share_daily');
const akshareCompletionAuditPath = outputPath('sources', 'akshare', 'results', 'a_share_all_completion_audit_20260723.csv');
const akshareCompletionAuditFallbackPath = outputPath('sources', 'akshare', 'results', 'a_share_all_completion_audit_20260720.csv');
const akshareOhlcvBacktestPath = outputPath('sources', 'akshare', 'results', 'akshare_ohlcv_factor_backtest_results.json');
const akshareStrategyValidationPath = outputPath('sources', 'akshare', 'results', 'akshare_strategy_candidate_validation.json');
const akshareFactorQualityAuditPath = outputPath('sources', 'akshare', 'results', 'akshare_factor_quality_audit.json');
const strategyMaturityAuditPath = outputPath('strategies', 'joinquant', 'strategy_maturity_audit_20260709.json');
const paperWatchRoutesPath = outputPath('strategies', 'joinquant', 'paper_watch_routes_20260709.json');
const paperWatchExecutionPackPath = outputPath('strategies', 'joinquant', 'paper_watch_execution_pack_20260709.json');
const paperWatchReadinessAuditPath = outputPath('strategies', 'joinquant', 'paper_watch_readiness_audit_20260709.json');
const paperWatchIndependenceAuditPath = outputPath('strategies', 'joinquant', 'paper_watch_independence_audit_20260709.json');
const paperWatchOperationsPackPath = outputPath('paper-watch', 'results', 'paper_watch_operations_pack_20260709.json');
const strategyMaturityMatrixPath = outputPath('paper-watch', 'results', 'strategy_maturity_matrix_20260710.json');
const tradeabilityReviewTaskPackPath = outputPath('paper-watch', 'results', 'tradeability_review_task_pack_20260710.json');
const coreMediumSmallPromotionTaskPackPath = outputPath('paper-watch', 'results', 'core_medium_small_promotion_task_pack_20260710.json');
const paperWatchDailyRefreshLatestPath = outputPath('paper-watch', 'results', 'paper_watch_daily_refresh_latest.json');
const bigQuantPaperWatchPackPath = outputPath('paper-watch', 'results', 'bigquant_paper_watch_test_pack_latest.json');
const joinQuantPaperWatchReportPath = outputPath('paper-watch', 'results', 'joinquant_paper_watch_report_latest.json');
const paperWatchPerformanceReportPath = outputPath('paper-watch', 'results', 'paper_watch_performance_report_latest.json');
const joinQuantResultsDir = outputPath('sources', 'joinquant', 'results');
const csi500LcrV1CandidateFallbackPath = outputPath('sources', 'joinquant', 'results', 'csi500_low_crowding_reversal_index_enhancement_v1_candidate_20260723-001813.json');
const positionStressLatestPath = outputPath('position-stress', 'results', 'position_stress_latest.json');
const positionStressResultsDir = outputPath('position-stress', 'results');
const positionStressScriptPath = outputPath('position-stress', 'scripts', 'position_stress_lab.py');
const positionStressExcelExportScriptPath = outputPath('position-stress', 'scripts', 'export_position_stress_excel.py');
const paperWatchDerivedScriptPaths = [
  outputPath('paper-watch', 'scripts', 'build_paper_watch_operations_pack.py'),
  outputPath('paper-watch', 'scripts', 'audit_independent_sleeve_candidates.py'),
  outputPath('paper-watch', 'scripts', 'build_core_medium_small_promotion_task_pack.py'),
  outputPath('paper-watch', 'scripts', 'build_strategy_maturity_matrix.py'),
  outputPath('paper-watch', 'scripts', 'build_tradeability_review_task_pack.py'),
];
const aksharePaperWatchReadinessAuditPath = outputPath('sources', 'akshare', 'results', 'akshare_paper_watch_readiness_audit_20260709.json');
const aksharePaperWatchExecutionPackPath = outputPath('sources', 'akshare', 'results', 'akshare_paper_watch_execution_pack_20260709.json');
const aksharePaperWatchLatestSignalPath = outputPath('sources', 'akshare', 'results', 'akshare_paper_watch_latest_signal_20260709.json');
const akshareRegimeSwitchPaperWatchPath = outputPath('sources', 'akshare', 'results', 'akshare_regime_switch_paper_watch_strategy_20260709.json');
const akshareRegimeSwitchRobustnessAuditPath = outputPath('sources', 'akshare', 'results', 'akshare_regime_switch_robustness_audit_20260709.json');
const indexEnhancementResearchPath = outputPath('sources', 'akshare', 'index_enhancement', 'results', 'index_enhancement_research_results.json');
const indexEnhancementFetchSummaryPath = outputPath('sources', 'akshare', 'index_enhancement', 'results', 'index_enhancement_fetch_summary.json');
const indexEnhancementReportPath = outputPath('_docs', 'akshare-index-enhancement-research.md');
const indexEnhancementTradePaths = {
  csi300_primary: outputPath('sources', 'akshare', 'index_enhancement', 'results', 'csi300_z_f_volume_confirmation_top30_core75_buf150_risk0_trades.csv'),
  csi300_conservative: outputPath('sources', 'akshare', 'index_enhancement', 'results', 'csi300_z_f_volume_confirmation_top40_core85_buf200_risk0_trades.csv'),
  csi500_primary: outputPath('sources', 'akshare', 'index_enhancement', 'results', 'csi500_z_f_volume_confirmation_top80_core75_buf200_risk0_trades.csv'),
  csi500_conservative: outputPath('sources', 'akshare', 'index_enhancement', 'results', 'csi500_z_f_volume_confirmation_top100_core85_buf200_risk0_trades.csv'),
};
const akshareFetchHistoryScriptPath = outputPath('sources', 'akshare', 'scripts', 'fetch_a_share_history.py');
const akshareGeneratePaperWatchSignalScriptPath = outputPath('sources', 'akshare', 'scripts', 'generate_akshare_paper_watch_signal.py');
const akshareLatestSignalTradeabilityReviewScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_akshare_latest_signal_tradeability_review_20260709.py');
const coreMediumSmallLatestSignalReviewScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_core_medium_small_latest_signal_review_20260710.py');
const jqQualityProfitLiquidityBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_jq_quality_profit_liquidity_strategy_backtest.py');
const capitalFollowBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_capital_follow_strategy_backtest.py');
const klineAssistedBacktestScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_emotion_weighted_kline_strategy_backtest.py');
const akshareCandidateReviewScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_akshare_ohlcv_candidate_review.py');
const csi500LowCrowdingReversalEnhancementScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_csi500_low_crowding_reversal_index_enhancement.py');
const csi500LowCrowdingReversalEnhancementNotebookScriptPath = outputPath('sources', 'joinquant', 'scripts', 'm_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py');
const joinquantFactorTestScriptPath = outputPath('joinquant', 'm_quant_joinquant_factor_test.py');
const requiredStrategyHorizons = [1, 5, 10, 20];
const primaryStrategyHorizons = [5, 10, 20];
const akshareLatestSignalTradeabilityReviewSource = 'joinquant_akshare_latest_signal_tradeability_review';
const coreMediumSmallLatestSignalReviewSource = 'joinquant_core_medium_small_latest_signal_review';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const seedState = {
  factors: [],
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

function readLatestCsi500LcrV1Candidate() {
  const prefix = 'csi500_low_crowding_reversal_index_enhancement_v1_candidate_';
  const candidates = existsSync(joinQuantResultsDir)
    ? readdirSync(joinQuantResultsDir)
      .filter((file) => file.startsWith(prefix) && file.endsWith('.json'))
      .sort((left, right) => right.localeCompare(left))
      .map((file) => join(joinQuantResultsDir, file))
    : [];
  return readFirstJsonFile([...candidates, csi500LcrV1CandidateFallbackPath], null);
}

function readFirstJsonFile(paths, fallback) {
  for (const path of paths) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  }

  return fallback;
}

function parseCsvRecords(path, limit = 80) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8').replace(/^\ufeff/, '').trim();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.slice(0, limit).map((line) => {
    const values = line.split(',');
    return headers.reduce((record, key, index) => {
      record[key] = values[index] ?? '';
      return record;
    }, {});
  });
}

function parseDelimitedCsv(text) {
  const lines = String(text || '').replace(/^\ufeff/, '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] ?? '';
      return record;
    }, {});
  });
}

function normalizeStockCode(value) {
  const match = String(value || '').match(/\d{6}/);
  return match ? match[0] : '';
}

function akshareDailyCachePathForCode(code) {
  const normalizedCode = normalizeStockCode(code);
  if (!normalizedCode) return null;
  return join(akshareDailyCacheDir, `${normalizedCode}.csv`);
}

let akshareDailyCacheIndex = null;

function readAkshareDailyRows(code) {
  const path = akshareDailyCachePathForCode(code);
  if (!path || !existsSync(path)) return [];
  return parseDelimitedCsv(readFileSync(path, 'utf8'))
    .map((row) => ({
      amount: toNumber(row.amount, null),
      close: toNumber(row.close, null),
      code: normalizeStockCode(row.code || code),
      date: row.date,
      high: toNumber(row.high, null),
      low: toNumber(row.low, null),
      name: row.name || '',
      open: toNumber(row.open, null),
      security: row.security || jqSecurityCode(row.code || code),
      source: row.source || '',
      volume: toNumber(row.volume, null),
    }))
    .filter((row) => row.date && Number.isFinite(row.open) && Number.isFinite(row.close) && Number.isFinite(row.high) && Number.isFinite(row.low))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function buildAkshareDailyCacheIndex() {
  if (akshareDailyCacheIndex) return akshareDailyCacheIndex;
  const byCode = new Map();
  const auditPath = existsSync(akshareCompletionAuditPath) ? akshareCompletionAuditPath : akshareCompletionAuditFallbackPath;
  if (existsSync(auditPath)) {
    parseDelimitedCsv(readFileSync(auditPath, 'utf8')).forEach((row) => {
      const code = normalizeStockCode(row.code);
      if (!code) return;
      byCode.set(code, {
        code,
        firstDate: row.first_date || '',
        lastDate: row.last_date || '',
        name: row.name || '',
        rowCount: toNumber(row.rows, 0),
        status: row.status || '',
      });
    });
  }
  if (existsSync(akshareDailyCacheDir)) {
    readdirSync(akshareDailyCacheDir)
      .filter((name) => /^\d{6}\.csv$/.test(name))
      .forEach((file) => {
        const code = file.slice(0, 6);
        const current = byCode.get(code) || { code, firstDate: '', lastDate: '', name: '', rowCount: 0, status: '' };
        if (!current.name || !current.rowCount || !current.lastDate) {
          const rows = readAkshareDailyRows(code);
          const first = rows[0] || {};
          const last = rows.at(-1) || {};
          byCode.set(code, {
            ...current,
            firstDate: current.firstDate || first.date || '',
            lastDate: current.lastDate || last.date || '',
            name: current.name || last.name || first.name || '',
            rowCount: current.rowCount || rows.length,
          });
        }
      });
  }
  akshareDailyCacheIndex = [...byCode.values()].sort((left, right) => left.code.localeCompare(right.code));
  return akshareDailyCacheIndex;
}

function readAkshareDailyKlineItem(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return null;
  const normalizedCode = normalizeStockCode(term);
  const index = buildAkshareDailyCacheIndex();
  const match = normalizedCode
    ? index.find((item) => item.code === normalizedCode)
    : index.find((item) => [item.code, item.name].filter(Boolean).join(' ').toLowerCase().includes(term));
  if (!match) return null;
  const rows = readAkshareDailyRows(match.code);
  if (!rows.length) return null;
  const first = rows[0] || {};
  const last = rows.at(-1) || {};
  return {
    code: match.code,
    dataSource: 'akshare_local_cache',
    firstDate: first.date || match.firstDate || '',
    latestClose: last.close,
    latestDate: last.date || match.lastDate || '',
    latestScore: null,
    name: match.name || last.name || first.name || match.code,
    rowCount: rows.length,
    rows,
    security: last.security || first.security || jqSecurityCode(match.code),
  };
}

function relativeOutputPath(path) {
  if (!path) return null;
  return normalize(path).replace(`${normalize(projectRoot)}/`, '');
}

function readIndexEnhancementTrades() {
  return Object.fromEntries(Object.entries(indexEnhancementTradePaths).map(([key, path]) => [key, {
    path: relativeOutputPath(path),
    rows: parseCsvRecords(path, 80),
  }]));
}

function formatRatioPercent(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${(number * 100).toFixed(digits)}%`;
}

const indexEnhancementFactorDefinitions = {
  index_growth_medium_trend: {
    category: 'trend',
    direction: 'positive',
    displayName: '指数增长中期趋势',
    fields: ['ret_20', 'ret_60'],
    formula: '中期收益趋势，惩罚短期过热后的排名分数。',
    usage: '趋势增长策略核心因子',
  },
  index_growth_long_trend: {
    category: 'trend',
    direction: 'positive',
    displayName: '指数增长长期趋势',
    fields: ['ret_60', 'ret_120', 'vol_60'],
    formula: '长期收益趋势，扣除中期波动后的排名分数。',
    usage: '趋势增长策略核心因子',
  },
  index_growth_volume_price_confirmation: {
    category: 'price_volume',
    direction: 'positive',
    displayName: '指数增长量价确认',
    fields: ['ret_20', 'volume_ma_20', 'volume_ma_60'],
    formula: '20日价格变化与20/60日成交量结构同向时加分。',
    usage: '趋势增长策略确认因子',
  },
  index_growth_close_strength: {
    category: 'price_volume',
    direction: 'positive',
    displayName: '指数增长收盘强度',
    fields: ['open', 'high', 'low', 'close'],
    formula: '收盘价在当日区间位置越强，分数越高。',
    usage: '趋势增长策略入场质量因子',
  },
  index_growth_short_reversal: {
    category: 'reversal',
    direction: 'positive',
    displayName: '指数增长短期反转',
    fields: ['ret_5', 'ret_10'],
    formula: '短期跌幅越大，修复分数越高。',
    usage: '稳健增长策略修复因子',
  },
  index_growth_low_volatility: {
    category: 'risk',
    direction: 'positive',
    displayName: '指数增长低波动',
    fields: ['vol_20', 'vol_60'],
    formula: '近期波动越低，分数越高。',
    usage: '稳健增长策略风险因子',
  },
  index_growth_volume_stability: {
    category: 'liquidity',
    direction: 'positive',
    displayName: '指数增长量能稳定',
    fields: ['volume_ma_20', 'volume_ma_60'],
    formula: '20日成交量波动越低，分数越高。',
    usage: '稳健增长策略成交稳定因子',
  },
  index_growth_drawdown_control: {
    category: 'risk',
    direction: 'positive',
    displayName: '指数增长回撤控制',
    fields: ['drawdown_120'],
    formula: '相对阶段高点回撤越可控，分数越高。',
    usage: '稳健增长策略回撤因子',
  },
  index_growth_gap_risk_control: {
    category: 'risk',
    direction: 'positive',
    displayName: '指数增长跳空风险控制',
    fields: ['open', 'close'],
    formula: '近20日跳空幅度越小，分数越高。',
    usage: '稳健增长策略隔夜风险因子',
  },
  index_growth_anti_crowding: {
    category: 'risk',
    direction: 'positive',
    displayName: '指数增长反拥挤',
    fields: ['turnover', 'volume', 'return'],
    formula: '短期涨幅、放量、价格偏离和换手越不拥挤，分数越高。',
    usage: '趋势增长和稳健增长共同过滤因子',
  },
};

function findIndexEnhancementPortfolio(research, spec) {
  const rows = Array.isArray(research?.portfolios) ? research.portfolios : [];
  return rows.find((row) => (
    row.dataset === spec.dataset
    && row.score_col === spec.scoreCol
    && Number(row.horizon) === Number(spec.horizon)
    && Number(row.top_n) === Number(spec.topN)
    && Number(row.core_weight) === Number(spec.coreWeight)
    && Number(row.buffer_multiple) === Number(spec.bufferMultiple)
    && Number(row.risk_penalty || 0) === Number(spec.riskPenalty || 0)
  ));
}

function normalizeIndexEnhancementPortfolio(row, fallback) {
  const metrics = row?.metrics || {};
  const active = metrics.active || {};
  const strategy = metrics.strategy || {};
  const benchmark = metrics.benchmark || {};
  return {
    activeAnnualReturn: active.annual_return ?? fallback.activeAnnualReturn,
    activeMaxDrawdown: active.max_drawdown ?? fallback.activeMaxDrawdown,
    activeReturn: active.total_return ?? fallback.activeReturn,
    activeSharpe: active.sharpe ?? fallback.activeSharpe,
    avgTurnover: metrics.avg_turnover ?? fallback.avgTurnover,
    benchmarkReturn: benchmark.total_return ?? fallback.benchmarkReturn,
    bufferMultiple: row?.buffer_multiple ?? fallback.bufferMultiple,
    coreWeight: row?.core_weight ?? fallback.coreWeight,
    dataset: row?.dataset ?? fallback.dataset,
    label: fallback.label,
    scoreCol: row?.score_col ?? fallback.scoreCol,
    stabilityScore: row?.stability_score ?? fallback.stabilityScore,
    strategyReturn: strategy.total_return ?? fallback.strategyReturn,
    tag: fallback.tag,
    topN: row?.top_n ?? fallback.topN,
    tradeFile: row?.trade_path || fallback.tradeFile,
    yearlyActive: (row?.yearly || fallback.yearlyActive || []).map((item) => ({
      year: item.year,
      activeReturn: item.active_return ?? item.activeReturn,
    })),
  };
}

function buildIndexEnhancementReport() {
  const research = readJsonFile(indexEnhancementResearchPath, null);
  const fetchSummary = readJsonFile(indexEnhancementFetchSummaryPath, null);
  const reportExists = existsSync(indexEnhancementReportPath);
  const tradeFiles = readIndexEnhancementTrades();
  const portfolios = Array.isArray(research?.portfolio_top) ? research.portfolio_top : [];
  const primary = portfolios.slice(0, 1).map((row) => normalizeIndexEnhancementPortfolio(row, {
    dataset: row.dataset,
    label: row.score_col,
    scoreCol: row.score_col,
    tag: 'strict_factor_gate_passed',
  }));
  const conservative = portfolios.slice(1, 3).map((row) => normalizeIndexEnhancementPortfolio(row, {
    dataset: row.dataset,
    label: row.score_col,
    scoreCol: row.score_col,
    tag: 'strict_factor_gate_passed_alternative',
  }));
  const gateAudit = Array.isArray(research?.factor_gate_audit) ? research.factor_gate_audit : [];
  const passedGateCount = gateAudit.filter((row) => row.gate_passed).length;
  const topFactors = (Array.isArray(research?.factor_ic_top) ? research.factor_ic_top : []).slice(0, 5);
  const failedItems = passedGateCount
    ? []
    : [
      `严格因子门禁通过数量 ${passedGateCount}/${gateAudit.length || 0}`,
      '本轮覆盖 1/5/10/20 日逐日 RankIC 和日度 Top20%-Bottom20% 多空收益检查',
      '复合评分在 20 日主周期未同时满足 RankIC、RankIC t、多空收益和多空胜率',
      '未通过因子门禁，因此不生成准入型策略组合回测',
      '本地 AkShare 数据缺少真实市值、行业、换手、停牌涨跌停和指数权重，仍需 JoinQuant 原生复核',
    ];
  return {
    dataPolicy: research?.data_policy || '只展示本地 AkShare 静态成分、等权基准、真实 OHLCV 研究结果；不标记为准模拟盘，不生成新收益。',
    factorDefinitions: indexEnhancementFactorDefinitions,
    fetchSummary,
    gate: {
      decision: passedGateCount ? 'strict_factor_gate_passed' : 'strict_factor_gate_not_passed',
      label: passedGateCount ? '严格因子门禁已有通过项' : '严格因子门禁未通过',
      passed: passedGateCount > 0,
      failedItems,
      nextActions: [
        '保留本轮严格因子结果，禁止使用旧的强制绕门禁组合收益作为准入证据',
        '若继续研究，先重新设计评分方向和组合权重，让多空收益与 RankIC 同向',
        '在 JoinQuant 中补历史成分、市值/行业/流动性、停牌涨跌停和交易成本复核',
        '只有因子门禁通过后，才允许生成 5 日调仓交易回测',
      ],
    },
    factorBacktestPolicy: research?.factor_backtest_policy || null,
    factorGateAudit: gateAudit,
    generatedAt: research?.generated_at || null,
    primary,
    conservative,
    reportPath: reportExists ? relativeOutputPath(indexEnhancementReportPath) : null,
    researchAvailable: Boolean(research),
    researchPath: relativeOutputPath(indexEnhancementResearchPath),
    strategyBacktestPolicy: research?.strategy_backtest_policy || null,
    topFactors,
    trades: tradeFiles,
  };
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

function sendFileDownload(res, filename, path, contentType) {
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Type': contentType,
  });
  createReadStream(path).pipe(res);
}

function sendError(res, message, status = 400) {
  sendJson(res, { error: message }, status);
}

async function readJsonBody(req) {
  const text = await readTextBody(req);
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

async function readTextBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return '';
  }

  return Buffer.concat(chunks).toString('utf8');
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
  const aksharePaperWatchReadinessAudit = readJsonFile(aksharePaperWatchReadinessAuditPath, {});
  const aksharePaperWatchExecutionPack = readJsonFile(aksharePaperWatchExecutionPackPath, {});
  const aksharePaperWatchLatestSignal = readJsonFile(aksharePaperWatchLatestSignalPath, {});
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
    aksharePaperWatchReadyCount: Number(aksharePaperWatchReadinessAudit.decision_counts?.ready_local_paper_watch || 0),
    aksharePaperWatchExecutableCount: Number(aksharePaperWatchExecutionPack.paper_watch_route_count || 0),
    aksharePaperWatchOpenAllowedCount: Number(aksharePaperWatchLatestSignal.open_allowed_count || 0),
    aksharePaperWatchRecommendedCount: Number(aksharePaperWatchReadinessAudit.recommended_route_count || 0),
    aksharePaperWatchPolicy: aksharePaperWatchReadinessAudit.data_policy || '',
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
        ? `${coverage.akshareStrategyValidationPolicy} 已做候选稳定性验证 ${coverage.akshareStrategyValidationCandidates} 条；严格模拟观察审计通过 ${coverage.aksharePaperWatchReadyCount} 条，其中 ${coverage.aksharePaperWatchExecutableCount} 条进入本地受控执行包，最新信号 ${coverage.aksharePaperWatchOpenAllowedCount} 条允许开仓观察。`
        : '尚未对 AkShare 本地强分层策略做候选稳定性验证。',
      limit: 2,
      name: 'AkShare候选复核',
      nextAction: coverage.aksharePaperWatchReadyCount
        ? '允许作为本地数据源独立的受控模拟观察候选；继续补 JoinQuant 复核、行业暴露、市值与涨跌停约束。'
        : '先做年度分段、样本外切分和成本后净值稳定性验证。',
      status: coverage.aksharePaperWatchReadyCount >= 1 ? 'ready' : (coverage.akshareStrategyValidationReviewCandidates >= 2 ? 'watch' : 'blocked'),
      value: coverage.aksharePaperWatchReadyCount || coverage.akshareStrategyValidationReviewCandidates,
      valueText: coverage.akshareStrategyValidationCandidates
        ? `${coverage.aksharePaperWatchOpenAllowedCount}触发/${coverage.aksharePaperWatchExecutableCount}执行`
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
        ? `已审计 ${coverage.strategyMaturityStrategyCount} 个 JoinQuant 实测策略：${coverage.strategyMaturityControlledCount} 个只允许分层路线模拟观察，${coverage.strategyMaturityRejectedCount} 个暂缓；JoinQuant 配置 ${coverage.firstPaperWatchRouteCount} 条，AkShare 本地严格就绪 ${coverage.aksharePaperWatchReadyCount} 条。`
        : '尚未生成 JoinQuant 策略成熟度审计。',
      limit: 2,
      name: '策略成熟度审计',
      nextAction: coverage.firstPaperWatchRouteCount >= 2 || coverage.aksharePaperWatchReadyCount >= 1
        ? '首批只允许配置文件和严格审计中的受控路线进入模拟观察；不得放开整策略或未通过分层。'
        : '继续导入 JoinQuant 交易净值、分层和成本结果，直到至少两条不同策略路线通过。',
      status: coverage.firstPaperWatchRouteCount >= 2 || coverage.aksharePaperWatchReadyCount >= 1 ? 'ready' : (coverage.strategyMaturityStrategyCount ? 'watch' : 'blocked'),
      value: coverage.firstPaperWatchRouteCount + coverage.aksharePaperWatchReadyCount,
      valueText: coverage.paperWatchStatus === 'ready_for_controlled_paper_watch'
        ? `${coverage.firstPaperWatchRouteCount + coverage.aksharePaperWatchReadyCount}条路线`
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
  const independenceAudit = readJsonFile(paperWatchIndependenceAuditPath, {});
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, null);
  const paperWatchLedger = readImportedPaperWatchLedger();
  const akshareReadinessAudit = readJsonFile(aksharePaperWatchReadinessAuditPath, {});
  const akshareExecutionPack = readJsonFile(aksharePaperWatchExecutionPackPath, {});
  const akshareLatestSignal = readJsonFile(aksharePaperWatchLatestSignalPath, {});
  const akshareRegimeSwitch = readJsonFile(akshareRegimeSwitchPaperWatchPath, null);
  const akshareRegimeSwitchRobustness = readJsonFile(akshareRegimeSwitchRobustnessAuditPath, null);
  const strategyMaturityMatrix = readJsonFile(strategyMaturityMatrixPath, null);
  const tradeabilityReviewTaskPack = readJsonFile(tradeabilityReviewTaskPackPath, null);
  const coreMediumSmallPromotionTaskPack = readJsonFile(coreMediumSmallPromotionTaskPackPath, null);
  const dailyRefresh = readJsonFile(paperWatchDailyRefreshLatestPath, null);
  const bigQuantTestPack = readJsonFile(bigQuantPaperWatchPackPath, null);
  const joinQuantPaperWatchReport = readJsonFile(joinQuantPaperWatchReportPath, null);
  const paperWatchPerformanceReport = readJsonFile(paperWatchPerformanceReportPath, null);
  const tradeabilityReviews = readImportedTradeabilityReviews();
  const readinessRecommendedRoutes = Array.isArray(readinessAudit.recommended_routes)
    ? readinessAudit.recommended_routes
    : [];
  const akshareRecommendedRoutes = Array.isArray(akshareReadinessAudit.recommended_routes)
    ? akshareReadinessAudit.recommended_routes
    : [];
  const routes = readinessRecommendedRoutes.length
    ? readinessRecommendedRoutes
    : Array.isArray(pack.routes)
      ? pack.routes
      : [];
  const akshareRoutes = akshareRecommendedRoutes.map((route) => ({
    ...route,
    evidence_system: 'AkShare本地OHLCV',
    is_local_backtest: true,
    sample_dates: route.sample_trades,
    readiness_decision: route.decision,
    readiness_reason: route.decision_reason,
  }));
  const executionRoutes = Array.isArray(executionPack.routes) ? executionPack.routes : [];
  const akshareExecutionRoutes = Array.isArray(akshareExecutionPack.routes) ? akshareExecutionPack.routes : [];
  const readinessRoutes = Array.isArray(readinessAudit.routes) ? readinessAudit.routes : [];
  const akshareReadinessRoutes = Array.isArray(akshareReadinessAudit.routes) ? akshareReadinessAudit.routes : [];
  const executionByRoute = new Map(executionRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_layer || ''}`,
    route,
  ]));
  const readinessByRoute = new Map(readinessRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_layer || ''}`,
    route,
  ]));
  const akshareReadinessByRoute = new Map(akshareReadinessRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.layer || ''}`,
    route,
  ]));
  const akshareExecutionByRoute = new Map(akshareExecutionRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_layer || ''}`,
    route,
  ]));
  const akshareSignalRoutes = Array.isArray(akshareLatestSignal.routes) ? akshareLatestSignal.routes : [];
  const akshareSignalByRoute = new Map(akshareSignalRoutes.map((route) => [
    `${route.strategy_id || ''}::${route.allowed_market_regime || ''}::${route.allowed_liquidity_bucket || ''}`,
    route,
  ]));
  const enrichedRoutes = routes.map((route) => ({
    ...route,
    evidence_system: route.evidence_system || 'JoinQuant',
    execution: executionByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || null,
    readiness: readinessByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || null,
  })).concat(akshareRoutes.map((route) => {
    const signal = akshareSignalByRoute.get(`${route.strategy_id || ''}::${route.market_regime || ''}::${route.liquidity_bucket || ''}`) || null;
    const tradeabilityReview = signal
      ? latestTradeabilityReviewFor(tradeabilityReviews, route.strategy_id, signal.signal_date)
      : null;
    return {
      ...route,
      execution: akshareExecutionByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || null,
      readiness: akshareReadinessByRoute.get(`${route.strategy_id || ''}::${route.layer || ''}`) || route,
      signal,
      tradeability_review: tradeabilityReview,
    };
  }));
  const readinessCounts = readinessAudit.decision_counts || {};
  const akshareReadinessCounts = akshareReadinessAudit.decision_counts || {};
  const recommendedReadinessCounts = enrichedRoutes.reduce((acc, route) => {
    const decision = route.readiness?.decision || route.readiness_decision || 'unknown';
    acc[decision] = (acc[decision] || 0) + 1;
    return acc;
  }, {});
  const readyRouteCount = Number(recommendedReadinessCounts.ready_controlled_paper_watch || 0)
    + Number(recommendedReadinessCounts.ready_local_paper_watch || 0);
  const conditionalRouteCount = Number(recommendedReadinessCounts.conditional_paper_watch || 0)
    + Number(recommendedReadinessCounts.conditional_local_paper_watch || 0);
  const paperWatchConsole = buildPaperWatchConsole({
    enrichedRoutes,
    operationsPack,
    paperWatchLedger,
    tradeabilityReviews,
  });
  return {
    generatedAt: pack.generated_at || '',
    dataPolicy: [
      pack.data_policy || '只展示已通过真实回测审计的受控模拟观察路线。',
      akshareReadinessAudit.data_policy || '',
    ].filter(Boolean).join('；'),
    executionDataPolicy: executionPack.data_policy || '',
    executionStatus: executionPack.status || 'not_ready',
    globalControls: [
      ...(Array.isArray(executionPack.global_controls) ? executionPack.global_controls : []),
      ...(Array.isArray(akshareExecutionPack.global_controls) ? akshareExecutionPack.global_controls : []),
    ],
    localBacktest: {
      dataPolicy: akshareReadinessAudit.data_policy || '',
      decisionCounts: akshareReadinessCounts,
      executionDataPolicy: akshareExecutionPack.data_policy || '',
      executionStatus: akshareExecutionPack.status || 'not_ready',
      latestSignalDate: akshareLatestSignal.signal_date || '',
      latestSignalOpenAllowedCount: Number(akshareLatestSignal.open_allowed_count || 0),
      latestTradeabilityReview: latestTradeabilityReviewFor(
        tradeabilityReviews,
        'ak_mean_reversion_quality_combo',
        akshareLatestSignal.signal_date || '',
      ),
      regimeSwitch: akshareRegimeSwitch,
      regimeSwitchRobustness: akshareRegimeSwitchRobustness,
      paperWatchRouteCount: Number(akshareExecutionPack.paper_watch_route_count || 0),
      recommendedRouteCount: Number(akshareReadinessAudit.recommended_route_count || akshareRecommendedRoutes.length || 0),
      tradeabilityReviewScriptEndpoint: '/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py',
      source: akshareReadinessAudit.source || '',
    },
    independence: {
      decision: independenceAudit.decision || '',
      decisionName: independenceAudit.decision_name || '',
      deploymentMode: independenceAudit.deployment_mode || '',
      independentCapitalSleeves: Number(independenceAudit.independent_capital_sleeves || 0),
      localIndependentRouteCount: akshareRecommendedRoutes.length,
      overlaps: Array.isArray(independenceAudit.overlaps) ? independenceAudit.overlaps : [],
      summary: [
        independenceAudit.summary || '',
        akshareRecommendedRoutes.length
          ? `另有 ${akshareRecommendedRoutes.length} 条 AkShare 本地真实OHLCV路线通过严格审计，证据来源独立于 JoinQuant，但仍需按本地股票池和数据源边界模拟观察。`
          : '',
      ].filter(Boolean).join(' '),
    },
    operationsPack: operationsPack
      ? {
        ...operationsPack,
        importedLedgerCount: paperWatchLedger.length,
        latestLedgerRows: paperWatchLedger.slice(0, 5),
      }
      : null,
    paperWatchConsole,
    maturityMatrix: strategyMaturityMatrix,
    tradeabilityReviewTaskPack,
    coreMediumSmallPromotionTaskPack,
    bigQuantTestPack,
    joinQuantPaperWatchReport,
    paperWatchPerformanceReport,
    dailyRefresh,
    requiredControls: Array.isArray(pack.required_controls) ? pack.required_controls : [],
    readinessCounts: recommendedReadinessCounts,
    readinessDecisionCounts: readinessCounts,
    readinessDataPolicy: readinessAudit.data_policy || '',
    readinessStatus: readyRouteCount
      ? 'ready_controlled_paper_watch'
      : conditionalRouteCount
        ? 'conditional_paper_watch'
        : readinessCounts.conditional_recheck_required
          ? 'conditional_recheck_required'
          : 'not_ready',
    readyRouteCount,
    conditionalRouteCount,
    routeCount: Number(enrichedRoutes.length || readinessRecommendedRoutes.length || pack.route_count || 0),
    routes: enrichedRoutes,
    selectionPolicy: pack.selection_policy || '',
    status: pack.status || 'not_ready',
  };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function latestByDate(rows) {
  return [...rows].sort((left, right) => {
    const rightKey = `${right.date || ''} ${right.importedAt || ''}`;
    const leftKey = `${left.date || ''} ${left.importedAt || ''}`;
    return rightKey.localeCompare(leftKey);
  })[0] || null;
}

function averageFinite(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function minFinite(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
}

function selectedCodesList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[|,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function csi500LcrV1LatestSelectedCodes() {
  const candidate = readLatestCsi500LcrV1Candidate() || {};
  return selectedCodesList(candidate.latest_selection?.codes || candidate.latest_selection?.selected_codes);
}

function paperWatchActivityStatus(metrics) {
  if (!metrics.ledgerCount) {
    return {
      key: 'waiting_observation_sample',
      name: '待样本记录',
      tone: 'pending',
      reason: '还没有导入真实准模拟盘观察账本，只能看运行包准入状态。',
    };
  }
  if (Number.isFinite(metrics.worstDrawdown) && metrics.worstDrawdown <= -0.08) {
    return {
      key: 'pause_review',
      name: '回撤复核',
      tone: 'watch',
      reason: '观察账本中的滚动回撤已触发复核阈值。',
    };
  }
  if (metrics.pauseCount > 0 || ['pause_new_entry', 'close_only'].includes(metrics.latestAction)) {
    return {
      key: 'paused',
      name: '暂停观察',
      tone: 'watch',
      reason: '最近账本或历史记录出现暂停/只平不开动作。',
    };
  }
  if (metrics.observedDays < 5) {
    return {
      key: 'warming_up',
      name: '样本积累',
      tone: 'pending',
      reason: '观察天数少于5天，先记录信号活性，不做升级判断。',
    };
  }
  if (Number.isFinite(metrics.avgPeriodReturn) && metrics.avgPeriodReturn > 0 && metrics.openAllowedCount > 0) {
    return {
      key: 'active',
      name: '活性良好',
      tone: 'good',
      reason: '已有多日观察记录，平均观察收益为正且未触发暂停。',
    };
  }
  return {
    key: 'watch',
    name: '继续观察',
    tone: 'pending',
    reason: '已有观察样本，但收益或动作状态还不足以升级。',
  };
}

function buildPaperWatchConsole({ enrichedRoutes, operationsPack, paperWatchLedger }) {
  const sleeves = Array.isArray(operationsPack?.capital_sleeves) ? operationsPack.capital_sleeves : [];
  const ledger = Array.isArray(paperWatchLedger) ? paperWatchLedger : [];
  const routeByStrategy = new Map((Array.isArray(enrichedRoutes) ? enrichedRoutes : []).map((route) => [
    route.strategy_id,
    route,
  ]));
  const signalDate = sleeves
    .map((sleeve) => sleeve.latest_signal?.signal_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';
  const sleeveRows = sleeves.map((sleeve) => {
    const rows = ledger.filter((row) => row?.sleeve_id === sleeve.sleeve_id);
    const latestLedger = latestByDate(rows);
    const latestSignal = sleeve.latest_signal || {};
    const route = routeByStrategy.get(sleeve.strategy_id) || {};
    const tradeabilityReview = sleeve.tradeability_review || route.tradeability_review || null;
    const observedDays = new Set(rows.map((row) => dateOnly(row.date)).filter(Boolean)).size;
    const openAllowedCount = rows.filter((row) => row.paper_action === 'open_allowed').length;
    const pauseCount = rows.filter((row) => ['pause_new_entry', 'close_only'].includes(row.paper_action)).length;
    const avgPeriodReturn = averageFinite(rows.map((row) => row.period_return));
    const avgBenchmarkReturn = averageFinite(rows.map((row) => row.benchmark_return));
    const worstDrawdown = minFinite(rows.map((row) => row.rolling_drawdown));
    const latestAction = latestLedger?.paper_action || (sleeve.can_start_observation ? 'open_allowed' : 'record_only');
    const selectedCodes = selectedCodesList(latestSignal.selected_codes || latestLedger?.selected_codes);
    const metrics = {
      avgBenchmarkReturn,
      avgPeriodReturn,
      ledgerCount: rows.length,
      latestAction,
      observedDays,
      openAllowedCount,
      pauseCount,
      worstDrawdown,
    };
    const activity = paperWatchActivityStatus(metrics);
    const canOpen = Boolean(sleeve.can_start_observation && latestSignal.action !== 'record_only');
    const gateStatus = sleeve.operational_status || latestLedger?.gate_status || 'unknown';
    const isController = sleeve.role === 'primary_controller' && selectedCodes.length === 0;
    return {
      activity,
      avgBenchmarkReturn,
      avgPeriodReturn,
      baseline: sleeve.baseline || null,
      blockedReasons: Array.isArray(sleeve.blocked_reasons) ? sleeve.blocked_reasons : [],
      canStartObservation: Boolean(sleeve.can_start_observation),
      candidateCount: isController ? null : Number(latestSignal.candidate_count ?? latestLedger?.candidate_count ?? 0),
      dataPolicy: sleeve.data_policy || '',
      gateStatus,
      latestAction,
      latestLedger,
      latestSignal,
      ledgerCount: rows.length,
      nextAction: sleeve.next_action || (
        canOpen
          ? '按账本模板记录下一交易日真实信号、计划仓位和后续收益。'
          : '保持 record_only，补齐阻塞原因中的复核证据。'
      ),
      observedDays,
      openAllowedCount,
      pauseCount,
      role: sleeve.role || '',
      selectedCodes,
      selectedCount: isController ? null : Number(latestSignal.selected_count ?? latestLedger?.selected_count ?? selectedCodes.length),
      signalDate: latestSignal.signal_date || latestLedger?.date || '',
      sleeveId: sleeve.sleeve_id || '',
      strategyId: sleeve.strategy_id || '',
      strategyName: sleeve.strategy_name || sleeve.strategy_id || '',
      tradeabilityReview,
      worstDrawdown,
    };
  });
  const readySleeves = sleeveRows.filter((row) => row.canStartObservation);
  const openSignalRows = sleeveRows.filter((row) => row.canStartObservation && row.latestAction === 'open_allowed');
  const blockedRows = sleeveRows.filter((row) => !row.canStartObservation);
  const observedDays = new Set(ledger.map((row) => dateOnly(row.date)).filter(Boolean)).size;
  const activeRows = sleeveRows.filter((row) => row.activity.key === 'active');
  const warmingRows = sleeveRows.filter((row) => row.activity.key === 'warming_up');
  const pauseRows = sleeveRows.filter((row) => ['paused', 'pause_review'].includes(row.activity.key));
  return {
    source: 'm_quant_paper_watch_console',
    generatedAt: new Date().toISOString(),
    dataPolicy: '准模拟盘观察台只汇总运行包、最新信号、交易可行性复核和用户导入账本；没有导入的未来表现不会自动生成。',
    signalDate,
    status: readySleeves.length ? 'paper_watch_ready' : 'not_ready',
    statusName: readySleeves.length ? '可开始准模拟盘观察' : '等待准入证据',
    metrics: {
      activeSleeveCount: activeRows.length,
      blockedSleeveCount: blockedRows.length,
      importedLedgerCount: ledger.length,
      openSignalCount: openSignalRows.length,
      pauseSleeveCount: pauseRows.length,
      readySleeveCount: readySleeves.length,
      sleeveCount: sleeveRows.length,
      warmingSleeveCount: warmingRows.length,
      observedDays,
    },
    nextActions: [
      ledger.length
        ? '继续每天导入真实观察账本，累计至少20个交易日样本外表现。'
        : '先下载账本模板，按最新信号导入第一天准模拟盘观察记录。',
      '只记录当时真实可见信号，不回填事后挑选结果。',
      '若触发候选不足、不可交易、回撤超限或集中度异常，记录 pause_new_entry 或 close_only。',
    ],
    upgradeRules: [
      '至少20个交易日真实观察账本。',
      '观察期平均 period_return 为正，且相对 benchmark_return 有稳定优势。',
      '滚动回撤未触发暂停阈值，且没有连续多日候选不足。',
      '候选股票可交易数量稳定，行业和市值暴露不过度集中。',
    ],
    pauseRules: [
      '可交易候选少于10只，暂停新增观察。',
      '出现 ST、停牌、涨跌停不可买或数据缺失，记录阻塞原因。',
      'rolling_drawdown <= -8% 时进入回撤复核。',
      '最新信号与策略适用市场状态不一致时只 record_only。',
    ],
    sleeves: sleeveRows,
  };
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

function readImportedTradeabilityReviews() {
  return readJsonFile(importedTradeabilityReviewsPath, []);
}

function readImportedCoreMediumSmallSignalReviews() {
  return readJsonFile(importedCoreMediumSmallSignalReviewsPath, []);
}

function readImportedPaperWatchLedger() {
  return readJsonFile(importedPaperWatchLedgerPath, []);
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parsePaperWatchLedgerCsv(text) {
  const lines = text
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV 账本至少需要表头和一行记录。');
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  });
}

function parsePaperWatchLedgerPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  return parsePaperWatchLedgerCsv(trimmed);
}

function normalizePaperWatchLedgerRows(payload, importedAt) {
  const body = payload || {};
  const rawRows = Array.isArray(body)
    ? body
    : Array.isArray(body.records)
      ? body.records
      : Array.isArray(body.rows)
        ? body.rows
        : [body];
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const allowedSleeves = new Map((operationsPack.capital_sleeves || []).map((item) => [item.sleeve_id, item]));
  const templateFields = new Set((operationsPack.daily_ledger_template || []).map((item) => item.field));
  const requiredFields = ['date', 'sleeve_id', 'strategy_id', 'signal_state', 'gate_status', 'paper_action', 'planned_weight'];

  return rawRows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const missing = requiredFields.filter((field) => row[field] === undefined || row[field] === null || row[field] === '');
      if (missing.length) {
        throw new Error(`模拟观察账本缺少字段：${missing.join(', ')}`);
      }
      if (!allowedSleeves.has(row.sleeve_id)) {
        throw new Error(`未知模拟观察资金袖：${row.sleeve_id}`);
      }
      const sleeve = allowedSleeves.get(row.sleeve_id);
      const plannedWeight = Number(row.planned_weight);
      if (!Number.isFinite(plannedWeight) || plannedWeight < 0 || plannedWeight > 1) {
        throw new Error('planned_weight 必须是 0 到 1 之间的数字。');
      }
      if (!sleeve.can_start_observation && plannedWeight > 0) {
        throw new Error(`${row.sleeve_id} 当前未通过准入门槛，planned_weight 必须为 0。`);
      }
      const unknownFields = Object.keys(row).filter((field) => !templateFields.has(field));
      return {
        ...row,
        planned_weight: plannedWeight,
        unknown_fields: unknownFields,
        importedAt,
        source: 'paper_watch_manual_ledger',
        data_policy: '用户导入的模拟观察账本记录；平台只校验准入和字段，不生成收益、净值、成交或持仓。',
      };
    });
}

function isTradeabilityReviewPayload(payload) {
  return payload?.source === akshareLatestSignalTradeabilityReviewSource
    || payload?.result_type === 'tradeability_review';
}

function isCoreMediumSmallSignalReviewPayload(payload) {
  return payload?.source === coreMediumSmallLatestSignalReviewSource
    || payload?.result_type === 'core_medium_small_latest_signal_review';
}

function isPaperWatchObservationPayload(payload) {
  return payload?.source === 'joinquant_paper_watch_observation_result'
    || payload?.result_type === 'paper_watch_observation_result';
}

function localAshareCode(code) {
  const text = String(code || '').trim();
  const match = text.match(/\d{6}/);
  return match ? match[0] : text;
}

function sortedUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function assertSameStringSet(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} 不匹配：期望 ${expected.join(', ')}，实际 ${actual.join(', ')}。`);
  }
}

function normalizeTradeabilityReview(payload, importedAt) {
  if (payload?.source !== akshareLatestSignalTradeabilityReviewSource) {
    throw new Error('交易可行性复核 source 不匹配，不能导入。');
  }
  const taskPack = readJsonFile(tradeabilityReviewTaskPackPath, null);
  const target = taskPack?.target || null;
  if (!payload.strategy_id || !payload.signal_date || !payload.decision) {
    throw new Error('交易可行性复核缺少 strategy_id、signal_date 或 decision。');
  }
  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    throw new Error('交易可行性复核必须包含 JoinQuant 输出的 records 明细。');
  }
  if (target) {
    if (payload.strategy_id !== target.strategy_id) {
      throw new Error(`交易可行性复核 strategy_id 与当前任务包不匹配：期望 ${target.strategy_id}，实际 ${payload.strategy_id}。`);
    }
    if (dateOnly(payload.signal_date) !== dateOnly(target.signal_date)) {
      throw new Error(`交易可行性复核 signal_date 与当前任务包不匹配：期望 ${target.signal_date}，实际 ${payload.signal_date}。`);
    }
  }

  const candidateCount = Number(payload.candidate_count ?? payload.records.length);
  const tradableCount = Number(payload.tradable_count ?? payload.records.filter((row) => row?.tradable).length);
  if (!Number.isFinite(candidateCount) || !Number.isFinite(tradableCount)) {
    throw new Error('交易可行性复核 candidate_count 或 tradable_count 非法。');
  }
  if (candidateCount !== payload.records.length) {
    throw new Error(`交易可行性复核 candidate_count 与 records 数量不一致：${candidateCount} / ${payload.records.length}。`);
  }
  if (target) {
    const expectedCount = Number(target.selected_count ?? target.candidate_count ?? 0);
    if (Number.isFinite(expectedCount) && expectedCount > 0 && candidateCount !== expectedCount) {
      throw new Error(`交易可行性复核 candidate_count 与当前任务包不匹配：期望 ${expectedCount}，实际 ${candidateCount}。`);
    }
    const expectedCodes = sortedUnique((target.selected_codes || []).map(localAshareCode));
    const actualCodes = sortedUnique(payload.records.map((row) => localAshareCode(row?.local_code || row?.code)));
    assertSameStringSet(actualCodes, expectedCodes, '交易可行性复核候选代码集合');
  }
  if (tradableCount !== payload.records.filter((row) => row?.tradable).length) {
    throw new Error('交易可行性复核 tradable_count 与 records 中 tradable=true 数量不一致。');
  }

  const allowedDecisions = new Set(['tradeability_review_passed', 'tradeability_review_failed']);
  if (!allowedDecisions.has(payload.decision)) {
    throw new Error('交易可行性复核 decision 必须为 passed 或 failed。');
  }

  return {
    ...payload,
    result_type: 'tradeability_review',
    candidate_count: candidateCount,
    tradable_count: tradableCount,
    blocked_count: Number(payload.blocked_count ?? candidateCount - tradableCount),
    importedAt,
    source: akshareLatestSignalTradeabilityReviewSource,
  };
}

function normalizeCoreMediumSmallSignalReview(payload, importedAt) {
  if (payload?.source !== coreMediumSmallLatestSignalReviewSource) {
    throw new Error('核心量价最新信号 source 不匹配，不能导入。');
  }
  const taskPack = readJsonFile(coreMediumSmallPromotionTaskPackPath, null);
  const target = taskPack?.target || {};
  const passGate = taskPack?.pass_gate || {};
  if (!payload.strategy_id || !payload.sleeve_id || !payload.signal_date || !payload.decision) {
    throw new Error('核心量价最新信号缺少 strategy_id、sleeve_id、signal_date 或 decision。');
  }
  if (payload.strategy_id !== 'core_volume_price_trend_v1') {
    throw new Error(`核心量价最新信号 strategy_id 不匹配：${payload.strategy_id}。`);
  }
  if (payload.sleeve_id !== 'jq_medium_vol_small_cap_core') {
    throw new Error(`核心量价最新信号 sleeve_id 不匹配：${payload.sleeve_id}。`);
  }
  if (target.strategy_id && payload.strategy_id !== target.strategy_id) {
    throw new Error(`核心量价最新信号 strategy_id 与任务包不匹配：期望 ${target.strategy_id}，实际 ${payload.strategy_id}。`);
  }
  if (target.sleeve_id && payload.sleeve_id !== target.sleeve_id) {
    throw new Error(`核心量价最新信号 sleeve_id 与任务包不匹配：期望 ${target.sleeve_id}，实际 ${payload.sleeve_id}。`);
  }
  if (!Array.isArray(payload.records)) {
    throw new Error('核心量价最新信号必须包含 records 数组。');
  }
  const selectedCount = Number(payload.selected_count ?? payload.records.length);
  const targetCandidateCount = Number(payload.target_candidate_count ?? selectedCount);
  const entryCandidateCount = Number(payload.entry_candidate_count ?? targetCandidateCount);
  const universeCount = Number(payload.universe_count ?? 0);
  if (![selectedCount, targetCandidateCount, entryCandidateCount, universeCount].every(Number.isFinite)) {
    throw new Error('核心量价最新信号 selected_count、target_candidate_count、entry_candidate_count 或 universe_count 非法。');
  }
  if (selectedCount !== payload.records.length) {
    throw new Error(`核心量价最新信号 selected_count 与 records 数量不一致：${selectedCount} / ${payload.records.length}。`);
  }
  const allowedDecisions = new Set(['promotion_signal_ready', 'promotion_signal_not_ready']);
  if (!allowedDecisions.has(payload.decision)) {
    throw new Error('核心量价最新信号 decision 必须为 promotion_signal_ready 或 promotion_signal_not_ready。');
  }
  const requiredRegime = passGate.required_market_regime || 'medium_volatility';
  const requiredBucket = passGate.required_market_cap_bucket || 'small_cap';
  if (payload.target_market_regime && payload.target_market_regime !== requiredRegime) {
    throw new Error(`核心量价最新信号 target_market_regime 不匹配：期望 ${requiredRegime}，实际 ${payload.target_market_regime}。`);
  }
  if (payload.target_market_cap_bucket && payload.target_market_cap_bucket !== requiredBucket) {
    throw new Error(`核心量价最新信号 target_market_cap_bucket 不匹配：期望 ${requiredBucket}，实际 ${payload.target_market_cap_bucket}。`);
  }
  const badBucket = payload.records.find((row) => row?.market_cap_bucket && row.market_cap_bucket !== requiredBucket);
  if (badBucket) {
    throw new Error(`核心量价最新信号 records 存在非 ${requiredBucket} 候选：${badBucket.code || '-'}`);
  }
  const minSelectedCount = Number(passGate.min_selected_count ?? 10);
  if (payload.decision === 'promotion_signal_ready') {
    if (payload.market_regime !== requiredRegime) {
      throw new Error(`核心量价最新信号 ready 结论要求 market_regime=${requiredRegime}，实际 ${payload.market_regime}。`);
    }
    if (selectedCount < minSelectedCount) {
      throw new Error(`核心量价最新信号 ready 结论要求 selected_count >= ${minSelectedCount}，实际 ${selectedCount}。`);
    }
  }

  return {
    ...payload,
    result_type: 'core_medium_small_latest_signal_review',
    selected_count: selectedCount,
    target_candidate_count: targetCandidateCount,
    entry_candidate_count: entryCandidateCount,
    universe_count: universeCount,
    importedAt,
    source: coreMediumSmallLatestSignalReviewSource,
  };
}

function normalizeJoinQuantObservationRows(payload, importedAt, filePath = '') {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.records)
      ? payload.records
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];
  if (!rows.length) {
    throw new Error('JoinQuant 准模拟观察结果必须包含 records 或 rows。');
  }
  const normalized = normalizePaperWatchLedgerRows(rows, importedAt);
  return normalized.map((row) => ({
    ...row,
    imported_from_file: filePath,
    source: 'paper_watch_joinquant_observation_ledger',
    data_policy: 'JoinQuant 准模拟观察结果自动导入；收益、净值、回撤等字段来自 JoinQuant 输出或用户确认的真实观察结果。',
  }));
}

function latestTradeabilityReviewFor(reviews, strategyId, signalDate) {
  return reviews
    .filter((review) => review?.strategy_id === strategyId && review?.signal_date === signalDate)
    .sort((left, right) => String(right.importedAt || '').localeCompare(String(left.importedAt || '')))[0] || null;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function relativeProjectPath(path) {
  return path.startsWith(projectRoot) ? path.slice(projectRoot.length + 1) : path;
}

function runPythonRefreshStep(name, scriptPath, args = [], timeout = 180_000) {
  const relativePath = relativeProjectPath(scriptPath);
  if (!existsSync(scriptPath)) {
    return {
      args,
      name,
      ok: false,
      path: relativePath,
      status: 'missing_script',
      stderr: '脚本不存在。',
      stdout: '',
    };
  }
  const result = spawnSync(pythonExecutable, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout,
  });
  return {
    args,
    name,
    ok: result.status === 0,
    path: relativePath,
    signal: result.signal || '',
    status: result.status,
    stderr: String(result.stderr || '').trim(),
    stdout: String(result.stdout || '').trim(),
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    timeoutMs: timeout,
  };
}

function compactDate(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function positionStressReportPathForRange(start, end) {
  const startKey = compactDate(start);
  const endKey = compactDate(end);
  if (!startKey || !endKey) return positionStressLatestPath;
  const datedPath = join(positionStressResultsDir, `position_stress_${startKey}_${endKey}.json`);
  return existsSync(datedPath) ? datedPath : null;
}

function emptyPositionStressReport(options = {}) {
  return {
    status: 'missing',
    sourceMode: '',
    sourceMessage: options.sourceMessage || '尚未生成建仓压力测试报告。',
    dataPolicy: '先选择压测策略，再点击运行，生成 2025-01-01 至 2026-07-22 的3000只股票真实行情、策略选股、K线、建仓模拟和压力测试报告。',
    requestedDateRange: { start: options.start || '2025-01-01', end: options.end || '2026-07-22' },
    actualDates: [],
    missingDates: [],
    stockCount: 0,
    rowCount: 0,
    artifacts: {},
    dataTable: [],
    kline: [],
    strategy: { dailySelections: [], equityCurve: [], trades: [], metrics: {} },
    stress: [],
    warnings: options.warnings || ['还没有运行导入。'],
    nextActions: ['先选择压测策略，再点击运行生成第一版报告。'],
  };
}

function readPositionStressReport(options = {}) {
  const reportPath = positionStressReportPathForRange(options.start, options.end);
  const explicitRange = Boolean(compactDate(options.start) && compactDate(options.end));
  const report = reportPath
    ? readJsonFile(reportPath, emptyPositionStressReport(options))
    : emptyPositionStressReport({
      ...options,
      sourceMessage: explicitRange ? '当前日期区间还没有生成建仓压力测试报告。' : undefined,
      warnings: explicitRange ? ['当前日期区间尚未生成报告，请点击运行生成。'] : undefined,
    });
  return {
    ...report,
    reportPath: reportPath ? relativeProjectPath(reportPath) : '',
    selectedStrategy: report.selectedStrategy || readPositionStressSelection(),
  };
}

function readPositionStressSelection() {
  return readJsonFile(positionStressSelectionPath, null);
}

function positionStressAdapterFor(strategyId, selectedCodes = []) {
  if (strategyId === 'akshare_regime_switch_contraction_mean_reversion_v1') {
    return selectedCodes.length ? 'selected_codes_mean_reversion' : 'ohlcv_mean_reversion';
  }
  if (strategyId === 'kline_assisted_confirmation') return 'ohlcv_kline_confirmation';
  if (strategyId === 'core_volume_price_trend_v1') return 'ohlcv_core_volume_price';
  if (strategyId === 'jq_quality_profit_liquidity_v1') return 'ohlcv_liquidity_quality_proxy';
  if (strategyId === 'csi500_low_crowding_reversal_index_enhancement_v0') return 'ohlcv_low_crowding_reversal_proxy';
  if (strategyId === 'csi500_low_crowding_reversal_index_enhancement_v1') {
    return selectedCodes.length ? 'selected_codes_mean_reversion' : 'ohlcv_low_crowding_reversal_proxy';
  }
  if (strategyId === 'csi500_low_crowding_reversal_index_enhancement_v2') {
    return selectedCodes.length ? 'selected_codes_mean_reversion' : 'ohlcv_low_crowding_reversal_proxy';
  }
  return 'ohlcv_core_volume_price';
}

function positionStressExecutionParamsFor(strategyId) {
  if (strategyId === 'csi500_low_crowding_reversal_index_enhancement_v2') {
    return {
      holdingPolicy: 'dynamic_signal',
      minHoldingDays: 1,
      baseHoldingDays: 5,
      maxHoldingDays: 20,
      hardMaxHoldingDays: 60,
      signalBufferN: 80,
      trendExtendBufferN: 40,
      trendExtendMinReturn: 0.03,
      stopLossPct: 0.08,
      takeProfitPct: 0.12,
      trailingStopPct: 0.06,
      scoreDropPct: 0.30,
      symbolsFile: 'auto_cache_all',
    };
  }
  return { holdingPolicy: 'next_day' };
}

function normalizePositionStressStrategy(item) {
  const selectedCodes = selectedCodesList(item.selected_codes || item.selectedCodes || item.latestSignal?.selected_codes);
  const strategyId = item.strategy_id || item.strategyId || item.id || '';
  const adapter = item.adapter || positionStressAdapterFor(strategyId, selectedCodes);
  const runnable = item.runnable !== false && adapter !== 'controller_not_directly_executable';
  return {
    adapter,
    baseline: item.baseline || null,
    evidence: item.evidence || item.evidence_system || item.source || '',
    gateStatus: item.operational_status || item.gateStatus || item.readiness_decision || item.decision || '',
    layer: item.layer || item.allowed_layer || item.market_regime || '',
    name: item.strategy_name || item.strategyName || item.name || strategyId,
    runnable,
    runnableReason: item.runnableReason || (runnable ? '可进入建仓压力测试。' : '该策略是控制器或缺少可复现选股名单，不能直接压测。'),
    selectedCodes,
    source: item.source || item.evidence_system || '',
    strategyId,
    execution: item.execution || positionStressExecutionParamsFor(strategyId),
  };
}

function buildPositionStressStrategyCatalog() {
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const sleeves = Array.isArray(operationsPack.capital_sleeves) ? operationsPack.capital_sleeves : [];
  const readinessAudit = readJsonFile(paperWatchReadinessAuditPath, {});
  const recommendedRoutes = Array.isArray(readinessAudit.recommended_routes) ? readinessAudit.recommended_routes : [];
  const routes = Array.isArray(readinessAudit.routes) ? readinessAudit.routes : [];
  const readyDecisions = new Set(['ready_controlled_paper_watch', 'ready_local_paper_watch']);
  const byId = new Map();

  sleeves
    .filter((sleeve) => sleeve?.can_start_observation || sleeve?.operational_status === 'ready_for_controlled_paper_watch')
    .forEach((sleeve) => {
      const latestSignal = sleeve.latest_signal || {};
      const item = normalizePositionStressStrategy({
        ...sleeve,
        evidence: sleeve.evidence_system,
        latestSignal,
        selectedCodes: latestSignal.selected_codes || [],
        runnable: sleeve.strategy_id !== 'regime_switch_quality_kline_v1' || selectedCodesList(latestSignal.selected_codes).length > 0,
        runnableReason: sleeve.strategy_id === 'regime_switch_quality_kline_v1'
          ? '市场状态控制器没有单独选股名单；请压测其组件策略。'
          : '准模拟盘运行包已允许观察，可进入短窗口建仓压力测试。',
      });
      byId.set(item.strategyId, item);
    });

  [...recommendedRoutes, ...routes]
    .filter((route) => readyDecisions.has(route?.readiness_decision || route?.decision))
    .forEach((route) => {
      const item = normalizePositionStressStrategy({
        ...route,
        strategyName: route.strategy_name,
        strategyId: route.strategy_id,
        evidence: route.source,
        gateStatus: route.readiness_decision || route.decision,
        runnable: route.strategy_id !== 'regime_switch_quality_kline_v1',
      });
      if (!byId.has(item.strategyId)) byId.set(item.strategyId, item);
    });

  if (!byId.has('csi500_low_crowding_reversal_index_enhancement_v0')) {
    byId.set('csi500_low_crowding_reversal_index_enhancement_v0', normalizePositionStressStrategy({
      adapter: 'ohlcv_low_crowding_reversal_proxy',
      evidence: 'joinquant_csi500_low_crowding_reversal_index_enhancement_v0',
      gateStatus: 'paper_trade_candidate',
      layer: '中证500指数增强',
      name: '中证500低拥挤反转指数增强候选策略 v0',
      runnable: true,
      runnableReason: '已导入真实 JoinQuant 候选结果；建仓压测使用 OHLCV 低拥挤反转代理分数检查执行链路。',
      source: 'joinquant_csi500_low_crowding_reversal_index_enhancement_v0',
      strategyId: 'csi500_low_crowding_reversal_index_enhancement_v0',
    }));
  }

  const v1SelectedCodesForV2 = csi500LcrV1LatestSelectedCodes();
  if (!byId.has('csi500_low_crowding_reversal_index_enhancement_v2')) {
    byId.set('csi500_low_crowding_reversal_index_enhancement_v2', normalizePositionStressStrategy({
      adapter: positionStressAdapterFor('csi500_low_crowding_reversal_index_enhancement_v2', v1SelectedCodesForV2),
      evidence: 'v1_candidate_plus_dynamic_signal_holding',
      gateStatus: 'candidate_for_pressure_test',
      layer: '中证500指数增强',
      name: '中证500低拥挤反转指数增强候选策略 v2',
      runnable: true,
      runnableReason: '基于 v1 最新名单，压测账本改为信号驱动持仓，并加入止盈止损、分数衰减和最长持仓约束。',
      selectedCodes: v1SelectedCodesForV2,
      source: 'csi500_lcr_v1_dynamic_signal_holding_upgrade',
      strategyId: 'csi500_low_crowding_reversal_index_enhancement_v2',
      execution: positionStressExecutionParamsFor('csi500_low_crowding_reversal_index_enhancement_v2'),
    }));
  }

  const current = readPositionStressSelection();
  if (current?.strategyId && !byId.has(current.strategyId)) {
    byId.set(current.strategyId, normalizePositionStressStrategy({
      ...current,
      runnable: current.runnable !== false,
      runnableReason: current.runnableReason || '当前已保存为建仓压力测试策略，可继续运行或刷新报告。',
    }));
  }

  const strategies = [...byId.values()].sort((left, right) => {
    if (left.runnable !== right.runnable) return left.runnable ? -1 : 1;
    return String(left.name).localeCompare(String(right.name), 'zh-CN');
  });
  return {
    current,
    dataPolicy: '只允许准模拟盘运行包或准入审计中已达标的策略进入建仓压力测试；控制器类策略没有明确选股名单时不能直接运行。',
    strategies,
  };
}

function selectPositionStressStrategy(strategyId) {
  const catalog = buildPositionStressStrategyCatalog();
  const strategy = catalog.strategies.find((item) => item.strategyId === strategyId);
  if (!strategy) {
    throw new Error('该策略未达到准模拟盘标准，不能进入建仓压力测试。');
  }
  if (!strategy.runnable) {
    throw new Error(strategy.runnableReason || '该策略当前不能直接进入建仓压力测试。');
  }
  const selected = {
    ...strategy,
    selectedAt: new Date().toISOString(),
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(positionStressSelectionPath, `${JSON.stringify(selected, null, 2)}\n`);
  return selected;
}

function requirePositionStressStrategyId(value) {
  const strategyId = String(value || '').trim();
  if (!strategyId) {
    throw new Error('请先从策略池选择压测策略，再运行建仓压力测试。');
  }
  return strategyId;
}

function runPositionStressLab(options = {}) {
  const start = String(options.start || '2025-01-01');
  const end = String(options.end || '2026-07-22');
  const topN = String(Number(options.topN || 10));
  const capital = String(Number(options.capital || 1_000_000));
  const source = ['auto', 'joinquant', 'akshare', 'akshare_cache'].includes(options.source) ? options.source : 'auto';
  const selectedStrategy = selectPositionStressStrategy(requirePositionStressStrategyId(options.strategyId));
  const args = [
    '--start', start,
    '--end', end,
    '--top-n', topN,
    '--capital', capital,
    '--source', source,
  ];
  if (selectedStrategy?.strategyId) {
    args.push('--strategy-id', selectedStrategy.strategyId);
    args.push('--strategy-name', selectedStrategy.name || selectedStrategy.strategyId);
    args.push('--strategy-adapter', selectedStrategy.adapter || 'ohlcv_core_volume_price');
    const execution = selectedStrategy.execution || positionStressExecutionParamsFor(selectedStrategy.strategyId);
    args.push('--holding-policy', execution.holdingPolicy || 'next_day');
    if (execution.minHoldingDays !== undefined) args.push('--min-holding-days', String(execution.minHoldingDays));
    if (execution.baseHoldingDays !== undefined) args.push('--base-holding-days', String(execution.baseHoldingDays));
    if (execution.maxHoldingDays !== undefined) args.push('--max-holding-days', String(execution.maxHoldingDays));
    if (execution.hardMaxHoldingDays !== undefined) args.push('--hard-max-holding-days', String(execution.hardMaxHoldingDays));
    if (execution.signalBufferN !== undefined) args.push('--signal-buffer-n', String(execution.signalBufferN));
    if (execution.trendExtendBufferN !== undefined) args.push('--trend-extend-buffer-n', String(execution.trendExtendBufferN));
    if (execution.trendExtendMinReturn !== undefined) args.push('--trend-extend-min-return', String(execution.trendExtendMinReturn));
    if (execution.stopLossPct !== undefined) args.push('--stop-loss-pct', String(execution.stopLossPct));
    if (execution.takeProfitPct !== undefined) args.push('--take-profit-pct', String(execution.takeProfitPct));
    if (execution.trailingStopPct !== undefined) args.push('--trailing-stop-pct', String(execution.trailingStopPct));
    if (execution.scoreDropPct !== undefined) args.push('--score-drop-pct', String(execution.scoreDropPct));
    if (Array.isArray(selectedStrategy.selectedCodes) && selectedStrategy.selectedCodes.length) {
      args.push('--selected-codes', selectedStrategy.selectedCodes.join(','));
    }
    if (execution.symbolsFile) {
      args.push('--symbols-file', String(execution.symbolsFile));
    }
  }
  if (options.importFile) {
    args.push('--import-file', String(options.importFile));
  }
  const step = runPythonRefreshStep('position_stress_lab', positionStressScriptPath, args, 900_000);
  const report = readPositionStressReport({ start, end });
  const reportComplete = Boolean(report?.complete || report?.runGate?.formalRunAllowed);
  const timedOut = Boolean(step.timedOut || step.signal === 'SIGTERM');
  return {
    ok: step.ok || reportComplete,
    step,
    report,
    errorKind: !step.ok && timedOut ? 'timeout' : !step.ok ? 'script_failed' : '',
    stepWarning: !step.ok && reportComplete
      ? '压测报告已完整生成，但脚本收尾触达接口超时边界；请以已落盘报告为准。'
      : timedOut
        ? `压测计算超过 ${Math.round((step.timeoutMs || 0) / 1000)} 秒被终止；请缩短窗口或稍后重跑。`
        : '',
  };
}

function exportPositionStressEquityExcel(options = {}) {
  const reportPath = positionStressReportPathForRange(options.start, options.end);
  if (!reportPath) throw new Error('当前日期区间还没有生成组合净值报告，请先运行建仓压力测试。');
  const step = runPythonRefreshStep('position_stress_excel_export', positionStressExcelExportScriptPath, ['--report', reportPath], 120_000);
  if (!step.ok) {
    throw new Error(step.stderr || step.stdout || '组合净值结果 Excel 导出失败。');
  }
  const outputPath = String(step.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!outputPath || !existsSync(outputPath)) {
    throw new Error('组合净值结果 Excel 已执行，但没有找到导出文件。');
  }
  return outputPath;
}

function exportPositionStressTradesExcel(options = {}) {
  const reportPath = positionStressReportPathForRange(options.start, options.end);
  if (!reportPath) throw new Error('当前日期区间还没有生成成交明细报告，请先运行建仓压力测试。');
  const step = runPythonRefreshStep('position_stress_trades_excel_export', positionStressExcelExportScriptPath, ['--report', reportPath, '--sheet', 'trades'], 120_000);
  if (!step.ok) {
    throw new Error(step.stderr || step.stdout || '成交明细 Excel 导出失败。');
  }
  const outputPath = String(step.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!outputPath || !existsSync(outputPath)) {
    throw new Error('成交明细 Excel 已执行，但没有找到导出文件。');
  }
  return outputPath;
}

function writePositionStressImportFile(text) {
  const importDir = outputPath('position-stress', 'data');
  mkdirSync(importDir, { recursive: true });
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('导入内容为空。');
  }
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const path = join(importDir, `manual_ohlcv_import_${todayYmd()}.${isJson ? 'json' : 'csv'}`);
  writeFileSync(path, `${trimmed}\n`, 'utf8');
  return path;
}

function reviewIdentity(review) {
  return [
    review?.source || '',
    review?.result_type || '',
    review?.strategy_id || '',
    review?.sleeve_id || '',
    review?.signal_date || '',
    review?.decision || '',
  ].join('::');
}

function uniqueReviews(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = reviewIdentity(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanJoinQuantResultFiles() {
  if (!existsSync(joinQuantResultsDir)) return [];
  return readdirSync(joinQuantResultsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(joinQuantResultsDir, name))
    .sort((left, right) => {
      const rightMtime = statSync(right).mtimeMs;
      const leftMtime = statSync(left).mtimeMs;
      return rightMtime - leftMtime;
    });
}

function importJoinQuantResultFiles() {
  const importedAt = new Date().toISOString();
  const files = scanJoinQuantResultFiles();
  const currentTradeability = readImportedTradeabilityReviews();
  const currentCoreReviews = readImportedCoreMediumSmallSignalReviews();
  const currentLedger = readImportedPaperWatchLedger();
  const tradeabilityKeys = new Set(currentTradeability.map(reviewIdentity));
  const coreKeys = new Set(currentCoreReviews.map(reviewIdentity));
  const ledgerKeys = new Set(currentLedger.map((row) => `${row.date || ''}::${row.sleeve_id || ''}::${row.strategy_id || ''}::${row.source || ''}`));
  const importedTradeability = [];
  const importedCoreReviews = [];
  const importedObservationRows = [];
  const skipped = [];
  const failed = [];

  files.forEach((filePath) => {
    const relativePath = relativeProjectPath(filePath);
    try {
      const payload = readJsonFile(filePath, null);
      if (!payload || typeof payload !== 'object') {
        skipped.push({ file: relativePath, reason: '不是有效 JSON 对象。' });
        return;
      }
      if (isTradeabilityReviewPayload(payload)) {
        const normalized = normalizeTradeabilityReview(payload, importedAt);
        const key = reviewIdentity(normalized);
        if (tradeabilityKeys.has(key)) {
          skipped.push({ file: relativePath, reason: '交易可行性复核已导入。' });
          return;
        }
        tradeabilityKeys.add(key);
        importedTradeability.push({ ...normalized, imported_from_file: relativePath });
        return;
      }
      if (isCoreMediumSmallSignalReviewPayload(payload)) {
        const normalized = normalizeCoreMediumSmallSignalReview(payload, importedAt);
        const key = reviewIdentity(normalized);
        if (coreKeys.has(key)) {
          skipped.push({ file: relativePath, reason: '核心量价信号复核已导入。' });
          return;
        }
        coreKeys.add(key);
        importedCoreReviews.push({ ...normalized, imported_from_file: relativePath });
        return;
      }
      if (isPaperWatchObservationPayload(payload)) {
        const rows = normalizeJoinQuantObservationRows(payload, importedAt, relativePath);
        const freshRows = rows.filter((row) => {
          const key = `${row.date || ''}::${row.sleeve_id || ''}::${row.strategy_id || ''}::${row.source || ''}`;
          if (ledgerKeys.has(key)) return false;
          ledgerKeys.add(key);
          return true;
        });
        if (!freshRows.length) {
          skipped.push({ file: relativePath, reason: 'JoinQuant 准模拟观察结果已导入。' });
          return;
        }
        importedObservationRows.push(...freshRows);
        return;
      }
      skipped.push({ file: relativePath, reason: `未识别的 JoinQuant 结果类型：${payload.source || payload.result_type || 'unknown'}。` });
    } catch (error) {
      failed.push({ file: relativePath, reason: error.message });
    }
  });

  if (importedTradeability.length) {
    const nextRows = uniqueReviews([...importedTradeability, ...currentTradeability]).slice(0, 200);
    writeFileSync(importedTradeabilityReviewsPath, `${JSON.stringify(nextRows, null, 2)}\n`);
  }
  if (importedCoreReviews.length) {
    const nextRows = uniqueReviews([...importedCoreReviews, ...currentCoreReviews]).slice(0, 200);
    writeFileSync(importedCoreMediumSmallSignalReviewsPath, `${JSON.stringify(nextRows, null, 2)}\n`);
  }
  if (importedObservationRows.length) {
    const nextLedger = [...importedObservationRows, ...currentLedger].slice(0, 1000);
    writeFileSync(importedPaperWatchLedgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`);
  }

  return {
    failed,
    files_scanned: files.length,
    imported_core_signal_review_count: importedCoreReviews.length,
    imported_observation_ledger_count: importedObservationRows.length,
    imported_tradeability_review_count: importedTradeability.length,
    importedAt,
    ok: failed.length === 0,
    skipped,
  };
}

function normalizeAutoLedgerAction(sleeve, initialRow) {
  const latestSignal = sleeve.latest_signal || {};
  const reviewDecision = sleeve.latest_signal_review?.decision || sleeve.tradeability_review?.decision || '';
  if (!sleeve.can_start_observation) return 'record_only';
  if (initialRow?.paper_action) return initialRow.paper_action;
  if (latestSignal.action === 'record_only') return 'record_only';
  if (latestSignal.action === 'paper_watch_open_allowed') return 'open_allowed';
  if (reviewDecision === 'tradeability_review_passed') return 'open_allowed';
  if (sleeve.operational_status === 'ready_for_controlled_paper_watch') return 'open_allowed';
  return 'record_only';
}

function buildAutoLedgerRowsFromOperationsPack(operationsPack) {
  const sleeves = Array.isArray(operationsPack?.capital_sleeves) ? operationsPack.capital_sleeves : [];
  const initialRows = Array.isArray(operationsPack?.initial_ledger_rows) ? operationsPack.initial_ledger_rows : [];
  const initialBySleeve = new Map(initialRows.map((row) => [row.sleeve_id, row]));
  return sleeves.map((sleeve) => {
    const initialRow = initialBySleeve.get(sleeve.sleeve_id) || {};
    const latestSignal = sleeve.latest_signal || {};
    const selectedCodes = selectedCodesList(latestSignal.selected_codes || initialRow.selected_codes);
    const isController = sleeve.role === 'primary_controller' && selectedCodes.length === 0;
    const paperAction = normalizeAutoLedgerAction(sleeve, initialRow);
    const signalDate = latestSignal.signal_date
      || sleeve.latest_signal_review?.signal_date
      || sleeve.tradeability_review?.signal_date
      || initialRow.date
      || '';
    const plannedWeight = sleeve.can_start_observation
      ? Number(initialRow.planned_weight ?? (paperAction === 'open_allowed' ? 1 : 0))
      : 0;
    return {
      benchmark_return: null,
      blocked_reason: Array.isArray(sleeve.blocked_reasons) ? sleeve.blocked_reasons.join('；') : '',
      candidate_count: latestSignal.candidate_count ?? initialRow.candidate_count ?? null,
      data_policy: 'JoinQuant 自动刷新生成的准模拟盘信号账本；只记录当时信号、准入状态和计划动作，不生成未来收益、净值、成交或持仓。',
      date: signalDate,
      gate_status: sleeve.operational_status || initialRow.gate_status || 'unknown',
      importedAt: new Date().toISOString(),
      industry_top_exposure: null,
      market_cap_exposure: null,
      notes: 'auto_generated_from_joinquant_refresh',
      paper_action: paperAction,
      paper_nav: null,
      period_return: null,
      planned_weight: Number.isFinite(plannedWeight) ? plannedWeight : 0,
      rolling_drawdown: null,
      selected_codes: selectedCodes,
      selected_count: isController ? null : (latestSignal.selected_count ?? initialRow.selected_count ?? selectedCodes.length),
      signal_state: sleeve.can_start_observation ? 'ready' : 'blocked',
      sleeve_id: sleeve.sleeve_id || '',
      slippage: null,
      source: 'paper_watch_auto_joinquant_ledger',
      strategy_id: sleeve.strategy_id || '',
      turnover: null,
      unknown_fields: [],
    };
  });
}

function mergePaperWatchLedgerRows(autoRows) {
  const existing = readImportedPaperWatchLedger();
  const autoKeys = new Set(autoRows.map((row) => `${row.date}::${row.sleeve_id}::${row.strategy_id}::${row.source}`));
  const preserved = existing.filter((row) => !autoKeys.has(`${row.date}::${row.sleeve_id}::${row.strategy_id}::${row.source}`));
  const nextRows = [...autoRows, ...preserved].slice(0, 1000);
  writeFileSync(importedPaperWatchLedgerPath, `${JSON.stringify(nextRows, null, 2)}\n`);
  return {
    auto_ledger_count: autoRows.length,
    total_ledger_count: nextRows.length,
  };
}

function maxDrawdownFromNav(navValues) {
  const values = navValues.map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  let peak = values[0];
  let drawdown = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    if (peak > 0) drawdown = Math.min(drawdown, value / peak - 1);
  });
  return drawdown;
}

function cumulativeNavFromReturns(rows, field) {
  let nav = 1;
  return rows.map((row) => {
    if (!hasFiniteLedgerValue(row[field])) return null;
    const ret = Number(row[field]);
    nav *= (1 + ret);
    return {
      date: row.date || '',
      nav,
      return: ret,
    };
  }).filter(Boolean);
}

function hasFiniteLedgerValue(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function decidePaperWatchStage(metrics) {
  if (!metrics.completed_return_rows) {
    return {
      action: 'collect_returns',
      stage: 'signal_only',
      stage_name: '只有信号账本',
      tone: 'pending',
      reason: '尚无真实 period_return，不能计算净值、胜率或晋级。',
    };
  }
  if (metrics.max_drawdown !== null && metrics.max_drawdown <= -0.08) {
    return {
      action: 'pause_new_entry',
      stage: 'risk_pause',
      stage_name: '触发回撤复核',
      tone: 'watch',
      reason: '真实观察回撤已达到或超过 -8% 暂停阈值。',
    };
  }
  if (metrics.completed_return_rows < 5) {
    return {
      action: 'continue_observation',
      stage: 'flow_check',
      stage_name: '流程校验',
      tone: 'pending',
      reason: '真实收益样本少于5期，只能确认流程是否顺畅。',
    };
  }
  if (metrics.completed_return_rows < 20) {
    return {
      action: 'continue_observation',
      stage: 'activation_watch',
      stage_name: '活性观察',
      tone: 'pending',
      reason: '真实收益样本少于20期，继续积累样本外表现。',
    };
  }
  const excess = Number(metrics.avg_excess_return);
  const winRate = Number(metrics.win_rate);
  if (excess > 0 && winRate >= 0.5 && (metrics.max_drawdown === null || metrics.max_drawdown > -0.08)) {
    return {
      action: 'promotion_review',
      stage: 'promotion_candidate',
      stage_name: '可进入晋级复核',
      tone: 'good',
      reason: '至少20期真实观察，平均超额为正，胜率不低于50%，且未触发回撤阈值。',
    };
  }
  return {
    action: 'continue_or_reduce',
    stage: 'needs_more_evidence',
    stage_name: '继续观察/降权',
    tone: 'watch',
    reason: '已有20期以上真实观察，但超额、胜率或回撤暂未达到晋级条件。',
  };
}

function buildPaperWatchPerformanceReport() {
  const ledger = readImportedPaperWatchLedger();
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const sleeves = Array.isArray(operationsPack.capital_sleeves) ? operationsPack.capital_sleeves : [];
  const rowsBySleeve = new Map();
  ledger.forEach((row) => {
    const key = row.sleeve_id || '';
    if (!rowsBySleeve.has(key)) rowsBySleeve.set(key, []);
    rowsBySleeve.get(key).push(row);
  });
  const sleeveReports = sleeves.map((sleeve) => {
    const rows = (rowsBySleeve.get(sleeve.sleeve_id) || [])
      .slice()
      .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
    const completedRows = rows.filter((row) => hasFiniteLedgerValue(row.period_return));
    const strategyCurve = cumulativeNavFromReturns(rows, 'period_return');
    const benchmarkCurve = cumulativeNavFromReturns(rows, 'benchmark_return');
    const periodReturns = completedRows.map((row) => Number(row.period_return)).filter(Number.isFinite);
    const benchmarkReturns = completedRows
      .filter((row) => hasFiniteLedgerValue(row.benchmark_return))
      .map((row) => Number(row.benchmark_return))
      .filter(Number.isFinite);
    const excessReturns = completedRows
      .map((row) => {
        const strategyRet = Number(row.period_return);
        if (!hasFiniteLedgerValue(row.benchmark_return)) return null;
        const benchmarkRet = Number(row.benchmark_return);
        return Number.isFinite(strategyRet) && Number.isFinite(benchmarkRet) ? strategyRet - benchmarkRet : null;
      })
      .filter(Number.isFinite);
    const metrics = {
      avg_benchmark_return: averageFinite(benchmarkReturns),
      avg_excess_return: averageFinite(excessReturns),
      avg_period_return: averageFinite(periodReturns),
      completed_return_rows: completedRows.length,
      latest_action: latestByDate(rows)?.paper_action || (sleeve.can_start_observation ? 'open_allowed' : 'record_only'),
      max_drawdown: maxDrawdownFromNav(strategyCurve.map((point) => point.nav)),
      missing_return_rows: rows.length - completedRows.length,
      observed_days: new Set(rows.map((row) => dateOnly(row.date)).filter(Boolean)).size,
      total_rows: rows.length,
      win_rate: periodReturns.length ? periodReturns.filter((value) => value > 0).length / periodReturns.length : null,
    };
    const stage = decidePaperWatchStage(metrics);
    return {
      sleeve_id: sleeve.sleeve_id,
      strategy_id: sleeve.strategy_id,
      strategy_name: sleeve.strategy_name,
      can_start_observation: Boolean(sleeve.can_start_observation),
      operational_status: sleeve.operational_status || '',
      metrics,
      stage,
      curve: strategyCurve.map((point, index) => ({
        date: point.date,
        benchmark_nav: benchmarkCurve[index]?.nav ?? null,
        excess_return: excessReturns[index] ?? null,
        net_value: point.nav,
        period_return: point.return,
      })),
      data_policy: '只基于准模拟盘账本中已存在的真实 period_return / benchmark_return 计算；缺失时不补、不估、不生成。',
    };
  });
  const report = {
    source: 'm_quant_paper_watch_performance_report',
    generated_at: new Date().toISOString(),
    data_policy: '表现报告只读取准模拟盘账本真实收益字段；没有真实收益时只显示信号样本，不生成净值曲线。',
    summary: {
      collect_returns_count: sleeveReports.filter((item) => item.stage.stage === 'signal_only').length,
      promotion_candidate_count: sleeveReports.filter((item) => item.stage.stage === 'promotion_candidate').length,
      risk_pause_count: sleeveReports.filter((item) => item.stage.stage === 'risk_pause').length,
      sleeve_count: sleeveReports.length,
      total_completed_return_rows: sleeveReports.reduce((sum, item) => sum + item.metrics.completed_return_rows, 0),
      total_ledger_rows: ledger.length,
    },
    sleeves: sleeveReports,
  };
  writeFileSync(paperWatchPerformanceReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function buildJoinQuantPaperWatchReport(importSummary, derived) {
  const routes = buildPaperWatchRoutes();
  const performanceReport = buildPaperWatchPerformanceReport();
  const consoleData = routes.paperWatchConsole || {};
  const sleeves = Array.isArray(consoleData.sleeves) ? consoleData.sleeves : [];
  const openSleeves = sleeves.filter((sleeve) => sleeve.canStartObservation && sleeve.latestAction === 'open_allowed');
  const recordOnlySleeves = sleeves.filter((sleeve) => sleeve.latestAction === 'record_only');
  const blockedSleeves = sleeves.filter((sleeve) => !sleeve.canStartObservation);
  const report = {
    source: 'm_quant_joinquant_paper_watch_report',
    generated_at: new Date().toISOString(),
    status: openSleeves.length ? 'ready_to_start_observation' : 'record_only',
    data_policy: '报告只汇总 JoinQuant 自动导入复核、运行包和自动信号账本；收益、净值、成交、持仓必须来自后续真实观察或外部平台回填。',
    import_summary: importSummary,
    derived_summary: derived,
    performance_summary: performanceReport.summary,
    metrics: {
      auto_or_imported_ledger_count: consoleData.metrics?.importedLedgerCount ?? 0,
      blocked_sleeve_count: blockedSleeves.length,
      open_allowed_sleeve_count: openSleeves.length,
      ready_sleeve_count: consoleData.metrics?.readySleeveCount ?? 0,
      record_only_sleeve_count: recordOnlySleeves.length,
      signal_date: consoleData.signalDate || '',
      sleeve_count: sleeves.length,
    },
    sleeves: sleeves.map((sleeve) => ({
      activity: sleeve.activity,
      blocked_reasons: sleeve.blockedReasons || [],
      can_start_observation: sleeve.canStartObservation,
      gate_status: sleeve.gateStatus,
      latest_action: sleeve.latestAction,
      selected_codes: sleeve.selectedCodes || [],
      selected_count: sleeve.selectedCount,
      signal_date: sleeve.signalDate,
      sleeve_id: sleeve.sleeveId,
      strategy_id: sleeve.strategyId,
      strategy_name: sleeve.strategyName,
    })),
    next_actions: [
      openSleeves.length
        ? '今天可以按 open_allowed 资金袖开始准模拟盘观察账本记录。'
        : '今天没有满足 open_allowed 的资金袖，只能 record_only。',
      performanceReport.summary.total_completed_return_rows
        ? '已检测到真实观察收益，表现报告已更新净值/回撤/晋级状态。'
        : '当前只有信号账本，等待 JoinQuant 准模拟观察收益结果自动导入。',
      '下一交易日继续运行 JoinQuant 刷新，自动覆盖同日自动信号行，保留真实观察回填行。',
      '收益、净值、回撤字段等待真实观察或外部平台结果回填，不由本地自动生成。',
    ],
    performance_report: performanceReport,
  };
  writeFileSync(joinQuantPaperWatchReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function runJoinQuantPaperWatchRefresh() {
  const startedAt = new Date().toISOString();
  const importSummary = importJoinQuantResultFiles();
  const firstDerived = rebuildPaperWatchDerivedArtifacts();
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const autoRows = buildAutoLedgerRowsFromOperationsPack(operationsPack);
  const ledgerSummary = mergePaperWatchLedgerRows(autoRows);
  const secondDerived = rebuildPaperWatchDerivedArtifacts();
  const report = buildJoinQuantPaperWatchReport(importSummary, secondDerived);
  const pack = {
    data_policy: [
      'JoinQuant刷新只扫描 outputs/sources/joinquant/results 中的真实 JoinQuant JSON。',
      '导入前执行严格校验；自动账本只生成信号、准入状态和计划动作。',
      '不会生成收益、净值、成交、持仓或事后回测结论。',
    ].join(' '),
    finished_at: new Date().toISOString(),
    import_summary: importSummary,
    ledger_summary: ledgerSummary,
    mode: 'joinquant_local',
    ok: importSummary.ok && firstDerived.ok && secondDerived.ok,
    report,
    source: 'm_quant_joinquant_paper_watch_refresh',
    started_at: startedAt,
    steps: [
      {
        name: '扫描并导入JoinQuant结果',
        ok: importSummary.ok,
        path: relativeProjectPath(joinQuantResultsDir),
        status: importSummary.ok ? 0 : 'validation_failed',
        stdout: JSON.stringify({
          files_scanned: importSummary.files_scanned,
          imported_tradeability_review_count: importSummary.imported_tradeability_review_count,
          imported_core_signal_review_count: importSummary.imported_core_signal_review_count,
          skipped_count: importSummary.skipped.length,
        }),
        stderr: importSummary.failed.map((item) => `${item.file}: ${item.reason}`).join('\n'),
      },
      {
        name: '自动生成准模拟账本信号行',
        ok: true,
        path: relativeProjectPath(importedPaperWatchLedgerPath),
        status: 0,
        stdout: JSON.stringify(ledgerSummary),
        stderr: '',
      },
      {
        name: '生成准模拟盘报告',
        ok: true,
        path: relativeProjectPath(joinQuantPaperWatchReportPath),
        status: 0,
        stdout: JSON.stringify(report.metrics),
        stderr: '',
      },
    ],
    derived: secondDerived,
  };
  writeFileSync(paperWatchDailyRefreshLatestPath, `${JSON.stringify(pack, null, 2)}\n`);
  return pack;
}

function akshareFetchArgsForMode(mode) {
  const end = todayYmd();
  const base = [
    '--start', '20240101',
    '--end', end,
    '--adjust', 'qfq',
    '--provider', 'em_tx',
    '--retries', '1',
    '--retry-sleep', '1',
  ];
  if (mode === 'akshare_csi300') {
    return [
      ...base,
      '--symbols-file', 'outputs/sources/akshare/processed/a_share_csi300_pool.csv',
      '--sleep', '0.15',
      '--pool-output', 'a_share_csi300_pool.csv',
      '--output-name', `a_share_daily_20240101_${end}_qfq.csv`,
    ];
  }
  return [
    ...base,
    '--symbols-file', 'outputs/sources/akshare/symbols/core_liquid_50.csv',
    '--sleep', '0.1',
    '--pool-output', 'a_share_core_liquid_50_pool.csv',
    '--output-name', `a_share_daily_core50_20240101_${end}_qfq.csv`,
  ];
}

function runPaperWatchDailyRefresh(mode = 'local') {
  const startedAt = new Date().toISOString();
  const refreshMode = ['local', 'akshare_fast', 'akshare_csi300', 'joinquant_local'].includes(mode) ? mode : 'local';
  if (refreshMode === 'joinquant_local') {
    return runJoinQuantPaperWatchRefresh();
  }
  const steps = [];

  if (refreshMode !== 'local') {
    steps.push(runPythonRefreshStep(
      refreshMode === 'akshare_csi300' ? 'AkShare沪深300行情刷新' : 'AkShare核心50行情刷新',
      akshareFetchHistoryScriptPath,
      akshareFetchArgsForMode(refreshMode),
      refreshMode === 'akshare_csi300' ? 900_000 : 300_000,
    ));
  }

  steps.push(runPythonRefreshStep(
    'AkShare最新准模拟信号重建',
    akshareGeneratePaperWatchSignalScriptPath,
    [],
    180_000,
  ));

  const derived = rebuildPaperWatchDerivedArtifacts();
  const pack = {
    data_policy: [
      '一键刷新只调用真实数据脚本和本地派生包脚本；失败会保留错误日志。',
      '不会生成收益、净值、成交、持仓、交易可行性或 BigQuant/JoinQuant 结论。',
      refreshMode === 'local'
        ? '本地快速模式不联网，只用已有落地数据重建信号。'
        : '联网模式依赖 AkShare 实时接口；若接口失败，不用旧数据冒充新数据。',
    ].join(' '),
    derived,
    finished_at: new Date().toISOString(),
    mode: refreshMode,
    ok: steps.every((step) => step.ok) && derived.ok,
    python: pythonExecutable,
    source: 'm_quant_paper_watch_daily_refresh',
    started_at: startedAt,
    steps,
  };
  writeFileSync(paperWatchDailyRefreshLatestPath, `${JSON.stringify(pack, null, 2)}\n`);
  return pack;
}

function rebuildPaperWatchDerivedArtifacts() {
  const startedAt = new Date().toISOString();
  const scripts = paperWatchDerivedScriptPaths.map((scriptPath) => {
    const relativePath = relativeProjectPath(scriptPath);
    if (!existsSync(scriptPath)) {
      return {
        ok: false,
        path: relativePath,
        status: 'missing_script',
        stdout: '',
        stderr: '脚本不存在。',
      };
    }
    const result = spawnSync(pythonExecutable, [scriptPath], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return {
      ok: result.status === 0,
      path: relativePath,
      signal: result.signal || '',
      status: result.status,
      stderr: String(result.stderr || '').trim(),
      stdout: String(result.stdout || '').trim(),
    };
  });
  return {
    data_policy: '只重建本地派生 JSON/Markdown：运行包、成熟策略矩阵和交易复核任务包；不生成收益、净值、成交、持仓或交易可行性结论。',
    finished_at: new Date().toISOString(),
    ok: scripts.every((item) => item.ok),
    python: pythonExecutable,
    scripts,
    started_at: startedAt,
  };
}

function paperWatchLedgerTemplateRows() {
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const templateFields = (operationsPack.daily_ledger_template || []).map((item) => item.field);
  const rows = operationsPack.initial_ledger_rows || [];
  return {
    operationsPack,
    headers: templateFields.length ? templateFields : [
      'date',
      'sleeve_id',
      'strategy_id',
      'signal_state',
      'gate_status',
      'candidate_count',
      'selected_count',
      'selected_codes',
      'paper_action',
      'planned_weight',
      'paper_nav',
      'period_return',
      'benchmark_return',
      'rolling_drawdown',
      'turnover',
      'slippage',
      'industry_top_exposure',
      'market_cap_exposure',
      'blocked_reason',
      'notes',
    ],
    rows,
  };
}

function buildPaperWatchLedgerTemplateCsv() {
  const { headers, rows } = paperWatchLedgerTemplateRows();
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => {
      const value = Array.isArray(row[header]) ? row[header].join('|') : row[header];
      return csvCell(value);
    }).join(',')),
  ].join('\n');
}

function compactMetricPack(source = {}) {
  return {
    annual_return: source.annual_return ?? null,
    avg_selected_count: source.avg_selected_count ?? source.avg_stock_count ?? null,
    max_drawdown: source.max_drawdown ?? null,
    positive_trade_ratio: source.positive_trade_ratio ?? null,
    sample_dates: source.sample_dates ?? source.sample_trades ?? null,
    sharpe: source.sharpe ?? null,
    strategy_return: source.strategy_return ?? null,
    win_rate: source.win_rate ?? null,
  };
}

function normalizeBigQuantPauseRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).map((rule) => {
    if (typeof rule === 'string') return rule;
    return [rule.rule, rule.trigger, rule.meaning].filter(Boolean).join(' / ');
  }).filter(Boolean);
}

function latestLedgerRowFor(sleeveId, rows = []) {
  return rows.find((row) => row.sleeve_id === sleeveId) || null;
}

function buildBigQuantPaperWatchTargets(operationsPack, ledgerRows) {
  const sleeves = Array.isArray(operationsPack.capital_sleeves) ? operationsPack.capital_sleeves : [];
  const initialRows = Array.isArray(operationsPack.initial_ledger_rows) ? operationsPack.initial_ledger_rows : [];
  return sleeves.map((sleeve) => {
    const latestLedger = latestLedgerRowFor(sleeve.sleeve_id, ledgerRows);
    const initialLedger = latestLedgerRowFor(sleeve.sleeve_id, initialRows);
    const ledger = latestLedger || initialLedger || {};
    const signal = sleeve.latest_signal || {};
    const selectedCodes = selectedCodesList(signal.selected_codes || ledger.selected_codes);
    const canStart = Boolean(sleeve.can_start_observation);
    const paperAction = ledger.paper_action || signal.action || (canStart ? 'open_allowed' : 'record_only');
    const blockedReasons = Array.isArray(sleeve.blocked_reasons) ? sleeve.blocked_reasons : [];
    const selectedCount = signal.selected_count ?? ledger.selected_count ?? (selectedCodes.length ? selectedCodes.length : null);
    const payloadType = selectedCodes.length
      ? 'latest_selected_codes'
      : (sleeve.role === 'primary_controller' ? 'controller_strategy_logic' : 'no_single_day_codes');
    return {
      sleeve_id: sleeve.sleeve_id || '',
      strategy_id: sleeve.strategy_id || '',
      strategy_name: sleeve.strategy_name || '',
      evidence_system: sleeve.evidence_system || '',
      operational_status: sleeve.operational_status || ledger.gate_status || '',
      bigquant_test_status: canStart ? 'ready_for_bigquant_real_test' : 'blocked_before_bigquant_test',
      bigquant_test_priority: canStart ? 'test_now' : 'record_only_until_gate_passed',
      can_start_observation: canStart,
      paper_action: paperAction,
      planned_weight: Number(ledger.planned_weight || 0),
      bigquant_payload_type: payloadType,
      signal_date: signal.signal_date || ledger.date || '',
      candidate_count: signal.candidate_count ?? ledger.candidate_count ?? null,
      selected_count: selectedCount,
      selected_codes: selectedCodes,
      target_market_regime: sleeve.latest_signal_review?.target_market_regime || '',
      target_market_cap_bucket: sleeve.latest_signal_review?.target_market_cap_bucket || '',
      actual_market_regime: sleeve.latest_signal_review?.market_regime || signal.market_regime || '',
      entry_gate: Array.isArray(sleeve.entry_gate) ? sleeve.entry_gate : [],
      pause_rules: normalizeBigQuantPauseRules(sleeve.pause_rules),
      blocked_reasons: blockedReasons,
      baseline: compactMetricPack(sleeve.baseline || {}),
      latest_review_decision: sleeve.latest_signal_review?.decision || sleeve.tradeability_review?.decision || '',
      data_policy: sleeve.data_policy || '',
      notes: [
        canStart
          ? '可以提交 BigQuant 做真实回测/模拟验证；结果未回填前仍只算待测输入。'
          : '未通过本地准入，不得在 BigQuant 结果回填前手工改成可开仓。',
        payloadType === 'controller_strategy_logic'
          ? '该资金袖是状态切换控制器，BigQuant应复现策略逻辑和分层规则，不是直接用单日 selected_codes 回测。'
          : '',
        blockedReasons.join('；'),
      ].filter(Boolean).join(' '),
    };
  });
}

function buildBigQuantPaperWatchPack() {
  const operationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const matrix = readJsonFile(strategyMaturityMatrixPath, {});
  const dailyRefresh = readJsonFile(paperWatchDailyRefreshLatestPath, {});
  const ledgerRows = readImportedPaperWatchLedger();
  const targets = buildBigQuantPaperWatchTargets(operationsPack, ledgerRows);
  const pack = {
    source: 'm_quant_bigquant_paper_watch_test_pack',
    generated_at: new Date().toISOString(),
    result_status: 'pending_bigquant_real_backtest',
    data_policy: [
      '本包只从 M-quant 已落地真实证据生成 BigQuant 待测试输入。',
      '不生成 BigQuant 收益、净值、成交、持仓或通过结论。',
      'BigQuant 实测后必须把真实结果回填项目，才能改变策略状态。',
    ].join(' '),
    source_files: {
      operations_pack: relativeProjectPath(paperWatchOperationsPackPath),
      maturity_matrix: relativeProjectPath(strategyMaturityMatrixPath),
      daily_refresh_latest: relativeProjectPath(paperWatchDailyRefreshLatestPath),
      latest_saved_pack: relativeProjectPath(bigQuantPaperWatchPackPath),
    },
    readiness_summary: {
      operations_status: operationsPack.status || 'missing',
      ready_sleeve_count: operationsPack.ready_sleeve_count ?? 0,
      blocked_sleeve_count: operationsPack.blocked_sleeve_count ?? 0,
      maturity_goal_status: matrix.goal_status || 'missing',
      maturity_ready_strategy_count: matrix.ready_strategy_count ?? 0,
      daily_refresh_ok: dailyRefresh.ok === true,
      daily_refresh_mode: dailyRefresh.mode || '',
      daily_refresh_finished_at: dailyRefresh.finished_at || '',
    },
    bigquant_workflow: [
      '先下载 JSON 或 CSV 包，并在 BigQuant 中按 strategy_id/sleeve_id 建立独立测试任务。',
      '只测试 bigquant_test_status=ready_for_bigquant_real_test 的资金袖；blocked_before_bigquant_test 只能做记录或排队。',
      '测试时按 selected_codes、signal_date、entry_gate、pause_rules 保持同一口径，不能扩大到未审计分层。',
      'BigQuant 产生真实收益、净值、成交、持仓或风控结果后，再回填 M-quant；未回填前页面仍显示待测。',
    ],
    import_back_after_bigquant: {
      target_section: '准模拟盘 / 账本回填，或后续 BigQuant 回测结果回填接口',
      required_fields: [
        'platform',
        'strategy_id',
        'sleeve_id',
        'test_start',
        'test_end',
        'benchmark',
        'annual_return',
        'max_drawdown',
        'sharpe',
        'win_rate',
        'turnover',
        'net_value_curve',
        'positions_or_selected_codes',
        'data_policy',
      ],
    },
    targets,
  };
  writeFileSync(bigQuantPaperWatchPackPath, `${JSON.stringify(pack, null, 2)}\n`);
  return pack;
}

function buildBigQuantPaperWatchCsv(pack = buildBigQuantPaperWatchPack()) {
  const headers = [
    'sleeve_id',
    'strategy_id',
    'strategy_name',
    'bigquant_test_status',
    'bigquant_test_priority',
    'can_start_observation',
    'paper_action',
    'planned_weight',
    'bigquant_payload_type',
    'signal_date',
    'candidate_count',
    'selected_count',
    'selected_codes',
    'target_market_regime',
    'target_market_cap_bucket',
    'actual_market_regime',
    'operational_status',
    'latest_review_decision',
    'strategy_return',
    'max_drawdown',
    'sharpe',
    'blocked_reasons',
    'entry_gate',
    'pause_rules',
    'data_policy',
  ];
  return [
    headers.join(','),
    ...pack.targets.map((target) => headers.map((header) => {
      let value = target[header];
      if (header in (target.baseline || {})) value = target.baseline[header];
      if (Array.isArray(value)) value = value.join('|');
      return csvCell(value);
    }).join(',')),
  ].join('\n');
}

function buildBigQuantPaperWatchGuide(pack = buildBigQuantPaperWatchPack()) {
  const lines = [
    '# M-quant BigQuant准模拟盘测试包',
    '',
    `生成时间：${pack.generated_at}`,
    '',
    '## 数据原则',
    '',
    pack.data_policy,
    '',
    '## 当前状态',
    '',
    `- 运行包状态：${pack.readiness_summary.operations_status}`,
    `- 可观察资金袖：${pack.readiness_summary.ready_sleeve_count}`,
    `- 阻塞资金袖：${pack.readiness_summary.blocked_sleeve_count}`,
    `- 最近一键刷新：${pack.readiness_summary.daily_refresh_ok ? 'OK' : '未完成或失败'} / ${pack.readiness_summary.daily_refresh_mode || '-'} / ${pack.readiness_summary.daily_refresh_finished_at || '-'}`,
    '',
    '## BigQuant执行步骤',
    '',
    ...pack.bigquant_workflow.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 待测试资金袖',
    '',
    ...pack.targets.flatMap((target) => [
      `### ${target.strategy_name || target.strategy_id}`,
      '',
      `- sleeve_id：${target.sleeve_id}`,
      `- 状态：${target.bigquant_test_status}`,
      `- 动作：${target.paper_action}，计划权重：${target.planned_weight}`,
      `- 信号日：${target.signal_date || '-'}`,
      `- 入选数量：${target.selected_count ?? 0}`,
      `- 入选代码：${target.selected_codes.join(', ') || '-'}`,
      `- 阻塞原因：${target.blocked_reasons.join('；') || '-'}`,
      `- 数据原则：${target.data_policy || '-'}`,
      '',
    ]),
    '## 回填要求',
    '',
    `回填位置：${pack.import_back_after_bigquant.target_section}`,
    '',
    ...pack.import_back_after_bigquant.required_fields.map((field) => `- ${field}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
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

function reviewNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function akshareCandidateReviewPasses(record) {
  const sampleDates = toNumber(record?.sample_dates, 0);
  const strategyReturn = reviewNumber(record?.strategy_return);
  const annualReturn = reviewNumber(record?.strategy_annual_return ?? record?.annual_return);
  const maxDrawdown = reviewNumber(record?.max_drawdown);
  const sharpe = reviewNumber(record?.sharpe);
  const winRate = reviewNumber(record?.daily_win_rate);
  const checks = {
    annualReturn: Number.isFinite(annualReturn) && annualReturn >= 0.20,
    maxDrawdown: Number.isFinite(maxDrawdown) && maxDrawdown >= -0.15,
    sampleDates: sampleDates >= 30,
    sharpe: Number.isFinite(sharpe) && sharpe >= 1.20,
    strategyReturn: Number.isFinite(strategyReturn) && strategyReturn >= 0.20,
    winRate: Number.isFinite(winRate) && winRate >= 0.52,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function summarizeAkshareCandidateReviewResults() {
  const records = flattenStrategyResultRecords(readImportedStrategyResults())
    .filter((record) => record?.source === 'joinquant_akshare_ohlcv_candidate_review');
  const targetRouteRecords = records.filter((record) => (
    record.result_type === 'strategy_trading_backtest'
    && (record.review_layer_type === 'target_volatility_liquidity_route' || record.layer === '目标路线')
  ));
  const evaluatedTargetRoutes = targetRouteRecords.map((record) => {
    const gate = akshareCandidateReviewPasses(record);
    return {
      ...record,
      gate_checks: gate.checks,
      gate_passed: gate.passed,
    };
  });
  const passedTargetRoutes = evaluatedTargetRoutes.filter((record) => record.gate_passed);
  const bestTargetRoute = evaluatedTargetRoutes
    .slice()
    .sort((left, right) => {
      const leftScore = (reviewNumber(left.sharpe) ?? -999) * 100
        + (reviewNumber(left.strategy_return) ?? -999) * 10
        + (reviewNumber(left.max_drawdown) ?? -999);
      const rightScore = (reviewNumber(right.sharpe) ?? -999) * 100
        + (reviewNumber(right.strategy_return) ?? -999) * 10
        + (reviewNumber(right.max_drawdown) ?? -999);
      return rightScore - leftScore;
    })[0] || null;

  return {
    bestTargetRoute,
    candidateCount: new Set(records.map((record) => record.strategy_id).filter(Boolean)).size,
    importedRecordCount: records.length,
    passedTargetRouteCount: passedTargetRoutes.length,
    passedTargetRoutes,
    targetRouteCount: targetRouteRecords.length,
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
  const indexEnhancement = buildIndexEnhancementReport();
  const primaryMeta = primary.factor_meta || {};
  const capitalMeta = capital.factor_meta || {};
  const primaryAvailability = primaryMeta.availability || {};
  const capitalAvailability = capitalMeta.availability || {};
  const indexEnhancementAvailability = indexEnhancement.researchAvailable ? Object.fromEntries(
    Object.entries(indexEnhancement.factorDefinitions || {}).map(([id, definition]) => [id, {
      category: definition.category,
      dataSource: 'akshare_index_enhancement',
      direction: definition.direction,
      displayName: definition.displayName,
      fields: definition.fields,
      formula: definition.formula,
      note: '指数增强子因子，仅保留为严格门禁审计输入；未过门禁的 ie_* 复合 alpha 不进入当前候选池。',
      status: 'computed',
      usage: definition.usage,
    }]),
  ) : {};

  if (!Object.keys(capital).length && !Object.keys(indexEnhancementAvailability).length) return primary;

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
        ...indexEnhancementAvailability,
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
  const importedFactorResults = importedResults.filter((result) => !isStrategyBacktestRecord(result));
  const importedStrategyResults = importedResults.filter(isStrategyBacktestRecord);
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
      importedFactorResultCount: importedFactorResults.length,
      importedStrategyResultCount: importedStrategyResults.length,
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
    importedFactorResults,
    importedResults,
    importedStrategyResults,
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

const researchFactorDisplayNames = {
  active_large_order_accumulation: '超大/大单吸筹代理',
  capital_source_count: '资金来源数',
  f_anti_crowding: '指数增强反拥挤',
  f_close_strength: '指数增强收盘强度',
  f_gap_risk_control: '指数增强跳空风险控制',
  f_market_regime_fit: '指数增强市场适配',
  f_medium_momentum: '指数增强中期动量',
  f_orderly_trend: '指数增强有序趋势',
  f_residual_low_volatility: '指数增强残差低波',
  f_short_reversal: '指数增强短反转',
  f_volume_stability: '指数增强量能稳定',
  f_volume_confirmation: '指数增强量价确认（f_volume_confirmation）',
};

function canonicalFactorId(id) {
  return researchFactorAliases[id] || id;
}

function researchFactorDisplayName(id) {
  if (researchFactorDisplayNames[id]) return researchFactorDisplayNames[id];
  const exportable = exportableBacktestFactors.find((factor) => factor.id === id);
  if (exportable) return exportable.name;
  const definition = indicatorFactorDefinitions.find((factor) => canonicalFactorId(factor.id) === id);
  return definition?.name || id;
}

function factorResultId(result) {
  return result.factor_name || result.factor || result.name || 'unknown';
}

function canonicalFactorResultId(result) {
  const id = factorResultId(result);
  const indexEnhancementPrefix = /^index_enhancement_(?:csi300|csi500)_/;
  if (indexEnhancementPrefix.test(id)) return canonicalFactorId(id.replace(indexEnhancementPrefix, ''));
  return canonicalFactorId(id);
}

function summarizeImportedResults(results) {
  return results.reduce((groups, result) => {
    const factorId = canonicalFactorResultId(result);
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

function readAkshareFactorQualityAudit() {
  return readJsonFile(akshareFactorQualityAuditPath, {});
}

function akshareFactorDecisionStatus(decision) {
  if (decision === 'alpha_candidate') return 'strategy_candidate';
  if (decision === 'watch' || decision === 'significant_not_tradeable') return 'watch';
  if (decision === 'reject_standalone') return 'hold';
  return 'tracking';
}

function akshareFactorBacktestProfile(factorId, role = 'signal') {
  const audit = readAkshareFactorQualityAudit();
  const record = (Array.isArray(audit.factors) ? audit.factors : [])
    .find((factor) => factor.factor_id === factorId);
  if (!record) return null;
  const best = record.best_primary_result || null;
  const allResults = Array.isArray(record.all_results) ? record.all_results : [];
  const rankIc = Number(best?.rank_ic_mean);
  const rankIcT = Number(best?.rank_ic_t);
  const longShort = Number(best?.long_short_mean);
  const positiveRatio = Number(best?.long_short_positive_ratio);
  return {
    bestHorizon: best?.horizon ?? null,
    bestLongShort: Number.isFinite(longShort) ? longShort : null,
    bestPositiveRatio: Number.isFinite(positiveRatio) ? positiveRatio : null,
    bestRankIc: Number.isFinite(rankIc) ? rankIc : null,
    bestRankIcT: Number.isFinite(rankIcT) ? rankIcT : null,
    bestSampleDates: Number(best?.sample_dates || 0),
    detail: allResults
      .filter((result) => [1, 5, 10, 20].includes(toNumber(result.horizon, 0)))
      .sort((left, right) => toNumber(left.horizon, 0) - toNumber(right.horizon, 0))
      .map((result) => ({
        horizon: toNumber(result.horizon, 0),
        isReferenceOnly: toNumber(result.horizon, 0) === 1,
        longShort: Number.isFinite(Number(result.long_short_mean)) ? Number(result.long_short_mean) : null,
        positiveRatio: Number.isFinite(Number(result.long_short_positive_ratio)) ? Number(result.long_short_positive_ratio) : null,
        rankIc: Number.isFinite(Number(result.rank_ic_mean)) ? Number(result.rank_ic_mean) : null,
        rankIcT: Number.isFinite(Number(result.rank_ic_t)) ? Number(result.rank_ic_t) : null,
        sampleDates: Number(result.sample_dates || 0),
        source: result.data_source || 'akshare_local_ohlcv',
      })),
    evidence: `${record.evidence || 'AkShare 本地 OHLCV 因子已完成真实历史检验。'} 数据源：${audit.source || 'akshare_factor_quality_audit'}。`,
    factorId,
    name: record.name || researchFactorDisplayName(factorId),
    primaryHorizonCount: Number(record.primary_result_count || allResults.length || 0),
    referenceHorizonCount: 0,
    role,
    status: akshareFactorDecisionStatus(record.decision),
  };
}

function factorBacktestProfile(factorId, role = 'signal') {
  const canonicalId = canonicalFactorId(factorId);
  const importedResults = readImportedFactorResults().filter((result) => canonicalFactorResultId(result) === canonicalId);
  if (!importedResults.length) {
    const akshareProfile = akshareFactorBacktestProfile(factorId, role);
    if (akshareProfile) return akshareProfile;
  }
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
    strategyFactor('active_large_order_accumulation', '超大/大单吸筹代理', 0.25),
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
  const akshareJqReviewSummary = summarizeAkshareCandidateReviewResults();
  const akshareJqReviewImported = akshareJqReviewSummary.importedRecordCount > 0;
  const akshareJqReviewPassed = akshareJqReviewSummary.passedTargetRouteCount > 0;
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
  const akshareContractionBreakoutFactors = [
    strategyFactor('ak_volatility_contraction_quality', '波动收缩质量', 0.30),
    strategyFactor('ak_breakout_confirmation', '突破确认', 0.28),
    strategyFactor('ak_volume_price_confirmation', '量价确认', 0.18),
    strategyFactor('ak_liquidity_stability', '流动性稳定', 0.12),
    strategyFactor('ak_trend_quality', '趋势质量', 0.10),
    strategyFactor('ak_crowding_risk', '拥挤风险扣分', -0.18),
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
  const capitalStrategyBacktested = Boolean(capitalStrategyStats?.all?.length);
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
  const paperWatchOperationsPack = readJsonFile(paperWatchOperationsPackPath, {});
  const paperWatchSleeves = Array.isArray(paperWatchOperationsPack.capital_sleeves)
    ? paperWatchOperationsPack.capital_sleeves
    : [];
  const akshareLocalSwitchSleeve = paperWatchSleeves.find((sleeve) => (
    sleeve?.sleeve_id === 'akshare_local_switch'
    || sleeve?.strategy_id === 'akshare_regime_switch_contraction_mean_reversion_v1'
  ));
  const corePaperWatchSleeve = paperWatchSleeves.find((sleeve) => (
    sleeve?.sleeve_id === 'jq_medium_vol_small_cap_core'
    || sleeve?.strategy_id === 'core_volume_price_trend_v1'
  ));
  const corePaperWatchLatestSignal = corePaperWatchSleeve?.latest_signal || {};
  const corePaperWatchLatestReview = corePaperWatchSleeve?.latest_signal_review || {};
  const corePaperWatchBlockedReasons = Array.isArray(corePaperWatchSleeve?.blocked_reasons)
    ? corePaperWatchSleeve.blocked_reasons
    : [];
  const corePaperWatchStateText = corePaperWatchSleeve
    ? `准模拟盘运行包已建；当前 ${corePaperWatchSleeve.operational_status || '-'}，最新复核 ${corePaperWatchLatestReview.decision || '-'}，市场 ${corePaperWatchLatestReview.market_regime || corePaperWatchLatestSignal.market_regime || '-'}，入选 ${corePaperWatchLatestSignal.selected_count ?? corePaperWatchLatestReview.selected_count ?? 0} 只。`
    : '';
  const akshareBaseline = akshareLocalSwitchSleeve?.baseline || {};
  const akshareLatestSignal = akshareLocalSwitchSleeve?.latest_signal || {};
  const akshareTradeabilityReview = akshareLocalSwitchSleeve?.tradeability_review || {};
  const akshareSelectedCodes = Array.isArray(akshareLatestSignal.selected_codes)
    ? akshareLatestSignal.selected_codes
    : [];
  const akshareReadyForPaperWatch = Boolean(
    akshareLocalSwitchSleeve?.can_start_observation
    && akshareLocalSwitchSleeve?.operational_status === 'ready_for_controlled_paper_watch'
    && akshareTradeabilityReview.decision === 'tradeability_review_passed',
  );
  const indexEnhancement = buildIndexEnhancementReport();
  const indexEnhancementPrimary = Array.isArray(indexEnhancement.primary) ? indexEnhancement.primary : [];
  const indexEnhancementConservative = Array.isArray(indexEnhancement.conservative) ? indexEnhancement.conservative : [];
  const indexEnhancementRows = [...indexEnhancementPrimary, ...indexEnhancementConservative];
  const indexEnhancementCsi300 = indexEnhancementPrimary.find((item) => item.dataset === 'csi300') || {};
  const indexEnhancementCsi500 = indexEnhancementPrimary.find((item) => item.dataset === 'csi500') || {};
  const csi500LcrStrategyId = 'csi500_low_crowding_reversal_index_enhancement_v0';
  const csi500LcrStrategyStats = strategyResultStats[csi500LcrStrategyId];
  const csi500LcrFactorResults = readImportedFactorResults().filter((result) => (
    result.strategy_id === csi500LcrStrategyId
    || result.source === 'joinquant_csi500_low_crowding_reversal_index_enhancement_v0'
  ));
  const csi500LcrValidation = buildStrategyValidation(csi500LcrStrategyStats, '中证500低拥挤反转指数增强策略');
  const csi500LcrLayeredValidation = buildLayeredStrategyValidation(csi500LcrStrategyStats, '中证500低拥挤反转指数增强策略');
  const csi500LcrTradingValidation = buildTradingStrategyValidation(csi500LcrStrategyStats, '中证500低拥挤反转指数增强策略');
  const csi500LcrTradingResult = csi500LcrTradingValidation.tradingResult;
  const csi500LcrStatus = csi500LcrTradingResult?.strategy_status || (csi500LcrStrategyStats?.all?.length ? 'real_strategy_backtested' : 'waiting_joinquant_retest');
  const csi500LcrStatusName = csi500LcrTradingResult?.strategy_status_name || (csi500LcrStrategyStats?.all?.length ? '已有真实策略回测，等待准模拟盘审计' : '等待 JoinQuant 原生复测');
  const csi500LcrPaperWatchCandidate = csi500LcrStatus === 'paper_trade_candidate'
    && csi500LcrValidation.validated
    && csi500LcrLayeredValidation.validated
    && csi500LcrTradingValidation.validated;
  const csi500LcrFactorGatePassCount = toNumber(csi500LcrTradingResult?.factor_gate_pass_count, csi500LcrFactorResults.filter((result) => result.gate_passed).length);
  const csi500LcrFactors = [
    strategyFactor('jq_lcr_active_reversal', '主动反转修复', 0.30),
    strategyFactor('jq_lcr_low_crowding_resilience', '低拥挤韧性', 0.22),
    strategyFactor('jq_lcr_residual_low_volatility', '残差低波', 0.18),
    strategyFactor('jq_lcr_volume_stability', '量能稳定', 0.15),
    strategyFactor('jq_lcr_gap_risk_control', '跳空风险控制', 0.10),
    strategyFactor('jq_lcr_short_reversal', '短期反转', 0.05),
  ];
  const csi500LcrV1 = readLatestCsi500LcrV1Candidate();
  const csi500LcrV1Primary = csi500LcrV1?.primary_trading || null;
  const csi500LcrV1LatestSelection = csi500LcrV1?.latest_selection || {};
  const csi500LcrV1SelectedCodes = Array.isArray(csi500LcrV1LatestSelection.selected_codes)
    ? csi500LcrV1LatestSelection.selected_codes
    : [];
  const csi500LcrV1Checks = csi500LcrV1?.strategy_checks || {};
  const csi500LcrV1Ready = Boolean(
    csi500LcrV1Primary
    && csi500LcrV1?.strategy_status === 'candidate_for_pressure_test'
    && csi500LcrV1Checks.primary_exists
    && csi500LcrV1Checks.primary_positive_return
    && csi500LcrV1Checks.primary_positive_excess
    && csi500LcrV1Checks.primary_active_sharpe_positive
    && csi500LcrV1Checks.primary_drawdown_within_floor
  );
  const csi500LcrV1Factors = Object.entries(csi500LcrV1?.v1_config?.weights || {}).map(([factor, weight]) => strategyFactor(factor, factor, weight));
  const csi500LcrV1KeptFactorCount = Array.isArray(csi500LcrV1?.kept_factors) ? csi500LcrV1.kept_factors.length : csi500LcrV1Factors.length;
  const csi500LcrV1AllowedLayerNames = Array.isArray(csi500LcrV1?.allowed_layer_names) ? csi500LcrV1.allowed_layer_names : [];
  const formalStrategiesUnsorted = [
    ...(csi500LcrV1Ready
      ? [
        {
          id: 'csi500_low_crowding_reversal_index_enhancement_v2',
          name: '中证500低拥挤反转指数增强候选策略 v2',
          pool: 'formal_candidate',
          status: 'candidate_for_pressure_test',
          validationState: 'v2 继承 v1 因子门禁与最新候选名单，执行层改为信号驱动动态持仓：默认5日锚定，20日后只做趋势健康检查，强趋势可延续到60日硬上限；跌出Buffer80、分数衰减、止损或止盈回撤时退出。',
          role: '压力测试候选：中证500指数增强袖 v2 执行优化',
          objective: '在 v1 选股基础上修正“次日固定卖出”的压测偏差，让买入卖出由每日信号和风险约束共同决定。',
          dataBasis: `${csi500LcrV1.data_policy || '真实 JoinQuant factor slice 合并复算；v2 当前使用本地 OHLCV 执行压测复核。'} 最新信号 ${csi500LcrV1LatestSelection.date || '-'}，入选 ${csi500LcrV1SelectedCodes.length || csi500LcrV1LatestSelection.selected_count || 0} 只。`,
          factorState: csi500LcrV1Factors,
          rankingFormula: '沿用 v1 排序：0.25*量能稳定 + 0.25*市值中性量稳 + 0.35*量能流动性均衡 + 0.15*残差量稳；执行层用 Top15/Buffer80 的信号复核决定续持或退出。',
          entryRules: [
            '沿用 v1 通过门禁的候选名单和 OHLCV 代理分数执行压测',
            '空仓槽位按当天信号补入，不再每日全卖全买',
            '默认持仓锚定5个交易日；T+1 后每日复核信号',
            `最新名单：${csi500LcrV1SelectedCodes.slice(0, 8).join(', ')}${csi500LcrV1SelectedCodes.length > 8 ? '...' : ''}`,
          ],
          riskFilters: [
            '止损：单票从成交价回撤8%退出',
            '止盈：单票浮盈达到12%后，从峰值回撤6%退出',
            '信号退出：持满5日后跌出Buffer80或分数衰减30%退出',
            '趋势延续保护：20日后仍在前40且收益超过3%，不因到期机械卖出',
            '硬上限60个交易日，样本结束强制平仓',
          ],
          portfolioRules: ['Top15/TopN 等权槽位', '动态补仓', '信号退出', '止损8%', '止盈回撤6%', '20日趋势复核', '60日硬上限'],
          nextAction: '运行 v2 建仓压力测试，检查成交明细中的持仓交易日和退出原因分布，再决定是否回写 JoinQuant 原生账本。',
          candidateCount: csi500LcrV1SelectedCodes.length || csi500LcrV1Primary.sample_trades || 0,
          computedSignalCount: csi500LcrV1Primary.sample_dates || csi500LcrV1?.slice_audit?.factor_dates || 0,
          exportable: false,
          exportStatus: 'v2 已登记为执行层优化候选；需要动态持仓压测和 JoinQuant 复核。',
        },
        {
          id: csi500LcrV1.strategy_id || 'csi500_low_crowding_reversal_index_enhancement_v1',
          name: csi500LcrV1.strategy_name || '中证500低拥挤反转指数增强候选策略 v1',
          pool: 'formal_candidate',
          status: 'candidate_for_pressure_test',
          validationState: `已生成 v1 真实调仓候选包：${csi500LcrV1Primary.horizon_label || '5日真实调仓'}，主动收益 ${(Number(csi500LcrV1Primary.excess_return || 0) * 100).toFixed(2)}%，主动Sharpe ${Number(csi500LcrV1Primary.active_sharpe || 0).toFixed(2)}，最大回撤 ${(Number(csi500LcrV1Primary.max_drawdown || 0) * 100).toFixed(2)}%，平均换手 ${Number(csi500LcrV1Primary.avg_turnover || 0).toFixed(3)}；保留因子 ${csi500LcrV1KeptFactorCount} 个。`,
          role: '压力测试候选：中证500指数增强袖 v1',
          objective: '在 v0 基础上先做因子门禁，保留量能稳定、流动性均衡、市值中性量稳和残差量稳，过滤拖累分层后用真实调仓步长做中证500增强。',
          dataBasis: `${csi500LcrV1.data_policy || '真实 JoinQuant factor slice 合并复算；交易回测使用非重叠真实调仓步长。'} 样本 ${csi500LcrV1Primary.sample_dates || 0} 个调仓日，最新信号 ${csi500LcrV1LatestSelection.date || '-'}，入选 ${csi500LcrV1SelectedCodes.length || csi500LcrV1LatestSelection.selected_count || 0} 只。`,
          factorState: csi500LcrV1Factors,
          rankingFormula: '0.25*量能稳定 + 0.25*市值中性量稳 + 0.35*量能流动性均衡 + 0.15*残差量稳；Top15 / Buffer80 / 分层过滤 / 市值中性 / 流动性25%过滤。',
          entryRules: [
            '只使用通过 20日门禁且 5日同向为正的因子',
            `开放分层：${csi500LcrV1AllowedLayerNames.join('、') || '等待候选包回填'}`,
            '5日真实调仓作为主压力测试口径，同时保留10日和20日成本压力结果',
            `最新压力测试名单：${csi500LcrV1SelectedCodes.slice(0, 8).join(', ')}${csi500LcrV1SelectedCodes.length > 8 ? '...' : ''}`,
          ],
          riskFilters: [
            '当前状态是可进入压力测试候选，不等于正式实盘批准',
            '已剔除 20日门禁未通过或 5日多空不为正的低拥挤/反转类旧因子',
            '继续补真实指数权重、行业暴露、停牌涨跌停、容量和样本外模拟观察账本',
          ],
          portfolioRules: ['中证500历史成分内选股', 'Top15 等权增强候选', 'Buffer80 换手缓冲', '5/10/20日非重叠真实调仓', '成本1.0x/1.5x/2.0x压力测试'],
          nextAction: '已进入策略池；下一步用最新 Top15 名单跑建仓压力测试、交易可行性和受控模拟观察审计。',
          candidateCount: csi500LcrV1Primary.sample_trades || csi500LcrV1SelectedCodes.length || 0,
          computedSignalCount: csi500LcrV1Primary.sample_dates || csi500LcrV1?.slice_audit?.factor_dates || 0,
          exportable: false,
          exportStatus: `v1 已达压力测试候选标准；${csi500LcrV1.strategy_status_name || '可进入压力测试候选'}`,
        },
      ]
      : []),
    ...(csi500LcrPaperWatchCandidate
      ? [
        {
          id: csi500LcrStrategyId,
          name: '中证500低拥挤反转指数增强候选策略 v0',
          pool: 'formal_candidate',
          status: 'paper_trade_candidate',
          validationState: `${csi500LcrValidation.evidence} ${csi500LcrLayeredValidation.evidence} ${csi500LcrTradingValidation.evidence} 因子门禁通过 ${csi500LcrFactorGatePassCount} 个；${csi500LcrStatusName}。`,
          role: '准模拟盘候选：中证500指数增强袖',
          objective: '围绕中证500基准做低拥挤、反转修复、残差低波和量能稳定的主动增强，优先控制主动回撤和换手。',
          dataBasis: `JoinQuant 原生结果 ${csi500LcrStrategyStats.all.length} 条；因子实测 ${csi500LcrFactorResults.length} 条；使用历史成分、OHLCV、market_cap、turnover_ratio 和指数行情。`,
          factorState: csi500LcrFactors,
          rankingFormula: '0.30*主动反转修复 + 0.22*低拥挤韧性 + 0.18*残差低波 + 0.15*量能稳定 + 0.10*跳空风险控制 + 0.05*短期反转；通过门禁的因子优先重归一。',
          entryRules: [
            '因子必须先完成 1/5/10/20 日 JoinQuant RankIC 与多空收益复测',
            '策略组合默认取中证500成分内评分前100只',
            '1/5/10/20日调仓交易净值必须扣交易成本和滑点，5日调仓作为准模拟盘主准入周期',
            '基准使用同日中证500成分等权收益，重点看主动收益和主动回撤',
          ],
          riskFilters: [
            '准模拟盘只记录样本外观察，不直接等同实盘批准',
            '高/中/低波动 × 大/中/小市值九宫格必须完整回填',
            '未通过的分层不得单独放开为模拟盘交易袖',
            '后续仍需补行业暴露、真实指数权重、停牌涨跌停和容量审计',
          ],
          portfolioRules: ['中证500成分内选股', 'Top100 等权增强诊断', '1/5/10/20日调仓；5日主准入', '高中低波动 × 大中小市值分层审计'],
          nextAction: '进入受控模拟观察账本前，先检查最近一期可交易名单、行业暴露和单票权重约束。',
          candidateCount: csi500LcrTradingResult?.sample_trades || 0,
          computedSignalCount: csi500LcrTradingResult?.sample_dates || csi500LcrFactorResults.length,
          exportable: false,
          specialBacktestScriptEndpoint: '/strategy-api/joinquant-csi500-low-crowding-reversal-index-enhancement.py',
          exportStatus: `已达准模拟盘候选标准；${csi500LcrStatusName}`,
        },
      ]
      : []),
    ...(coreStrategyValidated
      ? [
      {
        id: 'core_volume_price_trend_v1',
        name: '核心量价趋势策略 v1',
        pool: 'formal_candidate',
        status: 'real_strategy_backtested',
        validationState: `${coreStrategyEvidence} ${coreLayeredValidation.evidence} ${coreTradingValidation.evidence} ${corePaperWatchStateText} 口径为 JoinQuant OHLCV 历史重建，非 Yiwan 全字段等价复刻。`,
        role: corePaperWatchSleeve?.can_start_observation ? '已实测正式候选；准模拟盘可观察' : '已实测正式候选；准模拟盘待准入',
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
          corePaperWatchSleeve?.can_start_observation
            ? '准模拟盘运行包已允许 open_allowed，但仍只按账本记录样本外表现'
            : `准模拟盘当前只能 record_only：${corePaperWatchBlockedReasons.join('；') || '最新信号未满足准入门槛'}`,
          '正式实盘前继续做样本外、交易成本、换手和回撤审计',
        ],
        portfolioRules: ['候选池排序前30只', '5日调仓脚本已生成', '当前只作为正式候选，不等于实盘批准'],
        nextAction: corePaperWatchSleeve?.can_start_observation
          ? '开始真实模拟观察账本记录，并持续监控暂停规则；不得回填事后挑选收益。'
          : '等待下一次 JoinQuant 最新信号复核达到 medium_volatility/small_cap 且 selected_count>=10；当前只记录阻塞状态。',
        candidateCount: entryCandidates.length,
        computedSignalCount: coreRows.length,
        exportStatus: corePaperWatchSleeve
          ? `已有真实策略级结果；准模拟盘当前 ${corePaperWatchSleeve.operational_status || '待准入'}`
          : '已有真实策略级结果，仍需交易成本和样本外审计',
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
    ...(akshareReadyForPaperWatch
      ? [
        {
          id: akshareLocalSwitchSleeve.strategy_id || 'akshare_regime_switch_contraction_mean_reversion_v1',
          name: akshareLocalSwitchSleeve.strategy_name || 'AkShare本地高低波动切换策略 v1',
          pool: 'formal_candidate',
          status: 'paper_trade_candidate',
          validationState: `已进入模拟观察候选：AkShare 本地 OHLCV 回测 ${Number(akshareBaseline.sample_trades || 0)} 期，收益 ${(Number(akshareBaseline.strategy_return || 0) * 100).toFixed(2)}%，最大回撤 ${(Number(akshareBaseline.max_drawdown || 0) * 100).toFixed(2)}%，Sharpe ${Number(akshareBaseline.sharpe || 0).toFixed(2)}；2026-07-09 JoinQuant 最新信号交易可行性复核 ${Number(akshareTradeabilityReview.tradable_count || 0)}/${Number(akshareTradeabilityReview.candidate_count || 0)} 可交易。`,
          role: '准模拟盘候选：AkShare本地独立资金袖',
          objective: '根据市场高低波动状态切换收缩突破与均值回归组件，只在本地真实 OHLCV 已审计且最新信号可交易时进入观察。',
          dataBasis: `${akshareLocalSwitchSleeve.evidence_system || 'AkShare local OHLCV'}；最新交易可行性复核来源 ${akshareTradeabilityReview.source || 'JoinQuant'}；信号日 ${akshareLatestSignal.signal_date || '-'}`,
          factorState: akshareContractionBreakoutFactors,
          rankingFormula: '低波动收缩突破组件真实公式：0.30*波动收缩质量 + 0.28*突破确认 + 0.18*量价确认 + 0.12*流动性稳定 + 0.10*趋势质量 - 0.18*拥挤风险；高波动时切换到均值回归备选组件。',
          entryRules: [
            '只使用 AkShare 执行包中已审计的组件 trade_records',
            '低波动环境使用 ak_contraction_breakout_combo；高波动环境使用 ak_mean_reversion_quality_combo',
            '中流动性是入池过滤条件，不是排序公式里的额外权重',
            '最新信号必须 paper_watch_open_allowed',
            'JoinQuant 交易可行性复核必须 tradeability_review_passed',
            `当前最新组件：${akshareLatestSignal.triggered_component_name || '-'}`,
          ],
          riskFilters: [
            '收益证据来自 AkShare 本地真实 OHLCV，不写成 JoinQuant 策略收益',
            'JoinQuant 仅复核最新信号交易状态、市值、成交额和是否可交易',
            '若 tradable_count < 10、出现 ST/停牌/涨跌停不可买，暂停观察',
            '正式实盘前继续做独立样本外、行业暴露和真实模拟盘账本跟踪',
          ],
          portfolioRules: [
            '模拟观察候选上限15只',
            `当前最新入选 ${akshareSelectedCodes.length} 只：${akshareSelectedCodes.slice(0, 8).join(', ')}${akshareSelectedCodes.length > 8 ? '...' : ''}`,
            '只作为本地独立资金袖观察，不与 JoinQuant 控制器重复计算收益',
          ],
          nextAction: akshareLocalSwitchSleeve.next_action || '开始真实模拟观察账本记录，并按运行包暂停规则监控。',
          candidateCount: Number(akshareLatestSignal.candidate_count || akshareSelectedCodes.length || 0),
          computedSignalCount: Number(akshareBaseline.sample_trades || 0),
          exportable: false,
          specialBacktestScriptEndpoint: '/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py',
          exportStatus: `模拟观察证据已齐：本地稳健性通过，最新 JoinQuant 交易可行性 ${akshareTradeabilityReview.decision || '-'}；后续记录真实模拟盘样本外表现。`,
        },
      ]
      : []),
  ];
  const formalStrategyPriority = {
    csi500_low_crowding_reversal_index_enhancement_v0: 0,
    csi500_low_crowding_reversal_index_enhancement_v1: 1,
    csi500_low_crowding_reversal_index_enhancement_v2: 2,
    jq_quality_profit_liquidity_v1: 3,
    kline_assisted_confirmation: 4,
    core_volume_price_trend_v1: 5,
    capital_follow_v0: 6,
    akshare_regime_switch_contraction_mean_reversion_v1: 7,
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
      draftStrategies: 8,
      executableStrategies: [
        csi500LcrV1Ready,
        csi500LcrPaperWatchCandidate,
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
      ...(csi500LcrV1
        ? [
          {
            id: csi500LcrV1.strategy_id || 'csi500_low_crowding_reversal_index_enhancement_v1',
            name: csi500LcrV1.strategy_name || '中证500低拥挤反转指数增强候选策略 v1',
            pool: 'draft',
            status: csi500LcrV1Ready ? 'candidate_for_pressure_test' : csi500LcrV1.strategy_status || 'candidate_pending_review',
            validationState: csi500LcrV1Primary
              ? `v1 已生成真实调仓候选包：${csi500LcrV1Primary.horizon_label || '5日真实调仓'}，策略收益 ${(Number(csi500LcrV1Primary.strategy_return || 0) * 100).toFixed(2)}%，主动收益 ${(Number(csi500LcrV1Primary.excess_return || 0) * 100).toFixed(2)}%，主动Sharpe ${Number(csi500LcrV1Primary.active_sharpe || 0).toFixed(2)}，最大回撤 ${(Number(csi500LcrV1Primary.max_drawdown || 0) * 100).toFixed(2)}%。`
              : 'v1 候选包已登记，但未找到主交易回测结果。',
            role: '中证500指数增强压力测试候选',
            objective: '用通过门禁的量能稳定/流动性质量因子替代 v0 中未通过门禁的低拥挤反转因子，形成可压测的中证500增强候选。',
            dataBasis: csi500LcrV1.data_policy || '真实 JoinQuant factor slice 合并复算；5/10/20日交易回测使用非重叠真实调仓步长。',
            factorState: csi500LcrV1Factors,
            rankingFormula: '0.25*量能稳定 + 0.25*市值中性量稳 + 0.35*量能流动性均衡 + 0.15*残差量稳；Top15 / Buffer80 / 分层过滤。',
            entryRules: [
              '保留 20日门禁通过且 5日同向为正的因子',
              `Top${csi500LcrV1?.v1_config?.top_n || 15} / Buffer${csi500LcrV1?.v1_config?.buffer_n || 80}`,
              `流动性过滤分位 ${Math.round(Number(csi500LcrV1?.v1_config?.liquidity_quantile || 0) * 100)}%`,
              `开放分层：${csi500LcrV1AllowedLayerNames.join('、') || '-'}`,
            ],
            riskFilters: [
              '仍是压力测试候选，进入实盘前必须补交易可行性、行业暴露和容量审计',
              '分层过滤以候选包中的开放分层为准，未开放分层不得单独放行',
              '成本1.5x和2.0x压力结果应继续跟踪，避免高换手侵蚀主动收益',
            ],
            portfolioRules: ['中证500历史成分内选股', 'Top15 等权候选', '5/10/20日真实调仓', '成本1.0x/1.5x/2.0x压力测试', '最新名单可进入建仓压测'],
            nextAction: csi500LcrV1Ready
              ? '从策略池选择 v1，运行建仓压力测试并补最新交易可行性审计。'
              : '先检查 v1 候选包缺失的主交易回测或策略检查项。',
            candidateCount: csi500LcrV1Primary?.sample_trades || csi500LcrV1SelectedCodes.length || 0,
            computedSignalCount: csi500LcrV1Primary?.sample_dates || csi500LcrV1?.slice_audit?.factor_dates || 0,
            exportable: false,
            exportStatus: csi500LcrV1Ready ? '已补入策略池；可进入建仓压力测试候选' : '候选包已登记，等待检查项通过',
          },
        ]
        : []),
      {
        id: csi500LcrStrategyId,
        name: '中证500低拥挤反转指数增强候选策略 v0',
        pool: 'draft',
        status: csi500LcrPaperWatchCandidate ? 'paper_trade_candidate' : csi500LcrStatus,
        validationState: csi500LcrStrategyStats?.all?.length
          ? `${csi500LcrValidation.evidence} ${csi500LcrLayeredValidation.evidence} ${csi500LcrTradingValidation.evidence} 因子门禁通过 ${csi500LcrFactorGatePassCount} 个；${csi500LcrStatusName}。`
          : '等待 JoinQuant 原生复测：先跑 1/5/10/20 日因子门禁，再回填策略事件回测、1/5/10/20日调仓净值和波动×市值九宫格。',
        role: csi500LcrPaperWatchCandidate ? '准模拟盘候选：中证500指数增强袖' : '指数增强候选；等待聚宽实测',
        objective: '围绕中证500基准做低拥挤、反转修复、残差低波和量能稳定的主动增强，目标是稳健小超额而不是高换手追涨。',
        dataBasis: csi500LcrStrategyStats?.all?.length
          ? `JoinQuant 原生策略结果 ${csi500LcrStrategyStats.all.length} 条；因子实测 ${csi500LcrFactorResults.length} 条。`
          : '尚未导入 JoinQuant 结果；本地只登记策略路线和脚本入口，不展示未实测绩效。',
        factorState: csi500LcrFactors,
        rankingFormula: '0.30*主动反转修复 + 0.22*低拥挤韧性 + 0.18*残差低波 + 0.15*量能稳定 + 0.10*跳空风险控制 + 0.05*短期反转；通过门禁的因子优先重归一。',
        entryRules: [
          '所有因子先经过 JoinQuant 1/5/10/20 日 RankIC 和 Top20%-Bottom20% 多空收益复测',
          '20日主周期通过门禁后才作为正式组合因子',
          '中证500成分内评分前100只作为增强诊断组合',
          '策略级结果必须包含1/5/10/20日调仓交易净值、成本、滑点、主动收益和主动回撤；5日作为主准入周期',
        ],
        riskFilters: [
          '未回填 JoinQuant 结果前不进入正式策略池',
          '高中低波动 × 大中小市值九宫格必须完整测试',
          '准模拟盘前继续补行业暴露、真实指数权重、停牌涨跌停和容量审计',
        ],
        portfolioRules: ['中证500成分内选股', 'Top100 等权增强诊断', '1/5/10/20日调仓；5日主准入', '高中低波动 × 大中小市值分层审计'],
        nextAction: csi500LcrStrategyStats?.all?.length
          ? (csi500LcrPaperWatchCandidate ? '检查最近一期可交易名单和行业暴露，准备受控模拟观察账本。' : '查看未通过的因子门禁、主动收益或九宫格分层，决定是否调整因子权重。')
          : '下载专属 JoinQuant 脚本，在 JoinQuant Python3 研究环境运行后，将打印 JSON 粘贴回结果回填。',
        candidateCount: csi500LcrTradingResult?.sample_trades || 0,
        computedSignalCount: csi500LcrTradingResult?.sample_dates || csi500LcrFactorResults.length,
        exportable: false,
        specialBacktestScriptEndpoint: '/strategy-api/joinquant-csi500-low-crowding-reversal-index-enhancement.py',
        exportStatus: csi500LcrStrategyStats?.all?.length ? csi500LcrStatusName : '已生成 JoinQuant 原生复测脚本；等待真实结果回填',
      },
      {
        id: 'core_volume_price_trend_v1',
        name: '核心量价趋势策略 v1',
        pool: 'draft',
        status: coreStrategyValidated ? 'real_strategy_backtested' : 'real_signal_computed',
        validationState: coreStrategyValidated
          ? `${coreStrategyEvidence} ${corePaperWatchStateText} 仍保留在草案池中，方便继续导出分层/交易脚本。`
          : '因子有真实截面值，策略组合尚未完成历史回测',
        role: corePaperWatchSleeve ? '当前主策略；准模拟盘运行包已接入' : '当前主策略',
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
          corePaperWatchSleeve?.can_start_observation
            ? '准模拟盘最新信号允许 open_allowed，仍需按账本观察'
            : `准模拟盘当前 record_only：${corePaperWatchBlockedReasons.join('；') || '最新信号未满足准入门槛'}`,
          '拥挤和背离优先级高于单日涨幅',
        ],
        portfolioRules: ['候选池先取排序前20-50只', '1日只作参考，正式入选看5/10/20最佳周期', '策略收益只认 JoinQuant 真实回填'],
        nextAction: coreStrategyValidated
          ? corePaperWatchSleeve?.can_start_observation
            ? '按准模拟盘账本记录真实观察，不直接实盘。'
            : '运行包已建；等待下一次真实最新信号复核通过后才允许 open_allowed。'
          : '先按因子最佳周期组合回测核心量价路线，再决定是否进入正式策略池。',
        candidateCount: entryCandidates.length,
        computedSignalCount: coreRows.length,
        exportStatus: coreStrategyValidated
          ? corePaperWatchSleeve
            ? `已有真实策略级结果；准模拟盘当前 ${corePaperWatchSleeve.operational_status || '待准入'}`
            : '已有真实策略级结果，仍需交易成本和样本外审计'
          : '因子可导出；策略收益未验证',
      },
      {
        id: 'capital_follow_v0',
        name: '资金跟随策略 v0',
        pool: 'draft',
        status: capitalStrategyValidated
          ? 'real_strategy_backtested'
          : capitalStrategyBacktested
            ? 'backtested_pending_audit'
            : 'candidate_module',
        validationState: capitalStrategyValidated
          ? `${capitalValidation.evidence} 仍保留在草案池中，方便继续导出分层/交易脚本。`
          : capitalStrategyBacktested
            ? `${capitalValidation.evidence} ${capitalLayeredValidation.evidence} ${capitalTradingValidation.evidence} 未进入正式策略池。`
            : '资金因子已由真实日期批次计算，策略尚未实测',
        role: capitalStrategyBacktested ? '已回测待审计策略' : '候选策略模块',
        objective: '捕捉主力资金与超大/大单资金代理同步流入且未过热的股票，作为量价策略之外的资金确认模块。',
        dataBasis: capitalStrategyBacktested
          ? `JoinQuant money_flow/OHLCV 策略实测 ${capitalStrategyStats.all.length} 条；候选样本 ${capitalValidation.bestResult?.packetSample?.candidate_rows || 0} 条`
          : `资金截面 ${capitalSignalRows.length} 条；日期 ${Array.from(new Set(capitalRows.map((row) => dateOnly(row.stock_date || row.date)))).filter(Boolean).join(', ') || '-'}`,
        factorState: capitalRouteFactors,
        rankingFormula: capitalStrategyBacktested
          ? '资金跟随 + 主力一致 + 大单吸筹 + 资金持续性 - 资金过热；以 5/10/20 日真实策略结果为准。'
          : '资金因子当前缺少 5/10/20 回测周期，先保留真实资金逻辑；补齐后再选择最佳周期。',
        entryRules: [
          'capital_follow_signal >= 0.65',
          'active_large_order_accumulation >= 0.55（JoinQuant 超大/大单资金代理；不等价于 Yiwan 暗盘字段）',
          'capital_overheat_risk <= 0.60',
          'capital_source_count >= 2',
        ],
        riskFilters: [
          'capital_overheat_risk > 0.70 过滤',
          '只有单一资金来源时不作为主信号',
          'active_large_order_accumulation 是 JoinQuant money_flow 代理字段，不把它写成 Yiwan active_ap_accumulation 暗盘实测',
          capitalStrategyValidated
            ? '已完成独立 JoinQuant money_flow 实测；仍需交易成本、换手和样本外审计'
            : capitalStrategyBacktested
              ? '已有独立 JoinQuant money_flow/OHLCV 回测，但完整审计未过，不进入正式策略池'
              : '资金日期和技术日期不一致时先独立复测，不强行合成',
        ],
        portfolioRules: capitalStrategyBacktested
          ? ['候选池排序前30只', '已完成 5/10/20 日策略级事件回测', '下一步和核心量价趋势做交集/加权组合测试']
          : ['先作为独立候选池测试', '确认 5/10/20 最佳周期后再和核心量价趋势做交集或加权并集', '资金因子至少补 20-60 个交易日后进入正式组合回测'],
        nextAction: capitalStrategyValidated
          ? '继续补交易净值、交易成本、换手、回撤、市值/波动分层和样本外审计。'
          : capitalStrategyBacktested
            ? '先审查未通过项，再决定降权作为核心量价确认模块，或重做过热过滤和换手控制后复测。'
            : '继续按日期批量采集资金页，优先补齐连续 20 个交易日，再测资金跟随因子的未来收益。',
        candidateCount: capitalValidation.bestResult?.packetSample?.candidate_rows || capitalCandidates.length,
        computedSignalCount: capitalValidation.bestResult?.packetSample?.factor_rows || capitalSignalRows.length,
        exportStatus: capitalStrategyValidated
          ? '已有真实策略级结果，仍需交易成本和样本外审计'
          : capitalStrategyBacktested
            ? '已有真实策略级结果；未通过正式策略池审计'
            : '因子可导出；策略收益未验证',
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
        status: akshareJqReviewPassed
          ? 'real_strategy_backtested'
          : akshareJqReviewImported
            ? 'joinquant_review_not_passed'
            : 'ready_for_joinquant_strategy_backtest',
        validationState: akshareJqReviewImported
          ? `已导入 JoinQuant AkShare候选复核 ${akshareJqReviewSummary.importedRecordCount} 条；目标路线交易净值 ${akshareJqReviewSummary.targetRouteCount} 条，其中 ${akshareJqReviewSummary.passedTargetRouteCount} 条通过受控观察硬门槛。`
          : akshareReviewCandidateCount
            ? `本地 AkShare 300股/608日 OHLCV 稳定性验证筛出 ${akshareReviewCandidateCount} 条待复核候选；尚未导入 JoinQuant 真实复核结果。`
            : '等待 AkShare 本地候选稳定性验证结果。',
        role: '待聚宽复核的候选策略包',
        objective: '把本地强分层路线迁移到 JoinQuant，用真实 OHLCV、沪深300波动、市值、成交额和换手率复核目标路线与波动×市值交叉层。',
        dataBasis: akshareJqReviewImported
          ? `JoinQuant 真实复核已回填 ${akshareJqReviewSummary.importedRecordCount} 条，覆盖 ${akshareJqReviewSummary.candidateCount} 条候选；本地来源 ${akshareCandidateValidation.unique_stocks || 0} 股 / ${akshareCandidateValidation.unique_dates || 0} 日`
          : akshareReviewCandidateCount
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
          akshareJqReviewPassed
            ? '已有目标路线通过 JoinQuant 复核硬门槛，但仍需独立性、行业暴露、最新可交易性和模拟观察账本跟踪'
            : '未导入或未通过 JoinQuant 结果前，不进入正式策略池',
          '腾讯源缺成交额的本地流动性兜底会被 JoinQuant money_ma20 替换',
          '使用 valuation.market_cap 做市值层，使用 valuation.turnover_ratio 做拥挤风险复核',
        ],
        portfolioRules: [
          '脚本输出事件回测 5/10/20 日结果',
          '脚本输出 5日调仓交易净值、成本、滑点、换手和最大回撤',
          '默认包含目标路线、市值层、波动×市值交叉层',
        ],
        nextAction: akshareJqReviewPassed
          ? `优先审查已通过目标路线：${akshareJqReviewSummary.passedTargetRoutes.map((route) => route.strategy_name || route.strategy_id).join('、')}；再做独立性和最新交易可行性复核。`
          : akshareJqReviewImported
            ? 'JoinQuant 目标路线暂未过硬门槛；先查看交叉层结果，判断是否只保留特定市值/波动层或重做因子权重。'
            : '下载聚宽复核脚本，在 JoinQuant Python3 研究环境运行，回填 JSON 后再筛选是否升级为正式候选。',
        candidateCount: akshareJqReviewImported ? akshareJqReviewSummary.candidateCount : akshareReviewCandidateCount,
        computedSignalCount: akshareJqReviewImported ? akshareJqReviewSummary.importedRecordCount : akshareCandidateValidation.rows || 0,
        exportable: false,
        specialBacktestScriptEndpoint: '/strategy-api/joinquant-akshare-candidate-review-script.py',
        exportStatus: akshareJqReviewImported
          ? `已识别真实 JoinQuant 复核结果；目标路线通过 ${akshareJqReviewSummary.passedTargetRouteCount}/${akshareJqReviewSummary.targetRouteCount}`
          : '已生成 JoinQuant 复核脚本；等待真实结果回填',
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
            : '缺少 240 日成交量历史时不启用情绪加权K线因子',
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
        id: 'akshare_index_enhancement_volume_confirmation_v0',
        name: 'AkShare指数增强严格因子复测 v0',
        pool: 'draft',
        status: indexEnhancement.gate.passed ? 'ready_for_joinquant_strategy_backtest' : 'factor_gate_not_passed',
        validationState: `${indexEnhancement.gate.label}：严格复测覆盖 1/5/10/20 日，因子门禁通过 ${indexEnhancement.factorGateAudit?.filter((row) => row.gate_passed).length || 0}/${indexEnhancement.factorGateAudit?.length || 0}；未通过前不生成准入型策略回测。`,
        role: '指数增强因子诊断；未过门禁前不建策略',
        objective: '按 JoinQuant 策略实测要求重做指数增强：先做 1/5/10/20 日因子门禁，再决定是否进入交易回测。当前本地 AkShare 严格复测未放行策略。',
        dataBasis: `${indexEnhancement.dataPolicy} 研究文件：${indexEnhancement.researchPath || '-'}；报告：${indexEnhancement.reportPath || '-'}。`,
        factorState: [],
        rankingFormula: '未过严格因子门禁的 ie_* 复合 alpha 已从当前候选池移除；仅保留审计记录。',
        entryRules: indexEnhancementRows.length
          ? indexEnhancementRows.map((row) => `${row.label}：${row.scoreCol} Top${row.topN}，核心权重 ${Math.round(Number(row.coreWeight || 0) * 100)}%，缓冲 ${row.bufferMultiple}x，平均换手 ${formatRatioPercent(row.avgTurnover, 1)}`)
          : ['严格因子门禁未通过，不生成 TopN 组合和调仓规则'],
        riskFilters: [
          ...indexEnhancement.gate.failedItems,
          '没有历史成分、真实指数权重、行业市值中性前，不把本地结果当成可交易结论',
        ],
        portfolioRules: indexEnhancementRows.length
          ? [
            ...indexEnhancementPrimary.map((row) => `${row.label}：主动收益 ${formatRatioPercent(row.activeReturn)}，主动年化 ${formatRatioPercent(row.activeAnnualReturn)}，主动回撤 ${formatRatioPercent(row.activeMaxDrawdown)}，平均换手 ${formatRatioPercent(row.avgTurnover, 1)}`),
            ...indexEnhancementConservative.map((row) => `${row.label}：主动收益 ${formatRatioPercent(row.activeReturn)}，主动年化 ${formatRatioPercent(row.activeAnnualReturn)}，主动回撤 ${formatRatioPercent(row.activeMaxDrawdown)}，平均换手 ${formatRatioPercent(row.avgTurnover, 1)}`),
          ]
          : ['本轮严格复测没有通过门禁的 score_col，组合回测为空。'],
        nextAction: indexEnhancement.gate.nextActions.join('；'),
        candidateCount: indexEnhancementRows.length,
        computedSignalCount: indexEnhancement.factorGateAudit?.length || 0,
        exportable: false,
        exportStatus: indexEnhancement.gate.passed
          ? '因子门禁已有通过项；下一步生成 JoinQuant 原生交叉回测脚本。'
          : '严格因子门禁未通过；不提供策略导出，不进入模拟观察。',
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

  if (req.method === 'GET' && pathname === '/position-stress-api/report') {
    sendJson(res, readPositionStressReport({
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/position-stress-api/strategies') {
    sendJson(res, buildPositionStressStrategyCatalog());
    return true;
  }

  if (req.method === 'GET' && pathname === '/position-stress-api/kline-search') {
    const item = readAkshareDailyKlineItem(url.searchParams.get('q'));
    if (!item) {
      sendJson(res, { error: '本地行情缓存中没有找到该股票。' }, 404);
      return true;
    }
    sendJson(res, { item, message: `已从本地行情缓存加载 ${item.name} ${item.code}。` });
    return true;
  }

  if (req.method === 'GET' && pathname === '/position-stress-api/equity-export.xlsx') {
    const exportPath = exportPositionStressEquityExcel({
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    });
    sendFileDownload(res, `m-quant-position-stress-equity-${todayYmd()}.xlsx`, exportPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return true;
  }

  if (req.method === 'GET' && pathname === '/position-stress-api/trades-export.xlsx') {
    const exportPath = exportPositionStressTradesExcel({
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    });
    sendFileDownload(res, `m-quant-position-stress-trades-${todayYmd()}.xlsx`, exportPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return true;
  }

  if (req.method === 'POST' && pathname === '/position-stress-api/select-strategy') {
    const body = await readJsonBody(req);
    const selected = selectPositionStressStrategy(String(body.strategyId || ''));
    sendJson(res, {
      message: `${selected.name} 已送入建仓压力测试。`,
      selected,
      catalog: buildPositionStressStrategyCatalog(),
      report: readPositionStressReport({
        start: body.start,
        end: body.end,
      }),
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/position-stress-api/run') {
    const body = await readJsonBody(req);
    const result = runPositionStressLab(body);
    sendJson(res, {
      message: result.errorKind === 'timeout'
        ? result.stepWarning || '建仓压力测试计算超时，请缩短窗口或稍后重跑。'
        : result.report?.runGate?.formalRunAllowed
          ? '建仓压力测试数据完整，结果已生成。'
          : result.step?.ok === false
            ? '建仓压力测试脚本运行失败，请查看错误详情。'
            : '建仓压力测试已生成预览，但数据不完整，正式运行已阻断。',
      ...result,
    }, result.ok ? 200 : 500);
    return true;
  }

  if (req.method === 'POST' && pathname === '/position-stress-api/import-ohlcv') {
    const strategyId = requirePositionStressStrategyId(url.searchParams.get('strategyId'));
    const bodyText = await readTextBody(req);
    const importFile = writePositionStressImportFile(bodyText);
    const result = runPositionStressLab({
      end: url.searchParams.get('end'),
      importFile,
      source: 'akshare_cache',
      start: url.searchParams.get('start'),
      strategyId,
    });
    sendJson(res, {
      message: result.report?.runGate?.formalRunAllowed
        ? '真实行情已导入，数据完整，正式建仓压力测试已放行。'
        : '真实行情已导入并重跑，但数据仍不完整，请查看缺失日期。',
      importFile: relativeProjectPath(importFile),
      ...result,
    }, result.ok ? 200 : 500);
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/paper-watch-routes') {
    sendJson(res, buildPaperWatchRoutes());
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/paper-watch-operations-pack') {
    const operationsPack = readJsonFile(paperWatchOperationsPackPath, {
      source: 'm_quant_paper_watch_operations_pack',
      status: 'missing',
      data_policy: '尚未生成模拟观察运行包。',
    });
    sendJson(res, {
      ...operationsPack,
      importedLedgerCount: readImportedPaperWatchLedger().length,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/strategy-maturity-matrix') {
    const matrix = readJsonFile(strategyMaturityMatrixPath, {
      source: 'm_quant_strategy_maturity_matrix',
      goal_status: 'missing',
      entries: [],
    });
    sendJson(res, matrix);
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/tradeability-review-task-pack') {
    const taskPack = readJsonFile(tradeabilityReviewTaskPackPath, {
      source: 'm_quant_tradeability_review_task_pack',
      status: 'missing',
    });
    sendJson(res, taskPack);
    return true;
  }

  if (req.method === 'POST' && pathname === '/paper-watch-api/rebuild-derived-packs') {
    const refresh = rebuildPaperWatchDerivedArtifacts();
    sendJson(res, {
      message: refresh.ok ? '模拟观察派生包刷新完成。' : '模拟观察派生包刷新存在失败，请查看 scripts 明细。',
      refresh,
    }, refresh.ok ? 200 : 500);
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/daily-refresh-latest') {
    sendJson(res, readJsonFile(paperWatchDailyRefreshLatestPath, {
      source: 'm_quant_paper_watch_daily_refresh',
      status: 'missing',
      data_policy: '尚未运行一键数据刷新。',
      steps: [],
    }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/joinquant-report-latest') {
    sendJson(res, readJsonFile(joinQuantPaperWatchReportPath, {
      source: 'm_quant_joinquant_paper_watch_report',
      status: 'missing',
      data_policy: '尚未运行 JoinQuant 准模拟盘刷新。',
      sleeves: [],
    }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/performance-report-latest') {
    sendJson(res, readJsonFile(paperWatchPerformanceReportPath, {
      source: 'm_quant_paper_watch_performance_report',
      status: 'missing',
      data_policy: '尚未生成准模拟表现报告。',
      sleeves: [],
    }));
    return true;
  }

  if (req.method === 'POST' && pathname === '/paper-watch-api/run-daily-refresh') {
    const body = await readJsonBody(req).catch(() => ({}));
    const mode = String(body.mode || 'local');
    const refresh = runPaperWatchDailyRefresh(mode);
    sendJson(res, {
      message: refresh.ok ? '一键数据刷新完成。' : '一键数据刷新存在失败，请查看步骤日志。',
      refresh,
    }, refresh.ok ? 200 : 500);
    return true;
  }

  if (req.method === 'POST' && pathname === '/paper-watch-api/build-bigquant-test-pack') {
    const pack = buildBigQuantPaperWatchPack();
    sendJson(res, {
      message: 'BigQuant待测试包已生成；该包不包含任何 BigQuant 回测结论。',
      pack,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/bigquant-test-pack.json') {
    const pack = buildBigQuantPaperWatchPack();
    sendText(
      res,
      `m-quant-bigquant-paper-watch-test-pack-${todayYmd()}.json`,
      `${JSON.stringify(pack, null, 2)}\n`,
      'application/json; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/bigquant-test-targets.csv') {
    const pack = buildBigQuantPaperWatchPack();
    sendCsv(res, `m-quant-bigquant-paper-watch-test-targets-${todayYmd()}.csv`, buildBigQuantPaperWatchCsv(pack));
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/bigquant-test-guide.md') {
    const pack = buildBigQuantPaperWatchPack();
    sendText(
      res,
      `m-quant-bigquant-paper-watch-guide-${todayYmd()}.md`,
      buildBigQuantPaperWatchGuide(pack),
      'text/markdown; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/ledger') {
    sendJson(res, {
      dataPolicy: '只展示用户导入的模拟观察账本记录；不生成收益、净值、成交或持仓。',
      records: readImportedPaperWatchLedger(),
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/paper-watch-api/import-ledger') {
    const body = parsePaperWatchLedgerPayload(await readTextBody(req));
    const importedAt = new Date().toISOString();
    const rows = normalizePaperWatchLedgerRows(body, importedAt);
    const nextLedger = [...rows, ...readImportedPaperWatchLedger()].slice(0, 500);
    writeFileSync(importedPaperWatchLedgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`);
    sendJson(res, {
      message: `模拟观察账本已导入 ${rows.length} 条；本接口不生成收益或净值。`,
      importedCount: rows.length,
      records: nextLedger,
    }, 201);
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/ledger-template.csv') {
    sendCsv(res, 'm-quant-paper-watch-ledger-template-20260709.csv', buildPaperWatchLedgerTemplateCsv());
    return true;
  }

  if (req.method === 'GET' && pathname === '/paper-watch-api/ledger-template.json') {
    const { operationsPack, headers, rows } = paperWatchLedgerTemplateRows();
    sendText(
      res,
      'm-quant-paper-watch-ledger-template-20260709.json',
      `${JSON.stringify({
        source: 'm_quant_paper_watch_ledger_template',
        data_policy: '从模拟观察运行包生成的账本填写模板；不生成收益、净值、成交或持仓。',
        operations_pack_status: operationsPack.status || 'missing',
        fields: headers,
        rows,
      }, null, 2)}\n`,
      'application/json; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/tradeability-reviews') {
    sendJson(res, {
      dataPolicy: '只展示用户从 JoinQuant 真实研究环境导入的交易可行性复核结果；不生成收益或回测绩效。',
      records: readImportedTradeabilityReviews(),
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/core-medium-small-signal-reviews') {
    sendJson(res, {
      dataPolicy: '只展示用户从 JoinQuant 真实研究环境导入的核心量价中波动小市值最新信号复核；不生成收益、持仓或模拟盘结果。',
      records: readImportedCoreMediumSmallSignalReviews(),
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/akshare-regime-switch-paper-watch-strategy') {
    sendJson(res, readJsonFile(akshareRegimeSwitchPaperWatchPath, {
      source: 'akshare_local_regime_switch_paper_watch_strategy',
      decision: 'missing',
      data_policy: '尚未生成 AkShare 本地切换策略结果。',
    }));
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/akshare-regime-switch-robustness-audit') {
    sendJson(res, readJsonFile(akshareRegimeSwitchRobustnessAuditPath, {
      source: 'akshare_regime_switch_robustness_audit',
      decision: 'missing',
      data_policy: '尚未生成 AkShare 本地切换策略稳健性审计。',
    }));
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

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-csi500-low-crowding-reversal-index-enhancement.py') {
    const scriptPath = existsSync(csi500LowCrowdingReversalEnhancementNotebookScriptPath)
      ? csi500LowCrowdingReversalEnhancementNotebookScriptPath
      : csi500LowCrowdingReversalEnhancementScriptPath;
    const script = readFileSync(scriptPath, 'utf8');
    sendText(
      res,
      'm-quant-csi500-low-crowding-reversal-index-enhancement.py',
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py') {
    const script = readFileSync(akshareLatestSignalTradeabilityReviewScriptPath, 'utf8');
    sendText(
      res,
      'm-quant-akshare-latest-signal-tradeability-review-20260709.py',
      script,
      'text/x-python; charset=utf-8',
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/strategy-api/joinquant-core-medium-small-latest-signal-review.py') {
    const script = readFileSync(coreMediumSmallLatestSignalReviewScriptPath, 'utf8');
    sendText(
      res,
      'm-quant-core-medium-small-latest-signal-review-20260710.py',
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

  if (req.method === 'POST' && pathname === '/backtest-api/validate-tradeability-review') {
    const body = await readJsonBody(req);
    if (!isTradeabilityReviewPayload(body)) {
      sendError(res, '这里只校验 JoinQuant 交易可行性复核 JSON。');
      return true;
    }
    const checked = normalizeTradeabilityReview(body, new Date().toISOString());
    sendJson(res, {
      dataPolicy: '只校验交易可行性复核 JSON；不写入复核库，不刷新运行包，不生成收益、净值、成交或持仓。',
      message: `交易可行性复核 JSON 校验通过：${checked.tradable_count}/${checked.candidate_count} 可交易，结论 ${checked.decision}。尚未导入。`,
      result: {
        blocked_count: checked.blocked_count,
        candidate_count: checked.candidate_count,
        decision: checked.decision,
        signal_date: checked.signal_date,
        strategy_id: checked.strategy_id,
        tradable_count: checked.tradable_count,
      },
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/backtest-api/validate-core-medium-small-signal-review') {
    const body = await readJsonBody(req);
    if (!isCoreMediumSmallSignalReviewPayload(body)) {
      sendError(res, '这里只校验核心量价中波动小市值最新信号复核 JSON。');
      return true;
    }
    const checked = normalizeCoreMediumSmallSignalReview(body, new Date().toISOString());
    sendJson(res, {
      dataPolicy: '只校验核心量价最新信号 JSON；不写入复核库，不刷新运行包，不生成收益、净值、成交或持仓。',
      message: `核心量价最新信号 JSON 校验通过：${checked.market_regime}/${checked.target_market_cap_bucket}，入选 ${checked.selected_count}，结论 ${checked.decision}。尚未导入。`,
      result: {
        decision: checked.decision,
        market_regime: checked.market_regime,
        selected_count: checked.selected_count,
        signal_date: checked.signal_date,
        sleeve_id: checked.sleeve_id,
        strategy_id: checked.strategy_id,
        target_market_cap_bucket: checked.target_market_cap_bucket,
      },
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/backtest-api/import-results') {
    const body = await readJsonBody(req);
    const importedAt = new Date().toISOString();
    if (isTradeabilityReviewPayload(body)) {
      const nextItem = normalizeTradeabilityReview(body, importedAt);
      const nextReviews = [nextItem, ...readImportedTradeabilityReviews()].slice(0, 100);
      writeFileSync(importedTradeabilityReviewsPath, `${JSON.stringify(nextReviews, null, 2)}\n`);
      const refresh = rebuildPaperWatchDerivedArtifacts();
      sendJson(res, {
        message: `交易可行性复核已导入：${nextItem.tradable_count}/${nextItem.candidate_count} 可交易，结论 ${nextItem.decision}。派生包刷新${refresh.ok ? '完成' : '存在失败'}。`,
        refresh,
        result: nextItem,
        importedCount: 1,
        results: nextReviews,
      }, 201);
      return true;
    }

    if (isCoreMediumSmallSignalReviewPayload(body)) {
      const nextItem = normalizeCoreMediumSmallSignalReview(body, importedAt);
      const nextReviews = [nextItem, ...readImportedCoreMediumSmallSignalReviews()].slice(0, 100);
      writeFileSync(importedCoreMediumSmallSignalReviewsPath, `${JSON.stringify(nextReviews, null, 2)}\n`);
      const refresh = rebuildPaperWatchDerivedArtifacts();
      sendJson(res, {
        message: `核心量价最新信号复核已导入：${nextItem.market_regime}/${nextItem.target_market_cap_bucket}，入选 ${nextItem.selected_count}，结论 ${nextItem.decision}。派生包刷新${refresh.ok ? '完成' : '存在失败'}。`,
        refresh,
        result: nextItem,
        importedCount: 1,
        results: nextReviews,
      }, 201);
      return true;
    }

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
        packageResultType: body.result_type || item.packageResultType,
        packageStrategyId: body.strategy_id || item.packageStrategyId,
        packageStrategyName: body.strategy_name || item.packageStrategyName,
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
    || pathname.startsWith('/strategy-api/')
    || pathname.startsWith('/paper-watch-api/')
    || pathname.startsWith('/position-stress-api/');

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
