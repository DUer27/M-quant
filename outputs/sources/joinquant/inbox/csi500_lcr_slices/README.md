# CSI500 LCR Slice Inbox

把 JoinQuant notebook 分片输出的 JSON、TXT 或 LOG 放在这里，然后本地合并审计：

```bash
python3 outputs/sources/joinquant/scripts/merge_csi500_lcr_slices.py 'outputs/sources/joinquant/inbox/csi500_lcr_slices/*'
```

合并脚本会把多个 `index_enhancement_factor_slice` 的 `factor_rows` 合成一个截面表，按 `date + code` 去重，再统一复算 RankIC、Top-Bottom、多周期事件收益、1/5/10/20 日调仓净值和九宫格。

生成完整 package 后再导入平台：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_result_package.py outputs/sources/joinquant/results/<merged-package>.json
```

不要直接导入 slice 文件；slice 只是原始截面证据，不是最终回测结果。
