# 长江结构化反转 JoinQuant 分片收件箱

推荐使用已经生成好的小批次 runner，在 JoinQuant 网页研究环境逐个运行：

```text
outputs/sources/joinquant/notebook_batches/structured_reversal/
```

批次清单：

```text
outputs/sources/joinquant/notebook_batches/structured_reversal/manifest.json
```

每个 runner 会在 JoinQuant 工作目录生成：

```text
joinquant_structured_reversal_slice_<tag>.json
joinquant_structured_reversal_slice_<tag>_status.json
joinquant_structured_reversal_slice_<tag>_stderr.txt
```

`*_status.json` 里 `ok=true`、`payload_status=ok`、`factor_rows>0` 才表示该小批次拿到了真实截面。把 `joinquant_structured_reversal_slice_<tag>.json` 放到本目录；`*_status.json` 可以一起放进来，合并入口会自动忽略。

也可以直接在 JoinQuant 网页研究环境运行完整 notebook 脚本：

```text
outputs/sources/joinquant/scripts/m_quant_structured_reversal_factor_jq_notebook.py
```

直接运行时每次只改顶部参数：

```python
RUN_MODE = "slice"
SLICE_START = "2024-01-01"
SLICE_END = "2024-03-31"
```

把 notebook 最后打印出的完整 JSON 保存到本目录，文件名建议包含窗口和批次，例如：

```text
joinquant_structured_reversal_slice_2024q1_b000_080.json
```

本地合并、复算因子门禁、Top100 交易回测，并在达标时写入策略集和压力测试选择：

```bash
python3 outputs/sources/joinquant/scripts/run_structured_reversal_pipeline.py --merge-existing-slices --update-strategy-set
```

当前本地没有真实 slice 时，该命令只会输出 `blocked_reason=missing_slice_inputs`，不会生成虚构 IC、收益或准模拟盘状态。

重新生成批次 runner：

```bash
python3 outputs/sources/joinquant/scripts/build_structured_reversal_batch_runners.py
```

数据原则：slice 只保存 JoinQuant 网页研究环境真实高频截面；本地只做合并、去重和统一复算，不加总分片收益、不补造缺失指标。
