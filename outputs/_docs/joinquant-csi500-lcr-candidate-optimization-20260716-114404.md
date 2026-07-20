# 中证500低拥挤反转指数增强候选优化审计

生成时间：2026-07-16T11:44:04
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_candidate_optimization_20260716-114404.json`

## 数据边界

本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。

## 样本

- 分片数量：6
- 合并截面行：37000
- 因子日期：74
- 日期范围：2024-01-02 至 2025-06-24
- 股票数量：646

## 候选排名

| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v1_volume_only_cap_neutral` | 因子门禁或策略回测未达标 | 0 | -2.47% | 5.36% | 0.8308 | -22.27% | 0.5732 | 9 |
| 2 | `v1_volume_downside_active` | 因子门禁或策略回测未达标 | 0 | -5.43% | 1.11% | 0.1464 | -23.53% | 0.5565 | 9 |
| 3 | `v0_baseline_rebuilt` | 因子门禁或策略回测未达标 | 0 | -7.09% | -2.57% | -0.1216 | -20.87% | 0.4600 | 9 |
| 4 | `v1_volume_active_anti_heat` | 因子门禁或策略回测未达标 | 0 | -9.98% | -2.76% | -0.2222 | -23.70% | 0.7111 | 9 |
| 5 | `v1_volume_active_short` | 因子门禁或策略回测未达标 | 0 | -11.72% | -4.65% | -0.4276 | -23.95% | 0.7281 | 9 |
| 6 | `v1_compact_top80` | 因子门禁或策略回测未达标 | 0 | -12.95% | -5.84% | -0.5135 | -24.47% | 0.7503 | 9 |

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
