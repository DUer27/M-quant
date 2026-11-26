# M-quant 完善计划

> 生成日期：2026-09-20  
> 依据：仓库现状审计（数据/因子、平台、策略与模拟盘、工程卫生 四路并行）  
> 原则：只基于仓库真实能力与缺口；不把未验证收益包装成已验证结论。

本文是后续实施的总图。根 `README.md` 仍停留在 2026-07-07 的 Yiwan 采集原型，实际仓库已经长成「本地研究台 + JoinQuant 证据门禁 + 模拟观察 + 建仓压力测试」。完善时以本文为准，不以过期 README 为准。

---

## 0. 先看清现在是什么

M-quant 不是一个已经能自动交易的系统，而是一套 **本地优先、证据诚实** 的 A 股研究工作台：

| 层 | 实际角色 | 现状 |
|---|---|---|
| 本地平台 | 浏览、门禁、导入、压力测试控制台 | `platform/quant-factor-platform/`，零依赖 Node 单体，端口 5555 |
| Yiwan | 早期截面因子原型 | 仅 2026-07-06 一页 600 行；Safari Console 采集 |
| AkShare/东财 | 本地 OHLCV 仓库与候选挖掘 | ~5581 只、375 交易日；脚本在 `outputs/sources/akshare/` |
| JoinQuant | **正式证据源** | 研究环境实跑 JSON 回填；本地没有 JQ 行情仓 |
| 模拟观察 | 资金袖准入与账本 | 2 条袖已准入，但账本几乎没有真实盈亏 |
| 建仓压力 | 容量/冲击/约束成交实验室 | CSI500 LCR 本地代理压测可用，不能当正式业绩 |

仓库最大的优点不是因子数量，而是已经写进制度的诚实性：

1. 没有未来收益标签，不算 IC / 胜率 / 年化 / 回撤。
2. summary 不能当明细。
3. 短历史不能冒充长历史。
4. 研报结论只能当逻辑来源。
5. 本地 AkShare 结果不能直接等同正式策略回测；正式回测只认 JoinQuant。

这些规则必须保留。完善计划的目标是：**把诚实性从“靠人记住”变成“靠结构和自动化守住”，同时把研究循环从手工粘贴变成可复跑。**

---

## 1. 当前能力快照（2026-09 分支）

分支：`codex-csi500-lcr-paper-candidate`（落后 origin 1 个提交，工作区有未提交平台改动）。

### 1.1 已经做对的事

- 因子库能区分「已计算 / 缺历史 / 等待源字段」，而不是把假 IC 填满页面。
- 策略晋级有分层：事件收益 → 波动×市值交叉 → 含成本交易回测 → 最新信号复核 → 资金袖独立性。
- 两条独立资金袖已准入：
  - `市场状态切换策略 v1`（JoinQuant，+83.29% / -9.07% / Sharpe 1.80）
  - `AkShare 本地高低波动切换策略 v1`（本地证据 + JQ 可交易复核通过）
- CSI500 低拥挤反转（LCR v1）已有 JoinQuant 真实调仓回测，但还没进模拟观察资金袖。
- 建仓压力测试能跑本地成交额约束、成本、滑点、资金档位扫描。
- 结构化反转有完整研报落地方案和 88 个 JoinQuant 批次脚本生成器。

### 1.2 必须正视的短板

1. **三套管线互不相通。** Yiwan 截面、AkShare OHLCV、JoinQuant 证据各自一套公式、一套股票池、一套结果文件。同名因子（如 `technical_composite`）在 Yiwan 和 JQ 里不是同一件事。
2. **平台会“表演”。** 总览净值是正弦波 mock；`POST /backtest-api/run` 不是回测；已验证因子数硬编码为 0；风控/配置导航是死按钮。诚实门禁和假仪表盘并存。
3. **研究循环是人肉。** JoinQuant：生成脚本 → 粘贴研究环境 → 复制 JSON → 回填。Yiwan：Safari 登录 → Console 粘贴采集器。结构化反转 88 个 runner 已生成，inbox 是空的。
4. **模拟观察停在“准入”，没有开始观察。** 账本 `period_return` 为 null；历史回测 +83% / +174% 被页面反复看见，容易误当成实盘观察成绩。
5. **工程不可克隆。** 仓库 8.5G（git 5.5G）；5581 只个股 CSV 进了 git；无 `requirements.txt` / 测试 / CI；Python 路径写死 Codex runtime；`build_yiwan_*` 还指向旧工作区或桌面路径。
6. **A 股交易真实性不完整。** 涨跌停成交、T+1、停牌、行业暴露、非线性冲击、指数真实权重，在本地压测里大多是日线收盘 ±5bp 的近似。
7. **文档三套互相打架。** `README`（07-07）、`logs/`（到 07-15）、`outputs/_docs/`（到 07-24）、`UPGRADE_LOG`（停在 07-10）。成熟度矩阵 07-13 已 `2/2`，paper-watch README 仍写 AkShare 阻塞。

### 1.3 策略成熟度（以 2026-07-13 矩阵为准）

| 策略 | 角色 | 状态 | 下一步 |
|---|---|---|---|
| 市场状态切换 v1 | 独立资金袖 | 可观察 | **开始真实账本**，不要继续只看历史回测 |
| AkShare 高低波动切换 v1 | 独立资金袖 | 矩阵已准入，账本权重仍为 0 | 决定权重；样本外观察 |
| 核心量价趋势 v1 / 中波动小市值 | 互斥候选 | 最新信号未过门：高波动、入选 7&lt;10 | 禁止晋级 |
| CSI500 LCR v1 | JQ 真实调仓候选 | 超额好，但未进资金袖 | 独立性检查 + 容量冻结后才能进观察 |
| CSI500 LCR v2 / v2.1 | 本地压测实验 | 代理收益 | 禁止当正式业绩 |
| 长江结构化反转 v1 | 高频因子候选 | 10 分钟切片未回填 | 先跑门禁或明确放弃 |
| 质量利润流动性 / K 线辅助 / 资金跟随 | 组件或偏弱 | 重叠或全样本失败 | 不重复算成独立策略 |
| 6 条 AkShare 本地候选 | 本地挖掘 | 等 JQ 口径复核 | 即使通过也不自动变成新资金袖 |

全策略硬门槛（样本日 ≥100、12 个交叉格子等）当前 **0 条** 通过。现有“成熟”只是 **分层路线 + 资金袖独立性**，不是全市场全周期有效。

---

## 2. 目标架构（保留诚实，改形状）

不要迁 Vben，也不要先上券商接口。目标是一个人能复跑的本地研究栈：

```text
src/
  data/        东财/AkShare 拉取、日历、前复权、parquet
  factors/     纯函数 + schema；Yiwan / JQ 公式分版本
  backtest/    事件 / 分层 / 交易模拟（成本、涨跌停、容量）
  validate/    JoinQuant 适配：jqdatasdk 或 inbox 导入
  platform/    薄 API，只读产物 + 门禁，不自己编收益
data/          gitignore 的 parquet/manifest；少量 golden 可用 LFS
docs/          STATUS + 诚实性 + 运行手册
outputs/       产物，不放源码
```

数据职责：

- **OHLCV 源 of record：** 本地缓存（已有 ~375 日）。改成按日或按股票池 parquet，而不是 5581 个 git blob。
- **指数成分、市值、换手、资金流、分钟线：** JoinQuant。有权限走 jqdatasdk；否则 notebook → `inbox/` → schema 校验导入。粘贴不应是 happy path。
- **Yiwan：** 可选 overlay（筹码/页面指标），不再当研究主干。
- **平台：** 查看器 / 导入器 / 门禁，不当第二套回测引擎。Mock 要么删除，要么打上 DEMO。

---

## 3. 分阶段计划

优先级定义：

- **P0**：继续错下去会污染结论、撑爆仓库、或让第二个人无法运行。
- **P1**：让现有两条资金袖和 LCR 真正进入可观察研究循环。
- **P2**：产品化、自动化、更完整的 A 股微观结构。

工期按单人兼职估算。阶段之间有依赖，不要并行把所有 P0 铺开。

---

### 阶段 A — 止血与对齐（约 1 周，全是 P0）

目标：仓库可克隆、页面不撒谎、文档与矩阵一致。此阶段 **不发明新策略**。

#### A1. 仓库卫生

- 确认 `.env.joinquant` 从未进 git（当前是忽略的）。若账号密码曾出现在 shell/聊天，轮换。
- 扩大 `.gitignore`：
  - `outputs/sources/akshare/raw/`
  - 大块 `processed/*.csv`、`*_daily.csv`、xlsx
  - `notebook_batches/` 生成物
  - 可选：`logs/` 过程稿
- 保留：脚本、紧凑 JSON 摘要、`docs/`、平台代码。
- 不要把当前分支直接合进 `main`，直到大数据剥离或 LFS 重写完成。`main` 已经更小且分叉。
- 先 `git pull`（落后 1 提交），再决定未提交的 4 个平台文件去留。

#### A2. 可运行性

- 增加 `pyproject.toml` + `requirements.txt`：`pandas`、`numpy`、`akshare`、`openpyxl`，JoinQuant 相关标成 extra。
- 去掉文档和 `server.mjs` 里写死的 `/Users/Admin/.cache/codex-runtimes/...`，只认 `PYTHON` / `python3`。
- 修正 `tools/build_yiwan_*.py` 的 ROOT / Desktop 路径，全部改为仓库相对路径。资金流日期包若不在 `data/`，标记为不可复现，而不是假装能重跑。
- 前复权增量策略：东财 qfq 会改写历史，禁止只按“最后一天 append”。每次增量至少回拉一段 lookback，或定期全量刷新。

#### A3. 平台诚实性

- 删除或隔离总览正弦波净值和 `POST /backtest-api/run`。有真实压力测试/导入交易净值时才画图，并带 `dataPolicy` 徽章。
- 因子库：估算 IC 不得显示为已验证；缺字段填 0.5 改为 NA + `unavailable`。
- 风控监控接到已有 `GET /api/risk`（覆盖率风险）；系统配置接到 preferences。不要再指回 dashboard。
- 启动时不要 `Promise.all` 拉全部 14 个接口（含 2.5MB 回测 JSON）。按页面懒加载。

#### A4. 文档单一真相

- 重写根 `README.md`：当前栈地图、如何启动、数据原则、三条数据源边界、两条资金袖状态。
- 新增 `docs/STATUS.md`（可由成熟度矩阵脚本生成），替代互相复制的 logs / `_docs` 结论段。
- 补 `UPGRADE_LOG.md` 2026-07-10 之后的 LCR / 压力测试 / 结构化反转工作。
- 对齐窗口口径：375 日 vs README 里过期的 370 日。

**阶段 A 完成标准**

- 新克隆：`pip install -r requirements.txt && cd platform/quant-factor-platform && npm start` 能打开，且总览不再显示假净值。
- `git status` 不再鼓励提交 raw CSV。
- README 能让陌生人在 10 分钟内知道：什么是正式证据、什么只是本地实验。

---

### 阶段 B — 让研究循环可复跑（约 2–3 周，P0/P1）

目标：OHLCV、因子、回测、导入成为带 schema 的流水线，而不是散落脚本。

#### B1. 数据层

- 研究默认股票池改为 **PIT 可交易池**（`available_pool` + 当日上市/停牌标记）。`full_375` 只用于压力测试覆盖率门禁，不当回测宇宙（幸存者偏差）。
- ST / 退市用交易所状态，而不是名称正则 `ST|退`。
- AkShare 合并文件改为 parquet（按日分区或按股票池）。审计文件名参数化，停止写死 `*_20260723`。
- 缺失成交额的腾讯源行，不得进入用成交额排名的因子。
- Yiwan：要么把资金流原始 JSON 收进 `data/raw/yiwan/`，要么降级为历史快照，不再参与新研究。

#### B2. 因子层

- 公式版本化：`technical_composite_yiwan` vs `technical_composite_jq`，平台禁止混用证据。
- 缺 KDJ/MACD/筹码时，`technical_composite` 降级或拒绝计算，而不是用 0.5 中性填充。
- 在 375 日 OHLCV 上实现 `volume_price_resonance_60_5`（历史长度已够），只输出因子值，不引用华福 PDF 业绩。
- 黑名单：`tomo_*`、`is_buy`、`ptomo_*` 永远不能当特征。
- 最小测试：因子公式边界、NA 处理、禁止无未来收益输出 IC。

#### B3. JoinQuant 适配

- 脚本生成器从 `server.mjs` 内嵌大字符串抽到 `src/validate/jq_templates/`。
- `inbox/` 监视器：放下 JSON 即 schema 校验导入，替代回测中心大文本框作为主路径。
- 统一结果 schema：`source`、`result_type`、`strategy_id`、`horizon`、`data_policy`、样本字段。现有导入校验已经有好传统，要覆盖全部新结果类型。
- 补齐制度要求的 **1 日** 事件/交易格子。当前多数包只有 5/10/20 日；LCR 的 1 日在成本后超额为负，必须显式保留，不能因为难看就不上报。

#### B4. 本地交易模拟（仍不是正式业绩）

- 把 `position_stress_lab.py` 的成本、T+1、涨跌停、停牌、5% ADV 约束抽成可复用 backtest 内核。
- 增加非线性冲击档（3%/5%/10% ADV 额外滑点）和多日未成交。
- 输出必须带 `dataPolicy=local_ohlcv_proxy`，平台图表上可见。

**阶段 B 完成标准**

- 一条命令能：刷新最近交易日 OHLCV（带 qfq lookback）→ 重建本地因子面板 → 跑事件收益（明确标记为本地）。
- JoinQuant 正式包只能从校验过的 JSON 进入平台，schema 失败即拒绝。
- 至少 10 个单测覆盖诚实门禁和导入校验。

---

### 阶段 C — 策略与模拟观察（约 3–4 周，P1）

目标：两条已准入资金袖开始产生 **样本外观察数据**；LCR 和结构化反转各自得到明确裁决。此阶段仍然 **不接券商**。

#### C1. 模拟观察账本（最高优先级研究动作）

对 `jq_controller`（计划权重 1）：

- 每个调仓日记录：信号、拟下单、是否涨跌停/停牌、计划权重、实际可成交代理、行业。
- `period_return` 只允许来自真实记录或用户导入，禁止用历史回测回填。
- 暂停规则按运行包执行，并在平台上显示“观察中 / 已暂停”，不要显示 +83.29% 当作成绩。

对 AkShare 本地切换袖：

- 先决定权重（现在矩阵 ready、账本仍是 0）。建议观察期保持低权重或 0，直到与主控制器的持仓重叠审计完成。
- 本地 Sharpe 3.14 / +174% 视为乐观上界，正式表述只引用 JQ 可交易复核和样本外账本。

#### C2. 核心量价袖：维持封锁

直到同时满足：

- `market_regime=medium_volatility`
- `selected_count>=10` 且全是 `small_cap`
- `decision=promotion_signal_ready`

当前 2026-07-09：高波动、7 只，硬失败。不要为了凑 3/3 而放宽门禁。

#### C3. CSI500 LCR

- **v1（JQ 真调仓）** 才有资格谈晋级：补最新可交易 TopN、与 `jq_controller` 的持仓/状态重叠、行业暴露、真实指数权重。
- 冻结一个容量数字。约束流动性下 100 万已是观察上限，3000 万理想盘不能写进资金计划。
- **v2 / v2.1 本地压测** 继续当实验室，图表必须写“代理”。把 v2 状态机移植到 JQ 原生账本之前，不进入 paper-watch 袖。
- 成本敏感：TopN 诊断显示 1 日 1.0x 成本超额 -9.4%。短周期策略默认不作为执行周期。

#### C4. 结构化反转

二选一，禁止长期悬挂：

1. **执行：** 跑通 10 分钟（或 1 分钟聚合 10 分钟）切片 → inbox → RankIC&gt;0.025 且 t&gt;2 → 5 日调仓交易门禁。日线代理压测 **不准** 挂到该策略名下。
2. **放弃：** 删除或归档 88 个 generated runners，只留生成器模板 + 方案文档，STATUS 标记 `abandoned_pending_hf_data`。

因子设计上先拿掉两个已知拖累：`liquidity_quality_score`（成交额体量当 alpha）、`liquidity_premium_proxy_score`（可交易性当 alpha）。它们最多做过滤。

#### C5. 候选清理

- 6 条 AkShare 本地候选做 JQ 口径复核，但默认视为切换袖的变体，不新增资金袖。
- 资金跟随 v0 全样本失败，冻结，除非换逻辑重做。
- 质量利润 / K 线辅助保持组件监控。

**阶段 C 完成标准**

- 至少 20 个观察日的真实账本（收益可为空，但信号和可成交状态必须每天有）。
- LCR v1 要么进入观察候选包，要么写出不可晋级原因（容量/重叠/行业）。
- 结构化反转要么有高频门禁结果，要么正式归档。
- 核心量价袖仍未过门也不算失败。

---

### 阶段 D — 平台与执行产品化（约 4+ 周，P2）

目标：工作台好用，执行路径清晰。仍建议晚于阶段 C。

#### D1. 平台拆分

- `server.mjs`（~8300 行）按前缀拆路由：factor / backtest / strategy / paper-watch / position-stress。
- `app.js`（~4900 行）按 view 拆模块。
- 导入改为 append-only 单次 JSON + manifest，停止 `slice(0, 300)` 截断历史。
- SQLite 或 DuckDB 存结果、账本、复核；JSON 只做交换格式。
- 长时间任务（AkShare 拉取、压力测试）改 async job + `/jobs/:id`，禁止 `spawnSync` 卡死 HTTP 15 分钟。
- 研究助手：接真实模型且只喂 pipeline JSON，或改名为“规则提示”。不要维持“LLM”空壳。

#### D2. 执行

- BigQuant 包从 `pending_bigquant_real_backtest` 走完真实回填，或放弃该通道。
- 行业（`industry_sw_l1` 目前在可交易复核里全是 null）和指数权重补齐后，才能谈行业中性。
- 分钟/逐笔冲击明确作为后期；日线 ADV 模型的能力边界要写进 STATUS。
- 券商/QMT/PTrade 只在账本样本外稳定、容量数字冻结、人工核对涨跌停规则之后再接。

#### D3. 全策略门槛（可选，不要当近期 KPI）

制度里的全策略门槛（100 个交易日、12 个交叉格子、近年不失效）当前 0 条。把它当作长期过滤器，而不是为了达标去调参。调参网格已经在 LCR 上吃过一次过拟合：20 日多空后大部分“反转”因子被丢掉。

---

## 4. 建议的工作排序（接下来 14 天）

如果只做两周，按这个顺序，不要平行开新策略：

| 日 | 事项 | 产出 |
|---|---|---|
| 1 | gitignore + 文档对齐 + 假净值下线 | README、STATUS、平台总览不再撒谎 |
| 2 | pyproject/requirements + Python 路径 | 第二台机器能启动 |
| 3 | 导入存储改为按次文件，避免 2.5MB 全量解析 | 平台启动变快 |
| 4–5 | 模拟观察账本最小闭环（控制器袖） | 每天能记一条真实信号 |
| 6 | qfq lookback 刷新到最近交易日 | 行情不再停在 07-22 / 09-11 口径混乱 |
| 7–8 | LCR v1 独立性 + 容量备忘 | 一份“能否进观察”的书面裁决 |
| 9 | 结构化反转 go/no-go | 开跑高频或归档 runner |
| 10–11 | 因子 NA 政策 + 公式分版本 | 不再 0.5 填洞 |
| 12–14 | 最小测试 + inbox schema 校验 | 回归保护诚实门禁 |

明确不做：

- 不为了页面好看补 IC。
- 不把 LCR v2 代理曲线写成策略业绩。
- 不把核心量价 7 只高波动信号晋级。
- 不把 6 条 AkShare 候选算成新的独立袖。
- 不把 5581 个 CSV 再往 git 里堆。
- 不先上 Vben / 券商 API。

---

## 5. 风险与研究纪律（写进日常）

1. **过拟合：** 本地切换 +174% vs JQ 控制器 +83%，应默认本地偏乐观。参数网格只允许在样本内看，冻结后再看样本外。
2. **成本：** 短周期（1 日）在 A 股摩擦下很容易把 alpha 吃光。主执行周期维持 5 日，1 日只做诊断。
3. **容量：** 约束成交后的 100 万与理想 3000 万是两个产品。资金计划只认前者。
4. **独立性：** 共享高波动组件的策略不能重复满仓。现在真正独立的只有两条袖。
5. **高频不可日频冒充：** 结构化反转没有 10 分钟数据就没有策略。
6. **幸存者：** 完整 375 日股票池会丢掉 IPO、复牌、退市路径，回测宇宙必须 PIT。

---

## 6. 关键路径索引

| 主题 | 路径 |
|---|---|
| 诚实性 | `docs/data-honesty.md` |
| 正式回测制度 | `docs/joinquant-strategy-backtest-requirements.md` |
| 因子导出/IC | `docs/joinquant-factor-backtest-plan.md` |
| 结构化反转方案 | `docs/structured-reversal-factor-implementation-plan.md` |
| 行情运维 | `docs/a-share-history-operations.md` |
| 成熟度矩阵 | `outputs/_docs/strategy-maturity-matrix-20260710.md` |
| 资金袖审计 | `outputs/_docs/independent-sleeve-candidate-audit-20260710.md` |
| 模拟观察 | `outputs/paper-watch/README.md` |
| 策略定义 | `platform/quant-factor-platform/data/strategy-definitions.json` |
| 平台服务 | `platform/quant-factor-platform/server.mjs` |
| 压力测试 | `outputs/position-stress/scripts/position_stress_lab.py` |
| JQ 脚本 | `outputs/sources/joinquant/scripts/` |
| 本地行情脚本 | `outputs/sources/akshare/scripts/` |

---

## 7. 多 Agent 怎么继续

后续实施建议仍拆开，避免一个会话吞掉 8000 行 `server.mjs`：

| Agent | 职责 | 不要碰 |
|---|---|---|
| data-ops | gitignore、parquet、qfq 刷新、股票池 PIT | 策略晋级结论 |
| platform | 假净值下线、懒加载、路由拆分、inbox 导入 | 编造收益 |
| research-gates | 账本、LCR 裁决、核心袖门禁、结构化反转 go/no-go | 放宽样本门槛 |
| factor-core | 公式分版本、NA、共振因子、单测 | Yiwan 单日 IC |
| docs | README / STATUS / UPGRADE_LOG | 把 logs 再复制一份 |

每次改完非平凡代码，用只读 review agent 看：有没有把 proxy 写成正式业绩、有没有在无未来收益时输出 IC。
