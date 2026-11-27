"""Compare bounded archived deliveries; observations never establish bar closure."""
import math
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

CHINA = ZoneInfo('Asia/Shanghai')
FIELDS = ('open', 'high', 'low', 'close', 'volume_shares', 'amount_yuan')
BOUNDARIES = ('09:30', '11:30', '13:00', '14:57', '15:00')


def timestamp(value):
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError('Evidence timestamp requires timezone')
    return result.astimezone(CHINA)


def summarize_formation(deliveries, day, code):
    """One comparison per source/basis/run; imports and invalid evidence stay excluded."""
    groups = {}
    excluded = Counter()
    for delivery in deliveries:
        if not delivery.get('intraday_evidence') or delivery.get('origin') != 'live':
            excluded['not_live_intraday'] += 1
            continue
        try:
            receipt = timestamp(delivery['received_at'])
            source, basis, run = delivery['source'], delivery['adjust'], delivery['run_id']
            if (delivery['code'] != code or delivery['day'] != day or receipt.date().isoformat() != day
                    or source not in ('sina.minute', 'eastmoney.minute') or basis != 'none' or not run):
                raise ValueError('Evidence identity mismatch')
            last = timestamp(delivery['last_label'])
            if last.date().isoformat() != day or last > receipt:
                raise ValueError('Invalid final label')
            labels = {}
            for row in delivery['labels']:
                label = timestamp(row['label'])
                values = {key: row['values'][key] for key in FIELDS}
                if (label.date().isoformat() != day or label > last or label in labels
                        or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values.values())):
                    raise ValueError('Invalid label observation')
                labels[label] = values
            if not labels:
                raise ValueError('Empty bounded archive')
            groups.setdefault((source, basis), []).append((receipt, str(run), last, labels))
        except (KeyError, TypeError, ValueError, OverflowError):
            excluded['invalid_evidence'] += 1

    result = []
    for (source, basis), entries in sorted(groups.items()):
        # Recovery responses in one run are one observation; prefer its final receipt.
        by_run = {}
        for entry in sorted(entries, key=lambda item: (item[0], item[1])):
            by_run[entry[1]] = entry
        ordered = sorted(by_run.values(), key=lambda item: (item[0], item[1]))
        seen_receipts, observations = set(), []
        for entry in ordered:
            if entry[0] not in seen_receipts:
                observations.append(entry)
                seen_receipts.add(entry[0])
        labels, changes, phases, live_boundaries = {}, [], Counter(), Counter()
        advanced = unchanged = regressed = compared = revisions = after_later = 0
        previous_last = None
        ages = []
        for receipt, run, last, rows in observations:
            ages.append((receipt - last).total_seconds())
            if previous_last is not None:
                advanced += last > previous_last
                unchanged += last == previous_last
                regressed += last < previous_last
            previous_last = last
            for label, values in sorted(rows.items()):
                key = label.isoformat()
                old = labels.get(key)
                changed = [field for field in FIELDS if old and old['values'][field] != values[field]]
                compared += old is not None
                revisions += bool(changed)
                late = bool(changed and old['later_label_seen'])
                after_later += late
                if changed:
                    changes.append({'label': key, 'received_at': receipt.isoformat(), 'run_id': run,
                                    'fields': changed, 'previous': old['values'], 'current': values,
                                    'after_later_label_observed': late})
                labels[key] = {'label': key, 'first_seen_at': old['first_seen_at'] if old else receipt.isoformat(),
                               'last_seen_at': receipt.isoformat(), 'observations': (old['observations'] if old else 0) + 1,
                               'revisions': (old['revisions'] if old else 0) + bool(changed),
                               'later_label_seen': bool((old and old['later_label_seen']) or last > label),
                               'values': values}
            for boundary in BOUNDARIES:
                if any(label.strftime('%H:%M') == boundary for label in rows):
                    phases[boundary] += 1
                if any(label.strftime('%H:%M') == boundary and 0 <= (receipt - label).total_seconds() <= 180 for label in rows):
                    live_boundaries[boundary] += 1
        ages.sort()
        result.append({'source': source, 'adjust': basis, 'observations': len(observations),
                       'collapsed_same_run': len(entries) - len(by_run),
                       'duplicate_receipts': len(ordered) - len(observations),
                       'first_received_at': observations[0][0].isoformat(),
                       'last_received_at': observations[-1][0].isoformat(),
                       'first_last_label': observations[0][2].isoformat(), 'last_label': observations[-1][2].isoformat(),
                       'label_advances': advanced, 'label_stagnations': unchanged, 'label_regressions': regressed,
                       'overlap_comparisons': compared, 'revision_comparisons': revisions,
                       'revisions_after_later_label': after_later, 'observed_labels': len(labels),
                       'receipt_minus_label_seconds': {'p50': ages[math.ceil(len(ages) * .5) - 1],
                                                      'p95': ages[math.ceil(len(ages) * .95) - 1], 'max': ages[-1]},
                       'boundary_observations': dict(phases),
                       'boundary_nearby_receipts': dict(live_boundaries),
                       'recent_labels': [labels[key] for key in sorted(labels, reverse=True)[:8]],
                       'recent_changes': changes[-3:][::-1]})
    return {'schema': 'minute-formation.v1', 'day': day, 'code': code, 'sources': result,
            'excluded': dict(excluded), 'closure_verified': False, 'strategy_eligible': False,
            'note': '仅比较已归档的有限标签，同源同口径每轮一次；首次见到不等于开始形成，未见修订不代表已闭合。60秒采样不能还原分钟内完整形成过程。'}
