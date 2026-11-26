# M-quant `signal.v1` 模拟盘信号合同

## 目的

M-quant 只负责研究、策略状态和目标组合导出；独立的 `mquant-execution` 只消费这个合同，不读取 M-quant 内部文件、数据库或代码。

该合同描述的是**目标持仓信号**，不是实盘订单，也不包含未来收益或未经验证的业绩结论。

## 导出入口

平台运行后可通过以下接口下载当前策略的模拟盘信号：

```text
GET /strategy-api/paper-signal-export.json?strategy=<strategy_id>
GET /strategy-api/paper-signal-export.csv?strategy=<strategy_id>
GET /strategy-api/paper-signal-export.zip?strategy=<strategy_id>
```

ZIP 包包含：

- `signal.json`：模拟盘导入文件；
- `portfolio.csv`：便于人工复核的目标组合；
- `signal-contract.md`：本合同说明。

## JSON 结构

```json
{
  "schema_version": "signal.v1",
  "signal_id": "sha256-derived-id",
  "strategy_id": "strategy-id",
  "strategy_version": "m-quant-route-v1",
  "sleeve_id": "sleeve-id",
  "generated_at": "2026-09-20T08:00:00Z",
  "signal_date": "2026-09-19",
  "effective_at": "2026-09-20T09:30:00+08:00",
  "expires_at": "2026-09-20T15:00:00+08:00",
  "action": "TARGET_PORTFOLIO",
  "gate_status": "ready_controlled_paper_watch",
  "planned_weight": "1.0",
  "cash_target_weight": "0.0",
  "portfolio": [
    {
      "symbol": "000001",
      "asset_type": "stock",
      "target_weight": "0.1",
      "target_quantity": null,
      "rank": 1
    }
  ],
  "provenance": {
    "source": "M-quant",
    "data_policy": "...",
    "source_date": "2026-09-19",
    "run_id": "..."
  },
  "metadata": {}
}
```

## 规则

1. `schema_version` 必须为 `signal.v1`。
2. `signal_id` 由策略 ID、信号日、袖 ID 和规范化目标组合确定性生成；重复下载或导入不能重复交易。
3. `portfolio` 中标的不能重复，代码统一为六位字符串，目标权重必须为非负数字。
4. 目标持仓权重与现金权重之和不得超过 1；目标数量为空时由模拟盘按照账户权益、行情和整手规则计算。
5. 当前平台只有 `selected_codes` 时，按 `planned_weight / selected_count` 等权生成目标组合；整手取整产生的差额保留为现金。
6. 控制器、阻断策略、没有信号日、没有可审计选股名单或未通过准入的策略导出为 `RECORD_ONLY`，模拟盘只记录不下单；此类记录信号的 `expires_at` 可以为 `null`，避免历史审计记录因时间过期而无法导入。
7. `provenance.data_policy` 必须说明数据来源和限制；不写入未来收益、回测收益或未验证业绩。
8. 对 `TARGET_PORTFOLIO`，过期信号必须被模拟盘拒绝；`effective_at` 用于决定模拟成交时点，`expires_at` 用于防止旧信号误执行。

## CSV 字段

`signal_id,strategy_id,signal_date,symbol,asset_type,target_weight,target_quantity,rank,gate_status,action`

CSV 只用于人工检查；正式导入以 JSON 或 ZIP 内的 `signal.json` 为准。

## 诚实性边界

- `TARGET_PORTFOLIO` 只表示策略当时希望达到的组合，不保证能成交。
- 模拟盘根据自己的行情、费用、滑点、流动性、T+1 和资金状态决定实际订单。
- 当前导出为本地研究平台生成的信号，不等于券商实盘指令。
