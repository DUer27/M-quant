"""Observe minute labels and revisions without inferring closed bars or filling gaps."""
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from intraday_storage import digest, minute_metadata
from market_data_refresh import atomic_json, read_json
from intraday_minute_evidence import label_evidence

CHINA = ZoneInfo('Asia/Shanghai')


def label_time(value):
    stamp = datetime.fromisoformat(value)
    if stamp.tzinfo is None:
        raise ValueError('分钟核查要求带时区的标签')
    return stamp.astimezone(CHINA)


def session(stamp):
    clock = stamp.strftime('%H:%M')
    if '09:30' <= clock <= '11:30':
        return 'morning'
    if '13:00' <= clock <= '15:00':
        return 'afternoon'
    return None


def audit_series(data, received_at, run_id, previous=None):
    rows = data.get('rows', [])
    if not rows:
        raise ValueError('分钟核查不接受空序列')
    ordered = sorted(rows, key=lambda row: label_time(row['time']))
    stamps = [label_time(row['time']) for row in ordered]
    if len(set(stamps)) != len(stamps):
        raise ValueError('重复分钟标签必须先在来源校验中处理')
    received = label_time(received_at)
    gaps = []
    for before, after in zip(stamps, stamps[1:]):
        # Only internal labels inside the same observed session are candidates.
        # Opening/closing conventions, lunch and entirely absent sessions stay unknown.
        if before.date() != after.date() or session(before) is None or session(before) != session(after):
            continue
        missing = int((after - before).total_seconds() // 60) - 1
        if missing > 0:
            gaps.append({'after': before.isoformat(), 'before': after.isoformat(), 'candidate_labels': missing})
    result = {
        'schema': 'minute-label-audit.v1', 'code': data['code'], 'source': data['source'],
        'adjust': data['adjust'], 'day': stamps[-1].date().isoformat(),
        'run_id': run_id, 'version': minute_metadata(data)['version'], 'received_at': received_at,
        'first_label': ordered[0]['time'], 'last_label': ordered[-1]['time'], 'row_count': len(rows),
        'observed_boundary_labels': [stamp.isoformat() for stamp in stamps if stamp.strftime('%H:%M') in ('09:30', '11:30', '13:00', '14:57', '15:00')],
        'label_semantics': 'unverified', 'closure_state': 'unverified', 'verified_count': 0,
        'strategy_eligible': False,
        'pending_count': data.get('pending_count', 0), 'pending_labels': data.get('pending_labels', []),
        'possible_forming_count': sum(stamp.replace(second=0, microsecond=0) == received.replace(second=0, microsecond=0) for stamp in stamps),
        'input_reordered': bool(data.get('input_quality', {}).get('reordered', rows != ordered)),
        'gap_range_count': len(gaps), 'possible_missing_labels': sum(gap['candidate_labels'] for gap in gaps),
        'gap_examples': gaps[:10], 'gap_examples_truncated': len(gaps) > 10,
        'gap_interpretation': '仅报告同一时段已见标签之间的疑似缺口；不包含未知边界、整段缺失或停牌判断，不补零。',
        'comparison_state': 'first_observation', 'compared_labels': 0, 'changed_labels': 0,
        'added_labels': 0, 'disappeared_in_overlap': 0, 'change_examples': [],
        'latest_label_regressed': False,
    }
    if not previous or not previous.get('data', {}).get('rows'):
        return result
    old = previous['data']
    if (old.get('code'), old.get('source'), old.get('adjust')) != (data['code'], data['source'], data['adjust']):
        result['comparison_state'] = 'source_or_basis_changed'
        return result
    if received < label_time(previous['received_at']):
        result['comparison_state'] = 'older_receipt_ignored'
        return result
    old_latest = max(label_time(row['time']) for row in old['rows'])
    if old_latest.date() != stamps[-1].date():
        result.update(comparison_state='new_day', latest_label_regressed=stamps[-1] < old_latest)
        return result
    before = {row['time']: row for row in old['rows']}
    after = {row['time']: row for row in ordered}
    common = before.keys() & after.keys()
    changed = sorted(time for time in common if digest(before[time]) != digest(after[time]))
    result.update(comparison_state='compared', compared_labels=len(common), changed_labels=len(changed),
                  added_labels=len(after.keys() - before.keys()),
                  disappeared_in_overlap=sum(ordered[0]['time'] <= time <= ordered[-1]['time'] for time in before.keys() - after.keys()),
                  latest_label_regressed=stamps[-1] < max(label_time(row['time']) for row in old['rows']))
    for time in changed[:10]:
        keys = sorted(key for key in before[time].keys() | after[time].keys() if before[time].get(key) != after[time].get(key))
        result['change_examples'].append({'label': time, 'fields': keys,
                                          'before': {key: before[time].get(key) for key in keys},
                                          'after': {key: after[time].get(key) for key in keys}})
    result['change_examples_truncated'] = len(changed) > 10
    return result


def observe_minute(runtime, data, received_at, run_id):
    runtime = Path(runtime)
    # Callers pass only configured sample codes and validated provider names.
    code, source = data['code'], data['source']
    if not (len(code) == 6 and code.isdigit()) or source not in ('sina.minute', 'eastmoney.minute'):
        raise ValueError('分钟核查来源或代码不受支持')
    baseline_path = runtime / 'minute-audit-baselines' / (code + '-' + source + '.json')
    path = runtime / 'minute-audit' / (code + '.json')
    prior = read_json(path, {})
    if prior.get('run_id') == run_id and prior.get('received_at') == received_at and prior.get('source') == source:
        return prior
    previous = read_json(baseline_path, {})
    audit = audit_series(data, received_at, run_id, previous)
    audit['bar_evidence'] = label_evidence(data, received_at, run_id, previous)
    if prior.get('received_at') and label_time(received_at) < label_time(prior['received_at']):
        audit['comparison_state'] = 'older_receipt_ignored'
        return audit
    switched = prior.get('source') and prior.get('source') != source
    audit['source_switched_from'] = prior['source'] if switched else None
    if switched and audit['comparison_state'] == 'first_observation':
        audit['comparison_state'] = 'source_or_basis_changed'
    same_day_source = all(prior.get(key) == audit[key] for key in ('day', 'source', 'adjust'))
    # A repeated delivery does not pretend to be another independent observation.
    same_delivery = prior.get('run_id') == run_id and prior.get('received_at') == received_at
    history = prior.get('history', []) if same_day_source else []
    if not same_delivery:
        history = (history + [{key: audit[key] for key in ('run_id', 'received_at', 'last_label', 'row_count',
                   'comparison_state', 'changed_labels', 'possible_missing_labels', 'possible_forming_count')}])[-30:]
    audit.update(history=history, observation_count=(prior.get('observation_count', 0) if same_day_source else 0) + (not same_delivery),
                 first_observed_at=prior.get('first_observed_at', received_at) if same_day_source else received_at)
    if audit['comparison_state'] != 'older_receipt_ignored':
        if not audit['latest_label_regressed']:
            atomic_json(baseline_path, {'data': data, 'received_at': received_at, 'run_id': run_id, 'bar_evidence': audit['bar_evidence']})
        atomic_json(path, audit)
    return audit


def audit_summary(audit):
    return {key: value for key, value in audit.items() if key not in ('history', 'change_examples', 'gap_examples', 'bar_evidence')}
