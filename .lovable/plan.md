

# Plan: Enhance Org KPI Data Entry Page with Filters and Updated Table Structure

## Overview

This plan updates the Organization KPI Data Entry page with:
1. Enhanced filter capabilities matching other review pages
2. Updated table columns focusing on employee information and remarks
3. Supporting file upload capability

---

## Part 1: Database Schema Change

### Add `evidence_url` Column to org_kpi_values

The `org_kpi_values` table currently lacks a column for file attachments. Need to add:

```sql
ALTER TABLE public.org_kpi_values
  ADD COLUMN evidence_url TEXT;
```

---

## Part 2: Enhanced Filters

### Current Filters:
- Review Period/Year
- Category

### New Filters to Add:
| Filter | Source | Purpose |
|--------|--------|---------|
| Search | Text input | Search by Employee name, code, KPI name |
| Department | `useEmployeeFilterOptions` | Filter by department |
| Designation | `useEmployeeFilterOptions` | Filter by job title |
| KRA Name | Derived from org KPIs | Filter by specific KRA |

### Implementation Approach:

1. Import `useEmployeeFilterOptions` hook
2. Add state variables for each filter
3. Update `displayRows` memo to apply filters
4. Render filter controls in the Filters card

```typescript
// New state variables
const [searchQuery, setSearchQuery] = useState('');
const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
const [selectedDesignation, setSelectedDesignation] = useState<string | null>(null);
const [selectedKraName, setSelectedKraName] = useState<string | null>(null);

// Use filter options hook
const { departments: deptList, designations } = useEmployeeFilterOptions();
```

### Filter Logic:
```typescript
const filteredDisplayRows = useMemo(() => {
  return displayRows.filter(row => {
    // Search filter - match employee name, code, or KPI name
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const empName = row.employeeName?.toLowerCase() || '';
      const empCode = row.employeeCode?.toLowerCase() || '';
      const kpiName = row.kpi.kpi_name.toLowerCase();
      const kraName = row.kpi.kra_name.toLowerCase();
      if (!empName.includes(query) && !empCode.includes(query) && 
          !kpiName.includes(query) && !kraName.includes(query)) {
        return false;
      }
    }
    
    // Department filter
    if (selectedDepartmentId && row.departmentId !== selectedDepartmentId) {
      return false;
    }
    
    // Designation filter
    if (selectedDesignation && row.designation !== selectedDesignation) {
      return false;
    }
    
    // KRA filter
    if (selectedKraName && row.kpi.kra_name !== selectedKraName) {
      return false;
    }
    
    return true;
  });
}, [displayRows, searchQuery, selectedDepartmentId, selectedDesignation, selectedKraName]);
```

---

## Part 3: Updated Table Structure

### Column Changes

| Remove | Add |
|--------|-----|
| Scope | Employee Name (Code) |
| Target | Department |
| Data Source | Designation |
| | Remark |
| | Supporting File |

### New Table Header:
```tsx
<TableHeader>
  <TableRow className="bg-muted/50">
    <TableHead>Category</TableHead>
    <TableHead>KRA</TableHead>
    <TableHead>KPI</TableHead>
    <TableHead>Employee Name (Code)</TableHead>
    <TableHead>Department</TableHead>
    <TableHead>Designation</TableHead>
    <TableHead className="text-center w-36">Achieved Value</TableHead>
    <TableHead className="w-48">Remark</TableHead>
    <TableHead className="w-36">Supporting File</TableHead>
  </TableRow>
</TableHeader>
```

### Enhanced Display Rows:

To show Employee Name, Code, Department, and Designation, the `displayRows` needs to be enhanced to include employee profile data:

```typescript
const displayRows = useMemo(() => {
  const rows: Array<{
    kpi: typeof filteredKpis[0];
    departmentId: string | null;
    departmentName: string | null;
    employeeId: string | null;
    employeeName: string | null;
    employeeCode: string | null;
    designation: string | null;
    scope: OrgLevelScope;
  }> = [];

  filteredKpis.forEach(kpi => {
    const scope = (kpi as any).org_level_scope as OrgLevelScope || 'organization';
    
    if (scope === 'organization') {
      // Single row for entire org
      rows.push({
        kpi,
        departmentId: null,
        departmentName: null,
        employeeId: null,
        employeeName: 'All Employees',
        employeeCode: null,
        designation: null,
        scope,
      });
    } else if (scope === 'department') {
      // One row per department
      departments?.forEach(dept => {
        rows.push({
          kpi,
          departmentId: dept.id,
          departmentName: dept.name,
          employeeId: null,
          employeeName: `All in ${dept.name}`,
          employeeCode: null,
          designation: null,
          scope,
        });
      });
    } else if (scope === 'employee') {
      // One row per employee - include full profile data
      allProfiles?.forEach(emp => {
        const empDept = departments?.find(d => d.id === emp.department_id);
        rows.push({
          kpi,
          departmentId: emp.department_id,
          departmentName: empDept?.name || null,
          employeeId: emp.id,
          employeeName: emp.full_name || emp.email,
          employeeCode: emp.employee_code || null,
          designation: emp.designation || null,
          scope,
        });
      });
    }
  });

  return rows;
}, [filteredKpis, departments, allProfiles]);
```

### Remark Column:

Add a new field to `EditableKpi` interface and handling:

```typescript
interface EditableKpi {
  // ... existing fields
  remarks: string;  // New field for remark
  evidence_url: string | null;  // New field for supporting file
}
```

Remark input in table:
```tsx
<TableCell>
  <Input
    value={display.remarks || ''}
    onChange={(e) => handleValueChange(..., 'remarks', e.target.value, ...)}
    placeholder="Enter remark"
    className="h-8"
  />
</TableCell>
```

### Supporting File Column:

Create a compact file upload component for inline use:

```tsx
<TableCell>
  <OrgKpiFileUpload
    categoryId={kpi.category_id}
    kraName={kpi.kra_name}
    kpiName={kpi.kpi_name}
    existingUrl={display.evidence_url}
    onUploadComplete={(url) => handleValueChange(..., 'evidence_url', url, ...)}
  />
</TableCell>
```

---

## Part 4: Update Types and Hook

### Update OrgKpiValue Interface:
```typescript
export interface OrgKpiValue {
  // ... existing fields
  evidence_url: string | null;  // Add this
}
```

### Update useBulkUpsertOrgKpiValues:
Include `evidence_url` in the upsert logic.

---

## Part 5: Remove Global Data Source Section

Since we're removing the Data Source column, also remove the "Apply Data Source to All" section from the CardContent.

---

## File Changes Summary

| File | Changes |
|------|---------|
| **Migration** | Add `evidence_url` column to `org_kpi_values` |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add filters, update table columns, remove Scope/Target/Data Source |
| `src/hooks/useOrgKpiValues.ts` | Add `evidence_url` to interface and upsert mutation |

---

## Detailed UI Changes

### Before (Current Columns):
| Category | KRA | KPI | Scope | Target | Achieved Value | Data Source |

### After (New Columns):
| Category | KRA | KPI | Employee Name (Code) | Department | Designation | Achieved Value | Remark | Supporting File |

---

## Filter Section Layout:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Filters                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Review Period ▼] [Year ▼] [🔍 Search employees/KPIs...]                     │
│                                                                               │
│ [Category ▼] [Department ▼] [Designation ▼] [KRA ▼] [Clear All]              │
│                                                                               │
│ Active: [× Finance] [× Manager] [× Safety KRA]                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Sequence

1. **Database Migration**: Add `evidence_url` column
2. **Update Types**: Update `OrgKpiValue` interface
3. **Update Hook**: Add `evidence_url` to upsert mutation
4. **Update Page**: 
   - Import `useEmployeeFilterOptions`
   - Add filter state and controls
   - Update `displayRows` to include employee details
   - Rebuild table with new columns
   - Add file upload component
   - Remove global data source section
5. **Documentation**: Update DOCUMENTATION.md

---

## Validation Checklist

After implementation:
- [ ] Search filter works for employee name, code, and KPI names
- [ ] Department filter correctly filters rows
- [ ] Designation filter correctly filters rows
- [ ] KRA filter correctly filters rows
- [ ] Employee Name (Code) column displays correctly
- [ ] Department column shows employee's department
- [ ] Designation column shows employee's designation
- [ ] Remark field saves to database
- [ ] Supporting File upload works and saves URL
- [ ] Save All button includes new fields
- [ ] Scope, Target, Data Source columns are removed

