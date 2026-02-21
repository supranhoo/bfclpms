

# Fix: Step Back Dialog Not Using Employee's Actual Workflow Stages

## The Bug

The `AdminStatusStepBackDialog` calls `getPreviousStatus(currentStatus)` **without** passing the employee's actual workflow stages. It always uses a hardcoded full 8-stage list. This means:

- If an employee's workflow skips certain stages (e.g., no Skip-Level, no HR PMS), the step-back could target a **non-existent stage**, orphaning the KPI in a status nobody can review.
- Example: Employee workflow is `kra_set -> self_review -> manager_check -> audit -> approved`. Stepping back from `audit` would incorrectly target `hr_pms_review` (which doesn't exist for this employee) instead of `manager_check`.

## Fix

### 1. Pass workflow stages from AllKpis.tsx into the dialog

**File: `src/pages/admin/AllKpis.tsx`**

The page already fetches workflow configurations (via `useWorkflowConfig` or similar). Pass the employee's resolved workflow stages to the `AdminStatusStepBackDialog` as a new prop.

### 2. Update AdminStatusStepBackDialog to accept and use workflow stages

**File: `src/components/admin/AdminStatusStepBackDialog.tsx`**

- Add optional prop `workflowStages?: string[]`
- Pass it to `getPreviousStatus(currentStatus, workflowStages)` so the target is resolved against the employee's actual pipeline
- Display the correct stage labels in the status transition badges

### 3. Update DOCUMENTATION.md

- Version bump to 1.45.59
- Document the bug fix

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/AdminStatusStepBackDialog.tsx` | Accept `workflowStages` prop, pass to `getPreviousStatus` |
| `src/pages/admin/AllKpis.tsx` | Pass employee's workflow stages to the dialog |
| `DOCUMENTATION.md` | Version bump + changelog |

No database changes required.

