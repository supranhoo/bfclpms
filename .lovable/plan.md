# KPI Weightage Dashboard — Performance Fix

## Risk & Impact Report
- **Data Impact**: None. Adds two read-only Postgres RPCs (`SECURITY DEFINER` with admin role check). No schema or RLS change.
- **Workflow Impact**: None — purely a read-path optimization.
- **UI/UX**: Same UI; just faster. Badge numbers and pagination behavior unchanged.
- **Regression Risk**: Low. We keep the existing client-side matrix builder for the page slice; only the *eligible-employee discovery* and *variance summary* move server-side. We add a unit test asserting summary parity vs. the current logic on a mock dataset.
- **Mitigation**: Feature-flag fallback path retained — if the RPC errors, the hook falls back to the current client-side code with a console warning.

## Root Cause (RCA)
On `/admin/kpi-weightage-dashboard` two hooks fire in parallel and each does heavy client-side fan-out:

1. `fetchEmployeesWithKpis` paginates `kpis` 1000 rows at a time across **both** review_years just to collect distinct `employee_id`s. With ~12k KPI rows that's ~24 round trips, run **twice** (once per hook).
2. `useWeightageVarianceSummary` then re-pulls **every** KPI for the full filtered employee set (chunked `IN (...)` of 200 at a time × 2 years × inner 1000-row pages) only to compute two integer badges client-side.
3. Both hooks duplicate the eligibility query and the per-year fetch loops, so the page issues dozens of serial-ish requests before the matrix renders.

Result: spinner stays up for many seconds even when only a handful of employees match the filter (e.g. "Ankit").

## Plan

### 1. New Postgres RPCs (migration)
- `rpc_weightage_eligible_employees(p_fiscal_start_year int, p_category_id uuid)` → `setof uuid`
  - `SELECT DISTINCT employee_id FROM kpis WHERE review_year IN (y, y+1) AND employee_id IS NOT NULL [AND category_id = p_category_id]`.
  - One round trip instead of paginated scan.
- `rpc_weightage_variance_summary(p_fiscal_start_year int, p_employee_ids uuid[], p_category_id uuid)` → `table(variance_count int, acknowledged_count int)`
  - Groups by `(employee_id, kra_name, kpi_name)`, picks fiscal-ordered baseline, returns mismatch + ack counts entirely in SQL.
  - `SECURITY DEFINER`, `set search_path = public`, guarded by `has_role(auth.uid(),'admin')`.

### 2. Hook refactor (`src/hooks/useKpiWeightageMatrix.ts`)
- Replace `fetchEmployeesWithKpis` with a single `supabase.rpc('rpc_weightage_eligible_employees', …)` call, exposed via its own React Query key so both hooks share the cache.
- `useKpiWeightageMatrix`: keep the page-slice path (profiles `.range()` + KPIs `.in(pageIds)`), but source eligibility from the shared query.
- `useWeightageVarianceSummary`: stop fetching raw KPIs. Resolve filtered employee IDs via the existing profiles query (already small after filters), then call `rpc_weightage_variance_summary`.
- Fallback: on RPC error, log and fall back to the existing client logic so badges still render.

### 3. Tests
- `src/test/kpiWeightageDashboardPagination.test.ts`: extend to cover the new RPC mock and assert variance/ack parity with the legacy client computation on a fixture.
- Add a small unit test for the fallback path (RPC throws → client path runs).

### 4. Docs / Memory
- Update `mem/features/admin/kpi-weightage-dashboard.md` to note: eligibility + variance summary are now server-side RPCs; client only builds the visible page matrix.
- Append entry to `CHANGELOG_2026.md` and bump `DOCUMENTATION.md` Version History.

## Files
- `supabase/migrations/<new>.sql` — two RPCs + grants.
- `src/hooks/useKpiWeightageMatrix.ts` — refactor both hooks.
- `src/test/kpiWeightageDashboardPagination.test.ts` — new assertions.
- `mem/features/admin/kpi-weightage-dashboard.md`, `CHANGELOG_2026.md`, `DOCUMENTATION.md` — docs sync.

## Expected Outcome
Initial load drops from dozens of requests / multi-second spinner to ~3 fast queries (eligibility RPC + profiles page + variance RPC), regardless of org size.
