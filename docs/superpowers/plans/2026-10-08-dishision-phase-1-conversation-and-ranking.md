# Dishision Phase 1: Conversation and Ranking on Fixtures. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Dishision loop on fixture data: ZIP in, six to eight adaptive questions, a deterministic recommendation with a grounded explanation, a runner-up, and "show me another", all running locally under `pnpm dev` and deployable to a Cloudflare Worker.

**Architecture:** One Cloudflare Worker (Hono API) plus a React SPA served as Workers Static Assets, built together by Vite with `@cloudflare/vite-plugin`. All reasoning lives in pure TypeScript under `src/core/` (preference model, JSON knowledge base with a rule language, question graph, archetype planner, lexicon tagger, scorer, pair composer, templates). D1 stores sessions and recommendations. External providers sit behind seams; this phase ships only fixture implementations. Real discovery and menu ingestion are the next plan.

**Tech Stack:** TypeScript 5.9, Vite 8, React 19, Tailwind 4 (`@tailwindcss/vite`), Hono 4, Zod 4, Wrangler 4, `@cloudflare/vite-plugin`, Vitest 5 with `@cloudflare/vitest-plugin` for Worker tests and jsdom for component tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-08-dishision-design.md`

## Global Constraints

- Cloudflare free plan only: no KV, no Queues, no Durable Objects, no paid add-ons. D1 is the only store.
- Worker code must stay under 10 ms CPU per request and 50 subrequests per invocation. Scoring a few hundred candidates is fine; never loop over external calls in a request.
- No LLM call is made anywhere in this phase. The `Llm` seam exists and is used for "Other" text, but the only implementation is `FixtureLlm`. `LLM_PROVIDER=fixture` is the default.
- The final ranking is deterministic. No model picks or reorders recommendations.
- Explanations use only menu item names, descriptions, prices and restaurant names from the candidate data, plus attribute words from the trace. Never invent ingredients.
- Sessions store only a ZIP label and a centroid. Never a street address.
- `sessions.owner_id` is nullable and unused. Do not add any account concept.
- Knowledge base content lives in `kb/*.json`. Code never hardcodes a question, archetype or lexicon entry.
- Copy tone (spec section 12): confident, concise, no emoji, no "AI assistant" phrasing. The tagline "Make a dishision." is the one pun.
- Git: personal email is already configured on the repo. No AI attribution lines in commit messages.
- Package manager is pnpm (12.x installed). Node 26 is installed.

## Review Focus

Inputs the spec implies but no task's tests cover by default. Each line names the owning task, which carries the test.

1. A user who skips every question (no selections, no text) must still reach a recommendation rather than an empty or crashing result. Task 5 tests that an empty answer advances the conversation; Task 11 and Task 13 test that `recommend()` with empty preferences returns a primary.
2. "Other" text containing only a negation ("no pork, nothing fried") must not be read as a positive preference. Task 6 tests negated cuisines and proteins become exclusions only.
3. A ZIP that is not five digits, or a lat/lng outside range, must return 400 rather than create a session with bad coordinates. Task 7 tests the validation.
4. Every candidate being hard-filtered (exclusions cover all cuisines) must return `primary: null` with a usable message, not a 500. Task 13 tests the core; Task 14 tests the route.
5. Repeated feedback must never show an item that was already shown and must keep answering while candidates remain. Task 11 tests rejected ids; Task 14 tests six rounds of feedback through the API.

---

## File structure

```
dishision/
  package.json  pnpm-lock.yaml  wrangler.jsonc  vite.config.ts  index.html
  tsconfig.base.json  tsconfig.worker.json  tsconfig.client.json
  vitest.config.ts  vitest.core.config.ts  vitest.worker.config.ts  vitest.client.config.ts
  wrangler.test.jsonc            # minimal config for Worker tests (no assets block)
  .dev.vars.example  .gitignore  README.md  CLAUDE.md
  migrations/0001_init.sql
  kb/questions.json  kb/archetypes.json  kb/lexicon.json
  fixtures/sf.ts                 # restaurants + menus for tests and fixture provider
  src/
    shared/api.ts                # DTOs shared by client and worker
    core/
      types.ts                   # ScoreKey, MenuItem, RestaurantSummary, ItemTags
      preferences.ts             # DinnerPreferences, emptyPreferences, applyEffects, getPath
      kb/schema.ts               # Zod schemas and TS types for the knowledge base
      kb/rules.ts                # evalRule
      kb/loader.ts               # loadBaseKb, parseKb, mergeKb
      questions.ts               # nextQuestion, applyAnswer, deriveContext
      otherText.ts               # PreferencePatch schema, keywordParse, applyPatch, prompt
      planner.ts                 # rankArchetypes, plausibleArchetypes, planQueries
      lexicon.ts                 # tagItem
      alignment.ts               # alignQualities
      scoring.ts                 # scoreItem
      pairs.ts                   # composePairs, recommend
      explain.ts                 # explain
      feedback.ts                # applyFeedback
    providers/
      types.ts                   # Llm, CandidateSource, Geocoder interfaces
      llm/fixture.ts             # FixtureLlm
      candidates/fixture.ts      # FixtureCandidateSource
      geocoder/fixture.ts        # FixtureGeocoder
    worker/
      env.ts  index.ts  deps.ts  validation.ts
      db/sessions.ts  db/recommendations.ts  db/suggestions.ts
      routes/session.ts
    client/
      main.tsx  App.tsx  api.ts  styles.css
      screens/Landing.tsx  screens/Conversation.tsx  screens/Recommendation.tsx
      components/ChipGroup.tsx  components/ScaleInput.tsx  components/QuestionCard.tsx
      components/RecommendationCard.tsx  components/DebugDrawer.tsx
  test/
    core/*.test.ts               # node project
    worker/env.ts  worker/apply-migrations.ts  worker/*.test.ts   # workerd project
    client/*.test.tsx            # jsdom project
```

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `wrangler.test.jsonc`, `vite.config.ts`, `index.html`, `tsconfig.base.json`, `tsconfig.worker.json`, `tsconfig.client.json`, `vitest.config.ts`, `vitest.core.config.ts`, `vitest.worker.config.ts`, `vitest.client.config.ts`, `.dev.vars.example`, `README.md`, `CLAUDE.md`
- Create: `src/worker/env.ts`, `src/worker/index.ts`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/styles.css`
- Create: `migrations/0001_init.sql`
- Test: `test/worker/health.test.ts`, `test/worker/env.ts`, `test/worker/apply-migrations.ts`, `test/core/smoke.test.ts`

**Interfaces:**
- Produces: `Env` interface in `src/worker/env.ts`; Hono app exported from `src/worker/index.ts`; `testEnv` helper in `test/worker/env.ts`; the D1 schema every later task relies on.

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/jonathan.hitchcock/src/dishision
pnpm init
pnpm add hono zod react react-dom
pnpm add -D typescript@^5.9 vite@^8 @vitejs/plugin-react @cloudflare/vite-plugin wrangler@^4.149 \
  @cloudflare/workers-types tailwindcss @tailwindcss/vite \
  vitest@^5 @cloudflare/vitest-plugin jsdom @testing-library/react @testing-library/dom \
  @types/react @types/react-dom
```

- [ ] **Step 2: Write package.json scripts**

Replace the `scripts` block in `package.json` with:

```json
{
  "name": "dishision",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.worker.json --noEmit && tsc -p tsconfig.client.json --noEmit",
    "db:migrate": "wrangler d1 migrations apply dishision --local",
    "db:migrate:remote": "wrangler d1 migrations apply dishision --remote"
  }
}
```

Keep the `dependencies` and `devDependencies` pnpm wrote.

- [ ] **Step 3: Write wrangler.jsonc and wrangler.test.jsonc**

`wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "dishision",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2026-09-01",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "dishision",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "vars": {
    "RESTAURANT_PROVIDER": "fixture",
    "LLM_PROVIDER": "fixture",
    "GEOCODER": "fixture"
  },
  "observability": { "enabled": true }
}
```

The `database_id` placeholder is fine for local development. The deploy plan replaces it.

`wrangler.test.jsonc` (same bindings, no assets block, so the Vitest plugin does not look for a built client directory):

```jsonc
{
  "name": "dishision-test",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2026-09-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "dishision", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
  ],
  "vars": { "RESTAURANT_PROVIDER": "fixture", "LLM_PROVIDER": "fixture", "GEOCODER": "fixture" }
}
```

- [ ] **Step 4: Write Vite, TypeScript and Vitest configs**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`tsconfig.worker.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/experimental", "@cloudflare/vitest-plugin/types", "node"]
  },
  "include": ["src/worker", "src/core", "src/providers", "src/shared", "kb", "fixtures", "test/core", "test/worker", "vitest.*.ts", "vite.config.ts"]
}
```

If `tsc` complains that it cannot find type definitions for `node`, run `pnpm add -D @types/node`.

`tsconfig.client.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/client", "src/shared", "src/core", "test/client"]
}
```

`vitest.config.ts` (three projects):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.core.config.ts', './vitest.worker.config.ts', './vitest.client.config.ts'],
  },
});
```

`vitest.core.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'core',
    environment: 'node',
    include: ['test/core/**/*.test.ts'],
  },
});
```

`vitest.worker.config.ts`:

```ts
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineProject } from 'vitest/config';

export default defineProject(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      name: 'worker',
      include: ['test/worker/**/*.test.ts'],
      setupFiles: ['./test/worker/apply-migrations.ts'],
    },
  };
});
```

`vitest.client.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'client',
    environment: 'jsdom',
    include: ['test/client/**/*.test.tsx'],
  },
});
```

- [ ] **Step 5: Write the D1 migration**

`migrations/0001_init.sql`:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  zip_label TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  prefs TEXT NOT NULL,
  asked TEXT NOT NULL,
  round2_asked INTEGER NOT NULL DEFAULT 0,
  rejected_item_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'asking',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE restaurants (
  place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL, lng REAL,
  primary_type TEXT,
  types TEXT,
  rating REAL,
  user_rating_count INTEGER,
  price_level INTEGER,
  website_uri TEXT,
  maps_uri TEXT,
  hours TEXT,
  delivery INTEGER,
  details_level TEXT NOT NULL DEFAULT 'search',
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE menu_sources (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  text_hash TEXT,
  text TEXT,
  error TEXT,
  fetched_at TEXT,
  expires_at TEXT
);
CREATE INDEX menu_sources_place ON menu_sources(place_id);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER,
  section TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX menu_items_place ON menu_items(place_id);

CREATE TABLE menu_item_attributes (
  item_id TEXT PRIMARY KEY,
  tagger TEXT NOT NULL,
  model TEXT,
  prompt_version INTEGER,
  tags TEXT NOT NULL,
  scores TEXT NOT NULL,
  confidence REAL NOT NULL,
  classified_at TEXT NOT NULL
);

CREATE TABLE llm_cache (
  key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE search_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  response TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  place_id TEXT,
  session_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ingest_jobs_due ON ingest_jobs(status, run_after, priority);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  trace TEXT NOT NULL,
  feedback_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX recommendations_session ON recommendations(session_id);

CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  text TEXT NOT NULL,
  prefs_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE kb_additions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  node_id TEXT,
  kb_schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE api_usage (
  day TEXT NOT NULL,
  sku TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sku)
);
```

- [ ] **Step 6: Write the Worker entry, Env and client shell**

`src/worker/env.ts`:

```ts
export interface Env {
  DB: D1Database;
  RESTAURANT_PROVIDER: 'fixture' | 'google';
  LLM_PROVIDER: 'fixture' | 'workers-ai';
  GEOCODER: 'fixture' | 'google';
  ADMIN_SECRET?: string;
}
```

`src/worker/index.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
```

`index.html` (project root):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dishision</title>
  </head>
  <body class="bg-stone-50 text-stone-900">
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

`src/client/styles.css`:

```css
@import "tailwindcss";
```

`src/client/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/client/App.tsx` (placeholder, replaced in Task 7):

```tsx
export function App() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-3xl font-semibold">Dishision</h1>
      <p className="text-stone-600">Make a dishision.</p>
    </main>
  );
}
```

- [ ] **Step 7: Write the test helpers and the first tests**

`test/worker/env.ts`:

```ts
import { env } from 'cloudflare:workers';
import type { D1Migration } from 'cloudflare:test';
import type { Env } from '../../src/worker/env';

export const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
```

`test/worker/apply-migrations.ts`:

```ts
import { applyD1Migrations } from 'cloudflare:test';
import { testEnv } from './env';

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
```

`test/worker/health.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { testEnv } from './env';

describe('worker scaffold', () => {
  it('serves /api/health', async () => {
    const res = await SELF.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('has the sessions table after migrations', async () => {
    const row = await testEnv.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").first<{ name: string }>();
    expect(row?.name).toBe('sessions');
  });
});
```

`test/core/smoke.test.ts`:

```ts
import { expect, it } from 'vitest';

it('core project runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 8: Run tests and the dev server**

Run: `pnpm test`
Expected: both projects green (3 tests). If the worker project fails to start, read the error: a missing `@types/node` means add it; a complaint about `TEST_MIGRATIONS` means the setup file path is wrong.

Run: `pnpm db:migrate` then `pnpm dev` in a second terminal, open the printed URL. Expected: the placeholder page renders and `curl http://localhost:5173/api/health` returns `{"ok":true}`. Stop the dev server.

Run: `pnpm typecheck`. Expected: no errors.

- [ ] **Step 9: Write .dev.vars.example, README.md and CLAUDE.md**

`.dev.vars.example`:

```
# Copy to .dev.vars for local secrets. Nothing is required in phase 1.
ADMIN_SECRET=change-me
```

`README.md`:

```markdown
# Dishision

Make a dishision.

A web app for people who know they need dinner but cannot name what they want.
It asks a few adaptive questions about how dinner should feel, then recommends
a specific dish or pair of dishes from a nearby restaurant, with a grounded
explanation.

## Development

    pnpm install
    pnpm db:migrate      # creates the local D1 database
    pnpm dev             # Vite + Worker on one port

    pnpm test            # core (node), worker (workerd) and client (jsdom) tests
    pnpm typecheck

## Layout

- `src/core/`: pure reasoning. Preference model, knowledge base, question graph, planner, scorer, templates.
- `kb/`: the knowledge base. Questions, dish archetypes, lexicon. Content lives here, not in code.
- `src/worker/`: Hono API on Cloudflare Workers, D1 access.
- `src/client/`: React SPA.
- `src/providers/`: seams for restaurants, menus, geocoding and the LLM, with fixture implementations.
- `docs/superpowers/specs/`: design. `docs/superpowers/plans/`: implementation plans.
```

`CLAUDE.md`:

```markdown
# Dishision

Read `docs/superpowers/specs/2026-10-08-dishision-design.md` before changing behaviour.

- Reasoning code lives in `src/core/` and must stay free of Worker, DOM and provider imports.
- Knowledge base content lives in `kb/*.json`. Never hardcode questions, archetypes or lexicon entries in code.
- Final ranking is deterministic. No LLM picks or reorders recommendations.
- Explanations only use names, descriptions and prices from candidate data plus trace attributes.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm dev`, `pnpm db:migrate`.
- Commit messages: plain, imperative, no attribution footers.
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Scaffold Worker, SPA, D1 schema and test projects"
```

---

### Task 2: Preference model and effects

**Files:**
- Create: `src/core/preferences.ts`
- Test: `test/core/preferences.test.ts`

**Interfaces:**
- Produces: `DinnerPreferences`, `emptyPreferences()`, `Effect`, `applyEffects(prefs, effects, intensity)`, `getPath(prefs, path)`, `clamp1(n)`, the key constants `QUALITY_KEYS`, `PROTEIN_KEYS`, `SEAFOOD_KEYS`, `BEEF_KEYS`, `CARB_KEYS`. Every later core task imports from here.

- [ ] **Step 1: Write the failing tests**

`test/core/preferences.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEffects, emptyPreferences, getPath } from '../../src/core/preferences';

describe('applyEffects', () => {
  it('sets a nested quality scaled by intensity', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.comforting', value: 1 }], 0.5);
    expect(p.desiredQualities.comforting).toBe(0.5);
  });

  it('does not mutate the input', () => {
    const base = emptyPreferences();
    applyEffects(base, [{ path: 'desiredQualities.spicy', value: 1 }]);
    expect(base.desiredQualities.spicy).toBeUndefined();
  });

  it('sets scalar string fields', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'hunger', value: 'very_hungry' }]);
    expect(p.hunger).toBe('very_hungry');
  });

  it('pushes to list fields without duplicates, lowercased', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'Japanese' }]);
    const p2 = applyEffects(p1, [{ path: 'exclusions', value: 'japanese' }]);
    expect(p2.exclusions).toEqual(['japanese']);
  });

  it('adds and clamps to [-1, 1]', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'proteins.beef', value: 0.8 }]);
    const p2 = applyEffects(p1, [{ path: 'proteins.beef', op: 'add', value: 0.8 }]);
    expect(p2.proteins.beef).toBe(1);
  });

  it('supports max and min', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: 0.5 }]);
    expect(applyEffects(p1, [{ path: 'heaviness', op: 'min', value: -0.5 }]).heaviness).toBe(-0.5);
    expect(applyEffects(p1, [{ path: 'heaviness', op: 'max', value: 0.2 }]).heaviness).toBe(0.5);
  });

  it('does not clamp budget', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'budget.max', value: 30 }]);
    expect(p.budget.max).toBe(30);
  });

  it('rejects unknown fields and malformed paths', () => {
    expect(() => applyEffects(emptyPreferences(), [{ path: 'mood', value: 1 }])).toThrow(/unknown preference field/);
    expect(() => applyEffects(emptyPreferences(), [{ path: 'desiredQualities', value: 1 }])).toThrow();
    expect(() => applyEffects(emptyPreferences(), [{ path: 'hunger.now', value: 1 }])).toThrow();
  });
});

describe('getPath', () => {
  it('reads scalars and nested keys', () => {
    const p = applyEffects(emptyPreferences(), [
      { path: 'hunger', value: 'light' },
      { path: 'cuisines.thai', value: 1 },
    ]);
    expect(getPath(p, 'hunger')).toBe('light');
    expect(getPath(p, 'cuisines.thai')).toBe(1);
    expect(getPath(p, 'cuisines.korean')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project core test/core/preferences.test.ts`
Expected: FAIL, cannot resolve `../../src/core/preferences`.

- [ ] **Step 3: Implement preferences.ts**

```ts
export const QUALITY_KEYS = ['comforting', 'fresh', 'rich', 'spicy', 'savory', 'brightAcidic', 'brothy', 'crispy'] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];
export const PROTEIN_KEYS = ['beef', 'chicken', 'pork', 'seafood', 'vegetarian'] as const;
export type ProteinKey = (typeof PROTEIN_KEYS)[number];
export const SEAFOOD_KEYS = ['fish', 'shellfish', 'salmon'] as const;
export type SeafoodKey = (typeof SEAFOOD_KEYS)[number];
export const BEEF_KEYS = ['thinSliced', 'steak', 'braised', 'ground'] as const;
export type BeefKey = (typeof BEEF_KEYS)[number];
export const CARB_KEYS = ['rice', 'noodles', 'bread', 'tortillas', 'starchAsMain'] as const;
export type CarbKey = (typeof CARB_KEYS)[number];

export type Hunger = 'light' | 'normal' | 'very_hungry';
export type Leftovers = 'want' | 'avoid' | 'indifferent';

export interface DinnerPreferences {
  hunger?: Hunger;
  /** Each -1 (avoid) .. 1 (want). */
  desiredQualities: Partial<Record<QualityKey, number>>;
  /** -1 light .. 1 heavy. Below -0.5 means "not heavy". */
  heaviness?: number;
  /** 1 when the user picked "no idea" on the feel question. */
  noIdea?: number;
  proteins: Partial<Record<ProteinKey, number>>;
  seafood: Partial<Record<SeafoodKey, number>>;
  beef: Partial<Record<BeefKey, number>>;
  carbs: Partial<Record<CarbKey, number>>;
  cuisines: Record<string, number>;
  /** Gut reactions to archetypes from the archetype check question. */
  archetypes: Record<string, number>;
  /** -1 familiar .. 1 adventurous. */
  novelty?: number;
  /** -1 utensils .. 1 hands. */
  handheld?: number;
  leftovers?: Leftovers;
  budget: { max?: number; flexible?: number };
  recentMeals: string[];
  futureMeals: string[];
  exclusions: string[];
  notes: string[];
}

export function emptyPreferences(): DinnerPreferences {
  return {
    desiredQualities: {},
    proteins: {},
    seafood: {},
    beef: {},
    carbs: {},
    cuisines: {},
    archetypes: {},
    budget: {},
    recentMeals: [],
    futureMeals: [],
    exclusions: [],
    notes: [],
  };
}

export type EffectOp = 'set' | 'add' | 'push' | 'max' | 'min';
export interface Effect {
  path: string;
  op?: EffectOp;
  value: number | string;
}

const RECORD_FIELDS = new Set(['desiredQualities', 'proteins', 'seafood', 'beef', 'carbs', 'cuisines', 'archetypes', 'budget']);
const LIST_FIELDS = new Set(['recentMeals', 'futureMeals', 'exclusions', 'notes']);
const SCALAR_FIELDS = new Set(['hunger', 'heaviness', 'noIdea', 'novelty', 'handheld', 'leftovers']);

export function clamp1(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

export function getPath(prefs: DinnerPreferences, path: string): unknown {
  const [head, key, extra] = path.split('.');
  if (!head || extra !== undefined) return undefined;
  const top = (prefs as unknown as Record<string, unknown>)[head];
  if (key === undefined) return top;
  if (top && typeof top === 'object') return (top as Record<string, unknown>)[key];
  return undefined;
}

export function applyEffects(prefs: DinnerPreferences, effects: readonly Effect[], intensity = 1): DinnerPreferences {
  const next = structuredClone(prefs);
  for (const effect of effects) applyOne(next, effect, intensity);
  return next;
}

function applyOne(p: DinnerPreferences, e: Effect, intensity: number): void {
  const [head, key, extra] = e.path.split('.');
  if (!head || extra !== undefined) throw new Error(`bad effect path: ${e.path}`);
  const record = p as unknown as Record<string, unknown>;

  if (LIST_FIELDS.has(head)) {
    if (key !== undefined) throw new Error(`bad effect path: ${e.path}`);
    if ((e.op ?? 'push') !== 'push' || typeof e.value !== 'string') throw new Error(`list field ${head} only supports push of a string`);
    const list = record[head] as string[];
    const v = e.value.trim().toLowerCase();
    if (v && !list.includes(v)) list.push(v);
    return;
  }

  let target: Record<string, unknown>;
  let k: string;
  if (RECORD_FIELDS.has(head)) {
    if (!key) throw new Error(`effect path ${e.path} needs a key`);
    target = record[head] as Record<string, unknown>;
    k = key;
  } else if (SCALAR_FIELDS.has(head)) {
    if (key !== undefined) throw new Error(`bad effect path: ${e.path}`);
    target = record;
    k = head;
  } else {
    throw new Error(`unknown preference field: ${head}`);
  }

  if (typeof e.value === 'string') {
    target[k] = e.value;
    return;
  }
  const scaled = e.value * intensity;
  const current = typeof target[k] === 'number' ? (target[k] as number) : undefined;
  const bound = (n: number) => (head === 'budget' ? n : clamp1(n));
  switch (e.op ?? 'set') {
    case 'set':
      target[k] = bound(scaled);
      break;
    case 'add':
      target[k] = bound((current ?? 0) + scaled);
      break;
    case 'max':
      target[k] = bound(current === undefined ? scaled : Math.max(current, scaled));
      break;
    case 'min':
      target[k] = bound(current === undefined ? scaled : Math.min(current, scaled));
      break;
    default:
      throw new Error(`unsupported op ${e.op} for ${e.path}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --project core test/core/preferences.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/preferences.ts test/core/preferences.test.ts
git commit -m "Add preference model and effect application"
```

---

### Task 3: Knowledge base schema, rule language and loader

**Files:**
- Create: `src/core/kb/schema.ts`, `src/core/kb/rules.ts`, `src/core/kb/loader.ts`, `src/core/kb/index.ts`
- Create: `kb/questions.json`, `kb/archetypes.json`, `kb/lexicon.json` (empty arrays for now; filled in Tasks 4, 5 and 9)
- Create: `src/core/types.ts`
- Test: `test/core/rules.test.ts`, `test/core/kb-loader.test.ts`

**Interfaces:**
- Consumes: `getPath` from Task 2.
- Produces: `SCORE_KEYS`, `ScoreKey`, `Scores`, `ItemTags`, `MenuItem`, `RestaurantSummary` (types.ts); `Rule`, `evalRule(rule, prefs, derived)`; `QuestionNode`, `QuestionOption`, `Archetype`, `LexiconEntry`, `KnowledgeBase`, `KbAddition`, `KB_SCHEMA_VERSION`; `parseKb(raw)`, `loadBaseKb()`, `mergeKb(base, additions)`.

- [ ] **Step 1: Write the shared core types**

`src/core/types.ts`:

```ts
export const SCORE_KEYS = [
  'comforting', 'fresh', 'rich', 'spicy', 'savory', 'brightAcidic', 'brothy', 'crispy',
  'proteinForward', 'carbHeavy', 'adventurous', 'handheld', 'portion',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
/** Each 0..1. Missing means unknown. */
export type Scores = Partial<Record<ScoreKey, number>>;

export interface ItemTags {
  proteins: string[];
  carbs: string[];
  cuisine?: string;
  formats: string[];
  /** Set on fixtures and lexicon hits so tests can assert categories. */
  archetypeId?: string;
}

export interface MenuItem {
  id: string;
  placeId: string;
  name: string;
  description?: string;
  priceCents?: number;
  section?: string;
  scores: Scores;
  tags: ItemTags;
  /** True for archetype placeholders used when a restaurant has no readable menu. */
  menuless?: boolean;
}

export interface RestaurantSummary {
  placeId: string;
  name: string;
  cuisine?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  websiteUri?: string;
  mapsUri?: string;
  openNow?: boolean;
  delivery?: boolean;
}
```

- [ ] **Step 2: Write the failing rule tests**

`test/core/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evalRule } from '../../src/core/kb/rules';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const prefs = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.comforting', value: 0.7 },
  { path: 'hunger', value: 'very_hungry' },
  { path: 'exclusions', value: 'japanese' },
]);

describe('evalRule', () => {
  it('compares numbers', () => {
    expect(evalRule({ path: 'desiredQualities.comforting', op: 'gte', value: 0.5 }, prefs)).toBe(true);
    expect(evalRule({ path: 'desiredQualities.comforting', op: 'lte', value: 0.5 }, prefs)).toBe(false);
    expect(evalRule({ path: 'desiredQualities.rich', op: 'gte', value: 0 }, prefs)).toBe(false);
  });

  it('handles set, unset and eq', () => {
    expect(evalRule({ path: 'hunger', op: 'eq', value: 'very_hungry' }, prefs)).toBe(true);
    expect(evalRule({ path: 'heaviness', op: 'unset' }, prefs)).toBe(true);
    expect(evalRule({ path: 'exclusions', op: 'set' }, prefs)).toBe(true);
    expect(evalRule({ path: 'recentMeals', op: 'set' }, prefs)).toBe(false);
    expect(evalRule({ path: 'carbs', op: 'unset' }, prefs)).toBe(true);
  });

  it('handles includes on lists', () => {
    expect(evalRule({ path: 'exclusions', op: 'includes', value: 'japanese' }, prefs)).toBe(true);
    expect(evalRule({ path: 'exclusions', op: 'includes', value: 'thai' }, prefs)).toBe(false);
  });

  it('combines with all, any and not', () => {
    expect(evalRule({ all: [{ path: 'hunger', op: 'set' }, { path: 'heaviness', op: 'unset' }] }, prefs)).toBe(true);
    expect(evalRule({ any: [{ path: 'heaviness', op: 'set' }, { path: 'hunger', op: 'set' }] }, prefs)).toBe(true);
    expect(evalRule({ not: { path: 'hunger', op: 'set' } }, prefs)).toBe(false);
  });

  it('reads derived values', () => {
    expect(evalRule({ path: 'derived.plausibleArchetypeCount', op: 'gte', value: 5 }, prefs, { plausibleArchetypeCount: 6 })).toBe(true);
    expect(evalRule({ path: 'derived.plausibleArchetypeCount', op: 'gte', value: 5 }, prefs, {})).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement rules.ts**

Run: `pnpm vitest run --project core test/core/rules.test.ts` — Expected: FAIL (module missing).

`src/core/kb/rules.ts`:

```ts
import { getPath, type DinnerPreferences } from '../preferences';

export type RuleOp = 'gte' | 'lte' | 'eq' | 'set' | 'unset' | 'includes';
export type Rule =
  | { path: string; op: RuleOp; value?: number | string | boolean }
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule };

export type Derived = Record<string, unknown>;

function isSet(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

export function evalRule(rule: Rule, prefs: DinnerPreferences, derived: Derived = {}): boolean {
  if ('all' in rule) return rule.all.every((r) => evalRule(r, prefs, derived));
  if ('any' in rule) return rule.any.some((r) => evalRule(r, prefs, derived));
  if ('not' in rule) return !evalRule(rule.not, prefs, derived);
  const v = rule.path.startsWith('derived.') ? derived[rule.path.slice('derived.'.length)] : getPath(prefs, rule.path);
  switch (rule.op) {
    case 'set':
      return isSet(v);
    case 'unset':
      return !isSet(v);
    case 'eq':
      return v === rule.value;
    case 'gte':
      return typeof v === 'number' && typeof rule.value === 'number' && v >= rule.value;
    case 'lte':
      return typeof v === 'number' && typeof rule.value === 'number' && v <= rule.value;
    case 'includes':
      return Array.isArray(v) && v.includes(rule.value as never);
  }
}
```

Run the rule tests again. Expected: PASS.

- [ ] **Step 4: Write the schema**

`src/core/kb/schema.ts`:

```ts
import { z } from 'zod';
import { SCORE_KEYS } from '../types';
import type { Rule } from './rules';

export const KB_SCHEMA_VERSION = 1;

export const ScoresSchema = z.partialRecord(z.enum(SCORE_KEYS), z.number().min(0).max(1));

export const RuleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({
      path: z.string().min(1),
      op: z.enum(['gte', 'lte', 'eq', 'set', 'unset', 'includes']),
      value: z.union([z.number(), z.string(), z.boolean()]).optional(),
    }),
    z.object({ all: z.array(RuleSchema) }),
    z.object({ any: z.array(RuleSchema) }),
    z.object({ not: RuleSchema }),
  ]),
);

export const EffectSchema = z.object({
  path: z.string().min(1),
  op: z.enum(['set', 'add', 'push', 'max', 'min']).optional(),
  value: z.union([z.number(), z.string()]),
});

export const OptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  effects: z.array(EffectSchema).default([]),
});
export type QuestionOption = z.infer<typeof OptionSchema>;

export const NodeKindSchema = z.enum(['single', 'multi', 'scale', 'yesno']);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const NodeSchema = z
  .object({
    id: z.string().min(1),
    kind: NodeKindSchema,
    prompt: z.string().min(1),
    help: z.string().optional(),
    round: z.union([z.literal(1), z.literal(2)]),
    priority: z.number().default(0),
    applies: z.array(RuleSchema).default([]),
    options: z.array(OptionSchema).default([]),
    dynamicOptions: z.enum(['archetypes']).optional(),
    /** scale only: five labels from the low pole to the high pole */
    stops: z.array(z.string()).length(5).optional(),
    /** scale only: preference path that receives -1, -0.5, 0, 0.5, 1 */
    field: z.string().optional(),
    yes: z.array(EffectSchema).optional(),
    no: z.array(EffectSchema).optional(),
    allowMissingOption: z.boolean().default(false),
  })
  .refine((n) => n.kind !== 'scale' || (n.field && n.stops), { message: 'scale nodes need field and stops' })
  .refine((n) => n.kind !== 'yesno' || (n.yes && n.no), { message: 'yesno nodes need yes and no effects' })
  .refine((n) => !(n.kind === 'single' || n.kind === 'multi') || n.options.length > 0 || n.dynamicOptions, {
    message: 'choice nodes need options or dynamicOptions',
  });
export type QuestionNode = z.infer<typeof NodeSchema>;

export const ArchetypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  cuisine: z.string().min(1),
  category: z.string().min(1),
  proteins: z.array(z.string()).default([]),
  carbs: z.array(z.string()).default([]),
  formats: z.array(z.string()).default([]),
  searchTerms: z.array(z.string().min(1)).min(1),
  scores: ScoresSchema,
});
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const LexiconEntrySchema = z.object({
  pattern: z.string().min(1),
  scores: ScoresSchema.default({}),
  proteins: z.array(z.string()).default([]),
  carbs: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
  formats: z.array(z.string()).default([]),
  archetypeId: z.string().optional(),
});
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;

export const KnowledgeBaseSchema = z.object({
  version: z.number().int(),
  questions: z.array(NodeSchema),
  archetypes: z.array(ArchetypeSchema),
  lexicon: z.array(LexiconEntrySchema),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

export const KbAdditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('archetype'), kbSchemaVersion: z.number().int(), payload: ArchetypeSchema }),
  z.object({ kind: z.literal('option'), kbSchemaVersion: z.number().int(), nodeId: z.string().min(1), payload: OptionSchema }),
  z.object({ kind: z.literal('lexicon'), kbSchemaVersion: z.number().int(), payload: LexiconEntrySchema }),
]);
export type KbAddition = z.infer<typeof KbAdditionSchema>;
```

- [ ] **Step 5: Write the failing loader tests**

`test/core/kb-loader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KB_SCHEMA_VERSION } from '../../src/core/kb/schema';
import { loadBaseKb, mergeKb, parseKb } from '../../src/core/kb/loader';

const base = parseKb({
  version: KB_SCHEMA_VERSION,
  questions: [
    { id: 'protein', kind: 'multi', prompt: 'Protein?', round: 1, options: [{ id: 'beef', label: 'Beef', effects: [{ path: 'proteins.beef', value: 1 }] }] },
  ],
  archetypes: [
    { id: 'pho', label: 'Pho', cuisine: 'vietnamese', category: 'soup', proteins: ['beef'], searchTerms: ['pho'], scores: { brothy: 0.95 } },
  ],
  lexicon: [],
});

describe('loadBaseKb', () => {
  it('parses the repo knowledge base', () => {
    const kb = loadBaseKb();
    expect(kb.version).toBe(KB_SCHEMA_VERSION);
    const ids = kb.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('mergeKb', () => {
  it('adds a prefixed archetype and keeps base entries untouched', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r1', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'ramen', label: 'Ramen', cuisine: 'japanese', category: 'soup', searchTerms: ['ramen'], scores: { brothy: 0.95 } } },
    ]);
    expect(rejected).toEqual([]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_ramen']);
    expect(base.archetypes).toHaveLength(1);
  });

  it('adds an option to an existing node and rejects unknown nodes', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r2', kind: 'option', kbSchemaVersion: KB_SCHEMA_VERSION, nodeId: 'protein', payload: { id: 'lamb', label: 'Lamb', effects: [{ path: 'proteins.beef', value: 0.5 }] } },
      { id: 'r3', kind: 'option', kbSchemaVersion: KB_SCHEMA_VERSION, nodeId: 'nope', payload: { id: 'x', label: 'X' } },
    ]);
    expect(kb.questions[0]!.options.map((o) => o.id)).toEqual(['beef', 'kb_lamb']);
    expect(rejected).toEqual([{ id: 'r3', error: 'unknown node nope' }]);
  });

  it('rejects wrong schema versions and invalid payloads', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r4', kind: 'archetype', kbSchemaVersion: 99, payload: { id: 'x', label: 'X', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} } },
      { id: 'r5', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'x' } },
      { id: 'r6', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'pho', label: 'Pho again', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} } },
    ]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_pho']);
    expect(rejected.map((r) => r.id)).toEqual(['r4', 'r5']);
  });
});
```

- [ ] **Step 6: Create empty KB files and implement the loader**

`kb/questions.json`, `kb/archetypes.json`, `kb/lexicon.json` each contain `[]` for now.

`src/core/kb/loader.ts`:

```ts
import questions from '../../../kb/questions.json';
import archetypes from '../../../kb/archetypes.json';
import lexicon from '../../../kb/lexicon.json';
import { KB_SCHEMA_VERSION, KbAdditionSchema, KnowledgeBaseSchema, type KnowledgeBase } from './schema';

export function parseKb(raw: unknown): KnowledgeBase {
  return KnowledgeBaseSchema.parse(raw);
}

let cached: KnowledgeBase | undefined;
export function loadBaseKb(): KnowledgeBase {
  cached ??= parseKb({ version: KB_SCHEMA_VERSION, questions, archetypes, lexicon });
  return cached;
}

export interface RejectedAddition {
  id: string;
  error: string;
}

export interface AdditionRow {
  id: string;
  [key: string]: unknown;
}

const prefix = (id: string) => (id.startsWith('kb_') ? id : `kb_${id}`);

/** Merges approved additions over a base KB. Never mutates the base. */
export function mergeKb(base: KnowledgeBase, additions: AdditionRow[]): { kb: KnowledgeBase; rejected: RejectedAddition[] } {
  const kb: KnowledgeBase = structuredClone(base);
  const rejected: RejectedAddition[] = [];
  for (const row of additions) {
    const parsed = KbAdditionSchema.safeParse(row);
    if (!parsed.success) {
      rejected.push({ id: row.id, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      continue;
    }
    const add = parsed.data;
    if (add.kbSchemaVersion !== KB_SCHEMA_VERSION) {
      rejected.push({ id: row.id, error: `schema version ${add.kbSchemaVersion} != ${KB_SCHEMA_VERSION}` });
      continue;
    }
    switch (add.kind) {
      case 'archetype':
        kb.archetypes.push({ ...add.payload, id: prefix(add.payload.id) });
        break;
      case 'option': {
        const node = kb.questions.find((q) => q.id === add.nodeId);
        if (!node) {
          rejected.push({ id: row.id, error: `unknown node ${add.nodeId}` });
          break;
        }
        node.options.push({ ...add.payload, id: prefix(add.payload.id) });
        break;
      }
      case 'lexicon':
        kb.lexicon.push(add.payload);
        break;
    }
  }
  return { kb, rejected };
}
```

`src/core/kb/index.ts`:

```ts
export * from './schema';
export * from './rules';
export * from './loader';
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run --project core test/core/rules.test.ts test/core/kb-loader.test.ts`
Expected: PASS. If `z.partialRecord` is missing, the installed Zod is older than 4; run `pnpm add zod@^4`.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/kb kb test/core/rules.test.ts test/core/kb-loader.test.ts
git commit -m "Add knowledge base schema, rule evaluation and overlay merge"
```

---

### Task 4: Alignment, archetypes and the planner

**Files:**
- Create: `src/core/alignment.ts`, `src/core/planner.ts`
- Modify: `kb/archetypes.json`
- Test: `test/core/alignment.test.ts`, `test/core/planner.test.ts`

**Interfaces:**
- Consumes: `DinnerPreferences`, `Archetype`, `KnowledgeBase`, `Scores`.
- Produces: `alignQualities(desired, actual) -> { score, signals }`; `desiredVector(prefs) -> Scores-like with -1..1 weights`; `proteinMatch(prefs, proteins) -> number | null`; `cuisineAffinity(prefs, cuisine) -> -1..1`; `isExcluded(prefs, words) -> boolean`; `rankArchetypes(kb, prefs) -> RankedArchetype[]`; `plausibleArchetypes(kb, prefs) -> Archetype[]`; `planQueries(kb, prefs, max) -> string[]`.

- [ ] **Step 1: Write the failing alignment tests**

`test/core/alignment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alignQualities } from '../../src/core/alignment';

describe('alignQualities', () => {
  it('returns 0.5 with no desires', () => {
    expect(alignQualities({}, { brothy: 1 }).score).toBe(0.5);
  });

  it('rewards wanted qualities that are present', () => {
    const { score, signals } = alignQualities({ brothy: 1 }, { brothy: 0.9 });
    expect(score).toBeCloseTo(0.9);
    expect(signals.brothy).toBeCloseTo(0.9);
  });

  it('rewards avoided qualities that are absent', () => {
    expect(alignQualities({ rich: -1 }, { rich: 0.1 }).score).toBeCloseTo(0.9);
    expect(alignQualities({ rich: -1 }, { rich: 0.9 }).score).toBeCloseTo(0.1);
  });

  it('weights by desire strength and treats unknown attributes as weakly absent', () => {
    const { score } = alignQualities({ brothy: 1, spicy: 0.5 }, { brothy: 1 });
    // brothy contributes 1 * 1, spicy contributes 0.5 * 0.3 (unknown => 0.3)
    expect(score).toBeCloseTo((1 + 0.15) / 1.5);
  });
});
```

- [ ] **Step 2: Implement alignment.ts**

```ts
export type DesireVector = Partial<Record<string, number>>;

export interface Alignment {
  /** 0..1 */
  score: number;
  /** per desired key, 0..1 contribution (how well that desire was met) */
  signals: Record<string, number>;
}

export const UNKNOWN_ATTRIBUTE = 0.3;

export function alignQualities(desired: DesireVector, actual: Partial<Record<string, number>>): Alignment {
  let num = 0;
  let den = 0;
  const signals: Record<string, number> = {};
  for (const [key, want] of Object.entries(desired)) {
    if (want === undefined || want === 0) continue;
    const have = actual[key] ?? UNKNOWN_ATTRIBUTE;
    const met = want > 0 ? have : 1 - have;
    const weight = Math.abs(want);
    signals[key] = met;
    num += weight * met;
    den += weight;
  }
  return den === 0 ? { score: 0.5, signals } : { score: num / den, signals };
}
```

Run: `pnpm vitest run --project core test/core/alignment.test.ts` — Expected: PASS.

- [ ] **Step 3: Fill kb/archetypes.json**

Replace `kb/archetypes.json` with the following 42 entries. Scores are 0..1 and are the planner's and the fallback scorer's knowledge of each dish type. Categories: `soup`, `salad`, `curry`, `noodles`, `handheld`, `rice_bowl`, `raw_seafood`, `grilled`, `fried`, `pizza_pasta`.

```json
[
  { "id": "pho", "label": "Pho", "cuisine": "vietnamese", "category": "soup", "proteins": ["beef", "chicken"], "carbs": ["noodles"], "formats": ["bowl"], "searchTerms": ["pho", "vietnamese noodle soup"], "scores": { "brothy": 0.95, "comforting": 0.8, "rich": 0.3, "spicy": 0.3, "brightAcidic": 0.5, "savory": 0.8, "fresh": 0.5, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.2, "handheld": 0, "portion": 0.6 } },
  { "id": "bun_bo_hue", "label": "Bun bo Hue", "cuisine": "vietnamese", "category": "soup", "proteins": ["beef", "pork"], "carbs": ["noodles"], "formats": ["bowl"], "searchTerms": ["bun bo hue"], "scores": { "brothy": 0.95, "spicy": 0.8, "rich": 0.4, "comforting": 0.7, "savory": 0.85, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.5, "handheld": 0, "portion": 0.6 } },
  { "id": "banh_mi", "label": "Banh mi", "cuisine": "vietnamese", "category": "handheld", "proteins": ["pork", "chicken"], "carbs": ["bread"], "formats": ["sandwich"], "searchTerms": ["banh mi"], "scores": { "handheld": 1, "fresh": 0.6, "brightAcidic": 0.6, "crispy": 0.6, "savory": 0.8, "rich": 0.4, "carbHeavy": 0.5, "adventurous": 0.3, "portion": 0.5 } },
  { "id": "tom_yum", "label": "Tom yum", "cuisine": "thai", "category": "soup", "proteins": ["seafood", "chicken"], "carbs": [], "formats": ["bowl"], "searchTerms": ["tom yum", "thai soup"], "scores": { "brothy": 0.95, "spicy": 0.6, "brightAcidic": 0.9, "rich": 0.2, "fresh": 0.6, "savory": 0.7, "proteinForward": 0.7, "carbHeavy": 0.1, "adventurous": 0.4, "handheld": 0, "portion": 0.4 } },
  { "id": "tom_kha", "label": "Tom kha", "cuisine": "thai", "category": "soup", "proteins": ["chicken", "seafood"], "carbs": [], "formats": ["bowl"], "searchTerms": ["tom kha"], "scores": { "brothy": 0.9, "rich": 0.6, "brightAcidic": 0.6, "spicy": 0.3, "comforting": 0.8, "savory": 0.7, "proteinForward": 0.6, "carbHeavy": 0.1, "adventurous": 0.3, "handheld": 0, "portion": 0.4 } },
  { "id": "thai_beef_salad", "label": "Thai grilled beef salad", "cuisine": "thai", "category": "salad", "proteins": ["beef"], "carbs": [], "formats": ["plate"], "searchTerms": ["thai beef salad", "nam tok"], "scores": { "brightAcidic": 0.9, "spicy": 0.6, "savory": 0.9, "fresh": 0.7, "rich": 0.2, "proteinForward": 0.9, "carbHeavy": 0.1, "adventurous": 0.4, "handheld": 0, "portion": 0.5 } },
  { "id": "larb", "label": "Larb", "cuisine": "thai", "category": "salad", "proteins": ["chicken", "pork"], "carbs": [], "formats": ["plate"], "searchTerms": ["larb"], "scores": { "brightAcidic": 0.9, "spicy": 0.7, "fresh": 0.7, "savory": 0.85, "rich": 0.2, "proteinForward": 0.9, "carbHeavy": 0.1, "adventurous": 0.6, "handheld": 0, "portion": 0.5 } },
  { "id": "green_curry", "label": "Green curry", "cuisine": "thai", "category": "curry", "proteins": ["chicken", "beef", "vegetarian"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["thai curry"], "scores": { "rich": 0.8, "spicy": 0.7, "comforting": 0.7, "savory": 0.8, "carbHeavy": 0.6, "proteinForward": 0.5, "adventurous": 0.2, "handheld": 0, "portion": 0.7 } },
  { "id": "pad_thai", "label": "Pad thai", "cuisine": "thai", "category": "noodles", "proteins": ["chicken", "seafood", "vegetarian"], "carbs": ["noodles"], "formats": ["plate"], "searchTerms": ["pad thai"], "scores": { "savory": 0.8, "comforting": 0.7, "carbHeavy": 0.8, "rich": 0.5, "brightAcidic": 0.4, "proteinForward": 0.4, "adventurous": 0.1, "handheld": 0, "portion": 0.7 } },
  { "id": "beef_noodle_soup", "label": "Taiwanese beef noodle soup", "cuisine": "chinese", "category": "soup", "proteins": ["beef"], "carbs": ["noodles"], "formats": ["bowl"], "searchTerms": ["beef noodle soup"], "scores": { "brothy": 0.95, "comforting": 0.9, "rich": 0.5, "spicy": 0.4, "savory": 0.9, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.3, "handheld": 0, "portion": 0.8 } },
  { "id": "wonton_soup", "label": "Wonton noodle soup", "cuisine": "chinese", "category": "soup", "proteins": ["pork", "seafood"], "carbs": ["noodles"], "formats": ["bowl"], "searchTerms": ["wonton soup"], "scores": { "brothy": 0.95, "comforting": 0.8, "rich": 0.3, "savory": 0.8, "proteinForward": 0.5, "carbHeavy": 0.4, "adventurous": 0.2, "handheld": 0, "portion": 0.5 } },
  { "id": "mapo_tofu", "label": "Mapo tofu", "cuisine": "chinese", "category": "rice_bowl", "proteins": ["pork", "vegetarian"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["mapo tofu", "sichuan"], "scores": { "spicy": 0.9, "rich": 0.6, "savory": 0.9, "comforting": 0.7, "carbHeavy": 0.5, "proteinForward": 0.5, "adventurous": 0.5, "handheld": 0, "portion": 0.6 } },
  { "id": "ramen", "label": "Ramen", "cuisine": "japanese", "category": "soup", "proteins": ["pork", "chicken"], "carbs": ["noodles"], "formats": ["bowl"], "searchTerms": ["ramen"], "scores": { "brothy": 0.95, "rich": 0.9, "comforting": 0.95, "savory": 0.95, "proteinForward": 0.5, "carbHeavy": 0.6, "adventurous": 0.2, "handheld": 0, "portion": 0.8 } },
  { "id": "sashimi", "label": "Sashimi", "cuisine": "japanese", "category": "raw_seafood", "proteins": ["seafood"], "carbs": [], "formats": ["plate"], "searchTerms": ["sashimi"], "scores": { "fresh": 0.95, "brightAcidic": 0.3, "rich": 0.2, "savory": 0.6, "proteinForward": 0.95, "carbHeavy": 0, "adventurous": 0.3, "handheld": 0, "portion": 0.4 } },
  { "id": "sushi_rolls", "label": "Sushi rolls", "cuisine": "japanese", "category": "raw_seafood", "proteins": ["seafood", "vegetarian"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["sushi"], "scores": { "fresh": 0.7, "savory": 0.6, "rich": 0.3, "proteinForward": 0.5, "carbHeavy": 0.5, "adventurous": 0.2, "handheld": 0.5, "portion": 0.5 } },
  { "id": "katsu_curry", "label": "Katsu curry", "cuisine": "japanese", "category": "rice_bowl", "proteins": ["chicken", "pork"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["katsu curry"], "scores": { "rich": 0.85, "comforting": 0.9, "crispy": 0.8, "savory": 0.85, "carbHeavy": 0.8, "proteinForward": 0.5, "adventurous": 0.1, "handheld": 0, "portion": 0.9 } },
  { "id": "yukgaejang", "label": "Yukgaejang", "cuisine": "korean", "category": "soup", "proteins": ["beef"], "carbs": ["rice"], "formats": ["bowl"], "searchTerms": ["yukgaejang", "korean beef soup"], "scores": { "brothy": 0.95, "spicy": 0.8, "comforting": 0.8, "rich": 0.4, "savory": 0.9, "proteinForward": 0.6, "carbHeavy": 0.3, "adventurous": 0.5, "handheld": 0, "portion": 0.7 } },
  { "id": "bibimbap", "label": "Bibimbap", "cuisine": "korean", "category": "rice_bowl", "proteins": ["beef", "vegetarian"], "carbs": ["rice"], "formats": ["bowl"], "searchTerms": ["bibimbap"], "scores": { "carbHeavy": 0.7, "savory": 0.7, "fresh": 0.5, "comforting": 0.6, "spicy": 0.4, "rich": 0.4, "proteinForward": 0.4, "adventurous": 0.2, "handheld": 0, "portion": 0.7 } },
  { "id": "korean_fried_chicken", "label": "Korean fried chicken", "cuisine": "korean", "category": "fried", "proteins": ["chicken"], "carbs": [], "formats": ["plate"], "searchTerms": ["korean fried chicken"], "scores": { "crispy": 0.95, "rich": 0.8, "spicy": 0.5, "savory": 0.9, "comforting": 0.7, "proteinForward": 0.7, "carbHeavy": 0.2, "handheld": 0.7, "adventurous": 0.2, "portion": 0.7 } },
  { "id": "ceviche", "label": "Ceviche", "cuisine": "mexican", "category": "raw_seafood", "proteins": ["seafood"], "carbs": [], "formats": ["plate"], "searchTerms": ["ceviche", "mariscos"], "scores": { "fresh": 0.95, "brightAcidic": 0.95, "spicy": 0.4, "rich": 0.1, "savory": 0.5, "proteinForward": 0.8, "carbHeavy": 0.1, "adventurous": 0.5, "handheld": 0, "portion": 0.4 } },
  { "id": "aguachile", "label": "Aguachile", "cuisine": "mexican", "category": "raw_seafood", "proteins": ["seafood"], "carbs": [], "formats": ["plate"], "searchTerms": ["aguachile"], "scores": { "fresh": 0.95, "brightAcidic": 0.95, "spicy": 0.85, "rich": 0.05, "savory": 0.5, "proteinForward": 0.8, "carbHeavy": 0.05, "adventurous": 0.7, "handheld": 0, "portion": 0.4 } },
  { "id": "fish_tacos", "label": "Fish tacos", "cuisine": "mexican", "category": "handheld", "proteins": ["seafood"], "carbs": ["tortillas"], "formats": ["taco"], "searchTerms": ["fish tacos"], "scores": { "handheld": 0.9, "fresh": 0.6, "crispy": 0.6, "brightAcidic": 0.5, "rich": 0.4, "savory": 0.7, "proteinForward": 0.5, "carbHeavy": 0.4, "adventurous": 0.2, "portion": 0.5 } },
  { "id": "tacos", "label": "Tacos", "cuisine": "mexican", "category": "handheld", "proteins": ["beef", "pork", "chicken"], "carbs": ["tortillas"], "formats": ["taco"], "searchTerms": ["tacos", "taqueria"], "scores": { "handheld": 1, "savory": 0.8, "brightAcidic": 0.4, "rich": 0.4, "comforting": 0.6, "proteinForward": 0.6, "carbHeavy": 0.4, "adventurous": 0.1, "portion": 0.6 } },
  { "id": "burrito", "label": "Burrito", "cuisine": "mexican", "category": "handheld", "proteins": ["beef", "pork", "chicken"], "carbs": ["tortillas", "rice"], "formats": ["wrap"], "searchTerms": ["burrito"], "scores": { "handheld": 1, "rich": 0.7, "carbHeavy": 0.8, "comforting": 0.8, "savory": 0.8, "proteinForward": 0.5, "adventurous": 0.05, "portion": 0.95 } },
  { "id": "pozole", "label": "Pozole", "cuisine": "mexican", "category": "soup", "proteins": ["pork", "chicken"], "carbs": [], "formats": ["bowl"], "searchTerms": ["pozole"], "scores": { "brothy": 0.9, "comforting": 0.9, "spicy": 0.6, "rich": 0.4, "savory": 0.85, "brightAcidic": 0.4, "proteinForward": 0.5, "carbHeavy": 0.4, "adventurous": 0.4, "handheld": 0, "portion": 0.7 } },
  { "id": "burger", "label": "Burger", "cuisine": "american", "category": "handheld", "proteins": ["beef"], "carbs": ["bread"], "formats": ["sandwich"], "searchTerms": ["burger"], "scores": { "rich": 0.9, "comforting": 0.9, "handheld": 1, "savory": 0.9, "crispy": 0.3, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.05, "portion": 0.8 } },
  { "id": "cheesesteak", "label": "Cheesesteak", "cuisine": "american", "category": "handheld", "proteins": ["beef"], "carbs": ["bread"], "formats": ["sandwich"], "searchTerms": ["cheesesteak"], "scores": { "rich": 0.9, "comforting": 0.9, "handheld": 1, "savory": 0.9, "proteinForward": 0.7, "carbHeavy": 0.5, "adventurous": 0.05, "portion": 0.9 } },
  { "id": "fried_chicken_sandwich", "label": "Fried chicken sandwich", "cuisine": "american", "category": "handheld", "proteins": ["chicken"], "carbs": ["bread"], "formats": ["sandwich"], "searchTerms": ["fried chicken sandwich"], "scores": { "crispy": 0.95, "rich": 0.85, "handheld": 1, "comforting": 0.85, "savory": 0.85, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.05, "portion": 0.8 } },
  { "id": "grilled_fish", "label": "Grilled fish", "cuisine": "american", "category": "grilled", "proteins": ["seafood"], "carbs": [], "formats": ["plate"], "searchTerms": ["grilled fish", "seafood grill"], "scores": { "fresh": 0.7, "brightAcidic": 0.6, "savory": 0.6, "rich": 0.4, "proteinForward": 0.9, "carbHeavy": 0.1, "adventurous": 0.2, "handheld": 0, "portion": 0.6 } },
  { "id": "roast_chicken", "label": "Roast chicken", "cuisine": "american", "category": "grilled", "proteins": ["chicken"], "carbs": [], "formats": ["plate"], "searchTerms": ["roast chicken", "rotisserie chicken"], "scores": { "comforting": 0.9, "savory": 0.8, "rich": 0.5, "proteinForward": 0.8, "carbHeavy": 0.2, "adventurous": 0.05, "handheld": 0.2, "portion": 0.7 } },
  { "id": "big_salad", "label": "Big salad", "cuisine": "american", "category": "salad", "proteins": ["chicken", "vegetarian"], "carbs": [], "formats": ["bowl"], "searchTerms": ["salad"], "scores": { "fresh": 0.95, "brightAcidic": 0.7, "rich": 0.2, "savory": 0.4, "proteinForward": 0.5, "carbHeavy": 0.1, "adventurous": 0.05, "handheld": 0, "portion": 0.5 } },
  { "id": "shawarma_wrap", "label": "Shawarma wrap", "cuisine": "middle_eastern", "category": "handheld", "proteins": ["beef", "chicken"], "carbs": ["bread"], "formats": ["wrap"], "searchTerms": ["shawarma"], "scores": { "handheld": 1, "savory": 0.85, "brightAcidic": 0.4, "rich": 0.5, "comforting": 0.6, "proteinForward": 0.7, "carbHeavy": 0.4, "adventurous": 0.2, "portion": 0.7 } },
  { "id": "kebab_plate", "label": "Kebab plate", "cuisine": "middle_eastern", "category": "grilled", "proteins": ["beef", "chicken"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["kebab"], "scores": { "savory": 0.9, "proteinForward": 0.9, "rich": 0.4, "brightAcidic": 0.3, "carbHeavy": 0.4, "comforting": 0.5, "adventurous": 0.2, "handheld": 0, "portion": 0.8 } },
  { "id": "fattoush", "label": "Fattoush", "cuisine": "middle_eastern", "category": "salad", "proteins": ["vegetarian"], "carbs": [], "formats": ["plate"], "searchTerms": ["fattoush", "lebanese"], "scores": { "fresh": 0.95, "brightAcidic": 0.9, "crispy": 0.4, "rich": 0.1, "savory": 0.4, "proteinForward": 0.2, "carbHeavy": 0.2, "adventurous": 0.3, "handheld": 0, "portion": 0.4 } },
  { "id": "butter_chicken", "label": "Butter chicken", "cuisine": "indian", "category": "curry", "proteins": ["chicken"], "carbs": ["rice", "bread"], "formats": ["plate"], "searchTerms": ["butter chicken", "indian"], "scores": { "rich": 0.9, "comforting": 0.9, "spicy": 0.3, "savory": 0.85, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.1, "handheld": 0, "portion": 0.8 } },
  { "id": "vindaloo", "label": "Vindaloo", "cuisine": "indian", "category": "curry", "proteins": ["pork", "beef", "chicken"], "carbs": ["rice"], "formats": ["plate"], "searchTerms": ["vindaloo"], "scores": { "spicy": 0.95, "rich": 0.7, "savory": 0.85, "comforting": 0.6, "brightAcidic": 0.4, "proteinForward": 0.6, "carbHeavy": 0.5, "adventurous": 0.4, "handheld": 0, "portion": 0.8 } },
  { "id": "chana_masala", "label": "Chana masala", "cuisine": "indian", "category": "curry", "proteins": ["vegetarian"], "carbs": ["rice", "bread"], "formats": ["plate"], "searchTerms": ["chana masala"], "scores": { "comforting": 0.7, "spicy": 0.5, "rich": 0.4, "savory": 0.8, "proteinForward": 0.3, "carbHeavy": 0.5, "adventurous": 0.2, "handheld": 0, "portion": 0.6 } },
  { "id": "margherita_pizza", "label": "Pizza", "cuisine": "italian", "category": "pizza_pasta", "proteins": ["vegetarian"], "carbs": ["bread"], "formats": ["slice"], "searchTerms": ["pizza"], "scores": { "comforting": 0.9, "rich": 0.7, "savory": 0.8, "handheld": 0.6, "carbHeavy": 0.8, "proteinForward": 0.2, "adventurous": 0.05, "portion": 0.8 } },
  { "id": "pasta_ragu", "label": "Pasta with ragu", "cuisine": "italian", "category": "pizza_pasta", "proteins": ["beef", "pork"], "carbs": ["noodles"], "formats": ["plate"], "searchTerms": ["pasta", "italian"], "scores": { "comforting": 0.9, "rich": 0.8, "savory": 0.9, "carbHeavy": 0.8, "proteinForward": 0.4, "adventurous": 0.05, "handheld": 0, "portion": 0.8 } },
  { "id": "caesar_salad", "label": "Caesar salad", "cuisine": "american", "category": "salad", "proteins": ["chicken"], "carbs": [], "formats": ["bowl"], "searchTerms": ["caesar salad"], "scores": { "fresh": 0.7, "rich": 0.5, "savory": 0.7, "brightAcidic": 0.5, "crispy": 0.4, "proteinForward": 0.5, "carbHeavy": 0.2, "adventurous": 0.02, "handheld": 0, "portion": 0.5 } },
  { "id": "gyro", "label": "Gyro", "cuisine": "greek", "category": "handheld", "proteins": ["beef", "pork", "chicken"], "carbs": ["bread"], "formats": ["wrap"], "searchTerms": ["gyro", "greek"], "scores": { "handheld": 1, "savory": 0.85, "rich": 0.5, "brightAcidic": 0.4, "comforting": 0.6, "proteinForward": 0.7, "carbHeavy": 0.4, "adventurous": 0.15, "portion": 0.7 } },
  { "id": "poke", "label": "Poke bowl", "cuisine": "hawaiian", "category": "rice_bowl", "proteins": ["seafood"], "carbs": ["rice"], "formats": ["bowl"], "searchTerms": ["poke"], "scores": { "fresh": 0.9, "brightAcidic": 0.4, "savory": 0.6, "rich": 0.3, "proteinForward": 0.8, "carbHeavy": 0.5, "adventurous": 0.3, "handheld": 0, "portion": 0.5 } }
]
```

Run: `pnpm vitest run --project core test/core/kb-loader.test.ts` — Expected: still PASS (the file parses).

- [ ] **Step 4: Write the failing planner tests**

`test/core/planner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { cuisineAffinity, desiredVector, isExcluded, planQueries, plausibleArchetypes, proteinMatch, rankArchetypes } from '../../src/core/planner';

const kb = loadBaseKb();

const brothyBeef = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'desiredQualities.comforting', value: 0.8 },
  { path: 'heaviness', value: -0.5 },
  { path: 'proteins.beef', value: 1 },
]);

describe('desiredVector', () => {
  it('maps heaviness, handheld, novelty and starchAsMain into score keys', () => {
    const p = applyEffects(emptyPreferences(), [
      { path: 'heaviness', value: -0.5 },
      { path: 'handheld', value: 1 },
      { path: 'novelty', value: 0.5 },
      { path: 'carbs.starchAsMain', value: -1 },
    ]);
    expect(desiredVector(p)).toEqual({ rich: -0.5, handheld: 1, adventurous: 0.5, carbHeavy: -1 });
  });

  it('does not override an explicit rich preference with heaviness', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.rich', value: 1 }, { path: 'heaviness', value: -1 }]);
    expect(desiredVector(p).rich).toBe(1);
  });
});

describe('proteinMatch and cuisineAffinity', () => {
  it('returns null with no protein preference', () => {
    expect(proteinMatch(emptyPreferences(), ['beef'])).toBeNull();
  });
  it('returns the best matching preference weight', () => {
    expect(proteinMatch(brothyBeef, ['beef', 'pork'])).toBe(1);
    expect(proteinMatch(brothyBeef, ['pork'])).toBe(0);
  });
  it('maps cuisine affinity to -1..1 with 0 default', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'cuisines.thai', value: -1 }]);
    expect(cuisineAffinity(p, 'thai')).toBe(-1);
    expect(cuisineAffinity(p, 'korean')).toBe(0);
    expect(cuisineAffinity(p, undefined)).toBe(0);
  });
});

describe('isExcluded', () => {
  it('matches exclusions against any word, case-insensitively', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'japanese' }, { path: 'exclusions', value: 'pork' }]);
    expect(isExcluded(p, ['Japanese', 'noodles'])).toBe(true);
    expect(isExcluded(p, ['thai', 'beef'])).toBe(false);
  });
});

describe('rankArchetypes', () => {
  it('puts brothy beef dishes first for a brothy beef profile', () => {
    const top = rankArchetypes(kb, brothyBeef).slice(0, 4).map((r) => r.archetype.id);
    expect(top).toContain('pho');
    expect(top).toContain('beef_noodle_soup');
    expect(top).not.toContain('burger');
  });

  it('drops excluded cuisines entirely', () => {
    const p = applyEffects(brothyBeef, [{ path: 'exclusions', value: 'vietnamese' }]);
    expect(rankArchetypes(kb, p).map((r) => r.archetype.id)).not.toContain('pho');
  });

  it('boosts archetypes the user reacted to', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'archetypes.ceviche', value: 1 }]);
    expect(rankArchetypes(kb, p)[0]!.archetype.id).toBe('ceviche');
  });
});

describe('plausibleArchetypes and planQueries', () => {
  it('finds nothing plausible with empty preferences', () => {
    expect(plausibleArchetypes(kb, emptyPreferences())).toEqual([]);
  });

  it('finds several plausible soups for the brothy profile', () => {
    const ids = plausibleArchetypes(kb, brothyBeef).map((a) => a.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain('pho');
  });

  it('plans at most five distinct queries from the top archetypes', () => {
    const queries = planQueries(kb, brothyBeef, 5);
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries).toContain('pho');
  });
});
```

- [ ] **Step 5: Implement planner.ts**

```ts
import { alignQualities, type DesireVector } from './alignment';
import type { Archetype, KnowledgeBase } from './kb/schema';
import type { DinnerPreferences } from './preferences';

export function desiredVector(prefs: DinnerPreferences): DesireVector {
  const d: DesireVector = { ...prefs.desiredQualities };
  if (d.rich === undefined && prefs.heaviness !== undefined) d.rich = prefs.heaviness;
  if (prefs.handheld !== undefined) d.handheld = prefs.handheld;
  if (prefs.novelty !== undefined) d.adventurous = prefs.novelty;
  if (prefs.carbs.starchAsMain !== undefined) d.carbHeavy = prefs.carbs.starchAsMain;
  return d;
}

/** 0..1 match against positive protein preferences, or null when the user has none. */
export function proteinMatch(prefs: DinnerPreferences, proteins: readonly string[]): number | null {
  const wanted = Object.entries(prefs.proteins).filter(([, w]) => (w ?? 0) > 0);
  if (wanted.length === 0) return null;
  let best = 0;
  for (const p of proteins) {
    const w = prefs.proteins[p as keyof typeof prefs.proteins] ?? 0;
    if (w > best) best = w;
  }
  return best;
}

export function cuisineAffinity(prefs: DinnerPreferences, cuisine: string | undefined): number {
  if (!cuisine) return 0;
  return prefs.cuisines[cuisine] ?? 0;
}

export function isExcluded(prefs: DinnerPreferences, words: readonly (string | undefined)[]): boolean {
  if (prefs.exclusions.length === 0) return false;
  const lowered = words.filter((w): w is string => !!w).map((w) => w.toLowerCase());
  return prefs.exclusions.some((ex) => lowered.some((w) => w === ex || w.includes(ex)));
}

export interface RankedArchetype {
  archetype: Archetype;
  score: number;
  signals: Record<string, number>;
}

export const ARCHETYPE_WEIGHTS = { align: 0.6, protein: 0.25, cuisine: 0.15, liked: 0.3, carbAvoid: 0.2 } as const;

export function scoreArchetype(a: Archetype, prefs: DinnerPreferences): RankedArchetype | null {
  if (isExcluded(prefs, [a.cuisine, a.id, a.label, ...a.proteins, ...a.formats])) return null;
  const align = alignQualities(desiredVector(prefs), a.scores);
  const protein = proteinMatch(prefs, a.proteins);
  const cuisine = (cuisineAffinity(prefs, a.cuisine) + 1) / 2;
  const liked = prefs.archetypes[a.id] ?? 0;
  let score =
    ARCHETYPE_WEIGHTS.align * align.score +
    ARCHETYPE_WEIGHTS.protein * (protein ?? 0.5) +
    ARCHETYPE_WEIGHTS.cuisine * cuisine +
    ARCHETYPE_WEIGHTS.liked * liked;
  for (const carb of a.carbs) {
    const w = prefs.carbs[carb as keyof typeof prefs.carbs];
    if (w !== undefined && w < 0) score += ARCHETYPE_WEIGHTS.carbAvoid * w;
  }
  return { archetype: a, score, signals: align.signals };
}

export function rankArchetypes(kb: KnowledgeBase, prefs: DinnerPreferences): RankedArchetype[] {
  return kb.archetypes
    .map((a) => scoreArchetype(a, prefs))
    .filter((r): r is RankedArchetype => r !== null)
    .sort((x, y) => y.score - x.score);
}

export const PLAUSIBLE_THRESHOLD = 0.55;

export function plausibleArchetypes(kb: KnowledgeBase, prefs: DinnerPreferences): Archetype[] {
  return rankArchetypes(kb, prefs)
    .filter((r) => r.score >= PLAUSIBLE_THRESHOLD)
    .map((r) => r.archetype);
}

export function planQueries(kb: KnowledgeBase, prefs: DinnerPreferences, max = 5): string[] {
  const out: string[] = [];
  for (const r of rankArchetypes(kb, prefs)) {
    const term = r.archetype.searchTerms[0];
    if (term && !out.includes(term)) out.push(term);
    if (out.length >= max) break;
  }
  return out;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project core test/core/planner.test.ts`
Expected: PASS. If `rankArchetypes` ordering fails for the brothy profile, check the archetype scores in `kb/archetypes.json` before touching weights: pho and beef noodle soup must have brothy 0.95 and beef in proteins.

- [ ] **Step 7: Commit**

```bash
git add src/core/alignment.ts src/core/planner.ts kb/archetypes.json test/core/alignment.test.ts test/core/planner.test.ts
git commit -m "Add quality alignment, dish archetypes and the search planner"
```

---

### Task 5: Question graph and the question content

**Files:**
- Create: `src/core/questions.ts`
- Modify: `kb/questions.json`
- Test: `test/core/questions.test.ts`

**Interfaces:**
- Consumes: `evalRule`, `applyEffects`, `plausibleArchetypes`, KB types.
- Produces: `ConversationState`, `initialState()`, `MAX_ROUND2`, `SCALE_VALUES`, `Derived`, `deriveContext(kb, prefs)`, `PresentedQuestion`, `nextQuestion(kb, state, derived)`, `optionsFor(node, derived)`, `AnswerInput`, `applyAnswer(kb, state, answer, derived)`.

- [ ] **Step 1: Write kb/questions.json**

```json
[
  {
    "id": "hunger", "kind": "single", "round": 1, "priority": 100,
    "prompt": "How hungry are you?",
    "options": [
      { "id": "light", "label": "Light", "effects": [{ "path": "hunger", "value": "light" }] },
      { "id": "normal", "label": "Normal dinner", "effects": [{ "path": "hunger", "value": "normal" }] },
      { "id": "very_hungry", "label": "Starving", "effects": [{ "path": "hunger", "value": "very_hungry" }] }
    ]
  },
  {
    "id": "feel", "kind": "multi", "round": 1, "priority": 95,
    "prompt": "How should dinner feel tonight?",
    "help": "Pick as many as you like. Tap once for sounds good, twice for really want.",
    "options": [
      { "id": "comforting", "label": "Comforting", "effects": [{ "path": "desiredQualities.comforting", "value": 1 }] },
      { "id": "fresh", "label": "Fresh", "effects": [{ "path": "desiredQualities.fresh", "value": 1 }] },
      { "id": "rich", "label": "Rich and indulgent", "effects": [{ "path": "desiredQualities.rich", "value": 1 }] },
      { "id": "spicy", "label": "Spicy", "effects": [{ "path": "desiredQualities.spicy", "value": 1 }] },
      { "id": "savory", "label": "Savory", "effects": [{ "path": "desiredQualities.savory", "value": 1 }] },
      { "id": "no_idea", "label": "No idea", "effects": [{ "path": "noIdea", "value": 1 }] }
    ]
  },
  {
    "id": "protein", "kind": "multi", "round": 1, "priority": 90,
    "prompt": "What protein sounds best?",
    "options": [
      { "id": "beef", "label": "Beef", "effects": [{ "path": "proteins.beef", "value": 1 }] },
      { "id": "chicken", "label": "Chicken", "effects": [{ "path": "proteins.chicken", "value": 1 }] },
      { "id": "pork", "label": "Pork", "effects": [{ "path": "proteins.pork", "value": 1 }] },
      { "id": "seafood", "label": "Seafood", "effects": [{ "path": "proteins.seafood", "value": 1 }] },
      { "id": "vegetarian", "label": "Vegetarian", "effects": [{ "path": "proteins.vegetarian", "value": 1 }] },
      { "id": "any", "label": "No preference", "effects": [] }
    ]
  },
  {
    "id": "novelty", "kind": "scale", "round": 1, "priority": 85,
    "prompt": "Familiar or interesting?",
    "field": "novelty",
    "stops": ["Familiar favourite", "Mostly familiar", "Either", "Somewhat interesting", "Surprise me"]
  },
  {
    "id": "avoid", "kind": "multi", "round": 1, "priority": 80,
    "prompt": "Anything you don't want tonight?",
    "help": "Cuisines to skip. Anything else, use Other.",
    "allowMissingOption": true,
    "options": [
      { "id": "japanese", "label": "Japanese", "effects": [{ "path": "exclusions", "value": "japanese" }] },
      { "id": "chinese", "label": "Chinese", "effects": [{ "path": "exclusions", "value": "chinese" }] },
      { "id": "thai", "label": "Thai", "effects": [{ "path": "exclusions", "value": "thai" }] },
      { "id": "vietnamese", "label": "Vietnamese", "effects": [{ "path": "exclusions", "value": "vietnamese" }] },
      { "id": "korean", "label": "Korean", "effects": [{ "path": "exclusions", "value": "korean" }] },
      { "id": "indian", "label": "Indian", "effects": [{ "path": "exclusions", "value": "indian" }] },
      { "id": "mexican", "label": "Mexican", "effects": [{ "path": "exclusions", "value": "mexican" }] },
      { "id": "italian", "label": "Italian", "effects": [{ "path": "exclusions", "value": "italian" }] },
      { "id": "american", "label": "American", "effects": [{ "path": "exclusions", "value": "american" }] },
      { "id": "middle_eastern", "label": "Middle Eastern", "effects": [{ "path": "exclusions", "value": "middle_eastern" }] },
      { "id": "fried", "label": "Anything fried", "effects": [{ "path": "exclusions", "value": "fried" }] },
      { "id": "nothing", "label": "Nothing, all good", "effects": [] }
    ]
  },
  {
    "id": "brothy", "kind": "yesno", "round": 2, "priority": 90,
    "prompt": "Does something brothy sound good?",
    "applies": [{ "any": [
      { "path": "desiredQualities.comforting", "op": "gte", "value": 0.5 },
      { "path": "heaviness", "op": "lte", "value": -0.5 },
      { "path": "noIdea", "op": "set" }
    ] }],
    "yes": [{ "path": "desiredQualities.brothy", "value": 1 }],
    "no": [{ "path": "desiredQualities.brothy", "value": -1 }]
  },
  {
    "id": "heaviness", "kind": "scale", "round": 2, "priority": 85,
    "prompt": "How heavy should it be?",
    "field": "heaviness",
    "stops": ["Light", "On the lighter side", "Middle", "Substantial", "Properly heavy"],
    "applies": [{ "path": "desiredQualities.rich", "op": "unset" }]
  },
  {
    "id": "beef_style", "kind": "multi", "round": 2, "priority": 80,
    "prompt": "What kind of beef?",
    "applies": [{ "path": "proteins.beef", "op": "gte", "value": 0.5 }],
    "options": [
      { "id": "thinSliced", "label": "Thin-sliced and seasoned", "effects": [{ "path": "beef.thinSliced", "value": 1 }] },
      { "id": "steak", "label": "Steak or chunks", "effects": [{ "path": "beef.steak", "value": 1 }] },
      { "id": "braised", "label": "Slow-cooked", "effects": [{ "path": "beef.braised", "value": 1 }] },
      { "id": "ground", "label": "Ground", "effects": [{ "path": "beef.ground", "value": 1 }] },
      { "id": "any", "label": "Any beef", "effects": [] }
    ]
  },
  {
    "id": "seafood_type", "kind": "multi", "round": 2, "priority": 80,
    "prompt": "Which seafood?",
    "applies": [{ "path": "proteins.seafood", "op": "gte", "value": 0.5 }],
    "options": [
      { "id": "fish", "label": "Fish", "effects": [{ "path": "seafood.fish", "value": 1 }] },
      { "id": "shellfish", "label": "Shrimp or shellfish", "effects": [{ "path": "seafood.shellfish", "value": 1 }] },
      { "id": "salmon", "label": "Salmon", "effects": [{ "path": "seafood.salmon", "value": 1 }, { "path": "seafood.fish", "op": "max", "value": 0.5 }] },
      { "id": "any", "label": "Any seafood", "effects": [] }
    ]
  },
  {
    "id": "spice", "kind": "scale", "round": 2, "priority": 75,
    "prompt": "How much heat?",
    "field": "desiredQualities.spicy",
    "stops": ["None", "Mild", "Some", "Spicy", "Fiery"],
    "applies": [{ "path": "desiredQualities.spicy", "op": "unset" }]
  },
  {
    "id": "carbs", "kind": "multi", "round": 2, "priority": 70,
    "prompt": "Noodles, rice, bread, or carbs on the side?",
    "applies": [{ "all": [
      { "path": "carbs.rice", "op": "unset" },
      { "path": "carbs.noodles", "op": "unset" },
      { "path": "carbs.bread", "op": "unset" },
      { "path": "carbs.tortillas", "op": "unset" },
      { "path": "carbs.starchAsMain", "op": "unset" }
    ] }],
    "options": [
      { "id": "noodles", "label": "Noodles", "effects": [{ "path": "carbs.noodles", "value": 1 }] },
      { "id": "rice", "label": "Rice", "effects": [{ "path": "carbs.rice", "value": 1 }] },
      { "id": "bread", "label": "Bread or tortillas", "effects": [{ "path": "carbs.bread", "value": 1 }, { "path": "carbs.tortillas", "value": 1 }] },
      { "id": "side", "label": "Keep carbs on the side", "effects": [{ "path": "carbs.starchAsMain", "value": -1 }] },
      { "id": "any", "label": "Don't mind", "effects": [] }
    ]
  },
  {
    "id": "handheld", "kind": "yesno", "round": 2, "priority": 65,
    "prompt": "Something you eat with your hands?",
    "applies": [{ "all": [
      { "path": "hunger", "op": "eq", "value": "very_hungry" },
      { "path": "desiredQualities.rich", "op": "gte", "value": 0.5 }
    ] }],
    "yes": [{ "path": "handheld", "value": 1 }],
    "no": [{ "path": "handheld", "value": -1 }]
  },
  {
    "id": "archetype_check", "kind": "multi", "round": 2, "priority": 60,
    "prompt": "Gut reactions. Which of these sound good?",
    "dynamicOptions": "archetypes",
    "allowMissingOption": true,
    "applies": [{ "path": "derived.plausibleArchetypeCount", "op": "gte", "value": 5 }]
  },
  {
    "id": "budget", "kind": "single", "round": 2, "priority": 50,
    "prompt": "Budget?",
    "applies": [{ "path": "budget", "op": "unset" }],
    "options": [
      { "id": "low", "label": "Keep it cheap", "effects": [{ "path": "budget.max", "value": 15 }] },
      { "id": "moderate", "label": "Moderate", "effects": [{ "path": "budget.max", "value": 30 }] },
      { "id": "whatever", "label": "Whatever, just make dinner good", "effects": [{ "path": "budget.flexible", "value": 1 }] }
    ]
  },
  {
    "id": "leftovers", "kind": "yesno", "round": 2, "priority": 40,
    "prompt": "Do leftovers matter?",
    "applies": [{ "any": [
      { "path": "hunger", "op": "eq", "value": "very_hungry" },
      { "path": "budget.max", "op": "lte", "value": 15 }
    ] }],
    "yes": [{ "path": "leftovers", "value": "want" }],
    "no": [{ "path": "leftovers", "value": "avoid" }]
  }
]
```

Run: `pnpm vitest run --project core test/core/kb-loader.test.ts` — Expected: PASS (content validates against the schema).

- [ ] **Step 2: Write the failing question graph tests**

`test/core/questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { applyAnswer, deriveContext, initialState, nextQuestion, type AnswerInput, type ConversationState } from '../../src/core/questions';
import { emptyPreferences, applyEffects } from '../../src/core/preferences';

const kb = loadBaseKb();

function step(state: ConversationState, answer: AnswerInput): ConversationState {
  return applyAnswer(kb, state, answer, deriveContext(kb, state.prefs));
}
function ask(state: ConversationState) {
  return nextQuestion(kb, state, deriveContext(kb, state.prefs));
}

const roundOneComfortBeef: AnswerInput[] = [
  { kind: 'single', nodeId: 'hunger', optionId: 'normal' },
  { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }, { optionId: 'savory', intensity: 0.5 }] },
  { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] },
  { kind: 'scale', nodeId: 'novelty', stop: 3 },
  { kind: 'multi', nodeId: 'avoid', selections: [{ optionId: 'japanese', intensity: 1 }] },
];

describe('round one', () => {
  it('asks the five fixed questions in order', () => {
    let state = initialState();
    const seen: string[] = [];
    for (const answer of roundOneComfortBeef) {
      const q = ask(state)!;
      seen.push(q.node.id);
      expect(q.node.id).toBe(answer.nodeId);
      state = step(state, answer);
    }
    expect(seen).toEqual(['hunger', 'feel', 'protein', 'novelty', 'avoid']);
    expect(state.prefs.desiredQualities.comforting).toBe(1);
    expect(state.prefs.desiredQualities.savory).toBe(0.5);
    expect(state.prefs.proteins.beef).toBe(1);
    expect(state.prefs.novelty).toBe(0.5);
    expect(state.prefs.exclusions).toEqual(['japanese']);
  });

  it('advances when the user selects nothing', () => {
    let state = initialState();
    state = step(state, { kind: 'single', nodeId: 'hunger' });
    state = step(state, { kind: 'multi', nodeId: 'feel', selections: [] });
    expect(state.asked).toEqual(['hunger', 'feel']);
    expect(ask(state)!.node.id).toBe('protein');
  });
});

describe('round two', () => {
  it('asks brothy, heaviness and beef style for the comfort-beef profile, then stops', () => {
    let state = initialState();
    for (const a of roundOneComfortBeef) state = step(state, a);

    expect(ask(state)!.node.id).toBe('brothy');
    state = step(state, { kind: 'yesno', nodeId: 'brothy', value: 'yes' });
    expect(state.prefs.desiredQualities.brothy).toBe(1);

    expect(ask(state)!.node.id).toBe('heaviness');
    state = step(state, { kind: 'scale', nodeId: 'heaviness', stop: 1 });
    expect(state.prefs.heaviness).toBe(-0.5);

    expect(ask(state)!.node.id).toBe('beef_style');
    state = step(state, { kind: 'multi', nodeId: 'beef_style', selections: [{ optionId: 'thinSliced', intensity: 1 }] });

    expect(ask(state)).toBeNull();
    expect(state.round2Asked).toBe(3);
  });

  it('does not ask heaviness when rich was already chosen, and asks handheld when starving and rich', () => {
    let state = initialState();
    state = step(state, { kind: 'single', nodeId: 'hunger', optionId: 'very_hungry' });
    state = step(state, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'rich', intensity: 1 }] });
    state = step(state, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] });
    state = step(state, { kind: 'scale', nodeId: 'novelty', stop: 0 });
    state = step(state, { kind: 'multi', nodeId: 'avoid', selections: [] });
    const asked: string[] = [];
    for (let q = ask(state); q; q = ask(state)) {
      asked.push(q.node.id);
      state = step(state, { kind: q.node.kind, nodeId: q.node.id } as AnswerInput);
    }
    expect(asked).not.toContain('heaviness');
    expect(asked).toContain('handheld');
    expect(asked.length).toBeLessThanOrEqual(3);
  });

  it('offers the archetype check with generated options when many archetypes are plausible', () => {
    const prefs = applyEffects(emptyPreferences(), [
      { path: 'desiredQualities.comforting', value: 1 },
      { path: 'desiredQualities.savory', value: 1 },
    ]);
    const state: ConversationState = { ...initialState(), prefs, asked: ['hunger', 'feel', 'protein', 'novelty', 'avoid', 'brothy', 'heaviness'], round2Asked: 2 };
    const derived = deriveContext(kb, prefs);
    expect(derived.plausibleArchetypeCount).toBeGreaterThanOrEqual(5);
    const q = nextQuestion(kb, state, derived)!;
    expect(q.node.id).toBe('archetype_check');
    expect(q.options.length).toBeGreaterThan(0);
    expect(q.options.length).toBeLessThanOrEqual(8);
    const first = q.options[0]!;
    const next = applyAnswer(kb, state, { kind: 'multi', nodeId: 'archetype_check', selections: [{ optionId: first.id, intensity: 1 }] }, derived);
    expect(next.prefs.archetypes[first.id.replace('arch:', '')]).toBe(1);
  });

  it('rejects unknown nodes, mismatched kinds and unknown options', () => {
    const state = initialState();
    expect(() => step(state, { kind: 'single', nodeId: 'nope', optionId: 'x' })).toThrow(/unknown node/);
    expect(() => step(state, { kind: 'multi', nodeId: 'hunger', selections: [] })).toThrow(/kind/);
    expect(() => step(state, { kind: 'single', nodeId: 'hunger', optionId: 'ravenous' })).toThrow(/unknown option/);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement questions.ts**

Run: `pnpm vitest run --project core test/core/questions.test.ts` — Expected: FAIL (module missing).

`src/core/questions.ts`:

```ts
import { evalRule, type Derived as RuleDerived } from './kb/rules';
import type { Archetype, KnowledgeBase, QuestionNode, QuestionOption } from './kb/schema';
import { plausibleArchetypes } from './planner';
import { applyEffects, emptyPreferences, type DinnerPreferences } from './preferences';

export interface ConversationState {
  prefs: DinnerPreferences;
  asked: string[];
  round2Asked: number;
  rejectedItemIds: string[];
}

export function initialState(): ConversationState {
  return { prefs: emptyPreferences(), asked: [], round2Asked: 0, rejectedItemIds: [] };
}

export const MAX_ROUND2 = 3;
export const SCALE_VALUES = [-1, -0.5, 0, 0.5, 1] as const;
export const MAX_ARCHETYPE_OPTIONS = 8;

export interface Derived extends RuleDerived {
  plausibleArchetypes: Archetype[];
  plausibleArchetypeCount: number;
}

export function deriveContext(kb: KnowledgeBase, prefs: DinnerPreferences): Derived {
  const plausible = plausibleArchetypes(kb, prefs);
  return { plausibleArchetypes: plausible, plausibleArchetypeCount: plausible.length };
}

export interface PresentedQuestion {
  node: QuestionNode;
  options: QuestionOption[];
}

export function optionsFor(node: QuestionNode, derived: Derived): QuestionOption[] {
  if (node.dynamicOptions === 'archetypes') {
    return derived.plausibleArchetypes.slice(0, MAX_ARCHETYPE_OPTIONS).map((a) => ({
      id: `arch:${a.id}`,
      label: a.label,
      effects: [{ path: `archetypes.${a.id}`, value: 1 }],
    }));
  }
  return node.options;
}

export function nextQuestion(kb: KnowledgeBase, state: ConversationState, derived: Derived): PresentedQuestion | null {
  const asked = new Set(state.asked);
  const roundOne = kb.questions.filter((n) => n.round === 1 && !asked.has(n.id)).sort((a, b) => b.priority - a.priority);
  const first = roundOne[0];
  if (first) return { node: first, options: optionsFor(first, derived) };
  if (state.round2Asked >= MAX_ROUND2) return null;
  const roundTwo = kb.questions
    .filter((n) => n.round === 2 && !asked.has(n.id) && n.applies.every((r) => evalRule(r, state.prefs, derived)))
    .sort((a, b) => b.priority - a.priority);
  const node = roundTwo[0];
  if (!node) return null;
  const options = optionsFor(node, derived);
  if (node.dynamicOptions && options.length === 0) {
    return nextQuestion(kb, { ...state, asked: [...state.asked, node.id] }, derived);
  }
  return { node, options };
}

export type Intensity = 0.5 | 1;
export type AnswerInput = { nodeId: string; otherText?: string } & (
  | { kind: 'single'; optionId?: string }
  | { kind: 'multi'; selections: { optionId: string; intensity: Intensity }[] }
  | { kind: 'scale'; stop?: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'yesno'; value?: 'yes' | 'no' | 'either' }
);

export function applyAnswer(kb: KnowledgeBase, state: ConversationState, answer: AnswerInput, derived: Derived): ConversationState {
  const node = kb.questions.find((n) => n.id === answer.nodeId);
  if (!node) throw new Error(`unknown node ${answer.nodeId}`);
  if (node.kind !== answer.kind) throw new Error(`answer kind ${answer.kind} does not match node kind ${node.kind}`);
  const options = optionsFor(node, derived);
  const option = (id: string): QuestionOption => {
    const found = options.find((o) => o.id === id);
    if (!found) throw new Error(`unknown option ${id} for ${node.id}`);
    return found;
  };

  let prefs = state.prefs;
  switch (answer.kind) {
    case 'single':
      if (answer.optionId) prefs = applyEffects(prefs, option(answer.optionId).effects, 1);
      break;
    case 'multi':
      for (const s of answer.selections) prefs = applyEffects(prefs, option(s.optionId).effects, s.intensity);
      break;
    case 'scale':
      if (answer.stop !== undefined && node.field) prefs = applyEffects(prefs, [{ path: node.field, value: SCALE_VALUES[answer.stop] }], 1);
      break;
    case 'yesno':
      if (answer.value === 'yes') prefs = applyEffects(prefs, node.yes ?? [], 1);
      else if (answer.value === 'no') prefs = applyEffects(prefs, node.no ?? [], 1);
      break;
  }
  return {
    ...state,
    prefs,
    asked: [...state.asked, node.id],
    round2Asked: state.round2Asked + (node.round === 2 ? 1 : 0),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project core test/core/questions.test.ts`
Expected: PASS. If the archetype check test reports fewer than five plausible archetypes for comforting plus savory, lower nothing in code: the assertion is a check on `kb/archetypes.json`, where at least five entries have comforting and savory above 0.7 (ramen, beef noodle soup, burger, cheesesteak, butter chicken, pasta ragu, katsu curry all qualify).

- [ ] **Step 5: Commit**

```bash
git add src/core/questions.ts kb/questions.json test/core/questions.test.ts
git commit -m "Add the question graph and round one and two question content"
```

---

### Task 6: "Other" text parsing and the LLM seam

**Files:**
- Create: `src/core/otherText.ts`, `src/providers/types.ts`, `src/providers/llm/fixture.ts`
- Test: `test/core/otherText.test.ts`, `test/core/fixture-llm.test.ts`

**Interfaces:**
- Produces: `PreferencePatchSchema`, `PreferencePatch`, `keywordParse(text)`, `applyPatch(prefs, patch)`, `buildOtherPrompt(text, nodePrompt)`, `otherCacheKey(text)`, `OTHER_PROMPT_VERSION`; `Llm`, `JsonRequest`, `LlmTier`, `Geocoder`, `CandidateSource`, `CandidateQuery`, `RestaurantCandidates`; `FixtureLlm`.

- [ ] **Step 1: Write the failing tests**

`test/core/otherText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyPatch, keywordParse, PreferencePatchSchema } from '../../src/core/otherText';
import { emptyPreferences } from '../../src/core/preferences';

describe('keywordParse', () => {
  it('reads a comfort-but-not-heavy sentence', () => {
    const p = keywordParse('Comforting but not too heavy, broth sounds great');
    expect(p.desiredQualities?.comforting).toBeGreaterThan(0);
    expect(p.heaviness).toBeLessThan(0);
    expect(p.desiredQualities?.brothy).toBe(1);
  });

  it('treats negations as exclusions, never as positive preferences', () => {
    const p = keywordParse('no pork, nothing fried');
    expect(p.exclusions).toEqual(expect.arrayContaining(['pork', 'fried']));
    expect(p.proteins?.pork).toBeUndefined();
    expect(p.desiredQualities?.crispy ?? 0).toBeLessThanOrEqual(0);
  });

  it('records recent and future meals with their cuisine', () => {
    const p = keywordParse('I had pho on Sunday and we are having Korean later this week');
    expect(p.recentMeals).toEqual(expect.arrayContaining(['pho', 'vietnamese']));
    expect(p.futureMeals).toEqual(expect.arrayContaining(['korean']));
    expect(p.cuisines?.korean).toBeUndefined();
  });

  it('picks up proteins, cuisines, carbs, hunger, novelty and budget', () => {
    const p = keywordParse("Salmon sounds especially good, maybe Thai. Rice is fine but no noodles. I'm starving. Surprise me. Under $25");
    expect(p.proteins?.seafood).toBeGreaterThan(0);
    expect(p.seafood?.salmon).toBe(1);
    expect(p.cuisines?.thai).toBeGreaterThan(0);
    expect(p.carbs?.rice).toBeGreaterThan(0);
    expect(p.carbs?.noodles).toBe(-1);
    expect(p.hunger).toBe('very_hungry');
    expect(p.novelty).toBeGreaterThan(0);
    expect(p.budgetMax).toBe(25);
  });

  it('always produces a schema-valid patch', () => {
    for (const text of ['', 'asdf', 'no', 'thai thai thai', '$$$ not hungry']) {
      expect(PreferencePatchSchema.safeParse(keywordParse(text)).success).toBe(true);
    }
  });
});

describe('applyPatch', () => {
  it('merges records, appends lists and sets scalars', () => {
    const prefs = applyPatch(emptyPreferences(), {
      desiredQualities: { brothy: 1 },
      proteins: { beef: 0.7 },
      exclusions: ['Pork'],
      recentMeals: ['pho'],
      heaviness: -0.5,
      budgetMax: 25,
    });
    expect(prefs.desiredQualities.brothy).toBe(1);
    expect(prefs.proteins.beef).toBe(0.7);
    expect(prefs.exclusions).toEqual(['pork']);
    expect(prefs.recentMeals).toEqual(['pho']);
    expect(prefs.heaviness).toBe(-0.5);
    expect(prefs.budget.max).toBe(25);
  });
});
```

`test/core/fixture-llm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FixtureLlm } from '../../src/providers/llm/fixture';

const schema = z.object({ answer: z.number() });

describe('FixtureLlm', () => {
  it('returns null when it has no canned response', async () => {
    const llm = new FixtureLlm();
    expect(await llm.completeJson({ tier: 'small', system: 's', prompt: 'p', schema, cacheKey: 'k' })).toBeNull();
    expect(llm.calls).toEqual(['k']);
  });

  it('returns the canned response when it validates, null otherwise', async () => {
    const llm = new FixtureLlm({ good: { answer: 42 }, bad: { answer: 'x' } });
    expect(await llm.completeJson({ tier: 'large', system: 's', prompt: 'p', schema, cacheKey: 'good' })).toEqual({ answer: 42 });
    expect(await llm.completeJson({ tier: 'large', system: 's', prompt: 'p', schema, cacheKey: 'bad' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project core test/core/otherText.test.ts test/core/fixture-llm.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Write the provider interfaces and FixtureLlm**

`src/providers/types.ts`:

```ts
import type { z } from 'zod';
import type { KnowledgeBase } from '../core/kb/schema';
import type { DinnerPreferences } from '../core/preferences';
import type { MenuItem, RestaurantSummary } from '../core/types';

export type LlmTier = 'small' | 'large';

export interface JsonRequest<T> {
  tier: LlmTier;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Stable key for caching; include a prompt version. */
  cacheKey: string;
  maxTokens?: number;
}

export interface Llm {
  /** Returns null when the model fails, times out, or returns output that does not validate. */
  completeJson<T>(req: JsonRequest<T>): Promise<T | null>;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface Geocoder {
  geocodeZip(zip: string): Promise<GeoPoint | null>;
}

export interface CandidateQuery {
  prefs: DinnerPreferences;
  lat: number;
  lng: number;
  kb: KnowledgeBase;
}

export interface RestaurantCandidates {
  restaurant: RestaurantSummary;
  items: MenuItem[];
}

export interface CandidateSource {
  candidates(query: CandidateQuery): Promise<RestaurantCandidates[]>;
}
```

`src/providers/llm/fixture.ts`:

```ts
import type { JsonRequest, Llm } from '../types';

export class FixtureLlm implements Llm {
  readonly calls: string[] = [];
  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async completeJson<T>(req: JsonRequest<T>): Promise<T | null> {
    this.calls.push(req.cacheKey);
    if (!(req.cacheKey in this.responses)) return null;
    const parsed = req.schema.safeParse(this.responses[req.cacheKey]);
    return parsed.success ? parsed.data : null;
  }
}
```

- [ ] **Step 4: Implement otherText.ts**

```ts
import { z } from 'zod';
import { BEEF_KEYS, CARB_KEYS, PROTEIN_KEYS, QUALITY_KEYS, SEAFOOD_KEYS, clamp1, type DinnerPreferences } from './preferences';

const unit = z.number().min(-1).max(1);

export const PreferencePatchSchema = z.object({
  desiredQualities: z.partialRecord(z.enum(QUALITY_KEYS), unit).optional(),
  proteins: z.partialRecord(z.enum(PROTEIN_KEYS), unit).optional(),
  seafood: z.partialRecord(z.enum(SEAFOOD_KEYS), unit).optional(),
  beef: z.partialRecord(z.enum(BEEF_KEYS), unit).optional(),
  carbs: z.partialRecord(z.enum(CARB_KEYS), unit).optional(),
  cuisines: z.record(z.string(), unit).optional(),
  exclusions: z.array(z.string()).optional(),
  recentMeals: z.array(z.string()).optional(),
  futureMeals: z.array(z.string()).optional(),
  hunger: z.enum(['light', 'normal', 'very_hungry']).optional(),
  heaviness: unit.optional(),
  novelty: unit.optional(),
  handheld: unit.optional(),
  budgetMax: z.number().positive().optional(),
});
export type PreferencePatch = z.infer<typeof PreferencePatchSchema>;

export const OTHER_PROMPT_VERSION = 1;

export function otherCacheKey(text: string): string {
  return `other:v${OTHER_PROMPT_VERSION}:${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function buildOtherPrompt(text: string, nodePrompt: string): { system: string; prompt: string } {
  return {
    system:
      'You convert a diner\'s free-text remark into a JSON preference patch. Only fill fields the text clearly supports. ' +
      'Numbers run from -1 (avoid) to 1 (want). Negations become exclusions, never positive preferences. ' +
      'Dishes eaten recently go in recentMeals; meals planned soon go in futureMeals. Output JSON only.',
    prompt: `Question being answered: "${nodePrompt}"\nDiner wrote: "${text}"`,
  };
}

const CUISINE_WORDS: Record<string, string> = {
  thai: 'thai', vietnamese: 'vietnamese', chinese: 'chinese', sichuan: 'chinese', japanese: 'japanese', korean: 'korean',
  indian: 'indian', mexican: 'mexican', italian: 'italian', american: 'american', 'middle eastern': 'middle_eastern',
  lebanese: 'middle_eastern', mediterranean: 'middle_eastern', greek: 'greek', hawaiian: 'hawaiian',
  pho: 'vietnamese', 'banh mi': 'vietnamese', ramen: 'japanese', sushi: 'japanese', tacos: 'mexican', burrito: 'mexican',
  curry: 'indian', pizza: 'italian', pasta: 'italian', shawarma: 'middle_eastern', kebab: 'middle_eastern', poke: 'hawaiian',
};

const PROTEIN_WORDS: [RegExp, keyof PreferencePatch['proteins'] & string, string?][] = [
  [/\b(beef|steak|brisket)\b/, 'beef'],
  [/\bchicken\b/, 'chicken'],
  [/\bpork\b/, 'pork'],
  [/\bsalmon\b/, 'seafood', 'salmon'],
  [/\b(shrimp|prawns?|crab|shellfish|oysters?)\b/, 'seafood', 'shellfish'],
  [/\b(fish|seafood|tuna)\b/, 'seafood', 'fish'],
  [/\b(vegetarian|veggie|tofu|vegan)\b/, 'vegetarian'],
];

const NEGATION = /\b(no|not|skip|without|avoid|don'?t|nothing|none|never)\b/;
const WORD = (w: string) => new RegExp(`\\b${w}\\b`);

function set(obj: Record<string, number>, key: string, value: number): void {
  const current = obj[key];
  obj[key] = clamp1(current === undefined ? value : Math.abs(value) >= Math.abs(current) ? value : current);
}
function push(list: string[], value: string): void {
  const v = value.trim().toLowerCase();
  if (v && !list.includes(v)) list.push(v);
}

export function keywordParse(text: string): PreferencePatch {
  const patch: PreferencePatch = {};
  const dq = (): Record<string, number> => (patch.desiredQualities ??= {});
  const proteins = (): Record<string, number> => (patch.proteins ??= {});
  const seafood = (): Record<string, number> => (patch.seafood ??= {});
  const carbs = (): Record<string, number> => (patch.carbs ??= {});
  const cuisines = (): Record<string, number> => (patch.cuisines ??= {});
  const exclusions = (): string[] => (patch.exclusions ??= []);
  const recent = (): string[] => (patch.recentMeals ??= []);
  const future = (): string[] => (patch.futureMeals ??= []);

  const lower = text.toLowerCase();

  // Meals eaten or planned are handled on the whole text first, then stripped so they are not read as cravings.
  let working = lower;
  const RECENT = /\b(?:had|ate|got)\s+([a-z]+(?: [a-z]+)?)\b/g;
  for (const m of lower.matchAll(RECENT)) {
    const phrase = m[1]!;
    const word = Object.keys(CUISINE_WORDS).find((w) => phrase.startsWith(w)) ?? phrase.split(' ')[0]!;
    push(recent(), word);
    if (CUISINE_WORDS[word]) push(recent(), CUISINE_WORDS[word]!);
    working = working.replace(m[0], ' ');
  }
  const FUTURE = /\b(?:having|getting|eating|doing)\s+([a-z]+)\s+(?:later|tomorrow|this week|later this week|on \w+day|\w+day)\b/g;
  for (const m of lower.matchAll(FUTURE)) {
    const word = m[1]!;
    push(future(), CUISINE_WORDS[word] ?? word);
    working = working.replace(m[0], ' ');
  }

  for (const rawClause of working.split(/[,.;!?]| but | and | though /)) {
    const clause = rawClause.trim();
    if (!clause) continue;
    const negated = NEGATION.test(clause);
    const sign = negated ? -1 : 1;

    for (const [word, key] of Object.entries(CUISINE_WORDS)) {
      if (!WORD(word).test(clause)) continue;
      if (negated) push(exclusions(), key);
      else set(cuisines(), key, 0.5);
    }
    for (const [re, key, sub] of PROTEIN_WORDS) {
      const m = clause.match(re);
      if (!m) continue;
      if (negated) {
        push(exclusions(), key === 'seafood' && sub ? sub : key);
      } else {
        set(proteins(), key, 0.7);
        if (sub) set(seafood(), sub, 1);
      }
    }

    if (/\b(broth\w*|soup\w*)\b/.test(clause)) set(dq(), 'brothy', sign);
    if (/\b(spicy|heat|hot)\b/.test(clause)) set(dq(), 'spicy', 0.7 * sign);
    if (/\bmild\b/.test(clause)) set(dq(), 'spicy', -0.5);
    if (/\b(heavy|rich|indulgent|greasy)\b/.test(clause)) patch.heaviness = clamp1(0.7 * sign);
    if (/\blight(er)?\b/.test(clause) && !/\bnot light/.test(clause)) patch.heaviness = -0.5;
    if (/\b(fresh|bright|citrus\w*|lime|acidic|tangy|zingy)\b/.test(clause)) {
      set(dq(), 'fresh', 0.7 * sign);
      set(dq(), 'brightAcidic', 0.7 * sign);
    }
    if (/\b(comfort\w*|cozy|cosy)\b/.test(clause)) set(dq(), 'comforting', 0.8 * sign);
    if (/\b(crispy|crunchy|fried)\b/.test(clause)) {
      set(dq(), 'crispy', 0.7 * sign);
      if (negated && /\bfried\b/.test(clause)) push(exclusions(), 'fried');
    }
    if (/\b(savou?ry|umami|meaty)\b/.test(clause)) set(dq(), 'savory', 0.7 * sign);
    if (/\b(hands?|handheld|sandwich|wrap|burger)\b/.test(clause)) patch.handheld = clamp1(0.7 * sign);

    if (/\b(starving|very hungry|really hungry|ravenous)\b/.test(clause)) patch.hunger = 'very_hungry';
    else if (/\b(not (very|that|too) hungry|light dinner|small dinner|snack)\b/.test(clause)) patch.hunger = 'light';

    if (/\brice\b/.test(clause)) set(carbs(), 'rice', negated ? -1 : 0.5);
    if (/\bnoodles?\b/.test(clause)) set(carbs(), 'noodles', negated ? -1 : 0.5);
    if (/\bbread\b/.test(clause)) set(carbs(), 'bread', negated ? -1 : 0.5);
    if (/\btortillas?\b/.test(clause)) set(carbs(), 'tortillas', negated ? -1 : 0.5);
    if (/\b(carbs? on the side|not a (rice|noodle) bowl|low[- ]carb)\b/.test(clause)) set(carbs(), 'starchAsMain', -1);

    if (/\b(surprise me|adventurous|something (new|different|interesting|unusual)|interesting)\b/.test(clause)) patch.novelty = 0.7;
    if (/\b(familiar|usual|classic|safe|normal)\b/.test(clause)) patch.novelty = -0.7;

    const money = clause.match(/\$\s?(\d{1,3})\b|\b(\d{1,3})\s?(dollars|bucks)\b/);
    if (money) {
      const n = Number(money[1] ?? money[2]);
      if (n > 0) patch.budgetMax = n;
    }
  }
  return patch;
}

export function applyPatch(prefs: DinnerPreferences, patch: PreferencePatch): DinnerPreferences {
  const next = structuredClone(prefs);
  const records = ['desiredQualities', 'proteins', 'seafood', 'beef', 'carbs', 'cuisines'] as const;
  for (const field of records) {
    const incoming = patch[field];
    if (!incoming) continue;
    const target = next[field] as Record<string, number>;
    for (const [k, v] of Object.entries(incoming)) if (typeof v === 'number') target[k] = clamp1(v);
  }
  const lists = ['exclusions', 'recentMeals', 'futureMeals'] as const;
  for (const field of lists) for (const v of patch[field] ?? []) push(next[field], v);
  if (patch.hunger) next.hunger = patch.hunger;
  if (patch.heaviness !== undefined) next.heaviness = clamp1(patch.heaviness);
  if (patch.novelty !== undefined) next.novelty = clamp1(patch.novelty);
  if (patch.handheld !== undefined) next.handheld = clamp1(patch.handheld);
  if (patch.budgetMax !== undefined) next.budget.max = patch.budgetMax;
  return next;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project core test/core/otherText.test.ts test/core/fixture-llm.test.ts`
Expected: PASS. The keyword parser is heuristic; if one assertion fails, fix the regex that owns it rather than loosening the test. The negation test and the schema-validity test must never be weakened.

- [ ] **Step 6: Commit**

```bash
git add src/core/otherText.ts src/providers test/core/otherText.test.ts test/core/fixture-llm.test.ts
git commit -m "Add Other-text parsing with keyword fallback and the LLM seam"
```

---

### Task 7: Session API over D1

**Files:**
- Create: `src/shared/api.ts`, `src/worker/validation.ts`, `src/worker/deps.ts`, `src/worker/other.ts`, `src/worker/db/sessions.ts`, `src/worker/db/suggestions.ts`, `src/worker/routes/session.ts`, `src/providers/geocoder/fixture.ts`
- Modify: `src/worker/index.ts`
- Test: `test/worker/session.test.ts`

**Interfaces:**
- Consumes: question graph (Task 5), `otherText` and `FixtureLlm` (Task 6).
- Produces: `QuestionDto`, `AnswerDto`, `SessionDto`, `SessionDebug` (shared); `Deps`, `buildDeps(env)`; `SessionRecord`, `insertSession`, `getSession`, `saveSession`; `insertSuggestion`, `countSuggestions`; `sessionRoutes`; `toSessionDto(kb, record, debug)`; `FixtureGeocoder`.
- Routes: `POST /api/session`, `GET /api/session/:id`, `POST /api/session/:id/answer`, `POST /api/session/:id/suggest`.

- [ ] **Step 1: Write shared DTOs and validation**

`src/shared/api.ts`:

```ts
import type { NodeKind } from '../core/kb/schema';
import type { DinnerPreferences } from '../core/preferences';
import type { AnswerInput } from '../core/questions';

export interface QuestionDto {
  nodeId: string;
  kind: NodeKind;
  prompt: string;
  help?: string;
  options: { id: string; label: string }[];
  stops?: string[];
  allowMissingOption: boolean;
  round: 1 | 2;
}

export type AnswerDto = AnswerInput;

export type SessionStatus = 'asking' | 'ready' | 'recommended';

export interface SessionDebug {
  prefs: DinnerPreferences;
  asked: string[];
  round2Asked: number;
  rejectedItemIds: string[];
  lastOtherParse?: { source: 'llm' | 'keywords'; patch: unknown };
}

export interface SessionDto {
  id: string;
  zipLabel: string;
  status: SessionStatus;
  question: QuestionDto | null;
  debug?: SessionDebug;
}

export interface ApiError {
  error: string;
  message?: string;
  issues?: unknown;
}
```

`src/worker/validation.ts`:

```ts
import { z } from 'zod';

export const CreateSessionSchema = z.union([
  z.object({ zip: z.string().regex(/^\d{5}$/, 'ZIP must be five digits') }),
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
]);

const otherText = z.string().trim().max(500).optional();
const nodeId = z.string().min(1);

export const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), nodeId, optionId: z.string().min(1).optional(), otherText }),
  z.object({
    kind: z.literal('multi'),
    nodeId,
    selections: z.array(z.object({ optionId: z.string().min(1), intensity: z.union([z.literal(0.5), z.literal(1)]) })).max(20),
    otherText,
  }),
  z.object({ kind: z.literal('scale'), nodeId, stop: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(), otherText }),
  z.object({ kind: z.literal('yesno'), nodeId, value: z.enum(['yes', 'no', 'either']).optional(), otherText }),
]);

export const SuggestSchema = z.object({ nodeId, text: z.string().trim().min(2).max(80) });
```

- [ ] **Step 2: Write the fixture geocoder, deps and the Other helper**

`src/providers/geocoder/fixture.ts`:

```ts
import type { Geocoder, GeoPoint } from '../types';

/** Any five-digit ZIP resolves to the Mission District so local runs need no API key. */
export class FixtureGeocoder implements Geocoder {
  async geocodeZip(zip: string): Promise<GeoPoint | null> {
    if (!/^\d{5}$/.test(zip)) return null;
    return { lat: 37.7599, lng: -122.4148, label: zip };
  }
}
```

`src/worker/deps.ts`:

```ts
import { loadBaseKb, type KnowledgeBase } from '../core/kb';
import { FixtureGeocoder } from '../providers/geocoder/fixture';
import { FixtureLlm } from '../providers/llm/fixture';
import type { Geocoder, Llm } from '../providers/types';
import type { Env } from './env';

export interface Deps {
  kb: KnowledgeBase;
  llm: Llm;
  geocoder: Geocoder;
}

function unsupported(name: string, value: string): never {
  throw new Error(`${name}=${value} is not available in this build`);
}

export function buildDeps(env: Env): Deps {
  const kb = loadBaseKb();
  const llm: Llm = env.LLM_PROVIDER === 'fixture' ? new FixtureLlm() : unsupported('LLM_PROVIDER', env.LLM_PROVIDER);
  const geocoder: Geocoder = env.GEOCODER === 'fixture' ? new FixtureGeocoder() : unsupported('GEOCODER', env.GEOCODER);
  return { kb, llm, geocoder };
}
```

`src/worker/other.ts`:

```ts
import { applyPatch, buildOtherPrompt, keywordParse, otherCacheKey, PreferencePatchSchema, type PreferencePatch } from '../core/otherText';
import type { DinnerPreferences } from '../core/preferences';
import type { Llm } from '../providers/types';

export interface OtherParse {
  source: 'llm' | 'keywords';
  patch: PreferencePatch;
}

export async function parseOther(llm: Llm, text: string, nodePrompt: string): Promise<OtherParse> {
  const { system, prompt } = buildOtherPrompt(text, nodePrompt);
  const fromLlm = await llm.completeJson({ tier: 'large', system, prompt, schema: PreferencePatchSchema, cacheKey: otherCacheKey(text) });
  return fromLlm ? { source: 'llm', patch: fromLlm } : { source: 'keywords', patch: keywordParse(text) };
}

export function applyOther(prefs: DinnerPreferences, text: string, parse: OtherParse): DinnerPreferences {
  const next = applyPatch(prefs, parse.patch);
  const note = text.trim();
  if (note && !next.notes.includes(note.toLowerCase())) next.notes.push(note.toLowerCase());
  return next;
}
```

- [ ] **Step 3: Write the D1 repositories**

`src/worker/db/sessions.ts`:

```ts
import type { ConversationState } from '../../core/questions';
import type { SessionStatus } from '../../shared/api';

export interface SessionRecord {
  id: string;
  ownerId: string | null;
  zipLabel: string;
  lat: number;
  lng: number;
  status: SessionStatus;
  state: ConversationState;
}

interface Row {
  id: string;
  owner_id: string | null;
  zip_label: string;
  lat: number;
  lng: number;
  prefs: string;
  asked: string;
  round2_asked: number;
  rejected_item_ids: string;
  status: SessionStatus;
}

function fromRow(r: Row): SessionRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    zipLabel: r.zip_label,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    state: {
      prefs: JSON.parse(r.prefs),
      asked: JSON.parse(r.asked),
      round2Asked: r.round2_asked,
      rejectedItemIds: JSON.parse(r.rejected_item_ids),
    },
  };
}

export async function insertSession(db: D1Database, rec: SessionRecord): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sessions (id, owner_id, zip_label, lat, lng, prefs, asked, round2_asked, rejected_item_ids, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
    )
    .bind(
      rec.id, rec.ownerId, rec.zipLabel, rec.lat, rec.lng,
      JSON.stringify(rec.state.prefs), JSON.stringify(rec.state.asked), rec.state.round2Asked,
      JSON.stringify(rec.state.rejectedItemIds), rec.status, now,
    )
    .run();
}

export async function getSession(db: D1Database, id: string): Promise<SessionRecord | null> {
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?1').bind(id).first<Row>();
  return row ? fromRow(row) : null;
}

export async function saveSession(db: D1Database, rec: SessionRecord): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions SET prefs = ?2, asked = ?3, round2_asked = ?4, rejected_item_ids = ?5, status = ?6, updated_at = ?7 WHERE id = ?1`,
    )
    .bind(
      rec.id, JSON.stringify(rec.state.prefs), JSON.stringify(rec.state.asked), rec.state.round2Asked,
      JSON.stringify(rec.state.rejectedItemIds), rec.status, new Date().toISOString(),
    )
    .run();
}
```

`src/worker/db/suggestions.ts`:

```ts
import type { DinnerPreferences } from '../../core/preferences';

export async function insertSuggestion(
  db: D1Database,
  s: { id: string; sessionId: string; nodeId: string; text: string; prefs: DinnerPreferences },
): Promise<void> {
  await db
    .prepare(`INSERT INTO suggestions (id, session_id, node_id, text, prefs_snapshot, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`)
    .bind(s.id, s.sessionId, s.nodeId, s.text, JSON.stringify(s.prefs), new Date().toISOString())
    .run();
}

export async function countSuggestions(db: D1Database, sessionId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE session_id = ?1').bind(sessionId).first<{ n: number }>();
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Write the failing route tests**

`test/worker/session.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { SessionDto } from '../../src/shared/api';
import { testEnv } from './env';

async function post(path: string, body: unknown): Promise<Response> {
  return SELF.fetch(`http://example.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function create(): Promise<SessionDto> {
  const res = await post('/api/session?debug=1', { zip: '94110' });
  expect(res.status).toBe(201);
  return res.json();
}
async function answer(id: string, body: unknown): Promise<SessionDto> {
  const res = await post(`/api/session/${id}/answer?debug=1`, body);
  expect(res.status).toBe(200);
  return res.json();
}

describe('POST /api/session', () => {
  it('creates a session from a ZIP and returns the first question', async () => {
    const s = await create();
    expect(s.zipLabel).toBe('94110');
    expect(s.status).toBe('asking');
    expect(s.question?.nodeId).toBe('hunger');
    expect(s.question?.options.map((o) => o.id)).toEqual(['light', 'normal', 'very_hungry']);
  });

  it('accepts coordinates', async () => {
    const res = await post('/api/session', { lat: 37.76, lng: -122.41 });
    expect(res.status).toBe(201);
  });

  it('rejects malformed input', async () => {
    expect((await post('/api/session', { zip: '9411' })).status).toBe(400);
    expect((await post('/api/session', { lat: 100, lng: 0 })).status).toBe(400);
    expect((await post('/api/session', {})).status).toBe(400);
  });
});

describe('answers', () => {
  it('walks round one, applies effects and reaches ready', async () => {
    const s = await create();
    let cur = await answer(s.id, { kind: 'single', nodeId: 'hunger', optionId: 'normal' });
    expect(cur.question?.nodeId).toBe('feel');
    cur = await answer(s.id, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }] });
    cur = await answer(s.id, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] });
    cur = await answer(s.id, { kind: 'scale', nodeId: 'novelty', stop: 2 });
    cur = await answer(s.id, { kind: 'multi', nodeId: 'avoid', selections: [] });
    expect(cur.question?.nodeId).toBe('brothy');
    expect(cur.debug?.prefs.proteins.beef).toBe(1);
    for (let i = 0; i < 3 && cur.question; i++) {
      cur = await answer(s.id, { kind: cur.question.kind, nodeId: cur.question.nodeId });
    }
    expect(cur.status).toBe('ready');
    expect(cur.question).toBeNull();
  });

  it('merges Other text through the keyword fallback and records a note', async () => {
    const s = await create();
    const cur = await answer(s.id, { kind: 'single', nodeId: 'hunger', optionId: 'light', otherText: 'no pork, had pho on Sunday' });
    expect(cur.debug?.prefs.exclusions).toContain('pork');
    expect(cur.debug?.prefs.recentMeals).toContain('vietnamese');
    expect(cur.debug?.prefs.notes).toEqual(['no pork, had pho on sunday']);
    expect(cur.debug?.lastOtherParse?.source).toBe('keywords');
  });

  it('rejects answers for the wrong node or unknown options with 400', async () => {
    const s = await create();
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'single', nodeId: 'hunger', optionId: 'ravenous' })).status).toBe(400);
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'single', nodeId: 'nope', optionId: 'x' })).status).toBe(400);
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'multi', nodeId: 'hunger', selections: [] })).status).toBe(400);
  });

  it('returns 404 for unknown sessions', async () => {
    expect((await SELF.fetch('http://example.com/api/session/does-not-exist')).status).toBe(404);
  });
});

describe('suggestions', () => {
  it('stores a suggestion and rate-limits after ten', async () => {
    const s = await create();
    for (let i = 0; i < 10; i++) {
      const res = await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: `option ${i}` });
      expect(res.status).toBe(202);
    }
    expect((await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: 'one too many' })).status).toBe(429);
    const row = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE session_id = ?1').bind(s.id).first<{ n: number }>();
    expect(row?.n).toBe(10);
  });

  it('rejects empty or very long suggestions', async () => {
    const s = await create();
    expect((await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: 'x' })).status).toBe(400);
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement the routes**

Run: `pnpm vitest run --project worker test/worker/session.test.ts` — Expected: FAIL with 404s.

`src/worker/routes/session.ts`:

```ts
import { Hono } from 'hono';
import type { ZodError } from 'zod';
import type { KnowledgeBase } from '../../core/kb';
import { applyAnswer, deriveContext, initialState, nextQuestion } from '../../core/questions';
import type { QuestionDto, SessionDebug, SessionDto } from '../../shared/api';
import { getSession, insertSession, saveSession, type SessionRecord } from '../db/sessions';
import { countSuggestions, insertSuggestion } from '../db/suggestions';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { applyOther, parseOther } from '../other';
import { AnswerSchema, CreateSessionSchema, SuggestSchema } from '../validation';

export type AppContext = { Bindings: Env; Variables: { deps: Deps } };

export const MAX_SUGGESTIONS_PER_SESSION = 10;

export function toSessionDto(kb: KnowledgeBase, rec: SessionRecord, debug: boolean, extra?: Partial<SessionDebug>): SessionDto {
  const derived = deriveContext(kb, rec.state.prefs);
  const next = rec.status === 'asking' ? nextQuestion(kb, rec.state, derived) : null;
  const question: QuestionDto | null = next
    ? {
        nodeId: next.node.id,
        kind: next.node.kind,
        prompt: next.node.prompt,
        help: next.node.help,
        options: next.options.map((o) => ({ id: o.id, label: o.label })),
        stops: next.node.stops,
        allowMissingOption: next.node.allowMissingOption,
        round: next.node.round,
      }
    : null;
  const dto: SessionDto = { id: rec.id, zipLabel: rec.zipLabel, status: rec.status, question };
  if (debug) dto.debug = { prefs: rec.state.prefs, asked: rec.state.asked, round2Asked: rec.state.round2Asked, rejectedItemIds: rec.state.rejectedItemIds, ...extra };
  return dto;
}

const invalid = (issues: ZodError['issues']) => ({ error: 'invalid_request', issues });

export const sessionRoutes = new Hono<AppContext>();

sessionRoutes.post('/', async (c) => {
  const parsed = CreateSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { geocoder, kb } = c.get('deps');
  let point: { lat: number; lng: number; label: string } | null;
  if ('zip' in parsed.data) {
    point = await geocoder.geocodeZip(parsed.data.zip);
    if (!point) return c.json({ error: 'unknown_zip', message: 'Could not place that ZIP code.' }, 400);
  } else {
    point = { lat: parsed.data.lat, lng: parsed.data.lng, label: 'near you' };
  }
  const rec: SessionRecord = { id: crypto.randomUUID(), ownerId: null, zipLabel: point.label, lat: point.lat, lng: point.lng, status: 'asking', state: initialState() };
  await insertSession(c.env.DB, rec);
  return c.json(toSessionDto(kb, rec, c.req.query('debug') === '1'), 201);
});

sessionRoutes.get('/:id', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  return c.json(toSessionDto(c.get('deps').kb, rec, c.req.query('debug') === '1'));
});

sessionRoutes.post('/:id/answer', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  if (rec.status !== 'asking') return c.json({ error: 'not_asking', message: 'This session already has enough answers.' }, 409);
  const parsed = AnswerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { kb, llm } = c.get('deps');
  const answer = parsed.data;
  const node = kb.questions.find((n) => n.id === answer.nodeId);

  let state;
  try {
    state = applyAnswer(kb, rec.state, answer, deriveContext(kb, rec.state.prefs));
  } catch (err) {
    return c.json({ error: 'bad_answer', message: (err as Error).message }, 400);
  }

  let lastOtherParse: SessionDebug['lastOtherParse'];
  if (answer.otherText && answer.otherText.trim()) {
    const parse = await parseOther(llm, answer.otherText, node?.prompt ?? '');
    state = { ...state, prefs: applyOther(state.prefs, answer.otherText, parse) };
    lastOtherParse = { source: parse.source, patch: parse.patch };
  }

  const next = nextQuestion(kb, state, deriveContext(kb, state.prefs));
  const updated: SessionRecord = { ...rec, state, status: next ? 'asking' : 'ready' };
  await saveSession(c.env.DB, updated);
  return c.json(toSessionDto(kb, updated, c.req.query('debug') === '1', lastOtherParse ? { lastOtherParse } : undefined));
});

sessionRoutes.post('/:id/suggest', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  const parsed = SuggestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  if ((await countSuggestions(c.env.DB, rec.id)) >= MAX_SUGGESTIONS_PER_SESSION) {
    return c.json({ error: 'too_many_suggestions' }, 429);
  }
  await insertSuggestion(c.env.DB, { id: crypto.randomUUID(), sessionId: rec.id, nodeId: parsed.data.nodeId, text: parsed.data.text, prefs: rec.state.prefs });
  return c.json({ ok: true }, 202);
});
```

Update `src/worker/index.ts`:

```ts
import { Hono } from 'hono';
import { buildDeps, type Deps } from './deps';
import type { Env } from './env';
import { sessionRoutes, type AppContext } from './routes/session';

export const app = new Hono<AppContext>();

let deps: Deps | undefined;
app.use('/api/*', async (c, next) => {
  deps ??= buildDeps(c.env);
  c.set('deps', deps);
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/session', sessionRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal', message: err.message }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run --project worker` then `pnpm typecheck`
Expected: PASS, no type errors. A type error on `c.env.DB` means `AppContext` is not applied to the app or route; a 500 in tests means read the console output for the thrown message.

- [ ] **Step 7: Commit**

```bash
git add src/shared src/worker src/providers/geocoder test/worker/session.test.ts
git commit -m "Add session API: create, answer, suggest over D1"
```

---

### Task 8: Conversation UI

**Files:**
- Create: `src/client/api.ts`, `src/client/screens/Landing.tsx`, `src/client/screens/Conversation.tsx`, `src/client/components/ChipGroup.tsx`, `src/client/components/ScaleInput.tsx`, `src/client/components/QuestionCard.tsx`, `src/client/components/DebugDrawer.tsx`
- Modify: `src/client/App.tsx`
- Test: `test/client/ChipGroup.test.tsx`, `test/client/ScaleInput.test.tsx`

**Interfaces:**
- Consumes: `SessionDto`, `QuestionDto`, `AnswerDto` from `src/shared/api.ts`; routes from Task 7.
- Produces: `api` client object (`createSession`, `getSession`, `answer`, `suggest`; Task 15 adds `recommend` and `feedback`), `isDebug`, `cycleIntensity(current)`, `ChipGroup`, `ScaleInput`, `QuestionCard`, `DebugDrawer`, `Landing`, `Conversation`, `App` with a `screen` state machine.

- [ ] **Step 1: Write the failing component tests**

`test/client/ChipGroup.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipGroup, cycleIntensity } from '../../src/client/components/ChipGroup';

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

describe('cycleIntensity', () => {
  it('cycles none -> 0.5 -> 1 -> none', () => {
    expect(cycleIntensity(undefined)).toBe(0.5);
    expect(cycleIntensity(0.5)).toBe(1);
    expect(cycleIntensity(1)).toBeUndefined();
  });
});

describe('ChipGroup multi', () => {
  it('reports the cycled intensity for the tapped chip only', () => {
    const onChange = vi.fn();
    render(<ChipGroup mode="multi" options={options} value={new Map([['b', 0.5]])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(onChange).toHaveBeenCalledWith(new Map([['b', 0.5], ['a', 0.5]]));
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    expect(onChange).toHaveBeenLastCalledWith(new Map([['b', 1]]));
  });

  it('exposes selection state with aria-pressed and a "really" marker at intensity 1', () => {
    render(<ChipGroup mode="multi" options={options} value={new Map([['a', 1]])} onChange={() => {}} />);
    const alpha = screen.getByRole('button', { name: /alpha/i });
    expect(alpha.getAttribute('aria-pressed')).toBe('true');
    expect(alpha.textContent).toMatch(/really/i);
    expect(screen.getByRole('button', { name: /beta/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ChipGroup single', () => {
  it('replaces the selection and toggles off when tapped again', () => {
    const onChange = vi.fn();
    render(<ChipGroup mode="single" options={options} value={new Map([['a', 1]])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith(new Map([['b', 1]]));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(onChange).toHaveBeenLastCalledWith(new Map());
  });
});
```

`test/client/ScaleInput.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaleInput } from '../../src/client/components/ScaleInput';

afterEach(cleanup);

describe('ScaleInput', () => {
  it('renders five stops and reports the index', () => {
    const onChange = vi.fn();
    render(<ScaleInput stops={['A', 'B', 'C', 'D', 'E']} value={undefined} onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: 'C' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('marks the selected stop', () => {
    render(<ScaleInput stops={['A', 'B', 'C', 'D', 'E']} value={4} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'E' }).getAttribute('aria-checked')).toBe('true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project client` — Expected: FAIL (modules missing).

- [ ] **Step 3: Write ChipGroup and ScaleInput**

`src/client/components/ChipGroup.tsx`:

```tsx
export type Intensity = 0.5 | 1;

export function cycleIntensity(current: Intensity | undefined): Intensity | undefined {
  if (current === undefined) return 0.5;
  if (current === 0.5) return 1;
  return undefined;
}

interface Props {
  options: { id: string; label: string }[];
  mode: 'single' | 'multi';
  value: Map<string, Intensity>;
  onChange: (next: Map<string, Intensity>) => void;
  disabled?: boolean;
}

const base = 'rounded-full border px-4 py-2 text-sm transition select-none';
const styles: Record<'none' | '0.5' | '1', string> = {
  none: 'border-stone-300 bg-white text-stone-800 hover:border-stone-500',
  '0.5': 'border-amber-400 bg-amber-100 text-amber-900',
  '1': 'border-amber-700 bg-amber-600 text-white font-medium',
};

export function ChipGroup({ options, mode, value, onChange, disabled }: Props) {
  const tap = (id: string) => {
    const next = new Map(value);
    if (mode === 'single') {
      const wasSelected = next.has(id);
      next.clear();
      if (!wasSelected) next.set(id, 1);
    } else {
      const cycled = cycleIntensity(next.get(id));
      if (cycled === undefined) next.delete(id);
      else next.set(id, cycled);
    }
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const intensity = value.get(o.id);
        const key = intensity === undefined ? 'none' : (String(intensity) as '0.5' | '1');
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            aria-pressed={intensity !== undefined}
            onClick={() => tap(o.id)}
            className={`${base} ${styles[key]}`}
          >
            {o.label}
            {mode === 'multi' && intensity === 1 ? <span className="ml-1 text-xs uppercase tracking-wide">really</span> : null}
          </button>
        );
      })}
    </div>
  );
}
```

`src/client/components/ScaleInput.tsx`:

```tsx
interface Props {
  stops: string[];
  value: number | undefined;
  onChange: (stop: number) => void;
  disabled?: boolean;
}

export function ScaleInput({ stops, value, onChange, disabled }: Props) {
  return (
    <div role="radiogroup" className="grid grid-cols-5 gap-1">
      {stops.map((label, i) => {
        const selected = value === i;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(i)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-2 text-center text-xs ${
              selected ? 'border-amber-700 bg-amber-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'
            }`}
          >
            <span className={`h-3 w-3 rounded-full ${selected ? 'bg-white' : 'bg-stone-300'}`} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

Run: `pnpm vitest run --project client` — Expected: PASS.

- [ ] **Step 4: Write the API client**

`src/client/api.ts`:

```ts
import type { AnswerDto, ApiError, SessionDto } from '../shared/api';

export const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
const debugQuery = isDebug ? '?debug=1' : '';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'unknown' }))) as ApiError;
    throw new ApiRequestError(res.status, body);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  createSession: (body: { zip: string } | { lat: number; lng: number }) => post<SessionDto>(`/api/session${debugQuery}`, body),
  getSession: (id: string) => request<SessionDto>(`/api/session/${id}${debugQuery}`),
  answer: (id: string, answer: AnswerDto) => post<SessionDto>(`/api/session/${id}/answer${debugQuery}`, answer),
  suggest: (id: string, nodeId: string, text: string) => post<{ ok: true }>(`/api/session/${id}/suggest`, { nodeId, text }),
};
```

- [ ] **Step 5: Write QuestionCard, DebugDrawer, Landing, Conversation and App**

`src/client/components/QuestionCard.tsx`:

```tsx
import { useState } from 'react';
import type { AnswerDto, QuestionDto } from '../../shared/api';
import { ChipGroup, type Intensity } from './ChipGroup';
import { ScaleInput } from './ScaleInput';

interface Props {
  question: QuestionDto;
  busy: boolean;
  onSubmit: (answer: AnswerDto) => Promise<void>;
  onSuggest: (text: string) => Promise<void>;
}

const YESNO = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'either', label: "Don't mind" },
];

export function QuestionCard({ question, busy, onSubmit, onSuggest }: Props) {
  const [choices, setChoices] = useState<Map<string, Intensity>>(new Map());
  const [stop, setStop] = useState<number | undefined>(undefined);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState('');
  const [suggested, setSuggested] = useState(false);

  const other = otherText.trim() ? otherText.trim() : undefined;

  const buildAnswer = (): AnswerDto => {
    const nodeId = question.nodeId;
    switch (question.kind) {
      case 'single':
        return { kind: 'single', nodeId, optionId: [...choices.keys()][0], otherText: other };
      case 'multi':
        return { kind: 'multi', nodeId, selections: [...choices.entries()].map(([optionId, intensity]) => ({ optionId, intensity })), otherText: other };
      case 'scale':
        return { kind: 'scale', nodeId, stop: stop as 0 | 1 | 2 | 3 | 4 | undefined, otherText: other };
      case 'yesno':
        return { kind: 'yesno', nodeId, value: [...choices.keys()][0] as 'yes' | 'no' | 'either' | undefined, otherText: other };
    }
  };

  const submitSuggestion = async () => {
    if (suggestText.trim().length < 2) return;
    await onSuggest(suggestText.trim());
    setSuggested(true);
    setSuggestOpen(false);
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
      <h2 className="text-xl font-semibold">{question.prompt}</h2>
      {question.help ? <p className="mt-1 text-sm text-stone-500">{question.help}</p> : null}

      <div className="mt-5">
        {question.kind === 'scale' && question.stops ? (
          <ScaleInput stops={question.stops} value={stop} onChange={setStop} disabled={busy} />
        ) : question.kind === 'yesno' ? (
          <ChipGroup mode="single" options={YESNO} value={choices} onChange={setChoices} disabled={busy} />
        ) : (
          <ChipGroup mode={question.kind === 'multi' ? 'multi' : 'single'} options={question.options} value={choices} onChange={setChoices} disabled={busy} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <button type="button" className="text-stone-600 underline-offset-2 hover:underline" onClick={() => setOtherOpen((v) => !v)}>
          Other
        </button>
        {question.allowMissingOption ? (
          suggested ? (
            <span className="text-stone-500">Thanks, noted for review.</span>
          ) : (
            <button type="button" className="text-stone-600 underline-offset-2 hover:underline" onClick={() => setSuggestOpen((v) => !v)}>
              Missing an option?
            </button>
          )
        ) : null}
      </div>

      {otherOpen ? (
        <textarea
          className="mt-3 w-full rounded-lg border border-stone-300 p-3 text-sm"
          rows={2}
          maxLength={500}
          placeholder="Say it your way. Example: had pho on Sunday, salmon sounds great."
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
        />
      ) : null}

      {suggestOpen ? (
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-stone-300 p-2 text-sm"
            maxLength={80}
            placeholder="An option we should have listed"
            value={suggestText}
            onChange={(e) => setSuggestText(e.target.value)}
          />
          <button type="button" className="rounded-lg bg-stone-800 px-3 text-sm text-white" onClick={submitSuggestion}>
            Send
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="text-sm text-stone-500 hover:underline" disabled={busy} onClick={() => onSubmit({ kind: question.kind, nodeId: question.nodeId, ...(question.kind === 'multi' ? { selections: [] } : {}) } as AnswerDto)}>
          Skip
        </button>
        <button type="button" className="rounded-full bg-amber-600 px-5 py-2 font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit(buildAnswer())}>
          Continue
        </button>
      </div>
    </section>
  );
}
```

`src/client/components/DebugDrawer.tsx`:

```tsx
import { useState } from 'react';

export function DebugDrawer({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="mt-8 rounded-xl border border-dashed border-stone-400 bg-stone-100 p-3 text-xs">
      <button type="button" className="font-mono font-semibold" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open ? <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre> : null}
    </aside>
  );
}
```

`src/client/screens/Landing.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  busy: boolean;
  error?: string;
  onStart: (body: { zip: string } | { lat: number; lng: number }) => void;
}

export function Landing({ busy, error, onStart }: Props) {
  const [zip, setZip] = useState('');
  const [geoError, setGeoError] = useState<string | undefined>();
  const valid = /^\d{5}$/.test(zip);

  const useLocation = () => {
    if (!navigator.geolocation) return setGeoError('Location is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (pos) => onStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError('Could not read your location. A ZIP code works too.'),
    );
  };

  return (
    <section className="mt-16 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Dishision</h1>
      <p className="mt-2 text-lg text-stone-600">Make a dishision.</p>
      <p className="mx-auto mt-6 max-w-md text-stone-700">
        You know you need dinner. You do not know what you want. A few quick questions about how dinner should feel, and you get one specific order.
      </p>
      <form
        className="mx-auto mt-8 flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onStart({ zip });
        }}
      >
        <input
          inputMode="numeric"
          placeholder="ZIP code"
          className="flex-1 rounded-full border border-stone-300 px-4 py-2"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
        <button type="submit" disabled={!valid || busy} className="rounded-full bg-amber-600 px-5 py-2 font-medium text-white disabled:opacity-50">
          Start
        </button>
      </form>
      <button type="button" className="mt-3 text-sm text-stone-600 hover:underline" onClick={useLocation} disabled={busy}>
        Use my location instead
      </button>
      {geoError || error ? <p className="mt-4 text-sm text-red-700">{geoError ?? error}</p> : null}
    </section>
  );
}
```

`src/client/screens/Conversation.tsx`:

```tsx
import { useState } from 'react';
import type { AnswerDto, SessionDto } from '../../shared/api';
import { api, ApiRequestError } from '../api';
import { QuestionCard } from '../components/QuestionCard';

interface Props {
  session: SessionDto;
  onUpdate: (session: SessionDto) => void;
}

export function Conversation({ session, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const question = session.question;
  if (!question) return null;

  const submit = async (answer: AnswerDto) => {
    setBusy(true);
    setError(undefined);
    try {
      onUpdate(await api.answer(session.id, answer));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const suggest = async (text: string) => {
    try {
      await api.suggest(session.id, question.nodeId, text);
    } catch {
      /* a failed suggestion must never block the conversation */
    }
  };

  return (
    <div className="mt-10">
      <p className="mb-3 text-sm uppercase tracking-wide text-stone-500">{question.round === 1 ? 'Getting a feel for it' : 'Narrowing it down'}</p>
      <QuestionCard key={question.nodeId} question={question} busy={busy} onSubmit={submit} onSuggest={suggest} />
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
```

`src/client/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { SessionDto } from '../shared/api';
import { api, ApiRequestError, isDebug } from './api';
import { DebugDrawer } from './components/DebugDrawer';
import { Conversation } from './screens/Conversation';
import { Landing } from './screens/Landing';

function sessionIdFromHash(): string | undefined {
  const m = window.location.hash.match(/^#s=([0-9a-f-]+)$/i);
  return m?.[1];
}

export function App() {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const id = sessionIdFromHash();
    if (!id) return;
    api.getSession(id).then(setSession).catch(() => window.history.replaceState(null, '', ' '));
  }, []);

  const update = (s: SessionDto) => {
    setSession(s);
    window.location.hash = `s=${s.id}`;
  };

  const start = async (body: { zip: string } | { lat: number; lng: number }) => {
    setBusy(true);
    setError(undefined);
    try {
      update(await api.createSession(body));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSession(null);
    window.history.replaceState(null, '', ' ');
  };

  return (
    <main className="mx-auto max-w-xl px-4 pb-16">
      {session ? (
        <header className="flex items-center justify-between pt-6 text-sm text-stone-500">
          <button type="button" className="font-semibold text-stone-800" onClick={reset}>
            Dishision
          </button>
          <span>{session.zipLabel}</span>
        </header>
      ) : null}

      {!session ? <Landing busy={busy} error={error} onStart={start} /> : null}
      {session?.status === 'asking' ? <Conversation session={session} onUpdate={update} /> : null}
      {session && session.status !== 'asking' ? (
        <section className="mt-10 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h2 className="text-xl font-semibold">Enough to go on.</h2>
          <p className="mt-2 text-stone-600">Recommendations arrive in the next task.</p>
          <button type="button" className="mt-4 text-sm text-stone-600 hover:underline" onClick={reset}>
            Start over
          </button>
        </section>
      ) : null}

      {isDebug && session?.debug ? <DebugDrawer title="session" data={session.debug} /> : null}
    </main>
  );
}
```

- [ ] **Step 6: Verify by hand**

Run: `pnpm typecheck` (expect clean), then `pnpm dev`. Open `http://localhost:5173/?debug=1`. Enter `94110`, answer the questions, tap a chip twice to see "really", open Other and type "no pork", check the debug drawer shows `exclusions: ["pork"]` after Continue. Use "Missing an option?" on the avoid question. Reload the page: the session resumes from the hash. Reach the "Enough to go on." card. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/client test/client
git commit -m "Add conversation UI with intensity chips, scale input and debug drawer"
```

---

### Task 9: Lexicon tagger

**Files:**
- Create: `src/core/lexicon.ts`
- Modify: `kb/lexicon.json`
- Test: `test/core/lexicon.test.ts`

**Interfaces:**
- Consumes: `KnowledgeBase`, `LexiconEntry`, `Scores`, `ItemTags`.
- Produces: `tagItem(kb, { name, description }) -> TagResult { scores, tags, confidence, hits }`, `LEXICON_CONFIDENT = 0.6`. Used by fixtures (Task 13) and by the ingestion plan later.

- [ ] **Step 1: Write the failing tests**

`test/core/lexicon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { LEXICON_CONFIDENT, tagItem } from '../../src/core/lexicon';

const kb = loadBaseKb();

describe('tagItem', () => {
  it('tags tom yum as a bright, spicy seafood soup', () => {
    const r = tagItem(kb, { name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass, lime leaf and mushrooms' });
    expect(r.scores.brothy).toBeGreaterThanOrEqual(0.9);
    expect(r.scores.brightAcidic).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.spicy).toBeGreaterThanOrEqual(0.6);
    expect(r.scores.carbHeavy ?? 0).toBeLessThanOrEqual(0.2);
    expect(r.tags.proteins).toContain('seafood');
    expect(r.tags.cuisine).toBe('thai');
    expect(r.tags.archetypeId).toBe('tom_yum');
    expect(r.confidence).toBeGreaterThanOrEqual(LEXICON_CONFIDENT);
  });

  it('tags a grilled beef salad as protein-forward and low starch', () => {
    const r = tagItem(kb, { name: 'Grilled Beef Salad (Nam Tok)', description: 'Sliced grilled steak with lime, chili, mint and toasted rice powder' });
    expect(r.tags.proteins).toContain('beef');
    expect(r.scores.proteinForward).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.brightAcidic).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.carbHeavy ?? 0).toBeLessThanOrEqual(0.3);
    expect(r.tags.archetypeId).toBe('thai_beef_salad');
  });

  it('tags a cheeseburger as rich, handheld and bready', () => {
    const r = tagItem(kb, { name: 'Double Cheeseburger', description: 'Two smashed patties, American cheese, pickles, brioche bun' });
    expect(r.scores.handheld).toBe(1);
    expect(r.scores.rich).toBeGreaterThanOrEqual(0.8);
    expect(r.tags.carbs).toContain('bread');
    expect(r.tags.proteins).toContain('beef');
    expect(r.tags.archetypeId).toBe('burger');
  });

  it('returns low confidence for an opaque name', () => {
    const r = tagItem(kb, { name: "Chef's Plate" });
    expect(r.hits).toEqual([]);
    expect(r.confidence).toBe(0);
    expect(r.tags.proteins).toEqual([]);
  });

  it('treats negated words literally but still reads the rest', () => {
    const r = tagItem(kb, { name: 'Pho Ga', description: 'Chicken noodle soup, no spice' });
    expect(r.tags.proteins).toContain('chicken');
    expect(r.scores.brothy).toBeGreaterThanOrEqual(0.9);
  });
});
```

- [ ] **Step 2: Run to verify failure, then fill kb/lexicon.json**

Run: `pnpm vitest run --project core test/core/lexicon.test.ts` — Expected: FAIL (module missing).

Replace `kb/lexicon.json` with:

```json
[
  { "pattern": "\\b(soup|broth|consomm[eé]|stew|caldo|sopa)\\b", "scores": { "brothy": 0.9, "comforting": 0.7, "handheld": 0 } },
  { "pattern": "\\bpho\\b", "cuisine": "vietnamese", "carbs": ["noodles"], "archetypeId": "pho", "scores": { "brothy": 0.95, "comforting": 0.8, "carbHeavy": 0.5, "brightAcidic": 0.5, "portion": 0.6 } },
  { "pattern": "\\bbun bo hue\\b", "cuisine": "vietnamese", "carbs": ["noodles"], "proteins": ["beef", "pork"], "archetypeId": "bun_bo_hue", "scores": { "brothy": 0.95, "spicy": 0.8, "carbHeavy": 0.5 } },
  { "pattern": "\\bbanh mi\\b", "cuisine": "vietnamese", "carbs": ["bread"], "archetypeId": "banh_mi", "scores": { "handheld": 1, "fresh": 0.6, "brightAcidic": 0.6, "crispy": 0.6, "carbHeavy": 0.5 } },
  { "pattern": "\\bramen\\b", "cuisine": "japanese", "carbs": ["noodles"], "archetypeId": "ramen", "scores": { "brothy": 0.95, "rich": 0.8, "comforting": 0.9, "savory": 0.9, "carbHeavy": 0.6, "portion": 0.8 } },
  { "pattern": "\\btom yum\\b", "cuisine": "thai", "archetypeId": "tom_yum", "scores": { "brothy": 0.95, "brightAcidic": 0.9, "spicy": 0.6, "rich": 0.2, "fresh": 0.6, "carbHeavy": 0.1, "portion": 0.4 } },
  { "pattern": "\\btom kha\\b", "cuisine": "thai", "archetypeId": "tom_kha", "scores": { "brothy": 0.9, "rich": 0.6, "brightAcidic": 0.6, "comforting": 0.8, "carbHeavy": 0.1, "portion": 0.4 } },
  { "pattern": "\\b(beef noodle soup|niu rou mian)\\b", "cuisine": "chinese", "proteins": ["beef"], "carbs": ["noodles"], "archetypeId": "beef_noodle_soup", "scores": { "brothy": 0.95, "comforting": 0.9, "savory": 0.9, "rich": 0.5, "carbHeavy": 0.5, "portion": 0.8 } },
  { "pattern": "\\bwonton\\b", "cuisine": "chinese", "archetypeId": "wonton_soup", "scores": { "brothy": 0.9, "comforting": 0.8 } },
  { "pattern": "\\b(yukgaejang|yukgae)\\b", "cuisine": "korean", "proteins": ["beef"], "archetypeId": "yukgaejang", "scores": { "brothy": 0.95, "spicy": 0.8, "comforting": 0.8, "carbHeavy": 0.3 } },
  { "pattern": "\\bpozole\\b", "cuisine": "mexican", "proteins": ["pork"], "archetypeId": "pozole", "scores": { "brothy": 0.9, "comforting": 0.9, "spicy": 0.6, "carbHeavy": 0.4 } },
  { "pattern": "\\bceviche\\b", "cuisine": "mexican", "proteins": ["seafood"], "archetypeId": "ceviche", "scores": { "fresh": 0.95, "brightAcidic": 0.95, "rich": 0.1, "carbHeavy": 0.1, "proteinForward": 0.8, "portion": 0.4, "adventurous": 0.5 } },
  { "pattern": "\\baguachile\\b", "cuisine": "mexican", "proteins": ["seafood"], "archetypeId": "aguachile", "scores": { "fresh": 0.95, "brightAcidic": 0.95, "spicy": 0.85, "rich": 0.05, "carbHeavy": 0.05, "proteinForward": 0.8, "portion": 0.4, "adventurous": 0.7 } },
  { "pattern": "\\bsashimi\\b", "cuisine": "japanese", "proteins": ["seafood"], "archetypeId": "sashimi", "scores": { "fresh": 0.95, "rich": 0.2, "proteinForward": 0.95, "carbHeavy": 0, "portion": 0.4 } },
  { "pattern": "\\b(crudo|tartare)\\b", "proteins": ["seafood"], "scores": { "fresh": 0.9, "rich": 0.3, "proteinForward": 0.8, "carbHeavy": 0.05, "adventurous": 0.5, "portion": 0.3 } },
  { "pattern": "\\bpoke\\b", "cuisine": "hawaiian", "proteins": ["seafood"], "carbs": ["rice"], "archetypeId": "poke", "scores": { "fresh": 0.9, "proteinForward": 0.8, "carbHeavy": 0.5, "rich": 0.3, "portion": 0.5 } },
  { "pattern": "\\b(salad|slaw|greens)\\b", "scores": { "fresh": 0.8, "brightAcidic": 0.5, "rich": 0.2, "carbHeavy": 0.1, "handheld": 0, "portion": 0.5 } },
  { "pattern": "\\b(larb|laab|laap)\\b", "cuisine": "thai", "archetypeId": "larb", "scores": { "brightAcidic": 0.9, "spicy": 0.7, "fresh": 0.7, "proteinForward": 0.9, "carbHeavy": 0.1, "adventurous": 0.6 } },
  { "pattern": "\\b(nam tok|beef salad|yum nua|yum neua)\\b", "cuisine": "thai", "proteins": ["beef"], "archetypeId": "thai_beef_salad", "scores": { "brightAcidic": 0.9, "spicy": 0.6, "savory": 0.9, "proteinForward": 0.9, "carbHeavy": 0.1, "fresh": 0.7, "rich": 0.2 } },
  { "pattern": "\\bfattoush\\b", "cuisine": "middle_eastern", "proteins": ["vegetarian"], "archetypeId": "fattoush", "scores": { "fresh": 0.95, "brightAcidic": 0.9, "crispy": 0.4, "rich": 0.1 } },
  { "pattern": "\\bcaesar\\b", "archetypeId": "caesar_salad", "scores": { "fresh": 0.7, "rich": 0.5, "savory": 0.7, "crispy": 0.4 } },
  { "pattern": "\\b(grilled|char-?grilled|charred|roast(ed)?|rotisserie|wood-?fired)\\b", "scores": { "savory": 0.7, "proteinForward": 0.6, "crispy": 0.3 } },
  { "pattern": "\\b(fried|crispy|crunchy|tempura|katsu|karaage|battered)\\b", "scores": { "crispy": 0.85, "rich": 0.6 } },
  { "pattern": "\\b(burger|cheeseburger|smash ?burger)\\b", "cuisine": "american", "proteins": ["beef"], "carbs": ["bread"], "archetypeId": "burger", "scores": { "handheld": 1, "rich": 0.85, "comforting": 0.85, "savory": 0.9, "carbHeavy": 0.5, "portion": 0.8, "adventurous": 0.05 } },
  { "pattern": "\\bcheesesteak\\b", "cuisine": "american", "proteins": ["beef"], "carbs": ["bread"], "archetypeId": "cheesesteak", "scores": { "handheld": 1, "rich": 0.9, "comforting": 0.9, "savory": 0.9, "carbHeavy": 0.5, "portion": 0.9, "adventurous": 0.05 } },
  { "pattern": "\\b(sandwich|sando|hoagie|sub|melt|club)\\b", "carbs": ["bread"], "scores": { "handheld": 1, "carbHeavy": 0.5, "portion": 0.7 } },
  { "pattern": "\\bfish tacos?\\b", "cuisine": "mexican", "proteins": ["seafood"], "carbs": ["tortillas"], "archetypeId": "fish_tacos", "scores": { "handheld": 0.9, "fresh": 0.6, "crispy": 0.6, "brightAcidic": 0.5, "carbHeavy": 0.4, "portion": 0.5 } },
  { "pattern": "\\btacos?\\b", "cuisine": "mexican", "carbs": ["tortillas"], "archetypeId": "tacos", "scores": { "handheld": 1, "savory": 0.8, "brightAcidic": 0.4, "carbHeavy": 0.4, "portion": 0.5, "adventurous": 0.1 } },
  { "pattern": "\\bburritos?\\b", "cuisine": "mexican", "carbs": ["tortillas", "rice"], "archetypeId": "burrito", "scores": { "handheld": 1, "rich": 0.7, "carbHeavy": 0.8, "comforting": 0.8, "portion": 0.95 } },
  { "pattern": "\\bshawarma\\b", "cuisine": "middle_eastern", "archetypeId": "shawarma_wrap", "scores": { "handheld": 0.8, "savory": 0.85, "brightAcidic": 0.4, "rich": 0.5, "proteinForward": 0.7, "portion": 0.7 } },
  { "pattern": "\\bgyros?\\b", "cuisine": "greek", "carbs": ["bread"], "archetypeId": "gyro", "scores": { "handheld": 1, "savory": 0.85, "rich": 0.5, "carbHeavy": 0.4, "portion": 0.7 } },
  { "pattern": "\\b(wrap|pita|d[öo]ner)\\b", "carbs": ["bread"], "scores": { "handheld": 1, "carbHeavy": 0.4, "portion": 0.7 } },
  { "pattern": "\\b(kebab|kabob|kofta|souvlaki)\\b", "archetypeId": "kebab_plate", "scores": { "savory": 0.9, "proteinForward": 0.9, "rich": 0.4, "portion": 0.8 } },
  { "pattern": "\\b(curry|masala|korma|tikka|saag)\\b", "scores": { "rich": 0.7, "comforting": 0.8, "savory": 0.8, "spicy": 0.5, "carbHeavy": 0.5, "portion": 0.8 } },
  { "pattern": "\\bbutter chicken\\b", "cuisine": "indian", "proteins": ["chicken"], "archetypeId": "butter_chicken", "scores": { "rich": 0.9, "comforting": 0.9, "spicy": 0.3 } },
  { "pattern": "\\bvindaloo\\b", "cuisine": "indian", "archetypeId": "vindaloo", "scores": { "spicy": 0.95, "rich": 0.7 } },
  { "pattern": "\\bchana\\b", "cuisine": "indian", "proteins": ["vegetarian"], "archetypeId": "chana_masala", "scores": { "rich": 0.4, "spicy": 0.5 } },
  { "pattern": "\\b(green curry|red curry|yellow curry|panang|massaman)\\b", "cuisine": "thai", "carbs": ["rice"], "archetypeId": "green_curry", "scores": { "rich": 0.8, "spicy": 0.7, "comforting": 0.7, "carbHeavy": 0.6 } },
  { "pattern": "\\bpad thai\\b", "cuisine": "thai", "carbs": ["noodles"], "archetypeId": "pad_thai", "scores": { "savory": 0.8, "comforting": 0.7, "carbHeavy": 0.8, "portion": 0.7 } },
  { "pattern": "\\b(pad see ew|chow mein|lo mein|noodles?|udon|soba|yakisoba|chow fun|mee goreng)\\b", "carbs": ["noodles"], "scores": { "carbHeavy": 0.75, "comforting": 0.6, "portion": 0.7 } },
  { "pattern": "\\b(rice bowl|fried rice|biryani|donburi|over rice|com tam|rice plate|with rice)\\b", "carbs": ["rice"], "scores": { "carbHeavy": 0.8, "portion": 0.8 } },
  { "pattern": "\\bbibimbap\\b", "cuisine": "korean", "carbs": ["rice"], "archetypeId": "bibimbap", "scores": { "carbHeavy": 0.7, "fresh": 0.5, "savory": 0.7, "portion": 0.7 } },
  { "pattern": "\\bkatsu curry\\b", "cuisine": "japanese", "carbs": ["rice"], "archetypeId": "katsu_curry", "scores": { "rich": 0.85, "comforting": 0.9, "crispy": 0.8, "carbHeavy": 0.8, "portion": 0.9 } },
  { "pattern": "\\b(pizza|margherita|pepperoni|calzone)\\b", "cuisine": "italian", "carbs": ["bread"], "archetypeId": "margherita_pizza", "scores": { "comforting": 0.9, "rich": 0.7, "savory": 0.8, "handheld": 0.6, "carbHeavy": 0.8, "portion": 0.8, "adventurous": 0.05 } },
  { "pattern": "\\b(pasta|spaghetti|rigatoni|lasagna|ragu|bolognese|penne|gnocchi|fettuccine|linguine|carbonara)\\b", "cuisine": "italian", "carbs": ["noodles"], "archetypeId": "pasta_ragu", "scores": { "comforting": 0.9, "rich": 0.75, "savory": 0.85, "carbHeavy": 0.8, "portion": 0.8, "adventurous": 0.05 } },
  { "pattern": "\\b(mapo|ma po)\\b", "cuisine": "chinese", "archetypeId": "mapo_tofu", "scores": { "spicy": 0.9, "rich": 0.6, "savory": 0.9 } },
  { "pattern": "\\b(spicy|chili|chile|jalape[ñn]o|habanero|sriracha|diabla|diablo|hot|picante|szechuan|sichuan|gochujang|kimchi)\\b", "scores": { "spicy": 0.75 } },
  { "pattern": "\\bmild\\b", "scores": { "spicy": 0.1 } },
  { "pattern": "\\b(lime|lemon|citrus|vinegar|pickled|pickles|tamarind|sour|yuzu|vinaigrette|salsa verde|tomatillo)\\b", "scores": { "brightAcidic": 0.75, "fresh": 0.5 } },
  { "pattern": "\\b(cream|creamy|cheese|cheesy|butter|buttery|bacon|pork belly|tonkotsu|loaded|smothered|alfredo|mayo|aioli)\\b", "scores": { "rich": 0.85, "comforting": 0.7 } },
  { "pattern": "\\b(beef|steak|brisket|short rib|oxtail|carne asada|bulgogi|rib-?eye|sirloin|tri-?tip|pastrami)\\b", "proteins": ["beef"], "scores": { "proteinForward": 0.7, "savory": 0.7 } },
  { "pattern": "\\b(chicken|pollo|hen|ga)\\b", "proteins": ["chicken"], "scores": { "proteinForward": 0.6 } },
  { "pattern": "\\b(pork|carnitas|al pastor|char siu|chashu|sausage|chorizo|ham|prosciutto)\\b", "proteins": ["pork"], "scores": { "proteinForward": 0.6 } },
  { "pattern": "\\b(shrimp|prawns?|crab|lobster|clams?|mussels?|scallops?|squid|calamari|octopus|oysters?)\\b", "proteins": ["seafood"], "scores": { "proteinForward": 0.7 } },
  { "pattern": "\\b(fish|salmon|tuna|cod|halibut|snapper|branzino|mahi|tilapia|trout|bass|pescado|camarones)\\b", "proteins": ["seafood"], "scores": { "proteinForward": 0.7 } },
  { "pattern": "\\b(tofu|tempeh|vegetables?|veggie|vegetarian|vegan|paneer|falafel|chickpeas?|lentils?|mushrooms?)\\b", "proteins": ["vegetarian"], "scores": {} },
  { "pattern": "\\b(bread|baguette|bun|naan|roti|flatbread|focaccia|ciabatta|brioche)\\b", "carbs": ["bread"], "scores": { "carbHeavy": 0.5 } },
  { "pattern": "\\btortillas?\\b", "carbs": ["tortillas"], "scores": { "carbHeavy": 0.4 } },
  { "pattern": "\\b(platter|family|feast|combo|xl|large|double|half chicken|whole chicken)\\b", "scores": { "portion": 0.9 } },
  { "pattern": "\\b(small|side|appetizer|starter|half order|cup)\\b", "scores": { "portion": 0.3 } }
]
```

- [ ] **Step 3: Implement lexicon.ts**

```ts
import type { KnowledgeBase } from './kb/schema';
import type { ItemTags, ScoreKey, Scores } from './types';

export interface TagResult {
  scores: Scores;
  tags: ItemTags;
  confidence: number;
  hits: string[];
}

export const LEXICON_CONFIDENT = 0.6;

const regexCache = new Map<string, RegExp>();
function regex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'i');
    regexCache.set(pattern, re);
  }
  return re;
}

export function tagItem(kb: KnowledgeBase, item: { name: string; description?: string }): TagResult {
  const text = `${item.name} ${item.description ?? ''}`.toLowerCase();
  const scores: Scores = {};
  const proteins = new Set<string>();
  const carbs = new Set<string>();
  const formats = new Set<string>();
  let cuisine: string | undefined;
  let archetypeId: string | undefined;
  const hits: string[] = [];

  for (const entry of kb.lexicon) {
    if (!regex(entry.pattern).test(text)) continue;
    hits.push(entry.pattern);
    for (const [key, value] of Object.entries(entry.scores) as [ScoreKey, number][]) {
      const current = scores[key];
      // Specific entries (those naming an archetype) win over generic ones; otherwise take the max.
      scores[key] = entry.archetypeId && current !== undefined ? value : Math.max(current ?? 0, value);
    }
    for (const p of entry.proteins) proteins.add(p);
    for (const c of entry.carbs) carbs.add(c);
    for (const f of entry.formats) formats.add(f);
    cuisine ??= entry.cuisine;
    archetypeId ??= entry.archetypeId;
  }

  if (carbs.size > 0 && scores.carbHeavy === undefined) scores.carbHeavy = 0.6;
  if (carbs.size === 0 && scores.carbHeavy === undefined && hits.length > 0) scores.carbHeavy = 0.2;

  const breadth = Object.keys(scores).length;
  const confidence = hits.length === 0 ? 0 : Math.min(1, hits.length / 3) * (breadth >= 4 ? 1 : 0.6);

  return {
    scores,
    tags: { proteins: [...proteins], carbs: [...carbs], formats: [...formats], cuisine, archetypeId },
    confidence,
    hits,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project core test/core/lexicon.test.ts test/core/kb-loader.test.ts`
Expected: PASS. If the tom yum spicy assertion fails, the word "hot" must be matched by the spicy entry; if the beef salad `carbHeavy` fails, the toasted rice powder phrase must not match the rice entry (the pattern uses `with rice`, `rice bowl` and similar phrases, not bare `rice`).

- [ ] **Step 5: Commit**

```bash
git add src/core/lexicon.ts kb/lexicon.json test/core/lexicon.test.ts
git commit -m "Add keyword lexicon and item tagger"
```

---

### Task 10: Item scoring with trace

**Files:**
- Create: `src/core/scoring.ts`
- Test: `test/core/scoring.test.ts`

**Interfaces:**
- Consumes: `alignQualities`, `desiredVector`, `proteinMatch`, `cuisineAffinity`, `isExcluded`, `MenuItem`, `RestaurantSummary`, `KnowledgeBase`.
- Produces: `WEIGHTS`, `PENALTIES`, `ScoreTrace`, `ScoredItem`, `ScoringContext`, `hardFilterReason(item, restaurant, prefs, ctx)`, `scoreItem(item, restaurant, prefs, ctx)`, `restaurantQuality(restaurant)`, `similarity(a, b)`.

- [ ] **Step 1: Write the failing tests**

`test/core/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { hardFilterReason, restaurantQuality, scoreItem, similarity } from '../../src/core/scoring';
import type { MenuItem, RestaurantSummary } from '../../src/core/types';

const kb = loadBaseKb();
const ctx = { kb };

const phoHouse: RestaurantSummary = { placeId: 'r1', name: 'Pho House', cuisine: 'vietnamese', rating: 4.5, userRatingCount: 800, openNow: true };
const burgerBarn: RestaurantSummary = { placeId: 'r2', name: 'Burger Barn', cuisine: 'american', rating: 4.5, userRatingCount: 800, openNow: true };

const pho: MenuItem = {
  id: 'pho', placeId: 'r1', name: 'Pho Tai', description: 'Rare beef noodle soup', priceCents: 1600,
  scores: { brothy: 0.95, comforting: 0.8, rich: 0.3, spicy: 0.3, brightAcidic: 0.5, savory: 0.8, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.6 },
  tags: { proteins: ['beef'], carbs: ['noodles'], cuisine: 'vietnamese', formats: ['bowl'], archetypeId: 'pho' },
};
const burger: MenuItem = {
  id: 'burger', placeId: 'r2', name: 'Double Cheeseburger', priceCents: 1500,
  scores: { rich: 0.9, comforting: 0.9, handheld: 1, savory: 0.9, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.05, portion: 0.8, brothy: 0 },
  tags: { proteins: ['beef'], carbs: ['bread'], cuisine: 'american', formats: ['sandwich'], archetypeId: 'burger' },
};

const comfortBrothBeefNotHeavy = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.comforting', value: 0.8 },
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'heaviness', value: -0.5 },
  { path: 'proteins.beef', value: 1 },
]);

describe('scoreItem', () => {
  it('prefers pho to a burger for comfort, broth, beef, not heavy', () => {
    const a = scoreItem(pho, phoHouse, comfortBrothBeefNotHeavy, ctx)!;
    const b = scoreItem(burger, burgerBarn, comfortBrothBeefNotHeavy, ctx)!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.trace.positiveSignals.brothy).toBeGreaterThanOrEqual(0.9);
    expect(a.trace.positiveSignals.protein).toBe(1);
    expect(b.trace.penalties.tooRich).toBeGreaterThan(0);
    expect(a.trace.penalties.tooRich).toBeUndefined();
  });

  it('penalises starch-heavy dishes when starch should stay on the side', () => {
    const prefs = applyEffects(emptyPreferences(), [{ path: 'carbs.starchAsMain', value: -1 }]);
    const riceBowl: MenuItem = { ...burger, id: 'bowl', name: 'Rice bowl', scores: { ...burger.scores, carbHeavy: 0.85 }, tags: { ...burger.tags, carbs: ['rice'] } };
    expect(scoreItem(riceBowl, burgerBarn, prefs, ctx)!.trace.penalties.tooStarchy).toBeGreaterThan(0);
  });

  it('penalises a specific carb the user turned down', () => {
    const prefs = applyEffects(emptyPreferences(), [{ path: 'carbs.noodles', value: -1 }]);
    expect(scoreItem(pho, phoHouse, prefs, ctx)!.trace.penalties.avoid_noodles).toBeGreaterThan(0);
  });

  it('penalises cuisines eaten recently or planned soon', () => {
    const recent = applyEffects(emptyPreferences(), [{ path: 'recentMeals', value: 'vietnamese' }]);
    const planned = applyEffects(emptyPreferences(), [{ path: 'futureMeals', value: 'pho' }]);
    expect(scoreItem(pho, phoHouse, recent, ctx)!.trace.penalties.repeatedCuisine).toBeGreaterThan(0);
    expect(scoreItem(pho, phoHouse, planned, ctx)!.trace.penalties.repeatedCuisine).toBeGreaterThan(0);
  });

  it('discounts menuless placeholders', () => {
    const placeholder: MenuItem = { ...pho, id: 'ph', menuless: true };
    expect(scoreItem(placeholder, phoHouse, comfortBrothBeefNotHeavy, ctx)!.score).toBeLessThan(scoreItem(pho, phoHouse, comfortBrothBeefNotHeavy, ctx)!.score);
  });

  it('returns a result for empty preferences', () => {
    const r = scoreItem(pho, phoHouse, emptyPreferences(), ctx);
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThan(0);
  });
});

describe('hardFilterReason', () => {
  it('filters excluded cuisines, words and formats', () => {
    const noViet = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'vietnamese' }]);
    const noFried = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'fried' }]);
    expect(hardFilterReason(pho, phoHouse, noViet, ctx)).toBe('excluded');
    expect(hardFilterReason({ ...burger, name: 'Fried Chicken Sandwich' }, burgerBarn, noFried, ctx)).toBe('excluded');
    expect(hardFilterReason(burger, burgerBarn, noViet, ctx)).toBeNull();
  });

  it('filters over-budget items unless the budget is flexible', () => {
    const tight = applyEffects(emptyPreferences(), [{ path: 'budget.max', value: 12 }]);
    const flexible = applyEffects(tight, [{ path: 'budget.flexible', value: 1 }]);
    expect(hardFilterReason(pho, phoHouse, tight, ctx)).toBe('over_budget');
    expect(hardFilterReason(pho, phoHouse, flexible, ctx)).toBeNull();
  });

  it('filters rejected items', () => {
    expect(hardFilterReason(pho, phoHouse, emptyPreferences(), { kb, rejectedItemIds: new Set(['pho']) })).toBe('rejected');
  });
});

describe('restaurantQuality and similarity', () => {
  it('shrinks toward neutral with few ratings and drops when closed', () => {
    expect(restaurantQuality({ placeId: 'x', name: 'x' })).toBe(0.5);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 1000 })).toBeCloseTo(1);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 10 })).toBeLessThan(0.6);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 1000, openNow: false })).toBeLessThan(0.8);
  });

  it('measures score-vector similarity on shared keys', () => {
    expect(similarity({ brothy: 1, rich: 0.2 }, { brothy: 1, rich: 0.2 })).toBe(1);
    expect(similarity({ brothy: 1 }, { brothy: 0 })).toBe(0);
    expect(similarity({ brothy: 1 }, { rich: 1 })).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement scoring.ts**

Run: `pnpm vitest run --project core test/core/scoring.test.ts` — Expected: FAIL (module missing).

```ts
import { alignQualities } from './alignment';
import type { KnowledgeBase } from './kb/schema';
import { cuisineAffinity, desiredVector, isExcluded, proteinMatch } from './planner';
import type { DinnerPreferences, Hunger } from './preferences';
import type { MenuItem, RestaurantSummary, Scores } from './types';

export const WEIGHTS = { qualities: 0.45, protein: 0.2, cuisine: 0.1, restaurant: 0.1, portion: 0.05, archetype: 0.1 } as const;
export const PENALTIES = { tooRich: 0.25, tooStarchy: 0.25, tooSpicy: 0.2, repeatedCuisine: 0.2, carbAvoid: 0.15, menuless: 0.2 } as const;

const HUNGER_PORTION: Record<Hunger, number> = { light: 0.35, normal: 0.6, very_hungry: 0.85 };

export interface ScoreTrace {
  total: number;
  components: Record<string, number>;
  positiveSignals: Record<string, number>;
  penalties: Record<string, number>;
}

export interface ScoredItem {
  item: MenuItem;
  restaurant: RestaurantSummary;
  score: number;
  trace: ScoreTrace;
}

export interface ScoringContext {
  kb: KnowledgeBase;
  rejectedItemIds?: ReadonlySet<string>;
}

export type FilterReason = 'rejected' | 'excluded' | 'over_budget';

export function hardFilterReason(item: MenuItem, restaurant: RestaurantSummary, prefs: DinnerPreferences, ctx: ScoringContext): FilterReason | null {
  if (ctx.rejectedItemIds?.has(item.id)) return 'rejected';
  const words = [
    ...item.name.toLowerCase().split(/[^a-z]+/),
    ...(item.description ?? '').toLowerCase().split(/[^a-z]+/),
    item.tags.cuisine,
    restaurant.cuisine,
    item.tags.archetypeId,
    ...item.tags.proteins,
    ...item.tags.formats,
    ...item.tags.carbs,
  ];
  if (isExcluded(prefs, words)) return 'excluded';
  if (prefs.budget.max !== undefined && !prefs.budget.flexible && item.priceCents !== undefined && item.priceCents > prefs.budget.max * 100) {
    return 'over_budget';
  }
  return null;
}

export function restaurantQuality(r: RestaurantSummary): number {
  let q = 0.5;
  if (r.rating !== undefined) {
    const confidence = Math.min(1, (r.userRatingCount ?? 0) / 200);
    const normalized = Math.max(0, Math.min(1, (r.rating - 3) / 2));
    q = 0.5 + (normalized - 0.5) * confidence;
  }
  if (r.openNow === false) q -= 0.3;
  return Math.max(0, Math.min(1, q));
}

/** Mean closeness over keys both vectors define; 0.5 when they share none. */
export function similarity(a: Scores, b: Scores): number {
  let sum = 0;
  let n = 0;
  for (const [key, av] of Object.entries(a) as [keyof Scores, number][]) {
    const bv = b[key];
    if (bv === undefined) continue;
    sum += 1 - Math.abs(av - bv);
    n++;
  }
  return n === 0 ? 0.5 : sum / n;
}

function archetypeAffinity(kb: KnowledgeBase, prefs: DinnerPreferences, item: MenuItem): number {
  const liked = Object.entries(prefs.archetypes).filter(([, w]) => w > 0);
  if (liked.length === 0) return 0.5;
  let best = 0;
  for (const [id, w] of liked) {
    if (item.tags.archetypeId === id) return w;
    const a = kb.archetypes.find((x) => x.id === id);
    if (a && item.tags.cuisine === a.cuisine) best = Math.max(best, w * similarity(a.scores, item.scores));
  }
  return best;
}

export function scoreItem(item: MenuItem, restaurant: RestaurantSummary, prefs: DinnerPreferences, ctx: ScoringContext): ScoredItem | null {
  if (hardFilterReason(item, restaurant, prefs, ctx)) return null;

  const desired = desiredVector(prefs);
  const align = alignQualities(desired, item.scores);
  const components: Record<string, number> = {};
  const positiveSignals: Record<string, number> = {};
  const penalties: Record<string, number> = {};

  components.qualities = WEIGHTS.qualities * align.score;
  for (const [key, met] of Object.entries(align.signals)) if (met >= 0.6) positiveSignals[key] = met;

  const protein = proteinMatch(prefs, item.tags.proteins);
  components.protein = WEIGHTS.protein * (protein ?? 0.5);
  if (protein && protein > 0) positiveSignals.protein = protein;

  const cuisine = item.tags.cuisine ?? restaurant.cuisine;
  components.cuisine = WEIGHTS.cuisine * ((cuisineAffinity(prefs, cuisine) + 1) / 2);
  components.restaurant = WEIGHTS.restaurant * restaurantQuality(restaurant);

  const target = HUNGER_PORTION[prefs.hunger ?? 'normal'];
  const portion = item.scores.portion ?? 0.6;
  components.portion = WEIGHTS.portion * (1 - Math.min(1, Math.abs(portion - target) * 2));

  components.archetype = WEIGHTS.archetype * archetypeAffinity(ctx.kb, prefs, item);

  if ((prefs.heaviness ?? 0) <= -0.5 && (item.scores.rich ?? 0) >= 0.7) penalties.tooRich = PENALTIES.tooRich;
  if ((prefs.carbs.starchAsMain ?? 0) <= -0.5 && (item.scores.carbHeavy ?? 0) >= 0.7) penalties.tooStarchy = PENALTIES.tooStarchy;
  if ((desired.spicy ?? 0) <= -0.5 && (item.scores.spicy ?? 0) >= 0.7) penalties.tooSpicy = PENALTIES.tooSpicy;
  for (const carb of item.tags.carbs) {
    const w = prefs.carbs[carb as keyof typeof prefs.carbs];
    if (w !== undefined && w < 0) penalties[`avoid_${carb}`] = PENALTIES.carbAvoid * -w;
  }
  const repeats = [...prefs.recentMeals, ...prefs.futureMeals];
  if ((cuisine && repeats.includes(cuisine)) || (item.tags.archetypeId && repeats.includes(item.tags.archetypeId))) {
    penalties.repeatedCuisine = PENALTIES.repeatedCuisine;
  }
  if (item.menuless) penalties.menuless = PENALTIES.menuless;

  const positive = Object.values(components).reduce((s, v) => s + v, 0);
  const negative = Object.values(penalties).reduce((s, v) => s + v, 0);
  const total = positive - negative;
  return { item, restaurant, score: total, trace: { total, components, positiveSignals, penalties } };
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run --project core test/core/scoring.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/scoring.ts test/core/scoring.test.ts
git commit -m "Add deterministic item scoring with trace"
```

---

### Task 11: Pairs, recommendation and the menu-less fallback

**Files:**
- Create: `src/core/pairs.ts`, `src/core/fallback.ts`
- Test: `test/core/pairs.test.ts`

**Interfaces:**
- Consumes: `scoreItem`, `WEIGHTS`, `ScoredItem`, `ScoreTrace`, `ScoringContext`, `alignQualities`, `desiredVector`, `rankArchetypes`.
- Produces: `PAIR` constants, `Recommendation { kind, restaurant, items, score, trace, menuless }`, `RestaurantCandidatesInput { restaurant, items }`, `combineScores(a, b)`, `composePair(a, b, prefs, ctx)`, `rankCandidates(candidates, prefs, ctx)`, `RecommendResult { primary, runnerUp, ranked }`, `recommend(candidates, prefs, ctx)`; `menulessItems(kb, restaurant, prefs)`, `withMenulessFallback(kb, candidates, prefs)`.

- [ ] **Step 1: Write the failing tests**

`test/core/pairs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { withMenulessFallback } from '../../src/core/fallback';
import { loadBaseKb } from '../../src/core/kb';
import { composePair, recommend } from '../../src/core/pairs';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { scoreItem } from '../../src/core/scoring';
import type { MenuItem, RestaurantSummary } from '../../src/core/types';

const kb = loadBaseKb();
const ctx = { kb };

const siam: RestaurantSummary = { placeId: 'siam', name: 'Siam Kitchen', cuisine: 'thai', rating: 4.5, userRatingCount: 1000, openNow: true };
const tomYum: MenuItem = {
  id: 'tomyum', placeId: 'siam', name: 'Tom Yum Shrimp', priceCents: 1400,
  scores: { brothy: 0.95, spicy: 0.6, brightAcidic: 0.9, rich: 0.2, fresh: 0.6, savory: 0.7, proteinForward: 0.7, carbHeavy: 0.1, comforting: 0.6, portion: 0.4 },
  tags: { proteins: ['seafood'], carbs: [], cuisine: 'thai', formats: ['bowl'], archetypeId: 'tom_yum' },
};
const beefSalad: MenuItem = {
  id: 'beefsalad', placeId: 'siam', name: 'Grilled Beef Salad', priceCents: 1700,
  scores: { brightAcidic: 0.9, spicy: 0.6, savory: 0.9, fresh: 0.7, rich: 0.2, proteinForward: 0.9, carbHeavy: 0.1, brothy: 0, comforting: 0.4, portion: 0.5 },
  tags: { proteins: ['beef'], carbs: [], cuisine: 'thai', formats: ['plate'], archetypeId: 'thai_beef_salad' },
};
const greenCurry: MenuItem = {
  id: 'curry', placeId: 'siam', name: 'Green Curry', priceCents: 1600,
  scores: { rich: 0.8, spicy: 0.7, comforting: 0.7, savory: 0.8, carbHeavy: 0.6, brothy: 0.3, portion: 0.7 },
  tags: { proteins: ['chicken'], carbs: ['rice'], cuisine: 'thai', formats: ['plate'], archetypeId: 'green_curry' },
};
const padSeeEw: MenuItem = {
  id: 'padseeew', placeId: 'siam', name: 'Pad See Ew', priceCents: 1500,
  scores: { rich: 0.6, savory: 0.8, comforting: 0.7, carbHeavy: 0.85, brothy: 0, portion: 0.7 },
  tags: { proteins: ['chicken'], carbs: ['noodles'], cuisine: 'thai', formats: ['plate'], archetypeId: 'pad_thai' },
};

const phoHouse: RestaurantSummary = { placeId: 'pho', name: 'Pho House', cuisine: 'vietnamese', rating: 4.4, userRatingCount: 900, openNow: true };
const pho: MenuItem = {
  id: 'pho', placeId: 'pho', name: 'Pho Tai', priceCents: 1600,
  scores: { brothy: 0.95, comforting: 0.8, rich: 0.3, spicy: 0.3, brightAcidic: 0.5, savory: 0.8, proteinForward: 0.6, carbHeavy: 0.5, portion: 0.6 },
  tags: { proteins: ['beef'], carbs: ['noodles'], cuisine: 'vietnamese', formats: ['bowl'], archetypeId: 'pho' },
};

const candidates = [
  { restaurant: siam, items: [tomYum, beefSalad, greenCurry, padSeeEw] },
  { restaurant: phoHouse, items: [pho] },
];

const brothBeefBright = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'desiredQualities.brightAcidic', value: 1 },
  { path: 'proteins.beef', value: 1 },
  { path: 'heaviness', value: -0.5 },
  { path: 'carbs.starchAsMain', value: -0.5 },
]);

describe('composePair', () => {
  it('builds a pair that covers more of the profile than either dish', () => {
    const a = scoreItem(tomYum, siam, brothBeefBright, ctx)!;
    const b = scoreItem(beefSalad, siam, brothBeefBright, ctx)!;
    const pair = composePair(a, b, brothBeefBright, ctx)!;
    expect(pair.kind).toBe('pair');
    expect(pair.items.map((i) => i.id)).toEqual(['tomyum', 'beefsalad']);
    expect(pair.score).toBeGreaterThan(Math.max(a.score, b.score));
    expect(pair.trace.positiveSignals.brothy).toBeGreaterThanOrEqual(0.9);
    expect(pair.trace.positiveSignals.protein).toBe(1);
  });

  it('penalises two heavy or two starchy dishes', () => {
    const prefs = emptyPreferences();
    const a = scoreItem(greenCurry, siam, prefs, ctx)!;
    const b = scoreItem(padSeeEw, siam, prefs, ctx)!;
    const pair = composePair(a, b, prefs, ctx)!;
    expect(pair.trace.penalties.bothHeavy).toBeGreaterThan(0);
    expect(pair.trace.penalties.bothStarchy).toBeGreaterThan(0);
  });

  it('refuses pairs that break a firm budget or cross restaurants', () => {
    const tight = applyEffects(brothBeefBright, [{ path: 'budget.max', value: 20 }]);
    const a = scoreItem(tomYum, siam, tight, ctx)!;
    const b = scoreItem(beefSalad, siam, tight, ctx)!;
    expect(composePair(a, b, tight, ctx)).toBeNull();
    const c = scoreItem(pho, phoHouse, brothBeefBright, ctx)!;
    expect(composePair(a, c, brothBeefBright, ctx)).toBeNull();
  });

  it('penalises too much food for a light appetite', () => {
    const light = applyEffects(emptyPreferences(), [{ path: 'hunger', value: 'light' }]);
    const a = scoreItem(greenCurry, siam, light, ctx)!;
    const b = scoreItem(padSeeEw, siam, light, ctx)!;
    expect(composePair(a, b, light, ctx)!.trace.penalties.tooMuch).toBeGreaterThan(0);
  });
});

describe('recommend', () => {
  it('picks the tom yum and beef salad pair and a runner-up from another restaurant', () => {
    const { primary, runnerUp } = recommend(candidates, brothBeefBright, ctx);
    expect(primary?.kind).toBe('pair');
    expect(primary?.items.map((i) => i.id).sort()).toEqual(['beefsalad', 'tomyum']);
    expect(runnerUp?.restaurant.placeId).toBe('pho');
  });

  it('returns a primary for empty preferences and null for no candidates', () => {
    expect(recommend(candidates, emptyPreferences(), ctx).primary).not.toBeNull();
    expect(recommend([], emptyPreferences(), ctx).primary).toBeNull();
  });

  it('never repeats rejected items', () => {
    const { primary } = recommend(candidates, brothBeefBright, { kb, rejectedItemIds: new Set(['tomyum', 'beefsalad']) });
    expect(primary?.items.map((i) => i.id)).not.toContain('tomyum');
    expect(primary?.items.map((i) => i.id)).not.toContain('beefsalad');
  });
});

describe('withMenulessFallback', () => {
  it('gives a menu-less restaurant a placeholder from its cuisine, ranked below real dishes', () => {
    const larbHouse: RestaurantSummary = { placeId: 'larb', name: 'Larb House', cuisine: 'thai', rating: 4.8, userRatingCount: 300, openNow: true };
    const filled = withMenulessFallback(kb, [...candidates, { restaurant: larbHouse, items: [] }], brothBeefBright);
    const larb = filled.find((c) => c.restaurant.placeId === 'larb')!;
    expect(larb.items).toHaveLength(1);
    expect(larb.items[0]!.menuless).toBe(true);
    expect(larb.items[0]!.tags.cuisine).toBe('thai');
    const { ranked } = recommend(filled, brothBeefBright, ctx);
    expect(ranked[0]!.menuless).toBe(false);
    expect(ranked.some((r) => r.menuless)).toBe(true);
  });

  it('leaves restaurants without a matching archetype empty', () => {
    const mystery: RestaurantSummary = { placeId: 'm', name: 'Mystery', cuisine: 'martian' };
    expect(withMenulessFallback(kb, [{ restaurant: mystery, items: [] }], emptyPreferences())[0]!.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement pairs.ts and fallback.ts**

Run: `pnpm vitest run --project core test/core/pairs.test.ts` — Expected: FAIL (modules missing).

`src/core/pairs.ts`:

```ts
import { alignQualities } from './alignment';
import { desiredVector } from './planner';
import type { DinnerPreferences, Hunger } from './preferences';
import { scoreItem, WEIGHTS, type ScoredItem, type ScoreTrace, type ScoringContext } from './scoring';
import type { MenuItem, RestaurantSummary, ScoreKey, Scores } from './types';

export const PAIR = {
  topPerRestaurant: 4,
  margin: 0.05,
  bothHeavy: 0.2,
  bothStarchy: 0.2,
  sameDominant: 0.1,
  tooMuch: 0.2,
  portionCap: { light: 0.8, normal: 1.3, very_hungry: 1.8 } as Record<Hunger, number>,
} as const;

export interface Recommendation {
  kind: 'single' | 'pair';
  restaurant: RestaurantSummary;
  items: MenuItem[];
  score: number;
  trace: ScoreTrace;
  menuless: boolean;
}

export interface RestaurantCandidatesInput {
  restaurant: RestaurantSummary;
  items: MenuItem[];
}

const FLAVOR_KEYS: ScoreKey[] = ['brothy', 'spicy', 'rich', 'fresh', 'brightAcidic', 'crispy', 'savory', 'comforting'];

export function combineScores(a: Scores, b: Scores): Scores {
  const out: Scores = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<ScoreKey>) {
    const av = a[key];
    const bv = b[key];
    out[key] = av === undefined ? bv : bv === undefined ? av : Math.max(av, bv);
  }
  return out;
}

function dominant(scores: Scores): { key: ScoreKey; value: number } | null {
  let best: { key: ScoreKey; value: number } | null = null;
  for (const key of FLAVOR_KEYS) {
    const v = scores[key];
    if (v !== undefined && (!best || v > best.value)) best = { key, value: v };
  }
  return best;
}

function single(s: ScoredItem): Recommendation {
  return { kind: 'single', restaurant: s.restaurant, items: [s.item], score: s.score, trace: s.trace, menuless: !!s.item.menuless };
}

export function composePair(a: ScoredItem, b: ScoredItem, prefs: DinnerPreferences, _ctx: ScoringContext): Recommendation | null {
  if (a.restaurant.placeId !== b.restaurant.placeId) return null;
  if (a.item.menuless || b.item.menuless) return null;
  const total = (a.item.priceCents ?? 0) + (b.item.priceCents ?? 0);
  if (prefs.budget.max !== undefined && !prefs.budget.flexible && total > prefs.budget.max * 100) return null;

  const coverage = alignQualities(desiredVector(prefs), combineScores(a.item.scores, b.item.scores));
  const components: Record<string, number> = { qualities: WEIGHTS.qualities * coverage.score };
  for (const key of Object.keys(a.trace.components)) {
    if (key === 'qualities') continue;
    components[key] = ((a.trace.components[key] ?? 0) + (b.trace.components[key] ?? 0)) / 2;
  }
  if (a.trace.positiveSignals.protein || b.trace.positiveSignals.protein) {
    components.protein = WEIGHTS.protein * Math.max(a.trace.positiveSignals.protein ?? 0, b.trace.positiveSignals.protein ?? 0);
  }

  const penalties: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.trace.penalties)) penalties[k] = v;
  for (const [k, v] of Object.entries(b.trace.penalties)) penalties[k] = Math.max(penalties[k] ?? 0, v);
  if ((a.item.scores.rich ?? 0) >= 0.6 && (b.item.scores.rich ?? 0) >= 0.6) penalties.bothHeavy = PAIR.bothHeavy;
  if ((a.item.scores.carbHeavy ?? 0) >= 0.6 && (b.item.scores.carbHeavy ?? 0) >= 0.6) penalties.bothStarchy = PAIR.bothStarchy;
  const da = dominant(a.item.scores);
  const db = dominant(b.item.scores);
  if (da && db && da.key === db.key && da.value > 0.7 && db.value > 0.7) penalties.sameDominant = PAIR.sameDominant;
  const portion = (a.item.scores.portion ?? 0.6) + (b.item.scores.portion ?? 0.6);
  if (portion > PAIR.portionCap[prefs.hunger ?? 'normal']) penalties.tooMuch = PAIR.tooMuch;

  const positiveSignals: Record<string, number> = {};
  for (const [key, met] of Object.entries(coverage.signals)) if (met >= 0.6) positiveSignals[key] = met;
  const protein = Math.max(a.trace.positiveSignals.protein ?? 0, b.trace.positiveSignals.protein ?? 0);
  if (protein > 0) positiveSignals.protein = protein;

  const score = Object.values(components).reduce((s, v) => s + v, 0) - Object.values(penalties).reduce((s, v) => s + v, 0);
  return {
    kind: 'pair',
    restaurant: a.restaurant,
    items: [a.item, b.item],
    score,
    trace: { total: score, components, positiveSignals, penalties },
    menuless: false,
  };
}

export function rankCandidates(candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences, ctx: ScoringContext): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const { restaurant, items } of candidates) {
    const scored = items
      .map((item) => scoreItem(item, restaurant, prefs, ctx))
      .filter((s): s is ScoredItem => s !== null)
      .sort((x, y) => y.score - x.score);
    for (const s of scored) recs.push(single(s));
    const top = scored.filter((s) => !s.item.menuless).slice(0, PAIR.topPerRestaurant);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const pair = composePair(top[i]!, top[j]!, prefs, ctx);
        if (pair && pair.score > Math.max(top[i]!.score, top[j]!.score) + PAIR.margin) recs.push(pair);
      }
    }
  }
  return recs.sort((x, y) => y.score - x.score);
}

export interface RecommendResult {
  primary: Recommendation | null;
  runnerUp: Recommendation | null;
  ranked: Recommendation[];
}

function sharesItems(a: Recommendation, b: Recommendation): boolean {
  const ids = new Set(a.items.map((i) => i.id));
  return b.items.some((i) => ids.has(i.id));
}

export function recommend(candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences, ctx: ScoringContext): RecommendResult {
  const ranked = rankCandidates(candidates, prefs, ctx);
  const primary = ranked[0] ?? null;
  if (!primary) return { primary: null, runnerUp: null, ranked };
  const runnerUp =
    ranked.find((r) => r.restaurant.placeId !== primary.restaurant.placeId && !sharesItems(r, primary)) ??
    ranked.find((r) => r !== primary && !sharesItems(r, primary)) ??
    null;
  return { primary, runnerUp, ranked };
}
```

`src/core/fallback.ts`:

```ts
import type { KnowledgeBase } from './kb/schema';
import type { RestaurantCandidatesInput } from './pairs';
import { rankArchetypes } from './planner';
import type { DinnerPreferences } from './preferences';
import type { MenuItem, RestaurantSummary } from './types';

/** A placeholder "dish" for a restaurant whose menu has not been read: its cuisine's best-matching archetype. */
export function menulessItems(kb: KnowledgeBase, restaurant: RestaurantSummary, prefs: DinnerPreferences): MenuItem[] {
  if (!restaurant.cuisine) return [];
  const best = rankArchetypes(kb, prefs).find((r) => r.archetype.cuisine === restaurant.cuisine);
  if (!best) return [];
  const a = best.archetype;
  return [
    {
      id: `menuless:${restaurant.placeId}:${a.id}`,
      placeId: restaurant.placeId,
      name: a.label,
      scores: a.scores,
      tags: { proteins: a.proteins, carbs: a.carbs, formats: a.formats, cuisine: a.cuisine, archetypeId: a.id },
      menuless: true,
    },
  ];
}

export function withMenulessFallback(kb: KnowledgeBase, candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences): RestaurantCandidatesInput[] {
  return candidates.map((c) => (c.items.length > 0 ? c : { ...c, items: menulessItems(kb, c.restaurant, prefs) }));
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run --project core test/core/pairs.test.ts`
Expected: PASS. If the pair does not beat the singles, check that `composePair` is taking the max protein signal rather than the average: the beef salad supplies the beef, the soup supplies the broth, and the pair must get credit for both.

- [ ] **Step 4: Commit**

```bash
git add src/core/pairs.ts src/core/fallback.ts test/core/pairs.test.ts
git commit -m "Add pair composition, recommendation ranking and menu-less fallback"
```

---

### Task 12: Explanation templates and feedback edits

**Files:**
- Create: `src/core/explain.ts`, `src/core/feedback.ts`
- Test: `test/core/explain.test.ts`, `test/core/feedback.test.ts`

**Interfaces:**
- Consumes: `Recommendation`, `DinnerPreferences`.
- Produces: `explain(rec, prefs, runnerUp?) -> string`, `joinNatural(parts)`; `FEEDBACK_REASONS`, `FeedbackReason`, `FEEDBACK_LABELS`, `applyFeedback(prefs, reason, shown)`.

- [ ] **Step 1: Write the failing tests**

`test/core/explain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { explain, joinNatural } from '../../src/core/explain';
import type { Recommendation } from '../../src/core/pairs';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const siam = { placeId: 'siam', name: 'Siam Kitchen', cuisine: 'thai' };
const pair: Recommendation = {
  kind: 'pair',
  restaurant: siam,
  items: [
    { id: 'a', placeId: 'siam', name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass', priceCents: 1400, scores: { brothy: 0.95, rich: 0.2, carbHeavy: 0.1 }, tags: { proteins: ['seafood'], carbs: [], formats: [], cuisine: 'thai' } },
    { id: 'b', placeId: 'siam', name: 'Grilled Beef Salad', priceCents: 1700, scores: { brightAcidic: 0.9, rich: 0.2, carbHeavy: 0.1 }, tags: { proteins: ['beef'], carbs: [], formats: [], cuisine: 'thai' } },
  ],
  score: 0.8,
  trace: { total: 0.8, components: {}, positiveSignals: { brothy: 0.95, brightAcidic: 0.9, protein: 1, spicy: 0.6 }, penalties: {} },
  menuless: false,
};
const runnerUp: Recommendation = {
  kind: 'single',
  restaurant: { placeId: 'pho', name: 'Pho House', cuisine: 'vietnamese' },
  items: [{ id: 'c', placeId: 'pho', name: 'Pho Tai', priceCents: 1600, scores: { brothy: 0.95, rich: 0.3 }, tags: { proteins: ['beef'], carbs: ['noodles'], formats: [], cuisine: 'vietnamese' } }],
  score: 0.7,
  trace: { total: 0.7, components: {}, positiveSignals: { brothy: 0.95 }, penalties: { repeatedCuisine: 0.2 } },
  menuless: false,
};
const prefs = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: -0.5 }, { path: 'carbs.starchAsMain', value: -0.5 }]);

describe('explain', () => {
  it('names the dishes and restaurant, cites top signals, and notes what was avoided', () => {
    const text = explain(pair, prefs);
    expect(text).toMatch(/^Tom Yum Shrimp plus Grilled Beef Salad at Siam Kitchen\./);
    expect(text).toMatch(/broth/);
    expect(text).toMatch(/bright/);
    expect(text).toMatch(/protein/);
    expect(text).toMatch(/without getting heavy/);
    expect(text).toMatch(/without a big rice or noodle base/);
  });

  it('quotes the menu description verbatim and nothing else about ingredients', () => {
    const text = explain(pair, prefs);
    expect(text).toContain('"Hot and sour soup with lemongrass"');
    expect(text).not.toMatch(/shrimp paste|galangal|coconut/i);
  });

  it('explains the runner-up with its biggest penalty', () => {
    const text = explain(pair, prefs, runnerUp);
    expect(text).toMatch(/Runner-up: Pho Tai at Pho House, too close to something you had or have planned\./);
  });

  it('is honest about menu-less placeholders', () => {
    const placeholder: Recommendation = { ...runnerUp, menuless: true, items: [{ ...runnerUp.items[0]!, name: 'Pho', menuless: true }] };
    const text = explain(placeholder, prefs);
    expect(text).toMatch(/could not read this menu yet/);
    expect(text).toMatch(/Check the menu before ordering/);
  });
});

describe('joinNatural', () => {
  it('joins with commas and "and"', () => {
    expect(joinNatural(['a'])).toBe('a');
    expect(joinNatural(['a', 'b'])).toBe('a and b');
    expect(joinNatural(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
```

`test/core/feedback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyFeedback, FEEDBACK_REASONS } from '../../src/core/feedback';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const shown = { cuisine: 'thai', archetypeId: 'green_curry', totalPriceCents: 3000 };

describe('applyFeedback', () => {
  it('too_heavy lowers richness and sets not-heavy', () => {
    const p = applyFeedback(emptyPreferences(), 'too_heavy', shown);
    expect(p.heaviness).toBe(-0.5);
    expect(p.desiredQualities.rich).toBe(-0.5);
  });
  it('too_light raises richness', () => {
    expect(applyFeedback(emptyPreferences(), 'too_light', shown).heaviness).toBe(0.5);
  });
  it('too_boring and too_weird move novelty', () => {
    expect(applyFeedback(emptyPreferences(), 'too_boring', shown).novelty).toBe(0.5);
    expect(applyFeedback(emptyPreferences(), 'too_weird', shown).novelty).toBe(-0.5);
  });
  it('too_spicy lowers spice below zero', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.spicy', value: 0.7 }]);
    expect(applyFeedback(p, 'too_spicy', shown).desiredQualities.spicy).toBe(-0.5);
  });
  it('too_expensive tightens the budget to 80% of what was shown and drops flexibility', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'budget.flexible', value: 1 }]);
    const next = applyFeedback(p, 'too_expensive', shown);
    expect(next.budget.max).toBe(24);
    expect(next.budget.flexible).toBeUndefined();
  });
  it('too_much_starch sets starchAsMain to -1', () => {
    expect(applyFeedback(emptyPreferences(), 'too_much_starch', shown).carbs.starchAsMain).toBe(-1);
  });
  it('had_recently records the cuisine and archetype', () => {
    expect(applyFeedback(emptyPreferences(), 'had_recently', shown).recentMeals).toEqual(['green_curry', 'thai']);
  });
  it('not_that_cuisine marks the cuisine down', () => {
    expect(applyFeedback(emptyPreferences(), 'not_that_cuisine', shown).cuisines.thai).toBe(-1);
  });
  it('another changes nothing and never mutates input', () => {
    const base = emptyPreferences();
    expect(applyFeedback(base, 'another', shown)).toEqual(base);
    for (const reason of FEEDBACK_REASONS) applyFeedback(base, reason, shown);
    expect(base).toEqual(emptyPreferences());
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `pnpm vitest run --project core test/core/explain.test.ts test/core/feedback.test.ts` — Expected: FAIL.

`src/core/explain.ts`:

```ts
import type { Recommendation } from './pairs';
import type { DinnerPreferences } from './preferences';

const SIGNAL_PHRASES: Record<string, string> = {
  brothy: 'broth',
  brightAcidic: 'lime and acid brightness',
  fresh: 'something fresh',
  spicy: 'some heat',
  comforting: 'comfort',
  savory: 'deep savoriness',
  crispy: 'crunch',
  rich: 'richness',
  proteinForward: 'plenty of protein',
  handheld: 'something you eat with your hands',
  adventurous: 'something a bit different',
  carbHeavy: 'a proper starch base',
  protein: 'the protein you asked for',
};

const PENALTY_PHRASES: Record<string, string> = {
  tooRich: 'heavier than you wanted',
  tooStarchy: 'more starch than you wanted',
  tooSpicy: 'spicier than you wanted',
  repeatedCuisine: 'too close to something you had or have planned',
  bothHeavy: 'two heavy dishes together',
  bothStarchy: 'two starch bases together',
  tooMuch: 'more food than you asked for',
  menuless: 'a menu we have not read yet',
};

export function joinNatural(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function avoidedPhrases(rec: Recommendation, prefs: DinnerPreferences): string[] {
  const out: string[] = [];
  const maxOf = (key: 'rich' | 'carbHeavy' | 'spicy') => Math.max(...rec.items.map((i) => i.scores[key] ?? 0));
  if ((prefs.heaviness ?? 0) <= -0.5 && maxOf('rich') < 0.4) out.push('without getting heavy');
  if ((prefs.carbs.starchAsMain ?? 0) <= -0.5 && maxOf('carbHeavy') < 0.4) out.push('without a big rice or noodle base');
  if ((prefs.desiredQualities.spicy ?? 0) <= -0.5 && maxOf('spicy') < 0.3) out.push('without much heat');
  return out;
}

function lead(rec: Recommendation): string {
  const names = rec.items.map((i) => i.name);
  return `${names.length > 1 ? `${names[0]} plus ${names[1]}` : names[0]} at ${rec.restaurant.name}.`;
}

function runnerUpSentence(runnerUp: Recommendation, primary: Recommendation): string {
  const names = runnerUp.items.map((i) => i.name).join(' plus ');
  const [worst] = Object.entries(runnerUp.trace.penalties).sort((a, b) => b[1] - a[1]);
  let reason: string;
  if (worst && PENALTY_PHRASES[worst[0]]) {
    reason = PENALTY_PHRASES[worst[0]]!;
  } else {
    const [top] = Object.entries(primary.trace.positiveSignals).sort((a, b) => b[1] - a[1]);
    reason = top && SIGNAL_PHRASES[top[0]] ? `a little less ${SIGNAL_PHRASES[top[0]]}` : 'a close second';
  }
  return `Runner-up: ${names} at ${runnerUp.restaurant.name}, ${reason}.`;
}

export function explain(rec: Recommendation, prefs: DinnerPreferences, runnerUp?: Recommendation | null): string {
  const first = lead(rec);
  if (rec.menuless) {
    const dish = rec.items[0]?.name.toLowerCase() ?? 'this';
    return `${first} We could not read this menu yet, so this is a match on cuisine and rating: ${rec.restaurant.name} looks like a good place for ${dish}. Check the menu before ordering.`;
  }
  const signals = Object.entries(rec.trace.positiveSignals)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => SIGNAL_PHRASES[k])
    .filter((p): p is string => !!p)
    .slice(0, 3);
  const got = signals.length ? `You get ${joinNatural(signals)}` : 'It lines up with what you asked for';
  const avoided = avoidedPhrases(rec, prefs);
  let text = `${first} ${got}${avoided.length ? `, ${joinNatural(avoided)}` : ''}.`;
  const described = rec.items.find((i) => i.description && i.description.length <= 120);
  if (described) text += ` The menu lists ${described.name} as "${described.description}".`;
  if (runnerUp) text += ` ${runnerUpSentence(runnerUp, rec)}`;
  return text;
}
```

`src/core/feedback.ts`:

```ts
import { clamp1, type DinnerPreferences } from './preferences';

export const FEEDBACK_REASONS = [
  'too_heavy', 'too_light', 'too_boring', 'too_weird', 'too_spicy', 'too_expensive', 'too_much_starch', 'had_recently', 'not_that_cuisine', 'another',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_LABELS: Record<FeedbackReason, string> = {
  too_heavy: 'Too heavy',
  too_light: 'Too light',
  too_boring: 'Too boring',
  too_weird: 'Too weird',
  too_spicy: 'Too spicy',
  too_expensive: 'Too expensive',
  too_much_starch: 'Too much starch',
  had_recently: 'Had that recently',
  not_that_cuisine: 'Not feeling that cuisine',
  another: 'Just show me another',
};

export interface ShownSummary {
  cuisine?: string;
  archetypeId?: string;
  totalPriceCents?: number;
}

function pushUnique(list: string[], v: string | undefined) {
  if (v && !list.includes(v)) list.push(v);
}

export function applyFeedback(prefs: DinnerPreferences, reason: FeedbackReason, shown: ShownSummary): DinnerPreferences {
  const p = structuredClone(prefs);
  const q = p.desiredQualities;
  switch (reason) {
    case 'too_heavy':
      p.heaviness = Math.min(p.heaviness ?? 0, -0.5);
      q.rich = clamp1((q.rich ?? 0) - 0.5);
      break;
    case 'too_light':
      p.heaviness = Math.max(p.heaviness ?? 0, 0.5);
      q.rich = clamp1((q.rich ?? 0) + 0.5);
      break;
    case 'too_boring':
      p.novelty = clamp1((p.novelty ?? 0) + 0.5);
      break;
    case 'too_weird':
      p.novelty = clamp1((p.novelty ?? 0) - 0.5);
      break;
    case 'too_spicy':
      q.spicy = clamp1(Math.min(q.spicy ?? 0, 0) - 0.5);
      break;
    case 'too_expensive':
      if (shown.totalPriceCents) p.budget.max = Math.floor((shown.totalPriceCents * 0.8) / 100);
      delete p.budget.flexible;
      break;
    case 'too_much_starch':
      p.carbs.starchAsMain = -1;
      break;
    case 'had_recently':
      pushUnique(p.recentMeals, shown.archetypeId);
      pushUnique(p.recentMeals, shown.cuisine);
      break;
    case 'not_that_cuisine':
      if (shown.cuisine) p.cuisines[shown.cuisine] = -1;
      break;
    case 'another':
      break;
  }
  return p;
}
```

- [ ] **Step 3: Run the tests, then commit**

Run: `pnpm vitest run --project core test/core/explain.test.ts test/core/feedback.test.ts` — Expected: PASS.

```bash
git add src/core/explain.ts src/core/feedback.ts test/core/explain.test.ts test/core/feedback.test.ts
git commit -m "Add explanation templates and feedback preference edits"
```

---

### Task 13: San Francisco fixtures and the spec's scenario tests

**Files:**
- Create: `fixtures/sf.ts`
- Test: `test/core/scenarios.test.ts`

**Interfaces:**
- Consumes: `tagItem`, `recommend`, `withMenulessFallback`, `explain`.
- Produces: `FIXTURE_RESTAURANTS` (raw data) and `fixtureCandidates(kb) -> RestaurantCandidatesInput[]`, used by the fixture candidate source in Task 14.

- [ ] **Step 1: Write fixtures/sf.ts**

Scores given here override whatever the lexicon infers; the lexicon still fills tags and any key left out.

```ts
import type { KnowledgeBase } from '../src/core/kb/schema';
import { tagItem } from '../src/core/lexicon';
import type { RestaurantCandidatesInput } from '../src/core/pairs';
import type { ItemTags, MenuItem, RestaurantSummary, Scores } from '../src/core/types';

export interface FixtureItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  scores: Scores;
  tags?: Partial<ItemTags>;
}

export interface FixtureRestaurant {
  restaurant: RestaurantSummary;
  items: FixtureItem[];
}

const sf = (name: string, placeId: string, cuisine: string, rating: number, count: number): RestaurantSummary => ({
  placeId,
  name,
  cuisine,
  lat: 37.76,
  lng: -122.42,
  rating,
  userRatingCount: count,
  openNow: true,
  websiteUri: `https://example.com/${placeId}`,
  mapsUri: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
});

export const FIXTURE_RESTAURANTS: FixtureRestaurant[] = [
  {
    restaurant: sf('Lotus Pho', 'lotus_pho', 'vietnamese', 4.4, 900),
    items: [
      { id: 'lotus_pho_tai', name: 'Pho Tai', description: 'Rare beef rice noodle soup with basil, lime and bean sprouts', priceCents: 1600, scores: { brothy: 0.95, comforting: 0.8, rich: 0.3, spicy: 0.3, brightAcidic: 0.5, savory: 0.8, fresh: 0.5, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.6 }, tags: { archetypeId: 'pho' } },
      { id: 'lotus_bun_bo_hue', name: 'Bun Bo Hue', description: 'Spicy lemongrass beef and pork noodle soup', priceCents: 1700, scores: { brothy: 0.95, spicy: 0.8, rich: 0.4, comforting: 0.7, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.5, handheld: 0, portion: 0.6 } },
      { id: 'lotus_goi_cuon', name: 'Goi Cuon', description: 'Fresh shrimp and pork spring rolls with peanut sauce', priceCents: 900, scores: { fresh: 0.9, brightAcidic: 0.4, rich: 0.2, crispy: 0, handheld: 0.9, carbHeavy: 0.3, proteinForward: 0.5, portion: 0.3 } },
      { id: 'lotus_com_tam', name: 'Com Tam Suon', description: 'Broken rice plate with grilled pork chop and fried egg', priceCents: 1700, scores: { savory: 0.85, rich: 0.6, comforting: 0.8, carbHeavy: 0.85, proteinForward: 0.6, crispy: 0.4, portion: 0.8 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Siam Kitchen', 'siam_kitchen', 'thai', 4.5, 1200),
    items: [
      { id: 'siam_tom_yum', name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass, lime leaf and mushrooms', priceCents: 1400, scores: { brothy: 0.95, spicy: 0.6, brightAcidic: 0.9, rich: 0.2, fresh: 0.6, savory: 0.7, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.1, adventurous: 0.4, handheld: 0, portion: 0.4 } },
      { id: 'siam_beef_salad', name: 'Grilled Beef Salad (Nam Tok)', description: 'Sliced grilled steak with lime, chili, mint and toasted rice powder', priceCents: 1700, scores: { brightAcidic: 0.9, spicy: 0.6, savory: 0.9, fresh: 0.7, rich: 0.2, comforting: 0.4, brothy: 0, proteinForward: 0.9, carbHeavy: 0.1, adventurous: 0.4, handheld: 0, portion: 0.5 } },
      { id: 'siam_green_curry', name: 'Green Curry Chicken', description: 'Coconut green curry with bamboo shoots and Thai basil, served with jasmine rice', priceCents: 1600, scores: { rich: 0.8, spicy: 0.7, comforting: 0.7, savory: 0.8, brothy: 0.3, carbHeavy: 0.6, proteinForward: 0.5, adventurous: 0.2, handheld: 0, portion: 0.7 } },
      { id: 'siam_pad_see_ew', name: 'Pad See Ew', description: 'Wide rice noodles stir-fried with egg, Chinese broccoli and sweet soy', priceCents: 1500, scores: { savory: 0.8, comforting: 0.7, rich: 0.6, carbHeavy: 0.85, brothy: 0, proteinForward: 0.4, adventurous: 0.1, handheld: 0, portion: 0.7 } },
    ],
  },
  {
    restaurant: sf('Golden Wok', 'golden_wok', 'chinese', 4.2, 600),
    items: [
      { id: 'wok_beef_noodle_soup', name: 'Taiwanese Beef Noodle Soup', description: 'Braised beef shank in a spiced broth with wheat noodles and pickled mustard greens', priceCents: 1700, scores: { brothy: 0.95, comforting: 0.9, rich: 0.5, spicy: 0.4, savory: 0.9, brightAcidic: 0.3, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.3, handheld: 0, portion: 0.8 } },
      { id: 'wok_mapo_tofu', name: 'Mapo Tofu', description: 'Silken tofu and minced pork in Sichuan chili bean sauce, with rice', priceCents: 1500, scores: { spicy: 0.9, rich: 0.6, savory: 0.9, comforting: 0.7, carbHeavy: 0.5, proteinForward: 0.5, adventurous: 0.5, handheld: 0, portion: 0.6 }, tags: { carbs: ['rice'] } },
      { id: 'wok_sp_squid', name: 'Salt and Pepper Squid', description: 'Crispy fried squid with garlic, scallion and chili', priceCents: 1600, scores: { crispy: 0.9, rich: 0.6, savory: 0.85, spicy: 0.4, proteinForward: 0.7, carbHeavy: 0.1, handheld: 0.5, portion: 0.5 } },
    ],
  },
  {
    restaurant: sf('Mission Mariscos', 'mission_mariscos', 'mexican', 4.6, 700),
    items: [
      { id: 'mariscos_ceviche', name: 'Ceviche de Pescado', description: 'Lime-cured snapper with tomato, onion, cilantro and avocado, served with tostadas', priceCents: 1600, scores: { fresh: 0.95, brightAcidic: 0.95, spicy: 0.4, rich: 0.1, savory: 0.5, proteinForward: 0.8, carbHeavy: 0.15, adventurous: 0.5, handheld: 0.3, portion: 0.4 } },
      { id: 'mariscos_aguachile', name: 'Aguachile Verde', description: 'Raw shrimp in lime, serrano and cucumber', priceCents: 1700, scores: { fresh: 0.95, brightAcidic: 0.95, spicy: 0.85, rich: 0.05, savory: 0.5, proteinForward: 0.8, carbHeavy: 0.05, adventurous: 0.7, handheld: 0, portion: 0.4 } },
      { id: 'mariscos_fish_tacos', name: 'Baja Fish Tacos', description: 'Beer-battered cod, cabbage slaw and chipotle crema on corn tortillas', priceCents: 1500, scores: { handheld: 0.9, fresh: 0.6, crispy: 0.7, brightAcidic: 0.5, rich: 0.5, savory: 0.7, proteinForward: 0.5, carbHeavy: 0.4, adventurous: 0.2, portion: 0.5 } },
      { id: 'mariscos_diabla', name: 'Camarones a la Diabla', description: 'Shrimp in a fiery red chile sauce with rice', priceCents: 1900, scores: { spicy: 0.9, rich: 0.5, savory: 0.85, proteinForward: 0.8, carbHeavy: 0.5, comforting: 0.5, adventurous: 0.4, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Burger Barn', 'burger_barn', 'american', 4.3, 1500),
    items: [
      { id: 'barn_double', name: 'Double Cheeseburger', description: 'Two smashed patties, American cheese, pickles, onion, special sauce, brioche bun', priceCents: 1500, scores: { rich: 0.9, comforting: 0.9, handheld: 1, savory: 0.9, crispy: 0.3, brightAcidic: 0.2, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.05, brothy: 0, portion: 0.8 } },
      { id: 'barn_chicken', name: 'Crispy Chicken Sandwich', description: 'Buttermilk fried chicken thigh, slaw, pickles, potato bun', priceCents: 1400, scores: { crispy: 0.95, rich: 0.85, handheld: 1, comforting: 0.85, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.05, portion: 0.8 } },
      { id: 'barn_fries', name: 'Fries', description: 'Skin-on fries with sea salt', priceCents: 500, scores: { crispy: 0.9, rich: 0.6, carbHeavy: 0.9, comforting: 0.7, proteinForward: 0, handheld: 0.8, portion: 0.3 } },
    ],
  },
  {
    restaurant: sf("Philly's Finest", 'phillys_finest', 'american', 4.1, 400),
    items: [
      { id: 'philly_classic', name: 'Classic Cheesesteak', description: 'Thin-sliced ribeye, grilled onions and melted provolone on an Amoroso roll', priceCents: 1600, scores: { rich: 0.9, comforting: 0.9, handheld: 1, savory: 0.9, proteinForward: 0.7, carbHeavy: 0.5, adventurous: 0.05, brothy: 0, portion: 0.9 } },
    ],
  },
  {
    restaurant: sf('Taqueria El Sol', 'taqueria_el_sol', 'mexican', 4.5, 2000),
    items: [
      { id: 'sol_asada_tacos', name: 'Carne Asada Tacos', description: 'Three grilled steak tacos with onion, cilantro and salsa verde', priceCents: 1300, scores: { handheld: 1, savory: 0.8, brightAcidic: 0.4, rich: 0.4, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.4, adventurous: 0.1, brothy: 0, portion: 0.6 } },
      { id: 'sol_pastor_burrito', name: 'Al Pastor Burrito', description: 'Marinated pork, rice, beans, cheese and salsa in a flour tortilla', priceCents: 1400, scores: { handheld: 1, rich: 0.7, carbHeavy: 0.85, comforting: 0.8, savory: 0.8, proteinForward: 0.5, adventurous: 0.05, portion: 0.95 } },
      { id: 'sol_pozole', name: 'Pozole Rojo', description: 'Pork and hominy soup in red chile broth with cabbage, radish and lime', priceCents: 1500, scores: { brothy: 0.9, comforting: 0.9, spicy: 0.6, rich: 0.4, savory: 0.85, brightAcidic: 0.4, proteinForward: 0.5, carbHeavy: 0.4, adventurous: 0.4, handheld: 0, portion: 0.7 } },
    ],
  },
  {
    restaurant: sf('Beirut Grill', 'beirut_grill', 'middle_eastern', 4.4, 500),
    items: [
      { id: 'beirut_shawarma', name: 'Beef Shawarma Wrap', description: 'Spiced beef, pickles, tomato and tahini in warm pita', priceCents: 1400, scores: { handheld: 1, savory: 0.85, brightAcidic: 0.4, rich: 0.5, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.4, adventurous: 0.2, brothy: 0, portion: 0.7 } },
      { id: 'beirut_fattoush', name: 'Fattoush', description: 'Romaine, cucumber, tomato, radish and crisp pita with sumac dressing', priceCents: 1100, scores: { fresh: 0.95, brightAcidic: 0.9, crispy: 0.4, rich: 0.1, savory: 0.4, proteinForward: 0.2, carbHeavy: 0.2, adventurous: 0.3, handheld: 0, portion: 0.4 } },
      { id: 'beirut_kebab', name: 'Lamb Kebab Plate', description: 'Two grilled lamb skewers with rice, salad and garlic sauce', priceCents: 2000, scores: { savory: 0.9, proteinForward: 0.9, rich: 0.5, brightAcidic: 0.3, carbHeavy: 0.4, comforting: 0.5, adventurous: 0.3, handheld: 0, portion: 0.8 }, tags: { proteins: ['beef'] } },
    ],
  },
  {
    restaurant: sf('Sakura', 'sakura', 'japanese', 4.3, 800),
    items: [
      { id: 'sakura_tonkotsu', name: 'Tonkotsu Ramen', description: 'Rich pork bone broth, chashu, soft egg, wood ear and scallion', priceCents: 1800, scores: { brothy: 0.95, rich: 0.9, comforting: 0.95, savory: 0.95, proteinForward: 0.5, carbHeavy: 0.6, adventurous: 0.2, handheld: 0, portion: 0.8 } },
      { id: 'sakura_sashimi', name: 'Salmon Sashimi', description: 'Eight slices of salmon', priceCents: 1900, scores: { fresh: 0.95, brightAcidic: 0.3, rich: 0.3, savory: 0.6, proteinForward: 0.95, carbHeavy: 0, adventurous: 0.3, handheld: 0, portion: 0.4 } },
      { id: 'sakura_katsu_curry', name: 'Chicken Katsu Curry', description: 'Panko-fried chicken cutlet with Japanese curry over rice', priceCents: 1700, scores: { rich: 0.85, comforting: 0.9, crispy: 0.8, savory: 0.85, carbHeavy: 0.8, proteinForward: 0.5, adventurous: 0.1, handheld: 0, portion: 0.9 } },
    ],
  },
  {
    restaurant: sf('Seoul Garden', 'seoul_garden', 'korean', 4.4, 650),
    items: [
      { id: 'seoul_yukgaejang', name: 'Yukgaejang', description: 'Spicy shredded beef soup with scallion, fernbrake and glass noodles, with rice', priceCents: 1700, scores: { brothy: 0.95, spicy: 0.8, comforting: 0.8, rich: 0.4, savory: 0.9, proteinForward: 0.6, carbHeavy: 0.3, adventurous: 0.5, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
      { id: 'seoul_bulgogi', name: 'Bulgogi', description: 'Thin-sliced marinated ribeye with onions, served with rice and banchan', priceCents: 1900, scores: { savory: 0.9, rich: 0.5, comforting: 0.7, proteinForward: 0.8, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.8 }, tags: { carbs: ['rice'] } },
      { id: 'seoul_kimchi_jjigae', name: 'Kimchi Jjigae', description: 'Kimchi and pork belly stew with tofu, with rice', priceCents: 1600, scores: { brothy: 0.85, spicy: 0.8, rich: 0.6, comforting: 0.85, savory: 0.9, brightAcidic: 0.5, proteinForward: 0.5, carbHeavy: 0.3, adventurous: 0.5, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Bombay Spice', 'bombay_spice', 'indian', 4.2, 900),
    items: [
      { id: 'bombay_butter_chicken', name: 'Butter Chicken', description: 'Tandoori chicken in a creamy tomato sauce, with basmati rice', priceCents: 1800, scores: { rich: 0.9, comforting: 0.9, spicy: 0.3, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.1, handheld: 0, portion: 0.8 }, tags: { carbs: ['rice'] } },
      { id: 'bombay_chana', name: 'Chana Masala', description: 'Chickpeas in a spiced tomato and onion gravy, with rice', priceCents: 1500, scores: { comforting: 0.7, spicy: 0.5, rich: 0.4, savory: 0.8, proteinForward: 0.3, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.6 }, tags: { carbs: ['rice'] } },
      { id: 'bombay_vindaloo', name: 'Lamb Vindaloo', description: 'Fiery Goan curry with vinegar and chile, with rice', priceCents: 1900, scores: { spicy: 0.95, rich: 0.7, savory: 0.85, comforting: 0.6, brightAcidic: 0.4, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.4, handheld: 0, portion: 0.8 }, tags: { proteins: ['beef'], carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Fog City Grill', 'fog_city_grill', 'american', 4.5, 1100),
    items: [
      { id: 'fog_salmon', name: 'Grilled Salmon', description: 'Wild salmon with lemon, herbs and charred broccolini', priceCents: 2800, scores: { fresh: 0.7, brightAcidic: 0.7, savory: 0.6, rich: 0.4, proteinForward: 0.9, carbHeavy: 0.1, adventurous: 0.2, handheld: 0, comforting: 0.4, portion: 0.6 } },
      { id: 'fog_chicken', name: 'Half Roast Chicken', description: 'Brick-roasted half chicken with pan jus and roasted potatoes', priceCents: 2600, scores: { comforting: 0.9, savory: 0.85, rich: 0.5, proteinForward: 0.8, carbHeavy: 0.3, adventurous: 0.05, handheld: 0.2, portion: 0.8 } },
      { id: 'fog_salad', name: 'Little Gem Salad', description: 'Little gem lettuce, radish, herbs and green goddess dressing', priceCents: 1400, scores: { fresh: 0.95, brightAcidic: 0.8, rich: 0.3, savory: 0.4, proteinForward: 0.1, carbHeavy: 0.05, adventurous: 0.1, handheld: 0, portion: 0.4 } },
    ],
  },
  {
    restaurant: sf('Larb House', 'larb_house', 'thai', 4.7, 120),
    items: [],
  },
];

export function fixtureCandidates(kb: KnowledgeBase): RestaurantCandidatesInput[] {
  return FIXTURE_RESTAURANTS.map(({ restaurant, items }) => ({
    restaurant,
    items: items.map((raw): MenuItem => {
      const tagged = tagItem(kb, raw);
      return {
        id: raw.id,
        placeId: restaurant.placeId,
        name: raw.name,
        description: raw.description,
        priceCents: raw.priceCents,
        scores: { ...tagged.scores, ...raw.scores },
        tags: {
          proteins: raw.tags?.proteins ?? tagged.tags.proteins,
          carbs: raw.tags?.carbs ?? tagged.tags.carbs,
          formats: raw.tags?.formats ?? tagged.tags.formats,
          cuisine: raw.tags?.cuisine ?? tagged.tags.cuisine ?? restaurant.cuisine,
          archetypeId: raw.tags?.archetypeId ?? tagged.tags.archetypeId,
        },
      };
    }),
  }));
}
```

- [ ] **Step 2: Write the failing scenario tests**

`test/core/scenarios.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixtureCandidates } from '../../fixtures/sf';
import { explain } from '../../src/core/explain';
import { withMenulessFallback } from '../../src/core/fallback';
import { loadBaseKb } from '../../src/core/kb';
import { recommend } from '../../src/core/pairs';
import { applyEffects, emptyPreferences, type Effect } from '../../src/core/preferences';

const kb = loadBaseKb();
const candidates = fixtureCandidates(kb);

function run(effects: Effect[]) {
  const prefs = applyEffects(emptyPreferences(), effects);
  const result = recommend(withMenulessFallback(kb, candidates, prefs), prefs, { kb });
  return { prefs, ...result };
}

const archetypesOf = (items: { tags: { archetypeId?: string } }[]) => items.map((i) => i.tags.archetypeId);

describe('fixtures', () => {
  it('tags every fixture item with a protein or a vegetarian marker and a cuisine', () => {
    for (const c of candidates) {
      for (const item of c.items) {
        expect(item.tags.cuisine, item.name).toBeTruthy();
        expect(item.tags.proteins.length, item.name).toBeGreaterThan(0);
      }
    }
  });
});

describe('Scenario A: comfort, not heavy, broth, beef, moderate spice, minimal rice', () => {
  const effects: Effect[] = [
    { path: 'hunger', value: 'normal' },
    { path: 'desiredQualities.comforting', value: 0.8 },
    { path: 'desiredQualities.brothy', value: 1 },
    { path: 'heaviness', value: -0.5 },
    { path: 'proteins.beef', value: 1 },
    { path: 'desiredQualities.spicy', value: 0.3 },
    { path: 'carbs.rice', value: -0.5 },
    { path: 'carbs.starchAsMain', value: -0.5 },
  ];
  it('recommends a beefy soup or a soup plus grilled beef pair', () => {
    const { primary, runnerUp, prefs } = run(effects);
    const expected = ['pho', 'beef_noodle_soup', 'yukgaejang', 'bun_bo_hue', 'tom_yum', 'thai_beef_salad'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
    expect(primary!.menuless).toBe(false);
    expect(runnerUp).not.toBeNull();
    expect(runnerUp!.restaurant.placeId).not.toBe(primary!.restaurant.placeId);
    const text = explain(primary!, prefs, runnerUp);
    expect(text).toContain(primary!.items[0]!.name);
    expect(text).toMatch(/broth/);
  });
  it('respects exclusions and still answers', () => {
    const { primary } = run([...effects, { path: 'exclusions', value: 'vietnamese' }, { path: 'exclusions', value: 'chinese' }, { path: 'exclusions', value: 'korean' }]);
    expect(primary).not.toBeNull();
    expect(['vietnamese', 'chinese', 'korean']).not.toContain(primary!.restaurant.cuisine);
  });
});

describe('Scenario B: hot weather, seafood, acidic, not heavy, interesting', () => {
  it('recommends ceviche, aguachile, sashimi, grilled fish or fish tacos', () => {
    const { primary } = run([
      { path: 'desiredQualities.fresh', value: 1 },
      { path: 'desiredQualities.brightAcidic', value: 1 },
      { path: 'proteins.seafood', value: 1 },
      { path: 'heaviness', value: -0.7 },
      { path: 'novelty', value: 0.5 },
    ]);
    const expected = ['ceviche', 'aguachile', 'sashimi', 'grilled_fish', 'fish_tacos'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
  });
});

describe('Scenario C: starving, indulgent, handheld, beef, familiar', () => {
  it('recommends a burger, cheesesteak, tacos, shawarma or kebab wrap', () => {
    const { primary } = run([
      { path: 'hunger', value: 'very_hungry' },
      { path: 'desiredQualities.rich', value: 1 },
      { path: 'desiredQualities.comforting', value: 0.5 },
      { path: 'handheld', value: 1 },
      { path: 'proteins.beef', value: 1 },
      { path: 'novelty', value: -1 },
    ]);
    const expected = ['burger', 'cheesesteak', 'tacos', 'shawarma_wrap', 'kebab_plate', 'burrito'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
  });
});

describe('degenerate inputs', () => {
  it('answers with no preferences at all', () => {
    const { primary, runnerUp } = run([]);
    expect(primary).not.toBeNull();
    expect(runnerUp).not.toBeNull();
  });
  it('returns null when every cuisine is excluded', () => {
    const cuisines = [...new Set(candidates.map((c) => c.restaurant.cuisine!))];
    const { primary } = run(cuisines.map((c) => ({ path: 'exclusions', value: c })));
    expect(primary).toBeNull();
  });
});
```

- [ ] **Step 3: Run the scenario tests**

Run: `pnpm vitest run --project core test/core/scenarios.test.ts`
Expected: PASS. If a scenario picks something outside its expected set, inspect `ranked.slice(0, 5)` and their traces by adding a temporary `console.log`. Fix the cause, in this order of preference: a wrong fixture score, a missing lexicon tag, then a weight in `WEIGHTS` or `PENALTIES`. Do not widen the expected sets.

- [ ] **Step 4: Commit**

```bash
git add fixtures/sf.ts test/core/scenarios.test.ts
git commit -m "Add San Francisco fixtures and scenario tests"
```

---

### Task 14: Recommend and feedback API

**Files:**
- Create: `src/providers/candidates/fixture.ts`, `src/worker/db/recommendations.ts`, `src/worker/links.ts`, `src/worker/recommendation.ts`
- Modify: `src/shared/api.ts`, `src/worker/validation.ts`, `src/worker/deps.ts`, `src/worker/routes/session.ts`
- Test: `test/worker/recommend.test.ts`

**Interfaces:**
- Consumes: `recommend`, `withMenulessFallback`, `explain`, `applyFeedback`, `FEEDBACK_REASONS`, `fixtureCandidates`, `CandidateSource`.
- Produces: `FixtureCandidateSource`; `Deps.candidates`; `MenuItemDto`, `RecommendationDto`, `RecommendResponse`, `FeedbackRequest` (shared); `orderLinks(restaurant)`; `produceRecommendation(deps, db, rec)`; `insertRecommendation`, `setFeedback`, `latestRecommendation`.
- Routes: `POST /api/session/:id/recommend { force?: boolean }`, `POST /api/session/:id/feedback { reason }`.

- [ ] **Step 1: Extend the shared DTOs and validation**

Append to `src/shared/api.ts`:

```ts
import type { FeedbackReason } from '../core/feedback';
import type { ScoreTrace } from '../core/scoring';
import type { RestaurantSummary } from '../core/types';

export type { FeedbackReason };

export interface MenuItemDto {
  id: string;
  name: string;
  description?: string;
  priceCents?: number;
  menuless?: boolean;
}

export interface OrderLinks {
  website?: string;
  maps?: string;
  doordash: string;
  ubereats: string;
}

export interface RecommendationDto {
  kind: 'single' | 'pair';
  restaurant: RestaurantSummary;
  items: MenuItemDto[];
  score: number;
  explanation: string;
  menuless: boolean;
  links: OrderLinks;
  trace?: ScoreTrace;
}

export interface RecommendResponse {
  recommendationId: string | null;
  primary: RecommendationDto | null;
  runnerUp: RecommendationDto | null;
  message?: string;
  debug?: {
    candidateRestaurants: number;
    candidateItems: number;
    rejectedItemIds: string[];
    ranked: { label: string; restaurant: string; score: number }[];
  };
}

export interface FeedbackRequest {
  reason: FeedbackReason;
}
```

Move the `import type` lines to the top of the file with the existing imports.

Append to `src/worker/validation.ts`:

```ts
import { FEEDBACK_REASONS } from '../core/feedback';

export const RecommendSchema = z.object({ force: z.boolean().optional() });
export const FeedbackSchema = z.object({ reason: z.enum(FEEDBACK_REASONS) });
```

- [ ] **Step 2: Write the fixture candidate source, links and recommendation repository**

`src/providers/candidates/fixture.ts`:

```ts
import { fixtureCandidates } from '../../../fixtures/sf';
import type { CandidateQuery, CandidateSource, RestaurantCandidates } from '../types';

export class FixtureCandidateSource implements CandidateSource {
  async candidates(query: CandidateQuery): Promise<RestaurantCandidates[]> {
    return fixtureCandidates(query.kb);
  }
}
```

Update `src/worker/deps.ts`:

```ts
import { loadBaseKb, type KnowledgeBase } from '../core/kb';
import { FixtureCandidateSource } from '../providers/candidates/fixture';
import { FixtureGeocoder } from '../providers/geocoder/fixture';
import { FixtureLlm } from '../providers/llm/fixture';
import type { CandidateSource, Geocoder, Llm } from '../providers/types';
import type { Env } from './env';

export interface Deps {
  kb: KnowledgeBase;
  llm: Llm;
  geocoder: Geocoder;
  candidates: CandidateSource;
}

function unsupported(name: string, value: string): never {
  throw new Error(`${name}=${value} is not available in this build`);
}

export function buildDeps(env: Env): Deps {
  const kb = loadBaseKb();
  const llm: Llm = env.LLM_PROVIDER === 'fixture' ? new FixtureLlm() : unsupported('LLM_PROVIDER', env.LLM_PROVIDER);
  const geocoder: Geocoder = env.GEOCODER === 'fixture' ? new FixtureGeocoder() : unsupported('GEOCODER', env.GEOCODER);
  const candidates: CandidateSource =
    env.RESTAURANT_PROVIDER === 'fixture' ? new FixtureCandidateSource() : unsupported('RESTAURANT_PROVIDER', env.RESTAURANT_PROVIDER);
  return { kb, llm, geocoder, candidates };
}
```

`src/worker/links.ts`:

```ts
import type { RestaurantSummary } from '../core/types';
import type { OrderLinks } from '../shared/api';

export function orderLinks(r: RestaurantSummary): OrderLinks {
  const q = encodeURIComponent(r.name);
  return {
    website: r.websiteUri,
    maps: r.mapsUri,
    doordash: `https://www.doordash.com/search/store/${q}/`,
    ubereats: `https://www.ubereats.com/search?q=${q}`,
  };
}
```

`src/worker/db/recommendations.ts`:

```ts
import type { RecommendationDto } from '../../shared/api';

export interface RecommendationRow {
  id: string;
  sessionId: string;
  payload: { primary: RecommendationDto; runnerUp: RecommendationDto | null };
  feedbackReason: string | null;
}

export async function insertRecommendation(db: D1Database, row: { id: string; sessionId: string; payload: RecommendationRow['payload']; trace: unknown }): Promise<void> {
  await db
    .prepare('INSERT INTO recommendations (id, session_id, payload, trace, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(row.id, row.sessionId, JSON.stringify(row.payload), JSON.stringify(row.trace), new Date().toISOString())
    .run();
}

export async function setFeedback(db: D1Database, id: string, reason: string): Promise<void> {
  await db.prepare('UPDATE recommendations SET feedback_reason = ?2 WHERE id = ?1').bind(id, reason).run();
}

export async function latestRecommendation(db: D1Database, sessionId: string): Promise<RecommendationRow | null> {
  const row = await db
    .prepare('SELECT id, session_id, payload, feedback_reason FROM recommendations WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1')
    .bind(sessionId)
    .first<{ id: string; session_id: string; payload: string; feedback_reason: string | null }>();
  return row ? { id: row.id, sessionId: row.session_id, payload: JSON.parse(row.payload), feedbackReason: row.feedback_reason } : null;
}
```

- [ ] **Step 3: Write the recommendation producer**

`src/worker/recommendation.ts`:

```ts
import { explain } from '../core/explain';
import { withMenulessFallback } from '../core/fallback';
import { recommend, type Recommendation } from '../core/pairs';
import type { RecommendResponse, RecommendationDto } from '../shared/api';
import { insertRecommendation } from './db/recommendations';
import type { SessionRecord } from './db/sessions';
import type { Deps } from './deps';
import { orderLinks } from './links';

export const NO_MATCH_MESSAGE = 'Nothing nearby fits everything you ruled out. Loosen a restriction and try again.';

function toDto(rec: Recommendation, explanation: string, debug: boolean): RecommendationDto {
  return {
    kind: rec.kind,
    restaurant: rec.restaurant,
    items: rec.items.map((i) => ({ id: i.id, name: i.name, description: i.description, priceCents: i.priceCents, menuless: i.menuless })),
    score: rec.score,
    explanation,
    menuless: rec.menuless,
    links: orderLinks(rec.restaurant),
    trace: debug ? rec.trace : undefined,
  };
}

export async function produceRecommendation(deps: Deps, db: D1Database, rec: SessionRecord, debug: boolean): Promise<RecommendResponse> {
  const { kb, candidates } = deps;
  const prefs = rec.state.prefs;
  const raw = await candidates.candidates({ prefs, lat: rec.lat, lng: rec.lng, kb });
  const filled = withMenulessFallback(kb, raw, prefs);
  const result = recommend(filled, prefs, { kb, rejectedItemIds: new Set(rec.state.rejectedItemIds) });

  const debugInfo = debug
    ? {
        candidateRestaurants: filled.length,
        candidateItems: filled.reduce((n, c) => n + c.items.length, 0),
        rejectedItemIds: rec.state.rejectedItemIds,
        ranked: result.ranked.slice(0, 12).map((r) => ({ label: r.items.map((i) => i.name).join(' + '), restaurant: r.restaurant.name, score: Number(r.score.toFixed(3)) })),
      }
    : undefined;

  if (!result.primary) {
    return { recommendationId: null, primary: null, runnerUp: null, message: NO_MATCH_MESSAGE, debug: debugInfo };
  }

  const primary = toDto(result.primary, explain(result.primary, prefs, result.runnerUp), debug);
  const runnerUp = result.runnerUp ? toDto(result.runnerUp, explain(result.runnerUp, prefs), debug) : null;
  const id = crypto.randomUUID();
  await insertRecommendation(db, {
    id,
    sessionId: rec.id,
    payload: { primary: { ...primary, trace: undefined }, runnerUp: runnerUp ? { ...runnerUp, trace: undefined } : null },
    trace: { primary: result.primary.trace, runnerUp: result.runnerUp?.trace ?? null },
  });
  return { recommendationId: id, primary, runnerUp, debug: debugInfo };
}
```

- [ ] **Step 4: Write the failing route tests**

`test/worker/recommend.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RecommendResponse, SessionDto } from '../../src/shared/api';
import { testEnv } from './env';

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await SELF.fetch(`http://example.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
}

async function readySession(extraAvoid: string[] = []): Promise<string> {
  const created = await post<SessionDto>('/api/session', { zip: '94110' });
  const id = created.body.id;
  let cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'single', nodeId: 'hunger', optionId: 'normal' })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }] })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'scale', nodeId: 'novelty', stop: 2 })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'avoid', selections: extraAvoid.map((optionId) => ({ optionId, intensity: 1 as const })) })).body;
  while (cur.question) {
    const q = cur.question;
    const answer = q.nodeId === 'brothy' ? { kind: 'yesno', nodeId: q.nodeId, value: 'yes' } : q.nodeId === 'heaviness' ? { kind: 'scale', nodeId: q.nodeId, stop: 1 } : { kind: q.kind, nodeId: q.nodeId, ...(q.kind === 'multi' ? { selections: [] } : {}) };
    cur = (await post<SessionDto>(`/api/session/${id}/answer`, answer)).body;
  }
  expect(cur.status).toBe('ready');
  return id;
}

describe('POST /api/session/:id/recommend', () => {
  it('refuses while still asking unless forced', async () => {
    const created = await post<SessionDto>('/api/session', { zip: '94110' });
    expect((await post(`/api/session/${created.body.id}/recommend`, {})).status).toBe(409);
    const forced = await post<RecommendResponse>(`/api/session/${created.body.id}/recommend`, { force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.primary).not.toBeNull();
  });

  it('returns a grounded primary and a runner-up from another restaurant', async () => {
    const id = await readySession();
    const { status, body } = await post<RecommendResponse>(`/api/session/${id}/recommend?debug=1`, {});
    expect(status).toBe(200);
    expect(body.primary).not.toBeNull();
    expect(body.primary!.explanation).toContain(body.primary!.items[0]!.name);
    expect(body.primary!.links.doordash).toContain('doordash.com');
    expect(body.primary!.trace).toBeDefined();
    expect(body.runnerUp?.restaurant.placeId).not.toBe(body.primary!.restaurant.placeId);
    expect(body.debug?.ranked.length).toBeGreaterThan(0);
    const row = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM recommendations WHERE session_id = ?1').bind(id).first<{ n: number }>();
    expect(row?.n).toBe(1);
    const session = (await SELF.fetch(`http://example.com/api/session/${id}`).then((r) => r.json())) as SessionDto;
    expect(session.status).toBe('recommended');
  });

  it('answers with a message, not an error, when everything is excluded', async () => {
    const id = await readySession(['japanese', 'chinese', 'thai', 'vietnamese', 'korean', 'indian', 'mexican', 'italian', 'american', 'middle_eastern']);
    const { status, body } = await post<RecommendResponse>(`/api/session/${id}/recommend`, {});
    expect(status).toBe(200);
    expect(body.primary).toBeNull();
    expect(body.message).toMatch(/Loosen a restriction/);
  });
});

describe('POST /api/session/:id/feedback', () => {
  it('reranks with the reason applied and never repeats shown items', async () => {
    const id = await readySession();
    const first = (await post<RecommendResponse>(`/api/session/${id}/recommend`, {})).body;
    const seen = new Set(first.primary!.items.map((i) => i.id));
    let last = first;
    for (const reason of ['too_heavy', 'another', 'another', 'another', 'another', 'another'] as const) {
      const res = await post<RecommendResponse>(`/api/session/${id}/feedback`, { reason });
      expect(res.status).toBe(200);
      last = res.body;
      if (!last.primary) break;
      for (const item of last.primary.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
    }
    const row = await testEnv.DB.prepare('SELECT feedback_reason FROM recommendations WHERE session_id = ?1 ORDER BY created_at ASC LIMIT 1').bind(id).first<{ feedback_reason: string }>();
    expect(row?.feedback_reason).toBe('too_heavy');
  });

  it('rejects unknown reasons and sessions without a recommendation', async () => {
    const id = await readySession();
    expect((await post(`/api/session/${id}/feedback`, { reason: 'too_purple' })).status).toBe(400);
    expect((await post(`/api/session/${id}/feedback`, { reason: 'another' })).status).toBe(409);
  });
});
```

- [ ] **Step 5: Run to verify failure, then add the routes**

Run: `pnpm vitest run --project worker test/worker/recommend.test.ts` — Expected: FAIL with 404s.

Append to `src/worker/routes/session.ts` (add the imports at the top of the file):

```ts
import { applyFeedback } from '../../core/feedback';
import { latestRecommendation, setFeedback } from '../db/recommendations';
import { produceRecommendation } from '../recommendation';
import { FeedbackSchema, RecommendSchema } from '../validation';

sessionRoutes.post('/:id/recommend', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  const parsed = RecommendSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  if (rec.status === 'asking' && !parsed.data.force) {
    return c.json({ error: 'still_asking', message: 'A few more answers first, or send force to decide now.' }, 409);
  }
  const response = await produceRecommendation(c.get('deps'), c.env.DB, rec, c.req.query('debug') === '1');
  if (response.primary) await saveSession(c.env.DB, { ...rec, status: 'recommended' });
  return c.json(response);
});

sessionRoutes.post('/:id/feedback', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  const parsed = FeedbackSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const latest = await latestRecommendation(c.env.DB, rec.id);
  if (!latest) return c.json({ error: 'nothing_to_reject', message: 'Ask for a recommendation first.' }, 409);

  await setFeedback(c.env.DB, latest.id, parsed.data.reason);
  const shown = latest.payload.primary;
  const shownIds = shown.items.map((i) => i.id);
  const totalPriceCents = shown.items.reduce((n, i) => n + (i.priceCents ?? 0), 0) || undefined;
  const archetypeId = c.get('deps').kb.archetypes.find((a) => shown.items.some((i) => i.id.includes(a.id)))?.id;
  const prefs = applyFeedback(rec.state.prefs, parsed.data.reason, { cuisine: shown.restaurant.cuisine, archetypeId, totalPriceCents });
  const updated: SessionRecord = {
    ...rec,
    state: { ...rec.state, prefs, rejectedItemIds: [...new Set([...rec.state.rejectedItemIds, ...shownIds])] },
  };
  await saveSession(c.env.DB, updated);
  return c.json(await produceRecommendation(c.get('deps'), c.env.DB, updated, c.req.query('debug') === '1'));
});
```

Note on `archetypeId`: the recommendation payload stores item ids, not tags. For `had_recently` the cuisine is what matters; the archetype lookup above is a best-effort match on fixture ids and may be undefined. Do not add tags to the stored payload for this; the next plan's D1-backed candidates will expose `archetypeId` directly.

- [ ] **Step 6: Run all tests and typecheck**

Run: `pnpm test` then `pnpm typecheck`
Expected: all three projects PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src test fixtures
git commit -m "Add recommend and feedback API over fixture candidates"
```

---

### Task 15: Recommendation UI, "Just decide", and README

**Files:**
- Create: `src/client/screens/Recommendation.tsx`, `src/client/components/RecommendationCard.tsx`
- Modify: `src/client/api.ts`, `src/client/App.tsx`, `src/client/screens/Conversation.tsx`, `README.md`

**Interfaces:**
- Consumes: `RecommendResponse`, `RecommendationDto`, `FEEDBACK_LABELS`, `FEEDBACK_REASONS`.
- Produces: `api.recommend(id, force)`, `api.feedback(id, reason)`, `RecommendationCard`, `Recommendation` screen.

- [ ] **Step 1: Extend the API client**

Add to `src/client/api.ts` (inside the `api` object, with the matching type import):

```ts
  recommend: (id: string, force = false) => post<RecommendResponse>(`/api/session/${id}/recommend${debugQuery}`, { force }),
  feedback: (id: string, reason: FeedbackReason) => post<RecommendResponse>(`/api/session/${id}/feedback${debugQuery}`, { reason }),
```

with `import type { AnswerDto, ApiError, FeedbackReason, RecommendResponse, SessionDto } from '../shared/api';`.

- [ ] **Step 2: Write RecommendationCard and the Recommendation screen**

`src/client/components/RecommendationCard.tsx`:

```tsx
import type { RecommendationDto } from '../../shared/api';

const price = (cents?: number) => (cents === undefined ? '' : `$${(cents / 100).toFixed(2)}`);

export function RecommendationCard({ rec, secondary = false }: { rec: RecommendationDto; secondary?: boolean }) {
  const total = rec.items.reduce((n, i) => n + (i.priceCents ?? 0), 0);
  return (
    <article className={secondary ? 'rounded-xl bg-stone-100 p-4 ring-1 ring-stone-200' : 'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200'}>
      <p className="text-xs uppercase tracking-wide text-stone-500">{secondary ? 'Runner-up' : 'Tonight'}</p>
      <h2 className={secondary ? 'mt-1 text-lg font-semibold' : 'mt-1 text-2xl font-semibold'}>{rec.items.map((i) => i.name).join(' + ')}</h2>
      <p className="text-stone-600">
        {rec.restaurant.name}
        {rec.restaurant.rating !== undefined ? ` · ${rec.restaurant.rating.toFixed(1)} stars` : ''}
        {rec.restaurant.openNow === false ? ' · closed now' : ''}
      </p>
      {rec.menuless ? <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Menu not read yet</p> : null}

      <ul className="mt-4 space-y-2">
        {rec.items.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-4">
            <div>
              <p className="font-medium">{i.name}</p>
              {i.description ? <p className="text-sm text-stone-600">{i.description}</p> : null}
            </div>
            <span className="shrink-0 text-sm text-stone-700">{price(i.priceCents)}</span>
          </li>
        ))}
      </ul>
      {rec.items.length > 1 && total > 0 ? <p className="mt-2 text-right text-sm text-stone-500">Together {price(total)}</p> : null}

      <p className={`mt-4 ${secondary ? 'text-sm text-stone-700' : 'text-stone-800'}`}>{rec.explanation}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {rec.links.website ? <a className="rounded-full bg-stone-800 px-4 py-1.5 text-white" href={rec.links.website} target="_blank" rel="noreferrer">View restaurant</a> : null}
        {rec.links.maps ? <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.maps} target="_blank" rel="noreferrer">Google Maps</a> : null}
        <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.doordash} target="_blank" rel="noreferrer">Find on DoorDash</a>
        <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.ubereats} target="_blank" rel="noreferrer">Find on Uber Eats</a>
      </div>
    </article>
  );
}
```

`src/client/screens/Recommendation.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { FEEDBACK_LABELS, FEEDBACK_REASONS, type FeedbackReason } from '../../core/feedback';
import type { RecommendResponse } from '../../shared/api';
import { api, ApiRequestError, isDebug } from '../api';
import { DebugDrawer } from '../components/DebugDrawer';
import { RecommendationCard } from '../components/RecommendationCard';

interface Props {
  sessionId: string;
  force: boolean;
  onStartOver: () => void;
}

export function Recommendation({ sessionId, force, onStartOver }: Props) {
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = async (fn: () => Promise<RecommendResponse>) => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await fn());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not make a dishision. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(() => api.recommend(sessionId, force));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const feedback = (reason: FeedbackReason) => load(() => api.feedback(sessionId, reason));

  return (
    <div className="mt-10 space-y-6">
      {busy && !result ? <p className="text-center text-stone-500">Making a dishision…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {result?.primary ? <RecommendationCard rec={result.primary} /> : null}
      {result && !result.primary ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
          <h2 className="text-xl font-semibold">No match.</h2>
          <p className="mt-2 text-stone-700">{result.message}</p>
        </section>
      ) : null}

      {result?.primary ? (
        <section>
          <p className="mb-2 text-sm text-stone-500">Not it? Tell me why and I will pick again.</p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((reason) => (
              <button key={reason} type="button" disabled={busy} onClick={() => feedback(reason)} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm hover:border-stone-500 disabled:opacity-50">
                {FEEDBACK_LABELS[reason]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {result?.runnerUp ? <RecommendationCard rec={result.runnerUp} secondary /> : null}

      <button type="button" className="text-sm text-stone-600 hover:underline" onClick={onStartOver}>
        Start over
      </button>

      {isDebug && result ? <DebugDrawer title="recommendation" data={{ debug: result.debug, primaryTrace: result.primary?.trace, runnerUpTrace: result.runnerUp?.trace }} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: Wire the screen and a "Just decide" shortcut into App and Conversation**

In `src/client/App.tsx`, add state `const [forceDecide, setForceDecide] = useState(false);`, import `Recommendation`, and replace the placeholder "Enough to go on." section with:

```tsx
      {session && (session.status !== 'asking' || forceDecide) ? (
        <Recommendation sessionId={session.id} force={forceDecide} onStartOver={reset} />
      ) : null}
```

Change the conversation line to `{session?.status === 'asking' && !forceDecide ? <Conversation session={session} onUpdate={update} onDecide={() => setForceDecide(true)} /> : null}` and make `reset` also call `setForceDecide(false)`.

In `src/client/screens/Conversation.tsx`, add `onDecide: () => void` to `Props` and render, under the question card when `question.round === 2`:

```tsx
      {question.round === 2 ? (
        <button type="button" className="mt-3 text-sm text-stone-500 hover:underline" onClick={onDecide}>
          Just decide
        </button>
      ) : null}
```

- [ ] **Step 4: Verify by hand**

Run: `pnpm typecheck` then `pnpm test` (expect green), then `pnpm dev` and open `http://localhost:5173/?debug=1`.

Checklist:
1. ZIP `94110`, answer: normal, comforting (tap twice), beef, "Either", nothing to avoid. Round two: brothy yes, heaviness "On the lighter side", any beef. The card shows a beefy soup or soup plus beef pair, the explanation names the dishes and mentions broth, the runner-up is from another restaurant, and the debug drawer shows traces and the ranked list.
2. Tap "Too heavy": a different dish appears and the debug drawer's `rejectedItemIds` includes the previous items. Tap "Just show me another" several times; nothing repeats.
3. Start over, choose starving, rich, beef, "Familiar favourite"; round two asks hands. Expect a burger or cheesesteak.
4. Start over, exclude every cuisine on the avoid question; expect the "No match." card, not an error.
5. In round two, "Just decide" produces a recommendation immediately.
6. Reload on the recommendation screen: the same recommendation returns.

Stop the dev server.

- [ ] **Step 5: Update README.md**

Replace the Development section with:

```markdown
## Development

    pnpm install
    pnpm db:migrate      # creates the local D1 database under .wrangler/state
    pnpm dev             # Vite + Worker on one port; open the printed URL, add ?debug=1 for traces

    pnpm test            # core (node), worker (workerd) and client (jsdom) tests
    pnpm typecheck

Phase 1 runs entirely on fixture data: a dozen San Francisco restaurants in
`fixtures/sf.ts`. Any five-digit ZIP works. Real discovery and menu ingestion
arrive in the next plan.

## How a session works

1. Five fixed questions: hunger, how dinner should feel, protein, familiar or
   interesting, anything to avoid. Chips cycle: one tap for sounds good, two
   for really want.
2. Up to three adaptive follow-ups chosen by rules in `kb/questions.json`.
3. Every candidate dish is scored against the preference profile. Pairs from
   one restaurant can win if together they cover more of what you asked for.
4. You get one recommendation, a runner-up, and feedback chips that re-rank
   without asking anything again.

"Other" on any question accepts free text. In this phase it is parsed by a
keyword fallback; an LLM provider slots in behind the same interface later.
"Missing an option?" files a suggestion for review.

## Manual checklist

See `docs/superpowers/plans/2026-10-08-dishision-phase-1-conversation-and-ranking.md`, Task 15, Step 4.
```

- [ ] **Step 6: Commit**

```bash
git add src/client README.md
git commit -m "Add recommendation screen with feedback, runner-up and Just decide"
```

---

## Self-review notes

- **Spec coverage, this plan:** landing, location input, conversation flow, structured preference state, adaptive round two, scoring and ranking, pairs, primary and runner-up, template explanation, "show me another" with reasons, suggestion queue capture, knowledge base overlay merge, debug drawer, links out. Deliberately deferred to the next plans: Google Places, geocoding, menu fetching and extraction, LLM tagging, job pump and Cron, searching screen, paste-a-menu, admin page and moderation approve flow, deploy.
- **Known rough edge:** reloading a recommended session re-runs `recommend` and inserts a second row. Acceptable for this phase; the ingestion plan adds a `GET /session/:id/recommendation` that returns the latest row.
- **Known rough edge:** `had_recently` feedback resolves the archetype by substring match on fixture ids. The D1-backed candidate source in the next plan carries `archetypeId` on stored items and the route should read it from there.
- **Type consistency checked:** `AnswerInput` (core) is re-exported as `AnswerDto`; `Recommendation` (core) maps to `RecommendationDto` only in `src/worker/recommendation.ts`; `ScoringContext.rejectedItemIds` is a `ReadonlySet`, built from `ConversationState.rejectedItemIds: string[]` at the route boundary.
