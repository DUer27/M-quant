# 2026-07-10 JoinQuant 交易可行性复核任务包

## 目标

- 将 `AkShare本地高低波动切换策略 v1` 的最近阻塞项拆成可执行任务。
- 只整理已有信号、运行包和成熟策略矩阵，不生成交易可行性结论。

## 新增文件

- `outputs/paper-watch/scripts/build_tradeability_review_task_pack.py`
- `outputs/paper-watch/results/tradeability_review_task_pack_20260710.json`
- `outputs/_docs/tradeability-review-task-pack-20260710.md`

## 当前状态

- 状态：`waiting_for_joinquant_review`。
- 目标信号：`ak_mean_reversion_quality_combo`，信号日 `2026-07-09`。
- 入选股票：15 只。
- 通过门槛：JoinQuant 复核可交易数量不少于 10 只，且 `decision=tradeability_review_passed`。
- 当前仍未导入真实 JoinQuant 复核 JSON，因此 `akshare_local_switch` 仍不能导入正权重账本记录。

## 平台接入

- `/strategy-api/paper-watch-routes` 已并入 `tradeabilityReviewTaskPack` 字段。
- 新增 `/strategy-api/tradeability-review-task-pack` 只读接口。
- `模拟观察清单` 新增折叠式“交易可行性复核任务包”，展示复核状态、下载脚本入口、候选数量、通过门槛、导入要求和候选代码。

## 数据边界

- 任务包不是复核结果。
- 未在 JoinQuant Python3 研究环境跑出真实 JSON 并导入前，不改变任何策略准入状态。
