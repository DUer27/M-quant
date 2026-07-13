from bigmodule import M
import pandas as pd
import re


"""
M-quant BigQuant upload-only strategy file.

Purpose:
- Run the audited M-quant akshare_local_switch latest signal on BigQuant.
- Avoid score_to_position comma parser errors.
- Avoid non-serializable date objects in BigQuant module parameters.
- Preserve the project strategy scope without fabricating any BigQuant result.

Evidence scope:
- sleeve_id: akshare_local_switch
- strategy_id: akshare_regime_switch_contraction_mean_reversion_v1
- component_strategy_id: ak_mean_reversion_quality_combo
- signal_date: 2026-07-09
- tradeability_review: passed in JoinQuant, 15 tradable / 0 blocked

Data-label note:
- If using a BigQuant upstream data task, publish the same rows below as a
  data table and set its output label to:
  mquant_akshare_local_switch_signal_20260709
- The simulation task should depend on that label.
- This file is self-contained for upload testing, so it does not require the
  upstream label to exist.
"""


SLEEVE_ID = "akshare_local_switch"
STRATEGY_ID = "akshare_regime_switch_contraction_mean_reversion_v1"
COMPONENT_STRATEGY_ID = "ak_mean_reversion_quality_combo"
SIGNAL_DATE = "2026-07-09"
EXECUTION_DATE = "2026-07-10"
REBALANCE_DAYS = 5
CAPITAL_BASE = 1000000
TRADING_DAY_INDEX = 0


# Audited M-quant latest signal. Scores come from real AkShare OHLCV signal
# generation and JoinQuant tradeability review; no BigQuant result is inferred.
SELECTED = [
    ("002001.SZ", "002001", "Xinhecheng", 0.7130434782608696),
    ("000568.SZ", "000568", "Luzhou Laojiao", 0.7113043478260870),
    ("000858.SZ", "000858", "Wuliangye", 0.6517391304347826),
    ("000425.SZ", "000425", "XCMG Machinery", 0.6321739130434783),
    ("000338.SZ", "000338", "Weichai Power", 0.6321739130434783),
    ("000651.SZ", "000651", "Gree Electric", 0.6060869565217390),
    ("000001.SZ", "000001", "Ping An Bank", 0.5130434782608695),
    ("002142.SZ", "002142", "Bank of Ningbo", 0.5126086956521740),
    ("000776.SZ", "000776", "GF Securities", 0.4878260869565217),
    ("002027.SZ", "002027", "Focus Media", 0.4578260869565217),
    ("002241.SZ", "002241", "Goertek", 0.4134782608695652),
    ("002179.SZ", "002179", "AVIC Jonhon", 0.3417391304347826),
    ("002230.SZ", "002230", "iFlytek", 0.3373913043478261),
    ("002415.SZ", "002415", "Hikvision", 0.3243478260869566),
    ("002714.SZ", "002714", "Muyuan Foods", 0.1891304347826087),
]


def bigquant_date_text(value):
    """Return a plain YYYY-MM-DD string for BigQuant module parameters.

    BigQuant may hand callbacks or visual parameters back as BigQuantDate.
    Some modules then fail with "Expected unicode, got BigQuantDate" during
    cache/parameter validation. Keep every public date value as plain text.
    """
    if value is None:
        return ""
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day"):
        try:
            return "%04d-%02d-%02d" % (int(value.year), int(value.month), int(value.day))
        except Exception:
            pass
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%Y-%m-%d")
        except Exception:
            pass
    text = str(value).strip()
    match = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return "%04d-%02d-%02d" % (int(year), int(month), int(day))
    return text[:10]


def build_signal_data():
    selected_count = len(SELECTED)
    if selected_count != 15:
        raise ValueError(f"Expected 15 audited symbols, got {selected_count}")

    target_weight = 1.0 / selected_count
    frame = pd.DataFrame(
        SELECTED,
        columns=["instrument", "local_code", "name", "score"],
    )
    frame["date"] = bigquant_date_text(EXECUTION_DATE)
    frame["signal_date"] = bigquant_date_text(SIGNAL_DATE)
    frame["sleeve_id"] = SLEEVE_ID
    frame["strategy_id"] = STRATEGY_ID
    frame["component_strategy_id"] = COMPONENT_STRATEGY_ID
    frame["target_weight"] = target_weight
    frame["position"] = target_weight
    frame["score"] = frame["score"].astype(float)

    # BigTrader and score_to_position should consume date/instrument/position.
    # The score column remains available for audit and sorting.
    return frame[
        [
            "date",
            "instrument",
            "score",
            "target_weight",
            "position",
            "signal_date",
            "sleeve_id",
            "strategy_id",
            "component_strategy_id",
            "local_code",
            "name",
        ]
    ].copy()


signal_data = build_signal_data()
bigtrader_data = signal_data[["date", "instrument", "position"]].copy()
bigtrader_data["date"] = bigtrader_data["date"].map(bigquant_date_text).astype(str)
START_DATE_TEXT = bigquant_date_text(EXECUTION_DATE)
END_DATE_TEXT = bigquant_date_text(EXECUTION_DATE)

if not isinstance(START_DATE_TEXT, str) or not isinstance(END_DATE_TEXT, str):
    raise TypeError("BigQuant module dates must be plain YYYY-MM-DD strings.")
if not bigtrader_data["date"].map(lambda value: isinstance(value, str)).all():
    raise TypeError("bigtrader_data.date must contain plain YYYY-MM-DD strings.")

print("M-quant BigQuant upload-only signal ready")
print("signal_date", bigquant_date_text(SIGNAL_DATE), "execution_date", START_DATE_TEXT)
print("date_types", type(START_DATE_TEXT).__name__, bigtrader_data["date"].map(type).map(lambda item: item.__name__).unique().tolist())
print("selected_count", len(signal_data))
print("position_sum", float(signal_data["position"].sum()))
print(signal_data[["date", "instrument", "score", "position"]])


def m1_initialize_bigquant_run(context):
    context.sleeve_id = SLEEVE_ID
    context.strategy_id = STRATEGY_ID
    context.component_strategy_id = COMPONENT_STRATEGY_ID
    context.rebalance_days = REBALANCE_DAYS


def m1_before_trading_start_bigquant_run(context, data):
    pass


def m1_handle_tick_bigquant_run(context, tick):
    pass


def _order_target_percent(context, instrument, weight):
    if hasattr(context, "order_target_percent"):
        context.order_target_percent(instrument, weight)
        return True
    if "order_target_percent" in globals():
        order_target_percent(instrument, weight)  # type: ignore[name-defined]
        return True
    return False


def m1_handle_data_bigquant_run(context, data):
    global TRADING_DAY_INDEX
    day_index = int(TRADING_DAY_INDEX)
    if day_index % REBALANCE_DAYS == 0:
        for row in signal_data.itertuples(index=False):
            _order_target_percent(context, row.instrument, float(row.position))
    TRADING_DAY_INDEX = day_index + 1


def m1_handle_trade_bigquant_run(context, trade):
    pass


def m1_handle_order_bigquant_run(context, order):
    pass


def m1_after_trading_bigquant_run(context, data):
    pass


# Important BigQuant compatibility choices:
# - start_date/end_date are plain strings, so module cache sees unicode.
# - bigtrader_data["date"] is also a plain string; do not pass BigQuantDate
#   objects into module parameters or uploaded input frames.
# - end_date is not empty; empty strings caused earlier engine failures.
m1 = M.bigtrader.v53(
    data=bigtrader_data,
    start_date=START_DATE_TEXT,
    end_date=END_DATE_TEXT,
    initialize=m1_initialize_bigquant_run,
    before_trading_start=m1_before_trading_start_bigquant_run,
    handle_tick=m1_handle_tick_bigquant_run,
    handle_data=m1_handle_data_bigquant_run,
    handle_trade=m1_handle_trade_bigquant_run,
    handle_order=m1_handle_order_bigquant_run,
    after_trading=m1_after_trading_bigquant_run,
    capital_base=CAPITAL_BASE,
    frequency="daily",
    product_type="股票",
    rebalance_period_type="交易日",
    rebalance_period_days=REBALANCE_DAYS,
    rebalance_period_roll_forward=True,
    backtest_engine_mode="标准模式",
    before_start_days=10,
    volume_limit=1,
    order_price_field_buy="open",
    order_price_field_sell="open",
    benchmark="沪深300指数",
    plot_charts="全部显示",
    debug=False,
    backtest_only=False,
    m_name="m1",
)
