# Decisions

Non-obvious choices and their trade-offs, dated, newest section first. Read the relevant entry before changing a mechanism that looks odd. Choices made autonomously under a delegation are recorded here for the user to review; an entry is a record, not a claim that the capability is complete.

Design-level decisions (free-tier constraints, minimal LLM use, no one-way doors, Google Places terms, D1-only storage) are in the design spec and are not restated here. Task-level rulings made while implementing phase 1 are in [`superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md`](superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md).

## 2026-10-09

| Decision | Reason and trade-off |
| --- | --- |
| The agent workflow (contract, queues, gates, review ledger, CI) was installed on a branch stacked on `phase-1-conversation-and-ranking`, not on `main`. | `main` held only the spec and the plan, so gate scripts based on it would have had nothing to check and CI would have been red until the code landed. Stacking meant the install PR could not land before the phase-1 PR; the alternative, installing docs first and gates later, would have left the first code PR ungated. Phase 1 landed first (#1), and the install branch was rebased onto `main` and retargeted the same day. |
| Git hooks are a tracked `.githooks/` directory wired with `core.hooksPath`, installed by `scripts/setup.sh`. | No hook-manager dependency (lefthook, husky, simple-git-hooks) to pin or download; one `git config` covers every worktree. Cost: hooks are plain bash, so per-file staging tricks are hand-written if ever needed. |
| Pre-commit runs only the queue and link validators, and only when queue or Markdown files are staged. Typecheck and tests run on pre-push. | Typecheck plus the three test projects take about five seconds warm, over the two-to-three-second pre-commit budget; a push-time run still precedes every CI run. Change if a formatter gate arrives, which belongs on commit. |
| No formatter or linter gate yet; `scripts/check.sh` runs typecheck and tests. | Nothing was chosen in phase 1 and adopting one means reformatting the whole tree, which is its own PR. Filed as `adopt-formatter-and-linter` in `TODO.md` for the user to decide on. |
| `scripts/test.sh` passes `--passWithNoTests=false` explicitly. | Vitest 4 already fails on empty collection by default, but the flag makes the policy visible and survives a default change. |
| `CLAUDE.md` is the single line `@AGENTS.md`; the invariants it used to hold moved to `ARCHITECTURE.md`. | One authoritative home per rule; Claude Code imports the contract and other harnesses read `AGENTS.md` directly. |
| Node is pinned by `.nvmrc` (26) and pnpm by `packageManager` in `package.json`; CI reads both from the files, never from a version typed into a workflow. | Toolchain bumps become reviewable diffs in the repository rather than silent runner changes. |
