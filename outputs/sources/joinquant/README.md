# JoinQuant 脚本目录

这里保存需要在 JoinQuant Python3 研究环境运行的真实数据脚本。

原则：

- 脚本只调用 JoinQuant 真实接口，例如 `get_price`、`get_fundamentals`、`get_money_flow`。
- 不生成虚构收益、不补造缺失财务/资金/市值字段。
- 运行后复制脚本打印的 JSON，回填到 M-quant 回测中心。
- 未回填结果前，脚本只能证明“可复核”，不能证明“策略有效”。

## 当前关键脚本

- `scripts/m_quant_akshare_ohlcv_candidate_review.py`：复核 AkShare 本地 6 条强分层候选。输出 5/10/20 日事件收益、5日调仓交易净值、目标路线、市值层和高/中/低波动 × 大/中/小市值交叉层。
- `scripts/m_quant_jq_quality_profit_liquidity_strategy_backtest.py`：复核 JQ质量利润流动性策略。
- `scripts/m_quant_emotion_weighted_kline_strategy_backtest.py`：复核情绪系数加权 K 线策略。
- `scripts/m_quant_capital_follow_strategy_backtest.py`：复核资金跟随策略。

## AkShare 候选复核口径

`m_quant_akshare_ohlcv_candidate_review.py` 只复核已经通过本地稳定性验证的候选：

- 高波动均值回归-中流动性
- 低波动防守确认-中流动性
- 低波动量价趋势-中流动性
- 高波动反拥挤-中流动性
- 低波动收缩突破-中流动性
- 低波动趋势回踩-中流动性

JoinQuant 复核会替换本地不完整口径：

- 市场波动：沪深300真实指数 20 日年化波动率，使用历史滚动分位并 `shift(1)`。
- 流动性：JoinQuant 真实 `money_ma20`，不再使用腾讯源成交量兜底。
- 市值层：JoinQuant `valuation.market_cap` 当日截面分位。
- 拥挤风险：JoinQuant `valuation.turnover_ratio` 参与复核。

只有导入 JoinQuant 实跑结果，并通过收益、回撤、Sharpe、分层稳定性、样本外和成本检查后，候选才允许升级为正式策略候选。
