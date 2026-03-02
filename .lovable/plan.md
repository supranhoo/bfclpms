

# Fix: KPI Weightage Dashboard - Incorrect Join Syntax

## Root Cause

The PostgREST nested join syntax in `useKpiWeightageMatrix.ts` uses an explicit foreign key hint for the departments relationship that doesn't match the actual constraint name:

```
departments!profiles_department_id_fkey(name)
```

Every other hook in the codebase (e.g., `ImportData.tsx`, `OrgKpiMappingDashboard.tsx`, `usePropagateOrgKpiValue.ts`) uses the simpler implicit join:

```
departments(name)
```

This mismatch causes PostgREST to either error or return null for the profiles join. Since the code has `if (!profile) continue`, all KPI records are silently skipped, resulting in 0 employees shown.

Similarly, `kra_categories!kpis_category_id_fkey(name)` should be simplified to `kra_categories(name)` to match the pattern used elsewhere.

## Fix

**File: `src/hooks/useKpiWeightageMatrix.ts`** (lines 52-62)

Change the select query from:
```
profiles!kpis_employee_id_fkey(full_name, employee_code, department_id, departments!profiles_department_id_fkey(name)),
kra_categories!kpis_category_id_fkey(name)
```

To:
```
profiles!kpis_employee_id_fkey(full_name, employee_code, department_id, departments(name)),
kra_categories(name)
```

This matches the exact pattern used successfully in `ImportData.tsx`, `usePropagateOrgKpiValue.ts`, and other hooks across the codebase.

## Technical Details
- Single file change, 2 lines modified
- No database changes needed
- Keeps `profiles!kpis_employee_id_fkey` (which is used everywhere and works) but fixes the nested `departments` join to use the implicit form
- Simplifies `kra_categories` join to implicit form as well
