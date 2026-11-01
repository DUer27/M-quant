# A 股/ETF Paper Execution

这是一个**仅 Paper、仅 Python 标准库**的 A 股/ETF 执行框架。它读取 M-quant 生成的版本化 JSON 信号，使用本地价格快照模拟成交；M-quant 只生成 JSON，不调用本框架、更不连接券商。LIVE 模式会明确拒绝，未来 Gateway/REST 仅预留边界，未实现；示例不代表真实业绩。

## 运行

```bash
cd execution/a_share_paper
python -m a_share_paper demo --data-dir ./runtime
python -m a_share_paper status --data-dir ./runtime
./run_checks.sh
```

数据目录由参数指定，默认 CLI 使用当前项目下 `.a_share_paper`，不会写入绝对固定路径。信号可放入 `runtime/signals/`，行情快照放入 `runtime/quotes.json`。

## 许可证

新代码采用 MIT，见 `NOTICE.md`。借鉴 VeighNa/vn.py 在 MIT 下的接口分层思想但未复制代码。Paper 模拟不是实盘，不构成投资建议。
