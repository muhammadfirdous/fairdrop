#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
.venv/bin/python -m pytest -q
pnpm --dir frontend lint
pnpm --dir frontend build
