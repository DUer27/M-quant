# M-quant JoinQuant notebook batch runner for structured reversal slices.
# Paste this into a JoinQuant Python3 research notebook. It writes one small
# batch script and one JSON/status pair per run to avoid the 1.0G memory ceiling.

from pathlib import Path
import contextlib
import io
import json
import runpy
import traceback


# Change only these parameters in JoinQuant.
SLICE_START = "2026-01-01"
SLICE_END = "2026-03-31"
SECURITY_BATCH_OFFSET = 0
SECURITY_BATCH_LIMIT = 80
TAG = "2026q1_b000_080"


BASE_SCRIPT = r'''
__M_QUANT_STRUCTURED_REVERSAL_SCRIPT__
'''


def extract_json_object(text):
    stripped = text.strip().lstrip('\ufeff')
    decoder = json.JSONDecoder()
    for start, char in enumerate(stripped):
        if char not in '[{':
            continue
        try:
            obj, _end = decoder.raw_decode(stripped[start:])
        except ValueError:
            continue
        return obj
    return None


def summarize_payload(text):
    payload = extract_json_object(text)
    if not isinstance(payload, dict):
        return {'payload_found': False}
    sample = payload.get('sample') or {}
    rows = payload.get('factor_rows') or []
    return {
        'payload_found': True,
        'payload_result_type': payload.get('result_type'),
        'payload_status': payload.get('status') or 'ok',
        'payload_strategy_id': payload.get('strategy_id'),
        'factor_rows': sample.get('factor_rows') or len(rows),
        'factor_dates': sample.get('factor_dates'),
        'unique_securities': sample.get('unique_securities'),
    }


def main():
    src = BASE_SCRIPT
    src = src.replace('RUN_MODE = "full_package"', 'RUN_MODE = "slice"')
    src = src.replace('SLICE_START = ""', 'SLICE_START = "{}"'.format(SLICE_START))
    src = src.replace('SLICE_END = ""', 'SLICE_END = "{}"'.format(SLICE_END))
    src = src.replace('SECURITY_BATCH_OFFSET = 0', 'SECURITY_BATCH_OFFSET = {}'.format(int(SECURITY_BATCH_OFFSET)))
    src = src.replace('SECURITY_BATCH_LIMIT = 0', 'SECURITY_BATCH_LIMIT = {}'.format(int(SECURITY_BATCH_LIMIT)))
    src = src.replace('PRICE_FETCH_BATCH_SIZE = 80', 'PRICE_FETCH_BATCH_SIZE = 40')
    src = src.replace('HIGH_FREQ_BATCH_SIZE = 30', 'HIGH_FREQ_BATCH_SIZE = 10')
    src = src.replace('raise SystemExit(main())', 'main()')

    script_path = Path('m_quant_structured_reversal_slice_{}.py'.format(TAG))
    out_path = Path('joinquant_structured_reversal_slice_{}.json'.format(TAG))
    err_path = Path('joinquant_structured_reversal_slice_{}_stderr.txt'.format(TAG))
    status_path = Path('joinquant_structured_reversal_slice_{}_status.json'.format(TAG))
    script_path.write_text(src, encoding='utf-8')

    buf = io.StringIO()
    err = ''
    try:
        with contextlib.redirect_stdout(buf):
            runpy.run_path(str(script_path), run_name='__main__')
        status = {
            'ok': True,
            'exit_code': 0,
            'stdout_chars': len(buf.getvalue()),
            'output_file': str(out_path),
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }
        status.update(summarize_payload(buf.getvalue()))
    except SystemExit as exc:
        code = exc.code if exc.code is not None else 0
        ok = code == 0
        if not ok:
            err = traceback.format_exc()
        status = {
            'ok': ok,
            'exit_code': code,
            'stdout_chars': len(buf.getvalue()),
            'output_file': str(out_path),
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }
        status.update(summarize_payload(buf.getvalue()))
        if err:
            status['error_tail'] = err[-3000:]
    except BaseException:
        err = traceback.format_exc()
        status = {
            'ok': False,
            'exit_code': 1,
            'stdout_chars': len(buf.getvalue()),
            'error_tail': err[-3000:],
            'slice_start': SLICE_START,
            'slice_end': SLICE_END,
            'security_batch_offset': int(SECURITY_BATCH_OFFSET),
            'security_batch_limit': int(SECURITY_BATCH_LIMIT),
            'tag': TAG,
        }

    out_path.write_text(buf.getvalue(), encoding='utf-8')
    err_path.write_text(err, encoding='utf-8')
    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(status, ensure_ascii=False, indent=2))


main()
