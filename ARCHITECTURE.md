# Architecture

What the structure is now, the boundaries parallel work must respect, and the invariants reviews check. The design and its unbuilt phases live in [`docs/superpowers/specs/2026-10-08-dishision-design.md`](docs/superpowers/specs/2026-10-08-dishision-design.md); this file describes the code as it is.

One Cloudflare Worker (Hono API) plus a React SPA served as Workers Static Assets, built together by Vite with `@cloudflare/vite-plugin`. D1 is the only store. Phase 1 runs entirely on fixture providers; no external call is made anywhere.

## Layout

- `src/core/`: pure reasoning, no Worker, DOM or provider imports. Preference model (`preferences.ts`), knowledge base schema, rule language and loader (`kb/`), question graph (`questions.ts`), "Other" text parsing (`otherText.ts`), archetype planner (`planner.ts`), lexicon tagger (`lexicon.ts`), quality alignment (`alignment.ts`), item scoring with trace (`scoring.ts`), pair composition and recommendation (`pairs.ts`), menu-less fallback (`fallback.ts`), explanation templates (`explain.ts`), feedback edits (`feedback.ts`), shared value types (`types.ts`).
- `kb/`: the knowledge base as versioned JSON: `questions.json`, `archetypes.json`, `lexicon.json`. Content lives here, not in code.
- `src/providers/`: seams and their fixture implementations: `types.ts` (interfaces), `llm/fixture.ts`, `candidates/fixture.ts`, `geocoder/fixture.ts`.
- `src/worker/`: Hono app (`index.ts`), env bindings (`env.ts`), provider selection (`deps.ts`), request validation, D1 access (`db/`), session routes (`routes/session.ts`), "Other" text parsing through the `Llm` seam (`other.ts`), recommendation production (`recommendation.ts`) and order links (`links.ts`).
- `src/shared/`: DTOs shared by the Worker and the client (`api.ts`).
- `src/client/`: React SPA. Screens (`Landing`, `Conversation`, `Recommendation`), components (`ChipGroup`, `ScaleInput`, `QuestionCard`, `RecommendationCard`, `DebugDrawer`), API client.
- `fixtures/sf.ts`: San Francisco restaurants and menus used by tests and by the fixture candidate source.
- `migrations/`: D1 schema, applied locally by `pnpm db:migrate` and in Worker tests by `test/worker/apply-migrations.ts`.
- `test/core`, `test/worker`, `test/client`: the three Vitest projects (node, workerd, jsdom).
- `scripts/`: gates (`check.sh`, `typecheck.sh`, `test.sh`, `build.sh`, `setup.sh`) and the workflow tools under `scripts/workflow/`.

## Shared interfaces

Changes here land before dependent work starts, or are stacked explicitly.

- `src/shared/api.ts`: `SessionDto`, `QuestionDto`, `AnswerDto`, `RecommendResponse`, `RecommendationDto`, `MenuItemDto`, `FeedbackRequest`, `ApiError`. The client and the Worker both compile against it.
- `src/providers/types.ts`: `Llm.completeJson`, `Geocoder.geocodeZip`, `CandidateSource.candidates`. A real provider implements one of these and is selected in `src/worker/deps.ts` by `env.ts` vars (`RESTAURANT_PROVIDER`, `LLM_PROVIDER`, `GEOCODER`).
- `src/core/kb/schema.ts`: Zod schemas for nodes, options, effects, rules, archetypes, lexicon entries and overlay additions, with `KB_SCHEMA_VERSION`. `kb/*.json` must validate against it; the loader rejects anything else.
- `src/core/types.ts`: `SCORE_KEYS`, `Scores`, `ItemTags`, `MenuItem`, `RestaurantSummary`. Every scoring, tagging and archetype vector uses these keys.
- `migrations/0001_init.sql`: the D1 schema. Adding a table or column is a new numbered migration, never an edit to a shipped one.
- API routes under `/api/session`: `POST /`, `GET /:id`, `POST /:id/answer`, `POST /:id/suggest`, `POST /:id/recommend`, `POST /:id/feedback`. This is a subset of the design spec's list; feedback derives the shown items server-side rather than taking `shownItemIds`. `/api/health` for liveness.

## Invariants

Codebase reviews check changed code against this list; add an entry when the same class of problem appears twice.

- `src/core/` imports nothing from `src/worker/`, `src/client/`, `src/providers/`, Hono, React or Cloudflare types. It is testable under plain node.
- Knowledge base content lives in `kb/*.json`. Code never hardcodes a question, archetype or lexicon entry; it reads them through the loader.
- The final ranking is deterministic: the same candidates and preferences produce the same primary, runner-up and trace. No LLM output picks or reorders recommendations. LLM output, where it exists at all, is cacheable data upstream of ranking.
- Explanations use only menu item names, descriptions and prices, restaurant names, and attribute words from the scoring trace. They never invent ingredients and never claim a quality the diner asked to avoid.
- Sessions store a ZIP label and a centroid only, never a street address. `sessions.owner_id` is nullable and unused; there is no account concept.
- Request bodies are validated with Zod before any D1 write; invalid input returns 400, not a 500 or a row with bad data.
- Worker code stays within the free plan: no KV, Queues or Durable Objects; never loop over external calls inside one request.
- Copy is confident and concise, with no emoji and no "AI assistant" phrasing. "Make a dishision." is the one pun.

## Isolation for concurrent work

Each worktree owns its mutable state: its own `node_modules/` (`pnpm install --frozen-lockfile` via `scripts/setup.sh`), its own local D1 and Miniflare state under `.wrangler/`, its own `dist/`. Worker tests run in-process workerd instances with migrations applied per run, so parallel test runs in different worktrees do not share a database. `pnpm dev` picks the next free port when the default is taken. All of these directories are ignored by git; scripts resolve tools relative to the worktree they run in. Git hooks are shared through `core.hooksPath=.githooks`, which `scripts/setup.sh` sets once per repository.

## Where to look first

- `src/core/questions.ts` with `kb/questions.json`: how the conversation picks the next node and when it is ready.
- `src/core/scoring.ts` and `src/core/pairs.ts`: how a candidate becomes a recommendation, and what the trace records.
- `src/worker/routes/session.ts`: the request path from answer to recommendation to feedback.
- `test/core/scenarios.test.ts`: the spec's scenarios as executable expectations against the fixtures.
