# 模拟观察运行包

- 生成时间：2026-07-10T03:12:42
- 状态：`ready_with_blockers`
- 数据原则：只读取已审计 JoinQuant 曲线、AkShare 本地 OHLCV 策略与已导入交易复核；不生成收益、净值、成交或持仓。
- 可观察资金袖：2 / 3

## 资金袖

### 市场状态切换策略 v1

- 资金袖：`jq_controller`
- 证据源：JoinQuant derived real curves
- 状态：`ready_for_controlled_paper_watch`
- 可开始观察：True
- 收益证据：83.29%
- 回撤证据：-9.07%
- Sharpe：1.8039399491070465

### 核心量价趋势策略 v1

- 资金袖：`jq_medium_vol_small_cap_core`
- 证据源：JoinQuant historical route + imported latest signal review
- 状态：`blocked_by_latest_signal_review`
- 可开始观察：False
- 收益证据：43.30%
- 回撤证据：-9.34%
- Sharpe：1.3930551667201772
- 阻塞：已导入核心量价中波动/小市值最新信号复核，但未达到 promotion_signal_ready 门槛。

### AkShare本地高低波动切换策略 v1

- 资金袖：`akshare_local_switch`
- 证据源：AkShare local OHLCV
- 状态：`ready_for_controlled_paper_watch`
- 可开始观察：True
- 收益证据：174.09%
- 回撤证据：-6.60%
- Sharpe：3.14203779176307

## 每日账本字段

- `date`：观察日期，YYYY-MM-DD。
- `sleeve_id`：资金袖：jq_controller / jq_medium_vol_small_cap_core / akshare_local_switch。
- `strategy_id`：策略ID。
- `signal_state`：ready / blocked / record_only / paused。
- `gate_status`：准入门槛状态，必须来自运行包。
- `candidate_count`：当期候选数量。
- `selected_count`：当期入选数量。
- `selected_codes`：入选股票代码列表。
- `paper_action`：open_allowed / record_only / pause_new_entry / close_only。
- `planned_weight`：计划观察仓位；未复核通过时必须为 0。
- `paper_nav`：模拟观察净值；由后续真实记录填写，本包不生成。
- `period_return`：观察期收益；由后续真实记录填写，本包不生成。
- `benchmark_return`：基准收益；由后续真实记录填写。
- `rolling_drawdown`：模拟观察滚动回撤。
- `turnover`：换手率或估算换手。
- `slippage`：滑点记录。
- `industry_top_exposure`：第一大行业暴露。
- `market_cap_exposure`：市值暴露。
- `blocked_reason`：若不可开仓，记录阻塞原因。
- `notes`：人工备注。

## 边界

- 本运行包不生成任何纸面收益、净值、成交或持仓。
- AkShare 本地路线必须等 JoinQuant 交易可行性复核通过后，才允许 planned_weight 大于 0。
- JoinQuant 组件监控路线不作为独立资金袖重复开仓。
