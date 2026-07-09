# AkShare 最新信号 JoinQuant 交易可行性复核

- 信号日期：2026-07-09
- 本地信号：`outputs/sources/akshare/results/akshare_paper_watch_latest_signal_20260709.json`
- 复核脚本：`outputs/sources/joinquant/scripts/m_quant_akshare_latest_signal_tradeability_review_20260709.py`
- 平台下载入口：`/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py`

## 复核对象

`AkShare高波动均值回归-中流动性观察策略` 在 2026-07-09 触发 `paper_watch_open_allowed`，本次脚本只复核这 15 只候选：

`002001, 000568, 000858, 000425, 000338, 000651, 000001, 002142, 000776, 002027, 002241, 002179, 002230, 002415, 002714`

## 数据原则

- 只使用 JoinQuant 真实研究环境数据复核交易状态。
- 检查停牌、ST、涨跌停、行业、市值、换手率和可交易数量。
- 不生成收益，不替代策略回测，不把本地 AkShare 结果包装成 JoinQuant 原生结果。

## 通过条件

- 可交易候选不少于 10 只。
- 复核输出中的 `decision` 为 `tradeability_review_passed`。
- 若行业或市值暴露过度集中，应只进入小仓位模拟观察，并继续补行业/市值约束。

## 操作步骤

1. 在平台打开或下载 `/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py`。
2. 粘贴到 JoinQuant Python3 研究环境运行。
3. 复制输出 JSON。
4. 回填到 M-quant 回测中心的结果导入区域。
