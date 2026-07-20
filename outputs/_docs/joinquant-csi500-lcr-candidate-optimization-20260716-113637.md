# 中证500低拥挤反转指数增强候选优化审计

生成时间：2026-07-16T11:36:37
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_candidate_optimization_20260716-113637.json`

## 数据边界

本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。

## 样本

- 分片数量：4
- 合并截面行：25000
- 因子日期：50
- 日期范围：2024-01-02 至 2024-12-31
- 股票数量：598

## 候选排名

| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v1_volume_only_cap_neutral` | 因子门禁或策略回测未达标 | 0 | 1.20% | 7.58% | 1.8009 | -17.46% | 0.5820 | 9 |
| 2 | `v1_volume_downside_active` | 因子门禁或策略回测未达标 | 0 | 2.51% | 7.80% | 1.1551 | -18.20% | 0.5804 | 9 |
| 3 | `v1_volume_active_anti_heat` | 因子门禁或策略回测未达标 | 0 | -2.47% | 3.34% | 0.4844 | -19.47% | 0.7324 | 9 |
| 4 | `v0_baseline_rebuilt` | 因子门禁或策略回测未达标 | 0 | -0.81% | 2.62% | 0.2894 | -17.86% | 0.4736 | 9 |
| 5 | `v1_volume_active_short` | 因子门禁或策略回测未达标 | 0 | -4.85% | 0.84% | 0.1565 | -20.66% | 0.7440 | 9 |
| 6 | `v1_compact_top80` | 因子门禁或策略回测未达标 | 0 | -5.37% | 0.42% | 0.0935 | -21.02% | 0.7685 | 9 |

## 最优候选

- 版本：`v1_volume_only_cap_neutral` / 量稳单核市值中性
- 结论：因子门禁或策略回测未达标
- 说明：只验证量能稳定是否能在市值桶中性后独立产生超额。

## 准模拟盘检查

- `factor_gate_pass_count`：False
- `overall_strategy_return`：False
- `overall_annual_return`：False
- `overall_active_return`：True
- `overall_active_sharpe`：True
- `overall_drawdown`：True
- `layer_count`：True

## 下一步

若没有版本达到准模拟盘候选标准，应优先增加完整历史分片覆盖，再根据年度/波动/市值分层失败项继续缩小因子组合，不应直接放宽门禁。
