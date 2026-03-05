

# Update "Total Employees" Card to Show KPI Coverage

## Problem
The "Total Employees" card currently shows just the total profile count (e.g., 454). The user wants it to display **"KPI Set / Total"** (e.g., "320 / 454") so management can see KPI assignment coverage at a glance.

## Changes

### `src/pages/ManagementDashboard.tsx`

1. **Add `employeesWithKpis` to returned data** (around line 342): Count unique `employee_id` values from the filtered KPIs using `employeeScoreMap.size` (already computed at line 259).

2. **Update the Total Employees card** (lines 504-513): Change the value display from `totalEmployees` to `"{employeesWithKpis} / {totalEmployees}"` and update subtitle from "In the system" to "KPIs assigned / Total".

3. **Update PDF export** (line 412): Change the exported metric to match.

### `DOCUMENTATION.md` / `POLICY.md`
Atomic sync — version bump noting the card now shows KPI coverage ratio.

