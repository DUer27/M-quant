"""Bounded daily-gap cross-checks; evidence never overwrites primary market history."""
import argparse
import hashlib
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from market_data_refresh import CHINA, atomic_json, fetch_source, read_json, refresh_lock, validate_history
from market_data_sources import SourceManager
from stock_history_prepare import cache_stamp, quiet_time, requirements, HistoryUpdater


def compare(primary, other, missing, source):
    p = primary.set_index('date')
    q = other.set_index('date')
    overlap = sorted(set(p.index) & set(q.index))
    conflicts = [day for day in overlap if not np.isclose(p.loc[day, ['open','high','low','close']].to_numpy(dtype=float),
                                                         q.loc[day, ['open','high','low','close']].to_numpy(dtype=float),
                                                         rtol=.0001, atol=.02).all()]
    found = sorted(set(missing) & set(q.index))
    return {'source': source, 'state': 'observed', 'found_dates': found, 'absent_dates': sorted(set(missing)-set(found)),
            'overlap_rows': len(overlap), 'price_conflict_dates': conflicts,
            'zero_volume_dates': [day for day in found if float(q.loc[day,'volume']) == 0]}


def review(config, runtime, now=None, provider=fetch_source, allowed=None):
    runtime = Path(runtime).resolve()
    now = now or datetime.now(CHINA)
    directory = runtime/'daily-gap-review'
    path = directory/'status.json'
    with refresh_lock(runtime):
        calendar = read_json(runtime/'calendar.json', {}).get('dates', [])
        if not quiet_time(now, calendar):
            raise ValueError('缺口交叉核查仅在已确认的休市时段执行')
        guard = allowed or (lambda: quiet_time(datetime.now(CHINA), calendar))
        started = time.monotonic()
        run_id = now.strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
        run_dir = directory/'runs'/run_id
        previous = read_json(path, {})
        records = {row['code']:row for row in previous.get('stocks', [])}
        day = now.astimezone(CHINA).date().isoformat()
        budget_path = directory/'budget.json'
        budget = read_json(budget_path, {})
        if budget.get('day') != day:
            budget = {'day':day, 'attempts':0, 'limit':12}
        selected = config['managed_symbols']
        state = {'schema':'daily-gap-review.v1','state':'running','pid':os.getpid(),'run_id':run_id,
                 'pool_id':config.get('pool_id'),'pool_version':config.get('pool_version'),
                 'started_at':now.isoformat(),'stocks':[],'network_attempts':0,'batch_limit':3,
                 'message':'正在列出缺口与基线','budget':budget}
        manager = SourceManager({**config, 'retries':0}, provider, runtime, 'gap-'+run_id)
        updater = HistoryUpdater(config, runtime)
        updater.metrics = {'timings':{}}

        def save():
            state['stocks'] = [records[s['code']] for s in selected if s['code'] in records]
            state['updated_at'] = datetime.now(CHINA).isoformat()
            state['elapsed_seconds'] = round(time.monotonic()-started, 3)
            state['sources'] = manager.summary()
            atomic_json(path, state)

        try:
            save()
            queue = []
            for stock in selected:
                code = stock['code']
                try:
                    cache = runtime/'cache'/f'{code}.csv'
                    meta = read_json(cache.with_suffix('.json'), {})
                    if meta.get('start') != config['start_date'] or meta.get('adjust') != 'qfq':
                        raise ValueError('需先完成历史准备')
                    if meta.get('as_of', '9999') > now.date().isoformat():
                        raise ValueError('基线日期异常')
                    primary = updater.validate(pd.read_csv(cache, dtype={'code':str}), code, meta['as_of'], calendar)
                    if primary['source'].nunique() != 1 or primary['source'].iloc[-1] != meta.get('source'):
                        raise ValueError('基线来源不一致')
                    missing = sorted({d for d in calendar if primary.date.min() <= d <= primary.date.max()}-set(primary.date))
                    stamp = cache_stamp(runtime,code)
                    old = records.get(code,{})
                    current = old.get('cache_stamp')==stamp and old.get('requirements')==requirements(config) and old.get('missing_dates')==missing
                    if current and old.get('state')!='queued' and (not old.get('retryable') or now.timestamp()<datetime.fromisoformat(old['next_retry_at']).timestamp()):
                        continue
                    baseline = {'code':code,'name':stock['name'],'cache_stamp':stamp,'requirements':requirements(config),
                                'sha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'as_of':meta['as_of'],
                                'primary_source':meta['source'],'missing_dates':missing,'observations':[],
                                'state':'queued' if missing else 'no_gaps','retryable':False}
                    records[code]=baseline
                    if missing: queue.append((stock,primary,baseline))
                except Exception as error:
                    records[code]={'code':code,'name':stock['name'],'state':'baseline_invalid','reason':str(error)[:400],
                                   'cache_stamp':cache_stamp(runtime,code),'requirements':requirements(config),'retryable':False}
            save()
            for stock,primary,record in queue[:3]:
                code = stock['code']
                dates = sorted(set(primary.date)|set(record['missing_dates']))
                first, last = dates.index(record['missing_dates'][0]), dates.index(record['missing_dates'][-1])
                window_start, window_end = dates[max(0,first-1)], dates[min(len(dates)-1,last+1)]
                record.update(window_start=window_start,window_end=window_end)
                state.update(active_code=code,message=f'交叉核查 {code} {stock["name"]}')
                for source in manager.order():
                    if source == record['primary_source'].split('.')[0]: continue
                    if not guard() or budget['attempts']>=12:
                        record['observations'].append({'source':source,'state':'deferred','reason':'等待休市或请求额度恢复'})
                        continue
                    if not manager.claim(source):
                        record['observations'].append({'source':source,'state':'unavailable','reason':'来源冷却中'})
                        continue
                    waited = manager.wait(source)
                    if not guard():
                        record['observations'].append({'source':source,'state':'deferred','reason':'已进入交易保护时段'})
                        continue
                    budget['attempts']+=1
                    atomic_json(budget_path,budget)  # reserve before request, including interrupted attempts
                    state['network_attempts']+=1
                    save()
                    tick=time.monotonic()
                    try:
                        other=manager.fetch_source(source,code,stock['name'],window_start,window_end,config['request_timeout'],manager.session())
                        other=validate_history(other,code,window_start,window_end,calendar,1)
                        if other.date.min()!=window_start or other['source'].nunique()!=1 or other['source'].iloc[-1]!=source+'.daily.qfq':
                            raise ValueError('交叉来源未覆盖两端或来源口径不一致')
                        evidence=compare(primary,other,record['missing_dates'],source)
                        candidate=run_dir/'candidates'/f'{source}-{code}.csv'
                        candidate.parent.mkdir(parents=True,exist_ok=True)
                        other.to_csv(candidate,index=False,encoding='utf-8-sig')
                        evidence.update(candidate=str(candidate.relative_to(runtime)),sha256=hashlib.sha256(candidate.read_bytes()).hexdigest())
                        record['observations'].append(evidence)
                        manager.record(source,code,1,tick,waited)
                    except Exception as error:
                        manager.record(source,code,1,tick,waited,error)
                        record['observations'].append({'source':source,'state':'unavailable','reason':type(error).__name__+': '+str(error)[:180] if isinstance(error,ValueError) else type(error).__name__})
                    save()
                observed=[o for o in record['observations'] if o['state']=='observed']
                record['dates']=[{'date':d,'state':'candidate_available' if any(d in o['found_dates'] for o in observed)
                                   else 'absence_observed' if observed else 'unresolved',
                                  'found_sources':[o['source'] for o in observed if d in o['found_dates']],
                                  'absent_sources':[o['source'] for o in observed if d in o['absent_dates']]} for d in record['missing_dates']]
                record['state']='candidate_review' if any(d['state']=='candidate_available' for d in record['dates']) else 'absence_observed' if observed else 'unresolved'
                record['retryable']=any(o['state']!='observed' for o in record['observations'])
                record['next_retry_at']=(now+timedelta(minutes=30)).isoformat()
                record['checked_at']=datetime.now(CHINA).isoformat()
                record['note']='仅保存交叉证据；来源一致缺失也不能单独证明停牌；候选行情未写回主历史。'
                save()
            state.update(state='reviewed',message='缺口证据已保存；未改写主行情，待核实后决定是否采纳')
        except Exception as error:
            state.update(state='failed',message=str(error)[:800])
        finally:
            try: manager.close()
            finally:
                state['active_code']=None
                state['finished_at']=datetime.now(CHINA).isoformat()
                save()
                atomic_json(run_dir/'result.json',state)
        return state


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True)
    parser.add_argument('--runtime',required=True)
    args=parser.parse_args()
    config=read_json(args.config)
    if not config.get('pool_snapshot'): parser.error('必须使用已保存股票池快照')
    try: state=review(config,args.runtime)
    except (RuntimeError,OSError) as error:
        if '已有行情更新任务' not in str(error): raise
        return 75
    print(json.dumps({k:state.get(k) for k in ['state','run_id','network_attempts','message']},ensure_ascii=False))
    return 0 if state['state']=='reviewed' else 1


if __name__=='__main__': sys.exit(main())
