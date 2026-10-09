# Review backlog

Only work promoted from whole-codebase reviews belongs here. Every entry is ready for separate work and carries a `Findings:` line naming the raw review findings it covers; each finding maps to at most one entry. Claiming and resolving follow [docs/TODO_GUIDE.md](../docs/TODO_GUIDE.md); promotion follows [docs/CODE_REVIEW_GUIDE.md](../docs/CODE_REVIEW_GUIDE.md).

## P0 Critical

## P1 High

- [TOOLING] `review-due-zero-churn` — **`review-due.sh` prints a verdict and exits 0 when no source changed since the latest review.** It exits 1 instead, which turns the daily main-validation run red as soon as a review is recorded at current main.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `review-due-fails-on-zero-churn`
  - Starting point: `scripts/workflow/review-due.sh` `churn_since`; the repo-workflow skill's copy needs the same fix
  - Related: `gate-per-project-and-core-imports`
- [WORKER] `coarsen-session-coordinates` — **Sessions created from device location store a coarse point, never the raw GPS fix.** Raw coordinates are stored at full precision, which breaks the coarse-location invariant and the spec's privacy section.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `session-coords-stored-at-full-precision`
  - Starting point: `src/worker/routes/session.ts` create route; `src/client/screens/Landing.tsx` useLocation; add a worker test on stored precision
- [CORE] `other-text-exclusions-match-items` — **Exclusions typed in "Other" exclude the dishes they name, and negation covers only the words it governs.** "No shrimp" and "no seafood" record sub-type words no item carries, and "chicken without rice" excludes chicken.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `other-text-seafood-exclusions-miss`, `other-text-negation-scope`
  - Starting point: `src/core/otherText.ts` keywordParse negated protein branch and NEGATION scope; `src/core/planner.ts` isExcluded
  - Related: `other-text-keyword-false-positives`, `cuisine-exclusion-tag-only`

## P2 Normal

- [WORKER] `answer-must-match-current-question` — **The answer route accepts only the current question's node, and a replayed answer changes nothing.** Any node is accepted in any order and any number of times, so retries use up round-two slots and round one can be skipped.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `answer-not-checked-against-current-question`
  - Starting point: `src/worker/routes/session.ts` answer route; `src/core/questions.ts` nextQuestion
- [CLIENT] `client-request-ordering` — **Responses that arrive after the user moved on are dropped, and controls that would race an in-flight answer are disabled.** Starting over during an answer brings the old session back, and "Just decide" can rank without the last answer.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `client-in-flight-requests-unguarded`
  - Starting point: `src/client/App.tsx` update and reset; `src/client/screens/Conversation.tsx`
  - Related: `answer-must-match-current-question`, `recommendation-row-per-reload`
- [CORE] `kb-semantic-validation-on-load` — **Knowledge base rows that would crash tagging or answering are rejected at load, one overlay row at a time.** Zod accepts invalid regexes, unknown effect paths and colliding overlay ids that later throw or misbehave.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `kb-semantic-validation`, `overlay-id-prefix-collision`
  - Starting point: `src/core/kb/loader.ts` mergeKb and loadBaseKb; `src/core/kb/schema.ts`
- [CORE] `lexicon-tagging-accuracy` — **Lexicon tagging stops misreading descriptions, word collisions and entry order.** Mains that mention "side" become sides, "hot", "hen" and "bun" misfire, and specific entries win only when listed last.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `lexicon-portion-side-marker`, `lexicon-specific-merge-order`, `lexicon-word-false-positives`
  - Starting point: `src/core/lexicon.ts` tagItem merge; `kb/lexicon.json` portion, spicy, chicken and bread entries
  - Related: `vegetarian-marker-wins-over-implied-protein`
- [CORE] `explanations-stay-grounded` — **Explanation phrases claim only what the candidate's data supports.** "Lime and acid brightness" invents an ingredient, unknown scores read as avoided qualities, and the runner-up's "a little less" is never compared.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `explain-ungrounded-phrases`, `runner-up-comparative-ungrounded`
  - Starting point: `src/core/explain.ts` SIGNAL_PHRASES, avoidedPhrases and runnerUpSentence
  - Related: `explain-protein-comparative-phrase`, `explanation-contrast-sentence`
- [CORE] `not-that-cuisine-changes-cuisine` — **"Not feeling that cuisine" returns a dish of a different cuisine.** The reason moves only the 0.1-weight cuisine component, so the next pick is usually the same cuisine.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `not-that-cuisine-too-weak`
  - Starting point: `src/core/feedback.ts` not_that_cuisine; `src/core/scoring.ts` cuisine component; update the spec line
- [WORKER] `worker-request-hardening` — **Malformed bodies, oversized node ids and non-https provider links are rejected at the Worker boundary.** Unparseable JSON is read as `{}`, a 200,000-character nodeId is stored, and provider URLs reach `href` unchecked.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `suggest-nodeid-unbounded`, `malformed-json-treated-as-empty-object`, `order-links-unvalidated-scheme`
  - Starting point: `src/worker/validation.ts`; `src/worker/routes/session.ts` body parsing; `src/worker/links.ts`
  - Related: `error-handler-leaks-message`
- [TOOLING] `gate-per-project-and-core-imports` — **The gates fail when any one test project collects nothing, and when `src/core` imports Worker, DOM or provider code.** Both are documented policy with no enforcement; each was shown to pass silently.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `empty-test-project-passes`, `core-import-invariant-unenforced`
  - Starting point: `scripts/test.sh`; `scripts/check.sh`; `docs/QUALITY.md` gate table
- [TOOLING] `workflow-script-matching` — **The workflow scripts match markers, claims, queue structure and link arguments exactly.** Dash-bullet markers are ignored, prose is rejected as markers, claim checks match substrings and their own branch, and two validators pass on bad input.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `marker-nearmiss-pattern`, `claim-check-branch-matching`, `queue-structure-unvalidated`, `precommit-links-read-worktree`, `check-links-missing-arg-passes`
  - Starting point: `scripts/workflow/check-pr-markers.sh`, `claim-check.sh`, `check-queues.sh`, `check-links.sh`; `.githooks/pre-commit`; the repo-workflow skill's copies need the same fixes
- [TOOLING] `ci-revalidates-pr-body-edits` — **Editing a PR body re-runs the marker check.** The pull_request trigger uses default activity types, so the final body that becomes the squash commit is never rechecked.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `pr-body-edit-not-revalidated`
  - Starting point: `.github/workflows/ci.yml` pull_request types
  - Changing CI needs the user's go-ahead when this is picked up.
- [CLIENT] `conversation-accessibility` — **Keyboard and screen-reader users keep their place through the conversation, and every control has a name.** Focus falls to the body on every question and screen change, status text is not announced, and several inputs and groups are unlabelled.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `conversation-focus-and-live-regions`, `unlabelled-inputs-and-groups`
  - Starting point: `src/client/screens/Conversation.tsx`; `src/client/components/ScaleInput.tsx`, `ChipGroup.tsx`, `QuestionCard.tsx`; `src/client/screens/Landing.tsx`
- [CLIENT] `client-flow-tests` — **Client tests cover answer building, API error handling, session restore and the recommendation screen's states.** Only ChipGroup and ScaleInput are tested; the paths with type casts and error handling are not.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `client-flow-untested`
  - Starting point: `test/client/`; jsdom with stubbed fetch
  - Related: `client-request-ordering`, `client-error-and-state-polish`

## P3 Low

- [CLIENT] `client-error-and-state-polish` — **Client error messages, suggestion feedback, hidden Other text and session restore behave as the user expects.** Six small defects in one area: stale geolocation errors, raw error codes, thanks on failure, hidden text still sent, fragile hash restore, no retry after a failed recommend.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `stale-geo-error-masks-server-error`, `raw-error-codes-in-copy`, `suggestion-failure-still-thanks`, `hidden-other-text-still-submitted`, `hash-restore-fragile`, `recommend-error-has-no-retry`
  - Starting point: `src/client/api.ts`, `App.tsx`, `screens/Landing.tsx`, `screens/Recommendation.tsx`, `components/QuestionCard.tsx`
  - Related: `skip-warns-about-typed-other-text`
- [CORE] `core-tests-that-bite` — **Every risky core branch has a test that fails when it breaks.** Eleven of 28 scratch mutations survived the core suite, and the gut-check test builds an unreachable state.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `core-test-mutation-survivors`, `archetype-test-impossible-state`
  - Starting point: `test/core/`; delete `test/core/smoke.test.ts`
  - Related: `side-dish-regression-test-bite`
- [WORKER] `worker-tests-that-bite` — **Worker test assertions fail when the behaviour they name is broken.** Optional chaining, an early break and narrow cases let four assertions pass regardless.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `worker-tests-that-cannot-fail`
  - Starting point: `test/worker/recommend.test.ts`, `test/worker/session.test.ts`
  - Related: `answer-must-match-current-question`

## Unprioritized
