## Assumptions

- Range in your screenshot is **Feb 2026 → Feb 2026** (1 month), PIP toggle ON, threshold 2.00.
- You are an admin/HR user; RLS on `kpis`, `review_submissions`, `profiles` is not blocking you.

## What the DB actually says (Feb 2026)

- 1,516 KPIs, 1,512 submissions, 1,464 with at least one score in the 8-stage cascade.
- 91 distinct employees have Feb 2026 KPIs (83 active).
- **15 active employees have a weighted avg < 2.00 in Feb 2026** (Firdoush Alam 0.00, Nikunj Poddar 0.00, Chandan Kumar Pandit 0.15, Niraj Kumar Mishra 0.23, Santosh Kumar Rath 0.45, Love Sahrawat 0.85, Randhir Kumar Singh 1.45, Rakesh Kumar Gupta 1.48, Parshu Ram Shukla 1.61, Umesh Kumar Mahato 1.62, Anil Kumar Pathak 1.68, Sandeep Kumar Tiwari 1.76, Debendra Kumar Sahu 1.83, Bhoopendra Kumar Sinha 1.89, Sindhu Raj Singh 1.91).

Report shows **"0 of 0 employees"** and **"0 PIP candidates"** → this means `allEmployees.length === 0`, i.e. the fetch itself effectively returned nothing. It is NOT the PIP predicate filtering people out.

## Two candidate root causes (need to disambiguate)

**RC-1 — Query cache serving a stale empty payload.**
`useMonthlyTrend` keys on `(fromMonth, fromYear, toMonth, toYear, includeInactive, profilesVersion)`. If a previous run with the same range failed early (e.g., a submissions batch 414/timeout) it may have resolved to `{ employees: [] }` and been cached. `handleLoad` calls `invalidateQueries` but the click flow (`setRequestedRange` → same key) can race with the invalidate and return the cached result.

**RC-2 — A submissions batch is silently returning zero rows** (URL-length regression variant), causing every KPI to hit `if (!sub || sub.is_na) continue`, so no employee ever gets added to `empAgg`. The existing `console.warn("possible batch/URL failure")` would fire, but we never surface it to the UI.

## Fix plan (surgical, PIP flow only)

### Step 1 — Force a hard refetch on Reload
- In `MonthlyTrendView.handleLoad`, call `queryClient.removeQueries({ queryKey: ['monthly-trend'] })` **before** `setRequestedRange(...)` (removes cached empty payload instead of relying on background invalidation). Also `await refetch()` after the state set so the click always triggers a network round trip.
- Verification: React-Query devtools shows a new fetch; network tab shows fresh `kpis` + `review_submissions` calls.

### Step 2 — Fail loud instead of returning empty
In `useMonthlyTrend.queryFn`:
- After building `empAgg`, if `allKpis.length > 0 && empAgg.size === 0`, `throw new Error('MonthlyTrend: KPIs fetched but no employees aggregated — likely stale profiles or submissions batch failure')`. That flips the query into `error` state and the existing red banner ("Failed to load trend data…") appears instead of a silent "0 of 0".
- Verification: unit test in `src/test/monthlyTrendCacheBust.test.ts` — feed KPIs but zero submissions and assert the hook throws.

### Step 3 — Fix PIP predicate for single-month + partial scoring
For a 1-month range, the predicate reduces to "Feb has a non-null cell AND < 2". That's fine, but today the cell uses the 8-stage cascade average; a KPI still at Self-only counts too, which is what you want. Confirmed no change needed here — the 15 rows in DB will surface once Step 1 is applied.

### Step 4 — Diagnostic banner (dev only)
When `import.meta.env.DEV`, show a small info line under the Score Trend title with `allKpis`, `subMap.size`, `empAgg.size` from the last successful fetch. Removed in production build.

## UI changes

- **Score Trend card**: no visual change on the happy path. On failure the existing red error banner appears (currently only shown when the query throws — Step 2 makes it appear for the silent-empty case too).
- **Reload button**: unchanged.

## Files

- `src/components/reports/MonthlyTrendView.tsx` — `handleLoad`: `removeQueries` + `await refetch()`.
- `src/hooks/useMonthlyTrend.ts` — throw when KPIs > 0 but empAgg is empty; add dev-only diagnostic counters on the returned result.
- `src/test/monthlyTrendCacheBust.test.ts` — new case: KPIs present, submissions empty → hook throws.

## Risk & impact

- **Data**: read-only, no writes.
- **Regression**: existing successful-path tests keep passing; new throw only fires when the current behaviour was already a silent bug.
- **Rollback**: revert the 2 files.
- **Scale**: no additional queries; only cache eviction on click.

## Not Applicable
- POLICY.md — no policy change.
- DOCUMENTATION.md — small note added under Monthly Scorecard section describing the new hard-refetch on Reload.
