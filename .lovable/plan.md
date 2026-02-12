

# Org KPI Inline Management Actions — Completed

## Implemented

1. **Change Org Level Scope** — Dropdown on each KPI card in Mapping > By KPI to switch between Organization / Department / Employee scope. Batch-updates all matching KPI records.

2. **Remove Employee** — Trash icon on each employee row (By KPI view) and hover-reveal on KPI badges (By Employee view). Confirmation dialog explains data preservation. Sets `is_org_level = false` without deleting the record.

3. **Add Employee** — "Add Employee" button on each KPI card opens a searchable multi-select dialog. Filters by department. Copies target, thresholds, and weightage from the reference KPI record.

## Files Created
- `src/hooks/useOrgKpiManagement.ts` — 3 mutations: `useAddEmployeesToOrgKpi`, `useRemoveEmployeeFromOrgKpi`, `useChangeOrgKpiScope`
- `src/components/admin/OrgKpiAddEmployeeDialog.tsx` — Searchable employee picker with department filter

## Files Modified
- `src/components/admin/OrgKpiMappingDashboard.tsx` — Added scope dropdown, add/remove buttons, confirmation dialog
- `DOCUMENTATION.md` — Updated Mapping Tab documentation with management actions
