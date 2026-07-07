# M-quant

量化因子策略研究与本地原型备份仓库。

本次同步内容来自 Codex 工作区：

- `platform/quant-factor-platform/`：本地量化因子策略平台原型，默认服务端口 `5555`。
- `tools/build_yiwan_research_factors.py`：真实数据因子流水线，支持 CSV、完整 research pack、分批 batch JSON。
- `tools/yiwan-safe-batch-collector-console.txt`：低频防断分批采集脚本，每批落盘，避免中途 502 后白跑。
- `tools/yiwan-research-collector-console.txt`：早期完整采集脚本。
- `outputs/research-factor-pipeline/`：当前真实数据跑出的因子结果与摘要。
- `outputs/real-factors/`：早期单日 CSV 真实截面因子结果。
- `logs/`：工作日志和数据口径说明。

## 当前原则

所有因子研究必须依靠真实采集数据。没有未来收益标签时，不输出 IC、胜率、年化收益、Top 组合表现等验证结论。

当前可以真实计算：

- 技术综合强度因子
- 趋势排列因子
- 量价确认因子
- KDJ 动能因子
- MACD 动能因子
- 筹码健康因子
- 拥挤风险因子
- 华福证券 PDF 单根 K 线子集评分

当前暂不能完整验证：

- 价量共振情绪因子：需要每只股票至少 240 个交易日成交量。
- 低情绪反向因子：依赖价量共振有效值。
- 情绪系数加权 K 线因子：依赖价量共振和 K 线评分。
- IC、分组收益、胜率、年化收益：需要未来收益标签或多期价格序列。

## 运行平台

```bash
cd platform/quant-factor-platform
PORT=5555 node server.mjs
```

打开：

```text
http://127.0.0.1:5555
```

## 跑因子

单个 CSV、完整 pack、或 batch JSON 都可以：

```bash
python3 tools/build_yiwan_research_factors.py --input /path/to/yiwan-batch-or-pack.json
```

默认输出到：

```text
outputs/research-factor-pipeline/
```

## 分批采集

在 Safari 登录网站后，把 `tools/yiwan-safe-batch-collector-console.txt` 全文粘贴进 Console。

初始化：

```js
YiwanSafeBatchCollector.init({ maxDates: 20 })
```

每次跑一小步：

```js
YiwanSafeBatchCollector.collectTinyStep({
  delayMs: 2500,
  pagesPerRun: 2,
  maxIndicatorPages: 20,
  datesPerRun: 1,
  maxPages: 10
})
```

每跑完一步都会下载一个 `yiwan-batch-*.json`，中途失败不影响已经下载的数据。
