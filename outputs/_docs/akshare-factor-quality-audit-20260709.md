# AkShare 因子质量审计

生成时间：2026-07-09T14:15:54

## 数据口径

- 输入回测：`outputs/sources/akshare/results/akshare_ohlcv_factor_backtest_results.json`
- 输入候选：`outputs/sources/akshare/results/akshare_strategy_candidate_validation.json`
- 因子数：15 个
- 策略候选：6 条
- 原则：只审计真实回测结果；不生成新收益，不替代 JoinQuant 复核。

## 因子门槛

- 样本天数 >= 120
- RankIC >= 0.015
- RankIC t >= 2.0
- 多空收益 > 0
- 多空胜率 >= 53.00%

## 因子结论

### 单因子通过

- `ak_liquidity_stability`：5日通过：RankIC 0.0305，t 6.57，多空 0.31%，多空胜率 58.49%。 最佳周期 5日。

### 显著但不可单独交易

- `ak_anti_crowding_reversal_combo`：5日 RankIC 显著，但多空 -0.29%、胜率 45.49% 未过交易门槛。 最佳周期 5日。
- `ak_crowding_risk`：5日 RankIC 显著，但多空 -0.09%、胜率 51.80% 未过交易门槛。 最佳周期 5日。
- `ak_mean_reversion_quality_combo`：5日 RankIC 显著，但多空 -0.45%、胜率 46.22% 未过交易门槛。 最佳周期 5日。

### 继续观察

- `ak_breakout_confirmation`：20日方向为正但强度不足：RankIC 0.0033，t 0.52，多空 0.48%。 最佳周期 20日。
- `ak_contraction_breakout_combo`：5日方向为正但强度不足：RankIC 0.0067，t 0.84，多空 0.02%。 最佳周期 5日。
- `ak_trend_pullback_reversal_combo`：5日方向为正但强度不足：RankIC 0.0011，t 0.14，多空 0.04%。 最佳周期 5日。
- `ak_trend_quality`：20日方向为正但强度不足：RankIC 0.0033，t 0.38，多空 2.15%。 最佳周期 20日。
- `ak_volume_price_confirmation`：20日方向为正但强度不足：RankIC 0.0061，t 0.98，多空 0.97%。 最佳周期 20日。
- `ak_volume_trend_quality_combo`：20日方向为正但强度不足：RankIC 0.0020，t 0.25，多空 1.02%。 最佳周期 20日。

### 暂缓单独使用

- `ak_defensive_quality_combo`：20日未同时满足 RankIC、t值、多空收益和胜率门槛；当前不能作为独立 alpha。 最佳周期 20日。
- `ak_kline_confirmation`：20日未同时满足 RankIC、t值、多空收益和胜率门槛；当前不能作为独立 alpha。 最佳周期 20日。
- `ak_low_volatility_quality`：5日未同时满足 RankIC、t值、多空收益和胜率门槛；当前不能作为独立 alpha。 最佳周期 5日。
- `ak_pullback_support_quality`：5日未同时满足 RankIC、t值、多空收益和胜率门槛；当前不能作为独立 alpha。 最佳周期 5日。
- `ak_volatility_contraction_quality`：5日未同时满足 RankIC、t值、多空收益和胜率门槛；当前不能作为独立 alpha。 最佳周期 5日。

## 策略候选结论

| 策略 | 状态 | 交易数 | 收益 | 回撤 | Sharpe | 下一步 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| AkShare高波动均值回归-中流动性观察策略 | 待 JoinQuant 复核 | 33 | 48.19% | -4.89% | 3.02 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |
| AkShare低波动防守确认-中流动性观察策略 | 待 JoinQuant 复核 | 39 | 96.89% | -5.49% | 2.81 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |
| AkShare低波动量价趋势-中流动性观察策略 | 待 JoinQuant 复核 | 39 | 97.76% | -10.92% | 2.69 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |
| AkShare高波动反拥挤-中流动性观察策略 | 待 JoinQuant 复核 | 33 | 42.13% | -4.47% | 2.56 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |
| AkShare低波动收缩突破-中流动性观察策略 | 待 JoinQuant 复核 | 39 | 84.95% | -4.19% | 3.23 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |
| AkShare低波动趋势回踩-中流动性观察策略 | 待 JoinQuant 复核 | 39 | 111.38% | -7.38% | 2.84 | 导入 JoinQuant 复核结果后再决定是否进入正式策略池。 |

## 晋级规则

- `单因子通过` 可以进入策略组合研究，但仍需外部复核和分层审计。
- `显著但不可单独交易` 只能作为风控或组合模块，不能独立形成策略。
- `待 JoinQuant 复核` 不是成熟策略；必须回填 JoinQuant 真实结果后再筛。
