import argparse
import json
from pathlib import Path
from .service import PaperService


def main() -> None:
    parser = argparse.ArgumentParser(description="A 股/ETF Paper-only 执行 CLI")
    parser.add_argument("command", choices=("demo", "status"))
    parser.add_argument("--data-dir", default=str(Path.cwd() / ".a_share_paper"))
    args = parser.parse_args()
    service = PaperService(args.data_dir)
    if args.command == "demo":
        signal = service.inbox / "demo-buy.json"
        if not signal.exists():
            signal.write_text(json.dumps({
                "schema_version": "1.0", "signal_id": "demo-buy", "strategy_id": "demo_only",
                "data_policy": "synthetic_quote", "risk": {"purpose": "demo"},
                "symbol": "510300", "side": "BUY", "quantity": 100,
                "asset_type": "etf", "price": "4.0000",
                "market_time": "2026-10-13T10:00:00+08:00",
            }), encoding="utf-8")
        print(json.dumps({"processed": service.process_pending(), "snapshot": service.snapshot()}, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(service.snapshot(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
