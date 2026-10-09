# Dishision: design

## Context

Dishision ("Make a dishision.") is a web app for people who know they need
dinner but cannot name what they want. It asks a short, adaptive set of
questions about how dinner should feel, turns the answers into a structured
preference profile, finds nearby restaurants, reads their menus, and
recommends one specific dish or pair of dishes with a grounded explanation,
plus a runner-up and a "show me another" loop.

The pasted spec is a guideline, not gospel. Decisions made in brainstorming
that depart from or sharpen it:

- Audience for v1 is the owner's household, but no one-way doors: every
  design choice must leave a public product possible (provider seams,
  nullable session owner, minimal location data, no ToS-breaking scraping).
- Hosting on Cloudflare free plan only. Runs locally with one command
  against the real external APIs (no separate offline app mode), but with
  fixture providers for tests.
- Restaurant discovery is fully automatic via Google Places API (New). Menus
  come from restaurants' own websites and ordering pages, and from menus the
  user pastes in. No DoorDash or Uber Eats data access (merchant-only APIs,
  scraping forbidden); only deep links out.
- Discovery is demand-driven: no external call happens until the
  conversation has produced a profile. The cache then grows in the shape of
  the household's actual tastes.
- As little AI as possible. The conversation is a rule-driven question graph
  (expert system) in data, not a chatbot. The LLM is used only for: parsing
  "Other" free text, extracting menu items from fetched text, tagging items
  the keyword lexicon cannot, and a one-off attribute proposal when a user
  suggestion is approved. The final ranking is deterministic and the
  explanation is a template over the scoring trace. LLM is Cloudflare
  Workers AI (free 10k neurons/day) behind an interface; Anthropic can slot
  in later.
- Users can flag "you're missing an option here" (e.g. "ramen"), which lands
  in a moderation queue and can be approved into the knowledge base.
- Everything fetched or generated is cached in D1 with a per-source TTL.
  Google Places content honours Google's 30-day caching term; place IDs are
  kept forever; website-derived menus 60 days; pasted menus 180 days.

## Free-tier constraints that shaped the design (verified 2026-10-08)

| Resource | Free limit | Design consequence |
|---|---|---|
| Workers | 100k req/day, 10 ms CPU, 50 subrequests per invocation | Background work is split into small jobs; one job per status poll plus Cron |
| D1 | 5M reads, 100k writes per day, 5 GB | D1 is the only store and cache |
| KV | 1,000 writes/day | Not used |
| Workers AI | 10k neurons/day; JSON mode on llama-3.3-70b-fp8-fast and llama-3.1-8b | 8B for extraction/tagging, 70B for "Other" parsing; lexicon before LLM; everything cached |
| Browser Rendering | 10 min/day, 1 request per 10 s | Last resort for JS-shell menu pages only |
| Places Text Search Pro | 5,000/month | <= 5 queries per session, results cached |
| Places Details Enterprise (websiteUri, hours, priceLevel) | 1,000/month | Only for the top ~8 shortlisted restaurants per session, cached 30 days |
| Geocoding Essentials | 10k/month | ZIP to centroid, cached 30 days |
| Cron Triggers | 5 per account | One cron draining the job table |

Daily budget caps in config sit well under each of these. On cap, the
provider degrades to cache-only and the UI says so.

## Architecture

Single repo, single Worker, one local command.

- **Runtime:** Hono API inside the Worker; React SPA built with Vite, served
  via Workers Static Assets. `@cloudflare/vite-plugin` runs both under
  `vite dev` with Miniflare (local D1, AI binding proxied to the account).
  Deploy with `wrangler deploy`.
- **Storage:** D1 only, migrations in `migrations/`.
- **Core logic** in `src/core/` is pure TypeScript with no bindings:
  preference model, knowledge base loader, question graph, search planner,
  lexicon tagger, scorer, pair composer, explanation templates, feedback
  edits. Tested with plain Vitest.
- **Provider seams** in `src/providers/`, each with a real and a fixture
  implementation selected by env config:
  - `RestaurantProvider`: `GooglePlacesProvider`, `FixtureRestaurantProvider`
  - `Geocoder`: `GoogleGeocoder`, `FixtureGeocoder`
  - `MenuFetcher`: `WebMenuFetcher` (fetch, menu-link discovery, toMarkdown,
    Browser Rendering fallback), `FixtureMenuFetcher`
  - `Llm`: `WorkersAiLlm` (model tiers), `FixtureLlm` (deterministic stub).
    Interface: `complete(json<Schema>(prompt, schema, tier))`.
- **Jobs:** `ingest_jobs` table. `GET /api/session/:id/status` runs one due
  job in `ctx.waitUntil`; a Cron trigger every 5 minutes runs up to N jobs.
  Attempts, backoff, failure reason recorded.
- **Budget guards:** `api_usage(day, sku, count)` checked before every
  external call.

### Repo layout

```
dishision/
  package.json            # scripts: dev, build, test, deploy, db:migrate
  wrangler.jsonc          # d1, ai, browser, assets, cron, vars
  vite.config.ts          # react + @cloudflare/vite-plugin
  migrations/0001_init.sql
  src/
    worker/               # Hono app, routes, job runner, cron
      index.ts
      routes/{session,restaurants,admin}.ts
      jobs/{runner,discover,details,fetchMenu,extract,classify}.ts
      db/{queries,types}.ts
    core/                 # pure logic, no bindings
      preferences.ts      # DinnerPreferences, merge, feedback edits
      kb/                 # knowledge base loader + types
      questions.ts        # question graph selection
      planner.ts          # prefs -> archetypes -> search queries
      lexicon.ts          # keyword tagger
      scoring.ts          # item score, penalties, trace
      pairs.ts            # pair composition
      explain.ts          # template explanation
      otherText.ts        # "Other" parsing schema + fallback keywords
    providers/            # seams + real/fixture impls
    shared/               # API types shared with client
    client/               # React SPA (Vite root)
      main.tsx, App.tsx
      screens/{Landing,Conversation,Searching,Recommendation,AddMenu,Admin}.tsx
      components/{ChipGroup,ScaleInput,QuestionCard,RecommendationCard,DebugDrawer}.tsx
  kb/                     # knowledge base JSON (questions, archetypes, lexicon)
    questions.json
    archetypes.json
    lexicon.json
  fixtures/               # ~20 SF restaurants with menus, for tests
  test/                   # vitest (core) and vitest-pool-workers (worker)
  docs/superpowers/specs/2026-10-08-dishision-design.md   # this design, committed
```

Tooling: TypeScript strict, Vitest, `@cloudflare/vitest-pool-workers`,
Tailwind, Zod for schemas (shared between API validation and LLM JSON
schemas). pnpm if installed, otherwise npm. Git: init with
`user.email jonathan.hitchcock@gmail.com` (personal project), no AI
attribution in commits.

## Data model (D1)

- `sessions(id, owner_id NULL, zip_label, lat, lng, prefs JSON, asked JSON,
  status, created_at, updated_at)` — coarse location only.
- `restaurants(place_id PK, name, lat, lng, primary_type, types JSON, rating,
  user_rating_count, price_level, website_uri, maps_uri, hours JSON,
  delivery INT NULL, details_level ('search'|'details'), fetched_at,
  expires_at)` — all non-ID fields expire 30 days after fetch.
- `menu_sources(id, place_id, kind ('website'|'user_pasted'|'google_photo'),
  ref, status ('pending'|'fetched'|'extracted'|'failed'), text_hash,
  text TEXT NULL, error, fetched_at, expires_at)`.
- `menu_items(id, place_id, source_id, name, description, price_cents,
  section, position)`.
- `menu_item_attributes(item_id PK, tagger ('lexicon'|'llm'), model,
  prompt_version, tags JSON, scores JSON, confidence, classified_at)`.
  Scores: spicy, rich, brothy, bright_acidic, protein_forward, carb_heavy,
  comforting, adventurous, handheld, crispy, portion (each 0..1).
- `llm_cache(key PK, model, prompt_version, output JSON, created_at)`.
- `search_cache(key PK, provider, response JSON, fetched_at, expires_at)`.
- `ingest_jobs(id, kind, place_id, session_id NULL, payload JSON, priority,
  status, attempts, run_after, error, created_at, updated_at)`.
- `recommendations(id, session_id, payload JSON, trace JSON, feedback_reason,
  created_at)`.
- `suggestions(id, session_id, node_id, text, prefs_snapshot JSON, status
  ('pending'|'approved'|'rejected'), created_at, reviewed_at)`.
- `kb_additions(id, kind ('archetype'|'option'), node_id, payload JSON,
  created_at)` — merged over repo JSON by the KB loader.
- `api_usage(day, sku, count, PRIMARY KEY(day, sku))`.

## Preference model

`DinnerPreferences` as in the spec section 5, trimmed to what the question
graph can actually set: hunger; desiredQualities (comforting, fresh, rich,
spicy, savory, brightAcidic, brothy, crispy, each -1..1); heaviness; protein
weights; seafood and beef sub-preferences; carbs (rice, noodles, bread,
tortillas, starchAsMain); cuisines map; novelty; handheld; leftovers;
budget; recentMeals; futureMeals; exclusions; notes. All optional. Merge is
"latest answer wins per field, union for lists".

Chip intensity: one tap = 0.5, two taps = 1.0, third tap clears. Scale
nodes map five stops to -1, -0.5, 0, 0.5, 1 on their field. Yes/no maps to
1 / -1 / unset.

## Knowledge base (kb/*.json plus D1 overlay)

The base knowledge base is versioned JSON in the repo because archetype
vectors and lexicon entries are scoring logic: they want diffs, review and
tests. Approved user suggestions land in the `kb_additions` table so they
take effect without a deploy. The loader merges base + overlay at startup.

Merge rules (enforced by `src/core/kb/loader.ts`, covered by tests):

- Overlay rows may add a new archetype, add an option to an existing node,
  or add a lexicon entry. They never modify or delete base entries.
- Overlay IDs are prefixed (`kb_` + row id) so they cannot collide with
  base IDs.
- Every overlay row carries `kb_schema_version` and is validated with the
  same Zod schema as the base. Invalid rows are skipped and listed on the
  admin page; they never crash the app.
- The admin page has an export that emits the merged JSON (or additions
  only) for pasting back into the repo. Periodic promotion keeps the base
  authoritative. Moving to "approval opens a pull request" later would
  touch only the approve handler.

**questions.json**: nodes `{ id, kind: 'single'|'multi'|'scale'|'yesno',
prompt, options: [{ id, label, effects: [{ path, value }] }], poles?,
field?, applies: Rule[], allowMissingOption: bool, round: 1|2 }`.
`Rule` is a small JSON predicate language: `{ path, op: 'gte'|'lte'|'eq'|
'set'|'unset'|'in', value }` with `all`/`any`. No code in data.

Round-one nodes (always asked, in order): hunger (single), feel (multi:
comforting, fresh, rich, spicy, savory, no idea), protein (multi), novelty
(scale familiar..adventurous), avoid tonight (multi of cuisines + Other).

Round-two nodes (asked if `applies` passes, max 3, in priority order):
brothy (yesno; applies if comforting >= 0.5 or heaviness avoid_heavy or
feel "no idea"), heaviness (scale; if comforting set and rich unset), beef
style (multi; if beef >= 0.5), seafood type (multi; if seafood >= 0.5),
carbs (multi; if no carb field set), handheld (yesno; if hunger very_hungry
and rich >= 0.5), archetype gut-check (multi over the planner's current top
archetypes; if more than 4 remain plausible; `allowMissingOption: true`),
budget (single; if unset), leftovers (yesno; if very_hungry or budget low).

Readiness: round one done and no round-two node applies, or three
round-two nodes asked.

**archetypes.json**: ~60 entries `{ id, label, cuisine, proteins[],
formats[], searchTerms[], scores{...same keys as item scores...}, category
}`. Used by the planner (prefs -> top archetypes -> Places queries), by the
gut-check node, by menu-less restaurant scoring, and as the test oracle.

**lexicon.json**: keyword -> partial scores/tags, e.g. "broth|soup|pho|
ramen" -> brothy 0.9; "fried|crispy" -> crispy 0.8, rich +0.3; "lime|
vinegar|pickled|ceviche" -> bright_acidic 0.7. Tagger confidence rises with
the number of hits; items under a threshold go to the LLM.

## Scoring (src/core/scoring.ts, pairs.ts)

Hard filters: excluded cuisines, restaurant closed with no scheduled option,
budget max exceeded by a single item.

Item score = weighted cosine-like alignment between desiredQualities and
item scores + protein match + cuisine affinity + novelty alignment
(adventurous vs novelty) + hunger/portion fit + restaurant quality (rating,
rating count, open now, delivery flag) - penalties: rich when
avoid_heavy, carb_heavy when starchAsMain <= -0.5, cuisine in recentMeals
or futureMeals, duplicate of a previously rejected item.

Pairs: within one restaurant, combine top items; pair score = profile
coverage (max per quality across the two) - penalties for two heavy, two
starch bases, duplicated dominant flavour, total price vs budget, total
portion vs hunger. A pair wins only if it beats the best single by a margin.

Menu-less restaurants are scored by their best matching archetype at a
fixed discount and labelled "menu not read yet".

Output: primary, runner-up from a different restaurant where possible, each
with a trace `{ positiveSignals, penalties, components }`.

Explanation: template over the trace, e.g. "Tom yum plus grilled beef
salad. Broth and lime brightness from the soup, grilled beef without a rice
base from the salad. Skipped the curry: too rich for 'not heavy'." Uses
only menu-listed names and descriptions. `EXPLAIN_LLM=true` enables a 70B
rewrite constrained to the same facts, off by default.

Feedback ("show me another"): reason -> deterministic preference edit
(too heavy: rich -0.4, heaviness avoid_heavy; too boring: novelty up one
step; too spicy: spicy -0.5; too much starch: starchAsMain -1; had that
recently: cuisine -> recentMeals; not feeling that cuisine: cuisine -1;
too expensive: budget max = 0.8 * shown price; just another: no edit) +
exclude shown items, re-rank. No questions re-asked.

## Ingestion pipeline (src/worker/jobs)

1. **discover** (session-scoped): planner picks top <= 5 archetypes ->
   Places Text Search Pro with location bias (ZIP centroid, ~5 km),
   minimal Pro field mask (id, displayName, location, types, primaryType,
   rating, userRatingCount, priceLevel if Pro, businessStatus). Verify
   field/SKU tiers against docs at implementation time. Results cached 7
   days keyed by query + rounded location; restaurants upserted at
   `details_level='search'`.
2. **shortlist**: rank restaurants by archetype match x rating x
   proximity; top 8 become session candidates.
3. **details**: for candidates missing fresh details: Place Details
   Enterprise (websiteUri, regularOpeningHours, priceLevel, delivery,
   googleMapsUri). Cap 25/day.
4. **fetch_menu**: for candidates with no fresh `menu_sources`: check
   robots.txt; GET website with a Dishision user agent; find menu URL
   candidates (anchor text /menu|order|food|eat/i, known ordering hosts:
   toasttab, squareup/square.site, chownow, clover, owner.com, bentobox,
   popmenu, menufy, slicelife; schema.org `hasMenu`); fetch best; HTML ->
   text (strip scripts/nav; `env.AI.toMarkdown` for PDF); if text under a
   minimum, Browser Rendering `/markdown` (cap 40/day, respects 10 s
   spacing via `run_after`). Store text and hash.
5. **extract**: chunk text; 8B JSON mode -> `[{ name, description, price,
   section }]`; validate with Zod; cache by text-chunk hash.
6. **classify**: lexicon pass; ambiguous items in batches of ~15 to 8B
   -> scores/tags; cache by item hash.

Recommendation is computed when >= 3 candidates have extracted menus, or
60 s since search start, or all session jobs settled, or the user presses
"Just decide". Remaining jobs keep running via status polls and Cron, so
the next session is faster.

**Paste-a-menu**: `/add-menu`: search restaurant by name (Text Search,
cached), paste text -> `menu_sources(kind='user_pasted', expires 180 d)`
-> extract -> classify. Image paste later via `toMarkdown`.

## API (Hono, /api)

- `POST /session { zip | lat,lng }` -> `{ session, question }`
- `GET /session/:id` -> state (prefs and asked list when `?debug=1`)
- `POST /session/:id/answer { nodeId, selections[{optionId, intensity}] |
  scale | yesno, otherText? }` -> `{ question } | { status: 'ready' }`
- `POST /session/:id/suggest { nodeId, text }` -> 202 (rate-limited)
- `POST /session/:id/search` -> starts discover job, `{ status }`
- `GET /session/:id/status` -> `{ restaurantsFound, menusReady,
  menusPending, canRecommend }`; pumps one job in `waitUntil`
- `POST /session/:id/recommend { force? }` -> `{ primary, runnerUp,
  trace? }`
- `POST /session/:id/feedback { reason, shownItemIds }` -> new
  recommendation
- `GET /restaurants/search?q=&sessionId=` -> for paste flow
- `POST /restaurants/:placeId/menu { text }` -> source id
- `GET /admin/*` (header or query secret from env): suggestions list,
  approve (with LLM-proposed archetype payload for editing), reject;
  usage counters; failed jobs; retry.
- Cron handler: run up to N due jobs.

## UI (React, Tailwind)

- **Landing:** name, tagline, ZIP input, "use my location", debug toggle.
- **Conversation:** one `QuestionCard` at a time; `ChipGroup` with
  three-state intensity, `ScaleInput` with five stops, yes/no/don't mind;
  collapsed "Other" field; "Missing an option?" link on list nodes opens a
  one-line form and thanks the user; back button; "Narrowing it down" line
  instead of a counter.
- **Searching:** live status lines ("Found 43 places nearby", "Reading
  menus: 3 of 8"), "Just decide" button.
- **Recommendation:** `RecommendationCard` with restaurant, items with
  prices, open/delivery flags if known, explanation, links (website,
  Google Maps, DoorDash and Uber Eats name searches), feedback chips and
  "show me another"; runner-up smaller below; "menu not read yet" label
  when applicable.
- **DebugDrawer** (`?debug=1`): prefs JSON, node selection reasons,
  candidate list with traces, job states, usage counters, and a
  "critique this ranking" button (LLM, debug only).
- **AddMenu** and **Admin** screens as above.
- Tone per spec section 12: confident, concise, no emoji, one pun.

## Privacy and terms

- Store ZIP label and centroid only; never a street address.
- Places content expires 30 days after fetch; a daily Cron pass deletes or
  refreshes expired rows. Place IDs persist.
- Respect robots.txt and identify the fetcher. Only restaurants' own sites
  and first-party ordering pages are fetched.
- Admin secret in env, replaceable by auth later. Suggestion endpoint
  rate-limited per session and per day.

## Testing

- **Core unit (Vitest):** question graph sequences and readiness; preference
  merge and feedback edits; planner (prefs -> archetypes -> queries);
  lexicon tagger; scorer and pair composer; explanation templates; "Other"
  keyword fallback. Spec scenarios A, B, C run against `fixtures/` menus and
  assert the winning item's archetype category.
- **Worker integration (vitest-pool-workers):** full session flow with
  fixture providers and local D1 migrations; job runner; budget guards;
  admin approve path.
- **Manual:** local run against SF ZIP with debug drawer, checklist in
  README.
- Test-first for every core module.

## Implementation phases

1. **Scaffold.** Vite + React + Hono + `@cloudflare/vite-plugin`, Tailwind,
   Vitest, D1 migration 0001, env config, fixture providers, git init with
   personal email, README skeleton, commit the design spec.
2. **Conversation.** Preference model, KB loader with rule language,
   `questions.json` round one and two, question graph, session routes,
   conversation UI and debug drawer. "Other" parsing via `Llm` seam with
   keyword fallback. Suggestions table and endpoint.
3. **Ranking on fixtures.** `archetypes.json`, `lexicon.json`, planner,
   scorer, pairs, templates, feedback edits, recommend/feedback routes
   using `FixtureRestaurantProvider` and fixture menus. Scenario tests
   pass. Recommendation card and feedback UI.
4. **Real discovery.** Geocoder, `GooglePlacesProvider` (search + details)
   with field masks verified against docs, `search_cache`, budget guards,
   30-day expiry sweep.
5. **Menu ingestion.** Job runner, status pump, Cron, `WebMenuFetcher`
   stages, extraction and classification via Workers AI with `llm_cache`,
   searching screen, "Just decide".
6. **Supplement and admin.** Paste-a-menu flow, admin page with suggestion
   moderation (LLM-proposed archetype payload), usage counters, failed
   jobs, "critique this ranking" debug button.
7. **Deploy.** `wrangler deploy`, D1 remote migrations, secrets, README
   with setup and the manual checklist.

Later, out of scope for this pass: Google photo menus, Anthropic provider,
LLM explanation rewrite on by default, accounts, image paste.

## Verification

- `pnpm test` (or `npm test`): all core and worker tests green, including
  scenarios A, B, C.
- `pnpm dev`: open the app, enter an SF ZIP, answer six to eight questions,
  watch the searching screen reach a recommendation within about a minute,
  confirm the explanation cites only listed menu text, press "show me
  another" with a reason and get a different, sensible result.
- Debug drawer shows preference JSON, traces and job states; admin page
  shows usage counters under caps after a session.
- Paste a menu for a known restaurant, run a matching session, confirm the
  pasted items can win.
- `wrangler deploy` to the free plan succeeds and the same flow works on
  the deployed URL.

