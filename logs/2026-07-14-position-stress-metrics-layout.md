# 2026-07-14 建仓压力测试指标与页面修正

## 本次目标

- 在建仓压力测试结果板块补齐收益回撤比、Calmar 类指标、收益波动比、简化 Sharpe、平均盈利、平均亏损、盈亏比、盈利贡献、亏损贡献、收益集中度、单日最大贡献、单票最大贡献。
- 将压力测试窗口默认扩展到 2026-07-13，并补齐 7 月 13 日真实行情数据。
- 修正建仓压力测试页展示位置和布局，避免指标区被误放到其它视图或出现对齐混乱。

## 数据与结果

- 最新报告：`outputs/position-stress/results/position_stress_latest.json`
- 固化报告：`outputs/position-stress/results/position_stress_20260706_20260713.json`
- 明细 CSV：`outputs/position-stress/data/position_stress_20260706_20260713_daily.csv`
- 覆盖窗口：2026-07-06 至 2026-07-13，共 6 个实际交易日。
- 覆盖股票：50 只，行情行数 300，`missingDates` 为空。
- 当前状态：`ready`，`complete=true`。
- 数据来源：本机 JoinQuant/jqdatasdk 不可用，使用 AkShare 联网真实行情，并在部分股票主接口失败时由东方财富/腾讯真实 K 线补齐；不生成、不补造缺失交易日。

## 新增指标口径

- `returnDrawdownRatio`：总收益 / 最大回撤绝对值。
- `annualizedReturn`：短窗口按实际收益日数年化，仅作压测展示。
- `calmarLike`：年化收益 / 最大回撤绝对值。
- `returnVolatilityRatio`：总收益 / 日收益标准差。
- `simplifiedSharpe`：平均日收益 * sqrt(252) / 日收益标准差。
- `averageWinReturn` / `averageLossReturn`：单票成交样本中盈利/亏损成交的平均收益。
- `profitLossRatio`：平均盈利绝对值 / 平均亏损绝对值。
- `profitContribution` / `lossContribution`：单票权重 * 单票收益后的正负贡献合计。
- `returnConcentration`：正贡献平方和 / 正贡献合计平方，用于观察收益是否过度集中。
- `maxDailyContribution`：样本内最大单日组合收益贡献。
- `maxSingleStockContribution`：样本内最大单票权重收益贡献。

## 当前 latest 指标快照

- 总收益：-1.8174%
- 最大回撤：-4.1665%
- 收益回撤比：-0.4362
- Calmar 类指标：-14.4783
- 收益波动比：-0.7351
- 简化 Sharpe：-2.1563
- 盈亏比：1.2397
- 盈利贡献：7.9960%
- 亏损贡献：-9.6752%
- 收益集中度：0.0786
- 单日最大贡献：4.0637%
- 单票最大贡献：1.0006%

## 页面修正

- 新增建仓压力测试 API 与报告渲染逻辑，页面读取 `position_stress_latest.json` 后渲染 K 线、净值、压力矩阵、建仓选择、成交明细和行情表。
- 将 `组合净值结果` 和新增指标卡明确放入 `position-stress-view`，此前误放到其它视图导致用户在建仓压力测试页看不到。
- 为压测页新增专用布局 class：`position-stress-page`、`position-stress-results-grid`、`position-stress-support-grid`、`position-stress-equity-panel`、`position-stress-data-panel`。
- 调整结果指标卡网格、净值图、成交表、K 线图和压力矩阵高度，降低错位和挤压。
- 默认结束日从 2026-07-10 改为 2026-07-13，手动行情导入示例也同步更新。

## 验证

- `python3 -m py_compile outputs/position-stress/scripts/position_stress_lab.py`
- `node --check platform/quant-factor-platform/assets/app.js`
- `node --check platform/quant-factor-platform/server.mjs`
- 访问本地服务 `http://127.0.0.1:5599/`，确认服务返回 HTML 中 `position-stress-view` 包含 `position-stress-result-summary`、`position-stress-trade-table` 和 `组合净值结果`。
- 访问 `http://127.0.0.1:5599/assets/styles.css`，确认服务返回最新压测页布局样式。

## 边界

- 当前结果是建仓链路短窗口压力测试，不作为长期策略有效性结论。
- JoinQuant 权限/环境仍未配置成功；后续如需要统一数据源，应在 JoinQuant 环境可用后重跑同一脚本。
