# 2026-07-15 中证500低拥挤反转指数增强候选策略

## 策略登记

- 策略名称：中证500低拥挤反转指数增强候选策略 v0
- 策略 ID：`csi500_low_crowding_reversal_index_enhancement_v0`
- 数据优先级：JoinQuant 原生数据优先。
- 当前状态：已登记为策略池草案；等待 JoinQuant Python3 研究环境实跑并回填结果。

## JoinQuant 脚本

- 脚本路径：`outputs/sources/joinquant/scripts/m_quant_csi500_low_crowding_reversal_index_enhancement.py`
- 平台下载接口：`/strategy-api/joinquant-csi500-low-crowding-reversal-index-enhancement.py`

脚本覆盖：

- 中证500历史成分池。
- JoinQuant OHLCV、`valuation.market_cap`、`valuation.turnover_ratio`、指数行情。
- 因子 1/5/10/20 日 RankIC 和 Top20%-Bottom20% 多空收益门禁。
- 组合事件回测 1/5/10/20 日。
- 1/5/10/20 日调仓交易净值，扣成本和滑点；5 日调仓作为准模拟盘主准入周期。
- 高/中/低波动 × 大/中/小市值九宫格分层。

## 初始因子

- `jq_lcr_active_reversal`：主动反转修复，基础权重 0.30。
- `jq_lcr_low_crowding_resilience`：低拥挤韧性，基础权重 0.22。
- `jq_lcr_residual_low_volatility`：残差低波，基础权重 0.18。
- `jq_lcr_volume_stability`：量能稳定，基础权重 0.15。
- `jq_lcr_gap_risk_control`：跳空风险控制，基础权重 0.10。
- `jq_lcr_short_reversal`：短期反转，基础权重 0.05。

## 准模拟盘标签规则

回填结果后，平台按脚本输出的 `strategy_status` 和本地审计共同打标签：

- `waiting_joinquant_retest`：等待 JoinQuant 实测。
- `factor_gate_not_passed`：因子门禁或策略回测未达标。
- `real_strategy_backtested`：已有真实策略回测，但未达准模拟盘标准。
- `paper_trade_candidate`：达到准模拟盘候选标准。

当前准模拟盘候选硬条件：

- 至少 2 个因子通过 20 日主周期门禁。
- 整体 5 日调仓交易净值为正，并已补齐 1/5/10/20 日交易调仓对照。
- 年化收益为正。
- 主动收益为正。
- 主动 Sharpe 达到最低门槛。
- 最大回撤不低于设定地板。
- 完成 9 个波动 × 市值分层。

## 平台接入

- 策略池草案已新增该策略。
- 达标后可进入正式候选/准模拟盘候选列表。
- `/backtest-api/import-results` 已支持展开 JoinQuant 输出包中的 `records`，并保留包级策略信息。
- `factor_backtest` 记录进入实测结果板块；`strategy_backtest`、`strategy_regime_size_backtest`、`strategy_trading_backtest` 进入策略回测板块。
- 导入审计会检查因子周期、事件周期、交易调仓周期是否均覆盖 `1/5/10/20`，并检查 `4 个调仓周期 × 9 个波动/市值交叉层 = 36` 条交易九宫格矩阵。

## 验证

- `python3 -m py_compile outputs/sources/joinquant/scripts/m_quant_csi500_low_crowding_reversal_index_enhancement.py`
- `node --check platform/quant-factor-platform/server.mjs`

## 继续推进记录

- 已安装并验证 bundled Python 的 `jqdatasdk==1.9.8`。
- 策略脚本已支持双环境：JoinQuant 研究环境使用 `jqdata`；本机使用 `jqdatasdk` + `JQ_ACCOUNT/JQ_PASSWORD` 或 `JOINQUANT_ACCOUNT/JOINQUANT_PASSWORD`。
- 新增一键执行器：`outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py`。
- 新增单包导入器：`outputs/sources/joinquant/scripts/import_joinquant_result_package.py`。
- 新增 inbox 批量导入器：`outputs/sources/joinquant/scripts/import_joinquant_inbox.py`。
- 一键执行器已支持自动读取私有 `.env.joinquant`、`.env.joinquant.local`、`.env.local` 和平台私有 env；这些文件已加入 `.gitignore`，只保留 `.env.joinquant.example` 模板。
- 一键执行器会写入状态文件：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_status.json`。
- 已写入私有 `.env.joinquant`，并用本地 jqdatasdk 实测认证路径。
- 本地 SDK 已连到 JoinQuant 并返回“未开通权限”；阻塞原因已归类为 `joinquant_sdk_permission_not_enabled`。
- 已新增 JoinQuant 研究环境专用脚本：`outputs/sources/joinquant/scripts/m_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py`。
- 平台下载接口 `/strategy-api/joinquant-csi500-low-crowding-reversal-index-enhancement.py` 默认返回 notebook 专用脚本。

最新本地执行状态：

```json
{
  "ok": false,
  "blocked_reason": "joinquant_sdk_permission_not_enabled",
  "message": "本地 jqdatasdk 已连通，但账号未开通 SDK 调用权限。",
  "strategy_id": "csi500_low_crowding_reversal_index_enhancement_v0"
}
```

这说明当前策略代码、依赖和导入链路已准备好；本地 SDK 路径受账号权限限制，下一执行路径是 JoinQuant 网页研究环境 notebook 版脚本。

## 2026-07-16 JoinQuant 网页研究环境实跑

- 已用浏览器登录 JoinQuant，并进入用户 Jupyter server：`/user/64140610800/tree`。
- 已将 notebook 专用脚本写入 Jupyter 文件区：`m_quant_csi500_lcr_run.py`。
- 完整 2019-2026 脚本在 1.0G JoinQuant 研究环境中未能产出结果文件，执行期内出现内存/前端状态异常；未导入任何不完整输出。
- 为验证真实 JoinQuant 数据链路，生成快测版 `m_quant_csi500_lcr_fast.py`：
  - `PRICE_START = 2024-01-01`
  - `FACTOR_START = 2025-01-01`
  - `FACTOR_DAY_STEP = 20`
  - 其余因子、事件回测、1/5/10/20 调仓交易净值和九宫格分层逻辑保持不变。
- 快测版已在 JoinQuant 网页研究环境真实执行并下载：`/Users/Admin/Downloads/joinquant_csi500_lcr_fast_result.json`。
- 已导入本地平台并归档：`outputs/sources/joinquant/results/csi500_low_crowding_reversal_index_enhancement_v0_20260716-102139.json`。

快测导入审计：

```json
{
  "row_count": 104,
  "factor_backtest_rows": 24,
  "strategy_rows": 80,
  "trading_rows": 40,
  "overall_trading_rows": 4,
  "factor_horizons": [1, 5, 10, 20],
  "event_horizons": [1, 5, 10, 20],
  "trading_horizons": [1, 5, 10, 20],
  "missing_factor_horizons": [],
  "missing_event_horizons": [],
  "missing_trading_horizons": [],
  "layer_count": 9,
  "trading_layer_matrix_count": 36,
  "expected_trading_layer_matrix_count": 36
}
```

快测结论：

- 样本：18 个测试日期、9000 条因子截面、598 只历史成分覆盖。
- 因子门禁：仅 `jq_lcr_volume_stability` 在 20 日主周期通过快测门禁。
- 策略标签：`real_strategy_backtested` / `已有真实策略回测，未达准模拟盘标准`。
- 5 日调仓：策略收益为正，但基准收益更高，主动收益为负，主动 Sharpe 为负。
- 1/10/20 日调仓主动收益同样为负。
- 因此当前不得进入准模拟盘，只能保留为 JoinQuant 真实快测结果和继续优化候选。

下一步应优先做分段完整版：按年度或半年度在 JoinQuant 跑分片，再用本地导入器合并审计；不要在 1G notebook 环境一次性拉 2018-2026 全量中证500 OHLCV + valuation。
