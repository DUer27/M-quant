"""Small real-network comparison. Isolated output; never publishes trading signals."""
import argparse
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

from market_data_refresh import CHINA, ROOT, atomic_json, expected_trade_date, fetch_source, read_json, validate_history
from market_data_sources import SourceManager


class LegacyFetcher:
    """Original fixed fallback order, global 0.6s spacing and no HTTP pooling."""
    def __init__(self, validator, config):
        self.validator, self.config = validator, config
        self.lock = threading.Lock()
        self.last = float('-inf')
        self.stats = {source: {"requests": 0, "failures": 0, "successes": 0} for source in SourceManager.sources}

    def fetch(self, code, name, start, end, timeout, retries):
        errors = []
        for source in SourceManager.sources:
            for attempt in range(retries + 1):
                with self.lock:
                    delay = 0.6 - (time.monotonic() - self.last)
                    if delay > 0:
                        time.sleep(delay)
                    self.last = time.monotonic()
                    self.stats[source]["requests"] += 1
                try:
                    frame = fetch_source(source, code, name, start, end, timeout, requests)
                    frame = self.validator(frame, code)
                except Exception as error:
                    errors.append(source + ':' + type(error).__name__)
                    with self.lock:
                        self.stats[source]["failures"] += 1
                    if attempt < retries:
                        time.sleep(attempt + 1)
                else:
                    with self.lock:
                        self.stats[source]["successes"] += 1
                    return frame
        raise RuntimeError('; '.join(errors))

    def summary(self):
        return self.stats

    def close(self):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample-size', type=int, default=12)
    parser.add_argument('--config', default=str(ROOT / 'platform/quant-factor-platform/config/market-data.json'))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    config = read_json(args.config)
    runtime = ROOT / 'outputs/live-market-data'
    calendar = read_json(runtime / 'calendar.json')['dates']
    target = expected_trade_date(calendar, datetime.now(CHINA), config['completed_bar_after'])
    pool = pd.read_csv(ROOT / config['symbols_file'], dtype={'code': str}).drop_duplicates('code').sort_values('code')
    count = max(1, min(args.sample_size, len(pool)))
    indexes = sorted({round(i * (len(pool) - 1) / max(count - 1, 1)) for i in range(count)})
    pool = pool.iloc[indexes]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    validator = lambda frame, code: validate_history(frame, code, config['start_date'], target, calendar, config['min_history_days'])
    report = {'started_at': datetime.now(CHINA).isoformat(), 'data_date': target, 'sample_size': len(pool),
              'codes': list(pool['code']), 'cache_used': False, 'cases': []}
    for mode, workers in [('legacy', 2), ('optimized', 2), ('optimized', 4)]:
        label = mode + '-' + str(workers)
        manager = LegacyFetcher(validator, config) if mode == 'legacy' else SourceManager(config, fetch_source, output / label, label, validator)
        started = time.monotonic()
        details = []
        try:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                tasks = {executor.submit(manager.fetch, str(row.code).zfill(6), row.name, config['start_date'], target, config['request_timeout'], config['retries']): str(row.code).zfill(6) for row in pool.itertuples()}
                for future in as_completed(tasks):
                    code = tasks[future]
                    try:
                        frame = future.result()
                        directory = output / label / 'data'
                        directory.mkdir(parents=True, exist_ok=True)
                        frame.to_csv(directory / (code + '.csv'), index=False, encoding='utf-8-sig')
                        details.append({'code': code, 'ok': True, 'rows': len(frame), 'source': str(frame['source'].iloc[-1])})
                    except Exception as error:
                        details.append({'code': code, 'ok': False, 'reason': str(error)[:600]})
        finally:
            manager.close()
        result = {'mode': mode, 'workers': workers, 'seconds': round(time.monotonic() - started, 3),
                  'fresh': sum(item['ok'] for item in details), 'total': len(pool), 'sources': manager.summary(), 'stocks': details}
        report['cases'].append(result)
        atomic_json(output / 'report.json', report)
        print(json.dumps({key: value for key, value in result.items() if key not in ('stocks', 'sources')}, ensure_ascii=False), flush=True)
    report['finished_at'] = datetime.now(CHINA).isoformat()
    atomic_json(output / 'report.json', report)
    return 0 if all(case['fresh'] == case['total'] for case in report['cases']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
