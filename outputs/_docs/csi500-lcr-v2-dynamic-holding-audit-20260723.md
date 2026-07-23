# 中证500低拥挤反转指数增强候选策略 v2 动态持仓审计

生成时间：2026-07-23

## 一、问题定位

原压测成交明细把 `建仓日` 到 `退出日` 写死为下一交易日，实际由 `outputs/position-stress/scripts/position_stress_lab.py` 中的 `exit_index = entry_index + 1` 触发。这会把 v1 的上涨趋势过早卖出，得到的是隔夜执行链路压力测试，不是策略本身应该使用的动态持仓账本。

## 二、v2 改动目标

v2 不改 v1 因子门禁和候选名单，专门优化执行层：买入卖出不再卡死一天，由每日信号、趋势延续、止盈止损和持仓上限共同决定。

核心参数：

- `holdingPolicy`: `dynamic_signal`
- `minHoldingDays`: 1
- `baseHoldingDays`: 5
- `maxHoldingDays`: 20，用作趋势健康复核点，不再是机械卖出日
- `hardMaxHoldingDays`: 60
- `signalBufferN`: 80
- `trendExtendBufferN`: 40
- `trendExtendMinReturn`: 3%
- `stopLossPct`: 8%
- `takeProfitPct`: 12%
- `trailingStopPct`: 6%
- `scoreDropPct`: 30%

## 三、股票池口径

原压测默认股票池是 `position_stress_core_3000.csv`，因此报告显示 3000 只。这只是早期为了压测速度使用的核心池，不适合作为 v2 的完整候选验证。

v2 已改为 `auto_cache_all`：从 `outputs/sources/akshare/raw/a_share_daily` 读取全部本地真实日线缓存。全窗口最终报告覆盖 5578 只股票，数据行数 2,010,890。由于全 A 存在新股、停牌、退市和缓存缺行，完整性检查改为宽松覆盖：每日可交易样本和目标候选名单覆盖足够即可运行，个股缺行保留在 `missingCoverage` 明细中，不再把正常全 A 缺行误判成整日缺失。

## 四、持仓状态机

每日流程：

1. 先检查已有持仓是否触发退出。
2. 触发退出后释放现金和持仓槽位。
3. 空仓槽位按当天信号排名补入。
4. 持仓逐日按真实收盘价计价，组合净值保留现金和市值。

退出优先级：

1. 样本结束强制平仓。
2. 60 个交易日硬上限退出。
3. 单票亏损达到 8% 止损。
4. 浮盈达到 12% 后，从峰值回撤 6% 止盈。
5. 持满 5 日后跌出 Buffer80 退出。
6. 分数衰减 30% 且没有趋势延续保护时退出。
7. 20 日后若不满足趋势健康条件，趋势健康超时退出。

趋势延续保护：若 20 日后仍在前 40、持仓收益大于 3%、且没有触发峰值回撤，则不因到期机械卖出。

## 五、全窗口审计结果

报告文件：`outputs/position-stress/results/position_stress_20250101_20260715.json`

导出成交明细：`outputs/position-stress/exports/position_stress_trades_csi500_low_crowding_reversal_index_enhancement_v2_20260723_102510.xlsx`

全窗口：2025-01-01 至 2026-07-15

- 状态：ready
- 股票数：5578
- 行情行数：2,010,890
- 弱覆盖日期：0
- 总收益：113.6124%
- 最大回撤：-18.4857%
- 年化收益：67.6881%
- 成交笔数：207
- 平均持仓：17.83 个交易日
- 持仓中位数：18 个交易日
- 交易胜率：56.04%
- 平均单笔收益：4.3884%

退出原因分布：

- `take_profit_trailing`: 86
- `stop_loss`: 62
- `trend_health_timeout`: 47
- `sample_end`: 10
- `hard_max_holding_days`: 2

## 六、多轮审计结论

覆盖审计：通过。v2 使用全缓存池，`stockCount=5578`，`missingDates=[]`，`weakCoverageDates=[]`。

持仓审计：通过。v2 不再是一日卖出，平均持仓 17.83 个交易日，成交笔数从原隔夜账本的 3690 笔降为 207 笔。

退出审计：通过。导出 Excel 中存在 `持仓交易日`、`退出原因`、`退出分`、`建仓排名`、`退出排名`、`持仓最高收益` 和 `分数衰减` 字段。

趋势保护审计：通过。全窗口中有 59 笔持仓超过 20 个交易日，其中 58 笔盈利，说明上涨趋势没有再被 20 日复核点机械卖出。

回归审计：通过。v2 作为新增策略保存，不覆盖 v1；v1 的 `next_day`/旧压测口径仍可作为对照运行。

## 七、策略池保存

v2 已保存到：

- `platform/quant-factor-platform/data/strategy-definitions.json`
- `platform/quant-factor-platform/data/position-stress-selection.json`

平台服务端也已登记 v2：选择 `csi500_low_crowding_reversal_index_enhancement_v2` 时，会自动传入动态持仓参数和 `auto_cache_all` 股票池。

## 八、后续必要复核

当前 v2 收益来自本地 AkShare OHLCV 代理压测，不能直接等同于 JoinQuant 原生策略收益。下一步应把同一套动态持仓状态机迁移到 JoinQuant 原生账本，复核指数成分、停复牌、涨跌停、行业/指数权重和真实成交约束。
