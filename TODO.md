# Deferred work

Ordinary follow-ups and bugs found during other work live here. Whole-codebase review findings promoted for separate work live in [review/BACKLOG.md](review/BACKLOG.md). Follow [docs/TODO_GUIDE.md](docs/TODO_GUIDE.md) before adding, claiming, moving or resolving an entry. Entries in **Ready for separate work** are unblocked and available now; anything with an unresolved `Depends on:` belongs in an earlier stage.

## Needs triage

### P0 Critical

### P1 High

### P2 Normal

### P3 Low

### Unprioritized

- [CORE] `cuisine-exclusion-tag-only` — **Cuisine exclusions match cuisine tags only, not description words or substrings.** Excluding "chinese" currently drops Pad See Ew because its description says "Chinese broccoli", and `isExcluded` substring matching makes "fish" exclude "shellfish".
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/scoring.ts` hardFilterReason and `src/core/planner.ts` isExcluded; keep description scanning for ingredient exclusions
- [CORE] `other-text-keyword-false-positives` — **The "Other" keyword parser stops reading "hot pot" as spicy, "hand-pulled noodles" as handheld, and "had a burger" as recentMeals ["a"].** Articles must be stripped and multi-word dishes matched before single words.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/otherText.ts` keywordParse and `test/core/otherText.test.ts`
- [CORE] `explain-protein-comparative-phrase` — **The runner-up explanation gives protein its own comparative phrase.** "a little less the protein you asked for" reads awkwardly.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/explain.ts` runner-up sentence
- [CORE] `retune-pair-quality-blend` — **Retune the pair quality blend (0.5 coverage plus 0.25 per dish alignment) against real menus.** The blend fixed a weak side riding along in Scenario A but now ranks the spec's canonical tom yum plus beef salad pair as runner-up.
  - Source: phase-1 Task 13 ruling and final review, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: real menu ingestion (design spec phases 4 and 5); fixtures are too small to tune against
  - Starting point: `src/core/pairs.ts` composePair
- [CORE] `score-leftovers-beef-seafood-answers` — **Leftovers, beef style and seafood type answers change the ranking.** They are collected and stored but no item carries the tags they would score against.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: menu ingestion and classification producing those tags (design spec phase 5)
- [KB] `heaviness-node-applies-condition` — **The heaviness node applies only when comforting is set and rich is unset, as the spec says, or the spec is updated to match the current rule.** It currently applies whenever rich is unset.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `kb/questions.json` heaviness node `applies`; design spec round-two list
- [WORKER] `recommendation-row-per-reload` — **Reloading the recommendation screen reads the latest stored recommendation instead of inserting a new row.** The screen's effect fires twice under StrictMode and every reload inserts a `recommendations` row.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: add `GET /api/session/:id/recommendation` in `src/worker/routes/session.ts`; have `src/client/screens/Recommendation.tsx` read before it recommends
- [WORKER] `error-handler-leaks-message` — **The Worker's error handler returns a generic message to clients and logs the detail.** `onError` currently returns `err.message`, which must be locked down before any public exposure.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/worker/index.ts` onError
- [CLIENT] `skip-warns-about-typed-other-text` — **Skipping a question with text typed in "Other" asks before discarding it.** Skip currently drops the text silently.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/client/components/QuestionCard.tsx`
- [CLIENT] `conversation-back-button` — **The conversation has a back button that undoes the last answer.** The spec lists one; phase 1 shipped without it and relies on Start over.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/questions.ts` state is append-only (`asked`, `round2Asked`); decide whether to replay or snapshot
- [TOOLING] `adopt-formatter-and-linter` — **Decide on a formatter and linter (or neither) and, if adopted, add `scripts/fmt-check.sh` and `scripts/lint.sh` as pre-commit and CI gates.** Phase 1 chose none; adopting one reformats the whole tree, so it is a PR of its own.
  - Source: repo-workflow install, branch task/repo-workflow-install, 2026-10-09
  - Starting point: `scripts/check.sh` gate list and `docs/QUALITY.md` gate table
- [TOOLING] `bump-vitest-to-five` — **Move to Vitest 5 as the plan specified.** Pinned to ^4.1 because the Cloudflare vitest plugin 1.3.7 supports only Vitest 4 and the worker pool failed to start under 5.
  - Source: phase-1 Task 1 ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: a release of the Cloudflare vitest plugin that supports Vitest 5

## Needs proof of concept

### P0 Critical

### P1 High

### P2 Normal

### P3 Low

### Unprioritized

## Ready for separate work

### P0 Critical

### P1 High

### P2 Normal

### P3 Low

### Unprioritized
