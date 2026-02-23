

# Fix: Admin KPI Dashboard - Include Non-Monthly KPIs in Period Filter

## Problem

On the Admin KPI Dashboard (`/admin/kpis`), when filtering by period "February", only KPIs with `review_period = 'February'` are shown. Rupesh Kumar Sharma has a Quarterly KPI with `review_period = 'Q3'` and `frequency_cycle_start = 'Jul-Sep'`, which covers January through March (including February). This KPI is excluded by the strict string match, causing the weightage to display 90% instead of 100%.

## Root Cause

In `src/pages/admin/AllKpis.tsx`, line 153:
```
if (selectedPeriod !== 'all' && kpi.review_period !== selectedPeriod) {
  return false;
}
```

This is a direct string comparison. A Quarterly KPI with `review_period = 'Q3'` will never match the selected period `'February'`.

## Fix

### 1. `src/pages/admin/AllKpis.tsx` -- Expand Period Filter Logic

Import `getCalendarMonthsForPeriod` from `useAdminReports.ts` (or extract it to a shared utility) and the `MONTH_NAMES` array.

When a month name is selected as the period filter (e.g., "February"):
- Monthly KPIs: keep existing direct match (`review_period === 'February'`)
- Non-monthly KPIs: use `getCalendarMonthsForPeriod(kpi.review_period, kpi.frequency, kpi.frequency_cycle_start)` to resolve the calendar months the KPI covers. If the selected month's index is in that list, include the KPI.

When a non-month period is selected (e.g., "Q3"): keep existing direct match behavior.

### 2. `src/hooks/useAdminReports.ts` -- Export Helper

Export the `getCalendarMonthsForPeriod` function and `MONTH_NAMES` so they can be reused in AllKpis.tsx.

### 3. `DOCUMENTATION.md` -- Version Bump

Version bump to 1.45.73.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `src/pages/admin/AllKpis.tsx`, `src/hooks/useAdminReports.ts`, `DOCUMENTATION.md` |
| Logic change | Period filter now checks if non-monthly KPIs cover the selected month |
| Data impact | None -- client-side filter logic only |
| Regression risk | Low -- only adds previously excluded KPIs; monthly KPIs unaffected |

