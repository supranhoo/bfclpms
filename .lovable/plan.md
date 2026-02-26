

# Fix: ReferenceError in EmployeeSelectorGrid (v1.46.16)

## Root Cause

The v1.46.15 auto-sort code inside the `displayMembers` useMemo (line 336) calls `getEmployeeKpiStats`, which is a `const` function defined at line 440 -- after the useMemo. JavaScript `const` declarations are hoisted but not initialized, so accessing `getEmployeeKpiStats` before its definition throws: "Cannot access before initialization."

## Solution

Move the `getEmployeeKpiStats` function definition (lines 439-510) to **before** the `displayMembers` useMemo block (before line ~230). This ensures the function is initialized when the sort callback executes.

No logic changes needed -- just reorder the declarations.

## File to Change

**`src/components/review/EmployeeSelectorGrid.tsx`**

1. Cut the `getEmployeeKpiStats` function (lines 439-510)
2. Paste it before the `displayMembers` useMemo (around line 230, after `getStages` helper and before `displayMembers`)
3. Ensure `displayMembers` useMemo dependency array includes any new dependencies if needed (it already depends on `periodKpis`, `viewLevel`, `workflowMap` which `getEmployeeKpiStats` uses)

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | No DB or logic changes |
| Regression | None | Pure declaration reorder; all call sites remain identical |
| Correctness | Positive | Fixes crash on all dashboard views using EmployeeSelectorGrid |

