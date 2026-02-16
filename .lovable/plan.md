

# Add Employee Names Next to Department in Scoped Entry Table

## Problem

In the "Per Department" scoped entry table on the Org KPI Data Entry page, only the department name is shown. Admins want to see which employees are mapped under each department for context.

## Solution

Add a secondary line below each department name showing the first names of employees mapped to that KPI in that department.

## Changes

### 1. `src/components/admin/OrgKpiScopedEntryTable.tsx`

- Add optional `scopeSubText` field to the `ScopedRow` interface
- Render it as a secondary line (smaller, muted text) below the `scopeName` in the table cell

### 2. `src/pages/admin/OrgKpiDataEntry.tsx`

- When building department scoped rows, cross-reference `mappedEmployeesMap` with `allProfiles` to find employees in each department
- Build a comma-separated list of employee first names and pass it as `scopeSubText`
- Logic: for each department row, filter the KPI's mapped employee IDs to those whose `department_id` matches, then extract their first names

### 3. `DOCUMENTATION.md`

- Update to note that department scoped rows now show mapped employee names

## Technical Details

| File | Change |
|---|---|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add `scopeSubText?: string` to `ScopedRow`; render below scope name |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Compute employee names per department when building scoped rows |
| `DOCUMENTATION.md` | Document the enhancement |

**UI Example:**

```
| Department                          | Achieved | Remark | File   |
| 1050 TPD-E And I                    |    —     | Remark | Upload |
|   Rajesh, Amit, Suresh              |          |        |        |
```

The employee names appear as a small muted line under the department name within the same table cell -- no extra column needed.

