# 2026-07-10 交易可行性复核导入校验加固

## 目标

- 防止贴错 JoinQuant 复核 JSON 导致 `akshare_local_switch` 被错误解锁。
- 导入复核结果时必须和当前交易可行性复核任务包完全匹配。

## 新增校验

- `source` 必须为 `joinquant_akshare_latest_signal_tradeability_review`。
- `strategy_id` 必须匹配当前任务包目标：`ak_mean_reversion_quality_combo`。
- `signal_date` 必须匹配当前任务包目标：`2026-07-09`。
- `candidate_count` 必须等于 records 数量，并等于当前任务包 `selected_count`。
- records 中 `code/local_code` 的六位代码集合必须与当前任务包 `selected_codes` 完全一致。
- `tradable_count` 必须等于 records 中 `tradable=true` 的数量。

## 验证

- 错误日期样例 `2026-07-08` 被拒绝，未写入复核库。
- 少一只候选股票的样例被拒绝，未写入复核库。
- 拒绝后平台仍显示：
  - 交易复核任务包：`waiting_for_joinquant_review`
  - 成熟策略矩阵：`not_met`
  - 运行包：1 个可观察资金袖、1 个阻塞资金袖

## 数据边界

- 本次只增强导入校验。
- 不生成交易可行性结论，不生成收益、净值、成交或持仓。
