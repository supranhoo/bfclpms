

## Add Business Unit Filter to KPI-Employee Matrix + Fix Runtime Error

### Problem
1. The KPI-Employee Weighted Score Matrix report lacks a **Business Unit** filter — the user needs to filter employees by BU.
2. A runtime error (`Cannot read properties of undefined`) occurs because some `filteredRows` entries have `employeeWeightages` as `undefined` when the company filter strips them.

### Changes

**1. `src/pages/reports/KpiEmployeeMatrix.tsx`**
- Add `businessUnitId` state variable
- Import `useBusinessUnits` from `useOrganization`
- Add a Business Unit `<Select>` dropdown between the Department filter and Category filter (or before Department, following hierarchy: Company → BU → Department)
- Pass `businessUnitId` into the `MatrixFilters` object
- Filter the `departments` dropdown to only show departments belonging to the selected BU
- Reset `departmentId` when `businessUnitId` changes (cascading filter)
- Fix the `filteredRows` mapping to safely handle missing `employeeWeightages` (add `|| {}` fallback)

**2. `src/hooks/useKpiEmployeeMatrix.ts`**
- The `MatrixFilters` interface already has `businessUnitId` defined
- Add BU-based filtering in the KPI processing loop: look up each employee's department → BU mapping and skip if it doesn't match `filters.businessUnitId`
- To do this, fetch `departments` table (id, business_unit_id) alongside KPIs, then filter employees whose department's BU matches

**3. `DOCUMENTATION.md` / `POLICY.md`** — version bump

### Runtime Error Fix
In `filteredRows` mapping (line ~69), `row.employeeWeightages` can be undefined for rows created before this field was added. Fix: `Object.entries(row.employeeWeightages || {})`.

### Risk Assessment
- **Data Impact**: None — read-only filters
- **Regression**: Low — cascading reset logic follows existing pattern
- **UI**: Adding one more dropdown to the filter grid; existing 6-column grid accommodates it

