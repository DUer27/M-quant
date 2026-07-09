# 受控模拟观察就绪审计

- 生成时间：2026-07-09T14:54:13
- 数据原则：只读取已导入 JoinQuant 真实交易回测净值曲线；成本压力和分段收益由曲线中的真实 gross_return/cost/turnover 重算，不生成虚构收益。
- 路线数量：2
- 决策分布：{'conditional_paper_watch': 1, 'not_ready': 1}

## 路线结论

### K线辅助确认策略 - 低波动/大市值

- 决策：conditional_paper_watch
- 原因：硬门槛、成本压力和前后半段通过，但近期未触发该分层，只能等环境出现后观察。
- 真实收益：49.93%
- 最大回撤：-3.92%
- Sharpe：2.52
- 1.5x 成本压力收益：44.24%
- 2.0x 成本压力收益：38.77%
- 前半段收益：4.21%
- 后半段收益：43.86%
- 日期：2024-03-27 至 2025-08-13

检查项：
- 通过 `periods`：31 >= 30
- 通过 `strategy_return`：0.4993 >= 0.2000
- 通过 `max_drawdown`：-0.0392 >= -0.1500
- 通过 `sharpe`：2.5191 >= 1.2000
- 通过 `win_rate`：0.5806 >= 0.5200
- 通过 `stress_1_5_return`：0.4424 > 0
- 通过 `avg_selected_count`：13.77 >= 10
- 通过 `first_half_positive`：0.0421 > 0
- 通过 `second_half_positive`：0.4386 > 0
- 未通过 `recent_layer_activity`：330 <= 180 days

### JQ质量利润流动性策略 v1 - 高波动/中市值

- 决策：not_ready
- 原因：硬门槛未全部通过，不进入模拟观察。
- 真实收益：57.66%
- 最大回撤：-10.37%
- Sharpe：1.95
- 1.5x 成本压力收益：53.53%
- 2.0x 成本压力收益：49.51%
- 前半段收益：13.95%
- 后半段收益：38.36%
- 日期：2024-01-02 至 2026-06-08

检查项：
- 通过 `periods`：39 >= 30
- 通过 `strategy_return`：0.5766 >= 0.2000
- 通过 `max_drawdown`：-0.1037 >= -0.1500
- 通过 `sharpe`：1.9535 >= 1.2000
- 通过 `win_rate`：0.5641 >= 0.5200
- 通过 `stress_1_5_return`：0.5353 > 0
- 未通过 `avg_selected_count`：7.38 >= 10
- 通过 `first_half_positive`：0.1395 > 0
- 通过 `second_half_positive`：0.3836 > 0
- 通过 `recent_layer_activity`：31 <= 180 days
