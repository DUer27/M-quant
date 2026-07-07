# JoinQuant Factor Backtest Plan

## Goal

Use JoinQuant as the external validation environment for M-quant factors. M-quant exports real factor values only. JoinQuant matches future returns and computes IC, RankIC, group returns, long-short returns, turnover, and basic risk checks.

## Current Data Boundary

- Source: `outputs/research-factor-pipeline/yiwan-research-factor-results.json`
- Rows: 600
- Trading dates: 1
- Current local status: cross-sectional signal only
- Current local limitation: no future return labels, so no real IC, RankIC, win rate, annual return, or backtest result can be generated locally.

## Export From M-quant

Open the platform and enter `回测中心`, then click `下载因子CSV`.

CSV endpoint:

```text
http://127.0.0.1:5556/backtest-api/joinquant-factor-export.csv
```

Main columns:

```text
date,security,code,name,factor_name,factor_display_name,factor_direction,factor_value,factor_version,source_date,factor_label,close,source_file
```

The `security` column is already converted to JoinQuant style:

- `000001.XSHE`
- `600000.XSHG`

## Factors To Test First

1. `volume_price_confirmation`
2. `trend_alignment`
3. `crowding_risk`
4. `technical_composite`
5. `volume_price_divergence_risk`
6. `trend_extension_risk`
7. `kline_event_score`

Risk factors such as `crowding_risk`, `volume_price_divergence_risk`, and `trend_extension_risk` should be tested with negative direction logic. High score should normally correspond to lower future return or higher drawdown risk.

## JoinQuant Research Steps

1. Upload `m-quant-joinquant-factor-export.csv` to JoinQuant research.
2. Read the CSV into pandas.
3. For each `factor_name`, pivot or filter the long table.
4. Use JoinQuant price data to get future close prices.
5. Compute future returns for 1, 5, 10, and 20 trading days.
6. By trade date, calculate:
   - IC
   - RankIC
   - quantile group returns
   - top-minus-bottom long-short return
   - coverage
   - turnover
7. Export a compact JSON result.
8. Paste the JSON back into M-quant `回测中心 -> 结果回填`.

## Minimal JoinQuant Research Code

```python
import json
import numpy as np
import pandas as pd
from scipy.stats import spearmanr, pearsonr

factor_path = 'm-quant-joinquant-factor-export.csv'
df = pd.read_csv(factor_path)
df['date'] = pd.to_datetime(df['date'])

def get_forward_return(securities, date, horizon):
    start = pd.Timestamp(date).strftime('%Y-%m-%d')
    prices = get_price(
        list(securities),
        start_date=start,
        count=horizon + 1,
        frequency='daily',
        fields=['close'],
        panel=False,
        fq='pre',
    )
    if prices is None or len(prices) == 0:
        return pd.Series(dtype=float)
    close = prices.pivot(index='time', columns='code', values='close')
    if len(close) <= horizon:
        return pd.Series(dtype=float)
    return close.iloc[horizon] / close.iloc[0] - 1

def evaluate_factor(one_factor, horizon=5, quantiles=5, direction='positive'):
    records = []
    group_records = []
    for date, part in one_factor.groupby('date'):
        part = part.dropna(subset=['factor_value']).copy()
        part = part.drop_duplicates('security')
        if len(part) < quantiles * 10:
            continue
        forward = get_forward_return(part['security'], date, horizon)
        if forward.empty:
            continue
        part['future_return'] = part['security'].map(forward)
        part = part.dropna(subset=['future_return'])
        if len(part) < quantiles * 10:
            continue

        factor_value = part['factor_value']
        if direction == 'negative':
            factor_value = -factor_value

        ic = pearsonr(factor_value, part['future_return'])[0]
        rank_ic = spearmanr(factor_value, part['future_return'])[0]
        part['group'] = pd.qcut(factor_value.rank(method='first'), quantiles, labels=False) + 1
        group_ret = part.groupby('group')['future_return'].mean()
        long_short = group_ret.loc[quantiles] - group_ret.loc[1]

        records.append({
            'date': date.strftime('%Y-%m-%d'),
            'ic': float(ic),
            'rank_ic': float(rank_ic),
            'long_short': float(long_short),
            'coverage': int(len(part)),
        })
        for group, value in group_ret.items():
            group_records.append({
                'date': date.strftime('%Y-%m-%d'),
                'group': int(group),
                'return': float(value),
            })

    result = pd.DataFrame(records)
    if result.empty:
        return None

    return {
        'factor_name': one_factor['factor_name'].iloc[0],
        'horizon': horizon,
        'direction': direction,
        'ic_mean': float(result['ic'].mean()),
        'rank_ic_mean': float(result['rank_ic'].mean()),
        'long_short_mean': float(result['long_short'].mean()),
        'ic_positive_ratio': float((result['ic'] > 0).mean()),
        'rank_ic_positive_ratio': float((result['rank_ic'] > 0).mean()),
        'coverage_mean': float(result['coverage'].mean()),
        'sample_dates': int(len(result)),
        'daily': records,
        'group_returns': group_records,
        'source': 'joinquant',
    }

results = []
for factor_name, part in df.groupby('factor_name'):
    direction = part['factor_direction'].iloc[0]
    for horizon in [1, 5, 10, 20]:
        result = evaluate_factor(part, horizon=horizon, direction=direction)
        if result:
            results.append(result)

print(json.dumps(results, ensure_ascii=False, indent=2))
```

## Import Back To M-quant

Copy one JSON object or a compact summary object from JoinQuant and paste it into M-quant.

Example:

```json
{
  "factor_name": "volume_price_confirmation",
  "horizon": 5,
  "direction": "positive",
  "ic_mean": 0.031,
  "rank_ic_mean": 0.044,
  "long_short_mean": 0.006,
  "sample_dates": 120,
  "source": "joinquant"
}
```

## Acceptance Standard

Do not call a factor effective only because one run is positive. A useful factor should pass several checks:

- IC or RankIC direction is stable.
- Group returns are monotonic or nearly monotonic.
- Long-short return survives fees and turnover.
- Results are not driven by one industry or a tiny sample.
- Performance survives 1/5/10/20 day horizons or has a clear horizon-specific explanation.
