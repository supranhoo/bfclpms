
# All KRAs (`/admin/kpis`) — Performance Fix v2

## RCA
On default load (`May 2026`), `useKpisByPeriod` cannot filter by `review_period` server-side because non-monthly KPIs (Quarterly/Half-Yearly/Yearly/Bi-Monthly) need client-side month-coverage resolution. So it falls back to `review_year` only → ~12k rows, 12 paginated round trips, with embedded `kra_categories(...)` + `profiles:employee_id(...)` joins replanned per page. `useProfiles` (~2.5k rows) also blocks first paint.

## Plan

### 1. Split the period fetch (`src/hooks/useKpis.ts`)
`useKpisByPeriod(month, year)` issues TWO parallel server-filtered queries and dedupes by `id`:
- **A:** `review_year=Y AND review_period=month` (covers ~95% Monthly rows)
- **B:** `review_year=Y AND frequency IN ('Quarterly','Half-Yearly','Yearly','Bi-Monthly','Custom')` — small set, resolve `getCalendarMonthsForPeriod` client-side
- Fallback `try/catch` → existing year-wide path on error, with `console.warn`

### 2. Decouple joins from paged select
Drop `kra_categories(...)` and `profiles:employee_id(...)` from `SLIM_KPI_SELECT`. After fetch:
- One `.in('id', categoryIds)` against `kra_categories`
- One `fetchAllPaged` `.in('id', employeeIds)` against `profiles` (slim cols)
- Merge into KPI rows in-memory to preserve current `kpi.profiles` / `kpi.kra_categories` shape consumers expect

### 3. Unblock first paint (`AllKpis.tsx`)
Remove `profilesLoading` from `isLoading` gate. Profile-derived labels render `'-'` (existing fallback) until resolved.

### 4. RPC for `org-kpi-filled-set`
New migration: `rpc_org_kpi_filled_keys(p_period text, p_year int)` returning `(category_id uuid, kra_name text, kpi_name text, employee_id uuid)` for rows where `achieved_value IS NOT NULL OR is_na`. Admin-guarded `SECURITY DEFINER`. Replace paginated client scan with single RPC call. Bump `staleTime` to 5 min.

### 5. Cache stability
- `useKpisByPeriod`: `staleTime: 5 * 60_000`
- `useOpenQueryCounts`: hash key as `(length|firstId|lastId)` to stop churn

### 6. Tests
- `src/test/allKpisDashboardLoad.test.ts` — assert split fetch issues 2 server-filtered calls, never year-only; dedupe correctness
- Parity test for `rpc_org_kpi_filled_keys` vs paginated client scan

### 7. Docs
- `docs/adr/ADR-051.md` — Month-aware KPI fetching + paged-select join decoupling
- Update `mem/features/admin/kpi-mapping-matrix-dashboard`
- `CHANGELOG_2026.md` + `DOCUMENTATION.md` Version History

## Files
- **New:** `supabase/migrations/<ts>_speed_up_all_kpis_v2.sql`, `src/test/allKpisDashboardLoad.test.ts`, `docs/adr/ADR-051.md`
- **Update:** `src/hooks/useKpis.ts`, `src/pages/admin/AllKpis.tsx`, memory + changelog

## Expected outcome (May 2026 default load)
| Step | Before | After |
|---|---|---|
| KPI rows fetched | ~12k / 12 round trips w/ joins | ~2k / 2 parallel, no joins |
| Category/profile resolve | inline join × every page | 2 `.in()` lookups |
| `org-kpi-filled-set` | paginated full-row scan | 1 RPC, keys only |
| First paint blocks on profiles | yes | no |
| Re-nav | full refetch | cached 5 min |

Target initial paint: **~10–20s → ~1–2s**.

## Risk & Impact
- **Data:** None (read-only RPC, admin-guarded).
- **Workflow:** None.
- **UI/UX:** Manager/dept names hydrate ~200ms after table; `'-'` is existing fallback.
- **Regression:** Medium-low — split-fetch dedupe + join-decoupling must preserve `kpi.profiles` shape. Mitigated by parity test + try/catch fallback to legacy path.
