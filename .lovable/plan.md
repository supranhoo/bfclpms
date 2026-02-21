
# Fix: Step Back Dialog Stuck When KPI Status Not in Employee's Workflow

## The Problem

The "Step Back" dialog is stuck showing `Management Review <- —` because the employee's resolved workflow is `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]` which does **not** include `management_review`. The `getPreviousStatus` function does an `indexOf` lookup for `management_review` in the employee's stages, gets `-1`, and returns `null` -- making the dialog unusable.

This can happen when an admin or management user manually advanced a KPI beyond the employee's configured workflow, or when the workflow template was changed after the KPI was already in progress.

## The Fix

### File: `src/hooks/useAdminDataEntry.ts` (~line 434-441)

Update `getPreviousStatus` to **fall back to the full 8-stage order** when the current status is not found in the employee's workflow. This ensures the step-back always resolves a valid target, even for "orphaned" statuses.

```typescript
export function getPreviousStatus(
  current: ...,
  workflowStages?: string[]
): ... | null {
  const stages = (workflowStages || FULL_STATUS_ORDER) as ...;
  const idx = stages.indexOf(current);
  // If status not found in employee's workflow, fall back to full order
  if (idx === -1 && workflowStages) {
    const fullIdx = FULL_STATUS_ORDER.indexOf(current);
    return fullIdx > 0 ? FULL_STATUS_ORDER[fullIdx - 1] : null;
  }
  return idx > 0 ? stages[idx - 1] : null;
}
```

### File: `src/pages/admin/AllKpis.tsx` (~line 753)

Same issue for the button visibility check -- it uses `getPreviousStatus` without workflow stages so uses the full list (this part works fine, but it means the button shows even when the dialog will be stuck). No change needed here since the core fix is in `getPreviousStatus`.

### File: `DOCUMENTATION.md`

Version bump to 1.45.60 and document the fix.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Add fallback to FULL_STATUS_ORDER when status not in employee workflow |
| `DOCUMENTATION.md` | Version bump + changelog |
