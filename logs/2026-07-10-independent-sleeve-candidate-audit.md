# 2026-07-10 独立资金袖候选审计

## 做了什么

- 新增 `outputs/paper-watch/scripts/audit_independent_sleeve_candidates.py`。
- 生成：
  - `outputs/paper-watch/results/independent_sleeve_candidate_audit_20260710.json`
  - `outputs/_docs/independent-sleeve-candidate-audit-20260710.md`
- 成熟策略推进矩阵接入独立候选审计：
  - `outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
  - `outputs/paper-watch/results/strategy_maturity_matrix_20260710.json`
- 平台 `模拟观察清单` 的成熟矩阵明细中新增折叠项：
  - `独立资金袖候选：1 个准入，13 个阻塞`
- `刷新派生包` 链路新增独立候选审计脚本。
- `index.html` 为 `assets/app.js` 增加版本参数，避免浏览器缓存旧前端。

## 当前真实结论

- 两条成熟可模拟策略目标尚未满足：`1 / 2`。
- 已准入独立资金袖：
  - `市场状态切换策略 v1`
- 未计入第二资金袖的关键原因：
  - `JQ质量利润流动性策略 v1` 是切换控制器的高波动组件，不能重复满仓计入独立策略。
  - `AkShare本地高低波动切换策略 v1` 虽有本地 OHLCV 稳健性证据，但缺 JoinQuant 最新信号交易可行性复核 JSON。
  - 多条 JoinQuant 分层路线已经通过历史门槛，但仍需证明与主控制器的组件、日期、持仓和市场状态不重叠。

## 验证

- `node --check platform/quant-factor-platform/assets/app.js`
- `node --check platform/quant-factor-platform/server.mjs`
- `python3 -m py_compile outputs/paper-watch/scripts/audit_independent_sleeve_candidates.py outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
- `git diff --check`
- 浏览器验收：
  - 本地服务：`http://127.0.0.1:5573`
  - 成熟矩阵显示 `1 / 2`
  - DOM 中确认存在 `独立资金袖候选：1 个准入，13 个阻塞`

## 数据边界

本次只读取既有 JoinQuant 策略审计、AkShare 本地 OHLCV 审计、模拟观察运行包和用户导入复核文件。不生成收益、净值、成交、持仓、交易可行性或模拟盘结果。
