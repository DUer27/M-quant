# 长江结构化反转因子策略落地方案

本文档用于让下一次对话或新的研究线程直接接手“长江证券《高频因子（二）：结构化反转因子》”策略落地工作。

## 1. 策略定位

策略名：长江结构化反转因子指数增强策略 v1

核心目标：把传统 21 日反转因子升级为“高频成交量结构确认后的反转因子”，用于中证500、中证800或全A股票池的低频选股、指数增强、事件替换确认层。

这个策略不是日内高频交易。它使用 10 分钟或 1 分钟数据提取过去 21 个交易日的微观交易结构，然后降频成周频或月频选股因子。

核心思想：

```text
不是所有跌多的股票都值得买。

高成交量下跌：多空博弈激烈，价格更可能出现过度反应，后续更容易反转，属于“真实超跌”。
低成交量下跌：信息单边释放，价格可能仍在向合理中枢移动，后续可能继续下跌，属于“无效超跌”。
```

## 2. 研报关键结论

来源：长江证券《基础因子研究（七）：高频因子（二），结构化反转因子》

重点结论：

1. 基础反转因子，即过去 21 日收益率，有一定选股能力，但波动大、回撤年份多、分组线性不佳。
2. 用成交量加权的高频反转因子，可以显著增强传统反转因子的稳定性。
3. 结构化反转因子进一步把低成交量区间视为动量段，把高成交量区间视为反转段，同时考虑个股的动量效应和反转效应。
4. 研报重点展示 10 分钟频率、21 日窗口、低成交量 10% 阈值的结果。
5. 因子方向为：结构化反转因子值越低，未来收益越好。
6. 反转类因子的收益与市场波动相关。市场波动越高，反转效果通常越强；市场波动很低时，反转容易失效。
7. 动量/反转的成交量临界点可能与市值相关，小市值股票更容易出现投机交易和反转，大市值股票更偏基本面定价。

## 3. 第一版策略参数

第一版优先使用研报默认思路，不做过多优化，避免过拟合。

```text
策略版本：structured_reversal_csi500_v1
股票池：中证500，备选中证800
数据频率：10 分钟 K 线
观察窗口：过去 21 个交易日
低成交量阈值：10%
调仓频率：每 5 个交易日
持仓数量：100 只
组合权重：等权
因子方向：Rev_struct 越低越好
交易成本：单边 0.15%
滑点假设：单边 0.02%-0.05%
低波动市场仓位：降到 60%-70%
```

如果 JoinQuant 10 分钟数据不稳定，可以取 1 分钟数据后自行聚合成 10 分钟数据。聚合时上午和下午不能跨午休合并。

## 4. 数据要求

### 4.1 高频行情数据

最低要求：10 分钟 K 线。

字段：

```text
stock_code
datetime
open
high
low
close
volume
money
```

推荐数据源：JoinQuant 研究环境。

可用接口示例：

```python
get_price(
    securities,
    start_date=start,
    end_date=end,
    frequency="10m",
    fields=["open", "high", "low", "close", "volume", "money"],
    panel=False,
    fq="pre",
)
```

若只能取 1 分钟数据，则聚合为 10 分钟：

```text
open：区间第一根 open
high：区间最高 high
low：区间最低 low
close：区间最后一根 close
volume：区间 volume 求和
money：区间 money 求和
```

A 股每个交易日约 240 分钟，10 分钟频率约 24 根 K 线。21 个交易日约 504 个高频区间。

### 4.2 日频辅助数据

用于过滤、风控和回测。

字段：

```text
股票池成分
交易日历
ST 状态
停牌状态
上市日期
涨跌停价格或涨跌停状态
日频 open/high/low/close/volume/money
市值
换手率
行业
指数行情
```

## 5. 因子计算公式

对每只股票，在每个调仓日取过去 21 个交易日的 10 分钟 K 线。

每个 10 分钟区间计算：

```text
r_i = log(close_i / close_{i-1})
v_i = volume_i
```

剔除：

```text
close_i 缺失的 bar
volume_i <= 0 的 bar
ret 缺失或无穷的 bar
```

按成交量 `v_i` 从小到大排序。

```text
低成交量 10%：动量段 period_mom
其余 90%：反转段 period_rev
```

动量段因子：

```text
Rev_mom = sum(w_i_mom * r_i)
w_i_mom = (1 / volume_i) / sum(1 / volume_i)
```

反转段因子：

```text
Rev_rev = sum(w_i_rev * r_i)
w_i_rev = volume_i / sum(volume_i)
```

结构化反转因子：

```text
Rev_struct = Rev_rev - Rev_mom
```

选股方向：

```text
Rev_struct 越低越好。
```

转成横截面选股分数：

```text
structured_reversal_score = -rank_pct(Rev_struct)
```

也可以定义为 0 到 1 分数：

```text
structured_reversal_score = 1 - rank_pct(Rev_struct)
```

## 6. 直观解释

```text
情形 A：高成交量区间下跌较多
Rev_rev 较低，Rev_struct 较低，未来更容易反弹，应该优先买。

情形 B：低成交量区间下跌较多
Rev_mom 较低，Rev_struct = Rev_rev - Rev_mom 被抬高，说明下跌可能是信息单边释放，不应简单接飞刀。

情形 C：高成交量区间上涨较多
Rev_rev 较高，Rev_struct 较高，可能是拥挤冲高，不优先买。

情形 D：低成交量区间上涨较多
Rev_mom 较高，Rev_struct 被压低，可能存在低量动量，但需要额外风控过滤，避免买入缩量虚涨。
```

## 7. 因子计算伪代码

```python
import numpy as np
import pandas as pd


def calc_structured_reversal(minute_df, low_volume_ratio=0.10):
    df = minute_df.sort_values("datetime").copy()
    df["ret"] = np.log(df["close"] / df["close"].shift(1))
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=["ret", "volume"])
    df = df[df["volume"] > 0]

    # 21日 * 24根10分钟K线约504根；过少说明停牌或数据不完整。
    if len(df) < 300:
        return None

    cutoff = df["volume"].quantile(low_volume_ratio)
    mom = df[df["volume"] <= cutoff].copy()
    rev = df[df["volume"] > cutoff].copy()

    if len(mom) < 20 or len(rev) < 100:
        return None

    mom["w"] = 1.0 / mom["volume"]
    mom["w"] = mom["w"] / mom["w"].sum()

    rev["w"] = rev["volume"] / rev["volume"].sum()

    rev_mom = float((mom["w"] * mom["ret"]).sum())
    rev_rev = float((rev["w"] * rev["ret"]).sum())
    rev_struct = rev_rev - rev_mom

    return {
        "rev_struct": rev_struct,
        "rev_rev": rev_rev,
        "rev_mom": rev_mom,
        "bar_count": int(len(df)),
        "mom_bar_count": int(len(mom)),
        "rev_bar_count": int(len(rev)),
        "volume_cutoff": float(cutoff),
    }
```

## 8. 基础过滤规则

结构化反转会天然接触弱势股，所以第一版必须先过滤不可交易和明显有问题的股票。

过滤条件：

```text
剔除 ST、*ST、退市风险股票
剔除停牌股票
剔除上市不足 120 天股票
剔除调仓日涨停无法买入股票
剔除调仓日跌停无法卖出股票
剔除过去 20 日平均成交额低于 5000 万股票
剔除过去 21 日跌幅超过 35% 且没有流动性恢复的股票
剔除过去 5 日连续跌停或接近连续跌停的股票
剔除过去 21 日有效 10m bar 数少于 300 的股票
```

第一版建议先不要加入太多基本面过滤，否则会看不清结构化反转本身是否有效。

## 9. 组合构建规则

第一版组合：Top100 等权指数增强。

```text
股票池：中证500
调仓周期：5 个交易日
持仓数量：100 只
排序指标：Rev_struct 从低到高，或 structured_reversal_score 从高到低
权重：等权
单票上限：1.5%，第一版等权约 1%
行业约束：第一版可先不加，第二版再加
```

缓冲区规则：

```text
已有持仓排名 <= 150：保留
新进股票排名 <= 80：允许买入
最终补足到 100 只
```

缓冲区用于降低换手，避免因短期排序抖动造成频繁交易。

## 10. 多因子增强版本

单因子验证通过后，可以把结构化反转作为核心 alpha sleeve，叠加风险控制因子。

建议第一版增强分数：

```text
final_score =
  0.60 * structured_reversal_score
+ 0.15 * low_volatility_score
+ 0.10 * liquidity_quality_score
+ 0.10 * volume_stability_score
+ 0.05 * gap_risk_control_score
```

各因子含义：

```text
structured_reversal_score：真实超跌反转
low_volatility_score：避免高波动崩盘股
liquidity_quality_score：保证交易容量
volume_stability_score：避免异常成交脉冲
gap_risk_control_score：降低隔夜跳空风险
```

第二版可加入：

```text
行业中性
市值中性
换手率中性
波动率中性
低波动市场降权
事件智能替换确认
```

## 11. 市场波动择时

研报指出，高频反转和结构化反转的收益与市场波动显著相关。

计算市场波动：

```text
market_vol_20 = std(index_return_1d, 20)
```

用过去 252 日分位数划分：

```text
低波动：market_vol_20 <= 30% 分位
中波动：30%-70% 分位
高波动：market_vol_20 >= 70% 分位
```

仓位和因子权重：

```text
高波动：结构化反转权重 60%，组合仓位 100%
中波动：结构化反转权重 50%，组合仓位 90%
低波动：结构化反转权重 30%，组合仓位 60%-70%
```

注意：第一轮单因子验证时不要做择时，先看裸因子表现。组合回测阶段再加入择时。

## 12. 市值阈值改进

研报提到反转效应和动量效应的成交量临界点可能与市值有关。

第一版固定低成交量阈值 10%。第二版可以按市值分层：

```text
小市值：低成交量阈值 15%-20%
中市值：低成交量阈值 10%-15%
大市值：低成交量阈值 5%-10%
```

示例：

```python
def choose_low_volume_ratio(market_cap_rank_pct):
    # market_cap_rank_pct 越小表示市值越小。
    if market_cap_rank_pct <= 0.33:
        return 0.20
    if market_cap_rank_pct <= 0.67:
        return 0.15
    return 0.10
```

不要第一版就使用市值动态阈值。先固定 10%，确认策略有基础 alpha 后再做参数分层。

## 13. 回测验证步骤

### 13.1 因子表生成

每个调仓日输出：

```text
date
code
name
rev_struct_10m
rev_rev_10m
rev_mom_10m
structured_reversal_score
bar_count
mom_bar_count
rev_bar_count
future_return_5d
future_return_10d
future_return_20d
```

### 13.2 单因子 IC 检验

使用 `structured_reversal_score` 与未来收益计算 RankIC。

检验周期：

```text
未来 5 日收益
未来 10 日收益
未来 20 日收益
```

输出：

```text
RankIC 均值
RankIC t 值
ICIR
月度胜率
分年度 IC
高/中/低波动环境 IC
```

### 13.3 分组收益检验

按 `structured_reversal_score` 从高到低分 10 组。

输出：

```text
G1-G10 未来收益
Top-Bottom 多空收益
分组单调性
分年度分组收益
中证500内表现
中证800内表现
全A表现
```

### 13.4 组合回测

组合规则：

```text
每 5 个交易日调仓
Top100 等权
使用缓冲区降低换手
扣交易成本和滑点
处理涨跌停和停牌
```

输出：

```text
年化收益
相对基准超额收益
信息比
最大回撤
年化波动
换手率
胜率
分年度表现
行业暴露
市值暴露
低波动/高波动环境表现
```

## 14. 验收标准

单因子最低门槛：

```text
RankIC 均值 > 0.025，按 score 方向
RankIC t 值 > 2
Top-Bottom 年化收益 > 8%
Top 组相对基准年化超额 > 3%
分组收益具备大致单调性
收益不能只由单一年份贡献
```

组合最低门槛：

```text
年化超额收益 > 3%
信息比 > 0.5
最大回撤不能显著大于基准
换手率在可接受范围内
低波动年份不能失控
交易成本后仍为正贡献
```

如果不过关，优先排查：

```text
数据频率是否真的为 10m 或 1m 聚合
是否有未来函数
是否跨午休错误聚合
是否把停牌/涨跌停纳入可交易股票
是否没有扣成本
是否低成交量股票过多
是否市场低波动环境拖累
是否行业/市值暴露过大
```

## 15. 与事件智能替换结合

结构化反转可以作为事件智能替换策略里的高频确认层。

替换评分公式：

```text
replacement_gain =
  event_score
+ base_multifactor_score
+ structured_reversal_score
- style_distance_penalty
- transaction_cost
- liquidity_penalty
```

使用方式：

```text
正面事件 + 高量下跌后结构化反转确认：更值得替换买入
正面事件 + 低量下跌：可能仍是信息单边释放，谨慎
正面事件 + 高量冲高：可能短线兑现，不追
负面事件 + 低量下跌：避免接飞刀
```

这个组合会形成：

```text
公告事件确认 + 多因子底仓质量 + 高频交易行为确认 + 风格相似替换
```

## 16. 实施路线

### 第 1 步：建立 JoinQuant 研究脚本

目标：生成结构化反转因子表，不做交易。

脚本建议位置：

```text
outputs/sources/joinquant/scripts/m_quant_structured_reversal_factor_jq.py
```

核心函数：

```text
fetch_10m_price()
calc_structured_reversal()
build_factor_panel()
attach_future_returns()
export_json_result()
```

### 第 2 步：做单因子检验脚本

目标：计算 IC、分组收益和分年度表现。

脚本建议位置：

```text
outputs/sources/joinquant/scripts/analyze_structured_reversal_factor.py
```

### 第 3 步：做 Top100 周频组合回测

目标：验证是否能做成指数增强策略。

脚本建议位置：

```text
outputs/sources/joinquant/scripts/m_quant_structured_reversal_index_enhancement.py
```

### 第 4 步：加入风险过滤和波动择时

目标：降低低波动市场失效和极端弱势股风险。

加入：

```text
流动性过滤
极端跌幅过滤
低波动市场降仓
跳空风险过滤
缓冲区换手控制
```

### 第 5 步：接入现有策略平台

目标：加入 `platform/quant-factor-platform/data/strategy-definitions.json` 或作为策略研究结果导入本地平台。

需要输出：

```text
策略定义 JSON
回测摘要 JSON
最新持仓 CSV
调仓解释 Markdown
```

## 17. 注意事项

1. 不能用日线数据伪造高频结构化反转。这个策略的 alpha 来自日内成交量路径。
2. 不能使用调仓日之后的数据计算因子。
3. 10 分钟 K 线不能跨午休聚合。
4. 涨跌停、停牌和上市时间必须处理，否则回测会虚高。
5. 第一版不要过度中性化和过度参数优化。
6. 第一版先验证固定 10% 阈值，再考虑市值分层阈值。
7. 如果数据拉取成本太高，先用中证500或中证800，不要一开始全A。
8. 高频数据量很大，要分批拉取并缓存。

## 18. 下一轮对话可以直接执行的任务

下一轮可以直接让 Codex 做以下工作：

```text
请基于 docs/structured-reversal-factor-implementation-plan.md，
在 outputs/sources/joinquant/scripts/ 下实现 JoinQuant 研究脚本，
用于计算长江结构化反转因子，并输出因子 IC、分组收益、Top100 组合回测框架。
```

第一批代码目标：

```text
1. 新增 JoinQuant 研究脚本
2. 支持 10m 数据拉取
3. 支持 21日窗口结构化反转计算
4. 支持中证500/中证800参数切换
5. 输出 JSON 结果，方便回填本地平台
6. 不编造任何回测指标；没有真实数据则只输出缺数据提示
```

## 19. 最小可行版本摘要

```text
策略名：structured_reversal_csi500_v1
股票池：中证500
数据：10分钟K线
窗口：21交易日
阈值：成交量最低10%为动量段，其余为反转段
因子：Rev_struct = Rev_rev - Rev_mom
方向：Rev_struct越低越好
调仓：每5个交易日
持仓：Top100等权
风控：ST/停牌/新股/低流动性/极端跌幅/涨跌停过滤
增强：低波动市场降仓，后续接入事件智能替换
```

