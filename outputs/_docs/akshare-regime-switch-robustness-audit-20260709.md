# AkShare 本地切换策略稳健性审计

- 生成时间：2026-07-09T19:59:13
- 决策：`robust_local_switch_paper_watch`
- 数据原则：只读取 AkShare 本地切换策略的真实组件 trade_records 重建曲线；做稳健性切片和压力检查，不生成新收益。
- 输入：`outputs/sources/akshare/results/akshare_regime_switch_paper_watch_strategy_20260709.json`

## 核心结论

- 年度正收益比例：100.00%
- 留一年最差收益：82.56%
- 留一年最差 Sharpe：2.78
- 滚动12期正收益比例：93.44%
- 滚动12期最差收益：-2.90%
- 滚动12期最深回撤：-6.60%

## 组件均衡

### AkShare低波动收缩突破-中流动性观察策略

- 调仓占比：54.17%
- 样本调仓：39
- 收益：84.95%
- 最大回撤：-4.19%
- Sharpe：3.23

### AkShare高波动均值回归-中流动性观察策略

- 调仓占比：45.83%
- 样本调仓：33
- 收益：48.19%
- 最大回撤：-4.89%
- Sharpe：3.02

## 门槛检查

- total_trades：通过，72 >= 50
- component_trade_share_floor：通过，0.4583 >= 0.2500
- component_trade_share_ceiling：通过，0.5417 <= 0.7500
- components_all_positive：通过，0.8495, 0.4819
- year_positive_ratio：通过，1.0000 >= 0.6700
- leave_one_year_return：通过，0.8256 >= 0.2000
- leave_one_year_sharpe：通过，2.7824 >= 1.0000
- rolling_12_positive_ratio：通过，0.9344 >= 0.7000
- worst_rolling_12_return：通过，-0.0290 >= -0.0800
- worst_rolling_12_drawdown：通过，-0.0660 >= -0.1200
- min_rolling_12_sharpe：通过，-0.9252 >= -1.0000
- recent_return：通过，0.3042 > 0.0000

## 边界

只读取 AkShare 本地切换策略的真实组件 trade_records 重建曲线；做稳健性切片和压力检查，不生成新收益。
