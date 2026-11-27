"""Bounded per-label observations. Stability is evidence, never closure proof."""
from datetime import datetime

from intraday_storage import digest


def label_evidence(data, received_at, run_id, previous=None):
    previous = previous or {}
    old = previous.get('data', {})
    comparable = all(old.get(key) == data.get(key) for key in ('code', 'source', 'adjust'))
    current_time = datetime.fromisoformat(received_at)
    prior_time = datetime.fromisoformat(previous['received_at']) if previous.get('received_at') else None
    independent = comparable and prior_time is not None and current_time > prior_time and previous.get('run_id') != run_id
    earlier = prior_time is not None and current_time < prior_time
    prior_rows = {row['time']: row for row in old.get('rows', [])} if comparable else {}
    prior_evidence = {row['label']: row for row in previous.get('bar_evidence', [])} if comparable else {}
    result = []
    last_label=max((row['time'] for row in data.get('rows',[])),default='')
    for row in sorted(data.get('rows', []), key=lambda item: item['time']):
        label = row['time']
        old_row = prior_rows.get(label)
        prior = prior_evidence.get(label, {})
        content_hash = digest({key: value for key, value in row.items() if key != 'closure_verified'})
        old_hash = digest({key: value for key, value in old_row.items() if key != 'closure_verified'}) if old_row else None
        same = old_hash == content_hash
        count = prior.get('observations', 1 if old_row else 0)
        stable = prior.get('unchanged_observations', 1 if old_row else 0)
        revised = bool(independent and old_row and not same)
        result.append({'label': label, 'content_hash': content_hash,
                       'observations': count + (1 if independent and old_row else 0) if old_row else 1,
                       'unchanged_observations': (stable + 1 if same else 1) if independent and old_row else stable if old_row else 1,
                       'revisions': prior.get('revisions', 0) + int(revised),
                       'first_received_at': prior.get('first_received_at', previous.get('received_at') if old_row else received_at),
                       'last_received_at': prior.get('last_received_at', previous.get('received_at')) if earlier and old_row else received_at,
                       'last_changed_at': received_at if revised or not old_row else prior.get('last_changed_at', previous.get('received_at')),
                       'changed_this_observation': revised,
                       'later_label_seen': label<last_label,
                       'closure_verified': False, 'strategy_eligible': False})
    return result[-300:]


def initialize_existing(runtime,codes):
    """Seed one known delivery from saved audits, without inventing new observations."""
    from pathlib import Path
    from market_data_refresh import read_json, atomic_json, refresh_lock
    runtime=Path(runtime)
    results=[]
    with refresh_lock(runtime):
        for code in codes:
            path=runtime/'minute-audit'/f'{code}.json'
            audit=read_json(path,{})
            saved=read_json(runtime/'minute-cache'/f'{code}.json',{})
            if audit.get('bar_evidence'):
                results.append({'code':code,'state':'already_recorded'});continue
            if not saved.get('data') or any(audit.get(k)!=value for k,value in {'version':saved['data'].get('version'),'run_id':saved.get('run_id'),'received_at':saved.get('received_at'),'source':saved['data'].get('source'),'adjust':saved['data'].get('adjust')}.items()):
                results.append({'code':code,'state':'cache_audit_mismatch'});continue
            evidence=label_evidence(saved['data'],saved['received_at'],saved['run_id'])
            audit.update(bar_evidence=evidence,bar_evidence_origin='initialized_from_saved_delivery')
            atomic_json(path,audit)
            baseline_path=runtime/'minute-audit-baselines'/f"{code}-{saved['data']['source']}.json"
            baseline=read_json(baseline_path,{})
            if baseline.get('run_id')==saved.get('run_id') and baseline.get('received_at')==saved.get('received_at'):
                atomic_json(baseline_path,{**baseline,'bar_evidence':evidence})
            results.append({'code':code,'state':'initialized_one_saved_delivery','labels':len(evidence)})
    return results
