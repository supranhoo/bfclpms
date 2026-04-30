## Problem

The "Performance by Category (X%)" badge shows 93% even though total KPI weightage is 100%. This happens because `assignedWeight` is computed from `displayKpis`, which is filtered by `statusFilter`. When a status filter is active, only matching KPIs are summed, producing a partial total.

## Fix

In `src/components/review/UnifiedScorecard.tsx`, compute `assignedWeight` from the **full** `kpis` array (all KPIs for the period) instead of `displayKpis` (filtered subset). The category scores and rating math should still use `displayKpis` so filtering works as expected — only the badge total changes.

### Changes

**`src/components/review/UnifiedScorecard.tsx`**
- Add a separate `useMemo` (or compute inline) that sums `weightage` from the full `kpis` array, excluding only N/A submissions.
- Update the badge to use this new total instead of `scoreData.assignedWeight`.

**`src/test/scorecard/categoryWeightageBadge.test.tsx`**
- Add a test case: when a status filter hides some KPIs, the badge still shows the full 100%.

## Risk & Impact

- **Data Impact:** None — UI-only.
- **Workflow Impact:** None.
- **Regression Risk:** Low — only the badge source changes; rating math untouched.
