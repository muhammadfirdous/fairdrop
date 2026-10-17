#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
FAIRDROP_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fairdrop-e2e.XXXXXX")"
export DATABASE_URL="sqlite:///$FAIRDROP_TEST_DIR/e2e.sqlite3"
export DEMO_MODE=true
export COOKIE_SECURE=false
cleanup() { if [ -n "${FAIRDROP_TEST_PID:-}" ]; then kill "$FAIRDROP_TEST_PID" 2>/dev/null || true; wait "$FAIRDROP_TEST_PID" 2>/dev/null || true; fi; rm -rf "$FAIRDROP_TEST_DIR"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
.venv/bin/alembic upgrade head
.venv/bin/python -m backend.cli seed
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8001 &
FAIRDROP_TEST_PID=$!
wait "$FAIRDROP_TEST_PID"
