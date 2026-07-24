# 长江结构化反转因子拖累项诊断

生成时间：2026-07-24

## 当前判断

尚未导入完整真实 JoinQuant 高频 slice，因此不能宣称某个因子已经实测失败或通过。

代码逻辑层最可疑的拖累项是：

- `liquidity_quality_score`：当前按 `money_ma20` 正向排名，容易把成交额体量当作 alpha，稀释结构化反转。
- `liquidity_premium_proxy_score`：当前按 10m 成交冲击低者加分，更像可交易性过滤，不应强行作为正向 alpha。

核心结构化反转应优先验证：

- `structured_reversal_score`：`Rev_struct = Rev_rev - Rev_mom`，值越低越好。
- `high_volume_reversal_score`：单独检查高成交量区间下跌后的反转确认，即 `Rev_rev` 越低越好。

## 已补充的候选总分

新增候选列，不降低任何门槛：

- `structured_reversal_confirmed_score`：`0.70*structured_reversal_score + 0.20*high_volume_reversal_score + 0.10*volume_stability_score`
- `structured_reversal_tradeable_score`：`0.65*structured_reversal_score + 0.15*high_volume_reversal_score + 0.10*volume_stability_score + 0.05*gap_risk_control_score + 0.05*low_volatility_score`

本地合并时会和原 `structured_reversal_enhanced_score` 同台比较 RankIC、Top-Bottom、Top超额和5日调仓交易表现。

## 过关规则

策略不得因为候选分数存在而进入压力测试。只有真实 JoinQuant slice 合并复算后满足因子门禁和5日调仓交易门禁，才允许写入压力测试名单。

