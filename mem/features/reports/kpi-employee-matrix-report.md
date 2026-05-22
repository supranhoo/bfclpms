---
name: KPI Employee Matrix Report
description: Click-to-load matrix backed by server-side scoping RPCs with a 25k cell cap
type: feature
---

`/reports/kpi-employee-matrix` uses **click-to-load** + **server-side scoping** (POLICY §114).

## Why
The legacy hook fetched every KPI for the period with deeply nested PostgREST joins (`kra_categories`, `profiles → departments`) and filtered Division/BU/Dept/Search client-side. With ~2k+ KPIs per month this hit the 8 s statement timeout (PG error `57014`) and the UI rendered "No KPI data found".

## Architecture
1. `useKpiEmployeeMatrixScope(filters)` → calls `rpc_kpi_employee_matrix_scope` and returns `{ employeeCount, uniqueKpiCount, totalCells, exceedsCap }`. Cheap — drives the "Load Matrix" preview strip.
2. User clicks **Load Matrix** → `useKpiEmployeeMatrix(filters, { enabled: true })` runs:
   - calls the same scope RPC to get eligible `employee_id`s,
   - batches `profiles` fetch in chunks of 500,
   - batches `rpc_kpi_employee_matrix_rows` in chunks of 500 employee IDs,
   - batches `review_submissions` fetch in chunks of 500 KPI IDs,
   - pivots into `{ rows, employees, summary }` using the standard 8-stage score fallback.
3. Any filter change resets `loaded=false` and re-shows the preview strip.

## RPCs
- `rpc_kpi_employee_matrix_scope(p_period, p_year, p_division_id, p_bu_id, p_dept_id, p_category_id, p_search)` → `(employee_id, kpi_count)`. Division beats BU when both set. ILIKE search across `profiles.full_name`, `employee_code`, `kpis.kra_name`, `kpis.kpi_name`. SECURITY DEFINER, `search_path=public`.
- `rpc_kpi_employee_matrix_rows(p_period, p_year, p_employee_ids, p_category_id)` → KPI rows joined to `kra_categories.name` only. No nested profile join.

## Caps & guardrails
- Hard cap: `MATRIX_CELL_CAP = 25_000` (employees × KPI rows). Exceeding → `exceededCap: true`, table not rendered, user must narrow filters.
- Scope preview is `staleTime: 60s`; matrix data is `staleTime: 5min`.
- Export Excel disabled until `loaded && filteredRows.length > 0`.

## Invariants
- Scoring fallback chain unchanged: `final → management → auditor → hr_pms → skip_level → manager → self`.
- `is_na` submissions still excluded from weighted scores.
- Company filter still applied client-side via `useCompanyFilter`.
- Division filter takes precedence over BU when both are set (matches pre-fix behavior).

POLICY §114: server-side scoping for all report matrices over ≥1k row periods.
