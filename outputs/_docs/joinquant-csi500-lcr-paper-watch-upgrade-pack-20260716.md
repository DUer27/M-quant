# 中证500低拥挤反转指数增强准模拟盘冲刺包

生成时间：2026-07-16

## 目标

把 `csi500_low_crowding_reversal_index_enhancement_v0` 从真实 JoinQuant 快测记录推进到可审计的准模拟盘候选。所有结果必须来自 JoinQuant 原始数据或 JoinQuant slice 的原始 `factor_rows` 合并复算，不允许从汇总指标反推收益。

## 当前状态

- 已有 JoinQuant 网页研究环境快测结果。
- 快测只覆盖 18 个因子日期，不能作为准模拟盘依据。
- 20 日主周期只有 `jq_lcr_volume_stability` 通过因子门禁。
- 5 日调仓绝对收益为正，但主动收益和主动 Sharpe 为负。
- 本地 SDK 路径仍受 JoinQuant 权限/网络环境限制；下一主路径是网页研究环境分片产出。

## 新增工具

- `outputs/sources/joinquant/scripts/optimize_csi500_lcr_candidates.py`
  - 输入 JoinQuant slice 原始 `factor_rows`。
  - 合并截面后批量复算多个保守候选版本。
  - 输出候选排名、准模拟盘检查、5 日主调仓、1/5/10/20 调仓和九宫格分层。
- `outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py`
  - 新增 `--merge-existing-slices`：不跑 SDK，直接合并 inbox 里的网页端 slice。
  - 新增 `--optimize-candidates`：合并后自动跑候选优化审计。

## JoinQuant 网页端分片任务

在 JoinQuant Python3 研究环境运行 notebook 专用脚本：

`outputs/sources/joinquant/scripts/m_quant_csi500_low_crowding_reversal_index_enhancement_jq_notebook.py`

每次只改参数：

```python
RUN_MODE = "slice"
SLICE_START = "2019-01-01"
SLICE_END = "2019-12-31"
```

建议年度分片：

| 分片 | SLICE_START | SLICE_END |
| ---: | --- | --- |
| 1 | 2019-01-01 | 2019-12-31 |
| 2 | 2020-01-01 | 2020-12-31 |
| 3 | 2021-01-01 | 2021-12-31 |
| 4 | 2022-01-01 | 2022-12-31 |
| 5 | 2023-01-01 | 2023-12-31 |
| 6 | 2024-01-01 | 2024-12-31 |
| 7 | 2025-01-01 | 2025-12-31 |
| 8 | 2026-01-01 | 2026-07-15 |

如果年度分片仍触发 JoinQuant 1.0G 环境限制，改为半年分片。

## 本地归档目录

把每个网页端输出 JSON 存到：

`outputs/sources/joinquant/inbox/csi500_lcr_slices/`

slice 文件必须是 `result_type = index_enhancement_factor_slice`，且包含非空 `factor_rows`。

## 一键合并和优化

使用 bundled Python：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 outputs/sources/joinquant/scripts/run_csi500_lcr_pipeline.py --merge-existing-slices --optimize-candidates --no-import
```

只做标准 v0 分片合并：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 outputs/sources/joinquant/scripts/merge_csi500_lcr_slices.py 'outputs/sources/joinquant/inbox/csi500_lcr_slices/*.json'
```

只做候选优化：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 outputs/sources/joinquant/scripts/optimize_csi500_lcr_candidates.py 'outputs/sources/joinquant/inbox/csi500_lcr_slices/*.json'
```

## 候选优化规则

候选优化器当前评估：

- `v0_baseline_rebuilt`：v0 固定权重复算。
- `v1_volume_active_short`：量能稳定 + 主动反转 + 短期反转。
- `v1_volume_active_anti_heat`：量能稳定 + 主动反转 + 反过热。
- `v1_volume_downside_active`：量能稳定 + 下行韧性 + 主动反转。
- `v1_volume_only_cap_neutral`：量能稳定单核，市值桶中性。
- `v1_compact_top80`：Top80/Top120 buffer 精简组合。

共同约束：

- 使用同一批 JoinQuant 合并截面复算。
- 保留真实交易成本和滑点。
- 5 日调仓为准模拟盘主周期。
- 输出 1/5/10/20 日调仓对照。
- 输出高/中/低波动 × 大/中/小市值九宫格。
- 不放宽现有准模拟盘门禁。

## 准模拟盘准入线

候选必须同时满足：

- 20 日主周期至少 2 个因子过门禁。
- 5 日调仓策略收益 `>= 5%`。
- 5 日调仓年化收益 `>= 3%`。
- 5 日调仓主动收益 `>= 2%`。
- 5 日主动 Sharpe `>= 0.35`。
- 最大回撤不低于 `-25%`。
- 九宫格分层数量 `>= 9`。

## 决策规则

- 若有版本达标：冻结参数，生成 `v1_paper_watch_candidate` 包，再导入平台。
- 若没有版本达标但主动收益接近转正：查看年度、波动、市值失败项，只做一次窄范围因子删减。
- 若完整样本仍只有一个因子过门禁：保留为真实回测候选，不进入准模拟盘。
- 若所有候选主动收益持续为负：停止优化该主题，转向新的 CSI500 alpha 因子来源。

## 当前阻塞

本地 SDK 路径验证仍不可作为主执行路径。需要先从 JoinQuant 网页研究环境产出年度或半年度 slice，之后本地工具链即可合并、优化和审计。
