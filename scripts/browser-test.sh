#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
# Keep the browser matched to the locked Playwright version and out of system
# Chrome. The install command reuses the cache after the first download.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$FAIRDROP_ROOT/.cache/ms-playwright}"
pnpm --dir frontend exec playwright install chromium --only-shell
pnpm --dir frontend build
pnpm --dir frontend test:e2e "$@"
