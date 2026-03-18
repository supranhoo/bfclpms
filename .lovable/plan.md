

## RCA: "Data by" Badge Missing for Employee-Scoped Org KPIs

### Root Cause

The `getOrgKpiValue()` function in all three scorecards builds a lookup key based on the KPI's `org_level_scope`. For **employee-scoped** KPIs, it builds:
```
key = `${category_id}||${kra_name}||${kpi_name}||null||${employeeId}`
```

However, the source `org_kpi_values` record (before propagation) is stored with `employee_id = null`:
```
key = `${category_id}||${kra_name}||${kpi_name}||null||null`
```

**Per-employee records only exist after propagation.** The KPI "Achieve Power generation target from WHRB 1050 TPD" has a value entered (status: `approved`) but was **never propagated** — so no per-employee record exists, and the lookup returns `null`.

The third KPI in the screenshot ("Achieve production target from 1050 TPD") shows "Data by" because it WAS propagated, creating per-employee records.

### Database Evidence

| KPI | org_kpi_values records | Has per-employee record? | "Data by" shows? |
|-----|----------------------|--------------------------|------------------|
| Power gen from WHRB 1050 | 1 (employee_id=null, status=approved) | No | No |
| Costing | 1 (employee_id=null, scope=org) | N/A (org scope) | Yes |
| Production from 1050 TPD | 3 (null + 2 employee-specific, propagated) | Yes | Yes |

### Fix

Add a **fallback** in `getOrgKpiValue()`: when the scope-specific lookup fails, fall back to the organization-level record (`||null||null`). This ensures the `entered_by_name` is resolved even before propagation.

**Files to edit (same pattern in all three):**
1. `src/components/review/EmployeeScorecard.tsx` — `getOrgKpiValue` (line ~121-135)
2. `src/components/review/ManagementScorecard.tsx` — `getOrgKpiValue` (line ~123-137)
3. `src/components/review/UnifiedScorecard.tsx` — `getOrgKpiValue` (line ~279-293)

**Change in each:** After the scope-based lookup, if no result found, try the org-level fallback key:

```typescript
const getOrgKpiValue = (kpi: KPI) => {
  if (!kpi.is_org_level) return null;
  const scope = (kpi as any).org_level_scope || 'employee';
  let key: string;
  if (scope === 'organization') {
    key = `...||null||null`;
  } else if (scope === 'department') {
    key = `...||${deptId}||null`;
  } else {
    key = `...||null||${empId}`;
  }
  // Try scope-specific first, then fall back to org-level record
  const result = orgKpiValuesMap.get(key);
  if (result) return result;
  
  // Fallback: check the base org-level record (before propagation)
  if (scope !== 'organization') {
    const fallbackKey = `${kpi.category_id}||${kra}||${kpiName}||null||null`;
    return orgKpiValuesMap.get(fallbackKey) || null;
  }
  return null;
};
```

Three files, ~3 lines added per file.

