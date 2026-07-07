# 2026-07-07 Strategy Board Activation

## Scope
- Activated the strategy board as a real strategy workstation.
- Added live strategy signals based on current real factor outputs.
- The strategy board no longer only displays static strategy definitions.

## Real Data Basis
- Source pack: `outputs/merged-batches/yiwan-merged-indicators-20260707-093737-p001-p020.json`
- Rows: 600
- Source date: `2026-07-06 15:00:00`

## Backend
- Added `/strategy-api/live-signals`.
- The endpoint builds strategy signals from:
  - `technical_composite`
  - `trend_alignment`
  - `volume_price_confirmation`
  - `crowding_risk`
  - `volume_price_divergence_risk`
  - `trend_extension_risk`
  - `crowding_alert_count`
  - `factor_label`
  - `factor_reason`

## Activated Strategies
- `核心决策因子策略`
  - Status: computed
  - Role: current main strategy
  - Uses trend quality, volume-price confirmation, and crowding risk to decide entry, observation, risk-watch, or filter.
- `K线辅助确认策略`
  - Status: partial real data
  - Uses current scored single-candle K-line signals only as an auxiliary explanation.
- `资金跟随策略`
  - Status: waiting for source data
  - Requires dark/main/retail capital data.
- `市场情绪仓位策略`
  - Status: waiting for source data
  - Requires market breadth and big-market capital data.

## Strategy Candidate Actions
- `入池候选`
- `低仓观察`
- `暂不入场`
- `中性跟踪`
- `过滤`

## Current Signal Check
- Executable strategies: 1
- Partial strategies: 1
- Blocked strategies: 2
- Entry candidates: 2
- Low-position observation candidates: 9
- Risk rows: 66

## Data Honesty Notes
- No IC, RankIC, win rate, annual return, or backtest result was created.
- Strategy signals are current cross-sectional decision rules only.
- Capital-follow and market-regime strategies remain visible but unavailable until their source data is collected.
