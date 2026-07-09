# JoinQuant 交易可行性复核任务包

- 生成时间：2026-07-10T01:31:38
- 状态：`waiting_for_joinquant_review`
- 数据原则：只整理已有 AkShare 本地最新信号、运行包和成熟策略矩阵；不调用 JoinQuant，不生成交易可行性、收益、净值、成交或持仓。

## 目标信号

- 资金袖：`akshare_local_switch`
- 策略：`ak_mean_reversion_quality_combo` / AkShare高波动均值回归-中流动性观察策略
- 信号日期：2026-07-09
- 动作：paper_watch_open_allowed
- 候选：15，入选：15
- 入选代码：002001, 000568, 000858, 000425, 000338, 000651, 000001, 002142, 000776, 002027, 002241, 002179, 002230, 002415, 002714

## 当前阻塞

- 运行状态：`ready_local_switch_pending_tradeability_review`
- 可进入观察：False
- 阻塞原因：最新高波动触发信号尚未导入 JoinQuant 交易可行性复核 JSON。

## 执行步骤

1. 打开 JoinQuant Python3 研究环境。
2. 下载或复制 joinquant_script.download_endpoint 返回的脚本。
3. 在 JoinQuant 中运行脚本，等待其打印 JSON。
4. 完整复制打印出的 JSON，不要手工改 candidate_count、tradable_count、decision 或 records。
5. 回到 M-quant 回测中心结果回填，粘贴 JSON 并导入。
6. 导入后重新生成运行包和成熟策略矩阵，确认 akshare_local_switch 是否解除阻塞。

## 通过门槛

- 最少可交易数量：10
- 必须结论：`tradeability_review_passed`
- 导入接口：`/backtest-api/import-results`
- 脚本路径：`outputs/sources/joinquant/scripts/m_quant_akshare_latest_signal_tradeability_review_20260709.py`
- 下载入口：`/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py`

## 注意

- 本任务包不是复核结果。
- 未导入 JoinQuant 打印出的真实 JSON 前，AkShare 本地策略仍只能 record_only。