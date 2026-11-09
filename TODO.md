# Deferred work

Ordinary follow-ups and bugs found during other work live here. Whole-codebase review findings promoted for separate work live in [review/BACKLOG.md](review/BACKLOG.md). Follow [docket/TODO_GUIDE.md](docket/TODO_GUIDE.md) before adding, claiming, moving or resolving an entry. Entries in **Ready for separate work** are unblocked and available now; anything with an unresolved `Depends on:` belongs in an earlier stage.

## Needs triage

### P0 Critical

### P1 High

### P2 Normal

- [CORE] `score-leftovers-beef-seafood-answers` — **Leftovers, beef style and seafood type answers change the ranking.** They are collected and stored but no item carries the tags they would score against.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: menu ingestion and classification producing those tags (design spec phase 5)
- [CORE] `closed-restaurant-hard-filter` — **A restaurant that is closed with no scheduled-order option is hard-filtered, as the spec's scoring section requires.** Phase 1 only discounts `openNow=false` through restaurant quality; fixtures are always open and hours arrive with real discovery.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: opening hours from real discovery (design spec phase 4)
  - Starting point: `src/core/scoring.ts` hardFilterReason; `RestaurantSummary` needs an hours or open-now field with an unknown state

### P3 Low

### Unprioritized

- [CORE] `kb-overlay-pattern-backtracking` — **An overlay lexicon pattern cannot hang tagging through catastrophic backtracking.** Load-time validation rejects patterns that fail to compile, but accepts `(a+)+$`, which would stall `tagItem` on a long menu description rather than throw.
  - Source: review/kb-semantic-validation-on-load, 2026-10-13
  - Starting point: `src/core/kb/validate.ts` pattern check; options include rejecting nested quantifiers, capping pattern and input length, or a linear-time matcher
  - Blocked by: overlay rows becoming reachable from a user or admin path; nothing calls mergeKb outside core yet

- [CORE] `kb-cuisine-collides-with-protein` — **A knowledge base cuisine value cannot share a name with a protein key.** An overlay archetype with cuisine `seafood` or `vegetarian` would send that exclusion to cuisine-tag matching instead of ingredient matching once cuisine exclusions match tags only.
  - Source: las-vegas session, re-review of PR #17 (cuisine-exclusion-tag-only), 2026-10-13
  - Starting point: the semantic validator added by `kb-semantic-validation-on-load`; reject cuisine values equal to a protein key
- [KB] `heaviness-asked-when-already-set` — **Decide whether the heaviness question is skipped when heaviness is already known.** With feel "comforting" and "nothing heavy" typed in the avoid question, heaviness is already -0.7 and round two still asks "How heavy should it be?", whose answer overwrites it; the spec's rule (comforting set, rich unset) does not mention heaviness.
  - Source: independent review of PR #13 (heaviness-node-applies-condition), 2026-10-13
  - Starting point: `kb/questions.json` heaviness node `applies`; design spec round-two list
- [TOOLING] `drop-worker-fs-module-cache-override` — **The worker test project uses Vitest's fs module cache again once @cloudflare/vitest-plugin ships workers-sdk#16163.** Vitest 5 hands workerd paths to cached modules it cannot read, so the worker project turns `fsModuleCache` off and re-transforms its files on every run.
  - Source: PR #19 (todo/bump-vitest-to-five), 2026-10-13
  - Blocked by: a @cloudflare/vitest-plugin release containing cloudflare/workers-sdk#16163
  - Starting point: `vitest.worker.config.ts` fsModuleCache and its `docs/DECISIONS.md` row; delete `node_modules/.vitest-cache` and run the worker project cold and warm to confirm
  - If coverage is ever added, cloudflare/workers-sdk#16238 (V8 coverage teardown under Vitest 5, open on 2026-10-13) is a separate plugin bug to check first.

## Needs proof of concept

### P0 Critical

### P1 High

### P2 Normal

- [CORE] `retune-pair-quality-blend` — **Retune the pair quality blend (0.5 coverage plus 0.25 per dish alignment) against real menus.** The blend fixed a weak side riding along in Scenario A but now ranks the spec's canonical tom yum plus beef salad pair as runner-up.
  - Source: phase-1 Task 13 ruling and final review, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Blocked by: real menu ingestion (design spec phases 4 and 5); fixtures are too small to tune against
  - Starting point: `src/core/pairs.ts` composePair

### P3 Low

### Unprioritized

## Ready for separate work

### P0 Critical

### P1 High

### P2 Normal

- [WORKER] `recommendation-row-per-reload` — **Reloading the recommendation screen reads the latest stored recommendation instead of inserting a new row.** The screen's effect fires twice under StrictMode and every reload inserts a `recommendations` row. The two in-flight requests have no ordering guard, so the screen can show a different row from the one feedback treats as latest; harmless while fixtures are deterministic.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: add `GET /api/session/:id/recommendation` in `src/worker/routes/session.ts`; have `src/client/screens/Recommendation.tsx` read before it recommends
  - Related: `client-request-ordering`
- [CLIENT] `conversation-back-button` — **The conversation has a back button that undoes the last answer.** The spec lists one; phase 1 shipped without it and relies on Start over.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/questions.ts` state is append-only (`asked`, `round2Asked`); decide whether to replay or snapshot

### P3 Low

- [CORE] `explain-protein-comparative-phrase` — **The runner-up explanation gives protein its own comparative phrase.** "a little less the protein you asked for" reads awkwardly.
  - Source: phase-1 final review (deferred minor), docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/explain.ts` runner-up sentence
  - Related: `explanations-stay-grounded`; that entry's runner-up comparative finding rewrites the same sentence, so take both together
- [CORE] `explanation-contrast-sentence` — **The explanation can say what it skipped and why, in the spec's "Skipped the curry: too rich for not heavy" shape.** The template currently names the runner-up's biggest penalty instead; the ruling called that within the template's latitude, so this is a copy improvement, not a defect.
  - Source: phase-1 final review ruling, docs/superpowers/plans/2026-10-08-dishision-phase-1-execution-log.md, 2026-10-08
  - Starting point: `src/core/explain.ts`; the trace already carries penalties per candidate, so the sentence needs the strongest rejected candidate from `ranked`
  - Related: `explanations-stay-grounded`
- [CORE] `side-dish-regression-test-bite` — **The side-dish scenario test fails without the SIDE_PORTION rule, and side fixtures carry formats.** "tightening the budget never makes a side dish the dinner" passed before the fix too (fattoush outscored the sides at budget 12) and its `if (primary)` guard passes silently on null; fries and goi cuon have empty formats despite the ruling that sides carry them.
  - Source: independent review of commit 825592c on phase-1-conversation-and-ranking, 2026-10-09
  - Starting point: `test/core/scenarios.test.ts`; `test/core/pairs.test.ts` "never stands a small side up" is the test that does bite; `fixtures/sf.ts` fries and goi cuon
  - Related: `core-tests-that-bite`

### Unprioritized

- [TOOLING] `blame-ignore-biome-reformat` — **`.git-blame-ignore-revs` lists the squash commit that adopted Biome, so blame skips the whole-tree reformat.** PR #9 landed as 0f5199e, so the SHA now exists.
  - Source: PR #9 (adopt-formatter-and-linter), 2026-10-12
  - Starting point: append the full SHA with a comment line naming the change; the contract allows this file on `main` directly only when the owner says so for the case
- [CORE] `other-text-meal-capture-accuracy` — **Recent and planned meals typed in "Other" record dish names and never function words, and cravings match singular and plural dishes alike.** "had to work late" records recentMeals ["to"], "had a big burger" ["big"] and "had a hand-held burrito" ["hand"]; "I want burritos" reads nothing because only "burrito" is in the vocabulary; planned meals record only the cuisine while recent meals record the dish and the cuisine.
  - Source: PR #18 (other-text-keyword-false-positives) and its independent review, 2026-10-13
  - Starting point: `src/core/otherText.ts` keywordParse recent-meal capture, mealName and the craving vocabulary
  - Related: `other-text-exclusions-match-items`
- [WORKER] `bad-answer-copy-for-diners` — **A rejected answer returns diner-facing copy instead of the core's developer message.** The `bad_answer` path returns the text `applyAnswer` throws, such as "unknown option X for <node>", which echoes the input and is shown as-is by the client.
  - Source: PR #15 (error-handler-leaks-message), 2026-10-13
  - Starting point: `src/worker/routes/session.ts` answer route `bad_answer`; `src/core/questions.ts` applyAnswer
  - Related: `worker-request-hardening`
- [DOCS] `decisions-formatter-row-stale` — **`docs/DECISIONS.md` no longer says there is no formatter or linter gate.** The row "No formatter or linter gate yet" predates the Biome adoption in PR #9.
  - Source: independent review of PR #19 (bump-vitest-to-five), 2026-10-13
  - Starting point: `docs/DECISIONS.md` gates table; `docs/QUALITY.md` already describes the Biome gates
- [CORE] `lexicon-meat-cut-words` — **Wings, tenders, nuggets, ribs, drumsticks, gyro and kebab tag meat, with plant guards such as cauliflower wings.** A marked combo like "Veggie Burger and Wings" reads vegetarian-only because these cuts are not meat words, and "Buffalo Wings" tags nothing.
  - Source: independent review of PR #14 (vegetarian-marker-wins-over-implied-protein), 2026-10-13
  - Starting point: `kb/lexicon.json` meat entries and their substitute lookbehinds; the cut words need guards for plant versions ("cauliflower wings", "seitan nuggets")
  - Related: `lexicon-tagging-accuracy`
- [TOOLING] `main-validation-paths-cover-reporter` — **A PR that edits only the per-project test counter runs the scheduled validation workflow.** `.github/workflows/main-validation.yml` triggers on pull requests that touch named `scripts/*.sh` files, and `scripts/vitest-project-counts.ts` is not among them.
  - Source: review/gate-per-project-and-core-imports, 2026-10-13
  - Starting point: the `pull_request` paths list in `.github/workflows/main-validation.yml`; consider `scripts/**`
  - Changing CI needs the user's go-ahead when this is picked up.
- [TOOLING] `core-globals-typecheck` — **`src/core` cannot use Worker, DOM or Node globals without an import.** The lint rule checks import specifiers only, so `fetch`, `document` or `D1Database` used as ambient globals in core pass every gate.
  - Source: review/gate-per-project-and-core-imports, 2026-10-13
  - Starting point: a core-only tsconfig (ES2022 lib, no DOM, `types: []`, its own `jsx` setting so `@types/react` globals stay out) added to `scripts/typecheck.sh`
  - It fails today on `structuredClone`, which is not in the ES2022 lib: `src/core/feedback.ts`, `src/core/kb/loader.ts`, `src/core/otherText.ts` and `src/core/preferences.ts`. Either declare that one global in a core ambient file or replace the calls.
- [TOOLING] `core-type-position-imports` — **Type-position imports into Worker, client, provider or package code fail the core lint rule.** `type T = import('hono').Context` and `typeof import('../worker/env')` pass Biome's `noRestrictedImports`.
  - Source: review/gate-per-project-and-core-imports, 2026-10-13
  - Starting point: a Biome GritQL plugin matching `TsImportType()` in the `src/core/**` override caught all three probes on the branch; `.githooks/pre-commit` copies only `biome.json`, `package.json` and staged files into its temp directory, so it must also copy `*.grit` or every commit fails with "Cannot read file"
  - Changing hooks needs the user's go-ahead when this is picked up.
