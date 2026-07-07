# 2026-07-07 复测结果呈现升级

## 本次升级

- 在回测中心新增 `JoinQuant 实测结果` 独立板块。
- 展示真实导入结果数量、历史样本结果数量、最佳 RankIC、最佳多空收益。
- 新增结果明细表，列出：
  - 因子
  - 周期
  - 方向
  - 样本
  - RankIC
  - RankIC t
  - 多空收益
  - 正向占比
  - 来源
  - 判断
- 结果判断只基于导入的真实 JoinQuant 结果，不生成估算收益。
- 单日截面结果会标记为 `跟踪中`，避免被误认为长期验证结论。

## 验证

- `node --check assets/app.js` 通过。
- `node --check server.mjs` 通过。
- `imported-backtest-results.json` JSON 校验通过。
- 本地服务 `http://127.0.0.1:5558` 已返回新增页面节点。
- `/backtest-api/research-status` 返回 `importedResultCount = 29`。
