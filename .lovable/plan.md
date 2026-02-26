

# Fix: Manager Approval Not Advancing to "Approved" in Short Workflows

## Root Cause

In `src/lib/workflowEngine.ts`, the `resolveForwardStatus('manager', ...)` function is **hardcoded** to always return `'manager_check'`:

```
case 'manager':
  return 'manager_check';
```

For a short workflow like `['kra_set', 'self_review', 'manager_check', 'approved']` (where the manager is the terminal reviewer), this means KPIs get stuck at `manager_check` forever -- they never advance to `approved`. The correct behavior: when there is no stage after `manager_check`, the status should advance to `approved`.

This also causes a secondary issue: the `UnifiedScorecard` syncs `final_score` and `final_rating` only when `config.forwardStatus === 'approved'`. Since `forwardStatus` is stuck at `'manager_check'`, final scores are never written for these employees.

## Impact Analysis

Any employee whose resolved workflow template ends at `manager_check` (no audit, HR PMS, or management stages) is affected. Their KPIs can never reach `approved` status through normal workflow.

## Fix

### File: `src/lib/workflowEngine.ts`

Change the `manager` case in `resolveForwardStatus` from a hardcoded return to use `resolveNextStatus`, matching the pattern already used by `skip_level` and `hr_pms`:

```
case 'manager':
  return resolveNextStatus('manager_check', workflowStages) || 'manager_check';
```

- For the default 6-stage pipeline: `resolveNextStatus('manager_check', ...)` returns `'audit'` -- but manager shouldn't advance to audit; the convention is to set `manager_check` so the auditor sees it as pending. However, looking more carefully at the convention, other roles (skip_level, hr_pms, auditor) already use `resolveNextStatus` to advance **past** their own stage. The manager case should follow the same pattern.
- For `['kra_set', 'self_review', 'manager_check', 'approved']`: returns `'approved'`
- For the default 6-stage pipeline: returns `'audit'` (which is the same behavior as before since auditor sees `manager_check` and `audit` as reviewable via the dual-status pattern)

Wait -- this would change behavior for 6-stage pipelines where manager currently sets `manager_check` and auditor picks it up. Let me re-examine.

Actually, looking at the auditor's `resolveReviewableStatuses` and `resolvePendingStatuses`: the auditor accepts both `manager_check` (preceding stage) and `audit` as reviewable. So if manager sets status to `audit` instead of `manager_check`, the auditor would still see it. But this is a behavioral change for the 6-stage pipeline.

**Safer approach**: Only change behavior when manager is the terminal reviewer (i.e., `manager_check` is immediately followed by `approved`):

```
case 'manager': {
  const next = resolveNextStatus('manager_check', workflowStages);
  return next === 'approved' ? 'approved' : 'manager_check';
}
```

This preserves the existing convention for standard pipelines while fixing short ones.

### File: `src/lib/workflowEngine.test.ts`

Add test cases:
- Manager in short pipeline `['kra_set', 'self_review', 'manager_check', 'approved']` returns `'approved'`
- Manager in 6-stage and 8-stage pipelines still returns `'manager_check'`

## Files Changed

| File | Change |
|------|--------|
| `src/lib/workflowEngine.ts` | Fix `resolveForwardStatus('manager')` to return `'approved'` when manager is the terminal reviewer |
| `src/lib/workflowEngine.test.ts` | Add test for short pipeline manager approval |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data impact | None -- only affects future transitions | Existing stuck KPIs may need manual status update |
| Regression | Low -- 6/8-stage pipelines unchanged | Conditional logic only triggers when next stage is `approved` |
| Final score sync | Automatically handled | `UnifiedScorecard` already syncs `final_score` when `forwardStatus === 'approved'` |

## Note on Existing Stuck KPIs

The 11 KPIs currently at `manager_check` for this employee (and any similar cases) will need to be manually advanced or re-approved after this fix is deployed. The fix only affects future approvals.

