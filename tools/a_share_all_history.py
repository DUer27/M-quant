#!/usr/bin/env python3
"""Stable project entrypoint for A-share full-history completion/audit.

This wrapper keeps the long implementation path out of day-to-day commands.
It forwards all CLI arguments to:
outputs/sources/akshare/scripts/complete_a_share_all_history.py
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "outputs" / "sources" / "akshare" / "scripts" / "complete_a_share_all_history.py"


def main() -> int:
    if not SCRIPT.exists():
        raise SystemExit(f"A-share history script is missing: {SCRIPT}")
    sys.argv[0] = str(SCRIPT)
    runpy.run_path(str(SCRIPT), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
