# 2026-07-14 指数增强量价确认 Alpha 研究日志

## 进展

- 完成沪深300和中证500静态成分池日线数据抓取，覆盖 `2020-01-02` 至 `2026-07-13`。
- 新增指数增强研究脚本：`outputs/sources/akshare/scripts/build_index_enhancement_research.py`。
- 因子从基础动量/低波扩展到主动动量、主动反转、残差低波、尾部风险、跳空风险、量价确认、量能稳定、反拥挤、趋势秩序和市场状态适配。
- 增加组合构建能力：核心等权基准 + 主动袖口、TopN、核心权重、持仓缓冲、风险惩罚、换手成本、年度分段、主动收益指标。
- 增加 `--score-cols`、`--include-factor-portfolios`、`--ic-step`、`--write-factor-csv`，便于快速迭代和完整审计分开执行。

## 核心发现

- 多因子平均拼接表现不佳，早期 v2/v3 复合因子在两个指数上多数主动为负。
- 单因子诊断显示，当前样本中最强、最稳定的 OHLCV 指数增强信号是 `f_volume_confirmation`。
- `f_volume_confirmation` 的定义为：20日收益经过截尾后，乘以 20/60 日均量变化方向。它本质上寻找“收益方向与量能趋势一致”的股票。
- 沪深300上，`f_volume_confirmation` Top30/core75/buffer1.5 主动收益最高且稳定性评分领先。
- 中证500上，`f_volume_confirmation` Top80/core75/buffer2.0 主动收益最高且年度主动表现更均衡。

## 首选研究参数

| 指数 | score_col | 调仓 | TopN | 核心权重 | 缓冲 | 主动收益 | 主动年化 | 主动Sharpe | 主动回撤 | 平均换手 | 交易文件 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| csi300 | `z_f_volume_confirmation` | 20日 | 30 | 75% | 1.5 | 39.65% | 6.20% | 1.10 | -6.08% | 85.28% | `outputs/sources/akshare/index_enhancement/results/csi300_z_f_volume_confirmation_top30_core75_buf150_risk0_trades.csv` |
| csi500 | `z_f_volume_confirmation` | 20日 | 80 | 75% | 2.0 | 33.57% | 5.35% | 1.09 | -3.20% | 78.22% | `outputs/sources/akshare/index_enhancement/results/csi500_z_f_volume_confirmation_top80_core75_buf200_risk0_trades.csv` |

## 保守参数

| 指数 | score_col | 调仓 | TopN | 核心权重 | 缓冲 | 主动收益 | 主动年化 | 主动Sharpe | 主动回撤 | 平均换手 | 交易文件 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| csi300 | `z_f_volume_confirmation` | 20日 | 40 | 85% | 2.0 | 18.44% | 3.09% | 1.09 | -3.26% | 80.46% | `outputs/sources/akshare/index_enhancement/results/csi300_z_f_volume_confirmation_top40_core85_buf200_risk0_trades.csv` |
| csi500 | `z_f_volume_confirmation` | 20日 | 100 | 85% | 2.0 | 17.96% | 3.02% | 1.09 | -1.74% | 74.42% | `outputs/sources/akshare/index_enhancement/results/csi500_z_f_volume_confirmation_top100_core85_buf200_risk0_trades.csv` |

## 年度稳定性

- csi300 首选组合年度主动：2020 +4.82%，2021 +7.39%，2022 -1.00%，2023 -2.09%，2024 +1.84%，2025 +17.63%，2026 +6.83%。
- csi500 首选组合年度主动：2020 +2.63%，2021 +15.07%，2022 +0.65%，2023 +0.72%，2024 +0.82%，2025 +8.30%，2026 +2.18%。
- csi500 的年度主动更均衡；csi300 的收益弹性更强，但 2022-2023 有弱势段。

## 数据边界

- 当前使用静态指数成分，不含历史成分变化、真实指数权重、行业、市值、基本面和成交额/换手率。
- 当前基准为可交易股票池等权收益，不是真实指数收益。
- 腾讯日线源缺成交额和换手率；本研究没有伪造成交额、换手率、市值或行业暴露。
- 当前回测未处理停牌、涨跌停不可成交、冲击成本、真实指数权重跟踪误差和容量约束。

## 下一步

1. 把 `f_volume_confirmation` 作为指数增强主因子，进入 BigQuant/JoinQuant 独立复核。
2. 补真实历史成分、指数权重、行业和市值，升级为严格指数增强框架。
3. 对 TopN 组合加入停牌/涨跌停/滑点/冲击成本/容量压力测试。
4. 做月度/季度再平衡、10/20/40日调仓和换手惩罚对照，降低 74%-85% 的平均单期换手。
5. 研究 `f_volume_confirmation` 与成交额、换手率、资金流、行业中性和市值中性的交互，判断是否能变成更稳健的复合因子。
