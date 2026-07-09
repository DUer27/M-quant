# 2026-07-10 核心量价中波动小市值信号导入闸门

## 做了什么

- 新增导入库：
  - `platform/quant-factor-platform/data/imported-core-medium-small-signal-reviews.json`
- 新增校验接口：
  - `/backtest-api/validate-core-medium-small-signal-review`
- 新增查询接口：
  - `/strategy-api/core-medium-small-signal-reviews`
- `/backtest-api/import-results` 支持导入核心量价最新信号复核 JSON。
- `core_medium_small_promotion_task_pack_20260710.json` 会读取已导入复核，显示：
  - `waiting_for_joinquant_latest_signal_review`
  - `signal_ready_imported_waiting_for_operations_pack_promotion`
  - `signal_not_ready_imported`

## 严格校验

导入 JSON 必须满足：

- `source = joinquant_core_medium_small_latest_signal_review`
- `strategy_id = core_volume_price_trend_v1`
- `sleeve_id = jq_medium_vol_small_cap_core`
- `decision` 只能是：
  - `promotion_signal_ready`
  - `promotion_signal_not_ready`
- `selected_count` 必须等于 `records.length`
- `target_market_regime` 必须是 `medium_volatility`
- `target_market_cap_bucket` 必须是 `small_cap`
- records 中候选如带 `market_cap_bucket`，必须全部是 `small_cap`
- 如果 `decision=promotion_signal_ready`：
  - `market_regime` 必须等于 `medium_volatility`
  - `selected_count >= 10`

## 已验证

- 形状正确的样例通过 validate，但 validate 不写入。
- validate 后 `/strategy-api/core-medium-small-signal-reviews` 仍为空，未污染复核库。
- 错误市场状态样例被拒绝：
  - `promotion_signal_ready` + `market_regime=high_volatility` 被拒绝。
- `node --check platform/quant-factor-platform/server.mjs`
- `node --check platform/quant-factor-platform/assets/app.js`
- `python3 -m py_compile` 覆盖新增任务包脚本和 JoinQuant 脚本。

## 数据边界

本次只增加导入闸门和严格校验。没有导入任何真实或伪造复核记录，没有生成收益、净值、成交、持仓、交易可行性或成熟策略晋级结论。即使未来导入 `promotion_signal_ready`，仍需下一步把该路线写入模拟观察运行包后，才可能计入两条成熟策略目标。
