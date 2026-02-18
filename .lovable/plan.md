
# Fix: Workflow Engine — All Levels, All Pipeline Variants

## What Is Broken

The workflow engine has **systematic fallback bugs** across 3 functions: `resolvePendingStatuses`, `resolveReviewableStatuses`, and `canReviewKpi`. When a stage does NOT exist in an employee's pipeline, each function falls back to a hardcoded status instead of returning empty (meaning: "this reviewer has no jurisdiction over this employee"). This causes employees to incorrectly appear in review panels that should not apply to them.

The database shows **11 distinct real pipeline variants** in active use. The bugs affect employees on these non-standard pipelines.

---

## Complete Bug Map

### Function 1: `resolvePendingStatuses`

| Case | Current Fallback | Bug |
|---|---|---|
| `skip_level` — no `skip_level_check` in stages | Returns `['manager_check']` | Employees at `manager_check` appear in Skip-Level panel even when they have no skip-level stage (e.g. pipeline #4, #7, #9) |
| `hr_pms` — no `hr_pms_review` in stages | Returns `['skip_level_check']` | Employees appear in HR PMS panel even without that stage (e.g. pipeline #4, #6, #7) |
| `auditor` — no `audit` in stages | Returns `['<preceding>', 'audit']` | Employees appear in Audit panel without an audit stage (Avinash's bug — pipelines #1, #3, #5, #7, #11) |
| `management` — no `management_review` in stages | Returns `['management_review']` always | Employees appear in Management panel when pipeline ends at `approved` directly (pipelines #1, #8, #9) |

### Function 2: `resolveReviewableStatuses`

Exact same four cases — same fallback bugs. This drives what KPIs an auditor/skip-level/etc. can act on (approve/reject).

### Function 3: `canReviewKpi`

| Case | Current Fallback | Bug |
|---|---|---|
| `skip-level-review` — no `skip_level_check` | Falls back to `manager_check` | Skip-level reviewer can act on `manager_check` KPIs for employees with no skip-level stage |
| `hr-pms-review` — no `hr_pms_review` | Falls back to `skip_level_check` | HR PMS reviewer can act on KPIs for wrong employees |
| `audit` — no `audit` | Falls back to `manager_check` | Auditor can act on KPIs for employees with no audit stage |

---

## The Fix: Guard Every Case with Stage Existence Check

The fix for every single case follows the same pattern: **if the stage doesn't exist in the workflow, return empty/false — never fall back to a hardcoded status.**

```
BEFORE (broken):
  case 'skip_level': {
    const idx = workflowStages.indexOf('skip_level_check');
    return idx > 0 ? [workflowStages[idx - 1]] : ['manager_check']; // fallback bug
  }

AFTER (fixed):
  case 'skip_level': {
    const idx = workflowStages.indexOf('skip_level_check');
    if (idx === -1) return []; // stage absent — this reviewer has no employees here
    return [workflowStages[idx - 1]];
  }
```

### `management` case fix

`management` currently always returns `['management_review']` with no guard. Pipelines #1, #8, #9 end at `approved` without a `management_review` stage — those employees must not appear in the Management panel.

```
BEFORE:
  case 'management':
    return ['management_review']; // always — no guard

AFTER:
  case 'management': {
    if (!workflowStages.includes('management_review')) return [];
    return ['management_review'];
  }
```

### `manager` case

`manager` always returns `['self_review']` — this is correct because every pipeline goes through `self_review` before any reviewer stage. No change needed here.

---

## All Changes — `src/lib/workflowEngine.ts`

### 1. `resolvePendingStatuses` — fix all 4 cases

```typescript
case 'skip_level': {
  const idx = workflowStages.indexOf('skip_level_check');
  if (idx === -1) return [];                          // no skip-level stage
  return [workflowStages[idx - 1]];
}
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];                          // no hr_pms stage
  return [workflowStages[idx - 1]];
}
case 'auditor': {
  const idx = workflowStages.indexOf('audit');
  if (idx === -1) return [];                          // no audit stage
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
  return [preceding, 'audit'];
}
case 'management': {
  if (!workflowStages.includes('management_review')) return [];  // no management stage
  return ['management_review'];
}
```

### 2. `resolveReviewableStatuses` — same fixes

```typescript
case 'skip_level': {
  const idx = workflowStages.indexOf('skip_level_check');
  if (idx === -1) return [];
  return [workflowStages[idx - 1]];
}
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];
  return [workflowStages[idx - 1]];
}
case 'auditor': {
  const idx = workflowStages.indexOf('audit');
  if (idx === -1) return [];
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
  return [preceding, 'audit'];
}
case 'management': {
  if (!workflowStages.includes('management_review')) return [];
  return ['management_review'];
}
```

### 3. `canReviewKpi` — fix all 3 affected cases

```typescript
case 'skip-level-review': {
  const idx = workflowStages.indexOf('skip_level_check');
  if (idx === -1) return false;
  return kpiStatus === workflowStages[idx - 1];
}
case 'hr-pms-review': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return false;
  return kpiStatus === workflowStages[idx - 1];
}
case 'audit': {
  const idx = workflowStages.indexOf('audit');
  if (idx === -1) return false;
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
  return kpiStatus === preceding || kpiStatus === 'audit';
}
case 'management':
  return workflowStages.includes('management_review') && kpiStatus === 'management_review';
```

---

## Test Updates — `src/lib/workflowEngine.test.ts`

New test cases to be added covering all 11 pipeline variants:

- `resolvePendingStatuses('skip_level', stages-without-skip-level)` → `[]`
- `resolvePendingStatuses('hr_pms', stages-without-hr-pms)` → `[]`
- `resolvePendingStatuses('auditor', stages-without-audit)` → `[]`
- `resolvePendingStatuses('management', stages-without-management)` → `[]`
- Same pattern for `resolveReviewableStatuses`
- `canReviewKpi` returning `false` for absent stages

Existing tests that relied on the fallback behavior (e.g. `auditor` returning `['self_review', 'audit']` in skip-manager pipeline) are still valid — those pipelines DO include `audit`, so the guard doesn't fire.

---

## Files to Modify

| File | Change |
|---|---|
| `src/lib/workflowEngine.ts` | Fix `resolvePendingStatuses`, `resolveReviewableStatuses`, and `canReviewKpi` — add `if (idx === -1) return []` / `return false` guards for all 4 cases in first two functions and 3 cases in the third |
| `src/lib/workflowEngine.test.ts` | Add test cases for all 11 pipeline variants across all three fixed functions |
| `DOCUMENTATION.md` | Version bump to 1.45.15 + note about comprehensive workflow engine guard fix |

---

## Technical Notes

- No database changes needed — this is a pure frontend logic fix
- No component changes needed — every component already passes `workflowStages` from the employee's assigned template; the engine functions just need to respect absence of stages
- The `manager` case needs no guard — `self_review` exists in every pipeline (it's always stage 2)
- `resolveSendBackTargets` is already correctly guarded — it uses `requiredStage` filtering with `workflowStages.includes()`, so no change needed there
- `resolveForwardStatus` does not need guards — it's only called after the reviewer has confirmed they CAN act on the KPI, so by that point the stage is guaranteed to exist
- After this fix, every reviewer panel will only show employees whose assigned pipeline includes that reviewer's stage — eliminating all phantom appearances across all 11 pipeline variants
