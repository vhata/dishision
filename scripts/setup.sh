#!/usr/bin/env bash
# Prepare this worktree: install dependencies from the lockfile and point git
# at the tracked hooks. Idempotent; run after cloning, creating a worktree, or
# changing hook configuration. See docs/QUALITY.md.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile

# Hooks live in .githooks/ (tracked). core.hooksPath is per repository, so one
# run covers every worktree sharing this .git.
git config core.hooksPath .githooks

echo "setup: done. Run 'bash scripts/check.sh' to verify the baseline."
