# AkShare 数据目录

后续从 AkShare 拉取的数据统一放在这里，按处理阶段区分：

- `scripts/`：拉取、清洗、转换脚本。
- `raw/`：原始下载结果，不改字段、不改口径。
- `processed/`：清洗、对齐股票代码和日期后的中间数据。
- `results/`：由 AkShare 数据生成的因子、截面、验证结果。

所有结果必须保留来源字段、下载时间、数据周期和计算口径。没有真实数据支持的指标不要放进 `results/`。

## 当前已验证通道

2026-07-09 已用 AkShare 真实接口完成小批量验证，并扩展到核心流动性 50 股：

- 周期：2024-01-01 至 2026-07-09
- 复权：前复权 `qfq`
- 股票数：50 只
- 行数：30380 行
- 交易日：608 日
- 输出：`outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv`

这证明本地 OHLCV 长历史采集通道可用；50 只股票可用于方向性研究，但仍不足以形成全市场成熟策略结论。

## 断点续跑命令

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/fetch_a_share_history.py \
  --start 20240101 \
  --end 20260709 \
  --symbols-file outputs/sources/akshare/symbols/core_liquid_50.csv \
  --skip-existing \
  --sleep 0.5 \
  --retries 6 \
  --retry-sleep 1.5
```

说明：

- `--skip-existing` 会复用 `raw/a_share_daily/` 中已成功的股票，只补失败项。
- `--seed-fallback` 在股票池接口失败时使用内置小股票池验证通道。
- `--symbols 000001,000333,600519` 可直接指定股票代码，绕开股票池接口。
- `--symbols-file outputs/sources/akshare/symbols/core_liquid_50.csv` 可按固定股票池批量续跑。
- 脚本只保存真实返回数据；失败股票会写入 summary，不会补假数据。

## 本地 OHLCV 因子回测

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/build_ohlcv_factor_backtest.py \
  --input outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv \
  --min-stocks 30 \
  --top-n 10 \
  --cost 0.001
```

当前产物：

- `outputs/sources/akshare/results/akshare_ohlcv_factor_backtest_results.json`
- `outputs/sources/akshare/results/akshare_ohlcv_factor_backtest_summary.json`
- `outputs/sources/akshare/results/akshare_ohlcv_factor_values.csv`

当前结果边界：

- 量价趋势质量和防守质量组合在 50 股样本中为负，不能升级策略。
- 反拥挤回归组合为正，但 Sharpe 仍低，只能作为继续研究方向。
