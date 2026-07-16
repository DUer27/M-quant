# 中证500低拥挤反转指数增强候选优化审计

生成时间：2026-07-16T12:04:25
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_candidate_optimization_20260716-120425.json`

## 数据边界

本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。

## 样本

- 分片数量：10
- 合并截面行：61500
- 因子日期：123
- 日期范围：2024-01-02 至 2026-06-16
- 股票数量：730

## 候选排名

| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v2_volume_dual_gate_cap_neutral` | 达到准模拟盘候选标准 | 2 | 38.81% | 14.19% | 1.0883 | -22.27% | 0.5795 | 9 |
| 2 | `v1_volume_only_cap_neutral` | 已有真实策略回测，未达准模拟盘标准 | 1 | 38.81% | 14.19% | 1.0883 | -22.27% | 0.5795 | 9 |
| 3 | `v2_volume_residual_balance` | 达到准模拟盘候选标准 | 3 | 33.00% | 9.50% | 0.6973 | -23.50% | 0.5753 | 9 |
| 4 | `v2_volume_turnover_balance` | 达到准模拟盘候选标准 | 2 | 32.08% | 7.92% | 0.6388 | -22.52% | 0.5662 | 9 |
| 5 | `v1_volume_downside_active` | 已有真实策略回测，未达准模拟盘标准 | 1 | 17.78% | -4.56% | -0.2718 | -23.53% | 0.5663 | 9 |
| 6 | `v1_volume_active_short` | 已有真实策略回测，未达准模拟盘标准 | 1 | 11.46% | -8.66% | -0.5044 | -23.95% | 0.7283 | 9 |
| 7 | `v1_volume_active_anti_heat` | 已有真实策略回测，未达准模拟盘标准 | 1 | 11.04% | -9.10% | -0.5020 | -23.70% | 0.7150 | 9 |
| 8 | `v1_compact_top80` | 已有真实策略回测，未达准模拟盘标准 | 1 | 8.01% | -11.29% | -0.6306 | -24.47% | 0.7530 | 9 |
| 9 | `v0_baseline_rebuilt` | 已有真实策略回测，未达准模拟盘标准 | 1 | -2.06% | -22.68% | -0.9911 | -20.87% | 0.4615 | 9 |

## 最优候选

- 版本：`v2_volume_dual_gate_cap_neutral` / 量稳双因子市值中性
- 结论：达到准模拟盘候选标准
- 说明：把有效的量能稳定核心拆成原始量稳和市值桶内量稳两个可审计因子，组合仍保持市值桶中性。

## 准模拟盘检查

- `factor_gate_pass_count`：True
- `overall_strategy_return`：True
- `overall_annual_return`：True
- `overall_active_return`：True
- `overall_active_sharpe`：True
- `overall_drawdown`：True
- `layer_count`：True

## 下一步

若没有版本达到准模拟盘候选标准，应优先增加完整历史分片覆盖，再根据年度/波动/市值分层失败项继续缩小因子组合，不应直接放宽门禁。
