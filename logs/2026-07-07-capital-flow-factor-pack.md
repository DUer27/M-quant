# 2026-07-07 资金流因子包

## 本次升级

- 使用用户提供的 3 个 Yiwan 日期包构建真实资金流因子：
  - `2026-07-01`
  - `2026-07-02`
  - `2026-07-03`
- 新增脚本 `tools/build_yiwan_capital_factors.py`，从以下真实板块提取字段：
  - `main_force_by_date`
  - `active_ap_stock_by_date`
  - `big_ap_by_date`
  - `big_market_daily_by_date`
- 输出独立资金因子包：
  - `outputs/capital-flow-factors/yiwan-capital-factor-results.json`
  - `outputs/capital-flow-factors/yiwan-capital-factor-results.csv`
  - `outputs/capital-flow-factors/yiwan-capital-factor-summary.json`

## 新增因子

- `capital_follow_signal`：资金跟随信号。
- `active_ap_accumulation`：活跃暗盘吸筹。
- `main_force_alignment`：主力一致性。
- `institutional_contra_divergence`：主反向背离。
- `capital_overheat_risk`：资金过热风险。
- `capital_persistence_2d`：2日资金持续性。
- `market_capital_regime`：市场资金状态，市场级因子，不作为个股选股因子直接导出。

## 当前真实覆盖

- 个股资金因子行数：1239。
- 个股资金因子日期：`2026-07-01`、`2026-07-02`。
- 覆盖股票：1040 只。
- 市场资金状态日期：`2026-07-01`、`2026-07-02`、`2026-07-03`。
- `2026-07-03` 日期包没有个股资金行，因此只用于市场资金状态。

## 平台接入

- 因子库接入资金因子可用状态和字段说明。
- 研究流水线接入资金因子研究状态、数据缺口和下一步动作。
- 回测中心支持导出个股资金因子 CSV 到 JoinQuant 复测：
  - `capital_follow_signal`
  - `active_ap_accumulation`
  - `main_force_alignment`
  - `institutional_contra_divergence`
  - `capital_overheat_risk`
  - `capital_persistence_2d`

## 数据口径

- 本次只使用用户提供日期包中的真实行和真实字段。
- 未生成任何未来收益、IC、RankIC、RankIC t、胜率、年化收益或策略有效性结论。
- 数字列含义按同批页面结构和字段位置解释，已在摘要中标记为资金研究因子，后续必须经过 JoinQuant 实测验证。
- 新资金因子当前状态为已构建/待实测，不进入 `实测结果`，直到有真实回填结果。

## 验证

- `python3 -m py_compile work/build_yiwan_capital_factors.py` 通过。
- `node --check server.mjs` 通过。
- `node --check assets/app.js` 通过。
- `GET /factor-api/real-factor-summary` 返回资金因子可用状态。
- `GET /research-api/pipeline` 返回资金因子研究状态。
- `GET /backtest-api/joinquant-factor-export.csv?factor=capital_follow_signal` 返回 1239 行个股资金因子。
