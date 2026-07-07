# 2026-07-07 Single Factor Export

## Scope

- Refined the JoinQuant export workflow from bulk-only export to one-factor-at-a-time export.
- Kept the full export as a backup option, but made single-factor export the primary workflow.

## Why

The user needs to test factors individually in JoinQuant. A combined long-table export is useful for batch research, but it is not ergonomic for manual factor-by-factor validation.

## Backend

- `/backtest-api/joinquant-factor-export.csv?factor=<factor_id>` now exports only one selected factor.
- `/backtest-api/joinquant-factor-export?factor=<factor_id>` returns JSON rows for one selected factor.
- Invalid factor IDs now return an explicit error.
- Single-factor CSV filenames use the factor ID, for example:
  - `m-quant-joinquant-volume_price_confirmation.csv`
  - `m-quant-joinquant-crowding_risk.csv`

## Frontend

- The backtest center factor table now includes a `下载该因子` action per factor.
- Each factor row shows its exportable row count.
- The bulk export button remains as `下载全部因子CSV`.

## Verification

- `node --check server.mjs`
- `node --check assets/app.js`
- Verified `volume_price_confirmation` export returns one header row plus 600 real rows.

## Data Honesty Notes

- The export still contains factor values only.
- No IC, RankIC, win rate, annual return, future return, or backtest performance was generated.
