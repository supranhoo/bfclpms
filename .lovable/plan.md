

# Fix: Incorrect Metric Cards (Total Employees & Avg Score)

## Root Cause Analysis

### Issue 1: "99 / 0" Total Employees
Line 431: `totalEmployees: hasActiveHierarchyFilters ? filteredEmployeeIds.length : profiles.length`

When `hasActiveHierarchyFilters` is true but `filteredEmployeeIds` is empty (e.g., filter yields no matches), `totalEmployees = 0`. Meanwhile, the KPI query (line 188) skips the employee filter when `filteredEmployeeIds.length === 0`, fetching ALL KPIs — so `employeesWithKpis` shows 99 (all employees with KPIs). Result: "99 / 0".

**Fix**: Always use `profiles.length` for the total denominator. It represents all employees in the organization regardless of filters. When filters are active, show the filtered count separately.

### Issue 2: "39.70 / 5" Avg Score
The code fix (removing `* 100`, using `getScore` with null-skip) IS correctly applied in the file. However, the database confirms: `(17874 raw_total / 45214 total_weightage) * 100 = 39.53` — matching the OLD formula exactly. This means the preview is serving a stale build or cached computation.

Additionally, `employeeScoreMap` (line 315) still uses `getScoreOrZero` which includes ALL KPIs (even unscored ones with score=0), diluting scores for the bell curve and top/bottom performer calculations.

**Fix**: Change `employeeScoreMap` to use `getScore` with null-skip (matching `calculateMetrics`). Also change `kpi.weightage || 100` to `kpi.weightage ?? 100` throughout — the `||` operator treats weightage=0 as falsy, incorrectly replacing it with 100.

## Changes

### File: `src/pages/ManagementDashboard.tsx`

1. **Line 235, 268, 292-298, 316-319**: Replace `|| 100` with `?? 100` for weightage fallback (prevents 0 → 100 coercion)

2. **Line 315**: Change `getScoreOrZero(kpi)` to `getScore(kpi)` with null guard — skip unscored KPIs in `employeeScoreMap`

3. **Line 431**: Change totalEmployees to always use `profiles.length` — remove the conditional that uses `filteredEmployeeIds.length`

4. **Line 188-189**: When `filteredEmployeeIds.length === 0` and filters are active, return empty array immediately instead of fetching all KPIs (prevents data/count mismatch)

These are all within the same file and affect only the management dashboard data computation. No schema, RLS, or UI component changes needed.

## Risk Assessment
- **Data Impact**: None — read-only display corrections
- **Regression Risk**: Low — only fixing math/display consistency within one page
- **UI Impact**: Scores will display correctly on the 0-5 scale; Total Employees will show accurate organizational count

