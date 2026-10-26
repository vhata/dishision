# Review backlog

Only work promoted from whole-codebase reviews belongs here. Every entry is ready for separate work and carries a `Findings:` line naming the raw review findings it covers; each finding maps to at most one entry. Claiming and resolving follow [docket/TODO_GUIDE.md](../docket/TODO_GUIDE.md); promotion follows [docket/CODE_REVIEW_GUIDE.md](../docket/CODE_REVIEW_GUIDE.md).

## P0 Critical

## P1 High

- [WORKER] `coarsen-session-coordinates` — **Sessions created from device location store a coarse point, never the raw GPS fix.** Raw coordinates are stored at full precision, which breaks the coarse-location invariant and the spec's privacy section.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `session-coords-stored-at-full-precision`
  - Starting point: `src/worker/routes/session.ts` create route; `src/client/screens/Landing.tsx` useLocation; add a worker test on stored precision
- [CORE] `other-text-exclusions-match-items` — **Exclusions typed in "Other" exclude the dishes they name, and negation covers only the words it governs.** "No shrimp" and "no seafood" record sub-type words no item carries, and "chicken without rice" excludes chicken.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `other-text-seafood-exclusions-miss`, `other-text-negation-scope`
  - Starting point: `src/core/otherText.ts` keywordParse negated protein branch and NEGATION scope; `src/core/planner.ts` isExcluded
  - Related: `other-text-keyword-false-positives`, `cuisine-exclusion-tag-only`
  - Evidence from the review of PR #17 (2026-10-13): the keyword parser maps "no fish", "no seafood" and "no tuna" all to the single exclusion `fish`, and only substring matching in `isExcluded` keeps Shellfish Platter, Catfish Po Boy, Grilled Swordfish and Thai Fishcakes excluded under it; a whole-word switch let all four through. Ingredient exclusions stay substring-matched on allergen-safety grounds until this entry lands.
  - Acceptance: any move away from substring matching for ingredient exclusions carries regression tests for those four dishes and for nut/walnut, milk/buttermilk, cheese/cheeseburger and crab/crabmeat.
  - Evidence from the re-review of PR #17 (2026-10-13): the keyword parser reduces "no greek yogurt", "no american cheese", "no italian sausage" and "no chinese sausage" (probably also "no japanese mayo" and "no mexican crema") to the cuisine word alone and never records the ingredient noun. Main's cuisine substring match caught the yogurt dishes by accident; once cuisine exclusions match cuisine tags only, nothing does, so the parser must record the ingredient.

## P2 Normal

- [CORE] `vegetarian-choice-excludes-meat` — **A sole vegetarian selection keeps meat and seafood out of every recommended dish, including pair partners.** A reachable rich/comforting vegetarian session recommends Chana Masala plus Butter Chicken and a beef runner-up because one vegetarian partner supplies the full protein score.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `vegetarian-choice-allows-meat`
  - Starting point: `src/core/scoring.ts` hardFilterReason and `src/core/pairs.ts` composePair; add a scenario through the real question sequence
  - Acceptance: the recorded eight-answer sequence returns only vegetarian items for primary and runner-up; verify pair members and menu-less candidates
  - Related: `vegetarian-marker-wins-over-implied-protein`
- [CORE] `score-positive-carb-answers` — **Positive rice, noodles, bread and tortilla preferences affect item and archetype ranking.** All four choices currently leave the entire scored fixture and archetype lists unchanged despite existing carb tags.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `positive-carb-preferences-ignored`
  - Starting point: `src/core/scoring.ts` named-carb handling and `src/core/planner.ts` scoreArchetype/desiredVector
  - Acceptance: a test with competing rice/noodle dishes changes its winner when the positive preference changes, and avoidance penalties still hold
  - Related: `score-leftovers-beef-seafood-answers`
- [CORE] `other-budget-replaces-flexible` — **A later explicit budget typed in Other clears a previously flexible budget flag.** Choosing Whatever then typing under $15 stores both flexible=1 and max=15, allowing a $30 dish.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `other-budget-keeps-flexible`
  - Starting point: `src/core/otherText.ts` applyPatch; mirror too_expensive feedback's removal of flexible and test the reachable budget/leftovers sequence
  - Acceptance: the stored maximum is active for both single-item and pair filtering after the newer explicit amount arrives
- [WORKER] `answer-must-match-current-question` — **The answer route accepts only the current question's node, and a replayed answer changes nothing.** Any node is accepted in any order and any number of times, so retries use up round-two slots and round two can be skipped.
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
- [CORE] `not-that-cuisine-changes-cuisine` — **"Not feeling that cuisine" returns a dish of a different cuisine.** The reason moves only the 0.1-weight cuisine component, so the next pick is usually the same cuisine.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `not-that-cuisine-too-weak`
  - Starting point: `src/core/feedback.ts` not_that_cuisine; `src/core/scoring.ts` cuisine component; update the spec line
- [WORKER] `worker-request-hardening` — **Malformed bodies, oversized node ids and unsafe provider links are rejected, and the suggestion quota is enforced atomically.** Unparseable JSON is read as `{}`, a 200,000-character nodeId is stored, provider URLs reach `href` unchecked, and twelve concurrent suggestions can bypass the ten-per-session limit.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `suggest-nodeid-unbounded`, `malformed-json-treated-as-empty-object`, `order-links-unvalidated-scheme`, `suggestion-limit-races`
  - Starting point: `src/worker/validation.ts`; `src/worker/routes/session.ts` body parsing; `src/worker/links.ts`
  - Related: `error-handler-leaks-message`
  - Evidence: review/2026-10-24-0249-full.md, 2026-10-24: twelve concurrent valid suggestion requests on a fresh session all returned 202 and stored twelve rows; check and insert must share an atomic guard.
- [TOOLING] `gate-per-project-and-core-imports` — **The gates fail when any one test project collects nothing, and when `src/core` imports Worker, DOM or provider code.** Both are documented policy with no enforcement; each was shown to pass silently.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `empty-test-project-passes`, `core-import-invariant-unenforced`
  - Starting point: `scripts/test.sh`; `scripts/check.sh`; `docs/QUALITY.md` gate table
- [TOOLING] `workflow-script-matching` — **The workflow scripts distinguish marker prose, validate queue structure and reject missing link inputs, and pre-commit checks staged links.** Bullet markers and whole-component/self claim matching are fixed; ordinary marker-like prose still fails, malformed queue structure passes, and missing link inputs and unstaged link repairs hide errors.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `marker-nearmiss-pattern`, `queue-structure-unvalidated`, `precommit-links-read-worktree`, `check-links-missing-arg-passes`
  - Starting point: the scripts under `docket/scripts/` are vendored from the docket skill, so script fixes go to the skill and arrive by resync; `.githooks/pre-commit` is this project's. The full review at d4dc0c1 verified claim matching closed and the remaining four sites still open; retain only those sites in this entry.
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

- [TOOLING] `review-cadence-utc-age` — **Review age is computed from UTC dates consistently across local timezones.** The UTC index date 2026-10-24 reports zero days old under TZ=UTC but minus one under TZ=America/Los_Angeles while the local date is October 23.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `review-age-uses-local-timezone`
  - Starting point: shared Docket `review-due.sh` date parsing and age calculation; fix upstream and resync the vendored copy
  - Acceptance: a fixed UTC timestamp and review date produce the same nonnegative age under UTC and America/Los_Angeles, including the day boundary and the review-due threshold
- [CORE] `pair-must-beat-best-single-margin` — **A pair wins only after beating the best eligible single across all restaurants by PAIR.margin.** The current gate compares the pair with its own constituents; a 0.7375 pair beats a 0.71725 single by 0.02025 and still wins despite a 0.05 margin.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `pair-margin-compares-only-constituents`
  - Starting point: `src/core/pairs.ts` rankCandidates and recommend; compare with eligible standalone mains rather than side items
  - Acceptance: a competing single at another restaurant enforces the margin, while a pair with a sufficient lead can still win
  - Related: `retune-pair-quality-blend`
- [CORE] `fixture-lamb-protein-truthful` — **Lamb fixtures are represented truthfully rather than scored as beef.** Lamb Kebab Plate and Lamb Vindaloo explicitly override proteins to beef and earn full protein-match signals for a beef request.
  - Source: review/2026-10-24-0249-full.md, 2026-10-24
  - Findings: `fixture-lamb-matches-beef`
  - Starting point: `fixtures/sf.ts` beirut_kebab and bombay_vindaloo; remove false beef claims without silently broadening the shared protein model
  - Acceptance: a beef-only request does not record a full beef protein match for either lamb dish, and fixture descriptions/tags remain consistent
- [CORE] `lexicon-tagging-accuracy` — **Lexicon tagging stops misreading descriptions, word collisions and entry order.** Mains that mention "side" become sides, "hot", "hen" and "bun" misfire, and specific entries win only when listed last. Mostly latent on fixtures, whose hand-written scores override tagging ("bun" already mis-tags fixture Bun Bo Hue); raise to P2 before real menu ingestion.
  - Source: review/2026-10-09-0901-full.md, 2026-10-09
  - Findings: `lexicon-portion-side-marker`, `lexicon-specific-merge-order`, `lexicon-word-false-positives`
  - Starting point: `src/core/lexicon.ts` tagItem merge; `kb/lexicon.json` portion, spicy, chicken and bread entries
  - Related: `vegetarian-marker-wins-over-implied-protein`
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
