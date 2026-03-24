

## Add Division Mapping to Incentive Program Employee Mapping

### Problem
The Employee Mapping UI has 4 tabs (Dept/BU, Designation, Grade, Individual) but no Division option. The `divisions` table and `useDivisions()` hook already exist in the codebase.

### Changes

#### 1. `src/components/incentive/ProgramEmployeeMapping.tsx`

- Import `useDivisions` from `useOrganization`
- Add `division` to `mappingsByType` record
- Add `division` count to summary badges
- Change TabsList from `grid-cols-4` to `grid-cols-5`
- Add new "Division" tab trigger between "Dept/BU" and "Designation"
- Add `TabsContent` for divisions with checkbox list (same pattern as departments)

#### 2. `supabase/functions/compute-monthly-incentives/index.ts`

The computation function must resolve `division` mapping type. When resolving eligible employees, add logic: if mapping_type is `division`, find all business_units in that division, then all departments in those BUs, then all employees in those departments.

### No database changes needed
The `incentive_program_mappings` table uses a text `mapping_type` column — `'division'` works without schema changes.

### Files Modified
- `src/components/incentive/ProgramEmployeeMapping.tsx` — add Division tab
- `supabase/functions/compute-monthly-incentives/index.ts` — resolve division mappings

