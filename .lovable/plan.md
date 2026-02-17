

# Fix: Admin Data Entry Dialog — Show Correct Workflow Stages

## Problem

The Admin Data Entry dialog hardcodes only 4 role levels: **Self Review, Manager, Auditor, Management**. However, the workflow engine supports up to 8 stages, including **Skip-Level** and **HR PMS**. When an employee's workflow includes these stages, the admin cannot enter data for them because they don't appear in the dialog.

## Solution

Make the "Data Entry Level" radio buttons **dynamic** — fetch the employee's actual workflow stages and only show the levels that exist in their pipeline.

## Changes

### File 1: `src/hooks/useAdminDataEntry.ts`

**Expand `AdminRoleLevel` type** to include skip_level and hr_pms:

```
// Before
export type AdminRoleLevel = 'self' | 'manager' | 'auditor' | 'management';

// After
export type AdminRoleLevel = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';
```

**Update `buildUpdateFields`** to handle skip_level and hr_pms prefixes correctly (they already follow the `{prefix}_rating`, `{prefix}_score` pattern in the DB).

### File 2: `src/components/admin/AdminDataEntryDialog.tsx`

**Replace hardcoded `ROLE_LEVELS`** with a full list that includes all 6 levels, plus a stage-to-role mapping:

```text
ALL_ROLE_LEVELS:
  self        -> self_review
  manager     -> manager_check
  skip_level  -> skip_level_check
  hr_pms      -> hr_pms_review
  auditor     -> audit
  management  -> management_review
```

**Fetch employee's workflow stages** using `useEmployeeWorkflowStages(employeeId)` and filter `ALL_ROLE_LEVELS` to only show roles whose corresponding stage exists in the employee's workflow.

**Update the existing `useEffect` for loading data** (the switch/case at line 314) to add cases for `skip_level` and `hr_pms`, reading from `existingSubmission.skip_level_*` and `existingSubmission.hr_pms_*` fields.

**Adjust grid layout**: Change from `grid-cols-4` to a responsive layout since there can be up to 6 radio buttons now.

### File 3: `DOCUMENTATION.md`

Document that the Admin Data Entry dialog dynamically resolves workflow stages per employee.

## What Changes for the User

| Before | After |
|---|---|
| Always shows: Self, Manager, Auditor, Management | Shows only stages in the employee's assigned workflow |
| Cannot enter Skip-Level or HR PMS data | Can enter data for all applicable workflow levels |
| 4-button fixed layout | Responsive layout adapting to 4-6 buttons |

## No Database Changes Required

The `review_submissions` table already has `skip_level_*` and `hr_pms_*` columns. The `buildUpdateFields` helper just needs to handle the new prefixes.
