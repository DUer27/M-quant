# 成熟策略推进矩阵

- 生成时间：2026-07-10T03:12:42
- 目标：至少 2 条完整回测且可进入模拟观察的策略。
- 当前：2 条。
- 状态：`target_met` / 已满足两条成熟策略目标
- 数据原则：只读取已审计 JoinQuant 策略结果、模拟观察运行包、AkShare 本地稳健性结果和用户导入的交易复核；不生成收益、净值、成交、持仓或交易可行性结论。

## 阻塞项

- 无硬阻塞。

## 策略矩阵

| 项目 | 类型 | 决策 | 计入目标 | 收益 | 回撤 | Sharpe | 下一步 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 市场状态切换策略 v1 | paper_watch_capital_sleeve | 可进入模拟观察 | 是 | 83.29% | -9.07% | 1.80 | 开始真实模拟观察账本记录，并按运行包暂停规则监控。 |
| 核心量价趋势策略 v1 | paper_watch_capital_sleeve | 准入阻塞 | 否 | 43.30% | -9.34% | 1.39 | 补齐 blocked_reasons 中列出的准入证据后再允许 planned_weight 大于 0。 |
| AkShare本地高低波动切换策略 v1 | paper_watch_capital_sleeve | 可进入模拟观察 | 是 | 174.09% | -6.60% | 3.14 | 开始真实模拟观察账本记录，并按运行包暂停规则监控。 |
| JQ质量利润流动性策略 v1 | monitor_only_component | 只做组件监控 | 否 | 35.13% | -10.27% | 1.74 | 保留为控制器组件或备选，不作为第二个独立资金袖重复开仓。 |
| K线辅助确认策略 | controlled_route_candidate | 分层路线通过但非独立资金袖 | 否 | 49.93% | -3.92% | 2.52 | 作为控制器组件、候选池或参数来源；不要重复计算独立资金袖数量。 |
| K线辅助确认策略 | controlled_route_candidate | 分层路线通过但非独立资金袖 | 否 | 35.64% | -4.11% | 1.86 | 作为控制器组件、候选池或参数来源；不要重复计算独立资金袖数量。 |
| K线辅助确认策略 | controlled_route_candidate | 分层路线通过但非独立资金袖 | 否 | 26.24% | -7.31% | 1.27 | 作为控制器组件、候选池或参数来源；不要重复计算独立资金袖数量。 |
| 主力资金广度K线确认策略 v0 | controlled_route_candidate | 分层路线通过但非独立资金袖 | 否 | 20.54% | -12.01% | 1.28 | 作为控制器组件、候选池或参数来源；不要重复计算独立资金袖数量。 |
| AkShare本地高低波动切换策略 v1 | maturity_gap | 缺聚宽准入复核 | 否 | NA | NA | NA | 先运行并回填最新信号交易可行性复核；再运行 AkShare 强分层候选 JoinQuant 批量复核，决定是否升级第二资金袖。 |

## 独立资金袖候选

- 准入：2
- 阻塞候选：12

| 候选 | 决策 | 计入目标 | 缺口 |
| --- | --- | --- | --- |
| 市场状态切换策略 v1 | 已准入独立资金袖 | 是 |  |
| 核心量价趋势策略 v1 | 最新信号未通过 | 否 | 已导入核心量价中波动/小市值最新信号复核，但未达到 promotion_signal_ready 门槛。 |
| AkShare本地高低波动切换策略 v1 | 已准入独立资金袖 | 是 |  |
| JQ质量利润流动性策略 v1 | 组件重叠，仅监控 | 否 | 与市场状态切换策略共享高波动组件，不能作为独立资金袖重复满仓。 |
| K线辅助确认策略 | 路线候选，需独立性复核 | 否 | 该路线通过分层硬门槛，但当前未被证明能作为独立资金袖与主控制器并行。 |
| K线辅助确认策略 | 路线候选，需独立性复核 | 否 | 该路线通过分层硬门槛，但当前未被证明能作为独立资金袖与主控制器并行。 |
| K线辅助确认策略 | 路线候选，需独立性复核 | 否 | 该路线通过分层硬门槛，但当前未被证明能作为独立资金袖与主控制器并行。 |
| 主力资金广度K线确认策略 v0 | 路线候选，需独立性复核 | 否 | 该路线通过分层硬门槛，但当前未被证明能作为独立资金袖与主控制器并行。 |
| akshare_candidate::ak_high_vol_mean_reversion_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |
| akshare_candidate::ak_low_vol_defensive_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |
| akshare_candidate::ak_low_vol_volume_trend_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |
| akshare_candidate::ak_high_vol_anti_crowding_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |
| akshare_candidate::ak_low_vol_contraction_breakout_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |
| akshare_candidate::ak_low_vol_trend_pullback_mid_liquidity | 待交易可行性复核 | 否 | 本地证据不足以直接进入 M-quant 模拟观察目标；需要 JoinQuant 口径复核。 |

## 下一步

1. 运行并回填 AkShare 最新信号 JoinQuant 交易可行性复核脚本。 这是把 AkShare 本地切换策略从 record_only 升级为可观察资金袖的最近阻塞项。
2. 运行 AkShare 强分层候选 JoinQuant 批量复核并回填 records。 用于判断本地 6 条强候选能否在 JoinQuant OHLCV/valuation 口径下继续保留。
3. 对 jq_controller 开始真实模拟观察账本记录。 当前唯一已准入资金袖需要样本外观察数据，而不是继续只看历史回测。