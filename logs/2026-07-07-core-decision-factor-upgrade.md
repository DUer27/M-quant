# 2026-07-07 Core Decision Factor Upgrade

## Scope
- Upgraded the three highest-impact currently computable factors into core decision factors:
  - `trend_alignment`
  - `volume_price_confirmation`
  - `crowding_risk`
- The upgrade uses only the existing 600 real Yiwan indicator rows.
- No IC, RankIC, win rate, annual return, or future-return result was created.

## Real Data Basis
- Source pack: `outputs/merged-batches/yiwan-merged-indicators-20260707-093737-p001-p020.json`
- Rows: 600
- Source date: `2026-07-06 15:00:00`

## Factor Logic Changes

### Trend Quality
- Upgraded from simple MA direction/position into:
  - moving-average direction
  - price standing above key MAs
  - MA stack structure
  - trend maturity
  - trend extension risk
- New explanation fields:
  - `trend_structure_score`
  - `trend_extension_risk`

### Volume-Price Confirmation
- Upgraded from simple volume/trend confirmation into:
  - volume support
  - price-action quality
  - volume-price sync
  - trend background
  - amount and candle-body quality
  - volume-price divergence penalty
  - blowoff-volume penalty
- New explanation fields:
  - `volume_price_quality`
  - `volume_price_divergence_risk`

### Crowding Risk
- Upgraded from simple turnover/volume heat into:
  - transaction crowding
  - price heat
  - candle distribution risk
  - volume-price divergence
  - profit-chip overheat
  - limit-style heat
- New explanation fields:
  - `transaction_crowding_risk`
  - `price_heat_risk`
  - `crowding_alert_count`

## Label Logic
- `强势候选` is now stricter:
  - high composite score
  - low crowding
  - low volume-price divergence
  - low trend extension
  - non-negative K-line score
- Added `风险观察` for rows with high alert count or high volume-price divergence.
- Added `factor_reason` so each row explains key reasons such as trend strength, trend extension, volume-price confirmation, transaction crowding, blowoff risk, and K-line events.

## Current Output Check
- Rows: 600
- Label distribution after upgrade:
  - `强势候选`: 2
  - `观察候选`: 126
  - `风险观察`: 38
  - `中性`: 109
  - `弱势过滤`: 325

## Data Honesty Notes
- These are core decision scores, not verified alpha results.
- They can support screening, ranking, explanation, and risk control.
- They still require multi-day prices and future returns before claiming predictive effectiveness.
