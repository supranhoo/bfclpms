

## Fix: Stat Cards Should Update When Filters Are Applied

### Problem
The stat cards (Total Employees, Pending, In Audit, Forwarded, etc.) always show figures based on `baseMembers` (all employees) and all `periodKpis`, regardless of active filters (Department, Designation, Grade, Manager). When a user filters by department, the employee grid updates but the stat cards remain unchanged.

### Root Cause
`stats` memo (line 463) depends on `baseMembers` and `periodKpis`. It should instead depend on `displayMembers` (the filtered list) and only count KPIs belonging to filtered employees.

### Fix — `src/components/review/EmployeeSelectorGrid.tsx`

**1. Update the `stats` useMemo (line 462-546) to use `displayMembers` instead of `baseMembers`:**

- Replace `baseMembers` with `displayMembers` in the stats computation
- Change `const memberIds = new Set(baseMembers.map(m => m.id))` → `const memberIds = new Set(displayMembers?.map(m => m.id) || [])`
- Change `totalEmployees: baseMembers.length` → `totalEmployees: displayMembers?.length || 0`
- Update the dependency array to include `displayMembers` instead of `baseMembers`, plus include filter state deps (`selectedDepartment`, `selectedDesignation`, `selectedGrade`, `selectedManager`)

Since `displayMembers` already depends on all filter states (search, department, designation, grade, manager, status), and `stats` will now depend on `displayMembers`, the stat cards will automatically re-compute whenever any filter changes.

**Note:** The status filter (`statusFilter`) should NOT affect the stats — stats should reflect the demographic filters only, not the status-based filter (since the stat cards themselves act as status filter toggles). To handle this, we need to create an intermediate filtered list that applies only demographic filters (search, department, designation, grade, manager) but not the status filter. The stats will use this intermediate list, while `displayMembers` continues to apply all filters including status.

**Revised approach:**

1. **Extract demographic filtering into a separate `demographicFilteredMembers` useMemo** — applies search, department, designation, grade, manager filters only (lines 332-350 logic)
2. **Update `displayMembers`** to start from `demographicFilteredMembers` and only apply status filtering (lines 352-424 logic)
3. **Update `stats`** to use `demographicFilteredMembers` instead of `baseMembers`

This ensures stat cards reflect demographic filters but remain independent of which status card is clicked.

