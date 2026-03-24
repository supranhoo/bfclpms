

## Add Employee Mapping to Incentive Programs

### Problem
Currently incentive programs have no way to specify which employees are enrolled. The admin needs flexible mapping: by Department/BU, by Designation/Grade, and by individual employee selection.

### Approach

#### 1. New DB table: `incentive_program_mappings`
```
id uuid PK,
program_id uuid FK → incentive_programs,
mapping_type text ('department' | 'business_unit' | 'designation' | 'pms_grade' | 'employee'),
mapping_value text (dept UUID, BU UUID, designation string, grade string, or employee UUID),
created_at timestamptz DEFAULT now()
```
RLS: Admin full CRUD via `has_role()`, authenticated SELECT.

One program can have multiple mappings across types. During incentive computation, an employee is eligible if they match ANY mapping for that program (union logic).

#### 2. New component: `src/components/incentive/ProgramEmployeeMapping.tsx`

Shown inside the Create/Edit Program dialog or as a section below the Programs table when a program is selected. Three sections:

- **By Department/BU**: Multi-select dropdown using existing `useDepartments()` and `useBusinessUnits()` from `useOrganization.ts`
- **By Designation/Grade**: Multi-select using `useEmployeeFilterOptions()` which already provides `designations[]` and `grades[]`
- **Individual Employees**: Searchable employee picker (name/code), showing selected employees as chips

Each selection creates/removes rows in `incentive_program_mappings`. Shows a summary count: "12 departments, 3 grades, 5 individual employees selected".

#### 3. Hook additions in `useIncentivePrograms.ts`

- `useProgramMappings(programId)` — fetch all mappings for a program
- `useUpsertProgramMapping()` — insert mapping rows
- `useDeleteProgramMapping()` — remove mapping rows
- `useProgramEmployeeCount(programId)` — compute resolved employee count by joining mappings against profiles

#### 4. Programs table update

Add a "Mapped Employees" column showing the resolved count of employees matching the program's mappings.

#### 5. Computation integration

The `compute-monthly-incentives` edge function will resolve program mappings to get the list of eligible employee IDs before computing incentives, rather than processing all employees.

### Files

**New:**
- `src/components/incentive/ProgramEmployeeMapping.tsx`
- DB migration for `incentive_program_mappings` table

**Modified:**
- `src/hooks/useIncentivePrograms.ts` — add mapping CRUD hooks
- `src/pages/admin/IncentiveConfig.tsx` — show mapping UI when program selected
- `supabase/functions/compute-monthly-incentives/index.ts` — resolve mappings before computation

