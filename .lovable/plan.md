## Goal

The KPI Status Tracker currently counts every employee's KPIs, including people who have left. For June 2026 that is **159 KPI rows across 9 inactive employees** showing as pending. Add the same Active / Inactive / All control the other reports already use, defaulting to **Active only**.

## Verified current state

- `src/pages/reports/KpiStatusTracker.tsx` fetches profiles with `id, employee_code, full_name, designation, department_id, departments(...)` — it does **not** select `is_active` and never filters on it.
- A reusable control already exists and is used by Employee Performance Summary / KPI Journey: `src/components/reports/EmployeeStatusFilter.tsx` (URL-synced `?emp_status=`) plus the SSOT helpers `applyEmployeeStatusFilter` / `employeeStatusLabel` / `countByStatus` in `src/lib/reportEmployeeFilter.ts`.
- Database check: 2,668 profiles, 88 inactive. June 2026 KPIs split 2,585 (active, 163 employees) / 159 (inactive, 9 employees).
- Related defect found in the same query: the profiles fetch has no pagination, so PostgREST returns only the first 1,000 of 2,668 profiles. Employees beyond that cut-off render as "Unknown / —" and would also have an unknown active flag, which would silently defeat the new filter. This must be fixed together with the filter.

## Changes

**1. `src/pages/reports/KpiStatusTracker.tsx` (only file with logic changes)**
- Add `is_active` to the profiles select and paginate that fetch in 1,000-row batches (same `while (hasMore)` pattern already used for `kpis` in this file), so every employee resolves.
- Carry `isActive: boolean` onto `StatusTrackerRow`.
- Add `empStatus` state (`EmployeeStatusMode`, default `'active'`), applied in `filteredRows` via `applyEmployeeStatusFilter(..., r => r.isActive)` before the existing department/status/search filters — so summary cards, pagination and export all follow it automatically.
- Reset to page 1 when the mode changes.

**2. UI placement**
- Render `<EmployeeStatusFilter onChange={setEmpStatus} />` in the existing filter `Card`, on the same wrapped flex row, immediately to the right of the Search box and before `FrequencyLockToggle`. Desktop shows the 3-segment Active/Inactive/All toggle; below 640px it auto-collapses to a Select (built into the component). No layout/grid changes elsewhere.
- Add an "Employee Status" column to the table and to `KST_DEFAULT_FIELDS` (`employee_status`, sort 45, so admins can hide/rename it via Report Field settings) rendering `Active` / `Inactive` — needed so an "All" view is readable.
- Excel export: include the same field, and stamp `employeeStatusLabel(empStatus)` into the sheet name/header line so an exported file states its scope.

**3. Tests** — `src/pages/reports/kpiStatusTracker.filter.test.ts` (new, pure-function level): active-only excludes inactive rows, inactive-only keeps just those, `all` keeps everything, unknown flag treated as active.

**4. Docs** — ADR-177 in `DOCUMENTATION.md` and `POLICY.md §RPT-EMPLOYEE-STATUS-FILTER` stating every employee-scoped report must expose the Active/Inactive/All control, default to Active, and resolve `is_active` through a fully paginated profile fetch.

## Risk & impact

- **Data:** none — read-only report, no schema or RLS change.
- **Workflow:** none. Pending KPIs of inactive employees still exist; they are only hidden from the default view and reachable via Inactive/All.
- **UI/UX:** default view row count drops (June: 2,744 → 2,585). Filter row gains one control; it already wraps responsively.
- **Regression:** low. Only this page changes. The profile-pagination fix will *add* previously missing names — expect some rows that read "Unknown" to now show real employees.
- **Scalability:** batched profile fetch is 3 requests at current volume; client-side filtering is unchanged in cost.
- **Rollback:** revert the single page file (and the two doc entries).
