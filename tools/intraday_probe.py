"""Read-only, bounded intraday source trial. Never consumes or publishes daily signals."""
import argparse
import json
import math
import re
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from market_data_refresh import ROOT, atomic_json, read_json, refresh_lock
from intraday_storage import IntradayStore, light_report, minute_metadata
from intraday_minute_audit import observe_minute, audit_summary
from intraday_diagnostics import SymbolDiagnostics, RecoveryBudget

CHINA = ZoneInfo("Asia/Shanghai")


def number(value, positive=False):
    result = float(value)
    if not math.isfinite(result) or result < 0 or (positive and result == 0):
        raise ValueError("无效价格或数量")
    return result


def symbol(code):
    if not re.fullmatch(r"[036]\d{5}", code):
        raise ValueError("试验代码不受支持")
    return ("sh" if code.startswith("6") else "sz") + code


def stamp(value, fmt):
    return datetime.strptime(value, fmt).replace(tzinfo=CHINA).isoformat()


def validate_quote(row, now):
    source_at = datetime.fromisoformat(row["source_time"])
    age = (now - source_at).total_seconds()
    if age < -5:
        raise ValueError("行情时间超过本机时间，需检查源时间或时钟")
    prices = [number(row[key], True) for key in ("open", "last", "high", "low")]
    if prices[2] < max(prices) - 1e-8 or prices[3] > min(prices) + 1e-8:
        raise ValueError("行情高低价关系不一致")
    number(row["volume_shares"])
    number(row["amount_yuan"])
    if len(row["bids"]) != 5 or len(row["asks"]) != 5:
        raise ValueError("五档盘口不完整")
    for levels in (row["bids"], row["asks"]):
        for level in levels:
            number(level["price"]); number(level["shares"])
    bids, asks = row["bids"], row["asks"]
    if bids[0]["price"] and asks[0]["price"] and bids[0]["price"] > asks[0]["price"]:
        raise ValueError("买一高于卖一")
    row["age_seconds"] = round(age, 3)
    row["fresh"] = 0 <= age <= 90
    row["adjust"] = "none"
    row["security_status"] = "unknown"  # quote availability is not a trading eligibility check
    return row


def parse_sina(text, codes, now):
    result = []
    records = dict(re.findall(r'(?:var\s+)?hq_str_((?:sh|sz)\d{6})="([^"\r\n]*)";', text))
    for code in codes:
        parts = records.get(symbol(code), "").split(",")
        if len(parts) < 32:
            raise ValueError(code + "：新浪返回字段不足")
        row = {"code": code, "name": parts[0], "open": number(parts[1]), "previous_close": number(parts[2]),
               "last": number(parts[3]), "high": number(parts[4]), "low": number(parts[5]),
               "volume_shares": number(parts[8]), "amount_yuan": number(parts[9]),
               "source_time": stamp(parts[30] + " " + parts[31], "%Y-%m-%d %H:%M:%S"),
               "bids": [{"shares": number(parts[10 + i * 2]), "price": number(parts[11 + i * 2])} for i in range(5)],
               "asks": [{"shares": number(parts[20 + i * 2]), "price": number(parts[21 + i * 2])} for i in range(5)],
               "source": "sina.quote"}
        result.append(validate_quote(row, now))
    return result


def parse_tencent(text, codes, now):
    result = []
    records = dict(re.findall(r'v_((?:sh|sz)\d{6})="([^"\r\n]*)";', text))
    for code in codes:
        parts = records.get(symbol(code), "").split("~")
        if len(parts) < 38 or parts[2] != code:
            raise ValueError(code + "：腾讯代码或字段不完整")
        row = {"code": code, "name": parts[1], "last": number(parts[3]), "previous_close": number(parts[4]),
               "open": number(parts[5]), "volume_shares": number(parts[6]) * 100,
               "high": number(parts[33]), "low": number(parts[34]), "amount_yuan": number(parts[37]) * 10000,
               "source_time": stamp(parts[30], "%Y%m%d%H%M%S"),
               "bids": [{"price": number(parts[9 + i * 2]), "shares": number(parts[10 + i * 2]) * 100} for i in range(5)],
               "asks": [{"price": number(parts[19 + i * 2]), "shares": number(parts[20 + i * 2]) * 100} for i in range(5)],
               "source": "tencent.quote"}
        result.append(validate_quote(row, now))
    return result


def parse_quote_batch(parser, text, codes, now):
    rows, failures = [], []
    for code in codes:
        try:
            rows.extend(parser(text, [code], now))
        except (ValueError, KeyError, IndexError) as error:
            failures.append({"code": code, "reason": str(error)[:200]})
    return {"data": rows, "validation_failures": failures}


def parse_minutes(data, code, now, allow_next_boundary=False):
    if not data or data.get("code") != code or not data.get("trends"):
        raise ValueError("分钟接口代码错误或无数据")
    rows, pending, seen = [], [], set()
    next_boundary = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for index, raw in enumerate(data["trends"]):
        p = raw.split(",")
        if len(p) < 8:
            raise ValueError("分钟字段不足")
        timestamp = datetime.strptime(p[0], "%Y-%m-%d %H:%M").replace(tzinfo=CHINA)
        if timestamp in seen:
            raise ValueError("分钟时间重复")
        seen.add(timestamp)
        clock = timestamp.strftime("%H:%M")
        if not ("09:30" <= clock <= "11:30" or "13:00" <= clock <= "15:00"):
            raise ValueError("分钟时间不在支持的交易时段")
        o, c, h, low = [number(p[i], True) for i in (1, 2, 3, 4)]
        if h < max(o, c, low) - 1e-8 or low > min(o, c, h) + 1e-8:
            raise ValueError("分钟OHLC不一致")
        row = {"time": timestamp.isoformat(), "open": o, "close": c, "high": h, "low": low,
                     "volume_shares": number(p[5]) * 100, "amount_yuan": number(p[6]),
                     # The API's boundary convention is not yet verified during live trading.
                     "closure_verified": False}
        if timestamp > now:
            clock_now = now.strftime('%H:%M')
            if not (allow_next_boundary and timestamp == next_boundary and index == len(data['trends']) - 1
                    and ('09:30' <= clock_now <= '11:30' or '13:00' <= clock_now <= '15:00')):
                raise ValueError('分钟时间超出允许的尾部边界候选')
            pending.append({**row, 'state': 'pending_boundary', 'strategy_eligible': False})
        else:
            rows.append(row)
    if not rows:
        raise ValueError('尚无已到源标签时间的分钟样本')
    reordered = any(before['time'] > after['time'] for before, after in zip(rows, rows[1:]))
    rows.sort(key=lambda row: row["time"])
    latest = datetime.fromisoformat(rows[-1]["time"])
    return {"code": code, "source": "eastmoney.minute", "adjust": "none", "rows": rows,
            "count": len(rows), "source_time": rows[-1]["time"], "age_seconds": round((now - latest).total_seconds(), 3),
            "input_quality": {"reordered": reordered, "duplicate_policy": "reject_series", "duplicate_labels": 0},
            "pending_rows": pending, "pending_count": len(pending), "pending_labels": [row['time'] for row in pending],
            "closure_verified": False, "note": "分钟接口样本；周期边界与闭合规则待盘中验证，尚不供正式策略使用"}


def parse_sina_minutes(text, code, now):
    # JSONP is parsed as data; never evaluate the provider's JavaScript wrapper.
    match = re.search(r'=\s*\((\[.*\])\)\s*;', text, re.S)
    if not match:
        raise ValueError("新浪分钟返回格式错误")
    raw = json.loads(match.group(1))
    if not raw:
        raise ValueError("新浪分钟没有记录")
    latest_date = max(row["day"][:10] for row in raw)
    trends = []
    for row in raw:
        if row["day"][:10] == latest_date:
            trends.append(','.join(map(str, [row['day'][:16], row['open'], row['close'], row['high'], row['low'],
                                             number(row['volume']) / 100, row['amount'], row['close']])))
    result = parse_minutes({"code": code, "trends": trends}, code, now, allow_next_boundary=True)
    result["source"] = "sina.minute"
    return result


def market_context(now, calendar):
    today = now.date().isoformat()
    if not calendar or today > max(calendar):
        return "calendar_unknown"
    if today not in calendar:
        return "non_trading_day"
    clock = now.strftime("%H:%M:%S")
    if "09:30:00" <= clock <= "11:30:00" or "13:00:00" <= clock <= "15:00:00":
        return "trading"
    return "market_closed"


def collect(config, runtime, rounds=1, session_factory=requests.Session, automatic=False, lane='combined'):
    if lane not in ('combined','quote','minute'):
        raise ValueError('采集类型应为combined、quote或minute')
    runtime = Path(runtime).resolve()
    codes = config["codes"]
    if not codes or len(codes) > 50 or len(set(codes)) != len(codes):
        raise ValueError("接入试验限定1—50只不重复股票")
    for code in codes:
        symbol(code)
    minute_codes=config.get('minute_codes',codes)
    if len(set(minute_codes))!=len(minute_codes) or any(code not in codes for code in minute_codes): raise ValueError('分钟股票须属于报价股票池')
    audit_codes = config.get('minute_audit_codes', codes[:3])
    if len(audit_codes) > 3 or len(set(audit_codes)) != len(audit_codes) or any(code not in minute_codes for code in audit_codes):
        raise ValueError('分钟核查先限定不超过3只已配置股票')
    source_order = config.get("minute_source_order", ["eastmoney", "sina"])
    if len(source_order) != 2 or set(source_order) != {"eastmoney", "sina"}:
        raise ValueError("分钟来源顺序应包含新浪与东财各一次")
    if lane == 'quote':
        minute_codes, audit_codes = [], []
        # Quote retries have their own small budget and never borrow the minute budget.
        config = {**config, 'targeted_recovery': {**config.get('targeted_recovery', {}), 'max_requests': 1, 'deadline_seconds': 8}}
    with refresh_lock(runtime):
        now = datetime.now(CHINA)
        run_id = now.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
        directory = runtime / "runs" / run_id
        directory.mkdir(parents=True)
        calendar = read_json(ROOT / "outputs/live-market-data/calendar.json", {}).get("dates", [])
        report = {"schema": "intraday-trial.v1", "state": "running", "run_id": run_id, "codes": codes,
                  "started_at": now.isoformat(), "scope": "小样本接入试验，仅观察", "rounds": [],
                  "account_connected": False, "automatic_enabled": False,
                  "timestamp_note": "源时间为供应商报送字段；具体语义与盘中延迟待验证，不等同逐笔成交时间"}
        report["trigger"] = "automatic" if automatic else "manual"
        report.update(minute_codes=minute_codes,pool_version=config.get('pool_version'),pool_id=config.get('pool_id'))
        report['lane'] = lane
        report['collection_profile'] = ('symbol-recovery.v3:' if lane=='combined' else 'split-collection.v1:'+lane+':') + ','.join(source_order)
        report['minute_audit'] = {'state': 'collecting', 'codes': audit_codes, 'completed_codes': [], 'errors': [],
                                  'note': '小样本标签核查；闭合语义仍待验证，不作为正式策略K线'}
        health_path = runtime / "provider-health.json"
        health = read_json(health_path, {})
        diagnostics = SymbolDiagnostics(runtime, run_id)
        budget = RecoveryBudget(runtime, time.time(), config.get("targeted_recovery"))
        report["symbol_diagnostics"] = {"state": "collecting", "run_id": run_id, "started_at": now.isoformat(), "entries": [], "recovery_events": [], "errors": [],
            "policy": {"max_symbols": budget.max_symbols, "max_requests": budget.max_requests, "deadline_seconds": budget.deadline_seconds, "cooldown_seconds": budget.cooldown_seconds}}
        report['symbol_diagnostics']['errors'] = [error for error in (diagnostics.load_error, budget.load_error) if error]
        matched_codes = set()
        store = None
        storage = {"state": "ready", "mode": "shadow", "matched_series": 0, "errors": []}
        try:
            store = IntradayStore(runtime)
        except Exception as error:
            storage.update(state="degraded", errors=[type(error).__name__])
        def storage_call(method, *args):
            if not store or storage["state"] == "degraded":
                return
            try:
                result = getattr(store, method)(*args)
                if method == "minutes":
                    if not result["matched"]:
                        storage["state"] = "degraded"
                        storage["errors"].append("分钟缓存与数据库核对不一致")
                    else:
                        matched_codes.add(args[0]["code"])
                        storage["matched_series"] = len(matched_codes)
            except Exception as error:
                storage["state"] = "degraded"
                storage["errors"].append(type(error).__name__)
        def diagnose(kind, data, received_at, stage):
            try:
                result = diagnostics.observe(kind, data, received_at, stage)
                report["symbol_diagnostics"]["entries"] = diagnostics.attempts
                return result
            except Exception as error:
                report["symbol_diagnostics"]["errors"].append(type(error).__name__)
                return {"state": "diagnostic_error", "needs_recovery": False}
        def publish_minute(check):
            parsed, code, received_at = check["data"], check["code"], check["received_at"]
            try:
                path = runtime / "minute-cache" / (code + ".json")
                saved = read_json(path, {})
                if saved and parsed["source_time"] < saved["data"]["source_time"]:
                    check["selected"] = False
                    return False
                check["selected"] = True
                atomic_json(path, {"data": parsed, "received_at": received_at, "run_id": run_id})
                atomic_json(path.with_name(path.stem + ".meta.json"), {"data": minute_metadata(parsed), "received_at": received_at, "run_id": run_id})
                storage_call("minutes", parsed, received_at, run_id)
                if code in audit_codes:
                    try:
                        check["minute_audit"] = audit_summary(observe_minute(runtime, parsed, received_at, run_id))
                        from intraday_boundary_observations import record_delivery
                        recorded_audit=read_json(runtime/'minute-audit'/(code+'.json'),{})
                        check['boundary_observation']=record_delivery(runtime,parsed,received_at,run_id,recorded_audit)
                        if code not in report["minute_audit"]["completed_codes"]:
                            report["minute_audit"]["completed_codes"].append(code)
                    except Exception as error:
                        report["minute_audit"]["errors"].append({"code": code, "error": type(error).__name__})
                return True
            except Exception as error:
                check.update(ok=False, selected=False, failure_kind="local", error=type(error).__name__)
                return False
        def save_report():
            report["storage"] = dict(storage)
            report['symbol_diagnostics']['extra_requests'] = budget.requests
            atomic_json(runtime / "status.json", report)
            atomic_json(runtime / "status-light.json", light_report(report))
        save_report()
        started = time.monotonic()
        last_request = {}
        report["metrics"] = {"request_count": 0, "cooldown_skips": 0, "wait_seconds": 0.0}
        with session_factory() as session:
            def request(source, kind, url, params=None, headers=None, parser=None, code=None, stage="initial"):
                tick = time.monotonic()
                check = {"source": source, "kind": kind, "stage": stage, "started_at": datetime.now(CHINA).isoformat()}
                if code:
                    check["code"] = code
                provider_key = source + "." + kind
                provider = health.get(provider_key, {})
                if provider.get("blocked_until", 0) > time.time():
                    report["metrics"]["cooldown_skips"] += 1
                    return {**check, "ok": False, "seconds": 0, "error": "来源冷却中", "failure_kind": "cooldown",
                            "request_sent": False, "cooldown_until": provider["blocked_until"]}
                # Limit actual requests per endpoint; a skipped failed source does not add another sleep.
                delay = max(0, 0.6 - (time.monotonic() - last_request.get(provider_key, float('-inf'))))
                delay = max(delay, .6 - (time.time() - provider.get('last_request_at', 0)))
                if stage == 'recovery' and time.monotonic() - started + delay >= budget.deadline_seconds:
                    return {**check, 'ok': False, 'request_sent': False, 'seconds': 0,
                            'failure_kind': 'recovery_budget', 'error': '复查时间预算已用完'}
                if delay:
                    time.sleep(delay)
                check["wait_seconds"] = round(delay, 3)
                report["metrics"]["wait_seconds"] += delay
                last_request[provider_key] = time.monotonic()
                report["metrics"]["request_count"] += 1
                network_started = time.monotonic()
                sent_at = time.time()
                phase = 'network'
                check['request_sent'] = True
                try:
                    response = session.get(url, params=params, headers=headers, timeout=(2, 3) if stage == "recovery" else (3, 6))
                    received = datetime.now(CHINA)
                    check['received_at'] = received.isoformat()
                    check["http_status"] = response.status_code
                    response.raise_for_status()
                    phase = 'local'
                    # Keep source payloads local for schema review; never log environment/proxy credentials.
                    if not automatic:
                        (directory / (str(len(report["rounds"])) + "-" + source + ("-" + code if code else "") + ('-recovery' if stage == 'recovery' else '') + ".txt")).write_bytes(response.content)
                    phase = 'validation'
                    parsed = parser(response, received)
                    if kind == "quote":
                        check.update(parsed)
                        check["ok"] = bool(check["data"])
                        phase = 'local'
                        for row in check["data"]:
                            diagnose("quote", row, received.isoformat(), stage)
                            path = runtime / "quote-cache" / (source + "-" + row["code"] + ".json")
                            saved = read_json(path, {})
                            if not saved or row["source_time"] >= saved["data"]["source_time"]:
                                atomic_json(path, {"data": row, "received_at": received.isoformat(), "run_id": run_id})
                        storage_call("quotes", check["data"], received.isoformat(), run_id)
                    else:
                        if automatic and market_context(received, calendar) == "trading" and parsed["age_seconds"] > 180:
                            raise ValueError("分钟来源超过180秒未更新，尝试备用来源")
                        phase = 'local'
                        check["data"] = parsed
                        parsed["version"] = minute_metadata(parsed)["version"]
                        check["ok"] = True
                        check['selected'] = False
                        observation = diagnose('minute', parsed, received.isoformat(), stage)
                        check['diagnostic_state'] = observation['state']
                        check['recovery_reason'] = observation.get('recovery_reason', observation['state'])
                        check['needs_recovery'] = observation['needs_recovery']
                    if check["ok"]:
                        health[provider_key] = {"failures": 0, "blocked_until": 0, "failure_kind": None}
                except Exception as error:
                    check.update(ok=False, error=type(error).__name__)
                    if isinstance(error, (ValueError, KeyError)):
                        check["reason"] = str(error)[:250]
                    response = getattr(error, "response", None)
                    limited = response is not None and response.status_code in (403, 429)
                    failure_kind = 'rate_limit' if limited else 'validation' if phase == 'validation' else 'local' if phase == 'local' else 'network'
                    check['failure_kind'] = failure_kind
                    # A bad symbol/payload never puts every other symbol in source cooldown.
                    if failure_kind in ('validation', 'local'):
                        health[provider_key] = {"failures": 0, "blocked_until": 0, "failure_kind": None,
                                                "last_symbol_error": {"code": code, "kind": failure_kind, "at": check.get('received_at')}}
                    failures = provider.get("failures", 0) + 1
                    cooldown = 300
                    if response is not None:
                        try:
                            cooldown = max(cooldown, float(response.headers.get("Retry-After", 0)))
                        except ValueError:
                            from email.utils import parsedate_to_datetime
                            try:
                                cooldown = max(cooldown, parsedate_to_datetime(response.headers["Retry-After"]).timestamp() - time.time())
                            except (ValueError, KeyError, TypeError):
                                pass
                    # After an earlier transport failure, expiry allows one probe; another
                    # transport failure reopens the circuit. Healthy HTTP payloads reset it.
                    until = time.time() + cooldown if failure_kind in ('network', 'rate_limit') and (failures >= 3 or limited) else 0
                    if failure_kind in ('network', 'rate_limit'):
                        health[provider_key] = {"failures": failures, "blocked_until": until, "failure_kind": failure_kind}
                    if until:
                        check["cooldown_until"] = until
                health.setdefault(provider_key, {})['last_request_at'] = sent_at
                atomic_json(health_path, health)
                check["seconds"] = round(time.monotonic() - network_started, 3)
                check["total_seconds"] = round(time.monotonic() - tick, 3)
                return check
            def minute_request(source, code, stage='initial'):
                if source == 'eastmoney':
                    return request('eastmoney', 'minute', 'https://push2his.eastmoney.com/api/qt/stock/trends2/get',
                        params={'secid': ('1.' if code.startswith('6') else '0.') + code, 'ndays': '1', 'iscr': '0',
                                'fields1': 'f1,f2,f3', 'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58'},
                        parser=lambda r, t: parse_minutes(r.json().get('data'), code, t), code=code, stage=stage)
                return request('sina', 'minute', 'https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData',
                    params={'symbol': symbol(code), 'scale': '1', 'ma': 'no', 'datalen': '300'},
                    parser=lambda r, t: parse_sina_minutes(r.text, code, t), code=code, stage=stage)
            for _ in range(min(max(rounds, 1), 3)):
                checks = []
                report["rounds"].append({"checks": checks})
                if lane != 'minute':
                    checks.append(request("sina", "quote", "https://hq.sinajs.cn/list=" + ",".join(map(symbol, codes)),
                                      headers={"Referer": "https://finance.sina.com.cn/"},
                                      parser=lambda r, t: parse_quote_batch(parse_sina, r.content.decode("gb18030"), codes, t)))
                    report['elapsed_seconds'] = round(time.monotonic()-started,3)
                    save_report()
                    checks.append(request("tencent", "quote", "https://qt.gtimg.cn/q=" + ",".join(map(symbol, codes)),
                                      parser=lambda r, t: parse_quote_batch(parse_tencent, r.content.decode("gb18030"), codes, t)))
                report["metrics"]["quote_batch_seconds"] = round(time.monotonic() - started, 3)
                # Publish quotes immediately, independently of the slower per-symbol minute backfill.
                save_report()
                transport_failures = {source: 0 for source in source_order}
                for code in minute_codes:
                    for source in source_order:
                        if transport_failures[source] >= 3:
                            check = {"source": source, "kind": "minute", "code": code, "ok": False,
                                     "error": "本轮连接连续失败，暂停该来源", "failure_kind": "circuit_skip",
                                     "request_sent": False, "seconds": 0}
                        else:
                            check = minute_request(source, code)
                        checks.append(check)
                        if check['ok']:
                            transport_failures[source] = 0
                            publish_minute(check)
                            break
                        if check.get('failure_kind') in ('network', 'rate_limit'):
                            transport_failures[source] += 1
                    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
                    save_report()
                # Recheck only lagging symbols after the normal pool has finished.
                # These calls share the same session, provider pacing and circuit state.
                initial = [check for check in checks if check.get('kind') == 'minute' and check.get('ok') and check.get('needs_recovery')]
                for old in initial:
                    code = old['code']; key = 'minute:' + code
                    event = {'kind': 'minute', 'code': code, 'initial_source': old['data']['source'],
                             'initial_source_time': old['data']['source_time'], 'reason': old['recovery_reason'],
                             'attempts': [], 'outcome': 'not_attempted', 'recovered': False}
                    report['symbol_diagnostics']['recovery_events'].append(event)
                    skip = 'outside_session' if market_context(datetime.now(CHINA), calendar) != 'trading' else budget.choose(key)
                    if skip:
                        event['outcome'] = skip; continue
                    delay = max(0, budget.delay_seconds - (datetime.now(CHINA) - datetime.fromisoformat(old['received_at'])).total_seconds())
                    if time.monotonic() - started + delay >= budget.deadline_seconds:
                        event['outcome'] = 'time_budget'; continue
                    if delay: time.sleep(delay)
                    attempted = False
                    order = [old['source']] + [source for source in source_order if source != old['source']]
                    for source in order:
                        skip = budget.allow_request(time.monotonic() - started,
                            health.get(source + '.minute', {}).get('blocked_until', 0) > time.time())
                        if skip:
                            event['attempts'].append({'source': source, 'request_sent': False, 'outcome': skip})
                            if skip != 'source_cooldown': break
                            continue
                        before = report['metrics']['request_count']
                        retry = minute_request(source, code, 'recovery'); checks.append(retry)
                        spent = report['metrics']['request_count'] - before
                        budget.requests += spent; attempted = attempted or spent > 0
                        event['attempts'].append({'source': source, 'request_sent': bool(spent), 'received_at': retry.get('received_at'),
                            'source_time': retry.get('data', {}).get('source_time'), 'outcome': 'returned' if retry['ok'] else retry.get('failure_kind', 'failed')})
                        if retry['ok'] and retry['data']['source_time'] > old['data']['source_time'] and retry['data']['age_seconds'] <= 180 and publish_minute(retry):
                            old['selected'] = False
                            event.update(outcome='advanced_after_switch' if source != old['source'] else 'advanced_after_retry', recovered=True,
                                final_source=retry['data']['source'], final_source_time=retry['data']['source_time'])
                            break
                    if not event['recovered']:
                        event['outcome'] = 'still_not_advanced' if attempted else 'budget_or_source_cooldown'
                    if attempted: budget.attempted(key, time.time(), event['outcome'])
                    report['elapsed_seconds'] = round(time.monotonic() - started, 3); save_report()
                quote_targets = [entry for entry in diagnostics.attempts if entry['kind'] == 'quote' and entry.get('stage') == 'initial' and entry.get('needs_recovery')]
                quote_groups = {}
                for entry in quote_targets:
                    key = 'quote:' + entry['code']
                    event = {'kind': 'quote', 'code': entry['code'], 'initial_source': entry['source'],
                        'initial_source_time': entry['source_time'], 'reason': entry.get('recovery_reason', entry['state']), 'attempts': [], 'recovered': False}
                    report['symbol_diagnostics']['recovery_events'].append(event)
                    skip = 'outside_session' if market_context(datetime.now(CHINA), calendar) != 'trading' else budget.choose(key)
                    event['outcome'] = skip or 'pending'
                    if not skip: quote_groups.setdefault(entry['source'].split('.')[0], []).append((entry, event))
                for source, targets in quote_groups.items():
                    skip = budget.allow_request(time.monotonic() - started, health.get(source + '.quote', {}).get('blocked_until', 0) > time.time())
                    delay = max(0, budget.delay_seconds - min((datetime.now(CHINA) - datetime.fromisoformat(entry['received_at'])).total_seconds() for entry, event in targets))
                    if time.monotonic() - started + delay >= budget.deadline_seconds: skip = 'time_budget'
                    if skip:
                        for entry, event in targets: event['outcome'] = skip
                        continue
                    if delay: time.sleep(delay)
                    wanted = [entry['code'] for entry, event in targets]
                    before = report['metrics']['request_count']
                    if source == 'sina':
                        retry = request('sina', 'quote', 'https://hq.sinajs.cn/list=' + ','.join(map(symbol, wanted)),
                            headers={'Referer': 'https://finance.sina.com.cn/'},
                            parser=lambda r, t: parse_quote_batch(parse_sina, r.content.decode('gb18030'), wanted, t), stage='recovery')
                    else:
                        retry = request('tencent', 'quote', 'https://qt.gtimg.cn/q=' + ','.join(map(symbol, wanted)),
                            parser=lambda r, t: parse_quote_batch(parse_tencent, r.content.decode('gb18030'), wanted, t), stage='recovery')
                    retry['scope'] = 'targeted'; checks.append(retry)
                    spent = report['metrics']['request_count'] - before; budget.requests += spent
                    original = next(check for check in checks if check.get('kind') == 'quote' and check['source'] == source and check.get('stage') == 'initial')
                    for entry, event in targets:
                        row = next((row for row in retry.get('data', []) if row['code'] == entry['code']), None) if retry['ok'] else None
                        event['attempts'].append({'source': source, 'request_sent': bool(spent), 'received_at': retry.get('received_at'),
                            'source_time': row['source_time'] if row else None, 'outcome': 'returned' if row else retry.get('failure_kind', 'missing_symbol')})
                        if row and row['source_time'] >= entry['source_time']:
                            original['data'] = [row if prior['code'] == row['code'] else prior for prior in original.get('data', [])]
                            original.setdefault('receipt_by_code', {})[row['code']] = retry['received_at']
                        event['recovered'] = bool(row and row['source_time'] > entry['source_time'] and
                            (datetime.fromisoformat(retry['received_at']) - datetime.fromisoformat(row['source_time'])).total_seconds() <= 90)
                        event['outcome'] = 'advanced_after_retry' if event['recovered'] else 'still_not_advanced'
                        if spent: budget.attempted('quote:' + entry['code'], time.time(), event['outcome'])
                report["rounds"][-1]["finished_at"] = datetime.now(CHINA).isoformat()
                report["elapsed_seconds"] = round(time.monotonic() - started, 3)
                save_report()
        report["finished_at"] = datetime.now(CHINA).isoformat()
        for round_entry in report['rounds']:
            for check in round_entry['checks']:
                if check['ok']: continue
                for code in [check['code']] if check.get('code') else codes:
                    prior = diagnostics.baseline(check['kind'], check['source'] + '.' + check['kind'], code)
                    diagnostics.attempts.append({'kind': check['kind'], 'source': check['source'] + '.' + check['kind'], 'code': code,
                        'run_id': run_id, 'stage': check.get('stage', 'initial'), 'state': check.get('failure_kind', 'request_failed'),
                        'source_time': None, 'received_at': check.get('received_at'), 'previous_source_time': prior.get('source_time') if prior else None,
                        'previous_run_id': prior.get('run_id') if prior else None, 'request_sent': check.get('request_sent', False),
                        'error': check.get('reason') or check.get('error'), 'needs_recovery': False})
        if diagnostics.load_error and diagnostics.load_error not in report['symbol_diagnostics']['errors']:
            report['symbol_diagnostics']['errors'].append(diagnostics.load_error)
        report['symbol_diagnostics'].update(entries=diagnostics.attempts, extra_requests=budget.requests, finished_at=report['finished_at'],
            state='degraded' if report['symbol_diagnostics']['errors'] else 'ready')
        try:
            diagnostics.finish(report['symbol_diagnostics']); budget.save()
        except Exception as error:
            report['symbol_diagnostics']['state'] = 'degraded'; report['symbol_diagnostics']['errors'].append(type(error).__name__)
        report['minute_audit']['state'] = ('degraded' if report['minute_audit']['errors'] else
                                           'ready' if len(report['minute_audit']['completed_codes']) == len(audit_codes) else 'partial')
        report["market_context"] = market_context(datetime.now(CHINA), calendar)
        last = report["rounds"][-1]["checks"]
        report["coverage"] = {"quotes": len({row["code"] for check in last if check["kind"] == "quote" and check["ok"] for row in check["data"]}),
                              "minutes": len({check["code"] for check in last if check["kind"] == "minute" and check["ok"] and check.get("selected", True)}), "total": len(codes)}
        report["cooldown_until"] = max((value.get("blocked_until", 0) for value in health.values()), default=0)
        report["state"] = "sample_available" if any(c["ok"] and c["kind"] == ('minute' if lane=='minute' else 'quote') for c in last) else "failed"
        report["message"] = "报价/盘口与分钟接口独立试验；未接账户，未自动下单；盘中持续性与分钟闭合尚待验收"
        report["elapsed_seconds"] = round(time.monotonic() - started, 3)
        if store:
            try:
                storage.update(store.summary())
            except Exception as error:
                storage["state"] = "degraded"; storage["errors"].append(type(error).__name__)
            finally:
                store.close()
        atomic_json(runtime / "storage-status.json", storage)
        # Queue persistence happens after live quotes/minutes and recovery. No backfill
        # network request runs inside the latest-data collection process.
        if lane != 'quote':
            try:
                from intraday_backfill import BackfillQueue, publish
                queue = BackfillQueue(runtime)
                try:
                    queue.sync_pool(minute_codes)
                    for code in audit_codes:
                        selected = next((check for check in last if check['kind'] == 'minute' and check.get('code') == code
                                         and check['ok'] and check.get('selected', True)), None)
                        if selected: queue.observe(selected['data'], selected['received_at'])
                    report['backfill'] = publish(queue, config.get('backfill', {}), datetime.now(CHINA), worker_state='idle')
                finally: queue.close()
            except Exception as error:
                report['backfill'] = {'state': 'degraded', 'error': type(error).__name__}
            try:
                from intraday_boundary_observations import export_observations
                boundary=export_observations(runtime,audit_codes,datetime.now(CHINA).date().isoformat())
                report['boundary_observations']={key:value for key,value in boundary.items() if key!='stocks'}
            except Exception as error:
                report['boundary_observations']={'state':'degraded','error':type(error).__name__}
        report['elapsed_seconds'] = round(time.monotonic() - started, 3)
        save_report()
        if automatic:
            # Keep full series only in current status/cache; bounded summaries avoid repeated raw payloads every minute.
            summary = {**report, "rounds": [{**r, "checks": [{k: v for k, v in check.items() if k != "data"} for check in r["checks"]]} for r in report["rounds"]]}
            if lane == 'quote':
                summary['symbol_diagnostics'] = {key:value for key,value in summary['symbol_diagnostics'].items() if key!='entries'}
                summary['symbol_diagnostics']['entry_count'] = len(report['symbol_diagnostics']['entries'])
            atomic_json(directory / "report.json", summary)
        else:
            atomic_json(directory / "report.json", report)
        return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "platform/quant-factor-platform/config/intraday-trial.json"))
    parser.add_argument("--runtime", default=str(ROOT / "outputs/live-market-data/intraday-trial"))
    parser.add_argument("--rounds", type=int, default=1)
    parser.add_argument("--automatic", action="store_true")
    parser.add_argument('--lane', choices=['combined','quote','minute'], default='combined')
    args = parser.parse_args()
    try:
        from stock_library import apply_stock_library
        report = collect(apply_stock_library(read_json(args.config),'intraday',ROOT), args.runtime, args.rounds, automatic=args.automatic,lane=args.lane)
    except RuntimeError as error:
        if "已有行情更新任务" not in str(error):
            raise
        print(json.dumps({"state": "skipped", "reason": "另一个试验仍在运行"}, ensure_ascii=False))
        return 0
    print(json.dumps({"state": report["state"], "run_id": report["run_id"], "elapsed_seconds": report["elapsed_seconds"],
                      "checks": [{"source": c["source"], "ok": c["ok"], "seconds": c["seconds"]} for c in report["rounds"][-1]["checks"]]}, ensure_ascii=False))
    return 0 if report["state"] == "sample_available" else 1


if __name__ == "__main__":
    raise SystemExit(main())
