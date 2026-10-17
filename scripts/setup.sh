#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
command -v node >/dev/null || { echo 'Install Node.js 22.12+ first.'; exit 1; }
command -v pnpm >/dev/null || { echo 'Install pnpm 11.25.0 (npm install -g pnpm@11.25.0).'; exit 1; }
[ -d .venv ] || "$FAIRDROP_PYTHON" -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
pnpm --dir frontend install --frozen-lockfile
[ -f .env ] || cp .env.example .env
.venv/bin/alembic upgrade head
printf '\nSetup complete. Seed fictional data with: .venv/bin/python -m backend.cli seed\nStart development with: ./scripts/dev.sh\n'
