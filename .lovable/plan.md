# All KRAs (`/admin/kpis`) — Performance Fix

## Risk & Impact Report
- **Data Impact**: None. Adds two read-only Postgres RPCs (admin-only `SECURITY DEFINER`) and adds correct pagination to one existing client query that was silently capped at 1000 rows.
- **Workflow Impact**: None.
- **UI/UX**: Same UI, faster load. **Bug fix bonus**: Org KPI "filled" badges currently undercount when the period has >1000 org-KPI rows (Supabase row cap); this plan removes that hidden ceiling.
- **Regression Risk**: Low. Each RPC is isolated; the hook keeps the existing client logic as a fallback if the RPC errors.
- **Mitigation**: Unit test for the new RPC parity + a regression test asserting org-KPI filled set isn't truncated.

## RCA — why the page is slow

The page issues at least **four heavy network rounds** before the first paint, several of which scale with org/KPI volume:

1. **`useDistinctKpiPeriods`** pulls *every row* in `kpis` (`select review_period, review_year`) just to compute the dropdown options. With ~12k rows this is paginated into many requests and shipped to the browser only to be deduped to ~12 strings.
2. **`useKpisByPeriod`** — when a month is selected (the default on load) it cannot filter by `review_period` server-side because non-monthly KPIs (Q1, H1, Annual…) need client-side month-coverage resolution. So it pulls **all KPIs for the whole year** (~12k rows / 12 paginated requests on the critical path).
3. **`useOpenQueryCounts`** then takes those 12k KPI IDs, batches them into IN(…) queries of 500, and ships the matching `kpi_queries` rows to the client only to count them per KPI.
4. **`org-kpi-filled-set`** runs a single unpaginated `select` against `org_kpi_values` filtered only by period/year — Supabase silently caps at **1000 rows**, so on top of being slow it currently *under-reports* "filled" KPIs whenever a period has more than 1000 org-KPI rows.
5. `useProfiles` and `useDepartments` are fine; not the bottleneck.

## Plan

### 1. Migration — two server-side aggregation RPCs
- `rpc_distinct_kpi_periods()` → `table(review_period text, review_year int)`
  - `SELECT DISTINCT review_period, review_year FROM kpis WHERE review_period IS NOT NULL AND review_year IS NOT NULL`.
  - One round trip, ~12 rows out, no full-table ship.
- `rpc_open_query_counts(p_kpi_ids uuid[])` → `table(kpi_id uuid, open_count int)`
  - `SELECT kpi_id, COUNT(*) FROM kpi_queries WHERE status='open' AND query_type='query' AND kpi_id = ANY($1) GROUP BY kpi_id`.
  - One request returning ≤ N rows of small ints instead of every open-query row.

Both `SECURITY DEFINER`, `set search_path = public`, guarded by `has_role(auth.uid(),'admin')`, granted to `authenticated`.

### 2. Hook refactors (`src/hooks/useKpis.ts`)
- `useDistinctKpiPeriods` → call `rpc_distinct_kpi_periods` and shape the result; keep the same return contract (`{ periods, years }`). Cache for 10 min (`staleTime`).
- `useOpenQueryCounts` → call `rpc_open_query_counts(kpiIds)` once. If `kpiIds.length` is huge (>2k), chunk into 2k IDs per RPC call.
- Both keep the existing client logic in a `try/catch` fallback path with a console warning, so a missing/erroring RPC degrades gracefully.

### 3. Fix the silent truncation on `org-kpi-filled-set` (`src/pages/admin/AllKpis.tsx`)
- Replace the single unpaginated `select` with a `while`-paginated fetch (1000 rows per page) keyed by `(category_id, kra_name, kpi_name, employee_id)` — same Set output, but complete.
- Add `staleTime: 60_000` so re-renders don't re-fetch.

### 4. Stabilize query keys
- `useOpenQueryCounts` currently keys on the raw `kpiIds` array, which changes identity every render → invalidates the cache constantly. Switch the key to a stable hash (`kpiIds.length` + first/last id, or `JSON.stringify(sorted)`), and `useMemo` the `kpiIds` array in `AllKpis.tsx` (already memoed but verify dep stability).

### 5. Tests
- New `src/test/allKpisDashboardPerf.test.ts`:
  - Mocks the two RPCs and asserts the hooks return the same shape as the legacy client logic.
  - Asserts `org-kpi-filled-set` paginates beyond 1000 rows.

### 6. Docs / Memory
- Update `mem/features/admin/kpi-mapping-matrix-dashboard.md` (or add a sibling note) with the new RPCs and the truncation fix.
- Append entry to `CHANGELOG_2026.md` and bump `DOCUMENTATION.md` Version History.

## Files
- `supabase/migrations/<new>.sql` — `rpc_distinct_kpi_periods` + `rpc_open_query_counts`.
- `src/hooks/useKpis.ts` — refactor `useDistinctKpiPeriods`, `useOpenQueryCounts`.
- `src/pages/admin/AllKpis.tsx` — paginate `org-kpi-filled-set`, add `staleTime`.
- `src/test/allKpisDashboardPerf.test.ts` — new tests.
- Memory + changelog updates.

## Expected Outcome
| Query | Before | After |
|---|---|---|
| Distinct periods | ~12 paginated requests, ~12k rows | 1 request, ~12 rows |
| Open-query counts | up to 24 batched requests, all open-query rows | 1 RPC, only counts |
| Org-KPI filled set | 1 request capped at 1000 (incorrect) | paginated, correct |
| Period KPIs (month selected) | unchanged (still year-scoped, ~12 reqs) | unchanged (next iteration: server-side multimonth resolution) |

Initial paint should drop from many seconds to roughly 1 round trip in flight at a time, and the org-KPI badge counts will become accurate.
