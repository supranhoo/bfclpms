

## Make Grade & Designation Filters Cascade in KPI Mapping Matrix

### Problem
Grade and Designation dropdowns always show all values from the database, regardless of other active filters (Division, BU, Department). Selecting a department should narrow grade/designation options to only those present in that department.

### Fix — `src/pages/admin/KpiMappingMatrix.tsx`

1. **Stop using `useEmployeeFilterOptions`** for grades and designations — remove the import
2. **Derive filtered grades and designations from `allFilteredRows`** (already available from the hook) using `useMemo`:
   - Compute grades/designations from `allFilteredRows` but **exclude** the respective filter itself to avoid circular narrowing
   - For grades: filter `allFilteredRows` by all filters *except* grade, then extract unique grades
   - For designations: filter `allFilteredRows` by all filters *except* designation, then extract unique designations
3. **Add cascading clears**: When changing grade, clear designation (and vice versa if desired) — or at minimum, clear designation if the selected value no longer exists in the filtered set

**Simpler approach**: Since `allFilteredRows` already applies division/BU/department/search filters in the hook, we can derive grades and designations from the *partially filtered* rows. The hook already returns `allFilteredRows`. We need a variant that filters by org hierarchy + search but not by grade/designation.

**Implementation**: Add a new return value from `useKpiMappingMatrix` — `orgFilteredRows` — that applies only division/BU/department/search filters (not grade/designation). Then derive available grades and designations from this set in the page component.

### Files Changed
1. **`src/hooks/useAdminReports.ts`** — Return `orgFilteredRows` (rows filtered by org hierarchy + search only, before grade/designation filtering)
2. **`src/pages/admin/KpiMappingMatrix.tsx`** — Replace `useEmployeeFilterOptions` grades/designations with `useMemo` derived from `orgFilteredRows`; auto-clear grade/designation when their value is no longer available

