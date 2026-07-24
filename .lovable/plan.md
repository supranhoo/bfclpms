## RCA — "Could not load hierarchy reviews" and empty Admin Progress tiles

### 5 Whys (hierarchy tab)
1. Why does the "Hierarchy — Completed" tab show a red error and zero rows? → The RPC `get_hierarchy_completed_reviews` throws a Postgres error before returning.
2. Why does the RPC throw? → `ERROR: column emp.business_unit_id does not exist` (verified by running the RPC as an admin user against the live DB).
3. Why did the RPC reference `emp.business_unit_id`? → The ADR-162 function joined `business_units bu ON bu.id = emp.business_unit_id`, assuming BU lived on `profiles`.
4. Why doesn't `profiles.business_unit_id` exist? → BU membership on this platform is derived through `departments.business_unit_id`, not stored directly on the profile.
5. Root cause → An incorrect schema assumption in the ADR-162 RPC. All hierarchy calls fail immediately, regardless of the caller's role or subtree.

### Admin Progress tiles showing 0
- Verified in DB: cycle `Annual Review – 2025-2026` has 2,580 instances (1,767 completed, 279 pending_bu, …).
- RLS on `annual_review_instances` allows `admin` / `hr_pms` full SELECT — the count RPC is not blocked.
- The Admin Progress page (`AnnualReviewAdmin.tsx`) uses `getCycleStatusCounts` (head-count queries) and is independent of the hierarchy RPC. The most likely cause of tiles being 0 in the screenshot is that no active cycle was resolved at load time (screenshot was taken during initial fetch, or `activeCycle?.id` was still undefined). No code fault was found in the counts path.
- The plan therefore fixes the confirmed backend defect (hierarchy RPC) and adds a small frontend guard to surface a clear message when the Admin page has no active cycle, so a transient empty state stops being mistaken for real zero data.

### CAPA

**Correction (backend, single migration)**
Recreate `public.get_hierarchy_completed_reviews(uuid, text, int, int)` with the correct BU join:

```
LEFT JOIN public.departments   dept ON dept.id = emp.department_id
LEFT JOIN public.business_units bu  ON bu.id   = dept.business_unit_id
```

No signature change, no RLS change, no policy change. Everything else (auth guard, subtree scope, login-employee gate, viewer_relationship classification, pagination, search) stays byte-identical to ADR-162.

**Corrective (frontend, presentation only)**
- `HierarchyCompletedList.tsx` already renders a retry alert on error — no change needed once the RPC is fixed.
- `AnnualReviewAdmin.tsx`: when `activeCycle?.id` is undefined, render a small inline notice above the tiles ("No active cycle selected — pick a cycle to see progress") instead of silently showing `0 / 0 / 0 / 0`. Zero real code-path change; purely a clarifying label.

**Preventive**
- Add a Vitest for `listHierarchyCompletedReviews` that mocks a minimal RPC response so a regression in the service contract is caught.
- Add a note to `docs/adr/ADR-162.md`: "BU is resolved via departments.business_unit_id — profiles has no business_unit_id column."

### Risk & Impact

| Area | Impact |
| --- | --- |
| Data | None. Read-only function replacement. |
| Workflow | None. |
| UI | Hierarchy tab starts loading rows; Admin tiles gain a "no active cycle" notice. |
| RLS / Security | Unchanged — same auth guard and same visibility predicates. |
| Regression | Very low. Function body identical except one join column. |
| Rollback | Redeploy previous function body (kept in git history / ADR-162 migration). |

### Files to touch

- Migration: `CREATE OR REPLACE FUNCTION public.get_hierarchy_completed_reviews(...)` with the corrected BU join.
- `src/pages/annual-review/AnnualReviewAdmin.tsx`: add the "no active cycle" hint above the summary tiles.
- `src/test/annualReview/hierarchyCompleted.test.ts` (new): contract test for `listHierarchyCompletedReviews`.
- `docs/adr/ADR-162.md`: append clarification about the BU column.

### Verification

1. Reload the Team Annual Review page → "Hierarchy — Completed" tab shows counts and rows for the caller's subtree; error alert gone.
2. As Admin, open Annual Review Admin → tiles reflect real counts (total 2,580, completed 1,767 for the active cycle).
3. `bunx vitest run src/test/annualReview/hierarchyCompleted.test.ts` passes.

Switch to build mode to apply.