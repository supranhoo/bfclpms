

## Brainstorm: Program-Scoped Eligibility Data Entry

### Current Problem

The Eligibility Data Entry grid loads **ALL active employees** regardless of whether they're mapped to any incentive program. This means:
- Admin sees 500+ employees when only 50 might be in the "Support Function" program
- No way to know which employees actually need eligibility data
- Data entry is tedious and error-prone — admin doesn't know who to fill data for

### Proposed UX Flow

```text
┌─────────────────────────────────────────────────────────┐
│  Eligibility Data Entry                                 │
│  Enter monthly disqualification & attendance data       │
│                                                         │
│  [March ▼] [2026 ▼] [All Programs ▼] [Search...]       │
│                                    ▲                    │
│                                    │                    │
│                         NEW: Program filter dropdown    │
│                         Options:                        │
│                         • All Programs (current behavior)│
│                         • Support Function              │
│                         • Production & Maintenance      │
│                         • (any active program)          │
│                                                         │
│  ┌──────────┬──────┬──────┬─────┬─────┬────────┬──────┐ │
│  │ Employee │ Dept │ Program │ ... │ Status │ Action │ │
│  ├──────────┼──────┼─────────┼─────┼────────┼────────┤ │
│  │ John     │ HR   │ Support │ ... │ Eligible│  💾   │ │
│  │ Jane     │ Ops  │ Prod&M  │ ... │ Eligible│  💾   │ │
│  └──────────┴──────┴─────────┴─────┴────────┴────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Add Program Filter Dropdown**
- Fetch all active `incentive_programs`
- Default: "All Programs" (shows only employees mapped to ANY program, not all employees)
- Selecting a specific program filters to only employees mapped to that program
- Uses the same mapping resolution logic already in `compute-monthly-incentives` (division → BU → dept → employee)

**2. Show Program Name Column**
- Add a "Program" column showing which program(s) the employee belongs to
- If mapped to multiple programs, show as comma-separated badges

**3. Dynamic Fields Per Program**
- Eligibility fields can be global OR program-specific (`program_id` column on `incentive_eligibility_fields`)
- When a specific program is selected, show only that program's fields + global fields
- When "All Programs" is selected, show all active fields (current behavior)

**4. Stop Showing ALL Employees by Default**
- Current: queries ALL active profiles
- New: resolve mapped employees from `incentive_program_mappings` first, then only show those
- If no mappings exist for any program, show an info banner: "No employees mapped to incentive programs. Go to Programs tab to configure mappings."

**5. Excel Template & Import Scoped to Program**
- Template export only includes employees from the selected program filter
- Import validates that employee codes belong to the filtered set

### Implementation

#### 1. New hook: `useResolvedProgramEmployees`
- Takes optional `programId` (or "all")
- Fetches `incentive_program_mappings` for the program(s)
- Resolves division/BU/dept/designation/grade/employee mappings to profile IDs (same logic as compute edge function)
- Returns `{ employeeIds: string[], programByEmployee: Map<string, string[]> }`

#### 2. `src/components/incentive/EligibilityDataEntry.tsx`
- Add program selector dropdown (fetched from `useIncentivePrograms`)
- Replace the "all active profiles" query with `useResolvedProgramEmployees`
- Add "Program" column to table
- Scope template export and import to filtered employees
- Show info banner when no employees are mapped

#### 3. No database changes needed
The mapping resolution uses existing tables (`incentive_program_mappings`, `profiles`, `departments`, `business_units`).

### Files Modified
- `src/components/incentive/EligibilityDataEntry.tsx` — add program filter, scoped employee list, program column
- `src/hooks/useIncentiveEligibility.ts` — add `useResolvedProgramEmployees` hook

