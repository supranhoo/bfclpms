

# Fix: Completion Percentage Showing 17% for All Months

## Root Cause

The "Completion" percentage is **never dynamically calculated** from actual KPI data. Here's what happens:

1. The `completion_percentage` column in `review_periods` table defaults to `0`
2. The `ReviewPeriodOverview` component uses: `period.completion_percentage || progressPct`
3. Since `completion_percentage` is `0` (falsy), it falls back to `progressPct`
4. `progressPct` is calculated from the governance stage index: `(currentIdx + 1) / 6 * 100`
5. All periods are at `planning` stage (index 0), so: `1/6 ≈ 17%`

The same issue affects the `ReviewPeriodStatusWidget` on the Management Dashboard.

## Fix

Calculate completion dynamically from actual KPI workflow statuses when fetching period data, rather than relying on a static DB column.

### 1. Update `ReviewPeriods.tsx` query (data fetching)

Extend the existing query to also fetch KPI statuses per period. Calculate completion as:

```
completion = (approved KPIs / total KPIs) * 100
```

Where "approved" means KPIs with `status = 'approved'`. This gives a real percentage based on how many KPIs have completed the full workflow.

The query already fetches `review_period` and `review_year` from `kpis` — we add `status` to the select, then compute the ratio per period.

### 2. Update `ReviewPeriodStatusWidget.tsx` query

Same approach: fetch KPI statuses alongside period data to compute real completion instead of using the static DB value.

### 3. Update `ReviewPeriodOverview.tsx` display logic

Remove the `|| progressPct` fallback for the Completion card. The stage-based progress already has its own dedicated "Stage Progress" pipeline visualization — conflating it with KPI completion is misleading. The Completion card should show KPI-based completion only.

### Files Modified
- `src/pages/admin/ReviewPeriods.tsx` — compute real completion from KPI statuses
- `src/components/management/ReviewPeriodStatusWidget.tsx` — compute real completion from KPI statuses
- `src/components/admin/ReviewPeriodOverview.tsx` — remove misleading stage-based fallback

### No database or RLS changes needed

