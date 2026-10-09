#!/usr/bin/env bash
# Run the core (node), worker (workerd) and client (jsdom) test projects once.
# Fails when no tests are collected. Extra arguments are passed to vitest.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec vitest run --passWithNoTests=false "$@"
