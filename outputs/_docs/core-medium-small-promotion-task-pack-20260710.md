# 核心量价中波动小市值晋级任务包

- 生成时间：2026-07-10T03:12:42
- 状态：`signal_not_ready_imported`
- 数据原则：只生成 JoinQuant 最新信号复核任务；不生成收益、净值、成交、持仓、交易可行性或模拟盘结果。
- 已导入复核：1

## 目标候选

- 资金袖：`jq_medium_vol_small_cap_core`
- 策略：核心量价趋势策略 v1
- 分层：中波动/小市值
- 当前决策：最新信号未通过
- 历史收益：43.30%
- 历史回撤：-9.34%
- Sharpe：1.3930551667201772

## 通过门槛

- `required_source`：joinquant_core_medium_small_latest_signal_review
- `required_decision`：promotion_signal_ready
- `required_market_regime`：medium_volatility
- `required_market_cap_bucket`：small_cap
- `min_selected_count`：10
- `after_pass_next_action`：再写入模拟观察运行包；写入前仍不计入 2/2 成熟策略目标。

## 最新导入复核

- 日期：2026-07-09
- 结论：`promotion_signal_not_ready`
- 市场状态：high_volatility
- 入选数量：7

## 步骤

1. 在 M-quant 页面下载核心量价中波动小市值最新信号复核脚本。
2. 粘贴到 JoinQuant Python3 研究环境运行。
3. 确认输出 JSON 的 source、strategy_id、sleeve_id、market_regime、selected_count 和 records。
4. 只有 decision=promotion_signal_ready 且 selected_count>=10 时，才进入运行包晋级步骤。
5. 晋级前仍不得把该路线计入两条成熟策略目标。