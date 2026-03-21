

## Add "Reporting Manager" Column to Workflow Configuration Report

### What Changes
Add a "Reporting Manager" column to the Employee Overrides sheet showing the manager's name resolved from `reporting_manager_id`.

### Files Modified

#### 1. `src/pages/admin/WorkflowConfig.tsx` (line 147)
Add `reporting_manager_id` to the profiles select query:
```
.select('id, full_name, email, employee_code, pms_grade, department_id, reporting_manager_id')
```

#### 2. `src/components/admin/WorkflowConfigExport.tsx`

**a) Profile interface** — add `reporting_manager_id: string | null`

**b) Employee Overrides row mapping** — resolve manager name via `profileMap`:
```typescript
const manager = p?.reporting_manager_id ? profileMap.get(p.reporting_manager_id) : null;
// Add column:
'Reporting Manager': manager?.full_name || '—',
```
Place after "Department" column.

**c) Column widths** — add `{ wch: 22 }` for the new column.

### No database changes needed.

