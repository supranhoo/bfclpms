

# Workflow Template Deletion Safety Improvements

## Analysis

After investigating, the concern about orphaning in-progress reviews is **less severe than initially described** because:

1. **KPIs don't store a workflow template reference** -- workflows are resolved dynamically at query time via `get_employee_workflow()`, which cascades through employee, department, PMS grade, and default template
2. **The default template is already protected** -- the UI hides the delete button for it (line 244 of WorkflowConfig.tsx)
3. **The existing check** catches templates assigned via `workflow_config` rows

However, there are **two real gaps**:

**Gap A**: An admin could remove a `workflow_config` assignment first, then delete the template. Employees whose workflow was resolved through that assignment would silently fall back to a different cascade level (department, grade, or default), potentially changing their active workflow mid-review cycle.

**Gap B**: No "soft delete" or archive option exists. Once deleted, the template is gone permanently -- there's no way to restore it or review historical workflow paths for auditing.

## Solution

Add two safety checks and an archive capability:

### 1. Check for in-progress KPIs using the template (`useWorkflowConfig.ts`)
Before deletion, query employees whose effective workflow resolves to this template (via `workflow_config` entries) and check if any of them have KPIs in non-terminal statuses (`kra_set` through the last review stage, excluding `approved`). Block deletion if any active KPIs exist.

### 2. Add `is_active` column for soft-delete / archiving
Instead of hard-deleting, offer an "Archive" option that sets `is_active = false`. Archived templates are hidden from assignment dropdowns but preserved for audit history.

### 3. UI updates (`WorkflowConfig.tsx`)
- Replace the "Delete" action with "Archive" for templates that have ever been used
- Show archived templates in a collapsible section with a "Restore" option
- Keep hard delete only for templates that have never been assigned

## Changes

### 1. Database migration
- Add `is_active BOOLEAN DEFAULT true` column to `workflow_templates`
- Update `get_employee_workflow` and `get_employee_workflow_info` functions to filter by `is_active = true`
- Create a helper function `check_template_has_active_kpis(template_uuid)` that returns true if any employee whose workflow resolves to this template has non-approved KPIs

### 2. `src/hooks/useWorkflowConfig.ts`
- Update `useDeleteWorkflowTemplate` to call `check_template_has_active_kpis` before deletion
- Add new `useArchiveWorkflowTemplate` mutation that sets `is_active = false`
- Add `useRestoreWorkflowTemplate` mutation that sets `is_active = true`
- Update `useWorkflowTemplates` to accept an optional `includeArchived` parameter

### 3. `src/pages/admin/WorkflowConfig.tsx`
- Replace the delete action with "Archive" for non-default templates
- Show archived templates in a collapsible "Archived" section with restore/delete options
- Hard delete only allowed for archived templates with no active KPIs and no config references

### 4. `DOCUMENTATION.md`
- Document archive vs delete behavior and the active-KPI safety check

## Technical Details

| File | Change |
|---|---|
| Database migration | Add `is_active` column, update workflow resolution functions, add `check_template_has_active_kpis` RPC |
| `src/hooks/useWorkflowConfig.ts` | Add archive/restore mutations, enhance delete with active-KPI check |
| `src/pages/admin/WorkflowConfig.tsx` | Archive UI, archived section with restore, conditional hard delete |
| `DOCUMENTATION.md` | Document template lifecycle (active/archived/deleted) |

