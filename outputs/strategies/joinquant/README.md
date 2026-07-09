# JoinQuant 策略实测目录

本目录只保存 JoinQuant 真实跑出的策略回测结果、策略分层结果和对应脚本输出。

建议命名：

```text
strategy_<策略ID>_<分层口径>_<起始日期>_<结束日期>.json
strategy_<策略ID>_<分层口径>_<起始日期>_<结束日期>.csv
```

示例：

```text
strategy_core_volume_trend_v1_large_cap_high_vol_20240101_20260701.json
```

不要把策略草案、模拟展示数据、未跑通的临时结果放进这里。草案可以继续留在平台数据或日志中，真实回测结果再进入本目录。

## 当前审计产物

- `audit_strategy_maturity.py`：读取已导入的 JoinQuant 真实策略结果，审计整策略和受控分层路线成熟度。
- `strategy_maturity_audit_20260709.json`：策略成熟度审计结果。
- `paper_watch_routes_20260709.json`：首批受控模拟观察路线配置。
- `build_paper_watch_execution_pack.py`：从首批路线生成模拟观察执行包。
- `paper_watch_execution_pack_20260709.json`：模拟观察执行包，包含开仓边界、暂停规则和每日观察字段。

当前首批只允许两条路线进入模拟观察：

- `K线辅助确认策略`：仅低波动/大市值。
- `JQ质量利润流动性策略 v1`：仅高波动/中市值。

这些配置不是整策略放开，未通过的波动层、市值层不得在模拟盘中扩展使用。
