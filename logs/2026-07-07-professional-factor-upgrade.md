# 2026-07-07 Professional Factor Upgrade

## Scope
- Upgraded the currently computable Yiwan indicator factors into a more professional cross-sectional scoring model.
- The upgrade uses only the existing 600 real Yiwan indicator rows from the merged batch.
- No IC, RankIC, win rate, annual return, or future-return result was created.

## Real Data Source
- Source pack: `outputs/merged-batches/yiwan-merged-indicators-20260707-093737-p001-p020.json`
- Rows: 600
- Source date: `2026-07-06 15:00:00`

## Upgraded Computed Factors
- `trend_alignment`
  - From simple moving-average direction score to direction + price-above-MA + MA-stack score.
- `volume_price_confirmation`
  - Adds warm-volume quality and subtracts blowoff risk from high volume ratio, high turnover, long upper shadow, and high amplitude.
- `kdj_momentum`
  - Adds K-D strength and J-value comfort zone, with explicit overheat penalty.
- `macd_acceleration`
  - Adds zero-axis state, DIFF-DEA expansion, and MACD histogram ranking.
- `chip_health`
  - Adds profit-comfort, low trapped-chip pressure, chip-concentration penalty, and price-to-average-cost comfort.
- `intraday_strength`
  - Adds OHLC-based close position, candle body quality, lower-shadow support, and upper-shadow pressure.
- `crowding_risk`
  - Expanded into an explicit risk factor using turnover, volume ratio, amplitude, change percentage, profit chips, upper shadow, and limit-style heat.
- `technical_composite`
  - Now subtracts `crowding_risk` rather than treating all strong price action as positive.

## Added Explanation Sub-Factors
- `close_position_strength`
- `candle_body_quality`
- `upper_shadow_pressure`
- `volume_blowoff_risk`
- `chip_concentration_risk`

## Validation
- Python compile passed.
- Frontend `assets/app.js` syntax check passed.
- Server `server.mjs` syntax check passed.
- Generated outputs:
  - `outputs/research-factor-pipeline/yiwan-research-factor-results.json`
  - `outputs/research-factor-pipeline/yiwan-research-factor-results.csv`
  - `outputs/research-factor-pipeline/yiwan-research-factor-summary.json`

## Data Honesty Notes
- These factors are professionalized cross-sectional scores, not verified alpha results.
- They can rank and explain current candidates.
- They still require multi-day data and future returns before claiming effectiveness.
