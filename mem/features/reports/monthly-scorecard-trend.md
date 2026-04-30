---
name: Monthly Scorecard Trend Cache & Batching
description: Cache-bust contract and submission batch ceiling for the Date-Range trend
type: feature
---

## Monthly Scorecard — Date Range (Trend)

Hook: `src/hooks/useMonthlyTrend.ts`
View: `src/components/reports/MonthlyTrendView.tsx`

### Contract

1. **Manual reload MUST invalidate the cache.**
   `MonthlyTrendView.handleLoad` calls
   `queryClient.invalidateQueries({ queryKey: ['monthly-trend'] })` *before*
   relying on React-Query refetching. Toggling `requestedRange` alone is
   not sufficient when filters are unchanged — the cached payload (good or
   bad) will be returned without a new network request.

2. **Short staleTime.** `staleTime: 30 * 1000`, `gcTime: 5 * 60 * 1000`.
   A previously cached failure must not survive long.

3. **Submission batch ceiling = 200 KPI IDs.** Each `kpi_id=in.(...)` URL
   stays well under the PostgREST/CDN ~16 KB limit (≈ 38 chars per UUID
   including `%2C`). Going to 800 produced ~30 KB URLs and silent 414s.

4. **Never swallow batch errors.** Submission `Promise.all` results must
   `throw r.error` on failure and log via `console.error`. A diagnostic
   `console.warn` fires when `allKpis.length > 0 && subMap.size === 0`.

5. **Reporting Manager column.** Both the on-screen table and the Excel
   export include a "Reporting Manager" column right after Department.
   Format: `Name(Code)` when employee_code exists, else `Name`. Empty
   when no manager assigned (`—` on screen, blank in Excel). Manager
   names are batch-fetched via `.in('id', uniqueManagerIds)` from
   `profiles` after the main profile fetch; failures fall back to `null`
   without breaking the report.

### Why

Symptom on regression: table renders "N of N employees" with every cell as
"—" because employees are added to `empAgg` from the KPI fetch but the
submission map is empty.

### Tests
- `src/test/monthlyTrendCacheBust.test.ts`