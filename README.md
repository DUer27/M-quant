# M-quant

量化因子策略研究与本地原型备份仓库。

## 当前版本：v0.2.0 · 数据采集中心

2026-11-27：新增独立数据采集中心、50股报价/分钟分流、股票管理库、日线历史准备与补采诊断、后台守护、日内K线与精简周月图、缩放平移及质量记录。完整功能、验证和秒级行情剩余工作见[本版发布说明](docs/releases/v0.2.0-data-collection.md)。

当前报价目标15秒、分钟目标60秒，实际频率及数据时效须看运行记录；分钟闭合规则仍未确认，正式分钟策略输入继续阻断。尚未接入订阅秒级行情。行情缓存、运行库、日志和本机凭据保留在本地，不随代码上传。

本次同步内容来自 Codex 工作区：

- `platform/quant-factor-platform/`：本地量化因子策略平台原型，默认服务端口 `5555`。
- `tools/build_yiwan_research_factors.py`：真实数据因子流水线，支持 CSV、完整 research pack、分批 batch JSON。
- `tools/yiwan-safe-batch-collector-console.txt`：低频防断分批采集脚本，每批落盘，避免中途 502 后白跑。
- `tools/yiwan-research-collector-console.txt`：早期完整采集脚本。
- `outputs/research-factor-pipeline/`：当前真实数据跑出的因子结果与摘要。
- `outputs/real-factors/`：早期单日 CSV 真实截面因子结果。
- `logs/`：工作日志和数据口径说明。
- `UPGRADE_LOG.md`：按 git commit 汇总的升级总账，优先看这个文件了解每次改了什么。

## 当前原则

所有因子研究必须依靠真实采集数据。没有未来收益标签时，不输出 IC、胜率、年化收益、Top 组合表现等验证结论。

当前可以真实计算：

- 专业版技术综合强度因子
- 专业版趋势排列因子
- 专业版量价确认因子
- 专业版 KDJ 动能因子
- 专业版 MACD 动能因子
- 专业版筹码健康因子
- 专业版日内强度因子
- 专业版拥挤风险因子
- 解释性子因子：收盘位置、K线实体质量、上影压力、爆量风险、筹码拥挤风险
- 华福证券 PDF 单根 K 线子集评分

当前暂不能完整验证：

- 价量共振情绪因子：需要每只股票至少 240 个交易日成交量。
- 低情绪反向因子：依赖价量共振有效值。
- 情绪系数加权 K 线因子：依赖价量共振和 K 线评分。
- IC、分组收益、胜率、年化收益：需要未来收益标签或多期价格序列。

## 运行平台

每日行情更新现已提供独立后台任务，默认更新核心50股票池，并生成仅记录的观察信号。配置、数据边界、Windows定时运行和后续分钟/秒级路线见 [日线自动更新说明](docs/market-data-updates.md)。

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
