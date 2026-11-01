#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
PYTHONPATH=. python -m unittest discover -s tests -v
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/a_share_paper_check.XXXXXX")"
trap 'rm -rf "$CHECK_DIR"' EXIT
PYTHONPATH=. python -m a_share_paper demo --data-dir "$CHECK_DIR"
