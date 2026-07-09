# 模拟观察目录

这里存放模拟观察运行包、账本模板和后续真实观察记录。

## 当前产物

- `scripts/build_paper_watch_operations_pack.py`：从已审计 JoinQuant 与 AkShare 证据生成运行包。
- `scripts/audit_independent_sleeve_candidates.py`：审计哪些候选能计入第二个独立模拟观察资金袖，哪些只能监控或等待复核。
- `scripts/build_strategy_maturity_matrix.py`：汇总运行包、独立候选审计和外部复核状态，生成成熟策略推进矩阵。
- `results/paper_watch_operations_pack_20260709.json`：当前模拟观察运行包。
- `results/independent_sleeve_candidate_audit_20260710.json`：独立资金袖候选审计。
- `results/strategy_maturity_matrix_20260710.json`：成熟策略推进矩阵。
- `../_docs/paper-watch-operations-pack-20260709.md`：运行包说明。
- `../_docs/independent-sleeve-candidate-audit-20260710.md`：独立资金袖候选审计说明。
- `../_docs/strategy-maturity-matrix-20260710.md`：成熟策略推进矩阵说明。
- 平台 `data/imported-paper-watch-ledger.json`：用户导入的模拟观察账本记录，未导入前可以不存在。

## 当前状态

- 资金袖数量：2。
- 可开始观察：1，`市场状态切换策略 v1`。
- 暂时阻塞：1，`AkShare本地高低波动切换策略 v1`，原因是尚未导入 JoinQuant 交易可行性复核 JSON。
- 组件监控：`JQ质量利润流动性策略 v1` 当前与切换策略共享高波动组件，不计入第二个独立资金袖。

## 数据边界

运行包只读取已审计结果，不生成纸面收益、净值、成交或持仓。后续模拟观察记录必须来自真实记录或用户导入，不能用模板字段推导收益。

## 导入规则

- 接口：`/paper-watch-api/import-ledger`
- 查看：`/paper-watch-api/ledger`
- CSV 模板：`/paper-watch-api/ledger-template.csv`
- JSON 模板：`/paper-watch-api/ledger-template.json`
- 回填框支持粘贴 JSON 或 CSV，二者使用同一套服务端准入校验。
- `sleeve_id` 必须来自运行包。
- `planned_weight` 必须在 0 到 1 之间。
- 未通过准入门槛的资金袖，例如当前 `akshare_local_switch`，只能导入 `planned_weight=0` 的记录。
