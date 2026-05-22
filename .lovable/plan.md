# Fix: KPI-Employee Matrix page times out → "No KPI data found"

## Root cause (confirmed)

`useKpiEmployeeMatrix` fetches every KPI for the selected month with deeply nested PostgREST joins (`kra_categories`, `profiles → departments`), then filters Division / BU / Department / Search **client-side**. For April 2026 (2,267 rows) the query exceeds the 8 s statement timeout → `500 / 57014` → React Query returns empty → UI renders the empty state. Network panel confirms repeated `canceling statement due to statement timeout` on `/rest/v1/kpis`.

This is the same anti-pattern POLICY §114 / §114.5 already fixed for the KPI Weightage Dashboard. The Matrix never got that treatment.

## Risk & Impact Report

- **Data Impact**: New SECURITY DEFINER RPC only (read-only). No schema/RLS changes. Score formula, fallback chain, weightage logic unchanged.
- **Workflow Impact**: None. Same filters, same columns, same export.
- **UI/UX Impact**: Adds a "Load Matrix" affordance + scope preview (count of employees / KPIs) before fetch. Mirrors PRD v1.1 click-to-load pattern. Pagination/summary cards unchanged.
- **Regression Risk**: Medium-low. Hook signature stays the same; we ship a unit test for the scope resolver and snapshot the matrix output against fixtures before/after.
- **Mitigation**: Keep the old hook path behind an internal feature flag for one release; cap snapshot at 25k cells / 5 MB; add Vitest covering Division-precedence-over-BU, Department filter, Category filter, Search filter, orphan KPIs, weighted-score rounding.

## Changes

### 1. New RPC `rpc_kpi_employee_matrix_scope`
```text
in:  p_period text, p_year int,
     p_division_id uuid, p_bu_id uuid, p_dept_id uuid,
     p_category_id uuid, p_company_id uuid, p_search text
out: employee_id uuid, kpi_count int
```
- Joins `kpis → profiles → departments → business_units (division_id)` server-side with indexed equality filters.
- Division beats BU when both set (matches current client logic).
- Search runs as ILIKE on `profiles.full_name`, `employee_code`, `kpis.kra_name`, `kpis.kpi_name`.
- Returns only employees who actually have ≥1 matching KPI in the period.

### 2. New RPC `rpc_kpi_employee_matrix_rows`
```text
in:  p_period, p_year, p_category_id, p_employee_ids uuid[]
out: kpi_id, employee_id, kra_name, kpi_name, weightage,
     category_id, category_name
```
- Batched in chunks of 500 employee IDs client-side.
- Drops the nested `profiles → departments` join entirely — profiles already came back from the scope step.

### 3. Hook rewrite — `src/hooks/useKpiEmployeeMatrix.ts`
- Step A: call scope RPC → eligible employee IDs (gated by `enabled` flag).
- Step B: page profiles via `.in('id', pageIds)` for display metadata.
- Step C: call rows RPC + existing `review_submissions` batched fetch.
- Hard cap: if `employees × distinct_kpis > 25_000`, return `tooLarge: true` and show "Refine filters" banner instead of fetching.

### 4. Page UX — `src/pages/reports/KpiEmployeeMatrix.tsx`
- Filter bar unchanged.
- Below filters: **Scope preview strip** ("≈ 46 employees · 563 KPI cells — Load Matrix") driven by a lightweight `bulk_scope_preview` style RPC call (counts only, ~80 ms).
- Matrix body stays empty until "Load Matrix" pressed OR a saved-view auto-load flag is set.
- Re-clicking any filter invalidates loaded data and re-shows the preview strip.
- Summary cards + Export Excel become enabled only post-load.

### 5. Tests
- `src/hooks/useKpiEmployeeMatrix.test.ts` — Division-precedence, BU fallback, Dept narrowing, Category filter, Search, orphan KPI counting, weighted score rounding, 25k-cap guard.
- Mock data: 3 divisions × 2 BUs × 3 depts × ~10 employees covering Support Function / Commercial / April-2026 reproducer.

### 6. Documentation & memory
- `DOCUMENTATION.md`: add §"KPI-Employee Matrix — Click-to-Load Architecture".
- `POLICY.md`: extend §114 to cover the Matrix report.
- `mem/features/reports/kpi-employee-matrix-report.md`: append the new RPC contract + 25k cap.
- `docs/adr/ADR-065.md` (new): record "Server-side scoping RPC for report matrices".

## Out of scope

- Layout/visual redesign of the report.
- Changing the scoring fallback or weightage formula.
- Touching other reports (handled separately if same timeout pattern reappears).

## Acceptance

- April 2026, Division = Support Function, BU = Commercial loads in < 1.5 s, shows the 46 employees / 563 KPIs.
- No PostgREST 500/57014 in network panel.
- All existing filters behave identically.
- Vitest suite passes.
