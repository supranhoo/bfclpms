## Goal

The `Employees: Active | Inactive | All` control exists today but is only wired into 3 places (`EmployeePerformanceSummary`, `KpiJourneyReport`, `KpiStatusTracker` — verified by search). Extend it to every report whose rows map to an employee, with `Active` as the default and the choice stamped into exports.

## Assumptions

- Default stays `active`, so no report changes what it shows on first load.
- Only employee-row reports get the control; Issues / Audit Trail / Workflow Resolution / Bottleneck / Annual Review keep their current behaviour.
- Filtering stays client-side via the existing `applyEmployeeStatusFilter`, matching how KPI Status Tracker already does it — no RPC signature changes.

## Risk & Impact

- **Data impact:** none. Read-only presentation filter; no schema, RLS, or RPC changes.
- **Workflow impact:** none.
- **UI/UX:** one extra chip in each report's filter bar; mobile collapses to a Select (already handled in the component).
- **Regression risk:** medium — the main hazard is a report whose row source does not carry `is_active`, which would silently drop rows. Mitigated by the "treat unknown as active" rule already baked into `applyEmployeeStatusFilter`, plus a per-report unit test.
- **Scalability:** filtering happens on already-fetched rows, so no added queries. Where a report reads `profiles` directly it must use `fetchAllPaged` (project policy) so `Inactive`/`All` don't hit the 1000-row cap — this is the one place volume matters.
- **Rollback:** each report is an isolated additive change; revert per file.

## Step-by-step

### 1. Shared plumbing
- Add a small hook `useEmployeeStatusFilter(paramKey?)` next to `reportEmployeeFilter.ts` that returns `{ mode, setMode, label }`, so every report wires up identically instead of repeating URL-state code.
- Extend `reportEmployeeFilter.ts` with an `employeeStatusExportHeader(mode)` helper for the export header line.
- **Verify:** unit tests on the helper.

### 2. Audit each report's row source for `is_active`
For every report below, confirm the row already carries the employee's active flag; where it does not, add `is_active` to the existing `profiles` select (paged via `fetchAllPaged`) or join it in client-side from the roster already being fetched.

Reports in scope:
- KpiDetailReport, KpiScorecardDetail, KpiEmployeeMatrix, MonthlyScorecardReport
- CompletionReport, DepartmentReport, PerformanceReport, QueryReport, KRAIssuance (all `useAllKpis`-backed — one shared enrichment point)
- ManagerTeamKpiReport, TeamVsManagerScoreReport, VarianceReport
- TNIReport, DevelopmentReport, FirstKraRolloutReport, CustomReport

**Verify:** for each, load with `Inactive` selected and confirm rows appear that were previously hidden.

### 3. Wire the control per report
- Render `<EmployeeStatusFilter />` in the existing filter bar (same visual slot each time, left of the export button).
- Apply `applyEmployeeStatusFilter(rows, mode, r => r.isActive)` at the same point where other client-side filters run, before totals/summary cards are computed so counts stay consistent with the grid.
- `CustomReport` additionally needs its hardcoded `.eq('is_active', true)` made conditional on the mode.

**Verify:** summary tiles and row count agree for all three modes.

### 4. Exports
- Add a header line (`Employee scope: <label>`) to each report's Excel/CSV export, and an `Employee Status` column rendering `Active` / `Inactive`, following the pattern KPI Status Tracker already uses.
- Register the new column in `report_field_registry` where the report is field-driven, so admins can hide it.

**Verify:** export one report per pattern and open the file.

### 5. Drift guard + docs
- Add `src/test/reportEmployeeStatusParity.test.ts` — enumerates the in-scope report modules and asserts each imports the filter, so new reports can't silently ship without it.
- Update `POLICY.md §RPT-EMPLOYEE-STATUS-FILTER` to cover all reports (not just KPI Status Tracker), add `docs/adr/ADR-199.md`, and bump `DOCUMENTATION.md` version history.

## UI changes

- **What changes visually:** a segmented `Active | Inactive | All` control appears in each report's filter row; on <640px it renders as a compact dropdown.
- **Where:** report filter bar, consistent position across all reports.
- **Interaction:** selection persists in the URL as `?emp_status=`, so refresh and shared links keep the scope.

## Tests

- Helper unit tests (`active` / `inactive` / `all` / unknown-flag).
- Per-report filter tests using mock rows including an inactive and an unknown-flag employee.
- Parity drift-guard test listing all in-scope reports.
