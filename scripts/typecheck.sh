#!/usr/bin/env bash
# Type-check the Worker and client TypeScript projects. Extra arguments are
# passed to both tsc invocations.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec tsc -p tsconfig.worker.json --noEmit "$@"
pnpm exec tsc -p tsconfig.client.json --noEmit "$@"
