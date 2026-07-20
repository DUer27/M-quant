# 中证500低拥挤反转指数增强候选优化审计

生成时间：2026-07-16T11:33:03
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_candidate_optimization_20260716-113303.json`

## 数据边界

本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。

## 样本

- 分片数量：3
- 合并截面行：18500
- 因子日期：37
- 日期范围：2024-01-02 至 2024-09-25
- 股票数量：550

## 候选排名

| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v1_volume_only_cap_neutral` | 因子门禁或策略回测未达标 | 0 | 13.20% | 7.80% | 2.5608 | -17.46% | 0.5773 | 9 |
| 2 | `v1_volume_downside_active` | 因子门禁或策略回测未达标 | 0 | 10.09% | 4.12% | 0.9251 | -18.20% | 0.5838 | 9 |
| 3 | `v1_volume_active_anti_heat` | 因子门禁或策略回测未达标 | 0 | 7.62% | 2.62% | 0.5691 | -19.47% | 0.7243 | 9 |
| 4 | `v0_baseline_rebuilt` | 因子门禁或策略回测未达标 | 0 | 8.83% | 1.78% | 0.2893 | -17.86% | 0.4778 | 9 |
| 5 | `v1_compact_top80` | 因子门禁或策略回测未达标 | 0 | 5.16% | 0.40% | 0.1154 | -21.02% | 0.7520 | 9 |
| 6 | `v1_volume_active_short` | 因子门禁或策略回测未达标 | 0 | 5.22% | 0.31% | 0.1020 | -20.66% | 0.7400 | 9 |

## 最优候选

- 版本：`v1_volume_only_cap_neutral` / 量稳单核市值中性
- 结论：因子门禁或策略回测未达标
- 说明：只验证量能稳定是否能在市值桶中性后独立产生超额。

## 准模拟盘检查

- `factor_gate_pass_count`：False
- `overall_strategy_return`：True
- `overall_annual_return`：True
- `overall_active_return`：True
- `overall_active_sharpe`：True
- `overall_drawdown`：True
- `layer_count`：True

## 下一步

若没有版本达到准模拟盘候选标准，应优先增加完整历史分片覆盖，再根据年度/波动/市值分层失败项继续缩小因子组合，不应直接放宽门禁。
