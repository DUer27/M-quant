# AkShare OHLCV 因子扩展审计

日期：2026-07-09

## 数据口径

- 来源：真实 AkShare OHLCV，本地沪深300 300 股样本。
- 区间：2024-01-01 至 2026-07-09。
- 行数：180816 行。
- 交易日：608 日。
- 回测口径：5/10/20 日因子检验；策略为 Top20、5日调仓、单次成本 0.10%。
- 数据边界：腾讯源缺成交额/换手率时只使用真实成交量兜底，不做伪造填充。

## 新增因子

- `ak_volatility_contraction_quality`：波动收缩质量。
- `ak_breakout_confirmation`：突破确认。
- `ak_pullback_support_quality`：趋势回踩支撑。
- `ak_liquidity_stability`：流动性稳定。
- `ak_contraction_breakout_combo`：收缩突破组合。
- `ak_trend_pullback_reversal_combo`：趋势回踩反转组合。

## 因子筛选结论

通过本地单因子初筛：

- `ak_liquidity_stability`：5日 RankIC 0.0305，t 值 6.57，多空收益 0.31%；10日 RankIC 0.0256，t 值 5.41；20日 RankIC 0.0208，t 值 4.24。

观察但不单独升级：

- `ak_volatility_contraction_quality`：5日 RankIC 0.0176，但 t 值 1.77，且多空收益为负，不能单独作为 alpha。
- `ak_contraction_breakout_combo`：组合层有分层收益，但单因子 RankIC 不显著。

暂缓单独使用：

- `ak_breakout_confirmation`：5日 RankIC 为负，20日多空收益为正但显著性不足。
- `ak_pullback_support_quality`：5/10/20 日 RankIC 均未通过，不能单独用于选股。
- `ak_trend_pullback_reversal_combo`：单因子不显著，只能作为低波动×中流动性策略路线继续复核。

## 新增策略候选

新增两条本地稳定性验证通过的 `joinquant_review_candidate`：

- `AkShare低波动收缩突破-中流动性观察策略`：39 次交易，总收益 84.95%，最大回撤 -4.19%，Sharpe 3.23。
- `AkShare低波动趋势回踩-中流动性观察策略`：39 次交易，总收益 111.38%，最大回撤 -7.38%，Sharpe 2.84。

这两条只允许进入 JoinQuant 复核，不允许直接升级为正式策略或模拟盘候选。

## 下一步

1. 用 `outputs/sources/joinquant/scripts/m_quant_akshare_ohlcv_candidate_review.py` 复核 6 条候选。
2. 导入 JoinQuant 实跑 JSON 后，按收益、回撤、Sharpe、样本外、市值层、波动层和成本敏感性筛选。
3. 只有 JoinQuant 复核通过的候选，才进入正式策略池或模拟盘观察流程。
