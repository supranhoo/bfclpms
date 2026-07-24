
## What we know

- DB confirms one `active` cycle: **Annual Review - 2025-2026** (`b82a935f…`), with **2,580** instances (1,767 completed, 279 pending_bu, 12 pending_dept, 31 pending_self, 17 pending_management, 474 excluded).
- Viewer Ankit Choudhary (101785) has roles `admin, platform_owner`.
- RLS `instances_select_visible` grants full SELECT to `admin` and `hr_pms` — so counts must not be blocked by policy.
- Progress tab tiles are driven by `useCycleStatusCounts(activeCycle?.id)` → `getCycleStatusCounts` in `src/services/annualReview/annualReviewService.ts`, which runs `count: 'exact', head: true` queries filtered only by `cycle_id`.
- Because the "Activate a cycle to see progress." fallback is NOT rendered in the screenshot, `activeCycle` did resolve — so the 0s can only come from the count queries returning 0, from an unresolved/failed fetch, or from a stale/mismatched cached `activeCycle.id`.

## Likely root causes (unverified — must confirm from client)

1. **PostgREST count request failed silently** (e.g. transient 5xx / auth token race). React Query keeps the destructure default `{ total: 0, … }`, so tiles render 0 even though DB has 2,580 rows. Same failure would also explain the empty paginated grid ("No instances.") because both queries hit the same table.
2. **Stale `activeCycle` cache** from a previous session where no cycle was active. The `useActiveCycle` query uses `annualReviewKeys.activeCycle()` with default staleTime; on this render it may still be returning a cached stale value whose `id` does not match the current active cycle. Count query then targets a non-existent cycle → 0.
3. **Admin View toggle mismatch** (see `mem://features/admin/admin-role-switch`). If the natural role mask silently downgrades the JWT-visible role before RLS evaluation, `has_role('admin')` false → 0 rows. Screenshot shows toggle ON, so this is lowest probability but worth confirming.

## Plan

### Step 1 — Confirm which cause is real (no code change)

Ask the user (or check via Playwright driving `/annual-review-admin` in the sandbox) to:
- Open DevTools → Network, filter `annual_review_instances`, reload the page.
- Capture:
  - The `cycle_id` param actually sent.
  - HTTP status of the count call (`select=id&…&cycle_id=eq.<uuid>` with `Prefer: count=exact`, `HEAD`).
  - Any `Postgrest` error body (403 / 42501 / 42P17 / 42883).

Verification: response headers `Content-Range: 0-*/<n>`. If `<n> = 2580`, tiles are wrong for a different reason (state). If HTTP is non-200 or `<n> = 0`, we know it is a query-time failure.

### Step 2 — Fix based on evidence

- **If cause 1 (silent count failure):**
  - Surface the error instead of swallowing it: change `useCycleStatusCounts` to expose `error`/`isError`, and in `ProgressTab` render a red inline alert with a Retry button when the counts query errors. Prevents "0" from ever masking a failed fetch.
  - Add `refetchOnWindowFocus: true` and `retry: 2` for that query.

- **If cause 2 (stale `activeCycle`):**
  - Set `staleTime: 0` and `refetchOnMount: 'always'` on `useActiveCycle`, or add a manual invalidation of `annualReviewKeys.activeCycle()` on ProgressTab mount.
  - Also add a hard equality guard: if `activeCycle.status !== 'active'`, treat as no cycle and refetch.

- **If cause 3 (admin role mask):**
  - Add a dev-only banner on ProgressTab when `has_role(auth.uid(),'admin')` returns false but the local role mask says admin, so the mismatch is obvious.

### Step 3 — Regression protection

Add a Vitest for `getCycleStatusCounts` that:
- Mocks 2,580 rows across mixed statuses and asserts `total === 2580` and per-status buckets match.
- Mocks a PostgREST error and asserts the hook exposes `isError = true` (rather than silently defaulting to 0).

### Step 4 — Doc & policy touch-ups

- Append to `DOCUMENTATION.md` under Annual Review Admin: "Progress tiles must never render silent zeros; a failed count query surfaces an inline error with Retry."
- Add short note to `POLICY.md`: **§AR-ADMIN-PROGRESS-NO-SILENT-ZERO** — count/aggregate widgets on admin dashboards must distinguish loading / error / empty from zero.

## Risk & impact

- Data: none (read-only diagnostics + hook wiring).
- Workflow: none.
- UI: an inline error alert appears above the tiles only when the count query fails; layout unchanged otherwise.
- Regression: low — hook signature stays backward-compatible; only ProgressTab consumes new `isError`.

## What I need from you before implementing

One of:
- A screenshot of the Network tab entry for `annual_review_instances?select=id…` (status code + `Content-Range`), **or**
- Permission to just implement Step 2 option 1 + option 2 together (both are safe additive changes) and ship the diagnostic banner so the next occurrence is self-explanatory.
