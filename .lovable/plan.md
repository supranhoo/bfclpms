

# Plan: Add Active/Inactive Employee Filter to KPI Weightage Dashboard

## Problem
The KPI Weightage Dashboard currently shows all employees regardless of their active status. Inactive employees should be hidden by default but visible when the admin opts in via a filter.

## Changes

### 1. `src/hooks/useKpiWeightageMatrix.ts`
- Add `includeInactive?: boolean` to the filters parameter
- Fetch `is_active` from the profiles join: update the select to include `is_active` from `profiles`
- Store `isActive` on `EmployeeMatrix` interface
- When `includeInactive` is falsy, skip employees where `profile.is_active === false`

### 2. `src/pages/admin/KpiWeightageDashboard.tsx`
- Add a new state `showInactive` (boolean, default `false`)
- Pass `includeInactive: showInactive` to `useKpiWeightageMatrix`
- Add a filter control (Switch or Select with "Active Only" / "All Employees" / "Inactive Only") in the filters card, next to the Category filter
- In the employee list, show an "Inactive" badge (grayed out styling) next to inactive employees' names

### 3. `src/hooks/useKpiWeightageMatrix.ts` — EmployeeMatrix interface
- Add `isActive: boolean` field

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useKpiWeightageMatrix.ts` | Add `is_active` to profile select, add `includeInactive` filter, add `isActive` to EmployeeMatrix |
| `src/pages/admin/KpiWeightageDashboard.tsx` | Add status filter control, pass filter to hook, show Inactive badge |

### Risk Assessment
- **Regression Risk**: None — additive filter with safe default (active only, matching current behavior)
- **Data Impact**: None — read-only filtering

