#!/usr/bin/env python3
"""Import every JoinQuant result package from outputs/sources/joinquant/inbox."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = ROOT / "outputs" / "sources" / "joinquant" / "scripts" / "import_joinquant_result_package.py"
DEFAULT_INBOX = ROOT / "outputs" / "sources" / "joinquant" / "inbox"
DEFAULT_DONE = DEFAULT_INBOX / "done"
DEFAULT_FAILED = DEFAULT_INBOX / "failed"


def iter_input_files(inbox: Path) -> list[Path]:
    if not inbox.exists():
        return []
    return sorted(
        path for path in inbox.iterdir()
        if path.is_file() and path.suffix.lower() in {".json", ".txt", ".log"}
    )


def run_import(path: Path, dry_run: bool, append: bool) -> tuple[bool, dict]:
    cmd = [sys.executable, str(SCRIPT), str(path)]
    if dry_run:
        cmd.append("--dry-run")
    if append:
        cmd.append("--append")
    proc = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, check=False)
    payload = {
        "file": str(path.relative_to(ROOT)),
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }
    try:
        payload["result"] = json.loads(proc.stdout)
    except Exception:
        payload["result"] = None
    return proc.returncode == 0, payload


def move_processed(path: Path, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / path.name
    if target.exists():
        stem = path.stem
        suffix = path.suffix
        index = 1
        while target.exists():
            target = target_dir / f"{stem}-{index}{suffix}"
            index += 1
    path.rename(target)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Import all JoinQuant result packages in an inbox directory.")
    parser.add_argument("--inbox", default=str(DEFAULT_INBOX), help="Directory containing JoinQuant output JSON/TXT/LOG files.")
    parser.add_argument("--dry-run", action="store_true", help="Audit all files without importing or moving them.")
    parser.add_argument("--append", action="store_true", help="Append without replacing existing rows from the same source/strategy.")
    parser.add_argument("--keep", action="store_true", help="Do not move processed files into done/failed folders.")
    args = parser.parse_args()

    inbox = Path(args.inbox)
    files = iter_input_files(inbox)
    results = []
    ok_count = 0
    for path in files:
        ok, payload = run_import(path, dry_run=args.dry_run, append=args.append)
        ok_count += int(ok)
        if not args.dry_run and not args.keep:
            moved = move_processed(path, DEFAULT_DONE if ok else DEFAULT_FAILED)
            payload["moved_to"] = str(moved.relative_to(ROOT))
        results.append(payload)

    summary = {
        "inbox": str(inbox.relative_to(ROOT)) if inbox.is_relative_to(ROOT) else str(inbox),
        "dry_run": bool(args.dry_run),
        "file_count": len(files),
        "ok_count": ok_count,
        "failed_count": len(files) - ok_count,
        "results": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if ok_count == len(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
