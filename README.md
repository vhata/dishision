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
