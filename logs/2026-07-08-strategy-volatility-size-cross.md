# 2026-07-08 策略交叉分层实测日志

## 本次升级

- 为 `核心量价趋势策略 v1` 增加 JoinQuant 交叉分层脚本。
- 新增后端脚本接口：
  - `/strategy-api/joinquant-volatility-size-script.py?strategy=core_volume_price_trend_v1`
- 策略池新增 `交叉脚本` 下载按钮。
- 前端 `策略实测` 支持识别和展示：
  - `strategy_regime_size_backtest`
- 已将 JoinQuant 真实输出导入：
  - `platform/quant-factor-platform/data/imported-backtest-results.json`

## 真实数据口径

- 行情数据：JoinQuant `get_price` 真实 OHLCV。
- 市场状态：沪深300 `000300.XSHG` 20日滚动年化波动率。
- 高低波动划分：
  - 高波动：`market_vol_20d >= trailing 70% quantile`
  - 低波动：`market_vol_20d <= trailing 30% quantile`
  - 中波动：介于二者之间
- 市值数据：JoinQuant `valuation.market_cap`。
- 市值分层：
  - 大市值：当日沪深300截面 `market_cap_rank_pct >= 0.67`
  - 小市值：当日沪深300截面 `market_cap_rank_pct <= 0.33`
  - 中市值：介于二者之间

## 导入结果

- `result_type`: `strategy_regime_size_backtest`
- `source`: `joinquant_volatility_market_cap_cross_rebuild`
- 样本：
  - 因子行：35400
  - 策略候选：3237
  - 测试日：118
  - 交叉后候选：3237
- 覆盖组合：
  - 高波动 + 大市值
  - 高波动 + 中市值
  - 高波动 + 小市值
  - 中波动 + 大市值
  - 中波动 + 中市值
  - 中波动 + 小市值
  - 低波动 + 大市值
  - 低波动 + 中市值
  - 低波动 + 小市值
- 每个组合包含 5日、10日、20日结果，共 27 条。

## 当前观察

- 低波动 + 大市值 + 20日：日均收益约 5.03%，正向占比约 74.19%。
- 低波动 + 中市值 + 20日：日均收益约 4.15%，正向占比约 77.42%。
- 低波动 + 小市值 + 20日：日均收益约 4.01%，正向占比约 72.41%。
- 中波动 + 中市值 + 20日：日均收益约 1.87%，正向占比约 52.08%。
- 高波动 + 大市值 + 20日：日均收益约 1.79%，正向占比约 58.97%。

## 真实性边界

- 本次结果来自 JoinQuant 真实运行输出。
- 未编造、未估算、未手填绩效。
- 这是研究环境候选收益检验，不等同完整交易回测。
- 后续如果要升级为正式策略，应继续做交易回测、费用滑点、调仓规则和持仓约束验证。
