

# Fix: Server-Side Query Excludes Non-Monthly KPIs

## Problem

The client-side filter logic added previously is correct, but it never gets a chance to run. The **server-side query** in `useKpisByPeriod` (in `src/hooks/useKpis.ts`, line 205) applies a strict `.eq('review_period', selectedPeriod)` filter. When "February" is selected, the database only returns rows where `review_period = 'February'`. Rupesh Kumar Sharma's Quarterly KPI (`review_period = 'Q3'`) is never fetched from the database at all.

## Root Cause

```
// src/hooks/useKpis.ts line 205
.eq('review_period', selectedPeriod as string)
```

This strict server-side filter prevents non-monthly KPIs from ever reaching the client.

## Fix

### 1. `src/hooks/useKpis.ts` -- Fetch by Year Only When a Month Is Selected

When `selectedPeriod` is a month name (e.g., "February"), the query should fetch ALL KPIs for that year (filter by year only, not by period). The existing client-side filter in `AllKpis.tsx` will then correctly include/exclude non-monthly KPIs.

When `selectedPeriod` is a non-month value (e.g., "Q3", "H1"), keep the existing `.eq('review_period', ...)` behavior since those are direct matches.

**Logic change in `useKpisByPeriod`:**
- Import `MONTH_NAMES` from `useAdminReports`
- If `selectedPeriod` is in `MONTH_NAMES`, omit the `.eq('review_period', ...)` filter (fetch all KPIs for the year)
- Otherwise, keep the `.eq('review_period', ...)` filter as-is

### 2. `DOCUMENTATION.md` -- Version Bump

Version bump to 1.45.74.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `src/hooks/useKpis.ts`, `DOCUMENTATION.md` |
| Query change | When a month is selected, fetch all KPIs for that year instead of filtering by period server-side |
| Data impact | None -- read-only query change |
| Regression risk | Low -- client-side filter already handles period matching correctly; slightly more data fetched per request when a month filter is active |
| Performance | Minor increase in data fetched (all periods for a year instead of one), but bounded by year filter and paginated in 1000-row batches |

