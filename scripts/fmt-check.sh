#!/usr/bin/env bash
# Check formatting and import order with Biome, without rewriting anything.
# Paths default to the whole tree; extra arguments are passed to Biome.
# `pnpm fmt` applies the fixes. See docs/QUALITY.md.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec biome check --linter-enabled=false --error-on-warnings "${@:-.}"
