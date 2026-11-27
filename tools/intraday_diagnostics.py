"""Per-symbol observations and bounded recovery decisions; no inferred closure."""
from datetime import datetime
from pathlib import Path

from intraday_storage import digest
from market_data_refresh import atomic_json, read_json


def snapshot(kind, data, received_at, run_id):
    content = ({key: data[key] for key in ('source', 'code', 'adjust', 'rows')} if kind == 'minute'
               else {key: value for key, value in data.items() if key not in ('fresh', 'age_seconds')})
    return {'kind': kind, 'source': data['source'], 'code': data['code'], 'source_time': data['source_time'],
            'received_at': received_at, 'run_id': run_id, 'content_hash': digest(content),
            'values': ({key: value for key, value in data['rows'][-1].items() if key not in ('time', 'closure_verified')} if kind == 'minute'
                       else {key: data.get(key) for key in ('last', 'volume_shares', 'amount_yuan', 'security_status')}),
            'pending_count': data.get('pending_count', 0), 'row_count': len(data.get('rows', []))}


def compare(current, previous=None):
    result = {**current, 'previous_source_time': previous.get('source_time') if previous else None,
              'previous_received_at': previous.get('received_at') if previous else None,
              'previous_run_id': previous.get('run_id') if previous else None,
              'state': 'first_observation', 'content_changed': None, 'label_delta_seconds': None,
              'stagnant_rounds': 0, 'needs_recovery': False,
              'source_age_seconds': round((datetime.fromisoformat(current['received_at']) - datetime.fromisoformat(current['source_time'])).total_seconds(), 3)}
    result['stale'] = result['source_age_seconds'] > (180 if current['kind'] == 'minute' else 90)
    result['needs_recovery'] = result['stale']
    if result['stale']: result['recovery_reason'] = 'stale_source'
    if not previous:
        return result
    if any(current[key] != previous[key] for key in ('kind', 'source', 'code')):
        result['state'] = 'source_changed'
        return result
    result['content_changed'] = current['content_hash'] != previous['content_hash']
    result['changed_latest_fields'] = [key for key in current.get('values', {}) if current['values'][key] != previous.get('values', {}).get(key)]
    delta = (datetime.fromisoformat(current['source_time']) - datetime.fromisoformat(previous['source_time'])).total_seconds()
    result['label_delta_seconds'] = delta
    if datetime.fromisoformat(current['received_at']) < datetime.fromisoformat(previous['received_at']):
        result['state'] = 'older_receipt'
    elif delta > 0:
        result['state'] = 'new_day' if current['source_time'][:10] != previous['source_time'][:10] else 'advanced'
    elif delta < 0:
        result['state'] = 'label_regressed'; result['needs_recovery'] = True
    else:
        result['state'] = 'label_unchanged_revised' if result['content_changed'] else 'label_unchanged_same'
        result['stagnant_rounds'] = previous.get('stagnant_rounds', 0) + (current['run_id'] != previous.get('run_id'))
        result['needs_recovery'] = current['run_id'] != previous.get('run_id')
    return result


class SymbolDiagnostics:
    def __init__(self, runtime, run_id):
        self.runtime, self.run_id = Path(runtime), run_id
        self.load_error = None
        try:
            self.previous = read_json(self.runtime / 'symbol-diagnostics-state.json', {})
            if not isinstance(self.previous, dict): raise ValueError('diagnostic state shape')
        except (OSError, ValueError) as error:
            self.previous = {}; self.load_error = 'diagnostic_state:' + type(error).__name__
        self.current = {}
        self.attempts = []

    def baseline(self, kind, source, code):
        key = f'{kind}:{source}:{code}'
        if key not in self.previous:
            path = (self.runtime / 'minute-cache' / (code + '.json') if kind == 'minute' else
                    self.runtime / 'quote-cache' / (source.split('.')[0] + '-' + code + '.json'))
            try:
                saved = read_json(path, {})
                if not isinstance(saved, dict): raise ValueError('cache shape')
            except (OSError, ValueError) as error:
                self.load_error = 'diagnostic_cache:' + type(error).__name__
                return None
            if saved.get('data', {}).get('source') == source and saved.get('received_at'):
                self.previous[key] = snapshot(kind, saved['data'], saved['received_at'], saved.get('run_id'))
        value = self.previous.get(key)
        if value is not None and not isinstance(value, dict):
            self.load_error = 'diagnostic_state:ValueError'; return None
        return value

    def observe(self, kind, data, received_at, stage='initial'):
        current = snapshot(kind, data, received_at, self.run_id)
        key = f'{kind}:{data["source"]}:{data["code"]}'
        result = compare(current, self.baseline(kind, data['source'], data['code']))
        result['stage'] = stage
        self.attempts.append(result)
        if result['state'] not in ('older_receipt', 'label_regressed'):
            self.current[key] = result
        return result

    def finish(self, result):
        atomic_json(self.runtime / 'symbol-diagnostics-state.json', {**self.previous, **self.current})
        atomic_json(self.runtime / 'symbol-diagnostics.json', result)


class RecoveryBudget:
    def __init__(self, runtime, now_seconds, config=None):
        settings = config or {}
        self.path = Path(runtime) / 'symbol-recovery-state.json'
        self.load_error = None
        try:
            self.saved = read_json(self.path, {})
            if not isinstance(self.saved, dict): raise ValueError('recovery state shape')
        except (OSError, ValueError) as error:
            self.saved = {}; self.load_error = 'recovery_state:' + type(error).__name__
        self.enabled = settings.get('enabled', True) and not self.load_error
        self.max_symbols = min(3, max(0, int(settings.get('max_symbols', 3))))
        self.max_requests = min(4, max(0, int(settings.get('max_requests', 4))))
        self.deadline_seconds = min(50, max(0, float(settings.get('deadline_seconds', 50))))
        self.delay_seconds = min(5, max(0, float(settings.get('delay_seconds', 2))))
        self.cooldown_seconds = max(60, float(settings.get('cooldown_seconds', 180)))
        self.now_seconds = now_seconds
        self.symbols = set()
        self.requests = 0

    def choose(self, key):
        if not self.enabled: return 'disabled'
        if len(self.symbols) >= self.max_symbols: return 'symbol_budget'
        if self.saved.get(key, {}).get('next_allowed_at', 0) > self.now_seconds: return 'symbol_cooldown'
        self.symbols.add(key)
        return None

    def allow_request(self, elapsed, source_blocked=False):
        if source_blocked: return 'source_cooldown'
        if self.requests >= self.max_requests: return 'request_budget'
        if elapsed >= self.deadline_seconds: return 'time_budget'
        return None

    def attempted(self, key, now_seconds, result):
        self.saved[key] = {'attempted_at': now_seconds, 'next_allowed_at': now_seconds + self.cooldown_seconds, 'result': result}

    def save(self):
        if not self.load_error: atomic_json(self.path, self.saved)
