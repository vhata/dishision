# Dishision: agent contract

Dishision ("Make a dishision.") asks how dinner should feel, then picks the exact dish to order from a nearby restaurant and explains why. It is a personal project for the owner's household with no delivery deadline, built so a public product stays possible: provider seams, nullable session owner, coarse location only, no terms-breaking data access, and as little LLM as a good product allows. The design is [`docs/superpowers/specs/2026-10-08-dishision-design.md`](docs/superpowers/specs/2026-10-08-dishision-design.md); read it before changing behaviour.

## Workflow

- Every unit of work is a branch, a worktree and a pull request. Branch `<queue>/<slug>` (`todo/`, `review/`, `roadmap/`; `fix/` or `task/` for direct requests). Worktrees live in `.worktrees/` (ignored) or the harness's own location.
- Two things go straight to `main` without a branch or PR. Documentation that records work to be done: adding or triaging `TODO.md` entries, and plans (`docs/superpowers/plans/YYYY-MM-DD-<slug>.md`); a plan is planning for work, not work, and everything it describes still goes through branches, PRs and review. Housekeeping metadata files such as `.git-blame-ignore-revs`, only when the user says so for that case. Extrapolate with common sense and say so in the commit; everything else, including all code and any documentation that describes behaviour, goes through a PR.
- Before claiming anything run `bash scripts/workflow/claim-check.sh <slug>` (open and merged PRs, branches, worktrees), then create the branch and worktree immediately with `bash scripts/workflow/start-work.sh <queue> <slug>`.
- Open a draft PR after the first meaningful commit. The body opens with `## Why`, then what changed, markers, validation, review. PRs are squash-merged, so the body is the commit message. Never merge with a one-line body. If no PR can be opened, save the body as `.feral/pr-<slug>.md`, say so, and leave the branch and worktree for the user.
- Parallelise independent work through sub-agents in separate worktrees with disjoint file ownership. Shared interfaces (`src/shared/api.ts`, `src/providers/types.ts`, `src/core/kb/schema.ts`, `migrations/`) land or are explicitly stacked before dependents start. The coordinating agent integrates, serialises edits to `TODO.md` and `review/BACKLOG.md`, and holds the push, merge and release gates. Cap at 3 concurrent test or build runs; each worker test run starts its own workerd.
- Every code-writing agent, including the coordinator, gets a separate reviewer agent before a PR is marked ready. The reviewer verifies the PR's claims and reports findings; the author fixes; the PR body records the review in a `## Review` section.
- Keep the branch on its stated outcome. A separately shippable idea becomes a queue entry with a `Source:` line (and a `Files TODO: <slug>` marker in the PR), then the original work continues. An unrelated P0 is reported immediately and work pauses for direction.
- Run `bash scripts/check.sh` before opening or updating a PR; `bash scripts/setup.sh` installs the hooks that run the same gates. Report checks actually run and their limits. An empty or skipped suite is a failure.
- Linear history: rebase, never merge `main` into a branch; `--force-with-lease` on PR branches only. The user merges unless they delegate it in that turn. Deploys (`pnpm deploy`, `wrangler deploy`, remote D1 migrations) and release tags need the user's explicit sign-off in the current or preceding turn.
- Commit regularly, one logical change per commit, in the style of the existing log: plain imperative subject, no attribution trailers or generated-with footers. The repository's git identity (personal email) is already set; sub-agents never change `git config`.
- Update documentation in the same PR when a change makes it inaccurate. Each rule has one authoritative home; link to it rather than restating it.
- The user runs `pnpm dev` and the manual checklist in `README.md`. Agents verify through the test projects and, when a change needs it, a scripted API smoke against a dev server they start and stop themselves on a free port. Nothing in this repository calls an external API in phase 1; adding a real provider is its own PR with budget guards.

## Process guides

Read only the guide the task needs.

- An idea surfaces, or you are selecting, claiming, moving or resolving deferred work: [`docs/TODO_GUIDE.md`](docs/TODO_GUIDE.md). "Grab a TODO" means `TODO.md` only; "grab a review finding" means `review/BACKLOG.md` only. Never switch queues.
- A codebase review is requested, or a PR resolves a review finding: [`docs/CODE_REVIEW_GUIDE.md`](docs/CODE_REVIEW_GUIDE.md).
- Changing code or validating a PR: [`docs/QUALITY.md`](docs/QUALITY.md).
- Working unattended under a broad autonomy grant: no pushes, merges, deploys or tags without the user's word; local branches with PR bodies in `.feral/pr-<slug>.md`; load-bearing decisions in `AUDIT.md` (excluded from git) with an undo line each.

## Where to find what

- `README.md`: build, run, scripts, manual checklist.
- `ARCHITECTURE.md`: structure, shared interfaces, invariants, per-worktree isolation.
- `docs/DECISIONS.md`: non-obvious choices and their trade-offs. Read before changing a mechanism that looks odd.
- `TODO.md`, `review/`: deferred work and the review ledger.
- `docs/superpowers/specs/`: the design, including the implementation phases that serve as the roadmap. `docs/superpowers/plans/`: implementation plans and their execution logs.

Every piece of this workflow is in force, including the review ledger (empty until the first review is requested), stacked PRs and the scheduled validation of main. Keep this file short. Add a line only when it prevents a concrete recurring mistake; details go in the guide that owns them.
