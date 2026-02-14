

# Fix: Send Back Status Resolution and Data Clearing

## Root Cause Analysis

### What Happened
Jaspal (admin, acting as skip-level reviewer) sent back Tanaaz's KPI "Fulfillment of Vacant Positions (M level)" to the Manager. The system showed a success toast, but:
- The KPI audit log **was written** (action: `SKIP_LEVEL_SENT_BACK_TO_MANAGER`)
- The KPI status **was updated** -- but to the WRONG value: `manager_check`
- The manager's scores **were NOT cleared** (still `manager_score: 5.00`, `manager_rating: blue`)

### Bug 1: `resolveSendBackStatus` Returns Wrong Status

In `src/lib/workflowEngine.ts`, the function maps send-back targets to the COMPLETED stage status instead of the PENDING status:

```text
Current (broken):
  target='manager'  -> returns 'manager_check'   (= manager DONE)
  target='skip_level' -> returns 'skip_level_check' (= skip-level DONE)
  target='hr_pms'    -> returns 'hr_pms_review'     (= HR PMS DONE)

Correct:
  target='manager'  -> returns 'self_review'       (manager picks up here)
  target='skip_level' -> returns 'manager_check'   (skip-level picks up here)
  target='hr_pms'    -> returns 'skip_level_check'  (HR PMS picks up here)
  target='auditor'   -> returns preceding stage of 'audit'
```

The convention is: a status name represents a COMPLETED stage. The manager reviews KPIs at `self_review` (the stage before `manager_check`). So sending back to manager must set status to `self_review`, not `manager_check`.

### Bug 2: Send-Back Only Clears Current Reviewer's Fields

The send-back mutation in `UnifiedScorecard.tsx` (line 474-479) only clears the current reviewer's own fields:
```text
const prefix = config.scoreFieldPrefix;  // e.g. 'skip_level'
updateData[`${prefix}_rating`] = null;   // clears skip_level_rating
updateData[`${prefix}_score`] = null;    // clears skip_level_score
updateData[`${prefix}_remarks`] = null;  // clears skip_level_remarks
```

But it does NOT clear the target reviewer's fields or any downstream data. Compare with the admin step-back (`useAdminDataEntry.ts` lines 400-439) which correctly clears ALL downstream fields based on the target status.

### Proof from Database
- KPI `9f08d421` status: `manager_check` (should be `self_review`)
- Submission: `manager_score: 5.00`, `manager_rating: blue` (should be cleared)
- Skip-level fields: `null` (correctly cleared by current logic)

## Fix Plan

### Fix 1: Correct `resolveSendBackStatus` (workflowEngine.ts)

The function should return the status that PRECEDES the target reviewer's stage, so the target reviewer sees it as pending:

| Target | Current Return | Fixed Return | Logic |
|---|---|---|---|
| employee | `kra_set` | `kra_set` | Correct (no change) |
| manager | `manager_check` | `self_review` | Manager reviews at `self_review` |
| skip_level | `skip_level_check` | `manager_check` | Skip-level reviews at `manager_check` |
| hr_pms | `hr_pms_review` | `skip_level_check` | HR PMS reviews at `skip_level_check` |
| auditor | `audit` | stage before `audit` in workflow | Auditor reviews at preceding stage |

Implementation: For each target, find the target's corresponding workflow stage and return the stage BEFORE it using `resolvePreviousStatus`.

### Fix 2: Clear Downstream Review Data on Send-Back (UnifiedScorecard.tsx)

Adopt the same cascading clear logic from the admin step-back. Based on the resolved target status, clear ALL fields from that stage onward:

- Send back to `kra_set`: clear self + manager + skip_level + hr_pms + auditor + management fields, reset `kpi_status` to `open`
- Send back to `self_review`: clear manager + skip_level + hr_pms + auditor + management fields
- Send back to `manager_check`: clear skip_level + hr_pms + auditor + management fields
- Send back to `skip_level_check`: clear hr_pms + auditor + management fields
- And so on...

### Fix 3: Update Existing Unit Tests (workflowEngine.test.ts)

Update the existing tests for `resolveSendBackStatus` to reflect the corrected return values.

## Files to Modify

| File | Change |
|---|---|
| `src/lib/workflowEngine.ts` | Fix `resolveSendBackStatus` to return the preceding status |
| `src/components/review/UnifiedScorecard.tsx` | Add cascading field-clear logic mirroring admin step-back |
| `src/lib/workflowEngine.test.ts` | Update tests for corrected status resolution |
| `DOCUMENTATION.md` | Document the fix |

## Technical Details

### workflowEngine.ts - New `resolveSendBackStatus`

```text
export function resolveSendBackStatus(
  target: string,
  viewLevel: ...,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string {
  if (target === 'employee') return 'kra_set';

  // Map target to their workflow stage
  const targetStageMap: Record<string, string> = {
    manager: 'manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
  };

  const targetStage = targetStageMap[target];
  if (!targetStage) return 'kra_set';

  // Return the status BEFORE the target's stage (so they see it as pending)
  const previous = resolvePreviousStatus(targetStage, workflowStages);
  return previous || 'kra_set';
}
```

### UnifiedScorecard.tsx - Cascading Field Clear

```text
// Build clear fields based on target status (same as admin step-back)
const clearFields: Record<string, unknown> = {};
const statusOrder = ['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review','approved'];
const targetIdx = statusOrder.indexOf(newStatus);

// Clear kpi_status if going back to kra_set
if (newStatus === 'kra_set') {
  clearFields.kpi_status = 'open';
  clearFields.self_rating = null; clearFields.self_score = null; ...
}
// Clear manager if target <= self_review
if (targetIdx <= statusOrder.indexOf('self_review')) {
  clearFields.manager_rating = null; clearFields.manager_score = null; ...
}
// Clear skip_level if target <= manager_check
if (targetIdx <= statusOrder.indexOf('manager_check')) {
  clearFields.skip_level_rating = null; clearFields.skip_level_score = null; ...
}
// ... continue for hr_pms, auditor, management
```

## Risk Assessment
- **Low risk**: The `resolveSendBackStatus` fix is a logic correction that aligns behavior with the documented convention
- **Cascading clear**: Mirrors the proven admin step-back logic already in production
- **No schema changes**: Pure frontend/logic fix
