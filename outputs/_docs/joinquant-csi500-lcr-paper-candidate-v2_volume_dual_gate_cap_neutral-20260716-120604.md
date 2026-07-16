# 中证500低拥挤反转指数增强准模拟盘候选包

生成时间：2026-07-16T12:06:04
结果文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_v2_volume_dual_gate_cap_neutral_paper_candidate_20260716-120604.json`

## 结论

- 策略状态：达到准模拟盘候选标准
- 候选版本：`v2_volume_dual_gate_cap_neutral` / 量稳双因子市值中性
- 样本：123 个因子日期，61500 行截面。
- 日期范围：2024-01-02 至 2026-06-16

## 5日主调仓

- 策略收益：38.81%
- 基准收益：21.89%
- 主动收益：14.19%
- 年化收益：14.38%
- 主动 Sharpe：1.0883139170758331
- 最大回撤：-22.27%
- 平均换手：0.5795121951219512

## 20日因子门禁

- `jq_lcr_volume_stability`：pass=True，IC=0.05838230477197506，t=6.874338917016999，多空=0.010152196336555556，正收益比例=0.6666666666666666
- `jq_lcr_volume_stability_cap_neutral`：pass=True，IC=0.05575734825323859，t=6.784625436760794，多空=0.008696199877453724，正收益比例=0.6341463414634146

## 准模拟盘检查

- `factor_gate_pass_count`：True
- `overall_strategy_return`：True
- `overall_annual_return`：True
- `overall_active_return`：True
- `overall_active_sharpe`：True
- `overall_drawdown`：True
- `layer_count`：True

## 数据边界

真实 JoinQuant factor slice 合并复算；候选版本统一使用相同截面、成本、滑点和准模拟盘门禁。
