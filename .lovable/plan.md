

# Add "Set as Default" and Allow Editing Default Workflow Template

## Clarification: What "Default" Means

The priority cascade is: **Employee > Department > PMS Grade > Default**

Changing the default template ONLY affects employees/departments/grades that show **"Inherit (default)"** in their workflow dropdown -- i.e., those with no explicit assignment. Any explicitly set workflows remain completely untouched.

## Changes

### 1. New mutation in `src/hooks/useWorkflowConfig.ts`

Add `useSetDefaultWorkflowTemplate`:
- Unset `is_default = false` on all templates
- Set `is_default = true` on the selected template
- Invalidate query caches

### 2. Update `src/pages/admin/WorkflowConfig.tsx` template cards

Current behavior (line 234): `{!template.is_default && (` blocks both Edit and Delete for the default template.

New behavior:
- **Edit button**: Always visible on ALL templates (including default) -- allows editing name, description, stages
- **Delete button**: Only visible on non-default templates (cannot delete the active default)
- **"Set as Default" button**: New star/shield icon button on non-default templates. When clicked, swaps the default flag. A confirmation toast clarifies: "This only affects employees inheriting the default workflow."

### 3. Update `DOCUMENTATION.md`

Document that "Set as Default" only impacts the inherit/fallback cascade.

## Files Modified

| File | Change |
|---|---|
| `src/hooks/useWorkflowConfig.ts` | Add `useSetDefaultWorkflowTemplate` mutation |
| `src/pages/admin/WorkflowConfig.tsx` | Add "Set as Default" button, allow editing default template |
| `DOCUMENTATION.md` | Document the feature |

## Risk: Very Low

- Only changes the `is_default` boolean on `workflow_templates` -- no `workflow_config` rows are touched
- Explicitly assigned workflows (Employee/Department/PMS Grade level) are completely unaffected
- Only the fallback/inherit path changes

