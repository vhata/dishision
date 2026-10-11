# Dishision: agent contract

Dishision ("Make a dishision.") asks how dinner should feel, then picks the exact dish to order from a nearby restaurant and explains why. It is a personal project for the owner's household with no delivery deadline, built so a public product stays possible: provider seams, nullable session owner, coarse location only, no terms-breaking data access, and as little LLM as a good product allows. The design is [`docs/superpowers/specs/2026-10-08-dishision-design.md`](docs/superpowers/specs/2026-10-08-dishision-design.md); read it before changing behaviour.

<!-- docket:begin -->
## Docket

This project is run with docket. Read [docket/CONTRACT.md](docket/CONTRACT.md) before any work; it is the authoritative workflow, and this section records only this project's settings. The installer keeps this section current: the text above the list is rewritten on every run, the list keeps the values this project has set.

- Queue areas: `[CORE]` (src/core, scoring and conversation logic), `[KB]` (kb/*.json content), `[WORKER]` (src/worker, D1, routes), `[CLIENT]` (src/client), `[PROVIDERS]` (src/providers seams and implementations), `[TOOLING]` (scripts, CI, hooks, dependencies), `[DOCS]`.
- Concurrency cap: 3 concurrent test or build runs; each worker test run starts its own workerd.
- Merging and releases: the user merges unless they delegate it in that turn. Deploys (`pnpm deploy`, `wrangler deploy`, remote D1 migrations) and release tags need the user's explicit sign-off in the current or preceding turn.
- Optional pieces in force: all of them, including the review ledger, stacked PRs and the scheduled validation of main.
- Environment: the user runs `pnpm dev` and the manual checklist in `README.md`. Agents verify through the test projects and, when a change needs it, a scripted API smoke against a dev server they start and stop themselves on a free port. Nothing in this repository calls an external API in phase 1; adding a real provider is its own PR with budget guards.
- Plans: `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`, not `plans/`; the direct-to-main rule applies to them unchanged.
- Shared interfaces: listed in [`ARCHITECTURE.md`](ARCHITECTURE.md#shared-interfaces); they land or are explicitly stacked before dependents start.
- Commits: plain imperative subject, no attribution trailers or generated-with footers. The repository's git identity (personal email) is already set.
<!-- docket:end -->

## Where to find what

- `README.md`: build, run, scripts, manual checklist.
- `ARCHITECTURE.md`: structure, shared interfaces, invariants, per-worktree isolation.
- `docs/DECISIONS.md`: non-obvious choices and their trade-offs. Read before changing a mechanism that looks odd.
- `docs/QUALITY.md`: what quality means here, the gates, and the review inputs.
- `TODO.md`, `review/`: deferred work and the review ledger.
- `docs/superpowers/specs/`: the design, including the implementation phases that serve as the roadmap. `docs/superpowers/plans/`: implementation plans and their execution logs.
