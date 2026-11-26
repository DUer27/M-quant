#!/usr/bin/env python3
"""Import a JoinQuant printed JSON package into M-quant platform results.

The importer accepts either a clean JSON file or a copied notebook console dump
that contains one JSON object. It expands package-level ``records`` so factor
results and strategy results land in the existing platform backtest ledger.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_IMPORTED_PATH = ROOT / "platform" / "quant-factor-platform" / "data" / "imported-backtest-results.json"
DEFAULT_ARCHIVE_DIR = ROOT / "outputs" / "sources" / "joinquant" / "results"
LCR_SOURCE = "joinquant_csi500_low_crowding_reversal_index_enhancement_v0"
LCR_STRATEGY_ID = "csi500_low_crowding_reversal_index_enhancement_v0"
REQUIRED_HORIZONS = {1, 5, 10, 20}
REQUIRED_LAYER_KEYS = {
    ("high_volatility", "large_cap"),
    ("high_volatility", "mid_cap"),
    ("high_volatility", "small_cap"),
    ("medium_volatility", "large_cap"),
    ("medium_volatility", "mid_cap"),
    ("medium_volatility", "small_cap"),
    ("low_volatility", "large_cap"),
    ("low_volatility", "mid_cap"),
    ("low_volatility", "small_cap"),
}


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def extract_json_object(text: str) -> Any:
    stripped = text.strip().lstrip("\ufeff")
    if not stripped:
        raise ValueError("输入文件为空。")
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    starts = [index for index, char in enumerate(stripped) if char in "{["]
    last_error: Exception | None = None
    for start in starts:
        try:
            obj, end = decoder.raw_decode(stripped[start:])
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        trailing = stripped[start + end :].strip()
        if not trailing or trailing.startswith(("Out[", "result_json", "<")):
            return obj
        return obj
    raise ValueError(f"没有在输入中找到可解析 JSON：{last_error}")


def normalize_records(payload: Any, imported_at: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        raw_items = payload
        package = {}
    elif isinstance(payload, dict):
        package = payload
        raw_items = payload.get("records") or payload.get("results") or [payload]
    else:
        raise ValueError("JoinQuant 输出必须是 JSON 对象或数组。")

    if not isinstance(raw_items, list):
        raise ValueError("records/results 字段必须是数组。")

    rows: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        row = {
            "packageResultType": package.get("result_type") or item.get("packageResultType"),
            "packageStrategyId": package.get("strategy_id") or item.get("packageStrategyId"),
            "packageStrategyName": package.get("strategy_name") or item.get("packageStrategyName"),
            **item,
            "importedAt": imported_at,
            "source": item.get("source") or package.get("source") or "joinquant",
        }
        rows.append(row)
    return rows


def is_same_result_family(row: dict[str, Any], source: str | None, strategy_id: str | None, replace_source: bool) -> bool:
    if not replace_source:
        return False
    row_source = str(row.get("source") or "")
    row_strategy_id = str(row.get("strategy_id") or row.get("packageStrategyId") or "")
    return bool((source and row_source == source) or (strategy_id and row_strategy_id == strategy_id))


def audit_records(rows: list[dict[str, Any]]) -> dict[str, Any]:
    factor_rows = [row for row in rows if row.get("result_type") == "factor_backtest"]
    strategy_rows = [row for row in rows if row.get("result_type") in {"strategy_backtest", "strategy_regime_size_backtest", "strategy_trading_backtest", "local_strategy_backtest"}]
    trading_rows = [row for row in strategy_rows if row.get("result_type") in {"strategy_trading_backtest", "local_strategy_backtest"}]
    factor_horizons = {int(row.get("horizon")) for row in factor_rows if str(row.get("horizon", "")).isdigit()}
    strategy_horizons = {int(row.get("horizon")) for row in strategy_rows if str(row.get("horizon", "")).isdigit()}
    event_horizons = {int(row.get("horizon")) for row in strategy_rows if row.get("result_type") in {"strategy_backtest", "strategy_regime_size_backtest"} and str(row.get("horizon", "")).isdigit()}
    trading_horizons = {
        int(row.get("rebalance_days") or row.get("horizon"))
        for row in trading_rows
        if str(row.get("rebalance_days") or row.get("horizon") or "").isdigit()
    }
    layer_keys = {
        (row.get("market_regime"), row.get("market_cap_bucket"))
        for row in strategy_rows
        if row.get("market_regime") and row.get("market_cap_bucket")
    }
    trading_layer_keys = {
        (int(row.get("rebalance_days") or row.get("horizon") or 0), row.get("market_regime"), row.get("market_cap_bucket"))
        for row in trading_rows
        if str(row.get("rebalance_days") or row.get("horizon") or "").isdigit() and row.get("market_regime") and row.get("market_cap_bucket")
    }
    overall_trading_rows = [row for row in trading_rows if not row.get("market_regime") and not row.get("market_cap_bucket")]
    source_set = sorted({str(row.get("source") or "") for row in rows if row.get("source")})
    strategy_set = sorted({str(row.get("strategy_id") or row.get("packageStrategyId") or "") for row in rows if row.get("strategy_id") or row.get("packageStrategyId")})
    return {
        "row_count": len(rows),
        "factor_backtest_rows": len(factor_rows),
        "strategy_rows": len(strategy_rows),
        "trading_rows": len(trading_rows),
        "overall_trading_rows": len(overall_trading_rows),
        "factor_horizons": sorted(factor_horizons),
        "strategy_horizons": sorted(strategy_horizons),
        "event_horizons": sorted(event_horizons),
        "trading_horizons": sorted(trading_horizons),
        "missing_factor_horizons": sorted(REQUIRED_HORIZONS - factor_horizons),
        "missing_strategy_horizons": sorted(REQUIRED_HORIZONS - strategy_horizons),
        "missing_event_horizons": sorted(REQUIRED_HORIZONS - event_horizons),
        "missing_trading_horizons": sorted(REQUIRED_HORIZONS - trading_horizons),
        "layer_count": len(layer_keys),
        "trading_layer_matrix_count": len(trading_layer_keys),
        "expected_trading_layer_matrix_count": len(REQUIRED_HORIZONS) * len(REQUIRED_LAYER_KEYS),
        "missing_layer_keys": sorted(REQUIRED_LAYER_KEYS - layer_keys),
        "source_set": source_set,
        "strategy_set": strategy_set,
        "lcr_package_detected": LCR_SOURCE in source_set or LCR_STRATEGY_ID in strategy_set,
    }


def archive_payload(payload: Any, archive_dir: Path, source: str | None, strategy_id: str | None) -> Path:
    archive_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_id = (strategy_id or source or "joinquant_result").replace("/", "_").replace(" ", "_")
    path = archive_dir / f"{safe_id}_{stamp}.json"
    write_json(path, payload)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a JoinQuant JSON package into M-quant imported backtest results.")
    parser.add_argument("input", help="Path to a clean JSON file or copied JoinQuant console output containing JSON.")
    parser.add_argument("--imported-path", default=str(DEFAULT_IMPORTED_PATH), help="Platform imported-backtest-results.json path.")
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE_DIR), help="Directory to archive the raw parsed package.")
    parser.add_argument("--append", action="store_true", help="Append without replacing existing rows with the same source/strategy_id.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and audit only; do not write files.")
    args = parser.parse_args()

    input_path = Path(args.input)
    payload = extract_json_object(input_path.read_text(encoding="utf-8"))
    imported_at = datetime.now().isoformat(timespec="milliseconds") + "Z"
    rows = normalize_records(payload, imported_at)
    audit = audit_records(rows)
    package_source = audit["source_set"][0] if len(audit["source_set"]) == 1 else (payload.get("source") if isinstance(payload, dict) else None)
    package_strategy_id = audit["strategy_set"][0] if len(audit["strategy_set"]) == 1 else (payload.get("strategy_id") if isinstance(payload, dict) else None)

    result = {
        "input": str(input_path),
        "dry_run": bool(args.dry_run),
        "append": bool(args.append),
        "audit": audit,
    }

    if not args.dry_run:
        imported_path = Path(args.imported_path)
        existing = read_json(imported_path, []) or []
        kept = [
            row for row in existing
            if not is_same_result_family(row, package_source, package_strategy_id, replace_source=not args.append)
        ]
        archive_path = archive_payload(payload, Path(args.archive_dir), package_source, package_strategy_id)
        write_json(imported_path, rows + kept)
        result.update({
            "archive_path": str(archive_path.relative_to(ROOT)),
            "removed_existing_rows": len(existing) - len(kept),
            "imported_rows": len(rows),
            "total_rows": len(rows) + len(kept),
        })

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
