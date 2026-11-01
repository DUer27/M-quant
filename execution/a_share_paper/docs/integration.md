# 集成说明

M-quant 的职责是生成 `schema_version=1.0` 的 JSON 信号并写入指定目录；它不导入 `a_share_paper`，不保存 API key，不调用券商。Paper 服务从 `signals/*.json` 读取，价格来自信号中的 `price` 或数据目录 `quotes.json`，然后经过 schema、交易规则和风控检查。

信号至少包含 `signal_id`、`symbol`、`side`、`quantity`（或 `target_weight`）、`asset_type`、`schema_version`。服务的 `process_one`、`process_pending`、`snapshot` 是未来 REST/Gateway 的边界，但当前不启动网络和后台任务，Gateway 尚未实现。

默认股票和 ETF 最小单位均为 100（ETF 可通过 `TradingRules(etf_lot=...)` 配置）；卖出要求可用持仓，停牌和 T+1 都提供接口。所有成交、拒单和原因写入状态 JSON 的 ledger。示例行情/信号仅用于测试，不代表真实业绩。
