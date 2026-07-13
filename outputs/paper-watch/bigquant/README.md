# M-quant BigQuant Paper Watch Package

Generated for the current objective: run every M-quant strategy that has reached the controlled paper-watch standard on BigQuant simulation/paper trading.

## Hard Rules

- Do not upload or push Git changes unless the user explicitly asks.
- Do not expand the strategy universe beyond audited M-quant evidence.
- Do not mark BigQuant results as passed until real BigQuant output is brought back into this repository.
- `core_volume_price_trend_v1` is not runnable for BigQuant paper watch yet; its latest signal review did not pass the promotion gate.

## Ready Targets

1. `jq_controller` / `regime_switch_quality_kline_v1`
   - Strategy: Market-regime switch controller v1.
   - Evidence: JoinQuant real trading curves combined from audited components.
   - Logic: high volatility uses `jq_quality_profit_liquidity_v1`; low volatility uses `kline_assisted_confirmation`; medium volatility stays in cash/watch mode.
   - Script: `scripts/bigquant_jq_controller_regime_switch.py`.

2. `akshare_local_switch` / `akshare_regime_switch_contraction_mean_reversion_v1`
   - Strategy: AkShare local high/low-volatility switch v1.
   - Current open signal: high-volatility mean-reversion quality component, 15 selected stocks on 2026-07-09.
   - Tradeability: JoinQuant review passed, 15 tradable / 0 blocked.
   - Script: `scripts/bigquant_akshare_local_switch_latest_signal.py`.

## Files

- `config/paper_watch_targets.json`: compact evidence and target metadata used by the scripts.
- `scripts/bigquant_jq_controller_regime_switch.py`: BigQuant paper-watch script for the JoinQuant-derived controller.
- `scripts/bigquant_akshare_local_switch_latest_signal.py`: BigQuant paper-watch script for the current AkShare open signal.
- `uploads/akshare_local_switch_score_input_20260709.csv`: direct BigQuant visual-workflow input table for the AkShare latest signal.
- `uploads/akshare_local_switch_score_to_position_config.md`: exact `score_to_position.v5` settings to avoid the parser error near comma.
- `uploads/mquant_akshare_local_switch_bigquant_upload_only.py`: standalone upload-only Python file built to satisfy BigQuant module/date/data-input constraints while preserving the audited M-quant signal logic.
- `templates/bigquant_result_backfill_template.json`: result format to bring real BigQuant output back into M-quant.

## BigQuant Execution Notes

Create one BigQuant simulation/paper task per ready sleeve. Keep strategy names, `sleeve_id`, `strategy_id`, benchmark, rebalance period, selected-code policy, and pause rules exactly as written here. If BigQuant's current template uses different callback names, keep the selection/risk logic unchanged and only adapt the template wrapper.

Recommended task names:

- `M-quant jq_controller regime_switch_quality_kline_v1 paper watch`
- `M-quant akshare_local_switch latest_signal_20260709 paper watch`

For the visual BigQuant workflow of `akshare_local_switch`, upload `uploads/akshare_local_switch_score_input_20260709.csv` and set `score_to_position.v5` score column to exactly `score`. Do not paste the selected stock list into `score_to_position.v5`; comma-separated stock lists caused the observed parser error.

If the visual workflow or existing notebook keeps failing on date/cache parsing, use `uploads/mquant_akshare_local_switch_bigquant_upload_only.py` as the clean upload file. It keeps `start_date` and `end_date` as plain strings for BigQuant module caching, converts the input `date` column with `pd.to_datetime`, and passes only `date/instrument/position` into `bigtrader.v53`. It does not create or assume any BigQuant return result.

After a task starts running, export or record real BigQuant results and fill `templates/bigquant_result_backfill_template.json`. Until then, repository status remains `pending_bigquant_real_backtest`.
