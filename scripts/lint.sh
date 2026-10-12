#!/usr/bin/env bash
# Lint with Biome's recommended rules plus the overrides in biome.json; warnings
# fail the gate. Paths default to the whole tree; extra arguments are passed to
# Biome. See docs/QUALITY.md.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec biome lint --error-on-warnings "${@:-.}"
