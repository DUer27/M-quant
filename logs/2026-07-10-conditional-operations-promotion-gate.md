# 2026-07-10 Conditional Operations Promotion Gate

## Objective

Wire the `core_volume_price_trend_v1 / medium_volatility / small_cap` candidate into the paper-watch operations workflow without promoting it prematurely.

## Inputs

- Historical route evidence:
  - `outputs/strategies/joinquant/strategy_maturity_audit_20260709.json`
- Imported latest-signal review store:
  - `platform/quant-factor-platform/data/imported-core-medium-small-signal-reviews.json`
- Operations pack:
  - `outputs/paper-watch/results/paper_watch_operations_pack_20260709.json`

## Promotion Gate

`jq_medium_vol_small_cap_core` is added to `capital_sleeves` only after a real imported JoinQuant review exists for:

- `strategy_id=core_volume_price_trend_v1`
- `sleeve_id=jq_medium_vol_small_cap_core`
- `decision=promotion_signal_ready`
- `market_regime=medium_volatility`
- `target_market_regime=medium_volatility`
- `target_market_cap_bucket=small_cap`
- `selected_count>=10`

If the review is missing, the route remains a candidate. If a review exists but is not ready, it can be shown as blocked, with `planned_weight` forced to `0`.

## Files Changed

- `outputs/paper-watch/scripts/build_paper_watch_operations_pack.py`
- `outputs/paper-watch/scripts/audit_independent_sleeve_candidates.py`
- `outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
- `outputs/paper-watch/scripts/build_core_medium_small_promotion_task_pack.py`
- Rebuilt paper-watch result JSON and docs.

## Verification

- Python syntax check passed for changed paper-watch scripts.
- `node --check` passed for:
  - `platform/quant-factor-platform/server.mjs`
  - `platform/quant-factor-platform/assets/app.js`
- `git diff --check` passed.
- Local API check on `http://127.0.0.1:5573/strategy-api/strategy-maturity-matrix` returned:
  - `goal_status=not_met`
  - `ready_strategy_count=1`
  - `target_ready_strategy_count=2`
  - `core_medium_small_signal_review_count=0`

## Current Honest State

The system still has only one ready independent paper-watch sleeve:

- `jq_controller / 市场状态切换策略 v1`

The second candidate remains blocked because no real latest-signal review has been imported for `jq_medium_vol_small_cap_core`.

## Data Honesty Boundary

No fake review JSON was imported. No returns, NAV, fills, positions, latest signal, or promotion result were generated.
