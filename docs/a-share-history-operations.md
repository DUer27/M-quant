# A股全量历史行情长期工作说明

本文档固定记录 A 股全量行情补齐、审计、路径和续跑方式，避免后续只靠对话记忆找文件。

## 固定口径

- 请求日期窗口：`2025-01-01` 到 `2026-07-15`
- 实际首个交易日：`2025-01-02`
- 目标交易日数：`370`
- 复权口径：前复权 `qfq`
- 数据原则：只保存真实行情接口返回的 OHLCV，不生成、不插值、不前向填充缺失交易日。
- 主要数据源：东方财富 K 线直连接口 `eastmoney.push2his.kline`

`2025-01-01` 是休市日，所以审计里的完整窗口从 `2025-01-02` 开始，不视为缺失。

## 长期入口

优先使用项目短入口：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/a_share_all_history.py
```

该入口会转发到实际实现脚本：

```text
outputs/sources/akshare/scripts/complete_a_share_all_history.py
```

## 常用命令

只做离线审计和重写汇总，不联网：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/a_share_all_history.py
```

补拉全 A 缺失 raw 后审计：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/a_share_all_history.py \
  --fetch \
  --scope all \
  --timeout 12 \
  --sleep 0.05
```

只补当前压力测试模型可直接识别的沪深/创业板/科创板非 ST 缺口：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/a_share_all_history.py \
  --fetch \
  --scope pressure_non_st \
  --timeout 12 \
  --sleep 0.06
```

小批量冒烟测试，最多请求 20 个缺口：

```bash
/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/a_share_all_history.py \
  --fetch \
  --scope all \
  --max-fetch 20
```

## 长期文件路径

实现和入口：

- 短入口：`tools/a_share_all_history.py`
- 实现脚本：`outputs/sources/akshare/scripts/complete_a_share_all_history.py`
- 路径 manifest：`outputs/sources/akshare/a_share_all_history_manifest.json`
- 本说明：`docs/a-share-history-operations.md`

输入股票池：

- 全 A 列表：`outputs/sources/akshare/processed/a_share_eastmoney_all_a_20260720.csv`
- 单票 raw 缓存目录：`outputs/sources/akshare/raw/a_share_daily/`

核心输出：

- 全 A 真实行情合并文件：`outputs/sources/akshare/processed/a_share_all_real_20250101_20260715_qfq.csv`
- 全 A 有真实窗口行情股票池：`outputs/sources/akshare/processed/a_share_all_available_pool_20250101_20260715.csv`
- 全 A 满 370 天股票池：`outputs/sources/akshare/processed/a_share_all_full_370_pool_20250101_20260715.csv`
- 当前压力测试支持范围的非 ST 满覆盖池：`outputs/sources/akshare/processed/a_share_pressure_supported_non_st_full_370_pool_20250101_20260715.csv`

审计输出：

- 全量审计表：`outputs/sources/akshare/results/a_share_all_completion_audit_20260720.csv`
- 缺失或不满覆盖清单：`outputs/sources/akshare/results/a_share_all_completion_missing_or_partial_20260720.csv`
- 本轮联网失败清单：`outputs/sources/akshare/results/a_share_all_completion_fetch_failures_20260720.csv`
- 汇总 JSON：`outputs/sources/akshare/results/a_share_all_completion_summary_20260720.json`

## 当前完成状态

截至 `2026-07-20 04:23:55` 的最新审计：

```text
全 A 代码池：5879
唯一代码：5879
ST/退市名称：483
有真实窗口行情：5578
满 370 天：4672
真实但不满 370 天：906
真实接口无返回：301
合并行情行数：2,010,890
合并文件覆盖交易日：370
```

当前压力测试模型可直接识别的非 ST 范围：

```text
总数：5061
满 370 天：4407
真实但不满 370 天：589
接口无返回：65
```

`65` 个接口无返回代码已重试过，多数是已合并、退市或历史占位代码。按数据诚实原则，不补造这些代码在窗口内的行情。

## 口径边界

- `partial` 不等于失败，表示接口真实返回了窗口内部分交易日，常见原因包括新上市、转板、停牌、退市或接口只保留有效交易段。
- `missing_raw` 表示本地没有窗口行情，且补拉时真实接口返回空或无法返回。
- 北交所 `920` 前缀行情已能被全 A 缓存脚本保存，但当前压力测试主模型仍以沪深/创业板/科创板映射为主。若要把北交所纳入压力测试，需要单独扩展交易所映射和交易规则。
- 全 A 缓存文件可用于后续研究和池筛选；正式压力测试仍建议优先使用满覆盖池，避免每日覆盖门禁失败。
