

# Fix: Step Back Fallback Maps to Non-Existent Workflow Stage

## The Bug

When a KPI's current status is not in the employee's workflow (orphaned status), the `getPreviousStatus` fallback returns the immediately preceding stage from the global `FULL_STATUS_ORDER` -- but that stage might **also** not exist in the employee's workflow.

**Example:**
- Employee workflow: `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]`
- KPI status: `management_review` (not in employee's workflow)
- Current fallback returns: `audit` (index 5 in full order)
- Problem: `audit` is also NOT in the employee's workflow -- KPI gets orphaned again

## The Fix

### File: `src/hooks/useAdminDataEntry.ts` (line 434-446)

Update `getPreviousStatus` so the fallback walks backward through `FULL_STATUS_ORDER` and returns the **first stage that exists in the employee's workflow**:

```typescript
export function getPreviousStatus(
  current: ReviewStatus,
  workflowStages?: string[]
): ReviewStatus | null {
  const stages = (workflowStages || FULL_STATUS_ORDER) as ReviewStatus[];
  const idx = stages.indexOf(current);

  // If status not found in employee's workflow, walk backward
  // through the full order to find the nearest stage that IS
  // in the employee's workflow
  if (idx === -1 && workflowStages) {
    const fullIdx = FULL_STATUS_ORDER.indexOf(current);
    for (let i = fullIdx - 1; i >= 0; i--) {
      if (workflowStages.includes(FULL_STATUS_ORDER[i])) {
        return FULL_STATUS_ORDER[i];
      }
    }
    return null;
  }

  return idx > 0 ? stages[idx - 1] : null;
}
```

With this fix, stepping back from `management_review` for the example employee would correctly land on `hr_pms_review` (the last stage in their workflow before `approved`).

### File: `DOCUMENTATION.md`

Version bump to 1.45.61 and document the fix.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Fix fallback to find nearest existing workflow stage |
| `DOCUMENTATION.md` | Version bump and changelog |

