
## Plan — Add Refresh Button to Reviewer Dashboard Grid

### Goal
Add a manual **Refresh** button to the reviewer dashboards (HR PMS, Audit, Management, Team Reviews, Pending Review buckets) so users can force-refetch employee, KPI, and submission-score data without a full page reload.

### Placement
Inside `EmployeeSelectorGrid.tsx`, in the header row next to the period/view controls (left of or beside the "Show only Reviewed" toggle). Visible across all reviewer modes that use this grid.

### Behavior
- Icon button (`RefreshCw` from lucide-react) with tooltip "Refresh data".
- On click: invalidates the relevant React Query caches so all underlying hooks refetch:
  - `useProfilesByWorkflowStage` (employees in stage)
  - `useKpisByPeriodRanges` (KPI rows)
  - `useReviewSubmissionScoresByKpiIds` (per-stage scores)
  - any related count/eligibility queries used by stat cards
- Spinner animation (`animate-spin`) while any of these queries are fetching; button disabled during fetch to prevent spam.
- Toast confirmation ("Data refreshed") on completion.

### Implementation Approach
1. In `src/components/review/EmployeeSelectorGrid.tsx`:
   - Import `useQueryClient` and `RefreshCw`.
   - Add a `handleRefresh` that calls `queryClient.invalidateQueries` for the query keys used by the grid hooks (scoped by predicate matching `['profiles-by-workflow-stage', ...]`, `['kpis-by-period-ranges', ...]`, `['review-submission-scores', ...]`).
   - Track combined `isFetching` from those hooks (or via `useIsFetching` with matching keys) to drive spinner + disabled state.
   - Render the button in the existing header toolbar.
2. No changes to hooks themselves — they already expose standard React Query keys.

### Risk & Impact Report
- **Data impact:** None — read-only refetch, no writes.
- **Workflow impact:** None.
- **UI/UX:** Minor addition to header; matches existing button styling (`variant="outline"`, `size="sm"`).
- **Regression risk:** Low. Only adds a manual invalidation path; existing auto-fetching behavior unchanged.
- **Mitigation:** Disable button while fetching to avoid request storms; scope invalidation by query-key predicate so unrelated caches aren't dropped.

### Files to Change
| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add Refresh button + invalidation handler + fetching state |
| `DOCUMENTATION.md` | v2.66.7.23 — manual refresh control on reviewer grid |
| `POLICY.md` | §94 — reviewer dashboards must expose a manual refresh that invalidates employee, KPI, and submission-score caches together |

### Out of Scope
- No auto-refresh / polling interval (kept manual to control Cloud load).
- No refresh button inside `UnifiedScorecard` (separate surface; can be added later if requested).
