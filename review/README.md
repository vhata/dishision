# Review index

Historical codebase reviews are immutable snapshots; the newest snapshot is the current finding inventory. Fix PRs supply evidence; the next incremental review verifies and records closure. Process: [docs/CODE_REVIEW_GUIDE.md](../docs/CODE_REVIEW_GUIDE.md). Promoted work: [BACKLOG.md](BACKLOG.md). Newest first; the top row is the baseline for the next incremental review. An empty index means no review has been recorded, not that there are no defects.

| Review (UTC) | Type | Reviewed commit | Open findings at close |
| --- | --- | --- | --- |
| [2026-10-09 09:01](2026-10-09-0901-full.md) | Full | `dc3eff5` on main | 54 |

## Pending reconciliation

Findings whose fix has landed with independent verification but whose closure the next review has not yet recorded. The next incremental review verifies each and clears the list.

| Finding | Fix PR and commit | Reviewer | Evidence |
| --- | --- | --- | --- |
| `review-due-fails-on-zero-churn` | #4 (ff504a0) | Independent reviewer agent at 0280707, re-checked at 25477ca | With this review's index row in place, `bash scripts/workflow/review-due.sh --paths "src kb fixtures migrations test"` exited 1 before the fix; after it prints the churn lines and `verdict: no review due`, exit 0. |
