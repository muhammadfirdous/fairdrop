#!/usr/bin/env bash
# Prefer installed runtimes; Codex's bundled runtime is a local fallback.
set -euo pipefail
FAIRDROP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIRDROP_BUNDLE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [ -x "$FAIRDROP_BUNDLE/node/bin/node" ]; then export PATH="$FAIRDROP_BUNDLE/node/bin:$PATH"; fi
if ! command -v pnpm >/dev/null 2>&1 && [ -x "$FAIRDROP_BUNDLE/bin/fallback/pnpm" ]; then export PATH="$FAIRDROP_BUNDLE/bin/fallback:$PATH"; fi
FAIRDROP_PYTHON="${FAIRDROP_PYTHON:-python3}"
if ! "$FAIRDROP_PYTHON" -c 'import sys; assert sys.version_info >= (3,11)' >/dev/null 2>&1; then
  if [ -x "$FAIRDROP_BUNDLE/python/bin/python3" ]; then FAIRDROP_PYTHON="$FAIRDROP_BUNDLE/python/bin/python3"; else echo 'Python 3.11+ is required. Set FAIRDROP_PYTHON to its path.' >&2; exit 1; fi
fi
cd "$FAIRDROP_ROOT"
