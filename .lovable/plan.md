
## Add Division filter to KPI-Employee Weighted Score Matrix

### Context
Report at `/reports/kpi-employee-matrix` already supports filters: Business Unit, Department, Category, Grade, Designation, Search (via `MatrixFilters` in `src/hooks/useKpiEmployeeMatrix.ts`). **Division** is missing — needed because divisions sit between Business Unit and Department in the org tree.

### Investigation confirmed
- `useKpiEmployeeMatrix.ts` has BU filtering via a `dept → BU` map built from `departments` table. Same pattern works for divisions: `departments.division_id` → filter.
- Page file is `src/pages/reports/KpiEmployeeMatrix.tsx` (will confirm exact name at edit time — search for the route).
- `useDivisions` hook exists in `src/hooks/useOrganization.ts` (used elsewhere).

### Change
1. **Hook (`useKpiEmployeeMatrix.ts`)**
   - Add `divisionId?: string` to `MatrixFilters`.
   - When `divisionId` is set, fetch `departments(id, division_id)` (reuse the same query that fetches BU mapping — extend select), build `deptDivMap`, and skip KPIs whose employee's department doesn't belong to the division.
   - Cascading rule: if both BU and Division are set, Division wins (Division is narrower). Department filter still applies on top.

2. **Page UI (matrix report page)**
   - Add a Division `OrgFilterCombobox` next to the Business Unit filter, sourced from `useDivisions()`.
   - Wire to URL state via existing `useUrlFilterStateNullable('div')` (param key: `div`).
   - Include in "Clear All" and active-filter badges.
   - Optional polish: when a Division is picked, scope the Department dropdown to departments in that division (consistent with other report pages).

3. **Docs/memory**
   - Update `DOCUMENTATION.md` Version History.
   - Update `mem://features/reports/kpi-employee-matrix-report` to list Division in supported filters.

### Files Touched (confirmed at edit time)
- `src/hooks/useKpiEmployeeMatrix.ts` — add `divisionId`, build dept→division map, apply filter
- `src/pages/reports/KpiEmployeeMatrix.tsx` (or actual filename) — add Division combobox + URL sync + badges + clear-all
- `DOCUMENTATION.md` — version note
- `mem://features/reports/kpi-employee-matrix-report` — append Division to filter list

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Read-only client-side filter on existing query results. |
| Workflow | None. |
| UI | One extra dropdown in the filter row. Matches existing combobox styling. |
| Regression | Very low. Logic mirrors the proven BU filter. |
| Mitigation | Null-safe: KPIs with no department or department with no division are skipped only when filter is active. Test with (a) no filter, (b) Division alone, (c) Division + Department, (d) Division + BU (Division wins). |

### Out of Scope
- Persisting filter selection across sessions beyond URL.
- Adding Division filter to other reports (separate request).
