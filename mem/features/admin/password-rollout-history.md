---
name: Password Rollout History
description: Password tab of the User Access Sheet must show the full paginated rollout log per user, not just the last attempt
type: feature
---

# Password Rollout History (ADR-201, POLICY §113.1)

- `public.password_rollout_logs` is **append-only** — never update or delete rows.
- The User Access Sheet → **Password** tab shows **Rollout history** (all attempts, newest first),
  never a single "last rollout" card.
- Reads are server-side paginated: page size 10 via `.range()` + `count: 'exact'`. No unbounded
  log reads (POLICY §94).
- Each row: timestamp · status badge · email `sent` / error · error message · `By:` acting admin
  resolved from `generated_by` through ONE batched `profiles` `in()` lookup for the current page;
  unresolved ids render as `System`.
- Cache key is `['password-rollout-history', userId, page]`; after a generate action invalidate
  `['password-rollout-history', userId]` and reset the page to 0.
- Hook + pure helpers live in `src/hooks/usePasswordRollout.ts`
  (`usePasswordRolloutHistory`, `rolloutHistoryRange`, `performerLabel`).
- Regression: `src/hooks/__tests__/passwordRolloutHistory.test.ts`.