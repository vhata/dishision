# Decisions

Non-obvious choices and their trade-offs, dated, newest section first. Read the relevant entry before changing a mechanism that looks odd. Choices made autonomously under a delegation are recorded here for the user to review; an entry is a record, not a claim that the capability is complete.

Design-level decisions (free-tier constraints, minimal LLM use, no one-way doors, Google Places terms, D1-only storage) are in the design spec and are not restated here. Task-level rulings made while implementing phase 1 are in [`superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md`](superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md).

## 2026-10-13

| Decision | Reason and trade-off |
| --- | --- |
| Overlay ids are `kb_` plus the `kb_additions` row id; the payload id is ignored. | The design spec derives them from the row id, and the row id is the table's primary key, so two rows can never share an id and a payload id cannot smuggle in an unprefixed or colliding one. The cost is opaque ids (`kb_<uuid>`) in traces and in any export promoted back into the repo, where they should be renamed. Base ids may not start with `kb_`, so an overlay id never collides with a base one. |
| `mergeKb` merges archetype rows before option and lexicon rows, and checks each row against the knowledge base built so far. | An option effect (`archetypes.<id>`) or lexicon entry (`archetypeId`) may name an overlay archetype; ordering by kind lets it do so whatever the rows' creation order. A row that fails is dropped alone with its reason, in input order, so one bad approval cannot take down the others. |
| The preference shape the validator checks against (`PREFERENCE_FIELDS`, `DERIVED_KEYS`) is declared in `src/core/kb/validate.ts`, not derived from `preferences.ts` or `questions.ts`. | Those modules do not export a field model, and `questions.ts` imports the knowledge base. Tests hold the copy in step: every field of `emptyPreferences()` is declared, every effect the validator accepts applies without throwing, and the derived keys equal what `deriveContext` returns. |

## 2026-10-12

| Decision | Reason and trade-off |
| --- | --- |
| Biome (pinned exactly, 2.5.15 at adoption) is the formatter and linter, gated by `scripts/fmt-check.sh` and `scripts/lint.sh`. | The owner asked for the current consensus choice rather than the most common one. Biome is one stable tool for formatting, import sorting and linting, with type-aware rules and close Prettier compatibility, so there is one config and no ESLint plugin set to maintain. Oxlint with oxfmt is faster, but oxfmt was still 0.x; reconsider when it reaches 1.0. An exact pin because a Biome release can change formatting output. |
| Line width 140, single quotes, semicolons, trailing commas. | Matches how phase 1 was written. At 140 the reformat touched 32 files; 100 would have touched 52 and roughly tripled the churn. |
| The formatter skips `kb/**/*.json` and `fixtures/**`; the linter still covers them. | Those files are tables with one record per line, which is how they are read and reviewed. Formatting them would have expanded each record into a dozen or more lines for no gain in correctness. |
| `style/noNonNullAssertion` is off. | `noUncheckedIndexedAccess` makes `!` the explicit, reviewable marker of an index the code knows is present (76 sites, most in tests). The rule would push those sites toward `as` casts or unreachable guards, which hide the same assumption less visibly. |
| Pre-commit runs Biome on the staged copies of code files, extracted to a temporary directory with the staged `biome.json` and `package.json` (Biome enables its React and test rules from `package.json`). | The 2026-10-09 entry put code gates on push but said a formatter gate belongs on commit. Biome over a typical change takes well under a second. Checking the index rather than the working tree means a partly staged file is judged on what will be committed. |

## 2026-10-11

| Decision | Reason and trade-off |
| --- | --- |
| The generic workflow (contract, queue and review guides, validators) is vendored under `docket/` by the docket skill's `install.sh` and never edited here; `AGENTS.md` keeps only the project's settings in its marked Docket section, and the review focus areas, baseline commands and drift checks live in `docs/QUALITY.md`. | One command installs or resyncs the whole directory and `--check` reports any drift, so a fix to a validator reaches this project without a hand merge. The cost is that a project-specific rule can no longer be written into a guide; it goes in the Docket section or the quality doc, which the guides point to. |

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
