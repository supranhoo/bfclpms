## Context
The user confirmed they want to keep manual refresh for updating Org KPI gap flags after fixing a mapping. The existing refresh button sits beside "Load scope" in the Bulk Review Dashboard header.

## Current Gap
Clicking the Refresh button today only calls `snapshot.refetch()`, which re-fetches the accumulated snapshot (`bulk_review_snapshot_all`). It does **not** invalidate the separate `rpc_kpi_org_flags` query that powers the gap badges, nor the `bulk_employee_attrs` query that powers the Designation/Grade/Manager filters. After a user fixes an Org KPI mapping elsewhere and clicks Refresh, the gap badges would still show stale data.

## Plan
1. **Import `useQueryClient`** from `@tanstack/react-query` in `BulkReviewDashboard.tsx`.
2. **Replace the refresh `onClick`** so it invalidates all three bulk-related query keys:
   - `['bulk_review_snapshot_all', period, year, viewerStage, filters]`
   - `['rpc_kpi_org_flags', ...]` (org-level / gap badges)
   - `['bulk_employee_attrs', ...]` (designation / grade / manager options)
3. **Keep the same UI position** — the refresh button remains the small outline icon button directly beside "Load scope". No visual layout changes.
4. **Keep `refetchOnWindowFocus: false`** — manual remains the only trigger.

## Impact
- **Data Impact**: None — purely client-side query invalidation.
- **Workflow Impact**: Users can now trust that the Refresh button updates gap badges after fixing Org KPI mappings.
- **UI/UX Impact**: Zero visual change; button behavior becomes correct.
- **Regression Risk**: Very low — adding query invalidation is additive.
- **Rollback**: Revert the single `onClick` handler change.

## Files
- `src/pages/review/BulkReviewDashboard.tsx`