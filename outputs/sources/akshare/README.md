# AkShare 数据目录

后续从 AkShare 拉取的数据统一放在这里，按处理阶段区分：

- `scripts/`：拉取、清洗、转换脚本。
- `raw/`：原始下载结果，不改字段、不改口径。
- `processed/`：清洗、对齐股票代码和日期后的中间数据。
- `results/`：由 AkShare 数据生成的因子、截面、验证结果。

所有结果必须保留来源字段、下载时间、数据周期和计算口径。没有真实数据支持的指标不要放进 `results/`。

## 当前已验证通道

2026-07-09 已用 AkShare 真实接口完成小批量验证，并补齐沪深300 300 股本地样本：

- 周期：2024-01-01 至 2026-07-09
- 复权：前复权 `qfq`
- 股票数：300 只
- 行数：180816 行
- 交易日：608 日
- 输出：`outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv`

这证明本地 OHLCV 长历史采集通道可用；沪深300 300 股可用于方向性研究，但仍不足以形成成熟策略结论。

## 断点续跑命令

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/fetch_a_share_history.py \
  --start 20240101 \
  --end 20260709 \
  --symbols-file outputs/sources/akshare/processed/a_share_csi300_pool.csv \
  --skip-existing \
  --combine-only \
  --pool-output a_share_csi300_pool.csv \
  --output-name a_share_daily_20240101_20260709_qfq.csv
```

只合并本地 raw 已有数据、不请求网络：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/fetch_a_share_history.py \
  --start 20240101 \
  --end 20260709 \
  --symbols-file outputs/sources/akshare/processed/a_share_raw_available_pool.csv \
  --skip-existing \
  --combine-only
```

说明：

- `--skip-existing` 会复用 `raw/a_share_daily/` 中已成功的股票，只补失败项。
- `--provider tx` 使用 AkShare 腾讯日线源，可作为东方财富源断开时的补采路径；腾讯源缺成交额/换手率，不做伪造填充。
- `--seed-fallback` 在股票池接口失败时使用内置小股票池验证通道。
- `--symbols 000001,000333,600519` 可直接指定股票代码，绕开股票池接口。
- `--symbols-file outputs/sources/akshare/processed/a_share_csi300_missing_pool.csv` 可按沪深300缺失池批量续跑。
- `--combine-only` 只复用 raw 已有数据，会输出缺失清单，不请求网络。
- 脚本只保存真实返回数据；失败股票会写入 summary，不会补假数据。

## 本地 OHLCV 因子回测

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/build_ohlcv_factor_backtest.py \
  --input outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv \
  --min-stocks 270 \
  --top-n 20 \
  --cost 0.001
```

当前产物：

- `outputs/sources/akshare/results/akshare_ohlcv_factor_backtest_results.json`
- `outputs/sources/akshare/results/akshare_ohlcv_factor_backtest_summary.json`
- `outputs/sources/akshare/results/akshare_ohlcv_factor_values.csv`

当前结果边界：

- 未分层策略仍不够成熟，不能直接模拟盘。
- `AkShare拥挤风险`、`AkShare反拥挤回归组合`、`AkShare均值回归质量组合` 的 5 日 RankIC 通过本地初筛。
- 2026-07-09 追加挖掘后，`AkShare流动性稳定` 5/10/20 日均通过本地单因子显著性初筛；`AkShare突破确认`、`AkShare趋势回踩支撑` 单因子未通过，不单独升级。
- 分层后高波动×中/低流动性的均值回归路线、低波动×中流动性的防守/量价确认路线表现更强，但只有 33-39 次样本交易，必须做 JoinQuant 复核、年度分段和行业暴露检查。

## 本地候选稳定性验证

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/validate_strategy_candidates.py \
  --input outputs/sources/akshare/processed/a_share_daily_20240101_20260709_qfq.csv \
  --top-n 20 \
  --cost 0.001
```

当前产物：

- `outputs/sources/akshare/results/akshare_strategy_candidate_validation.json`
- `outputs/_docs/akshare-strategy-candidate-validation-20260709.md`

当前 6 条强分层策略通过本地年度、前后半段、2025-07-01 后样本外、回撤和 Sharpe 门槛，状态为 `joinquant_review_candidate`。这只表示可以进入 JoinQuant 复核，不代表已经可以实盘或模拟盘。

## 本地模拟观察严格审计

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/audit_akshare_paper_watch_readiness.py
```

当前产物：

- `outputs/sources/akshare/results/akshare_paper_watch_readiness_audit_20260709.json`
- `outputs/_docs/akshare-paper-watch-readiness-audit-20260709.md`

当前严格审计结论：

- 6 条 AkShare 本地路线均通过 `ready_local_paper_watch`。
- 最优 Sharpe 路线：`AkShare低波动收缩突破-中流动性观察策略`，39 次调仓，收益 84.95%，最大回撤 -4.19%，Sharpe 3.23，2.0x 成本压力收益 77.98%。
- 该结果只证明 AkShare 本地真实 OHLCV 路线可进入受控模拟观察，不等同于 JoinQuant 原生实测；后续仍需补行业暴露、市值、涨跌停/停牌、JoinQuant 复核和样本外跟踪。
- 平台 `模拟观察清单` 已接入这些本地路线，并单独标记 `AkShare本地OHLCV`，不得和 JoinQuant 证据混用。

## 本地受控执行包

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/build_akshare_paper_watch_execution_pack.py
```

当前产物：

- `outputs/sources/akshare/results/akshare_paper_watch_execution_pack_20260709.json`
- `outputs/_docs/akshare-paper-watch-execution-pack-20260709.md`

执行包结论：

- 6 条 AkShare 本地就绪路线中，2 条进入本地受控模拟观察执行包。
- 主观察：`AkShare低波动收缩突破-中流动性观察策略`。
- 高波动备选：`AkShare高波动均值回归-中流动性观察策略`。
- 其余 4 条只做候选监控，不默认开仓。
- 执行包明确开仓边界、Top20 等权、单票 5% 上限、5 日调仓、暂停规则和每日观察字段。

## 最新模拟观察信号

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/generate_akshare_paper_watch_signal.py
```

当前产物：

- `outputs/sources/akshare/results/akshare_paper_watch_latest_signal_20260709.json`
- `outputs/_docs/akshare-paper-watch-latest-signal-20260709.md`

2026-07-09 信号结论：

- 最新市场状态为高波动，本地低波动主观察路线不触发，只记录信号。
- `AkShare高波动均值回归-中流动性观察策略` 触发 `paper_watch_open_allowed`。
- 当期候选 15 只、入选 15 只，涨跌停代理 0、停牌代理 0。
- 入选代码：`002001, 000568, 000858, 000425, 000338, 000651, 000001, 002142, 000776, 002027, 002241, 002179, 002230, 002415, 002714`。
- 平台 `模拟观察清单` 已显示最新信号日期、动作、候选数、入选数和 Top20 明细。

## 最新信号 JoinQuant 交易可行性复核

当前产物：

- `outputs/sources/joinquant/scripts/m_quant_akshare_latest_signal_tradeability_review_20260709.py`
- `outputs/_docs/akshare-latest-signal-tradeability-review-20260709.md`

平台下载入口：

- `/strategy-api/joinquant-akshare-latest-signal-tradeability-review.py`

复核内容：

- 只针对 2026-07-09 已触发的 `AkShare高波动均值回归-中流动性观察策略` 15 只候选。
- 在 JoinQuant 真实研究环境检查停牌、ST、涨跌停、行业、市值、换手率和可交易数量。
- 该脚本不生成收益，不替代策略回测；只有 `decision=tradeability_review_passed` 且可交易候选不少于 10 只，才允许继续推进模拟观察。

## 新因子探测

- `scripts/probe_ohlcv_factor_candidates.py`：使用本地真实 AkShare OHLCV 历史探测新增候选因子。
- `results/akshare_new_factor_probe_20260709.json`：5 个候选因子的 RankIC、多空收益和决策。

本轮探测没有新增正式因子：

- `ak_vol_adj_momentum`、`ak_price_volume_elasticity`、`ak_orderly_trend`：多空收益为正，但 RankIC 稳定性不足，只能观察。
- `ak_volume_dry_up_reversal`、`ak_gap_repair_quality`：弱信号拒绝。

这些候选未进入正式因子库，也不会用于生成正式策略。

追加通过的两条候选：

- `AkShare低波动收缩突破-中流动性观察策略`
- `AkShare低波动趋势回踩-中流动性观察策略`

## 因子质量审计

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  outputs/sources/akshare/scripts/audit_factor_quality.py
```

当前产物：

- `outputs/sources/akshare/results/akshare_factor_quality_audit.json`
- `outputs/_docs/akshare-factor-quality-audit-20260709.md`

当前严格审计结论：

- 单因子通过：`ak_liquidity_stability`
- 显著但不可单独交易：`ak_crowding_risk`、`ak_anti_crowding_reversal_combo`、`ak_mean_reversion_quality_combo`
- 其余因子仅观察或暂缓单独使用
- 6 条策略候选全部仍为待 JoinQuant 复核
