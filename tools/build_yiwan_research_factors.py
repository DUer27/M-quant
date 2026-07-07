import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path("/Users/Admin/Documents/Codex/2026-07-06/ke")
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "research-factor-pipeline"


HUAFU_KLINE_RULES = [
    {
        "id": "bullish_marubozu",
        "name": "看涨光头光脚线",
        "score": 2,
        "holding_days": 3,
        "kelly": 0.2292,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "bearish_marubozu",
        "name": "看跌光头光脚线",
        "score": -2,
        "holding_days": 2,
        "kelly": -0.1905,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "big_bullish_candle",
        "name": "大阳线",
        "score": 2,
        "holding_days": 2,
        "kelly": 0.1115,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "big_bearish_candle",
        "name": "大阴线",
        "score": 2,
        "holding_days": 19,
        "kelly": 0.1107,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "hammer",
        "name": "锤子线",
        "score": -3,
        "holding_days": 2,
        "kelly": -0.2194,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "shooting_star",
        "name": "射击之星",
        "score": 2,
        "holding_days": 4,
        "kelly": 0.1862,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "doji",
        "name": "十字星",
        "score": 1,
        "holding_days": 20,
        "kelly": 0.076,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "dragonfly_doji",
        "name": "蜻蜓十字星",
        "score": 2,
        "holding_days": 1,
        "kelly": 0.1126,
        "source": "华福证券PDF第17页",
    },
    {
        "id": "gravestone_doji",
        "name": "墓碑十字星",
        "score": -2,
        "holding_days": 1,
        "kelly": -0.1951,
        "source": "华福证券PDF第17页",
    },
]


FIELD_ALIASES = {
    "code": ["stock_code", "code", "dm", "gpdm", "symbol"],
    "name": ["stock_name", "name", "mc", "gpmc"],
    "date": ["stock_date", "date_time", "date", "trade_date", "tdate", "data1"],
    "open": ["kaipan", "open", "open_price"],
    "high": ["zuigao", "high", "high_price"],
    "low": ["zuidi", "low", "low_price"],
    "close": ["shoupan", "zuixin", "close", "close_price", "price"],
    "volume": ["zongshou", "volume", "vol", "chengjiaoliang"],
    "amount": ["jine", "amount", "turnover_amount"],
    "change_pct": ["zhangfu", "zdfd", "pct_chg", "change_pct"],
    "amplitude": ["zhengfu", "amplitude"],
    "turnover": ["huanshou", "hslv", "turnover"],
    "volume_ratio": ["liangbi", "lbi", "volume_ratio"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build real factor research outputs from Yiwan CSV or research pack JSON.")
    parser.add_argument("--input", required=True, help="Path to yiwan-research-pack JSON, summary JSON, or indicators CSV.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for generated factor files.")
    parser.add_argument("--top", type=int, default=100, help="Top rows to include in summary.")
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def to_number(value: Any) -> float:
    if value is None:
        return math.nan
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("%", "")
    if text in {"", "-", "--", "null", "None", "nan"}:
        return math.nan
    try:
        return float(text)
    except ValueError:
        return math.nan


def num_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.replace("%", "", regex=False), errors="coerce")


def rank_pct(series: pd.Series, ascending: bool = True) -> pd.Series:
    return num_series(series).rank(pct=True, ascending=ascending, method="average").fillna(0.5)


def clip01(series: pd.Series) -> pd.Series:
    return series.clip(lower=0, upper=1)


def first_existing(columns: list[str], aliases: list[str]) -> str | None:
    lowered = {column.lower(): column for column in columns}
    for alias in aliases:
        if alias in columns:
            return alias
        if alias.lower() in lowered:
            return lowered[alias.lower()]
    return None


def canonicalize_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    mapping: dict[str, str] = {}
    for canonical, aliases in FIELD_ALIASES.items():
        found = first_existing(list(df.columns), aliases)
        if found:
            mapping[canonical] = found
            if canonical not in df.columns:
                df[canonical] = df[found]
    return df, mapping


def rows_from_any(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        for key in ("list", "rows", "data", "items"):
            if isinstance(value.get(key), list):
                return [row for row in value[key] if isinstance(row, dict)]
        return [value]
    return []


def flatten_research_pack(payload: dict[str, Any]) -> dict[str, pd.DataFrame]:
    datasets: dict[str, pd.DataFrame] = {}

    if isinstance(payload.get("indicators_current"), list):
        datasets["indicators_current"] = pd.DataFrame(rows_from_any(payload.get("indicators_current")))

    for dataset_name in [
        "dark_factor_by_date",
        "main_force_by_date",
        "active_ap_stock_by_date",
        "big_ap_by_date",
        "big_market_daily_by_date",
    ]:
        value = payload.get(dataset_name)
        if not isinstance(value, dict):
            continue
        all_rows: list[dict[str, Any]] = []
        for date, date_payload in value.items():
            for row in rows_from_any(date_payload):
                next_row = dict(row)
                next_row.setdefault("source_date", date)
                next_row.setdefault("date", date)
                all_rows.append(next_row)
        datasets[dataset_name] = pd.DataFrame(all_rows)

    if payload.get("big_market_current") is not None:
        datasets["big_market_current"] = pd.DataFrame(rows_from_any(payload.get("big_market_current")))

    return datasets


def load_input(path: Path) -> tuple[str, dict[str, Any], dict[str, pd.DataFrame]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path, low_memory=False)
        return "csv", {"source_file": str(path)}, {"indicators_current": df}

    payload = read_json(path)
    if isinstance(payload, dict) and "datasets" in payload and "indicators_current" not in payload:
        return "summary_json", payload, {}
    if isinstance(payload, dict) and payload.get("meta", {}).get("type") == "indicators_pages":
        return "batch_indicators_json", payload, {"indicators_current": pd.DataFrame(rows_from_any(payload.get("indicators_current")))}
    if isinstance(payload, dict):
        return "research_pack_json", payload, flatten_research_pack(payload)
    raise ValueError("Unsupported input format")


def dataset_report(datasets: dict[str, pd.DataFrame]) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for name, df in datasets.items():
        report[name] = {
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "fields": list(map(str, df.columns[:200])),
        }
    return report


def has_columns(df: pd.DataFrame, columns: list[str]) -> bool:
    return all(column in df.columns for column in columns)


def score_from_dir_columns(df: pd.DataFrame, columns: list[str], weights: list[float] | None = None) -> pd.Series:
    available = [column for column in columns if column in df.columns]
    if not available:
        return pd.Series(0.5, index=df.index)
    if weights is None:
        weights = [1 / len(available)] * len(available)
    if len(weights) != len(columns):
        weights = [1 / len(available)] * len(available)
    score = pd.Series(0.0, index=df.index)
    total = 0.0
    for column, weight in zip(columns, weights):
        if column not in df.columns:
            continue
        score += num_series(df[column]).fillna(0).clip(lower=0, upper=1) * weight
        total += weight
    return score / total if total else pd.Series(0.5, index=df.index)


def build_indicator_factors(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    factors = pd.DataFrame(index=df.index)
    availability: dict[str, Any] = {}

    trend_cols = ["ma5_dir", "ma13_dir", "ma20_dir", "ma30_dir", "ma60_dir", "ma120_dir", "ma250_dir"]
    factors["trend_alignment"] = score_from_dir_columns(
        df,
        trend_cols,
        [0.22, 0.18, 0.16, 0.14, 0.12, 0.10, 0.08],
    )
    availability["trend_alignment"] = {"status": "computed", "fields": [col for col in trend_cols if col in df.columns]}

    volume_ratio_rank = rank_pct(df["volume_ratio"], ascending=True) if "volume_ratio" in df else pd.Series(0.5, index=df.index)
    turnover_rank = rank_pct(df["turnover"], ascending=True) if "turnover" in df else pd.Series(0.5, index=df.index)
    amount_rank = rank_pct(df["amount"], ascending=True) if "amount" in df else pd.Series(0.5, index=df.index)
    factors["volume_price_confirmation"] = clip01(
        0.35 * score_from_dir_columns(df, ["mavol5_dir", "mavol10_dir"])
        + 0.25 * factors["trend_alignment"]
        + 0.20 * volume_ratio_rank
        + 0.10 * turnover_rank
        + 0.10 * amount_rank
    )
    availability["volume_price_confirmation"] = {"status": "computed", "fields": ["mavol5_dir", "mavol10_dir", "volume_ratio", "turnover", "amount"]}

    if has_columns(df, ["stockk", "stockd", "stockj"]):
        kdj_dir_score = score_from_dir_columns(df, ["stockk_dir", "stockd_dir", "stockj_dir"])
        k_minus_d = num_series(df["stockk"]) - num_series(df["stockd"])
        factors["kdj_momentum"] = clip01(
            0.45 * kdj_dir_score
            + 0.35 * rank_pct(k_minus_d, ascending=True)
            + 0.20 * rank_pct(df["stockj"], ascending=True)
            - (num_series(df["stockj"]) > 100).astype(float) * 0.15
        )
        availability["kdj_momentum"] = {"status": "computed", "fields": ["stockk", "stockd", "stockj"]}
    else:
        factors["kdj_momentum"] = pd.Series(0.5, index=df.index)
        availability["kdj_momentum"] = {"status": "unavailable", "reason": "缺少 stockk/stockd/stockj"}

    if has_columns(df, ["macd", "diff", "dea"]):
        diff_minus_dea = num_series(df["diff"]) - num_series(df["dea"])
        factors["macd_acceleration"] = clip01(
            0.45 * score_from_dir_columns(df, ["macd_dir", "diff_dir", "dea_dir"])
            + 0.30 * rank_pct(df["macd"], ascending=True)
            + 0.25 * rank_pct(diff_minus_dea, ascending=True)
        )
        availability["macd_acceleration"] = {"status": "computed", "fields": ["macd", "diff", "dea"]}
    else:
        factors["macd_acceleration"] = pd.Series(0.5, index=df.index)
        availability["macd_acceleration"] = {"status": "unavailable", "reason": "缺少 macd/diff/dea"}

    if has_columns(df, ["huolipan", "taolaopan"]):
        profit_rank = rank_pct(df["huolipan"], ascending=True)
        trap_rank = rank_pct(df["taolaopan"], ascending=True)
        overlap_penalty = rank_pct(df["qujianchonghe"], ascending=True) if "qujianchonghe" in df else pd.Series(0.5, index=df.index)
        factors["chip_health"] = clip01(0.55 * profit_rank + 0.30 * (1 - trap_rank) + 0.15 * (1 - overlap_penalty))
        availability["chip_health"] = {"status": "computed", "fields": ["huolipan", "taolaopan", "qujianchonghe"]}
    else:
        factors["chip_health"] = pd.Series(0.5, index=df.index)
        availability["chip_health"] = {"status": "unavailable", "reason": "缺少 huolipan/taolaopan"}

    change_rank = rank_pct(df["change_pct"], ascending=True) if "change_pct" in df else pd.Series(0.5, index=df.index)
    amplitude_rank = rank_pct(df["amplitude"], ascending=True) if "amplitude" in df else pd.Series(0.5, index=df.index)
    factors["intraday_strength"] = clip01(0.40 * change_rank + 0.20 * amplitude_rank + 0.20 * volume_ratio_rank + 0.20 * turnover_rank)
    availability["intraday_strength"] = {"status": "computed", "fields": ["change_pct", "amplitude", "volume_ratio", "turnover"]}

    factors["crowding_risk"] = clip01(
        0.30 * turnover_rank
        + 0.25 * volume_ratio_rank
        + 0.20 * amplitude_rank
        + 0.15 * change_rank
        + 0.10 * (1 - factors["chip_health"])
    )
    availability["crowding_risk"] = {"status": "computed", "fields": ["turnover", "volume_ratio", "amplitude", "change_pct", "chip_health"]}

    factors["technical_composite"] = clip01(
        0.25 * factors["trend_alignment"]
        + 0.20 * factors["volume_price_confirmation"]
        + 0.18 * factors["macd_acceleration"]
        + 0.15 * factors["kdj_momentum"]
        + 0.12 * factors["chip_health"]
        + 0.10 * factors["intraday_strength"]
    )
    availability["technical_composite"] = {"status": "computed", "fields": ["trend_alignment", "volume_price_confirmation", "macd_acceleration", "kdj_momentum", "chip_health", "intraday_strength"]}

    return factors, availability


def detect_kline_patterns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    required = ["open", "high", "low", "close"]
    if not has_columns(df, required):
        return pd.DataFrame(index=df.index), {
            "kline_score": {
                "status": "unavailable",
                "reason": "缺少 OHLC 字段，至少需要 open/high/low/close；网站字段通常对应 kaipan/zuigao/zuidi/zuixin。",
            }
        }

    open_ = num_series(df["open"])
    high = num_series(df["high"])
    low = num_series(df["low"])
    close = num_series(df["close"])
    day_range = (high - low).replace(0, np.nan)
    body = (close - open_).abs()
    upper = high - np.maximum(open_, close)
    lower = np.minimum(open_, close) - low
    body_ratio = body / day_range
    upper_ratio = upper / day_range
    lower_ratio = lower / day_range
    signed_return = (close - open_) / open_.replace(0, np.nan)

    patterns = pd.DataFrame(index=df.index)
    patterns["bullish_marubozu"] = (close > open_) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)
    patterns["bearish_marubozu"] = (close < open_) & (upper_ratio <= 0.08) & (lower_ratio <= 0.08) & (body_ratio >= 0.82)
    patterns["big_bullish_candle"] = (signed_return >= 0.05) & (body_ratio >= 0.65)
    patterns["big_bearish_candle"] = (signed_return <= -0.05) & (body_ratio >= 0.65)
    patterns["hammer"] = (lower_ratio >= 0.55) & (upper_ratio <= 0.18) & (body_ratio <= 0.35)
    patterns["shooting_star"] = (upper_ratio >= 0.55) & (lower_ratio <= 0.18) & (body_ratio <= 0.35)
    patterns["doji"] = body_ratio <= 0.08
    patterns["dragonfly_doji"] = patterns["doji"] & (lower_ratio >= 0.60) & (upper_ratio <= 0.12)
    patterns["gravestone_doji"] = patterns["doji"] & (upper_ratio >= 0.60) & (lower_ratio <= 0.12)

    score = pd.Series(0.0, index=df.index)
    hit_names: list[list[str]] = [[] for _ in range(len(df))]
    for rule in HUAFU_KLINE_RULES:
        mask = patterns[rule["id"]].fillna(False)
        score += mask.astype(float) * rule["score"]
        for row_position in np.where(mask.to_numpy())[0]:
            hit_names[row_position].append(rule["name"])

    result = pd.DataFrame(index=df.index)
    result["kline_event_score"] = score
    result["kline_event_count"] = patterns.sum(axis=1)
    result["kline_patterns"] = [";".join(names) if names else "" for names in hit_names]

    availability = {
        "kline_event_score": {
            "status": "computed",
            "fields": required,
            "note": "当前实现为可复现的单根K线子集；多根形态需要更长OHLCV历史和形态识别规则。",
            "rules": HUAFU_KLINE_RULES,
        }
    }
    return result, availability


def build_volume_price_resonance(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    required = ["code", "date", "close", "volume"]
    if not has_columns(df, required):
        return pd.DataFrame(index=df.index), {
            "volume_price_resonance_60_5": {
                "status": "unavailable",
                "reason": "缺少 code/date/close/volume，无法计算价量共振。",
            }
        }

    work = df.copy()
    work["_date"] = pd.to_datetime(work["date"], errors="coerce")
    work["_close"] = num_series(work["close"])
    work["_volume"] = num_series(work["volume"])
    work = work.sort_values(["code", "_date"])
    group = work.groupby("code", group_keys=False)

    volume_short = group["_volume"].rolling(5, min_periods=5).mean().reset_index(level=0, drop=True)
    volume_long = group["_volume"].rolling(240, min_periods=240).mean().reset_index(level=0, drop=True)
    price_ma60 = group["_close"].rolling(60, min_periods=60).mean().reset_index(level=0, drop=True)
    price_ma60_lag5 = group[price_ma60.name if price_ma60.name else "_close"] if False else price_ma60.groupby(work["code"]).shift(5)

    resonance = (volume_short / volume_long.replace(0, np.nan)) * (price_ma60 / price_ma60_lag5.replace(0, np.nan))
    output = pd.DataFrame(index=work.index)
    output["volume_price_resonance_60_5"] = resonance
    output["emotion_overheat_flag"] = resonance > 2

    valid_count = int(output["volume_price_resonance_60_5"].notna().sum())
    availability = {
        "volume_price_resonance_60_5": {
            "status": "computed" if valid_count else "unavailable",
            "fields": required,
            "valid_rows": valid_count,
            "reason": "" if valid_count else "有效行数为0；该因子需要每只股票至少240个交易日的成交量和65个交易日的价格。",
            "formula": "MA(volume,5)/MA(volume,240) * MA(close,60)/lag(MA(close,60),5)",
        }
    }
    return output.reindex(df.index), availability


def classify(row: pd.Series) -> str:
    score = row.get("technical_composite", 0.5)
    crowding = row.get("crowding_risk", 0.5)
    kline = row.get("kline_event_score", 0)
    if score >= 0.70 and crowding <= 0.75 and kline >= 0:
        return "强势候选"
    if score >= 0.60 or kline > 0:
        return "观察候选"
    if score <= 0.40 or kline < 0:
        return "弱势过滤"
    return "中性"


def build_factor_rows(input_kind: str, datasets: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict[str, Any]]:
    if "indicators_current" not in datasets or datasets["indicators_current"].empty:
        return pd.DataFrame(), {
            "status": "unavailable",
            "reason": "没有 indicators_current 明细表；summary 文件只有行数和字段，不能计算因子。",
        }

    df = datasets["indicators_current"].copy()
    df, field_mapping = canonicalize_columns(df)
    factors, availability = build_indicator_factors(df)
    kline_factors, kline_availability = detect_kline_patterns(df)
    resonance_factors, resonance_availability = build_volume_price_resonance(df)

    merged = pd.concat([factors, kline_factors, resonance_factors], axis=1)
    availability.update(kline_availability)
    availability.update(resonance_availability)

    if "volume_price_resonance_60_5" in merged and merged["volume_price_resonance_60_5"].notna().any():
        z = merged.groupby(df["date"])["volume_price_resonance_60_5"].transform(lambda s: (s - s.mean()) / s.std(ddof=0) if s.std(ddof=0) else np.nan)
        merged["low_emotion_score"] = -z
        merged["emotion_weighted_kline_score"] = merged["low_emotion_score"] * merged.get("kline_event_score", 0)
        availability["low_emotion_score"] = {"status": "computed", "formula": "-zscore(volume_price_resonance_60_5) by date"}
        availability["emotion_weighted_kline_score"] = {"status": "computed", "formula": "low_emotion_score * kline_event_score"}
    else:
        merged["low_emotion_score"] = np.nan
        merged["emotion_weighted_kline_score"] = np.nan
        availability["low_emotion_score"] = {"status": "unavailable", "reason": "价量共振因子无有效值，无法横截面标准化。"}
        availability["emotion_weighted_kline_score"] = {"status": "unavailable", "reason": "缺少有效价量共振或K线评分。"}

    id_columns = [column for column in ["code", "name", "date", "close", "change_pct", "amplitude", "volume_ratio", "turnover", "amount"] if column in df.columns]
    result = pd.concat([df[id_columns].copy(), merged], axis=1)
    if "code" in result.columns:
        result["stock_code"] = result["code"].astype(str).str.zfill(6)
    if "name" in result.columns:
        result["stock_name"] = result["name"]
    if "date" in result.columns:
        result["stock_date"] = result["date"]
    for column in merged.columns:
        if pd.api.types.is_numeric_dtype(result[column]):
            result[column] = result[column].round(6)
    result["factor_label"] = merged.apply(classify, axis=1)
    result["technical_rank"] = merged["technical_composite"].rank(ascending=False, method="first").astype(int)
    result = result.sort_values(["technical_rank"], ascending=True)

    meta = {
        "status": "computed",
        "input_kind": input_kind,
        "rows": int(len(result)),
        "field_mapping": field_mapping,
        "availability": availability,
    }
    return result, meta


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    input_kind, payload, datasets = load_input(input_path)
    rows, factor_meta = build_factor_rows(input_kind, datasets)

    summary = {
        "source_file": str(input_path),
        "input_kind": input_kind,
        "payload_meta": payload.get("meta", payload if input_kind == "csv" else {}) if isinstance(payload, dict) else {},
        "datasets": dataset_report(datasets),
        "factor_meta": factor_meta,
        "huafu_pdf_replicable_factors": [
            {
                "id": "kline_event_score",
                "name": "K线形态离散评分因子",
                "status": factor_meta.get("availability", {}).get("kline_event_score", {}).get("status", "unavailable") if isinstance(factor_meta, dict) else "unavailable",
            },
            {
                "id": "volume_price_resonance_60_5",
                "name": "价量共振情绪因子",
                "status": factor_meta.get("availability", {}).get("volume_price_resonance_60_5", {}).get("status", "unavailable") if isinstance(factor_meta, dict) else "unavailable",
            },
            {
                "id": "low_emotion_score",
                "name": "低情绪反向因子",
                "status": factor_meta.get("availability", {}).get("low_emotion_score", {}).get("status", "unavailable") if isinstance(factor_meta, dict) else "unavailable",
            },
            {
                "id": "emotion_weighted_kline_score",
                "name": "情绪系数加权K线因子",
                "status": factor_meta.get("availability", {}).get("emotion_weighted_kline_score", {}).get("status", "unavailable") if isinstance(factor_meta, dict) else "unavailable",
            },
        ],
        "validation_limits": [
            "没有未来收益标签时，不输出IC、胜率、年化收益或Top组合表现。",
            "价量共振_60_5严格需要至少240个交易日成交量；历史不足时不使用短样本替代。",
            "当前K线评分只复现PDF中可由单日OHLC明确识别的子集，多根形态需后续补充规则和更长历史。",
        ],
    }

    if not rows.empty:
        csv_path = output_dir / "yiwan-research-factor-results.csv"
        json_path = output_dir / "yiwan-research-factor-results.json"
        rows.to_csv(csv_path, index=False, encoding="utf-8-sig")
        write_json(json_path, rows.replace({np.nan: None}).to_dict(orient="records"))
        summary["outputs"] = {"csv": str(csv_path), "json": str(json_path)}
        summary["top"] = rows.head(args.top).replace({np.nan: None}).to_dict(orient="records")
    else:
        summary["outputs"] = {}
        summary["top"] = []

    summary_path = output_dir / "yiwan-research-factor-summary.json"
    write_json(summary_path, summary)

    print(json.dumps({
        "source": str(input_path),
        "input_kind": input_kind,
        "rows": int(len(rows)),
        "summary": str(summary_path),
        "outputs": summary.get("outputs", {}),
        "factor_status": factor_meta,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
