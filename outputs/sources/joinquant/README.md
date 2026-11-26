# JoinQuant 脚本目录

这里保存需要在 JoinQuant Python3 研究环境运行的真实数据脚本。

原则：

- 脚本只调用 JoinQuant 真实接口，例如 `get_price`、`get_fundamentals`、`get_money_flow`。
- 不生成虚构收益、不补造缺失财务/资金/市值字段。
- 运行后复制脚本打印的 JSON，回填到 M-quant 回测中心。
- 未回填结果前，脚本只能证明“可复核”，不能证明“策略有效”。

## 当前关键脚本

- `scripts/run_structured_reversal_pipeline.py`：长江结构化反转因子一键流水线。先拉取 JoinQuant 10m/1m 高频截面，再复算因子活性、分组收益和 Top100/5日调仓交易净值；只有因子和交易门禁都达到准模拟盘候选标准时，才写入策略集和压力测试选择。
- `scripts/m_quant_structured_reversal_factor_jq.py`：长江结构化反转因子截面生成脚本。因子显示名使用中文，括号保留英文列名；参考《高频因子（一）：流动性溢价因子》加入“高频流动性溢价代理因子”，但仍要求真实 JoinQuant 高频数据和回测门禁确认。
- `scripts/analyze_structured_reversal_factor.py`：对结构化反转因子截面复算 RankIC、t 值、Top-Bottom、Top 组超额、十组收益、分年度和波动环境分层。
- `scripts/m_quant_structured_reversal_index_enhancement.py`：结构化反转 Top100 指数增强回测和准模拟盘准入脚本。默认 Top100 等权、5日调仓、Buffer150、前80新进、单边成本0.15%、滑点0.02%、低波动65%仓位。
- `scripts/m_quant_csi500_low_crowding_reversal_index_enhancement.py`：复核“中证500低拥挤反转指数增强候选策略 v0”。输出 1/5/10/20 日因子门禁、策略事件收益、5日调仓交易净值、主动收益、成本滑点，以及高/中/低波动 × 大/中/小市值交叉层。
- `scripts/m_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py`：JoinQuant 研究环境专用版，只依赖 `jqdata`，不包含本地 `jqdatasdk` 认证逻辑。平台下载接口默认发这个版本。
- `scripts/run_csi500_lcr_pipeline.py`：本地 jqdatasdk 一键执行器。认证成功后会运行策略、保存 JoinQuant 原始 JSON、导入平台并生成 Markdown 实跑报告。
- `scripts/merge_csi500_lcr_slices.py`：把多个 JoinQuant notebook 分片输出的 `factor_rows` 合并成本地完整 package，并统一复算门禁、事件收益、1/5/10/20 日调仓净值和九宫格审计。
- `scripts/import_joinquant_result_package.py`：导入 JoinQuant 打印的 JSON 包。支持从 notebook 控制台复制文本中抽取 JSON、展开 `records`、检查 1/5/10/20 和九宫格完整性，并写入平台实测结果。
- `scripts/m_quant_akshare_ohlcv_candidate_review.py`：复核 AkShare 本地 6 条强分层候选。输出 5/10/20 日事件收益、5日调仓交易净值、目标路线、市值层和高/中/低波动 × 大/中/小市值交叉层。
- `scripts/m_quant_jq_quality_profit_liquidity_strategy_backtest.py`：复核 JQ质量利润流动性策略。
- `scripts/m_quant_emotion_weighted_kline_strategy_backtest.py`：复核情绪系数加权 K 线策略。
- `scripts/m_quant_capital_follow_strategy_backtest.py`：复核资金跟随策略。

## 中证500低拥挤反转指数增强口径

策略 ID：`csi500_low_crowding_reversal_index_enhancement_v0`。

核心流程：

- 先用 JoinQuant 历史中证500成分、OHLCV、`valuation.market_cap`、`valuation.turnover_ratio` 和指数行情挖掘因子。
- 因子必须覆盖 `1/5/10/20` 日 RankIC 与 Top20%-Bottom20% 多空收益。
- 20日主周期通过门禁的因子优先进入组合；不足 2 个通过时只能作为诊断候选。
- 策略组合默认在中证500成分内取评分 Top100，5日调仓，扣成本和滑点。
- 结果必须包含高/中/低波动 × 大/中/小市值 9 个交叉层。

导入示例：

本地已配置 jqdatasdk 账号时，一键运行、导入并出报告：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py
```

如果本地 SDK 返回“未开通权限”，使用 JoinQuant 网页研究环境运行 notebook 版脚本：

```text
outputs/sources/joinquant/scripts/m_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py
```

只运行并保存 JSON，不导入平台：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py --no-import
```

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py /path/to/joinquant-output.json
```

先审计不落库：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py /path/to/joinquant-output.json --dry-run
```

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

## 长江结构化反转因子口径

策略 ID：`structured_reversal_csi500_v1`。

核心流程：

- 使用真实 JoinQuant 10分钟 K 线；若 10m 权限不稳定，可使用 1m 后按上午/下午分别聚合到 10m，不能跨午休。
- 每个调仓日取过去21个交易日高频 bar，按成交量最低10%划为动量段，其余90%划为反转段。
- 裸因子：`Rev_struct = Rev_rev - Rev_mom`，方向为越低越好；横截面得分为 `1 - rank_pct(Rev_struct)`。
- 增强总分中文显示为“结构化反转增强总分（structured_reversal_enhanced_score）”：结构化反转55%、低波动15%、流动性质量10%、高频流动性溢价代理5%、量能稳定10%、跳空风险控制5%。
- 高频流动性溢价代理参考长江证券《高频因子（一）：流动性溢价因子》21日、10分钟高频流动性思路；由于普通 `get_price` 不含五档盘口，当前只使用10m成交冲击代理，不把盘口原文业绩作为本策略业绩。
- 准模拟盘准入必须同时通过因子活性和 5日调仓交易门禁；未通过时不会写入策略集和压力测试选择。

本地已配置 jqdatasdk 账号时，一键实跑、回测、达标后写入策略集：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_structured_reversal_pipeline.py --update-strategy-set
```

如果先在 JoinQuant 网页研究环境导出因子截面，再本地复算回测和准入：

```bash
python3 outputs/sources/joinquant/scripts/run_structured_reversal_pipeline.py --factor-input outputs/sources/joinquant/results/structured_reversal_csi500_v1_factor_panel_<stamp>.json --update-strategy-set
```

如果按旧项目同款走网页研究环境分片，把每个 slice 的 JSON 放入：

```text
outputs/sources/joinquant/inbox/structured_reversal_slices/
```

然后本地统一合并、复算和准入：

```bash
python3 outputs/sources/joinquant/scripts/run_structured_reversal_pipeline.py --merge-existing-slices --update-strategy-set
```

门禁未达标或缺少真实高频数据时，脚本只输出阻断状态，不生成虚构 IC、收益、准模拟盘状态或压力测试名单。

## 分片复测工作流

多年全量中证500 OHLCV + valuation 在 JoinQuant notebook 里容易因为内存或会话中断失败。优先使用半年或年度分片，最后本地合并审计。

### JoinQuant 网页研究环境

复制 `scripts/m_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py` 到 notebook 后，每次只改顶部常量：

```python
RUN_MODE = "slice"
SLICE_START = "2019-01-01"
SLICE_END = "2019-06-30"
```

建议半年窗口：

```text
2019-01-01 至 2019-06-30
2019-07-01 至 2019-12-31
2020-01-01 至 2020-06-30
2020-07-01 至 2020-12-31
...
2026-01-01 至 2026-07-15
```

每次运行后，把打印出来的完整 JSON 保存到：

```text
outputs/sources/joinquant/inbox/csi500_lcr_slices/
```

文件名建议包含窗口，例如 `csi500_lcr_slice_2019H1.json`。

本地合并并生成完整可导入 package：

```bash
python3 outputs/sources/joinquant/scripts/merge_csi500_lcr_slices.py 'outputs/sources/joinquant/inbox/csi500_lcr_slices/*.json'
```

导入平台前先审计：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py outputs/sources/joinquant/results/<merged-package>.json --dry-run
```

审计通过后导入：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py outputs/sources/joinquant/results/<merged-package>.json
```

### 本地 jqdatasdk 可用时

半年分片一键跑、合并、导入：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py --sliced --slice-months 6
```

年度分片：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py --sliced --slice-months 12
```

只生成合并 package，不导入平台：

```bash
JQ_ACCOUNT=你的账号 JQ_PASSWORD=你的密码 python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py --sliced --slice-months 6 --no-import
```

### 合并口径

- slice 文件只保存真实 JoinQuant 截面证据，不直接进入平台结果。
- 本地合并按 `date + code` 去重后统一复算，不把半年收益、IC 或 Sharpe 做简单加总。
- 最终 package 仍走 `import_joinquant_result_package.py` 的 1/5/10/20 周期和九宫格完整性审计。
