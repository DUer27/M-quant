# 2026-07-07 JoinQuant 因子实测记录

## 数据与环境

- 测试平台：JoinQuant 研究环境，Python 3。
- 运行日期：2026-07-07。
- M-quant CSV：`m-quant-joinquant-volume_price_confirmation.csv`。
- JoinQuant 最新交易日：2026-07-07。
- 历史重建样本：沪深300，118 个截面，2024-01-02 至 2026-06-08，平均约 300 只股票。
- 结果文件：
  - `work/quant-factor-platform/data/imported-backtest-results.json`
  - `outputs/joinquant/m_quant_joinquant_results_20260707.json`
  - JoinQuant 环境内也保存了 `m_quant_joinquant_results.json`

## 重要边界

- CSV 单日结果只验证 `2026-07-06 -> 2026-07-07` 的 1 日收益，不能单独证明因子长期有效。
- 历史结果为 JoinQuant OHLCV 重建版，不等同于 Yiwan 原始字段完全复现。
- 重建版缺少 Yiwan 的换手、筹码、KDJ/MACD 原字段，使用成交额、量比、均线、OHLCV 代理。
- 本次从 JoinQuant 页面输出表记录了 RankIC、RankIC t 值、多空收益；未从 JSON 原文带回 `ic_mean`，因此本地导入文件中 `ic_mean` 保持 `null`，不补假数据。

## 结果摘要

- `kline_event_score`：5/10/20 日方向较好，20 日 RankIC 0.016494，多空 0.013828，正收益截面占比 0.635593。
- `volume_price_confirmation`：1 日为负，5/10/20 日转正；5 日 RankIC 0.020429，20 日多空 0.010582。更适合中短持有，不适合当日/隔日追买。
- `trend_alignment`：1 日弱，5/10/20 日多空为正但 RankIC 不强。趋势质量更像过滤/持有辅助，而不是单独强 alpha。
- `trend_extension_risk`：5 日 RankIC 0.023680，但多空收益为负，说明风险方向需要继续校准分组和信号定义。
- `crowding_risk`：1 日 RankIC 尚可，但 5/10/20 日多空持续为负，不适合当前代理公式直接作为排序因子，需要改成过滤阈值。
- `technical_composite`：5/10/20 日多空为正，但 RankIC 中等偏弱；可以保留观察，不宜直接重仓决策。
- `volume_price_divergence_risk`：信号弱，不应作为核心因子，只能作为辅助风险警报。
- Yiwan 单日真实 CSV `volume_price_confirmation`：1 日 RankIC 0.053844，多空 0.001433；样本只有 1 个截面，只能作为向后跟踪起点。

## 下一步

- 将 `volume_price_confirmation` 的 1 日追涨惩罚加强，重点看 5/20 日。
- 将 `crowding_risk` 改成硬过滤/降权，不作为多空排序主因子。
- 对 `kline_event_score` 做持有期分层，优先测试 5/20 日。
- 后续应继续采集 Yiwan 每日截面，单日 CSV 因子必须累积到至少 60 个交易日再做正式结论。
