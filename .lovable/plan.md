

# RCA and CAPA: Management Send-Back Lands at "Self Review"

## Root Cause Analysis (RCA)

The bug is in `src/components/review/ManagementScorecard.tsx`, lines 340-344. The send-back mutation has a **hardcoded status map** that is **incorrect**:

```typescript
const statusMap: Record<string, string> = {
  auditor: 'audit',
  manager: 'manager_check',
  employee: 'kra_set',
};
```

**Problem 1: Wrong status mapping.** When sending back to "manager", it sets status to `manager_check`. But `manager_check` means the manager has **already reviewed** it. To land in the manager's pending queue, the status should be `self_review` (the stage preceding `manager_check`). Same issue for "auditor" -- it sets `audit`, but audit means auditor has already approved. The correct status depends on the workflow.

**Problem 2: Hardcoded targets ignore workflow.** The UI shows three hardcoded buttons (`auditor`, `manager`, `employee`) and ignores the dynamic `sendBackTargets` already computed from the workflow engine on line 89. The 8-stage workflow (with Skip-Level and HR PMS) is completely ignored.

**Problem 3: No downstream data clearing.** The mutation only clears `management_*` fields. Per the send-back data integrity rule, it should cascade-clear all review data from the target stage forward.

**Summary:** The send-back from Management sets the KPI to the wrong status because it maps targets to their "completed" stage instead of their "pending" stage. Meanwhile, the workflow engine already has the correct function (`resolveSendBackStatus`) but it is never called.

## Corrective Action Plan (CAPA)

### Fix 1: Use Workflow Engine for Status Resolution (Critical)

Replace the hardcoded `statusMap` with a call to `resolveSendBackStatus(target, 'management', effectiveStages)` from `src/lib/workflowEngine.ts`. This correctly maps each target to the preceding stage so the KPI lands in the right reviewer's queue.

```text
Before:  target "manager"  -> status "manager_check" (WRONG - means manager already done)
After:   target "manager"  -> status "self_review"    (CORRECT - pending for manager)

Before:  target "auditor"  -> status "audit"          (WRONG - means auditor already done)
After:   target "auditor"  -> status "manager_check"  (CORRECT - pending for auditor)
```

### Fix 2: Use Dynamic Send-Back Targets in UI

Replace the hardcoded `['auditor', 'manager', 'employee']` buttons with the already-computed `sendBackTargets` array (line 89) which respects the employee's actual workflow. This also adds Skip-Level and HR PMS options when applicable.

### Fix 3: Cascade-Clear Downstream Review Data

After setting the correct status, clear all review data from the target stage forward (ratings, scores, remarks, evidence). This ensures data integrity when a KPI is sent back.

### Fix 4: Update the `sendBackTarget` State Type

Change the type from `'auditor' | 'manager' | 'employee'` to `string` to support dynamic targets including `skip_level` and `hr_pms`.

### Files to Change

| File | Change |
|---|---|
| `src/components/review/ManagementScorecard.tsx` | Replace hardcoded statusMap with `resolveSendBackStatus`; use dynamic `sendBackTargets` in UI; cascade-clear downstream data; fix state type |
| `DOCUMENTATION.md` | Document the corrected send-back behavior |

### Expected Result After Fix

| Send Back Target | Status Set To (6-stage) | Status Set To (8-stage) |
|---|---|---|
| Employee | `kra_set` | `kra_set` |
| Manager | `self_review` | `self_review` |
| Skip-Level | -- | `manager_check` |
| HR PMS | -- | `skip_level_check` |
| Auditor | `manager_check` | `hr_pms_review` |

