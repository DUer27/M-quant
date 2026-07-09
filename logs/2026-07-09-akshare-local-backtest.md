# 2026-07-09 AkShare 本地历史与回测升级

本次升级目标：补齐真实历史数据通道，并把本地 OHLCV 因子/策略回测接入平台展示。

## 数据

- 通过 AkShare `stock_zh_a_hist` 与 `stock_zh_a_hist_tx` 拉取并复用沪深300 300 股。
- 区间：2024-01-01 至 2026-07-09。
- 落地：180816 行，608 个交易日。
- 支持断点续跑：`--skip-existing`、`--symbols-file`、单股重试、`--combine-only`、`--provider tx`。
- 当前源构成：东方财富 27958 行，腾讯 152858 行；腾讯源缺成交额/换手率，未做伪造填充。

## 回测

- 新增本地 OHLCV 因子回测脚本。
- 输出 27 条因子结果和 64 条策略分层结果。
- 正观察：`AkShare拥挤风险` 5日 RankIC 0.0174，t 值 2.93；`AkShare反拥挤回归组合` 5日 RankIC 0.0176，t 值 2.63；`AkShare均值回归质量组合` 5日 RankIC 0.0174，t 值 2.17。
- 未分层结果：量价趋势质量 Sharpe 0.73、防守质量 Sharpe 0.27、均值回归 Sharpe 0.51、反拥挤 Sharpe 0.60，均不直接升级模拟盘。

## 平台

- 数据可信度接入 AkShare 历史行情与本地回测状态。
- 回测中心合并展示 AkShare 本地真实回测结果。
- 策略实测页识别 `local_strategy_backtest`。

## 边界

- 300 股本地 OHLCV 样本仍不足以直接模拟盘，因为腾讯源缺成交额/换手率，且分层交易次数只有 33-39 次。
- 当前两条准模拟盘候选仍为 JoinQuant 真实结果支持的 `JQ质量利润流动性策略 v1` 和 `K线辅助确认策略`。
- AkShare 反拥挤回归只作为下一轮扩样本研究方向。

## 追加：分层回测增强

- 本地 AkShare 策略结果维持 64 条，并使用沪深300 300 股样本重跑。
- 新增层：未分层、市场高/中/低波动、成交额高/中/低流动性、波动×流动性交叉层。
- 不伪造市值；本地分层只使用 OHLCV 可得的等权市场波动和流动性指标，成交额缺失时用真实成交量兜底。
- 最强观察层：
  - `AkShare均值回归质量策略 v0` 高波动×中流动性：33 次交易，总收益 48.19%，年化 82.35%，最大回撤 -4.89%，Sharpe 3.02。
  - `AkShare防守质量确认策略 v0` 低波动×中流动性：39 次交易，总收益 96.89%，年化 140.01%，最大回撤 -5.49%，Sharpe 2.81。
  - `AkShare均值回归质量策略 v0` 高波动×低流动性：33 次交易，总收益 50.99%，年化 87.62%，最大回撤 -4.81%，Sharpe 2.77。
  - `AkShare量价趋势质量策略 v0` 低波动×中流动性：39 次交易，总收益 97.76%，年化 141.38%，最大回撤 -10.92%，Sharpe 2.69。
- 结论：低波动确认路线与高波动回归路线成为最强本地观察候选；下一步必须 JoinQuant 复核、年度分段、行业暴露检查，不能直接升级为成熟模拟盘策略。

## 追加：候选稳定性验证

- 新增 `outputs/sources/akshare/scripts/validate_strategy_candidates.py`，复用真实 AkShare OHLCV 因子管线，不生成虚拟价格、收益、市值、行业或流动性字段。
- 验证口径：Top20、5日调仓、单次成本 0.10%，检查整体收益、Sharpe、最大回撤、年度分段、前后半段和 2025-07-01 后样本外。
- 4 条策略通过本地门槛，统一标记为 `joinquant_review_candidate`，只代表待 JoinQuant 复核：
  - 高波动均值回归-中流动性：33 次交易，总收益 48.19%，最大回撤 -4.89%，Sharpe 3.02。
  - 低波动防守确认-中流动性：39 次交易，总收益 96.89%，最大回撤 -5.49%，Sharpe 2.81。
  - 低波动量价趋势-中流动性：39 次交易，总收益 97.76%，最大回撤 -10.92%，Sharpe 2.69。
  - 高波动反拥挤-中流动性：33 次交易，总收益 42.13%，最大回撤 -4.47%，Sharpe 2.56。
- 平台数据可信度接口新增 `AkShare候选复核` 项，用于提示本地候选数量和下一步 JoinQuant 复核要求。

## 追加：JoinQuant 复核脚本

- 新增 `outputs/sources/joinquant/scripts/m_quant_akshare_ohlcv_candidate_review.py`。
- 平台策略草案池新增 `AkShare强分层候选复核包`，按钮可直接下载聚宽复核脚本。
- 复核对象：本地 4 条 `joinquant_review_candidate`，不新增未验证收益展示。
- 脚本输出：5/10/20 日事件收益、5日调仓交易净值、目标路线、市值层和高/中/低波动 × 大/中/小市值交叉层。
- 真实数据替换：JoinQuant `money_ma20` 替代本地腾讯源成交量兜底；`valuation.market_cap` 做市值层；`valuation.turnover_ratio` 参与拥挤风险复核。
- 边界：脚本生成不代表策略有效，只有把 JoinQuant 实跑 JSON 回填并通过收益、回撤、Sharpe、样本外和成本审计后，才允许升级为正式候选。

## 追加：真实 OHLCV 新因子挖掘

- 扩展 `outputs/sources/akshare/scripts/build_ohlcv_factor_backtest.py`，新增 6 个 OHLCV 可复现因子/组合。
- 重跑真实 AkShare 沪深300样本后，因子结果从 27 条扩展到 45 条，策略分层结果从 64 条扩展到 96 条。
- 通过本地单因子初筛：`ak_liquidity_stability`，5日 RankIC 0.0305、t 值 6.57；10日 RankIC 0.0256、t 值 5.41；20日 RankIC 0.0208、t 值 4.24。
- 暂缓单独使用：`ak_breakout_confirmation`、`ak_pullback_support_quality`、`ak_trend_pullback_reversal_combo` 单因子不显著。
- 新增 2 条 `joinquant_review_candidate`：
  - `AkShare低波动收缩突破-中流动性观察策略`：39 次交易，总收益 84.95%，最大回撤 -4.19%，Sharpe 3.23。
  - `AkShare低波动趋势回踩-中流动性观察策略`：39 次交易，总收益 111.38%，最大回撤 -7.38%，Sharpe 2.84。
- 聚宽复核脚本同步扩展为 6 条候选；这些仍不是正式策略，下一步必须回填 JoinQuant 真实结果再筛。

## 追加：严格质量审计

- 新增 `outputs/sources/akshare/scripts/audit_factor_quality.py`，只读取真实回测结果，不生成新收益。
- 审计产物：`outputs/sources/akshare/results/akshare_factor_quality_audit.json` 与 `outputs/_docs/akshare-factor-quality-audit-20260709.md`。
- 严格门槛：样本天数 >= 120，RankIC >= 0.015，RankIC t >= 2，多空收益 > 0，多空胜率 >= 53%。
- 审计结论：15 个因子中 1 个单因子通过、3 个显著但不可单独交易、6 个继续观察、5 个暂缓单独使用。
- 通过项：`ak_liquidity_stability`；其余本地强策略更多来自分层组合，不允许直接包装成单因子 alpha。
- 平台数据可信度接口新增 `AkShare因子审计` 项，用于展示严格通过数量和待 JoinQuant 复核边界。

## 追加：JoinQuant 策略成熟度审计

- 新增 `outputs/strategies/joinquant/audit_strategy_maturity.py`，只读取已导入的 JoinQuant 真实策略交易回测结果。
- 审计产物：`outputs/strategies/joinquant/strategy_maturity_audit_20260709.json`、`outputs/_docs/strategy-maturity-audit-20260709.md`、`outputs/strategies/joinquant/paper_watch_routes_20260709.json`。
- 5 个已导入策略中，没有整策略通过成熟门槛；4 个策略存在受控分层路线，1 个策略暂缓或重做。
- 首批可进入受控模拟观察的两条路线：
  - `K线辅助确认策略`：仅低波动/大市值，收益 49.93%，回撤 -3.92%，Sharpe 2.52。
  - `JQ质量利润流动性策略 v1`：仅高波动/中市值，收益 57.66%，回撤 -10.37%，Sharpe 1.95。
- 边界：这是“受控分层路线”模拟观察，不是整策略无条件放开；未通过的波动/市值层不得使用。
- 平台数据可信度接口新增 `策略成熟度审计` 项，展示首批可模拟观察路线数量。

## 追加：模拟观察清单接入平台

- 新增 `/strategy-api/paper-watch-routes`，直接读取 `paper_watch_routes_20260709.json`。
- 总览页新增 `模拟观察清单` 面板，展示首批两条路线、收益、回撤、Sharpe 和运行约束。
- 页面明确展示路线边界：只允许通过审计的市场波动/市值层，不能把同名策略整体放开。

## 追加：受控模拟观察执行包

- 新增 `outputs/strategies/joinquant/build_paper_watch_execution_pack.py`，从已审计 JoinQuant 路线生成执行包。
- 生成 `paper_watch_execution_pack_20260709.json` 和 `paper-watch-execution-pack-20260709.md`，记录每条路线的开仓边界、5日调仓、暂停规则和每日观察字段。
- 总览页 `模拟观察清单` 支持展开查看执行规则；继续强调这只是受控样本外观察配置，不是整策略实盘批准。

## 追加：新 OHLCV 因子探测

- 新增 `outputs/sources/akshare/scripts/probe_ohlcv_factor_candidates.py`，使用本地真实 AkShare OHLCV 历史探测 5 个候选因子。
- 生成 `akshare_new_factor_probe_20260709.json` 和 `akshare-new-factor-probe-20260709.md`。
- 本轮没有新增正式因子：`ak_vol_adj_momentum`、`ak_price_volume_elasticity`、`ak_orderly_trend` 仅多空观察；`ak_volume_dry_up_reversal`、`ak_gap_repair_quality` 弱信号拒绝。
- 决策：全部不进入正式因子库，不用于生成正式策略，等待更多真实数据或 JoinQuant 复核后再判断。

## 追加：模拟观察就绪审计

- 新增 `outputs/strategies/joinquant/audit_paper_watch_readiness.py`，用已导入 JoinQuant 真实交易净值曲线重算成本压力、前后半段收益、候选数量和近期触发。
- 生成 `paper_watch_readiness_audit_20260709.json` 和 `paper-watch-readiness-audit-20260709.md`。
- 严格结论：`K线辅助确认策略` 低波动/大市值为条件模拟观察；`JQ质量利润流动性策略 v1` 高波动/中市值因平均入选 7.38 只，低于 10 只门槛，暂不进入模拟盘。
- 平台总览的 `模拟观察清单` 接入就绪审计，展开后可看到失败检查项和 1.5x/2.0x 成本压力结果。

## 追加：全量受控路线推荐清单

- 修正 `audit_paper_watch_readiness.py`：从 `strategy_maturity_audit_20260709.json` 读取全部 9 条受控路线，而不是只审执行包中的 2 条；同时修正“只按波动分层、不按市值分层”的匹配。
- 全量审计结果：1 条 `ready_controlled_paper_watch`、2 条 `conditional_paper_watch`、3 条 `conditional_recheck_required`、3 条 `not_ready`。
- 当前推荐模拟观察清单更新为：
  - `JQ质量利润流动性策略 v1`：高波动，ready，收益 35.13%，最大回撤 -10.27%，Sharpe 1.74，平均入选 30 只，最近触发至 2026-06-08。
  - `K线辅助确认策略`：低波动，conditional，收益 35.64%，最大回撤 -4.11%，Sharpe 1.86，平均入选 28.55 只，最近触发至 2025-08-13。
- `paper_watch_execution_pack_20260709.json` 与平台总览改为优先使用就绪审计推荐路线；页面已验证显示 `1就绪/1条件`。

## 追加：市场状态切换策略

- 新增 `outputs/strategies/joinquant/build_regime_switch_quality_kline_strategy.py`。
- 组合逻辑：高波动使用 `JQ质量利润流动性策略 v1`，低波动使用 `K线辅助确认策略`，中波动默认空仓/观察。
- 数据原则：只组合已导入 JoinQuant 真实交易曲线中的单期 `gross_return/cost/turnover`，不生成虚构收益；结果标记为 `derived_from_joinquant_real_trading_curves`。
- 生成 `regime_switch_quality_kline_v1_20260709.json` 和 `regime-switch-quality-kline-v1-20260709.md`。
- 组合策略结果：70 期，收益 83.29%，最大回撤 -9.07%，Sharpe 1.80，平均入选 29.36 只；1.5x 成本压力收益 74.03%，2.0x 成本压力收益 65.22%。
- 重新审计后：2 条 `ready_controlled_paper_watch`、2 条 `conditional_paper_watch`、3 条 `conditional_recheck_required`、3 条 `not_ready`。
- 当前平台总览已验证显示 `2就绪/0条件`：`JQ质量利润流动性策略 v1 - 高波动` 与 `市场状态切换策略 v1 - 高低波动切换`。

## 追加：模拟观察独立性审计

- 新增 `outputs/strategies/joinquant/audit_paper_watch_independence.py`。
- 生成 `paper_watch_independence_audit_20260709.json` 和 `paper-watch-independence-audit-20260709.md`。
- 结论：当前 2 条 ready 推荐路线共享 `JQ质量利润流动性策略 v1` 高波动组件，不能作为两笔独立资金同时满仓；独立资金袖数量为 1。
- 运用建议：以 `市场状态切换策略 v1` 作为组合控制器；`JQ质量利润流动性策略 v1 - 高波动` 作为组件监控/备选。平台总览已接入独立性提示和重叠警告。

## 追加：AkShare 本地模拟观察严格审计

- 新增 `outputs/sources/akshare/scripts/audit_akshare_paper_watch_readiness.py`，只读取 `akshare_strategy_candidate_validation.json` 中真实 AkShare OHLCV 候选交易记录，重算 1.5x/2.0x 成本压力、年度分段、前后半段、2025-07-01 后样本外和近期触发。
- 生成 `outputs/sources/akshare/results/akshare_paper_watch_readiness_audit_20260709.json` 与 `outputs/_docs/akshare-paper-watch-readiness-audit-20260709.md`。
- 严格门槛：调仓次数 >= 30，收益 >= 20%，Sharpe >= 1.2，最大回撤 >= -15%，胜率 >= 55%，平均入选 >= 15，近 2026 年至少 3 次触发，1.5x/2.0x 成本压力收益为正，年度分段和样本外收益为正。
- 审计结果：6 条 AkShare 本地路线全部为 `ready_local_paper_watch`。其中 `AkShare低波动收缩突破-中流动性观察策略` Sharpe 3.23、收益 84.95%、最大回撤 -4.19%、2.0x 成本压力收益 77.98%。
- 平台 `模拟观察清单` 已接入 AkShare 本地路线，并单独标记 `AkShare本地OHLCV`。这是第二类独立证据源，可作为寻找第二个独立模拟观察策略的候选，但仍需继续补 JoinQuant 复核、行业暴露、市值、涨跌停/停牌约束。

## 追加：AkShare 本地受控执行包

- 新增 `outputs/sources/akshare/scripts/build_akshare_paper_watch_execution_pack.py`。
- 生成 `outputs/sources/akshare/results/akshare_paper_watch_execution_pack_20260709.json` 与 `outputs/_docs/akshare-paper-watch-execution-pack-20260709.md`。
- 6 条本地就绪路线中，2 条进入执行包：`AkShare低波动收缩突破-中流动性观察策略` 为主观察，`AkShare高波动均值回归-中流动性观察策略` 为高波动备选；其余 4 条只做候选监控。
- 执行包只读取严格审计结果，不新增收益；新增开仓边界、Top20 等权、单票 5% 上限、5日调仓、暂停规则和每日观察字段。
- 平台 `模拟观察清单` 已接入 AkShare execution pack，展开后可看到本地路线的真实执行规则，并用 `主观察`、`高波动备选`、`候选监控` 区分可用程度。
