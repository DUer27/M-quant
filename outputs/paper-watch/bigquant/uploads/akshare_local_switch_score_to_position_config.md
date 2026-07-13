# BigQuant Visual Upload: akshare_local_switch

Use this for the BigQuant visual workflow that failed at `score_to_position.v5`.

## Upload File

Upload this file as the score input table:

- `outputs/paper-watch/bigquant/uploads/akshare_local_switch_score_input_20260709.csv`

The table already has one row per stock and uses these columns:

- `date`
- `instrument`
- `score`
- `target_weight`

## Node Settings

For `score_to_position.v5`, do not paste a comma-separated stock list into any score field.

Set the node fields as follows:

```text
score column: score
instrument column: instrument
date column: date
top n: 15
weight method: equal weight
position weight column: target_weight
```

If the node only accepts one score expression, use exactly:

```text
score
```

Do not use values like this in `score_to_position.v5`:

```text
002001.SZ,000568.SZ,000858.SZ
score desc, instrument
```

Those comma-separated values are what trigger the BigQuant parser error:

```text
Parser Error: syntax error at or near ","
```

## Optional SQL Filter

If BigQuant asks for an upstream filter condition, use this in the selector/filter node, not in `score_to_position.v5`:

```sql
instrument IN (
  '002001.SZ',
  '000568.SZ',
  '000858.SZ',
  '000425.SZ',
  '000338.SZ',
  '000651.SZ',
  '000001.SZ',
  '002142.SZ',
  '000776.SZ',
  '002027.SZ',
  '002241.SZ',
  '002179.SZ',
  '002230.SZ',
  '002415.SZ',
  '002714.SZ'
)
```

## Scope

This upload package is only for:

- sleeve: `akshare_local_switch`
- strategy: `akshare_regime_switch_contraction_mean_reversion_v1`
- component: `ak_mean_reversion_quality_combo`
- signal date: `2026-07-09`

Do not use it for `jq_controller`; that strategy is a market-regime controller and should use the Python script package instead.
