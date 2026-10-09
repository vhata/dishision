#!/usr/bin/env bash
# Production build of the Worker and the SPA into dist/. Extra arguments are
# passed to vite.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec vite build "$@"
