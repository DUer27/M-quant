# 量化因子策略平台启动版

这是一个零依赖的本地启动版本，用来先跑通页面、配置和业务结构。

## 启动

```bash
npm start
```

默认地址：

```text
http://localhost:5555
```

## 后续迁移到 Vben

当前目录里的 `.env*`、`preferences.js`、`config/app-config.js` 对应 Vben 文档里的配置思路。

拿到完整 Vben 项目后，可以把这些内容合并到真实应用目录：

- `.env`
- `.env.development`
- `.env.production`
- `preferences.ts`
- 动态应用配置读取逻辑

## 本地后端接口

当前后端是零依赖 Node 服务，数据保存在 `data/state.json`。

- `GET /api/health`：服务健康检查
- `GET /api/summary`：候选因子、已验证因子、待验证因子、演示因子等汇总
- `GET /api/preferences`：读取默认策略参数
- `PUT /api/preferences`：保存默认策略参数
- `GET /api/risk`：读取组合风险指标
- `GET /factor-api/factors`：读取因子表现列表
- `GET /factor-api/indicator-fields`：读取从 yiwan 指标页抽象出的字段目录
- `GET /factor-api/indicator-factor-definitions`：读取基于指标字段设计的因子定义
- `POST /factor-api/factors`：新增因子
- `GET /backtest-api/equity`：读取净值曲线
- `POST /backtest-api/run`：根据当前参数生成模拟回测
- `GET /market-api/universes`：读取股票池和基准映射

这些仍是 mock 数据，但已经有真实 API 形状，可以替换成数据库、CSV 或行情服务。

首页因子数量口径：

- 候选因子：系统中登记的全部因子定义
- 已验证因子：已经用真实历史数据验证通过的因子，当前为 0
- 待验证因子：根据 yiwan 页面字段和图表结构推导出的因子假设
- 演示因子：原型阶段用于展示的 mock 因子

## 基于 yiwan 指标页抽象出的因子

没有直接复用 `http://www.yiwan188.com/#/quant/indicators` 的登录数据，只借鉴页面暴露出来的指标字段体系：

- 均线：`ma5`、`ma13`、`ma20`、`ma30`、`ma60`、`ma120`、`ma250`
- 均量：`mavol5`、`mavol10`
- KDJ：`stockk`、`stockd`、`stockj`
- 筹码：`taolaopan`、`pinjunchengben`、`huolipan`、`qujianchonghe`、`jiushijizhong`、`qishijizhong`
- MACD：`macd`、`diff`、`dea`

当前已生成这些规则型因子：

- 均线多头排列因子
- 量价确认因子
- KDJ动能因子
- 筹码健康因子
- MACD动能加速因子
- 技术综合强度因子

这些因子的公式和字段依赖已经进入 API，但 IC、Rank IC、收益仍是用于产品原型的估算值。接入真实历史指标表后，需要重新计算真实 IC、Rank IC 和分组回测。
