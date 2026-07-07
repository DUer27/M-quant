# M-quant Upgrade Log

> This file is the human-readable upgrade ledger. Every meaningful platform, data, factor, or strategy change should be recorded here with the matching local git commit.

## 2026-07-07

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
