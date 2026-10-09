# Quality and validation

Read when changing code or preparing a PR. This document describes the gates as they exist now; history and rationale for past changes live in [DECISIONS.md](DECISIONS.md) and git.

## What quality means here

- Deterministic ranking: the same preferences and candidates produce the same recommendation and trace, and tests assert on traces, not just winners.
- Grounded explanations: every sentence is derived from candidate data and the trace; a test exists for each way an explanation could lie (claiming an avoided quality, naming an absent ingredient).
- Knowledge base as data: `kb/*.json` validates against the Zod schema at load, and scenario tests catch a content edit that changes a spec scenario's outcome.
- Free-plan safety: Worker code never calls out during a request in phase 1; when real providers arrive, budget guards are tested before the provider is wired in.
- Deliberately manual: visual rendering of the SPA (the README checklist) and judgement about whether a recommendation is a good dinner.

## Gates

Each check is a standalone script in `scripts/`, runnable from any directory, exiting non-zero on failure. Hooks, CI and agents run the same scripts.

| Script | Runs | Pre-commit | Pre-push | CI on PR | CI on main | Scheduled |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/typecheck.sh` | `tsc --noEmit` for the Worker and client projects (strict, `noUncheckedIndexedAccess`) | | yes | yes | yes | yes |
| `scripts/test.sh` | `vitest run` over the core (node), worker (workerd) and client (jsdom) projects; fails on empty collection | | yes | yes | yes | yes |
| `scripts/build.sh` | `vite build` of the Worker and SPA into `dist/` | | | yes | yes | yes |
| `scripts/workflow/check-queues.sh --strict` | queue hygiene | when `TODO.md` or `review/BACKLOG.md` is staged | | yes | yes | |
| `scripts/workflow/check-pr-markers.sh` | PR markers against queues | | | yes | | |
| `scripts/workflow/check-links.sh` | relative Markdown links | when any `.md` is staged | | yes | yes | |
| `scripts/workflow/review-due.sh` | review cadence report | | | | | yes |
| `scripts/check.sh` | typecheck, then test, stopping at the first failure | | yes | yes | yes | yes |

There is no formatter or linter gate; see `adopt-formatter-and-linter` in [../TODO.md](../TODO.md).

Hooks are the tracked scripts in `.githooks/`, wired with `git config core.hooksPath .githooks` by `bash scripts/setup.sh` (one run covers every worktree of the repository). Pre-commit only checks; it never rewrites files, and it validates the staged copy of the queue files rather than the working tree. Measured on 2026-10-09 on a warm checkout: pre-commit under one second; pre-push (`scripts/check.sh`) about five seconds. Bypassing a hook is for a broken toolchain only; state the bypass and the equivalent checks in the PR.

Toolchain pins: `.nvmrc` (Node), `packageManager` in `package.json` (pnpm), `pnpm-lock.yaml` (dependencies, installed with `--frozen-lockfile`), `pnpm-workspace.yaml` (allowed build scripts: esbuild, workerd). Bumping a pin is its own PR.

## Test policy

- A change to `src/core/` carries a unit test in `test/core/` for the behaviour it adds or fixes, at the module level. A change to a question, archetype or lexicon entry that affects a spec scenario updates `test/core/scenarios.test.ts` in the same PR with the reason.
- A change to a route or D1 query carries a test in `test/worker/` against the real migration applied to an in-process D1.
- A change to a component's interaction (chip cycling, scale stops) carries a `test/client/` test; pure layout changes are verified by the README checklist and say so in the PR.
- No clock, randomness or network in `src/core/` or in tests of it; fixtures are the oracle.
- A suite that collects no tests is a failed gate (`scripts/test.sh` passes `--passWithNoTests=false`); the gate cannot see `.skip`, so skipping a test to get green is a policy violation stated in the PR. There is no coverage threshold.
- No automatic retries. A flaky test is filed in `TODO.md` with the failing run's log and fixed or quarantined by name.

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. Jobs: `check` (setup, `scripts/check.sh`, `scripts/build.sh`) and `Queue and PR hygiene` (queue validation, link check, PR marker validation on pull requests). pnpm and Node versions come from `package.json` and `.nvmrc`. Superseded runs are cancelled on PR branches only, never on `main`. On failure, the check and build logs under `evidence/` are uploaded for 7 days.

## Scheduled validation of main

`.github/workflows/main-validation.yml` runs daily at 11:23 UTC and on demand, and on pull requests that edit it or the scripts it calls. It runs the full gates and the production build, records the commit, uploads evidence for 14 days, and reports whether a codebase review is due. A red main, from the push run or the schedule, is reverted or filed as a P1 (P0 if release-blocking) the same day. A missing scheduled run is not a pass.

## Branch protection (as configured on 2026-10-09)

Applied by the owner through the GitHub API and read back the same day.

- Required checks: `check`, `Queue and PR hygiene`; up-to-date-with-base: off (the push-to-main run and the red-main policy cover the rare bad combination).
- Linear history: on. Conversation resolution: off. Force pushes and deletions: blocked.
- Approving reviews required: 0; independent agent review is recorded in each PR's `## Review` section.
- Administrator enforcement: off, so the owner can commit queue entries and plans directly to `main` and can merge a red PR deliberately. The rules bind agents through this workflow, not through GitHub.
- Merge method: squash only; title from PR title, message from PR body; head branches deleted on merge.

Inspect with `gh api repos/vhata/dishision/branches/main/protection` and `gh api repos/vhata/dishision --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,delete_branch_on_merge,squash_merge_commit_title,squash_merge_commit_message}'`.

## PR evidence

Every PR lists the commands run and their results, a reproducible scenario for behaviour changes, what was not run and why, and the independent review. See [CODE_REVIEW_GUIDE.md](CODE_REVIEW_GUIDE.md).
