
# Fix: Show Only Relevant Departments in Scoped Entry Table

## Problem

When an Org KPI has scope "Per Department", the data entry card shows **all 84 departments** in the system, even though only 18 of them have employees assigned to this KPI. This creates unnecessary noise and makes data entry tedious.

The same issue applies to "Per Employee" scope -- it shows all employees instead of only those mapped to the KPI.

## Root Cause

In `src/pages/admin/OrgKpiDataEntry.tsx` (line 210-222), the `buildCardData` function maps over ALL departments/employees without filtering by whether they have the KPI assigned.

## Solution

Filter the scoped rows to only include departments (or employees) that actually have at least one employee mapped to the KPI in the selected period.

### File: `src/pages/admin/OrgKpiDataEntry.tsx`

1. **Query mapped departments per KPI**: Use the existing `kpis` table data to build a map of which departments/employees are relevant for each org-level KPI
2. **Filter scoped rows**: In `buildCardData`, instead of `departments.map(...)`, filter to only departments that have employees with this KPI

**Logic change in `buildCardData`:**

For **department** scope:
- Query which departments have employees with this specific KPI (by joining `kpis.employee_id` to `profiles.department_id`)
- Only show those departments in the scoped entry table

For **employee** scope:
- Only show employees who actually have this KPI assigned

### File: `src/hooks/useOrgLevelKpis.ts`

Extend the `useOrgLevelKpisWithEmployees` hook to also return the list of mapped department IDs and employee IDs per KPI, so the entry page can filter scoped rows.

### File: `DOCUMENTATION.md`

Update documentation to note that scoped entry tables only show relevant departments/employees.

## Technical Details

| File | Change |
|---|---|
| `src/hooks/useOrgLevelKpis.ts` | Return mapped `departmentIds` and `employeeIds` per org-level KPI |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Filter `scopedRows` in `buildCardData` to only include mapped departments/employees |
| `DOCUMENTATION.md` | Update docs |

### Data Query

The hook already queries employee KPIs to get counts. We extend it to also collect department IDs:

```typescript
// Group employee department_ids per KPI
const deptMap = new Map<string, Set<string>>();
employeeKpis.forEach(ek => {
  const key = `${ek.category_id}||${ek.kra_name}||${ek.kpi_name}`;
  const profile = profileMap.get(ek.employee_id);
  if (profile?.department_id) {
    if (!deptMap.has(key)) deptMap.set(key, new Set());
    deptMap.get(key)!.add(profile.department_id);
  }
});
```

Then in `buildCardData`, filter departments:

```typescript
if (scope === 'department' && departments) {
  const mappedDeptIds = mappedDepartmentsMap.get(kpiKey) || new Set();
  scopedRows = departments
    .filter(dept => mappedDeptIds.has(dept.id))
    .map(dept => { ... });
}
```

This reduces the "Adherence to Manning Norms" entry from 84 rows to 18 relevant rows.
