# AkShare 模拟观察就绪审计

- 生成时间：2026-07-09T15:44:42
- 数据原则：只读取真实 AkShare OHLCV 本地策略候选验证结果；重算成本压力和分段门槛，不生成新收益或虚构绩效。
- 输入：`outputs/sources/akshare/results/akshare_strategy_candidate_validation.json`
- 候选数量：6
- 推荐数量：6

## 推荐路线

### AkShare低波动收缩突破-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：low_volatility/mid_liquidity
- 样本调仓：39
- 收益：84.95%
- 最大回撤：-4.19%
- Sharpe：3.23
- 胜率：66.67%
- 平均入选：20.00
- 范围：仅限 低波动确认路线 / low_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

### AkShare高波动均值回归-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：high_volatility/mid_liquidity
- 样本调仓：33
- 收益：48.19%
- 最大回撤：-4.89%
- Sharpe：3.02
- 胜率：69.70%
- 平均入选：20.00
- 范围：仅限 高波动回归路线 / high_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

### AkShare低波动趋势回踩-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：low_volatility/mid_liquidity
- 样本调仓：39
- 收益：111.38%
- 最大回撤：-7.38%
- Sharpe：2.84
- 胜率：74.36%
- 平均入选：20.00
- 范围：仅限 低波动确认路线 / low_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

### AkShare低波动防守确认-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：low_volatility/mid_liquidity
- 样本调仓：39
- 收益：96.89%
- 最大回撤：-5.49%
- Sharpe：2.81
- 胜率：69.23%
- 平均入选：20.00
- 范围：仅限 低波动确认路线 / low_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

### AkShare低波动量价趋势-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：low_volatility/mid_liquidity
- 样本调仓：39
- 收益：97.76%
- 最大回撤：-10.92%
- Sharpe：2.69
- 胜率：69.23%
- 平均入选：20.00
- 范围：仅限 低波动确认路线 / low_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

### AkShare高波动反拥挤-中流动性观察策略

- 决策：ready_local_paper_watch
- 分层：high_volatility/mid_liquidity
- 样本调仓：33
- 收益：42.13%
- 最大回撤：-4.47%
- Sharpe：2.56
- 胜率：66.67%
- 平均入选：20.00
- 范围：仅限 高波动回归路线 / high_volatility / mid_liquidity，不得扩展到未审计股票池或未通过分层。

## 全部候选

- AkShare高波动均值回归-中流动性观察策略：ready_local_paper_watch，失败项：无
- AkShare低波动防守确认-中流动性观察策略：ready_local_paper_watch，失败项：无
- AkShare低波动量价趋势-中流动性观察策略：ready_local_paper_watch，失败项：无
- AkShare高波动反拥挤-中流动性观察策略：ready_local_paper_watch，失败项：无
- AkShare低波动收缩突破-中流动性观察策略：ready_local_paper_watch，失败项：无
- AkShare低波动趋势回踩-中流动性观察策略：ready_local_paper_watch，失败项：无