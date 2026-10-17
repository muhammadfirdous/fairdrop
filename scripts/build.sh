#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
pnpm --dir frontend build
