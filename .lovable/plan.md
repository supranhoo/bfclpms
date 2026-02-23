

# Fix: KPI Mapping Matrix Missing Non-Monthly KPIs

## Problem

The KPI Mapping Matrix shows **90% weightage** for Rupesh Kumar Sharma because his Quarterly KPI (review_period = 'Q3') is not being fetched. The current query only looks for monthly period names like 'July', 'August', etc., so non-monthly KPIs (Quarterly, Half-Yearly, Yearly, Bi-Monthly) are invisible to the matrix.

This is the same root cause as the recently fixed KRA Issuance dialog bug.

## Root Cause

In `src/hooks/useAdminReports.ts` (lines 72-84), the fetch query filters by:
```
.in('review_period', ['July', 'August', ...])
```

A Quarterly KPI with `review_period = 'Q3'` and `frequency_cycle_start = 'Jul-Sep'` covers January-March, but is never matched because 'Q3' is not in the month name list.

## Fix

### 1. `src/hooks/useAdminReports.ts` -- Expand Query and Map Non-Monthly KPIs

**Query change:** Remove the `.in('review_period', months)` filter. Instead, fetch ALL KPIs for each relevant `review_year`, also selecting `frequency` and `frequency_cycle_start`.

**Mapping change:** After fetching, determine which fiscal months each KPI covers:
- Monthly KPIs: map `review_period` directly to the month (existing logic)
- Non-monthly KPIs: use the KPI's `frequency` and `frequency_cycle_start` to look up the cycle option, find which months are in the period's locked group (plus the active month), and mark all those months

This uses the existing `getCycleOptionsForFrequency` and cycle option data from `frequencyCycleOptions.ts`.

**New helper function** `getMonthsForPeriod(reviewPeriod, frequency, cycleStart)`:
- For monthly KPIs, returns the single calendar month index
- For non-monthly KPIs, looks up the cycle option and returns all month numbers covered by that period label

### 2. `DOCUMENTATION.md` -- Version Bump

Version bump to 1.45.72.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `src/hooks/useAdminReports.ts`, `DOCUMENTATION.md` |
| Query change | Remove `.in('review_period', months)` filter; add `frequency, frequency_cycle_start` to select |
| Data impact | None -- read-only query expansion |
| Regression risk | Low -- only adds previously missing KPIs to the matrix |
| Performance | Slightly more rows fetched, but processing is client-side and fast |

