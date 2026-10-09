# Dishision

Read `docs/superpowers/specs/2026-10-08-dishision-design.md` before changing behaviour.

- Reasoning code lives in `src/core/` and must stay free of Worker, DOM and provider imports.
- Knowledge base content lives in `kb/*.json`. Never hardcode questions, archetypes or lexicon entries in code.
- Final ranking is deterministic. No LLM picks or reorders recommendations.
- Explanations only use names, descriptions and prices from candidate data plus trace attributes.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm dev`, `pnpm db:migrate`.
- Commit messages: plain, imperative, no attribution footers.
