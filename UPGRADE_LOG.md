# M-quant Upgrade Log

> This file is the human-readable upgrade ledger. Every meaningful platform, data, factor, or strategy change should be recorded here with the matching local git commit.

## 2026-07-07

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
