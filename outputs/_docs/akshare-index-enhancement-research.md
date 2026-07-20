# 指数增强研究内核报告

生成时间：2026-07-15T11:29:48

## 直接结论

- 严格因子门禁通过：0 / 20。
- 准入型策略组合回测数量：0。
- 本轮按 1/5/10/20 日逐日 RankIC 和日度 Top20%-Bottom20% 多空收益重做后，没有 score_col 通过 20 日主周期门禁。
- 未通过门禁前，不使用旧的强制绕门禁组合收益作为准入证据。

## 数据边界

- 使用真实 AkShare OHLCV 数据。
- 当前版本使用静态指数成分池和等权基准，不使用历史成分、真实指数权重、市值、行业或基本面。
- 腾讯日线源缺成交额和换手率；本报告不伪造成交额、换手率或市值。
- v2 内核加入主动动量、残差低波、尾部风险、跳空风险、量价确认、趋势一致性、反拥挤和市场状态适配。
- 组合构建加入持仓缓冲、风险惩罚、主动袖口换手成本和稳定性评分。
- 标准流程：先做因子回测门禁，再做策略回测；因子未过门禁的 score_col 不进入策略回测。
- 结果用于研究筛选，不等同于可实盘指数增强产品。

## 因子门禁

- 样本日 >= 120
- RankIC >= 0.015
- RankIC t >= 2.0
- 多空收益 > 0.00%
- 多空胜率 >= 53.00%
- 策略回测准入：必须通过因子门禁
- RankIC 方法：daily_spearman_rank_correlation
- 多空方法：daily_top_20pct_minus_bottom_20pct_by_factor_rank

## 数据概况

| 指数 | 股票数 | 行数 | 日期数 | 起止日期 |
| --- | ---: | ---: | ---: | --- |
| csi300 | 300 | 453844 | 1580 | 2020-01-02 ~ 2026-07-13 |
| csi500 | 500 | 732652 | 1580 | 2020-01-02 ~ 2026-07-13 |

## 因子 RankIC Top

| 数据集 | 因子 | 期限 | 样本日 | RankIC | ICIR | 正IC比例 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| csi500 | f_active_reversal | 20 | 1132 | 0.0428 | 0.22 | 56.10% |
| csi300 | f_active_reversal | 20 | 1165 | 0.0424 | 0.19 | 55.36% |
| csi500 | ie_reversal_recovery_v3 | 20 | 1555 | 0.0418 | 0.24 | 59.04% |
| csi500 | ie_low_crowding_resilience_v3 | 20 | 1560 | 0.0391 | 0.21 | 57.18% |
| csi500 | f_residual_low_volatility | 20 | 1530 | 0.0379 | 0.20 | 55.82% |
| csi500 | f_anti_crowding | 20 | 1551 | 0.0325 | 0.23 | 57.64% |
| csi500 | f_intraday_distribution_reversal | 20 | 1551 | 0.0309 | 0.23 | 58.03% |
| csi500 | f_momentum_exhaustion | 20 | 1551 | 0.0307 | 0.17 | 53.19% |
| csi500 | f_low_volatility | 20 | 1550 | 0.0282 | 0.13 | 53.48% |
| csi500 | f_volume_stability | 20 | 1551 | 0.0245 | 0.27 | 62.15% |
| csi500 | f_gap_risk_control | 20 | 1550 | 0.0243 | 0.12 | 54.06% |
| csi500 | ie_defensive_quality_v1 | 20 | 1551 | 0.0243 | 0.11 | 53.26% |
| csi500 | ie_reversal_resilience_v1 | 20 | 1560 | 0.0238 | 0.13 | 54.49% |
| csi300 | f_volume_stability | 20 | 1551 | 0.0189 | 0.16 | 58.28% |
| csi500 | f_downside_resilience | 20 | 1530 | 0.0183 | 0.08 | 51.57% |
| csi500 | ie_low_turnover_resilience_v2 | 20 | 1551 | 0.0175 | 0.09 | 53.71% |
| csi300 | ie_reversal_recovery_v3 | 20 | 1555 | 0.0175 | 0.09 | 52.54% |
| csi500 | f_tail_risk_control | 20 | 1530 | 0.0158 | 0.08 | 52.22% |
| csi500 | f_short_reversal | 20 | 1555 | 0.0137 | 0.09 | 52.28% |
| csi300 | f_momentum_exhaustion | 20 | 1551 | 0.0133 | 0.06 | 49.65% |
| csi500 | ie_dynamic_icir_v1 | 20 | 1560 | 0.0106 | 0.06 | 50.06% |
| csi300 | f_anti_crowding | 20 | 1551 | 0.0106 | 0.06 | 48.81% |
| csi300 | f_intraday_distribution_reversal | 20 | 1551 | 0.0089 | 0.06 | 50.55% |
| csi300 | f_residual_low_volatility | 20 | 1530 | 0.0081 | 0.04 | 51.11% |
| csi300 | ie_low_crowding_resilience_v3 | 20 | 1560 | 0.0064 | 0.03 | 51.28% |
| csi300 | f_gap_risk_control | 20 | 1550 | 0.0031 | 0.01 | 50.77% |
| csi300 | ie_dynamic_icir_v1 | 20 | 1560 | -0.0007 | -0.00 | 51.67% |
| csi300 | f_low_volatility | 20 | 1550 | -0.0007 | -0.00 | 49.87% |
| csi300 | f_short_reversal | 20 | 1555 | -0.0009 | -0.00 | 48.81% |
| csi500 | f_close_strength | 20 | 1560 | -0.0017 | -0.02 | 50.13% |

## 因子门禁审计

| 数据集 | score_col | 通过 | 20日RankIC | t值 | 多空收益 | 多空胜率 | 阻塞原因 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| csi300 | ie_balanced_alpha_v1 | 否 | -0.0213 | -4.16 | -1.08% | 43.46% | factor_gate_not_passed |
| csi300 | ie_defensive_quality_v1 | 否 | -0.0063 | -1.03 | -2.52% | 41.67% | factor_gate_not_passed |
| csi300 | ie_momentum_quality_v1 | 否 | -0.0230 | -4.51 | 0.46% | 50.51% | factor_gate_not_passed |
| csi300 | ie_reversal_resilience_v1 | 否 | -0.0082 | -1.57 | -2.40% | 40.06% | factor_gate_not_passed |
| csi300 | ie_apex_ohlcv_alpha_v2 | 否 | -0.0200 | -3.99 | -0.81% | 43.91% | factor_gate_not_passed |
| csi300 | ie_low_turnover_resilience_v2 | 否 | -0.0102 | -1.74 | -2.11% | 42.76% | factor_gate_not_passed |
| csi300 | ie_low_crowding_resilience_v3 | 否 | 0.0064 | 1.20 | -2.26% | 40.96% | factor_gate_not_passed |
| csi300 | ie_reversal_recovery_v3 | 否 | 0.0175 | 3.45 | -1.04% | 43.46% | factor_gate_not_passed |
| csi300 | ie_volume_confirmed_alpha_v4 | 否 | -0.0118 | -3.01 | 0.22% | 48.46% | factor_gate_not_passed |
| csi300 | ie_dynamic_icir_v1 | 否 | -0.0007 | -0.12 | -0.46% | 45.71% | factor_gate_not_passed |
| csi500 | ie_balanced_alpha_v1 | 否 | -0.0102 | -2.33 | -1.17% | 42.37% | factor_gate_not_passed |
| csi500 | ie_defensive_quality_v1 | 否 | 0.0243 | 4.44 | -2.28% | 44.42% | factor_gate_not_passed |
| csi500 | ie_momentum_quality_v1 | 否 | -0.0292 | -6.61 | 0.05% | 50.26% | factor_gate_not_passed |
| csi500 | ie_reversal_resilience_v1 | 否 | 0.0238 | 5.11 | -2.01% | 43.14% | factor_gate_not_passed |
| csi500 | ie_apex_ohlcv_alpha_v2 | 否 | -0.0108 | -2.50 | -1.04% | 43.85% | factor_gate_not_passed |
| csi500 | ie_low_turnover_resilience_v2 | 否 | 0.0175 | 3.37 | -2.10% | 43.78% | factor_gate_not_passed |
| csi500 | ie_low_crowding_resilience_v3 | 否 | 0.0391 | 8.32 | -2.02% | 44.29% | factor_gate_not_passed |
| csi500 | ie_reversal_recovery_v3 | 否 | 0.0418 | 9.27 | -1.47% | 45.77% | factor_gate_not_passed |
| csi500 | ie_volume_confirmed_alpha_v4 | 否 | -0.0051 | -1.49 | 0.35% | 53.65% | factor_gate_not_passed |
| csi500 | ie_dynamic_icir_v1 | 否 | 0.0106 | 2.34 | -0.84% | 44.17% | factor_gate_not_passed |

## 组合回测 Top

| 数据集 | 策略 | 调仓 | TopN | 核心权重 | 缓冲 | 风险惩罚 | 稳定分 | 主动收益 | 主动年化 | 主动Sharpe | Sortino | Calmar | 主动回撤 | 均换手 | 最差单期主动 | 策略收益 | 基准收益 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |

## 下一步

1. 补真实历史成分、指数权重、市值和行业，升级为严格指数增强。
2. 使用成交额/换手率/财务数据扩展估值、质量、流动性和基本面因子。
3. 对候选策略做年度分段、成本压力、涨跌停/停牌、容量和 JoinQuant 复核。
4. 将首选组合接入 BigQuant/JoinQuant 做独立复核，确认停牌、涨跌停、滑点和容量约束后的表现。
