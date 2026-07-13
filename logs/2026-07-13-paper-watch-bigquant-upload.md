# 2026-07-13 准模拟盘策略与 BigQuant 上传修复

## 目标

- 主要打磨已经达到准模拟盘标准的策略，不再扩展新策略。
- 修正 AkShare 本地切换策略已通过交易可行性复核后，仍被矩阵显示为缺准入复核的旧口径。
- 修复 BigQuant 上传脚本中的日期类型问题，避免 `Expected unicode, got BigQuantDate`。
- 保留前端对结果展示、字段解释和折叠表格的体验改进。

## 准模拟盘口径

- 当前计入目标的两条资金袖：
  - `市场状态切换策略 v1` / `jq_controller`
  - `AkShare本地高低波动切换策略 v1` / `akshare_local_switch`
- `核心量价趋势策略 v1` 继续保持 `blocked_by_latest_signal_review`，不计入已准入资金袖。
- 成熟策略矩阵已移除 `akshare_joinquant_review_gap` 残留项。
- 下一步调整为对两条已准入资金袖开始真实模拟观察账本记录。

## 运行包变化

- `akshare_local_switch` 在 JoinQuant 交易可行性复核通过后，初始账本改为：
  - `paper_action=open_allowed`
  - `planned_weight=1.0`
- 全局规则改为：AkShare 本地信号缺 JoinQuant 交易复核时只能 `record_only`；复核通过后可独立记录 `open_allowed`。

## BigQuant 上传修复

- 新增 BigQuant 上传目录：`outputs/paper-watch/bigquant/`。
- 自包含上传脚本：`outputs/paper-watch/bigquant/uploads/mquant_akshare_local_switch_bigquant_upload_only.py`。
- 脚本新增 `bigquant_date_text()`：将 BigQuantDate、datetime、Timestamp 或文本统一转成 `YYYY-MM-DD` 字符串。
- `start_date`、`end_date`、输入表 `date` 和 `signal_date` 均强制使用普通字符串，降低 BigQuant 模块缓存和参数校验失败风险。

## 校验

- `python3 -m py_compile outputs/paper-watch/scripts/build_paper_watch_operations_pack.py outputs/paper-watch/scripts/audit_independent_sleeve_candidates.py outputs/paper-watch/scripts/build_strategy_maturity_matrix.py`
- `python3 -m py_compile outputs/paper-watch/bigquant/uploads/mquant_akshare_local_switch_bigquant_upload_only.py outputs/paper-watch/bigquant/scripts/bigquant_akshare_local_switch_latest_signal.py outputs/paper-watch/bigquant/scripts/bigquant_jq_controller_regime_switch.py`
- `node --check platform/quant-factor-platform/server.mjs`

## 边界

- 本次不生成任何 BigQuant 收益、净值、成交、持仓或通过结论。
- BigQuant 目录只提供上传、测试和回填模板；真实结果必须由外部平台实际跑出后再导入。
- 准模拟盘仍是观察账本阶段，不等同于实盘建议。
