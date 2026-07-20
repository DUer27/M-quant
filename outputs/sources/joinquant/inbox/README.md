# JoinQuant Result Inbox

把 JoinQuant notebook 打印出来的 JSON 保存为 `.json`、`.txt` 或 `.log` 放在本目录后，可批量导入：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_inbox.py
```

导入前只做审计：

```bash
python3 outputs/sources/joinquant/scripts/import_joinquant_inbox.py --dry-run
```

导入成功的文件会移动到 `done/`，失败的文件会移动到 `failed/`。平台只会展示真实 JoinQuant 输出中的结果，不会在本地补造收益。
