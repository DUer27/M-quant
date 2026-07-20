# 中证500低拥挤反转指数增强候选优化审计

生成时间：2026-07-16T11:24:30
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_candidate_optimization_20260716-112430.json`

## 数据边界

本报告只接受 JoinQuant slice 的原始 factor_rows，所有候选版本均在合并截面后统一复算；不从快测汇总指标反推收益。

## 样本

- 分片数量：1
- 合并截面行：6000
- 因子日期：12
- 日期范围：2024-01-02 至 2024-03-27
- 股票数量：500

## 候选排名

| 排名 | 版本 | 状态 | 20日过门禁因子 | 5日收益 | 5日主动 | 主动Sharpe | 回撤 | 平均换手 | 九宫格 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v1_volume_only_cap_neutral` | 因子门禁或策略回测未达标 | 0 | 2.81% | 4.59% | 5.1101 | -7.80% | 0.6567 | 3 |
| 2 | `v0_baseline_rebuilt` | 因子门禁或策略回测未达标 | 0 | 2.44% | 3.82% | 1.6388 | -7.22% | 0.5900 | 3 |
| 3 | `v1_volume_downside_active` | 因子门禁或策略回测未达标 | 0 | 1.86% | 3.38% | 1.7987 | -8.71% | 0.6483 | 3 |
| 4 | `v1_compact_top80` | 因子门禁或策略回测未达标 | 0 | -1.54% | 0.09% | 0.0826 | -10.49% | 0.7667 | 3 |
| 5 | `v1_volume_active_anti_heat` | 因子门禁或策略回测未达标 | 0 | -1.78% | -0.15% | -0.0340 | -11.41% | 0.7500 | 3 |
| 6 | `v1_volume_active_short` | 因子门禁或策略回测未达标 | 0 | -1.78% | -0.17% | -0.0634 | -10.78% | 0.7733 | 3 |

## 最优候选

- 版本：`v1_volume_only_cap_neutral` / 量稳单核市值中性
- 结论：因子门禁或策略回测未达标
- 说明：只验证量能稳定是否能在市值桶中性后独立产生超额。

## 准模拟盘检查

- `factor_gate_pass_count`：False
- `overall_strategy_return`：False
- `overall_annual_return`：True
- `overall_active_return`：True
- `overall_active_sharpe`：True
- `overall_drawdown`：True
- `layer_count`：False

## 下一步

若没有版本达到准模拟盘候选标准，应优先增加完整历史分片覆盖，再根据年度/波动/市值分层失败项继续缩小因子组合，不应直接放宽门禁。
