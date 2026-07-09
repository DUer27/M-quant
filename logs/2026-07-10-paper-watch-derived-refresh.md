# 2026-07-10 模拟观察派生包刷新链路

## 目标

- 交易可行性复核 JSON 导入后，自动刷新模拟观察运行包、成熟策略矩阵和交易复核任务包。
- 避免真实 JoinQuant 结果已经回填，但平台仍显示旧阻塞状态。

## 实现

- 服务端新增固定白名单刷新函数，只运行以下项目内脚本：
  - `outputs/paper-watch/scripts/build_paper_watch_operations_pack.py`
  - `outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
  - `outputs/paper-watch/scripts/build_tradeability_review_task_pack.py`
- `/backtest-api/import-results` 在识别并导入 `joinquant_akshare_latest_signal_tradeability_review` 后自动执行刷新。
- 新增 `POST /paper-watch-api/rebuild-derived-packs`，用于手动重建派生包。
- `模拟观察清单` 的交易可行性复核任务包增加“刷新派生包”按钮。

## 数据边界

- 刷新只重建本地 JSON/Markdown 派生工件。
- 不调用 JoinQuant，不生成收益、净值、成交、持仓或交易可行性结论。
- 是否解除 `akshare_local_switch` 阻塞，仍只取决于用户导入的真实 JoinQuant 复核 JSON。
