
# Fix: KPI Weightage Dashboard showing no data

## Root Cause

Two bugs in `useKpiWeightageMatrix.ts` prevent data from loading:

1. **"all" value leaks as a filter**: The Select dropdowns use `"all"` as the value for "All Departments"/"All Categories". The dashboard passes `departmentId || undefined`, but `"all"` is truthy, so `.eq('profiles.department_id', 'all')` is applied, matching zero rows.

2. **PostgREST embedded filter behavior**: Even when a valid department UUID is passed, `.eq('profiles.department_id', ...)` on an embedded/joined resource doesn't filter parent rows in PostgREST. Instead, it returns the KPI row with `profiles: null`, and the code skips it with `if (!profile) continue`.

## Fix Plan

### File 1: `src/pages/admin/KpiWeightageDashboard.tsx`

- Change the filter values passed to the hook to treat `"all"` the same as empty:
  - `departmentId: departmentId && departmentId !== 'all' ? departmentId : undefined`
  - `categoryId: categoryId && categoryId !== 'all' ? categoryId : undefined`

### File 2: `src/hooks/useKpiWeightageMatrix.ts`

- Remove the server-side `.eq('profiles.department_id', ...)` filter (it doesn't work correctly with PostgREST embedded resources)
- Move department filtering to the client-side loop (same approach already used for employee search)
- Keep `.eq('category_id', ...)` since `category_id` is a direct column on the `kpis` table and works correctly

## Technical Details

- No database changes needed
- No new files needed
- Only 2 files modified with minimal changes
- Department filtering joins through profiles (embedded resource), so it must be client-side
- Category filtering works server-side because `category_id` is a direct column on `kpis`
