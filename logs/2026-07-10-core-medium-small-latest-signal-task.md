# 2026-07-10 核心量价中波动小市值最新信号任务包

## 做了什么

- 新增 JoinQuant 最新信号复核脚本：
  - `outputs/sources/joinquant/scripts/m_quant_core_medium_small_latest_signal_review_20260710.py`
- 新增晋级任务包生成脚本：
  - `outputs/paper-watch/scripts/build_core_medium_small_promotion_task_pack.py`
- 生成任务包：
  - `outputs/paper-watch/results/core_medium_small_promotion_task_pack_20260710.json`
  - `outputs/_docs/core-medium-small-promotion-task-pack-20260710.md`
- 平台新增下载端点：
  - `/strategy-api/joinquant-core-medium-small-latest-signal-review.py`
- 模拟观察清单新增任务卡片：
  - `核心量价中波动小市值晋级复核`

## 脚本复核内容

JoinQuant 脚本只做最新信号复核：

- 读取沪深300最新成分股。
- 用真实 OHLCV 重建核心量价因子：
  - `technical_composite`
  - `trend_alignment`
  - `volume_price_confirmation`
  - `crowding_risk`
  - `volume_price_divergence_risk`
  - `trend_extension_risk`
- 用沪深300 20日滚动年化波动率和滚动分位判断最新市场状态。
- 用 `valuation.market_cap` 做大/中/小市值分层。
- 只保留 `small_cap` 且通过核心量价入池条件的候选。
- 输出 top 30 候选、候选数量、市场状态、通过/不通过决策。

## 通过门槛

任务包要求：

- `source = joinquant_core_medium_small_latest_signal_review`
- `decision = promotion_signal_ready`
- `market_regime = medium_volatility`
- `target_market_cap_bucket = small_cap`
- `selected_count >= 10`

通过这些门槛以后，下一步才是把它写入模拟观察运行包。通过前，成熟策略目标仍是 `1 / 2`。

## 验证

- `python3 -m py_compile outputs/sources/joinquant/scripts/m_quant_core_medium_small_latest_signal_review_20260710.py outputs/paper-watch/scripts/build_core_medium_small_promotion_task_pack.py`
- `node --check platform/quant-factor-platform/assets/app.js`
- `node --check platform/quant-factor-platform/server.mjs`
- `/strategy-api/paper-watch-routes` 已返回 `coreMediumSmallPromotionTaskPack`
- `/strategy-api/joinquant-core-medium-small-latest-signal-review.py` 已能下载脚本

## 数据边界

本次不生成任何收益、净值、成交、持仓、交易可行性或模拟盘结果。脚本必须在 JoinQuant 研究环境运行后，才会产生真实最新信号 JSON。
