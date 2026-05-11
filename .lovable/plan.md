Do I know what the issue is? Yes.

The previous change only made the dashboard show the timeout error clearly. The underlying failures are still happening. Current evidence shows three concrete timeout sources:

1. `profiles` full-roster queries with embedded `departments` are timing out.
2. `kpis` period queries for May 2026 are timing out because the current index does not match the filter plus sort pattern.
3. `review_submissions` score lookups are being executed twice from the dashboard and are still timing out under RLS-heavy access policies.

## Risk & Impact Report

- **Data Impact:** No historical KPI/review data will be changed. I will add read-performance indexes and, if needed, a read-only slim RPC/view for dashboard score rows.
- **Workflow Impact:** No workflow stage rules, reviewer permissions, or score calculations will change.
- **UI/UX Consistency:** The current dashboard layout stays the same; the goal is to make data load rather than keep showing the error block.
- **Regression Risk:** Medium, because `useProfiles`, KPI period loading, and submission score hooks are shared across reviewer dashboards.
- **Mitigation Plan:** Keep the same data contracts, add tests for the dashboard score map/fallback behavior, and update `DOCUMENTATION.md` + `POLICY.md` in the same implementation step.

## Implementation Plan

### 1. Add database performance indexes
Add targeted indexes for the exact failing query shapes:

- `profiles`: active roster sorted by `full_name`.
- `kpis`: `(review_period, review_year, created_at desc, id)` for dashboard period queries.
- If query planning still shows RLS-heavy submission scans, add a read-optimized, secured function for dashboard score rows instead of relying on repeated client-side `.in('kpi_id', batch)` calls.

### 2. Make profile roster loading lean
Update `useProfiles()` and `useProfilesByWorkflowStage()` so they do not fetch `profiles.*` with embedded `departments` for every active employee.

- Fetch only fields the dashboard actually renders.
- Fetch departments separately once and hydrate client-side.
- Keep `is_active = true` and full pagination intact.

### 3. Remove duplicate `review_submissions` score queries
Replace the current two score-fetching paths:

- `useReviewSubmissionScoresByKpiIds(periodKpiIds)`
- `useEmployeeScoresForPeriod(periodKpis)`

with one shared slim score-row hook/service that returns all score columns needed for:

- reviewed counters
- progress bars
- weighted employee score map

This cuts the biggest duplicated dashboard load.

### 4. Make dashboard error tracking complete
Update `EmployeeSelectorGrid.tsx` so the error panel includes:

- KPI period query failures
- submission score query failures
- employee score aggregation failures
- profile/stage roster failures

Also fix the refresh spinner key mismatch: it currently watches `review-submission-scores`, but the real query key is `review-submission-scores-by-kpi-ids`.

### 5. Reduce workflow resolution pressure
Keep workflow resolution period-aware, but avoid resolving workflows for the whole org when a narrower data set is enough.

- For Pending Self/Manager/Skip dashboards, derive visible employees primarily from period KPI rows and the required status.
- Only call bulk workflow resolution for employees needed by the selected view/page calculations.

### 6. Regression coverage and policy sync
Add/update tests for:

- one submission score fetch feeding both reviewed stats and weighted score calculation
- dashboard error state when submission score query fails
- active-profile roster hydration still preserving department names

Update:

- `DOCUMENTATION.md` version history
- `POLICY.md` dashboard query performance rule
- relevant memory if the implementation creates a new invariant

## Expected Result

Vivek 101784 should no longer see the persistent “Couldn’t load this dashboard” screen on Pending Self Review / Audit / HR PMS / Management dashboards. The dashboards should load using leaner profile reads, indexed KPI period reads, and a single submission-score fetch path.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
  <lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>