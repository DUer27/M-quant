# 2026-07-10 成熟策略推进矩阵

## 目标

- 围绕“至少两个完整回测过、可进入模拟观察的成熟策略”建立可审计的推进矩阵。
- 只读取项目内已落地的真实证据，不生成收益、净值、成交、持仓或交易可行性结论。

## 新增文件

- `outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
- `outputs/paper-watch/results/strategy_maturity_matrix_20260710.json`
- `outputs/_docs/strategy-maturity-matrix-20260710.md`

## 当前结论

- 当前目标状态：`not_met`。
- 可计入目标的独立模拟观察资金袖：1 条。
- 目标：2 条。
- 当前可观察：`市场状态切换策略 v1`。
- 当前阻塞：`AkShare本地高低波动切换策略 v1` 仍缺 JoinQuant 最新信号交易可行性复核 JSON。

## 平台接入

- `/strategy-api/paper-watch-routes` 已并入 `maturityMatrix` 字段。
- 新增 `/strategy-api/strategy-maturity-matrix` 独立只读接口。
- `模拟观察清单` 新增折叠式“成熟策略推进矩阵”，展示目标进度、阻塞项、策略分类、是否计入两策略目标、收益/回撤/Sharpe 与下一步。

## 数据边界

- JoinQuant 侧只读取已导入真实策略交易回测、成熟度审计、独立性审计和运行包。
- AkShare 侧只读取本地真实 OHLCV 切换策略、稳健性审计和待复核状态。
- 未导入 JoinQuant 交易可行性复核前，AkShare 本地策略只能显示为准入阻塞，不能计入第二条成熟策略。
