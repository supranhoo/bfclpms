# Add Org-Level KPI Scope Option - COMPLETED ✅

## Implementation Summary

Added the ability for Organization-Level KPIs to be scoped at three levels:
- **Organization**: Single value applies to ALL employees (default, existing behavior)
- **Department**: Value is looked up by employee's department
- **Employee**: Value is looked up by employee

## Changes Made

### Database
- Added `org_level_scope` column to `kpis` table (values: 'organization', 'department', 'employee')
- Added `department_id` and `employee_id` columns to `org_kpi_values` table
- Created unique index for scoped value lookups

### UI Changes
- **AdminKpiEditDialog**: Added scope selector dropdown when "Organization-Level KPI" is toggled ON
- **OrgKpiDataEntry**: Updated to show multiple rows for department/employee-scoped KPIs
- **MyKpis**: Updated value lookup to respect scope (checks employee's department or employee ID)

### Files Modified
- `src/hooks/useKpis.ts` - Added `OrgLevelScope` type and `org_level_scope` to KPI interface
- `src/hooks/useOrgKpiValues.ts` - Added `department_id` and `employee_id` to interface, updated bulk upsert
- `src/components/admin/AdminKpiEditDialog.tsx` - Added scope selector UI
- `src/components/admin/AdminKpiCreateDialog.tsx` - Added default org_level_scope
- `src/pages/admin/OrgKpiDataEntry.tsx` - Rewrote to handle scoped data entry
- `src/pages/MyKpis.tsx` - Updated org value lookup to respect scope
- `DOCUMENTATION.md` - Updated feature documentation

