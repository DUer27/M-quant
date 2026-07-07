# 2026-07-07 Factor Library Activation

## Scope
- Activated the project factor library view as a real feature instead of a placeholder.
- The frontend now merges real computed factor availability with registered research factor definitions.
- No IC, win rate, annual return, or backtest performance was invented.

## Real Data Basis
- Source pack: `/Users/Admin/Documents/Codex/2026-07-06/ke/outputs/merged-batches/yiwan-merged-indicators-20260707-093737-p001-p020.json`
- Rows: 600
- Source date: 2026-07-06 15:00:00

## Displayed Factors
- Computed from current real rows: 9
- Waiting for history or missing source sections: 9
- K-line rules displayed: 11 scored rules plus 2 recognized-only rules

## Browser Verification
- URL: `http://127.0.0.1:5555/`
- Active view after click: `factor-library-view`
- Factor library table rows: 18
- K-line rule table rows: 13
- Confirmed entries include `资金跟随因子`, `恐慌反转因子`, and `单根K线评分`.

## Data Honesty Notes
- Current computed factors are based on the ingested Yiwan indicator rows.
- Capital-flow, sentiment, sector, and event factors are displayed as registered logic only until their source sections are collected.
- Huafu emotion-weighted K-line strategy remains partially available because 240-day history is still missing for the resonance factor.
