# M-quant Upgrade Log

> This file is the human-readable upgrade ledger. Every meaningful platform, data, factor, or strategy change should be recorded here with the matching local git commit.

## 2026-07-10

### Add conditional operations-pack promotion gate
- 模拟观察运行包接入 `核心量价趋势策略 v1 / 中波动/小市值` 条件晋级逻辑。
- 只有导入真实 JoinQuant 最新信号复核，且满足以下门槛时，才会写入 `jq_medium_vol_small_cap_core` 资金袖并计入 `2/2`：
  - `decision=promotion_signal_ready`
  - `market_regime=medium_volatility`
  - `target_market_regime=medium_volatility`
  - `target_market_cap_bucket=small_cap`
  - `selected_count>=10`
- 独立资金袖审计和成熟策略矩阵已识别核心信号复核导入数量，避免把候选路线提前包装成成熟策略。
- 当前真实状态仍为 `1 / 2`：尚未导入核心量价中波动/小市值最新信号复核 JSON。
- Data honesty note: 本次只增加晋级门禁和派生包联动；没有导入假数据，没有生成收益、净值、成交、持仓或晋级结论。
- Detail log: `logs/2026-07-10-conditional-operations-promotion-gate.md`

### Add core medium-small signal review import gate
- 新增核心量价中波动/小市值最新信号复核导入库：
  - `platform/quant-factor-platform/data/imported-core-medium-small-signal-reviews.json`
- 新增校验接口：
  - `/backtest-api/validate-core-medium-small-signal-review`
- 新增查询接口：
  - `/strategy-api/core-medium-small-signal-reviews`
- `/backtest-api/import-results` 已支持导入 `source=joinquant_core_medium_small_latest_signal_review` 的真实 JoinQuant 输出。
- 严格校验：
  - `strategy_id=core_volume_price_trend_v1`
  - `sleeve_id=jq_medium_vol_small_cap_core`
  - `selected_count` 必须等于 records 数量
  - ready 结论必须满足 `market_regime=medium_volatility`
  - ready 结论必须满足 `selected_count>=10`
  - records 中候选必须全部为 `market_cap_bucket=small_cap`
- 导入后只更新任务包状态，不自动写入运行包，不自动计入 `2/2`。
- Data honesty note: validate 测试只校验不写入；没有导入任何假复核记录，没有生成收益、净值、成交、持仓或晋级结论。
- Detail log: `logs/2026-07-10-core-medium-small-signal-import-gate.md`

### Add core medium-small latest signal task pack
- 新增核心量价中波动/小市值最新信号复核脚本：
  - `outputs/sources/joinquant/scripts/m_quant_core_medium_small_latest_signal_review_20260710.py`
  - 下载端点：`/strategy-api/joinquant-core-medium-small-latest-signal-review.py`
- 新增晋级任务包：
  - `outputs/paper-watch/results/core_medium_small_promotion_task_pack_20260710.json`
  - `outputs/_docs/core-medium-small-promotion-task-pack-20260710.md`
- 模拟观察清单新增“核心量价中波动小市值晋级复核”卡片，展示历史证据、通过门槛和下载入口。
- 通过门槛要求：`source=joinquant_core_medium_small_latest_signal_review`、`decision=promotion_signal_ready`、市场状态为 `medium_volatility`、小市值入选不少于 10 只。
- 成熟策略目标仍保持 `1 / 2`，该任务包只用于补最新真实信号，不生成回测或模拟盘结果。
- Data honesty note: 本次只生成 JoinQuant 真实数据复核脚本和任务包；没有生成收益、净值、成交、持仓、交易可行性或成熟策略晋级结论。
- Detail log: `logs/2026-07-10-core-medium-small-latest-signal-task.md`

### Identify mutually exclusive second-sleeve candidate
- 在独立资金袖候选审计中细分 `核心量价趋势策略 v1 / 中波动/小市值`：
  - 真实 JoinQuant 分层交易回测：样本 45、收益 43.30%、最大回撤 -9.34%、Sharpe 1.39、胜率 55.56%。
  - 与主控制器具备互斥基础：`市场状态切换策略 v1` 在中波动环境为 `cash_watch`，该候选只允许 `medium_volatility/small_cap`。
  - 当前结论为 `互斥候选，待晋级确认`，不计入两条成熟策略目标。
- 成熟策略推进矩阵的第一优先级调整为：确认是否将该路线晋级为第二模拟观察资金袖，并补最新信号和执行配置。
- Data honesty note: 本次只改变候选分类和下一步优先级；没有把该路线写入运行包，没有生成收益、净值、成交、持仓或交易可行性结论。
- Detail log: `logs/2026-07-10-mutually-exclusive-sleeve-candidate.md`

### Add independent sleeve candidate audit
- 新增 `独立资金袖候选审计`，专门判断哪些策略/路线能计入“两条成熟可模拟策略”目标。
- 当前真实结论保持严格：
  - 准入独立资金袖：1 个，`市场状态切换策略 v1`。
  - 阻塞候选：13 个。
  - `JQ质量利润流动性策略 v1` 与切换控制器共享高波动组件，只做组件监控，不计入第二资金袖。
  - `AkShare本地高低波动切换策略 v1` 需要导入 JoinQuant 最新信号交易可行性复核 JSON 后，才可能升级为第二资金袖。
- 成熟策略推进矩阵接入候选审计，页面新增折叠明细。
- `刷新派生包` 会同步重建运行包、独立候选审计、成熟矩阵和交易复核任务包。
- Data honesty note: 本次只汇总已审计 JoinQuant/AkShare/导入复核证据，不生成收益、净值、成交、持仓或交易可行性结论。
- Detail log: `logs/2026-07-10-independent-sleeve-candidate-audit.md`

## 2026-07-08

### Add real JoinQuant volatility x market-cap strategy results
- 新增策略交叉分层脚本导出：
  - `/strategy-api/joinquant-volatility-size-script.py?strategy=core_volume_price_trend_v1`
- 交叉口径：
  - 市场波动率：沪深300 20日滚动年化波动率。
  - 高波动：滚动约1年 70% 分位以上。
  - 低波动：滚动约1年 30% 分位以下。
  - 中波动：两者之间。
  - 市值层：JoinQuant `valuation.market_cap` 当日沪深300截面分位。
  - 大市值：市值分位 >= 0.67。
  - 小市值：市值分位 <= 0.33。
  - 中市值：两者之间。
- 在 JoinQuant 研究环境实跑并导入真实结果：
  - `result_type`: `strategy_regime_size_backtest`
  - `source`: `joinquant_volatility_market_cap_cross_rebuild`
  - 9 个组合：高/中/低波动 × 大/中/小市值。
  - 27 条周期结果：每个组合覆盖 5日、10日、20日。
  - 样本：35400 因子行、3237 条策略候选、118 个测试日。
- `策略实测` 页面已支持同时按市场波动率和市值层筛选。
- 策略池新增 `交叉脚本` 按钮，方便后续重新导出 JoinQuant 脚本。
- 已验证页面筛选：`高波动 + 大市值` 可显示 5/10/20 日三条真实结果。
- Data honesty note: these strategy results came from JoinQuant real OHLCV, CSI300 index data, and `valuation.market_cap`; no estimated or fabricated performance result was written.
- Detail log: `logs/2026-07-08-strategy-volatility-size-cross.md`

## 2026-07-07

### Add Yiwan capital-flow factor pack
- 使用用户提供的 `2026-07-01`、`2026-07-02`、`2026-07-03` 日期包构建真实资金流因子。
- 新增资金因子：
  - `capital_follow_signal`
  - `active_ap_accumulation`
  - `main_force_alignment`
  - `institutional_contra_divergence`
  - `capital_overheat_risk`
  - `capital_persistence_2d`
  - `market_capital_regime`
- 生成 1239 行个股资金因子，覆盖 1040 只股票。
- 个股资金因子覆盖 `2026-07-01`、`2026-07-02`；`2026-07-03` 仅用于市场资金状态。
- 接入因子库、研究流水线和回测中心单因子导出。
- Data honesty note: these are real factor values from user-provided Yiwan date batches, not validated performance metrics; no IC, RankIC, win rate, annual return, or future return was created.
- Detail log: `logs/2026-07-07-capital-flow-factor-pack.md`

### Add research pipeline and refine validated-result navigation
- 新增独立 `研究流水线` 大板块，用于管理因子假设、真实状态、实测证据、数据缺口和下一步动作。
- 新增本地约束研究助手：
  - `/research-api/pipeline`
  - `/research-api/assistant`
- 助手当前不调用外部 LLM，不上传数据，只基于项目内真实数据和真实回填结果做解释。
- `实测结果` 增加因子目录筛选，并改为向下展开式，方便按真实测试结果中的因子快速查看。
- `回测中心` 的 `结果回填` JSON 输入框继续保留，用于粘贴 JoinQuant 实跑结果。
- Data honesty note: no IC, RankIC, RankIC t, win rate, annual return, or backtest result was created or altered.
- Detail log: `logs/2026-07-07-research-pipeline-and-results-ux.md`

### Collapse backtest result import panel
- 将 `回测中心` 的 `结果回填` 改为默认折叠，避免 JSON 输入框和结果列表把页面撑得过长。
- 默认显示 `点击展开`，展开后切换为 `收起`。
- 结果 JSON 输入框从 10 行压缩为 8 行。
- 已导入结果列表改为独立滚动区域，长列表不会继续拉长页面。
- Data honesty note: only layout and interaction were changed; no factor value, IC, RankIC, win rate, annual return, or backtest result was created or modified.
- Detail log: `logs/2026-07-07-backtest-import-disclosure.md`

### `5cc5d01` Add single-factor JoinQuant exports
- Refined the JoinQuant export workflow from bulk-only export to one-factor-at-a-time export.
- Kept the full export as a backup option, but made single-factor export the primary workflow.
- Added per-factor CSV endpoints:
  - `/backtest-api/joinquant-factor-export.csv?factor=volume_price_confirmation`
  - `/backtest-api/joinquant-factor-export.csv?factor=trend_alignment`
  - `/backtest-api/joinquant-factor-export.csv?factor=crowding_risk`
- The backtest center factor table now includes `下载该因子` for each exportable factor.
- Verified `volume_price_confirmation` returns one header row plus 600 real rows, with no mixed factor rows.
- Data honesty note: exports still contain factor values only; no IC, RankIC, win rate, annual return, or future-return result was created.
- Detail log: `logs/2026-07-07-single-factor-export.md`

### `1fe9825` Activate backtest center for JoinQuant validation
- Activated `回测中心` as an independent factor validation workstation.
- Added real validation status instead of placeholder performance output.
- Added JoinQuant export endpoints:
  - `/backtest-api/research-status`
  - `/backtest-api/joinquant-factor-export`
  - `/backtest-api/joinquant-factor-export.csv`
  - `/backtest-api/import-results`
- Current data basis: 600 Yiwan indicator factor rows from one trading date.
- Current local validation status: blocked because future returns and multi-day history are not available locally.
- Exportable factors include:
  - `technical_composite`
  - `trend_alignment`
  - `volume_price_confirmation`
  - `crowding_risk`
  - `volume_price_divergence_risk`
  - `trend_extension_risk`
  - `kline_event_score`
  - `chip_health`
  - `macd_acceleration`
  - `kdj_momentum`
- Added JoinQuant workflow document: `docs/joinquant-factor-backtest-plan.md`.
- Data honesty note: no IC, RankIC, win rate, annual return, or future-return backtest result was created.
- Detail log: `logs/2026-07-07-backtest-center-activation.md`

### `2af21b2` Activate strategy board with live signals
- Activated the strategy board as a real strategy workstation instead of a static placeholder.
- Added `/strategy-api/live-signals`, built only from current real factor outputs.
- Real data basis: 600 Yiwan indicator rows from `2026-07-06 15:00:00`.
- Current strategy board shows:
  - 1 executable strategy: `核心决策因子策略`
  - 1 partially available strategy: `K线辅助确认策略`
  - 2 waiting-for-data strategies: `资金跟随策略`, `市场情绪仓位策略`
  - 2 `入池候选`
  - 9 `低仓观察`
  - 66 risk rows
- Candidate actions now include:
  - `入池候选`
  - `低仓观察`
  - `暂不入场`
  - `中性跟踪`
  - `过滤`
- Data honesty note: no IC, RankIC, win rate, annual return, or future-return backtest result was created.
- Detail log: `logs/2026-07-07-strategy-board-activation.md`

### `0a30b57` Refine core decision factors
- Refined the three highest-impact currently computable factors into stricter core decision factors:
  - `trend_alignment`
  - `volume_price_confirmation`
  - `crowding_risk`
- Real data basis: 600 Yiwan indicator rows from `2026-07-06 15:00:00`.
- Trend quality now evaluates:
  - moving-average direction
  - price standing above key moving averages
  - moving-average stack structure
  - trend maturity
  - trend extension risk
- Volume-price confirmation now evaluates:
  - volume support
  - price-action quality
  - volume-price sync
  - trend background
  - amount and candle-body quality
  - volume-price divergence penalty
  - blowoff-volume penalty
- Crowding risk now evaluates:
  - transaction crowding
  - price heat
  - candle distribution risk
  - volume-price divergence
  - profit-chip overheat
  - limit-style heat
- Added explanation fields:
  - `trend_structure_score`
  - `trend_extension_risk`
  - `volume_price_quality`
  - `volume_price_divergence_risk`
  - `transaction_crowding_risk`
  - `price_heat_risk`
  - `crowding_alert_count`
  - `factor_reason`
- Added stricter labels:
  - `强势候选`
  - `观察候选`
  - `风险观察`
  - `中性`
  - `弱势过滤`
- Data honesty note: this is still a real-data cross-sectional decision score, not a verified alpha or backtest result.
- Detail log: `logs/2026-07-07-core-decision-factor-upgrade.md`

### `1b763c3` Upgrade computed Yiwan factors to professional scores
- Upgraded the currently computable Yiwan factors into professional cross-sectional scores.
- Real data basis: 600 Yiwan indicator rows from `2026-07-06 15:00:00`.
- Upgraded factors:
  - `trend_alignment`
  - `volume_price_confirmation`
  - `kdj_momentum`
  - `macd_acceleration`
  - `chip_health`
  - `intraday_strength`
  - `crowding_risk`
  - `technical_composite`
- Added explanation sub-factors:
  - `close_position_strength`
  - `candle_body_quality`
  - `upper_shadow_pressure`
  - `volume_blowoff_risk`
  - `chip_concentration_risk`
- Platform display now shows more ranking explanation columns: intraday, close position, upper-shadow pressure, and blowoff risk.
- Data honesty note: no IC, RankIC, win rate, annual return, or future-return result was created.
- Detail log: `logs/2026-07-07-professional-factor-upgrade.md`

### `0d7fa79` Activate full factor library display
- Activated the factor library as a real feature rather than a placeholder.
- The frontend now merges:
  - real computed factor availability
  - registered research factor definitions
  - unavailable/history-insufficient factor states
- Factor library verified with:
  - 18 factor rows
  - 9 currently computed factors
  - 9 unavailable or waiting-for-data factors
  - 13 K-line rule rows
- Added visible entries for capital-follow, panic-reversal, sentiment-overheat, sector-resonance, and event-confirmation logic, while marking them as waiting for source data.
- Detail log: `logs/2026-07-07-factor-library-activation.md`

### `b68c03f` Activate real factor library view
- Connected the platform factor library view to real local factor summary data.
- Added real factor summary endpoint usage in the frontend.
- Displayed computed factor counts, unavailable factor counts, source file, and K-line rule status.

### `44bdc51` Complete scored single-candle K-line factors
- Completed the single-candle K-line scoring model based on the Huafu PDF rules with explicit Kelly scores.
- Scored rules included:
  - bullish marubozu
  - bearish marubozu
  - big bullish candle
  - big bearish candle
  - hammer
  - high-volume spinning top
  - hanging man
  - shooting star
  - doji
  - dragonfly doji
  - gravestone doji
- Recognized but did not score rules without explicit PDF page-17 Kelly scores:
  - inverted hammer
  - low-volume spinning top
- Detail log: `logs/2026-07-07-single-kline-completion.md`

### `c615adf` Ingest real Yiwan batches and register Huafu strategy
- Ingested user-provided Yiwan batch files covering indicator pages 1-20.
- Validated:
  - 10 batch files
  - 600 real rows
  - 0 duplicate rows
  - source date `2026-07-06 15:00:00`
- Registered the Huafu emotion-weighted K-line strategy as partially available.
- Marked 240-day volume/price resonance factors as unavailable until enough history exists.
- Detail log: `logs/2026-07-07-ingest-p001-p020.md`

### `67c5463` Backup quant factor platform and collection workflow
- Backed up the initial quant factor platform scaffold.
- Added safe Yiwan collection workflow files.
- Added initial data-honesty documentation.

### `ba298d2` Initial commit
- Created the initial M-quant repository baseline.

## Standing Rules

- Do not invent performance metrics.
- Do not write IC, RankIC, win rate, annual return, or backtest results without future-return data.
- Summary JSON files can describe structure, but factor computation must use real detailed rows.
- Any unavailable factor should stay visible but marked as unavailable, insufficient history, or waiting for source fields.
- Strategy backtests must include unlayered results, large/mid/small market-cap layers, high/mid/low volatility layers, and volatility x market-cap cross layers before they are treated as complete.

# 2026-07-08 等待数据策略实测补齐

- 补齐并导入 `资金跟随策略 v0` JoinQuant 真实整体事件回测。
- 补齐并导入 `K线辅助确认策略` JoinQuant 真实整体事件回测。
- 补齐并导入 `市场资金状态仓位模块` 沪深300指数仓位开关回测。
- 按新默认规则补跑资金跟随、K线辅助的高/中/低波动 × 大/中/小市值交叉分层。
- 平台策略集读取真实导入结果，不再把已实测策略显示为“等待数据/尚未实测”。
- 记录边界：资金跟随未复刻 Yiwan 暗盘字段；K线辅助未复制研报收益；市场仓位模块不是个股选股 alpha。
- Detail log: `logs/2026-07-08-waiting-strategy-real-backtests.md`
# 2026-07-07 JoinQuant 因子实测

- 在 JoinQuant 研究环境实跑 M-quant 因子测试。
- 导入 29 条真实测试摘要到平台 `imported-backtest-results.json`。
- 历史重建覆盖 7 个因子：量价确认、趋势质量、拥挤风险、量价背离风险、趋势过伸风险、单根K线评分、技术综合强度。
- 单日 Yiwan CSV 覆盖 `volume_price_confirmation`，仅验证 2026-07-06 到 2026-07-07 的 1 日收益。
- 记录边界：历史重建版基于 JoinQuant OHLCV，并非 Yiwan 全字段复刻；未取得的 `ic_mean` 保持 `null`，不补假数据。

# 2026-07-07 复测结果呈现升级

- 在回测中心新增 `JoinQuant 实测结果` 独立板块。
- 展示结果数量、历史样本结果数量、最佳 RankIC、最佳多空收益。
- 新增明细表展示周期、方向、样本、RankIC、RankIC t、多空收益、正向占比和来源。
- 单日截面自动标记为跟踪中，避免误判为正式长期结论。

# 2026-07-07 实测结果独立板块

- 左侧导航新增 `实测结果`。
- 将 `JoinQuant 实测结果` 从 `回测中心` 中拆出，形成独立页面。
- `回测中心` 聚焦导出、导入和复测流程，避免页面过长。
- `实测结果` 页面展示结果记录数、覆盖因子数、历史样本结果数、最佳周期和明细表。
- 明细表加入固定高度滚动容器，避免 29 条结果撑长页面。
