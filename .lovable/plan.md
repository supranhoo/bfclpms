## Problem

On `/admin/org-kpi-data`, the Per-Employee scoped row renders as **"Employee 2ddb6a"** under **"No Department"** instead of the real name (Sanjeeb Kumar Jena) and department.

## Root Cause (verified against DB)

1. The mapped employee `2ddb6a…` exists, is active, has a department, and is correctly returned by the snapshot RPC (`get_org_kpi_data_entry_snapshot`, which runs `SECURITY DEFINER` and bypasses `profiles` RLS).
2. The page enriches display labels (`full_name`, `employee_code`, department name) by looking the employee up in `useProfiles()`, which runs as the **caller** under normal `profiles` RLS.
3. For this admin's session, `useProfiles()` does not return Sanjeeb's row (RLS scope or paged result race), so `buildCardData` falls through to the `Employee {id-prefix}` / `No Department` fallback introduced in ADR-061.

ADR-061 was correct to render the row from the snapshot — without it the editor was hidden entirely. But it left enrichment dependent on a query that can legitimately omit the same employee the snapshot just authorised.

## Fix — Enrich at the snapshot, not on the client (ADR-062)

Make the snapshot the source of truth for **everything** the scoped editor needs to render a row, including display labels. The client stops depending on `useProfiles` visibility for mapped-employee identity.

### 1. SQL migration — extend `get_org_kpi_data_entry_snapshot`

Add two new top-level maps to the returned JSON (keyed by employee_id / department_id), populated from the same `SECURITY DEFINER` join the function already does:

- `employeeDisplayMap`: `{ [employee_id]: { full_name, employee_code, designation, department_id, department_name, department_code, is_active } }`
- `departmentDisplayMap`: `{ [department_id]: { name, code } }`

Both are restricted to employees/departments actually mapped in this snapshot (no extra cost, no PII broadening — admin/auditor/management/hr_pms already see all profiles; data-owner role only gets enrichment for employees whose KPIs they own).

Index review: existing `idx_kpis_org_period_status` already covers the join; no new indexes.

### 2. Client — `src/hooks/useOrgLevelKpis.ts`

Surface the two new maps from the RPC payload and return them alongside the existing maps. No re-keying needed (UUIDs).

### 3. Client — `src/pages/admin/OrgKpiDataEntry.tsx → buildCardData`

In the Per-Employee branch, prefer `employeeDisplayMap[empId]` for `displayName`, `employeeCode`, `designation`, `departmentId/Name`. Fall back to `useProfiles` enrichment only when the snapshot map omits the employee (e.g. `data_owner` who lost ownership mid-session). Final fallback to `Employee {id-prefix}` is preserved but should now only fire for genuine orphans.

Same change in the Per-Department branch using `departmentDisplayMap`.

### 4. Component — `OrgKpiScopedEntryTable` row grouping

Already groups by `departmentId` / `departmentName`. No structural change needed; the values now arrive populated.

### 5. Tests

- `src/test/orgKpiEmptyState.test.ts` — extend with a `buildCardData` regression: when `allProfiles` is `undefined`/empty but `employeeDisplayMap` contains the mapped employee, the scoped row uses the snapshot label, not the `Employee {id-prefix}` fallback.
- New test confirming department grouping uses `departmentDisplayMap` when `useDepartments` hasn't resolved.

### 6. Documentation

- `docs/adr/ADR-062.md` — new ADR documenting the snapshot-as-display-truth decision and the RLS divergence it solves.
- Update `mem/features/admin/org-kpi-data-entry-snapshot.md` to list the two new maps in the RPC contract.
- `POLICY.md` / `DOCUMENTATION.md` — note that the Org KPI Data Entry editor must not depend on the caller's `profiles` RLS for mapped-employee identity.

## Risk & Impact

- **Data Impact**: read-only RPC; no schema change beyond the function body. No historical data touched.
- **Workflow Impact**: none — Save/Propagate keys off `scopeId` (UUID), already supplied.
- **UI/UX**: scoped rows now show the correct name/department on first render for all roles authorised to enter org-KPI data.
- **Regression Risk**: low. The new maps are additive; existing consumers continue to work unchanged. ADR-061's fallback path remains as a safety net.
- **Security**: enrichment is scoped to employees/departments already exposed by the snapshot's existing access rules — no broader visibility than before.

## Files Touched

- `supabase/migrations/2026xxxx_org_kpi_snapshot_enrichment.sql` (new)
- `src/hooks/useOrgLevelKpis.ts`
- `src/pages/admin/OrgKpiDataEntry.tsx` (`buildCardData` only)
- `src/test/orgKpiEmptyState.test.ts`
- `docs/adr/ADR-062.md` (new)
- `mem/features/admin/org-kpi-data-entry-snapshot.md`
