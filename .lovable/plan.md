

# RCA: Page Load Time Regression on /admin/kpis

## Root Cause

The AllKpis page fetches **all 4,693 KPIs across all periods and years** upfront, then fires **~47 sequential HTTP requests** to fetch queries for those KPIs (batched 100 IDs per request). The page only displays one period at a time via client-side filtering, but downloads the entire dataset on mount.

### Request Waterfall (current state)

```text
1. useAllKpis()        --> 5 paginated requests (1000 KPIs each)
2. useKpiQueries()     --> 47 sequential requests (100 IDs each, all returning empty [])
3. useProfiles()       --> 1 request
4. useDepartments()    --> 1 request
5. useDivisions()      --> 1 request
6. useKraCategories()  --> 1 request
                       --------
Total:                    ~55 HTTP requests on page load
```

The 47 kpi_queries requests alone add ~2-5 seconds of sequential latency (each waits for the previous to complete).

## Fix: Server-Side Filtering + Query Count via Database View

### Change 1: Replace `useAllKpis()` with period-scoped fetch

The page already has period/year filter state. Instead of fetching all KPIs then filtering client-side, fetch only the selected period's KPIs from the database.

**File**: `src/pages/admin/AllKpis.tsx`

- Default `selectedPeriod` and `selectedYear` to the current month/year (instead of "all")
- Replace `useAllKpis()` with `useKpisByPeriod(selectedPeriod, selectedYear)` which already exists in `useKpis.ts`
- When "all" is selected, fall back to `useAllKpis()` but this becomes the exception, not the default

This alone reduces KPI count from ~4,693 to ~300-500 per period.

### Change 2: Replace kpi_queries batch fetch with a lightweight count query

The page only needs **open query counts per KPI** (for badge display). It does not render query details. Instead of fetching full query objects for all KPIs:

**File**: `src/hooks/useKpis.ts` (new hook)

Create a `useOpenQueryCounts(kpiIds)` hook that runs a single aggregated query:

```sql
SELECT kpi_id, COUNT(*) as count
FROM kpi_queries
WHERE kpi_id = ANY(kpiIds) AND status = 'open'
GROUP BY kpi_id
```

This replaces 47 sequential requests with **1 request** returning only the KPIs that have open queries.

### Change 3: Update AllKpis.tsx to use new hooks

- Use period-scoped KPI fetch as default
- Use the lightweight count hook instead of `useKpiQueries`
- Keep the "All Periods" option but warn that it may be slower
- Remove the `openQueryCountByKpi` derived memo (the new hook returns it directly)

### Change 4: Derive available periods/years from a lightweight query

Instead of fetching all KPIs just to extract unique periods, add a small hook that queries distinct `review_period` and `review_year` values from the KPIs table.

### Change 5: Update DOCUMENTATION.md

Record the performance fix and the new query patterns.

## Files Modified

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Add `useOpenQueryCounts` hook and `useDistinctPeriods` hook |
| `src/pages/admin/AllKpis.tsx` | Default to current period, use scoped fetch, use count hook |
| `DOCUMENTATION.md` | Record performance optimization |

## Expected Impact

| Metric | Before | After |
|---|---|---|
| HTTP requests on load | ~55 | ~6-8 |
| KPIs fetched | 4,693 | ~300-500 |
| Query data fetched | 47 batch requests | 1 aggregate query |
| Estimated load time | 3-6 seconds | < 1 second |

## Risk

Low. The page behavior is identical -- same filters, same display. Only the data fetching strategy changes from "fetch everything, filter client-side" to "fetch what you need."

