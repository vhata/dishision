# Dishision

Make a dishision.

A web app for people who know they need dinner but cannot name what they want.
It asks a few adaptive questions about how dinner should feel, then recommends
a specific dish or pair of dishes from a nearby restaurant, with a grounded
explanation.

## Development

    pnpm install
    pnpm db:migrate      # creates the local D1 database under .wrangler/state
    pnpm dev             # Vite + Worker on one port; open the printed URL, add ?debug=1 for traces

    pnpm test            # core (node), worker (workerd) and client (jsdom) tests
    pnpm typecheck

    bash scripts/setup.sh   # install dependencies and the git hooks (once per clone)
    bash scripts/check.sh   # the gates CI runs: typecheck, then tests

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

## Layout

- `src/core/`: pure reasoning. Preference model, knowledge base, question graph, planner, scorer, templates.
- `kb/`: the knowledge base. Questions, dish archetypes, lexicon. Content lives here, not in code.
- `src/worker/`: Hono API on Cloudflare Workers, D1 access.
- `src/client/`: React SPA.
- `src/providers/`: seams for restaurants, menus, geocoding and the LLM, with fixture implementations.
- `docs/superpowers/specs/`: design. `docs/superpowers/plans/`: implementation plans.

## Working on it

Agents and contributors follow [AGENTS.md](AGENTS.md): one branch, worktree and PR per unit of work, deferred work in [TODO.md](TODO.md), gates in [docs/QUALITY.md](docs/QUALITY.md), structure and invariants in [ARCHITECTURE.md](ARCHITECTURE.md).

## Manual checklist

See `docs/superpowers/plans/2026-10-08-dishision-phase-1-conversation-and-ranking.md`, Task 15, Step 4.
