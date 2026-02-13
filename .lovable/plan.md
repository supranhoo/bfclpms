

# RCA and CAPA: Skip-Level "Review" Button Not Visible

## Root Cause Analysis (RCA)

The bug is in `src/lib/workflowEngine.ts`. The workflow engine uses **wrong status values** for the `skip_level` and `hr_pms` view levels, creating a gap where KPIs can never reach the expected status.

### How the Status Convention Works

Each status name means "this stage is complete, KPI is waiting for the next reviewer":

```text
self_review    = employee submitted, WAITING FOR manager
manager_check  = manager checked, WAITING FOR next reviewer
skip_level_check = skip-level checked, WAITING FOR next reviewer
hr_pms_review  = HR PMS reviewed, WAITING FOR next reviewer
```

### The Pattern (Manager works correctly)

- Manager sees KPIs at: `self_review` (the stage BEFORE their own)
- Manager forwards to: `manager_check` (their OWN stage)

### The Bug (Skip-Level and HR PMS are broken)

| Function | skip_level (Current - WRONG) | skip_level (Correct) |
|---|---|---|
| resolvePendingStatuses | `['skip_level_check']` | `['manager_check']` |
| resolveReviewableStatuses | `['skip_level_check']` | `['manager_check']` |
| resolveForwardStatus | next after skip_level_check (= hr_pms_review) | `'skip_level_check'` |

| Function | hr_pms (Current - WRONG) | hr_pms (Correct) |
|---|---|---|
| resolvePendingStatuses | `['hr_pms_review']` | `['skip_level_check']` |
| resolveReviewableStatuses | `['hr_pms_review']` | `['skip_level_check']` |
| resolveForwardStatus | next after hr_pms_review (= audit) | `'hr_pms_review'` |

### What Happens Today

1. Manager approves Purnima's KPI -> status becomes `manager_check`
2. Jaspal (skip-level) looks for KPIs at `skip_level_check` -> finds nothing
3. "Review" button never appears because no KPIs match the expected status
4. KPIs are stuck at `manager_check` forever -- nobody can pick them up

### Additional Issue: Auditor in 8-Stage Workflow

The auditor's pending statuses are hardcoded to `['manager_check', 'audit']`. In the 8-stage workflow, the stage before `audit` is `hr_pms_review`, not `manager_check`. This needs to be made dynamic too.

## Corrective Action Plan (CAPA)

### File: `src/lib/workflowEngine.ts`

Fix three functions to use **dynamic stage resolution** instead of hardcoded values:

**1. `resolvePendingStatuses`** -- Fix skip_level, hr_pms, and auditor cases:

```typescript
case 'skip_level': {
  // Skip-level sees KPIs at the stage BEFORE skip_level_check
  const idx = workflowStages.indexOf('skip_level_check');
  return idx > 0 ? [workflowStages[idx - 1]] : ['manager_check'];
}
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  return idx > 0 ? [workflowStages[idx - 1]] : ['skip_level_check'];
}
case 'auditor': {
  const idx = workflowStages.indexOf('audit');
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
  return [preceding, 'audit'];
}
```

**2. `resolveReviewableStatuses`** -- Same fix, same logic as pending statuses.

**3. `resolveForwardStatus`** -- Fix skip_level and hr_pms to set their OWN stage:

```typescript
case 'skip_level':
  return 'skip_level_check';   // was: resolveNextStatus('skip_level_check', ...)
case 'hr_pms':
  return 'hr_pms_review';      // was: resolveNextStatus('hr_pms_review', ...)
```

**4. Update existing tests** in `src/lib/workflowEngine.test.ts` and add new test cases for 8-stage workflows.

### File: `src/components/review/EmployeeSelectorGrid.tsx`

The `EmployeeSelectorGrid` stat calculation and filtering for `skip_level` and `hr_pms` also use hardcoded statuses. These need to match the corrected workflow engine:

- For `skip_level`: filter pending by `manager_check` (not `skip_level_check`)
- For `hr_pms`: filter pending by `skip_level_check` (not `hr_pms_review`)

### File: `DOCUMENTATION.md`

Update to document the status convention and the corrected workflow engine behavior.

## Files to Modify

| File | Change |
|---|---|
| `src/lib/workflowEngine.ts` | Fix `resolvePendingStatuses`, `resolveReviewableStatuses`, `resolveForwardStatus` for skip_level, hr_pms, and auditor |
| `src/lib/workflowEngine.test.ts` | Update/add tests for 8-stage workflow |
| `src/components/review/EmployeeSelectorGrid.tsx` | Fix hardcoded status filters for skip_level and hr_pms in stats, displayMembers, and badge calculations |
| `DOCUMENTATION.md` | Document status convention and fixes |

