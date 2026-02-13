

# Custom Workflow Builder — Select Stages from a Checklist

## Overview

Add a "Create Custom Workflow" feature to the Templates tab on the Workflow Configuration page. Admins will be able to build a new workflow template by toggling ON/OFF the optional review stages from a visual checklist. The fixed stages (KRA Set, Self Review, Approved) are always included and cannot be removed.

## UI Design

A new "Create Custom Template" button on the Templates tab opens a dialog with:

1. **Template Name** — text input for the display name (e.g., "Sales Team Workflow")
2. **Stage Selector** — a list of toggleable stages in fixed order:

| Stage | Default | Removable? |
|---|---|---|
| KRA Set | Always ON | No (locked) |
| Self Review | Always ON | No (locked) |
| Manager Review | ON | Yes |
| Skip-Level Review | OFF | Yes |
| HR PMS Review | OFF | Yes |
| Audit Review | ON | Yes |
| Management Review | ON | Yes |
| Approved | Always ON | No (locked) |

Each optional stage has a Switch toggle. As the admin toggles stages, a live preview arrow chain updates below (e.g., "KRA Set -> Self Review -> Manager Review -> Audit -> Approved").

3. **Save** button inserts a new row into `workflow_templates`.

Admins can also **edit** existing custom templates (non-default ones) and **delete** them if not in use.

## Changes

### 1. New Component: `src/components/admin/CustomWorkflowDialog.tsx`

A dialog with:
- Text input for `display_name` and optional `description`
- Fixed-order stage list with Switch toggles
- Live `WorkflowStagesPreview` at the bottom
- Save button that inserts/updates `workflow_templates`
- Edit mode: pre-populates from existing template

### 2. Update `src/pages/admin/WorkflowConfig.tsx`

- Add "Create Custom Template" button to the Templates tab header
- Add Edit and Delete action buttons on each non-default template card
- Wire up the dialog for create and edit modes

### 3. New Hooks in `src/hooks/useWorkflowConfig.ts`

- `useCreateWorkflowTemplate()` — mutation to insert a new template
- `useUpdateWorkflowTemplate()` — mutation to update stages/name of existing template
- `useDeleteWorkflowTemplate()` — mutation to delete (with check that no configs reference it)

### 4. Database: Add unique constraint on template name

A migration to add a unique constraint on `workflow_templates.name` to prevent duplicate template names.

### 5. Update `DOCUMENTATION.md`

Document the custom workflow builder feature.

## Stage Order Logic

The stage order is always fixed regardless of which toggles are on. The system builds the `stages` array by filtering this master order:

```
['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved']
```

Only the toggled-on stages are included, preserving the correct sequence.

## Validation Rules

- At least one optional stage must be selected (can't have just KRA Set -> Self Review -> Approved with nothing in between)
- Template name is required and must be unique
- Cannot delete a template that is currently assigned to any employee, department, or PMS grade

## Files to Create/Modify

- **Create**: `src/components/admin/CustomWorkflowDialog.tsx`
- **Modify**: `src/pages/admin/WorkflowConfig.tsx` (add button + edit/delete actions)
- **Modify**: `src/hooks/useWorkflowConfig.ts` (add create/update/delete mutations)
- **Migration**: Unique constraint on `workflow_templates.name`
- **Modify**: `DOCUMENTATION.md`

