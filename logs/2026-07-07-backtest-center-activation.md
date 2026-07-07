# 2026-07-07 Backtest Center Activation

## Scope

- Activated `回测中心` as an independent factor validation workstation.
- Added real-data validation status instead of placeholder backtest output.
- Added JoinQuant export workflow for external factor testing.
- Added result import storage for real JoinQuant outputs.

## Real Data Boundary

- Current factor source: `outputs/research-factor-pipeline/yiwan-research-factor-results.json`
- Current sample: 600 rows
- Current trading dates: 1
- Local validated factor backtest status: blocked by missing future-return labels.

## Backend

- Added `/backtest-api/research-status`.
- Added `/backtest-api/joinquant-factor-export`.
- Added `/backtest-api/joinquant-factor-export.csv`.
- Added `/backtest-api/import-results`.

## Frontend

- `回测中心` now opens its own view.
- The page displays:
  - available sample count
  - exportable factor count
  - local validation blocker status
  - JoinQuant external validation readiness
  - exportable factor table
  - JoinQuant workflow steps
  - imported external results

## Exportable Factors

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

## Data Honesty Notes

- No IC, RankIC, win rate, annual return, or strategy performance was generated.
- The local project now acts as a factor research center and result ledger.
- JoinQuant is the recommended short-term execution environment for historical return matching, trade-calendar handling, suspension handling, and standard factor tests.

## Detail Document

- `docs/joinquant-factor-backtest-plan.md`
