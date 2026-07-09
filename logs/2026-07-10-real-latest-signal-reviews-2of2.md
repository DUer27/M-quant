# 2026-07-10 Real Latest-Signal Reviews And 2/2 Target

## Objective

Close the remaining evidence gap for the paper-watch objective by running real JoinQuant latest-signal reviews instead of leaving candidates as unverified tasks.

## Real JoinQuant Runs

### Core Medium-Vol Small-Cap Sleeve

- Script:
  - `outputs/sources/joinquant/scripts/m_quant_core_medium_small_latest_signal_review_20260710.py`
- Archived raw result:
  - `outputs/sources/joinquant/results/core_medium_small_latest_signal_review_20260710.json`
- Imported store:
  - `platform/quant-factor-platform/data/imported-core-medium-small-signal-reviews.json`

Real result:

- Latest requested trade day: `2026-07-10`
- `2026-07-10` was skipped because JoinQuant `valuation` returned no usable data.
- Latest usable data date: `2026-07-09`
- Market regime: `high_volatility`
- Target market-cap bucket: `small_cap`
- Selected count: `7`
- Decision: `promotion_signal_not_ready`

Gate result:

- Did not promote `jq_medium_vol_small_cap_core`.
- Did not count toward the 2/2 paper-watch objective.

### AkShare Latest Signal Tradeability Review

- Script:
  - `outputs/sources/joinquant/scripts/m_quant_akshare_latest_signal_tradeability_review_20260709.py`
- Archived raw result:
  - `outputs/sources/joinquant/results/akshare_latest_signal_tradeability_review_20260710.json`
- Imported store:
  - `platform/quant-factor-platform/data/imported-tradeability-reviews.json`

Real result:

- Signal date: `2026-07-09`
- Strategy: `ak_mean_reversion_quality_combo`
- Candidate count: `15`
- Tradable count: `15`
- Blocked count: `0`
- Decision: `tradeability_review_passed`

Gate result:

- Promoted `akshare_local_switch` to `ready_for_controlled_paper_watch`.
- The route can now be used as the second independent paper-watch sleeve.

## Current Paper-Watch Sleeves

Ready:

- `jq_controller`
  - Strategy: `regime_switch_quality_kline_v1`
  - Evidence: JoinQuant derived real curves
- `akshare_local_switch`
  - Strategy: `akshare_regime_switch_contraction_mean_reversion_v1`
  - Evidence: AkShare local OHLCV strategy plus JoinQuant latest-signal tradeability review

Blocked:

- `jq_medium_vol_small_cap_core`
  - Strategy: `core_volume_price_trend_v1`
  - Reason: latest real JoinQuant signal review returned `promotion_signal_not_ready`

## Verification

- Operations pack:
  - `ready_sleeve_count=2`
  - `blocked_sleeve_count=1`
- Independent sleeve audit:
  - `goal_status=target_met`
  - `eligible_independent_sleeve_count=2`
- Strategy maturity matrix:
  - `goal_status=target_met`
  - `ready_strategy_count=2`
  - `target_ready_strategy_count=2`
- Local API check:
  - `/strategy-api/strategy-maturity-matrix` returned `target_met` and `ready_strategy_count=2`.

## Data Honesty Boundary

No fake latest signal, return, NAV, trade, position, or promotion result was generated.

The core medium-vol small-cap candidate failed the latest real gate and remains blocked. The 2/2 target was met by promoting the AkShare local switch only after a real JoinQuant tradeability review passed.
