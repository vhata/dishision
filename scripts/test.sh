#!/usr/bin/env bash
# Run the core (node), worker (workerd) and client (jsdom) test projects once.
#
# With no arguments this is the gate: it fails when the run collects nothing
# and when any one project runs zero tests (counted by the reporter in
# scripts/vitest-project-counts.ts, not by reading vitest's output).
#
# Extra arguments are passed to vitest unchanged and skip the per-project
# check, since file, name and project filters legitimately leave projects
# empty; the whole run must still collect at least one test.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -gt 0 ]; then
  exec pnpm exec vitest run --passWithNoTests=false "$@"
fi

counts="$(mktemp)"
trap 'rm -f "$counts"' EXIT

# Naming any reporter drops the ones Vitest adds by default, so the
# github-actions reporter (inline annotations on GitHub Actions) is named here.
TEST_PROJECT_COUNTS_FILE="$counts" pnpm exec vitest run --passWithNoTests=false \
  --reporter=default ${GITHUB_ACTIONS:+--reporter=github-actions} \
  --reporter=./scripts/vitest-project-counts.ts

node -e '
const raw = require("node:fs").readFileSync(process.argv[1], "utf8");
let counts;
try { counts = JSON.parse(raw); } catch { counts = null; }
if (!counts || typeof counts !== "object" || Object.keys(counts).length === 0) {
  console.error("test: no per-project counts were recorded; the project-counts reporter did not run");
  process.exit(1);
}
const summary = Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(", ");
const empty = Object.keys(counts).filter((name) => !(counts[name] > 0));
if (empty.length > 0) {
  console.error(`test: no tests ran in project(s): ${empty.join(", ")} (${summary})`);
  process.exit(1);
}
console.log(`test: tests ran in every project (${summary})`);
' "$counts"
