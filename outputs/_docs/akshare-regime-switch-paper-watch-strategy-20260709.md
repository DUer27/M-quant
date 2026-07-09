# AkShare 本地高低波动切换策略

- 生成时间：2026-07-09T19:48:49
- 决策：`ready_local_switch_paper_watch`
- 数据原则：只组合 AkShare 本地真实 OHLCV 已生成的执行组件 trade_records；不新增收益、不扩展未审计分层、不伪造交易状态。
- 输入验证：`outputs/sources/akshare/results/akshare_strategy_candidate_validation.json`
- 输入执行包：`outputs/sources/akshare/results/akshare_paper_watch_execution_pack_20260709.json`

## 总体表现

- 样本调仓：72
- 收益：174.09%
- 最大回撤：-6.60%
- Sharpe：3.14
- 胜率：68.06%
- 平均入选：20.00

## 组件使用

### AkShare低波动收缩突破-中流动性观察策略

- 角色：`primary_local_sleeve`
- 市场状态：`low_volatility`
- 样本调仓：39
- 收益：84.95%
- 回撤：-4.19%
- Sharpe：3.23

### AkShare高波动均值回归-中流动性观察策略

- 角色：`high_volatility_backup_sleeve`
- 市场状态：`high_volatility`
- 样本调仓：33
- 收益：48.19%
- 回撤：-4.89%
- Sharpe：3.02

## 门槛检查

- sample_trades：通过，72 >= 50
- component_count：通过，2 >= 2
- strategy_return：通过，1.7409 >= 0.3000
- max_drawdown：通过，-0.0660 >= -0.1500
- sharpe：通过，3.1420 >= 1.3000
- positive_trade_ratio：通过，0.6806 >= 0.5500
- avg_stock_count：通过，20.00 >= 15
- stress_1_5_return：通过，1.6452 > 0.0000
- stress_2_0_return：通过，1.5528 > 0.0000
- recent_trades：通过，15 >= 5

## 结论

低波动主观察与高波动备选均来自已审计执行包，组合后通过样本、收益、回撤、Sharpe、成本压力和近期触发门槛。
