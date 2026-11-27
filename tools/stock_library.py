"""Resolve one immutable stock-library version for each worker invocation."""
import json
from pathlib import Path


def apply_stock_library(config, kind, root):
    if config.get('pool_snapshot'): return config
    path=Path(root)/'platform/quant-factor-platform/config/stock-library.json'
    if not path.exists(): return config
    library=json.loads(path.read_text(encoding='utf-8-sig'))
    stocks=library['stocks']
    import re
    seen=set()
    for row in stocks:
        if not re.fullmatch(r'(?:00|30|60)\d{4}',row['code']) or row['code'] in seen:raise ValueError('股票管理库代码无效或重复')
        seen.add(row['code'])
        if any(not isinstance(row[key],bool) for key in ('daily','quote','minute','audit')):raise ValueError('股票管理库开关无效')
        if row['minute'] and not row['quote'] or row['audit'] and not row['minute']:raise ValueError('股票管理库数据类型依赖无效')
    ordered=sorted(stocks,key=lambda row:(row.get('priority',1),row['code']))
    result={**config,'pool_version':library['version'],'pool_id':library['id']}
    if kind=='daily':
        selected=[row for row in ordered if row['daily']]
        if not selected:raise ValueError('日线股票池为空')
        result.update(managed_symbols=[{'code':row['code'],'name':row['name']} for row in selected],label=f'日线股票池 · {len(selected)}只',
                      priority_codes=[row['code'] for row in selected if row.get('priority')==0])
    else:
        codes=[row['code'] for row in ordered if row['quote']]
        if not 1<=len(codes)<=50:raise ValueError('盘中股票池限定1—50只')
        result.update(codes=codes,minute_codes=[row['code'] for row in ordered if row['minute']],
                      minute_audit_codes=[row['code'] for row in ordered if row['audit']],label=f'盘中股票池 · {len(codes)}只')
        if len(result['minute_audit_codes'])>3:raise ValueError('分钟核查最多3只')
    return result
