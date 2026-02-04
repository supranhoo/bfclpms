

# Enhanced Employee Selection Filters for Review Pages

## Overview

This plan adds comprehensive employee filtering capabilities to Team Review, Audit Panel, and Management Review pages. Currently, these pages only have basic search and status filters. The enhancement will add Department, Designation, PMS Grade, and Reporting Manager filters to help reviewers quickly find specific employees.

---

## Current State Analysis

| Page | Current Filters |
|------|-----------------|
| Team Review | Search (name/email/code), Status (All/Pending/Reviewed) |
| Audit Panel | Search (name/email/code), Status (All/Pending Audit/In Audit/Forwarded) |
| Management Review | Search (name/email/code), Status (All/Pending/Approved) |

All three pages share the same filter pattern but lack organizational filters like Department, Designation, and PMS Grade.

---

## Proposed Filters

### New Filter Dropdowns

| Filter | Source | Purpose |
|--------|--------|---------|
| Department | `departments` table | Filter by organizational unit |
| Designation | `profiles.designation` (distinct values) | Filter by job title |
| PMS Grade | `profiles.pms_grade` (distinct values) | Filter by performance grade band |
| Reporting Manager | `profiles` (managers only) | Filter by direct supervisor |

### Filter Layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  [🔍 Search employees...] [Department ▼] [Designation ▼] [Grade ▼]     │
│  [Manager ▼] [Status ▼]                                   [✕ Clear All]│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Create Shared Filter Component

**New File:** `src/components/review/EmployeeFilters.tsx`

This component will be reusable across all three review pages with configurable status options:

```typescript
interface EmployeeFiltersProps {
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  
  // Department filter
  selectedDepartment: string | null;
  onDepartmentChange: (deptId: string | null) => void;
  departments: { id: string; name: string }[];
  
  // Designation filter
  selectedDesignation: string | null;
  onDesignationChange: (designation: string | null) => void;
  designations: string[];
  
  // PMS Grade filter
  selectedGrade: string | null;
  onGradeChange: (grade: string | null) => void;
  grades: string[];
  
  // Manager filter (optional, only for Audit/Management)
  selectedManager?: string | null;
  onManagerChange?: (managerId: string | null) => void;
  managers?: { id: string; name: string }[];
  
  // Status filter
  statusFilter: string;
  onStatusChange: (status: string) => void;
  statusOptions: { value: string; label: string }[];
}
```

### 2. Create Hook for Employee Filter Options

**New File:** `src/hooks/useEmployeeFilterOptions.ts`

Fetches distinct values for filter dropdowns:

```typescript
export function useEmployeeFilterOptions() {
  // Fetch departments
  const { data: departments } = useDepartments();
  
  // Fetch distinct designations from profiles
  const { data: designations } = useQuery({
    queryKey: ['distinct-designations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('designation')
        .not('designation', 'is', null);
      return [...new Set(data?.map(p => p.designation))].filter(Boolean).sort();
    }
  });
  
  // Fetch distinct PMS grades from profiles
  const { data: grades } = useQuery({
    queryKey: ['distinct-grades'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('pms_grade')
        .not('pms_grade', 'is', null);
      return [...new Set(data?.map(p => p.pms_grade))].filter(Boolean).sort();
    }
  });
  
  // Fetch managers (profiles who have direct reports)
  const { data: managers } = useQuery({
    queryKey: ['managers-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, reporting_manager_id')
        .order('full_name');
      
      const managerIds = new Set(data?.map(p => p.reporting_manager_id).filter(Boolean));
      return data?.filter(p => managerIds.has(p.id))
                  .map(p => ({ id: p.id, name: p.full_name || 'Unknown' }));
    }
  });
  
  return { departments, designations, grades, managers };
}
```

### 3. Update Review Pages

**Files to Modify:**
- `src/pages/TeamReview.tsx`
- `src/pages/AuditPanel.tsx`
- `src/pages/ManagementReview.tsx`

For each page:
1. Import `EmployeeFilters` and `useEmployeeFilterOptions`
2. Add state for new filters: `selectedDepartment`, `selectedDesignation`, `selectedGrade`, `selectedManager`
3. Update `displayMembers` memo to apply all filters
4. Replace current filter UI with `EmployeeFilters` component
5. Add "Clear All Filters" button when any filter is active

### 4. Enhanced Filtering Logic

Update the `displayMembers` memo in each page:

```typescript
const displayMembers = useMemo(() => {
  let filtered = baseMembers;

  // Text search (existing)
  if (searchQuery) {
    filtered = filtered?.filter(p => 
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Department filter (NEW)
  if (selectedDepartment) {
    filtered = filtered?.filter(p => p.department_id === selectedDepartment);
  }

  // Designation filter (NEW)
  if (selectedDesignation) {
    filtered = filtered?.filter(p => p.designation === selectedDesignation);
  }

  // PMS Grade filter (NEW)
  if (selectedGrade) {
    filtered = filtered?.filter(p => p.pms_grade === selectedGrade);
  }

  // Reporting Manager filter (NEW - for Audit/Management only)
  if (selectedManager) {
    filtered = filtered?.filter(p => p.reporting_manager_id === selectedManager);
  }

  // Status filter (existing but refined)
  if (statusFilter !== 'all' && periodKpis) {
    // ... existing status logic
  }

  return filtered;
}, [baseMembers, searchQuery, selectedDepartment, selectedDesignation, 
    selectedGrade, selectedManager, statusFilter, periodKpis]);
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/EmployeeFilters.tsx` | Shared filter bar component |
| `src/hooks/useEmployeeFilterOptions.ts` | Hook for fetching filter dropdown options |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/TeamReview.tsx` | Add new filter state, integrate EmployeeFilters, update displayMembers |
| `src/pages/AuditPanel.tsx` | Add new filter state, integrate EmployeeFilters, update displayMembers |
| `src/pages/ManagementReview.tsx` | Add new filter state, integrate EmployeeFilters, update displayMembers |
| `DOCUMENTATION.md` | Document new filter capabilities |

---

## UI Design

### Filter Bar Component

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│  Filters                                                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  [🔍 Search employees...          ] [All Departments ▼] [All Designations ▼]  │
│                                                                                │
│  [All Grades ▼] [All Managers ▼] [All Status ▼]               [✕ Clear All]   │
│                                                                                │
│  Active: Department: HR • Grade: JM-SM                        2 filters active │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Active Filter Badges

When filters are active, show removable badges:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│  [HR-Human Resources ✕]  [JM-SM ✕]  [Deputy Manager ✕]                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

1. **Phase 1 - Foundation**
   - Create `useEmployeeFilterOptions` hook
   - Create `EmployeeFilters` component

2. **Phase 2 - Integration**
   - Update TeamReview page with new filters
   - Update AuditPanel page with new filters
   - Update ManagementReview page with new filters

3. **Phase 3 - Polish**
   - Add active filter badges
   - Add "Clear All" functionality
   - Update documentation

---

## Filter Behavior

| Scenario | Behavior |
|----------|----------|
| Multiple filters | AND logic - all conditions must match |
| Empty filter | Shows all (no filtering applied) |
| No matches | Shows "No employees found" with suggestion to adjust filters |
| Filter persistence | Filters reset when leaving page (no URL persistence) |

---

## Status Options by Page

### Team Review
- All Employees
- With Pending Reviews (status = 'self_review')
- Reviewed (status in ['manager_check', 'audit', 'management_review', 'approved'])

### Audit Panel
- All Employees
- With Pending Audit (status = 'manager_check')
- In Audit (status = 'audit')
- Forwarded (status in ['management_review', 'approved'])

### Management Review
- All Employees
- With Pending Reviews (status = 'management_review')
- Approved (status = 'approved')

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Faster Employee Lookup** | Reviewers can filter by department instead of scrolling |
| **Grade-Based Review** | Management can focus on specific performance bands |
| **Manager Visibility** | View all employees under a specific manager |
| **Consistent UX** | Same filter pattern across all review pages |

