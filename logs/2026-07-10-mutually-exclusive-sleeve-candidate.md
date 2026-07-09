# 2026-07-10 互斥第二资金袖候选

## 发现

在已有真实 JoinQuant 分层策略结果中，`核心量价趋势策略 v1 / 中波动/小市值` 是目前最接近第二个模拟观察资金袖的路线。

真实证据来自：

- `outputs/strategies/joinquant/strategy_maturity_audit_20260709.json`
- `outputs/strategies/joinquant/core_volume_price_trend_v1_trading_package_20260709.json`

关键指标：

- 样本日期：45
- 策略收益：43.30%
- 年化收益：49.62%
- 最大回撤：-9.34%
- Sharpe：1.39
- 胜率：55.56%
- 数据源：`joinquant_core_volume_price_trend_v1_trading_simulation_v1`

## 为什么值得推进

`市场状态切换策略 v1` 的真实组合逻辑是：

- 高波动：`JQ质量利润流动性策略 v1`
- 低波动：`K线辅助确认策略`
- 中波动：`cash_watch`

因此 `核心量价趋势策略 v1 / 中波动/小市值` 与主控制器存在清晰互斥基础：主控制器在中波动空仓，而该候选只允许在 `medium_volatility / small_cap` 条件下观察。

## 为什么没有直接晋级

这次没有把它写入运行包，也没有把成熟策略目标改成 `2 / 2`。原因：

- 它尚未被写入模拟观察运行包。
- 缺最新一期中波动/小市值候选信号。
- 缺明确的执行配置和人工晋级确认。
- 虽然互斥逻辑强，但不能把“候选晋级潜力”当成“已经准入资金袖”。

## 已落地改动

- `outputs/paper-watch/scripts/audit_independent_sleeve_candidates.py`
  - 新增 `mutually_exclusive_candidate_needs_promotion` 分类。
  - 对该候选写入真实绩效、互斥依据、缺口和下一步证据要求。
- `outputs/paper-watch/results/independent_sleeve_candidate_audit_20260710.json`
  - 该路线显示为 `互斥候选，待晋级确认`。
  - 不计入 `counts_as_independent_sleeve`。
- `outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
  - 将“确认是否晋级核心量价中波动/小市值路线”放入第一优先级下一步。
- `outputs/paper-watch/results/strategy_maturity_matrix_20260710.json`
  - 目标状态仍为 `not_met`，当前仍是 `1 / 2`。

## 下一步

如果确认晋级，应做三件事：

1. 生成或运行 JoinQuant 最新信号脚本，取当前是否为 `medium_volatility`，并筛出 `small_cap` 候选池。
2. 将该路线写入模拟观察运行包，设定互斥开仓规则：只在 `medium_volatility / small_cap` 开仓观察。
3. 重建成熟矩阵；只有运行包准入后，才允许它计入第二个成熟可观察资金袖。

## 数据边界

本次只读取已有真实 JoinQuant 回测结果和主控制器逻辑，没有生成任何新收益、净值、成交、持仓、交易可行性或模拟盘结果。
