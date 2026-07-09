# JoinQuant 策略实测目录

本目录只保存 JoinQuant 真实跑出的策略回测结果、策略分层结果和对应脚本输出。

建议命名：

```text
strategy_<策略ID>_<分层口径>_<起始日期>_<结束日期>.json
strategy_<策略ID>_<分层口径>_<起始日期>_<结束日期>.csv
```

示例：

```text
strategy_core_volume_trend_v1_large_cap_high_vol_20240101_20260701.json
```

不要把策略草案、模拟展示数据、未跑通的临时结果放进这里。草案可以继续留在平台数据或日志中，真实回测结果再进入本目录。

## 当前审计产物

- `audit_strategy_maturity.py`：读取已导入的 JoinQuant 真实策略结果，审计整策略和受控分层路线成熟度。
- `strategy_maturity_audit_20260709.json`：策略成熟度审计结果。
- `paper_watch_routes_20260709.json`：首批受控模拟观察路线配置。
- `build_paper_watch_execution_pack.py`：从首批路线生成模拟观察执行包。
- `paper_watch_execution_pack_20260709.json`：模拟观察执行包，包含开仓边界、暂停规则和每日观察字段。
- `audit_paper_watch_readiness.py`：用真实 JoinQuant 交易净值曲线复核模拟观察前的成本压力、分段收益、候选数量和近期触发。
- `paper_watch_readiness_audit_20260709.json`：模拟观察就绪审计结果。
- `build_regime_switch_quality_kline_strategy.py`：用已导入 JoinQuant 真实曲线构建高/低波动切换组合。
- `regime_switch_quality_kline_v1_20260709.json`：市场状态切换策略结果。

当前首批只允许两条路线进入模拟观察：

- `K线辅助确认策略`：仅低波动/大市值。
- `JQ质量利润流动性策略 v1`：仅高波动/中市值。

这些配置不是整策略放开，未通过的波动层、市值层不得在模拟盘中扩展使用。

进一步就绪审计后：

- `K线辅助确认策略` 低波动/大市值为 `conditional_paper_watch`：硬门槛、成本压力、前后半段通过，但最近一次触发在 2025-08-13，只能等低波动/大市值环境再次出现后观察。
- `JQ质量利润流动性策略 v1` 高波动/中市值为 `not_ready`：收益、回撤、Sharpe 和成本压力通过，但平均入选股票数只有 7.38，低于模拟观察的 10 只门槛，暂不进入模拟盘。

全量 9 条受控路线加 1 条真实曲线组合策略重新审计后，当前平台推荐模拟观察清单已更新为：

- `JQ质量利润流动性策略 v1`：仅高波动，`ready_controlled_paper_watch`，真实收益 35.13%，最大回撤 -10.27%，Sharpe 1.74，平均入选 30 只，最近触发至 2026-06-08。
- `市场状态切换策略 v1`：高低波动切换，`ready_controlled_paper_watch`，由 `JQ质量利润流动性策略 v1` 高波动真实曲线和 `K线辅助确认策略` 低波动真实曲线组合重算，收益 83.29%，最大回撤 -9.07%，Sharpe 1.80，平均入选 29.36 只，最近触发至 2026-06-08。

旧的高波动/中市值 JQ 路线不再作为模拟观察推荐路线，仅保留在审计结果中作为未通过样本数量门槛的历史候选。

`市场状态切换策略 v1` 是真实曲线组合策略，不是单次 JoinQuant 原生回测；其收益来自已导入 JoinQuant 组件曲线的单期 `gross_return/cost/turnover` 重算，中波动环境默认空仓/观察。
