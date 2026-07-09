# 模拟观察目录

这里存放模拟观察运行包、账本模板和后续真实观察记录。

## 当前产物

- `scripts/build_paper_watch_operations_pack.py`：从已审计 JoinQuant 与 AkShare 证据生成运行包。
- `results/paper_watch_operations_pack_20260709.json`：当前模拟观察运行包。
- `../_docs/paper-watch-operations-pack-20260709.md`：运行包说明。
- 平台 `data/imported-paper-watch-ledger.json`：用户导入的模拟观察账本记录，未导入前可以不存在。

## 当前状态

- 资金袖数量：2。
- 可开始观察：1，`市场状态切换策略 v1`。
- 暂时阻塞：1，`AkShare本地高低波动切换策略 v1`，原因是尚未导入 JoinQuant 交易可行性复核 JSON。

## 数据边界

运行包只读取已审计结果，不生成纸面收益、净值、成交或持仓。后续模拟观察记录必须来自真实记录或用户导入，不能用模板字段推导收益。

## 导入规则

- 接口：`/paper-watch-api/import-ledger`
- 查看：`/paper-watch-api/ledger`
- `sleeve_id` 必须来自运行包。
- `planned_weight` 必须在 0 到 1 之间。
- 未通过准入门槛的资金袖，例如当前 `akshare_local_switch`，只能导入 `planned_weight=0` 的记录。
