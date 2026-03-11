
# Plan: Add Employee Code to Names Across Dashboard Pages

## Problem
Employee cards on dashboard grids show only names (e.g., "Satyendra Kumar Singh") without the employee code. The user wants format: **"Name (Code)"** — e.g., "Jaspal (101125)".

## Approach
Create a shared utility function `formatEmployeeName` and apply it consistently across all dashboard components.

## Changes

### 1. `src/lib/utils.ts` — Add helper function
```typescript
export function formatEmployeeName(
  fullName: string | null | undefined, 
  email: string, 
  employeeCode?: string | null
): string {
  const name = fullName || email;
  return employeeCode ? `${name} (${employeeCode})` : name;
}
```

### 2. `src/components/review/EmployeeSelectorGrid.tsx` — Employee cards (primary fix)
- **Lines 831, 836**: Change `{member.full_name || member.email}` to `{formatEmployeeName(member.full_name, member.email, member.employee_code)}`
- **Line 585** (`getManagerName`): Also return employee code with manager name — `Manager: Sajid Raza (102045)`

### 3. `src/components/review/EmployeeContactCard.tsx` — Contact popover header
- **Line 73**: Add employee code display in the popover card name

### 4. `src/components/review/EmployeeFilters.tsx` — Manager dropdown
- **Lines 171-175**: The manager dropdown shows `{m.name}` without codes. Update `useEmployeeFilterOptions` to include employee_code in manager objects, then display `Name (Code)` in dropdown items.

### 5. `src/hooks/useEmployeeFilterOptions.ts` — Manager data
- Update managers query return to include `employee_code` field so filter dropdowns can display it.

### 6. Scorecard headers (already partially done — verify/standardize)
- `UnifiedScorecard.tsx` (line 1076-1078) — already shows code, no change needed
- `EmployeeScorecard.tsx` (line 605-607) — already shows code, no change needed  
- `AuditScorecard.tsx` (line 645-647) — already shows code, no change needed
- `ManagementScorecard.tsx` (line 708-710) — already shows code, no change needed

## Files Modified
1. `src/lib/utils.ts` — Add `formatEmployeeName` helper
2. `src/components/review/EmployeeSelectorGrid.tsx` — Employee cards + manager name
3. `src/components/review/EmployeeContactCard.tsx` — Popover header
4. `src/components/review/EmployeeFilters.tsx` — Manager dropdown items
5. `src/hooks/useEmployeeFilterOptions.ts` — Include employee_code in managers data

No database changes needed.
