# 受控模拟观察就绪审计

- 生成时间：2026-07-09T15:18:38
- 数据原则：只读取已导入 JoinQuant 真实交易回测净值曲线；成本压力和分段收益由曲线中的真实 gross_return/cost/turnover 重算，不生成虚构收益。
- 路线数量：10
- 决策分布：{'not_ready': 3, 'conditional_recheck_required': 3, 'conditional_paper_watch': 2, 'ready_controlled_paper_watch': 2}

## 路线结论

## 推荐进入观察配置

- `JQ质量利润流动性策略 v1`：高波动，决策 `ready_controlled_paper_watch`，收益 35.13%，回撤 -10.27%，Sharpe 1.74。
- `市场状态切换策略 v1`：高低波动切换，决策 `ready_controlled_paper_watch`，收益 83.29%，回撤 -9.07%，Sharpe 1.80。

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

### K线辅助确认策略 - 低波动

- 决策：conditional_paper_watch
- 原因：硬门槛、成本压力和前后半段通过，但近期未触发该分层，只能等环境出现后观察。
- 真实收益：35.64%
- 最大回撤：-4.11%
- Sharpe：1.86
- 1.5x 成本压力收益：30.30%
- 2.0x 成本压力收益：25.17%
- 前半段收益：0.79%
- 后半段收益：34.57%
- 日期：2024-03-27 至 2025-08-13

检查项：
- 通过 `periods`：31 >= 30
- 通过 `strategy_return`：0.3564 >= 0.2000
- 通过 `max_drawdown`：-0.0411 >= -0.1500
- 通过 `sharpe`：1.8621 >= 1.2000
- 通过 `win_rate`：0.6452 >= 0.5200
- 通过 `stress_1_5_return`：0.3030 > 0
- 通过 `avg_selected_count`：28.55 >= 10
- 通过 `first_half_positive`：0.0079 > 0
- 通过 `second_half_positive`：0.3457 > 0
- 未通过 `recent_layer_activity`：330 <= 180 days

### JQ质量利润流动性策略 v1 - 高波动

- 决策：ready_controlled_paper_watch
- 原因：硬门槛、成本压力、前后半段和近期触发均通过。
- 真实收益：35.13%
- 最大回撤：-10.27%
- Sharpe：1.74
- 1.5x 成本压力收益：33.55%
- 2.0x 成本压力收益：32.00%
- 前半段收益：3.29%
- 后半段收益：30.83%
- 日期：2024-01-02 至 2026-06-08

检查项：
- 通过 `periods`：39 >= 30
- 通过 `strategy_return`：0.3513 >= 0.2000
- 通过 `max_drawdown`：-0.1027 >= -0.1500
- 通过 `sharpe`：1.7373 >= 1.2000
- 通过 `win_rate`：0.6154 >= 0.5200
- 通过 `stress_1_5_return`：0.3355 > 0
- 通过 `avg_selected_count`：30.00 >= 10
- 通过 `first_half_positive`：0.0329 > 0
- 通过 `second_half_positive`：0.3083 > 0
- 通过 `recent_layer_activity`：31 <= 180 days

### JQ质量利润流动性策略 v1 - 低波动/大市值

- 决策：conditional_recheck_required
- 原因：硬门槛通过，但分段或近期触发不足，模拟前需人工复核。
- 真实收益：34.82%
- 最大回撤：-14.48%
- Sharpe：1.48
- 1.5x 成本压力收益：33.81%
- 2.0x 成本压力收益：32.81%
- 前半段收益：-12.15%
- 后半段收益：53.47%
- 日期：2024-03-27 至 2025-08-13

检查项：
- 通过 `periods`：31 >= 30
- 通过 `strategy_return`：0.3482 >= 0.2000
- 通过 `max_drawdown`：-0.1448 >= -0.1500
- 通过 `sharpe`：1.4838 >= 1.2000
- 通过 `win_rate`：0.5484 >= 0.5200
- 通过 `stress_1_5_return`：0.3381 > 0
- 通过 `avg_selected_count`：19.87 >= 10
- 未通过 `first_half_positive`：-0.1215 > 0
- 通过 `second_half_positive`：0.5347 > 0
- 未通过 `recent_layer_activity`：330 <= 180 days

### 核心量价趋势策略 v1 - 中波动/小市值

- 决策：not_ready
- 原因：硬门槛未全部通过，不进入模拟观察。
- 真实收益：43.30%
- 最大回撤：-9.34%
- Sharpe：1.39
- 1.5x 成本压力收益：33.60%
- 2.0x 成本压力收益：24.54%
- 前半段收益：9.79%
- 后半段收益：30.52%
- 日期：2024-03-13 至 2026-05-25

检查项：
- 通过 `periods`：45 >= 30
- 通过 `strategy_return`：0.4330 >= 0.2000
- 通过 `max_drawdown`：-0.0934 >= -0.1500
- 通过 `sharpe`：1.3931 >= 1.2000
- 通过 `win_rate`：0.5556 >= 0.5200
- 通过 `stress_1_5_return`：0.3360 > 0
- 未通过 `avg_selected_count`：5.58 >= 10
- 通过 `first_half_positive`：0.0979 > 0
- 通过 `second_half_positive`：0.3052 > 0
- 通过 `recent_layer_activity`：45 <= 180 days

### JQ质量利润流动性策略 v1 - 高波动/大市值

- 决策：conditional_recheck_required
- 原因：硬门槛通过，但分段或近期触发不足，模拟前需人工复核。
- 真实收益：24.01%
- 最大回撤：-12.80%
- Sharpe：1.34
- 1.5x 成本压力收益：22.43%
- 2.0x 成本压力收益：20.86%
- 前半段收益：-1.20%
- 后半段收益：25.52%
- 日期：2024-01-02 至 2026-06-08

检查项：
- 通过 `periods`：39 >= 30
- 通过 `strategy_return`：0.2401 >= 0.2000
- 通过 `max_drawdown`：-0.1280 >= -0.1500
- 通过 `sharpe`：1.3410 >= 1.2000
- 通过 `win_rate`：0.5897 >= 0.5200
- 通过 `stress_1_5_return`：0.2243 > 0
- 通过 `avg_selected_count`：20.10 >= 10
- 未通过 `first_half_positive`：-0.0120 > 0
- 通过 `second_half_positive`：0.2552 > 0
- 通过 `recent_layer_activity`：31 <= 180 days

### K线辅助确认策略 - 低波动/中市值

- 决策：not_ready
- 原因：硬门槛未全部通过，不进入模拟观察。
- 真实收益：26.24%
- 最大回撤：-7.31%
- Sharpe：1.27
- 1.5x 成本压力收益：20.91%
- 2.0x 成本压力收益：15.81%
- 前半段收益：1.29%
- 后半段收益：24.63%
- 日期：2024-03-27 至 2025-08-13

检查项：
- 通过 `periods`：31 >= 30
- 通过 `strategy_return`：0.2624 >= 0.2000
- 通过 `max_drawdown`：-0.0731 >= -0.1500
- 通过 `sharpe`：1.2728 >= 1.2000
- 通过 `win_rate`：0.5484 >= 0.5200
- 通过 `stress_1_5_return`：0.2091 > 0
- 未通过 `avg_selected_count`：9.32 >= 10
- 通过 `first_half_positive`：0.0129 > 0
- 通过 `second_half_positive`：0.2463 > 0
- 未通过 `recent_layer_activity`：330 <= 180 days

### 主力资金广度K线确认策略 v0 - 低波动/大市值

- 决策：conditional_recheck_required
- 原因：硬门槛通过，但分段或近期触发不足，模拟前需人工复核。
- 真实收益：20.54%
- 最大回撤：-12.01%
- Sharpe：1.28
- 1.5x 成本压力收益：15.39%
- 2.0x 成本压力收益：10.45%
- 前半段收益：-2.55%
- 后半段收益：23.69%
- 日期：2024-03-27 至 2025-08-13

检查项：
- 通过 `periods`：31 >= 30
- 通过 `strategy_return`：0.2054 >= 0.2000
- 通过 `max_drawdown`：-0.1201 >= -0.1500
- 通过 `sharpe`：1.2830 >= 1.2000
- 通过 `win_rate`：0.5484 >= 0.5200
- 通过 `stress_1_5_return`：0.1539 > 0
- 通过 `avg_selected_count`：12.29 >= 10
- 未通过 `first_half_positive`：-0.0255 > 0
- 通过 `second_half_positive`：0.2369 > 0
- 未通过 `recent_layer_activity`：330 <= 180 days

### 市场状态切换策略 v1 - 高低波动切换

- 决策：ready_controlled_paper_watch
- 原因：硬门槛、成本压力、前后半段和近期触发均通过。
- 真实收益：83.29%
- 最大回撤：-9.07%
- Sharpe：1.80
- 1.5x 成本压力收益：74.03%
- 2.0x 成本压力收益：65.22%
- 前半段收益：25.33%
- 后半段收益：46.25%
- 日期：2024-01-02 至 2026-06-08

检查项：
- 通过 `periods`：70 >= 30
- 通过 `strategy_return`：0.8329 >= 0.2000
- 通过 `max_drawdown`：-0.0907 >= -0.1500
- 通过 `sharpe`：1.8039 >= 1.2000
- 通过 `win_rate`：0.6286 >= 0.5200
- 通过 `stress_1_5_return`：0.7403 > 0
- 通过 `avg_selected_count`：29.36 >= 10
- 通过 `first_half_positive`：0.2533 > 0
- 通过 `second_half_positive`：0.4625 > 0
- 通过 `recent_layer_activity`：31 <= 180 days
