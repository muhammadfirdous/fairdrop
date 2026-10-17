#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
.venv/bin/alembic upgrade head
if [ ! -f frontend/dist/index.html ]; then pnpm --dir frontend build; fi
printf '\nFairDrop built application: http://127.0.0.1:8000\n'
exec .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
