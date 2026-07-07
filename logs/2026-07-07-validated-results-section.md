# 2026-07-07 实测结果独立板块

## 本次升级

- 左侧导航新增 `实测结果`。
- 将 `JoinQuant 实测结果` 从 `回测中心` 中拆出，形成独立页面。
- `回测中心` 现在聚焦复测流程、导出 CSV、导入结果。
- `实测结果` 页面聚焦已经跑出来的 JoinQuant 结果：
  - 结果记录数
  - 覆盖因子数
  - 历史样本结果数
  - 最佳周期
  - RankIC / RankIC t / 多空收益 / 正向占比明细
- 明细表加入固定高度滚动容器，避免页面被 29 条结果撑得过长。

## 验证

- `node --check assets/app.js` 通过。
- 本地页面已返回 `validated-results-view`。
- 本地脚本已返回 `validatedResultCount` 与 `validatedBestHorizon` 渲染逻辑。
