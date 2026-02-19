
# Root Cause Analysis & CAPA Plan — Workflow Status Display Bug

## Confirmed Root Cause: `resolveForwardStatus('hr_pms')` Returns Wrong Status

### The Bug

In `src/lib/workflowEngine.ts`, the `resolveForwardStatus` function for `hr_pms` is **hardcoded to return `'hr_pms_review'`**:

```ts
// workflowEngine.ts — Lines 158-161
case 'hr_pms':
  return 'hr_pms_review';   // BUG: This is the CURRENT stage, not the NEXT one
```

This is **semantically wrong**. When HR PMS approves a KPI, the system sets the KPI's `status` to `'hr_pms_review'` — which is the stage HR PMS is currently acting on, not the stage the KPI should advance to. So after HR PMS approves, the KPI status reads `hr_pms_review` = "HR PMS" in the UI instead of advancing to the next stage (e.g., `audit` or `approved`).

**Compare this to the correctly implemented roles:**

| Role | `resolveForwardStatus` returns | Correct? |
|---|---|---|
| `manager` | `'manager_check'` | YES — manager's OWN completed stage |
| `skip_level` | `'skip_level_check'` | YES — skip-level's OWN completed stage |
| **`hr_pms`** | **`'hr_pms_review'`** | **NO — this is hr_pms's CURRENT stage, same logic as above but WRONG** |
| `auditor` | `resolveNextStatus('audit', stages)` | YES — uses `resolveNextStatus` to advance PAST audit |
| `management` | `'approved'` | YES — hardcoded terminal state |

### Why Manager Works But HR PMS Doesn't

Looking at the convention:
- `manager` completes at stage `manager_check` — so setting status to `'manager_check'` means "manager is done, KPI is now AT manager_check = waiting for the NEXT reviewer"
- **The convention is: set status to the stage name of the role that just acted**

So for HR PMS:
- HR PMS acts on KPIs at status `hr_pms_review - 1` (whatever precedes it in the workflow)
- When HR PMS approves, status should be set to `'hr_pms_review'` to indicate "HR PMS has reviewed it"
- **BUT the bug is that in some workflows, `hr_pms_review` is the LAST stage before `approved`**

### The Real Broken Workflows from the Database

The database has **11 real workflow templates**. For all templates ending in `...hr_pms_review → approved`, when HR PMS approves:

| Template | Pipeline | Expected after HR PMS approves | Actual (buggy) |
|---|---|---|---|
| `self_hr_pms` | `[...self_review, hr_pms_review, approved]` | `approved` | `hr_pms_review` |
| `self_l1_hr_pms` | `[...manager_check, hr_pms_review, approved]` | `approved` | `hr_pms_review` |
| `self_l1_l2_hr_pms` | `[...skip_level_check, hr_pms_review, approved]` | `approved` | `hr_pms_review` |

This is the **default workflow template** (`self_l1_l2_hr_pms`) — meaning **every employee using the default gets this bug**.

For workflows where `hr_pms_review` is followed by `audit`, the bug produces a different wrong result:

| Template | Pipeline | Expected after HR PMS approves | Actual |
|---|---|---|---|
| `self_l1_hr_pms_audit` | `[...hr_pms_review, audit, approved]` | `audit` | `hr_pms_review` (KPI stuck) |

### Same Bug Pattern — Other Stages

Cross-checking all `resolveForwardStatus` cases against the pattern reveals:

| Role | Function returns | What it SHOULD return |
|---|---|---|
| `manager` | `'manager_check'` | Correct — "manager done" = status is `manager_check`, next reviewer sees it |
| `skip_level` | `'skip_level_check'` | Correct — same convention |
| `hr_pms` | `'hr_pms_review'` | **WRONG** — this IS the hr_pms stage. Should use `resolveNextStatus('hr_pms_review', stages)` |
| `auditor` | `resolveNextStatus('audit', stages)` | Correct — explicitly advances past audit |
| `management` | `'approved'` | Correct — terminal |

**The fix for `auditor` (using `resolveNextStatus`) is exactly the pattern that `hr_pms` needs.** The auditor case was written correctly; the hr_pms case was not.

The same bug ALSO exists for `skip_level` in edge cases where `skip_level_check` is the last reviewable stage before `approved` — but looking at the 11 DB templates, no current template has `skip_level_check` directly before `approved`, so this is latent but not currently triggering.

---

## Full Gap Inventory

| # | Gap | Affected Templates | Affected Roles | Severity |
|---|---|---|---|---|
| 1 | `resolveForwardStatus('hr_pms')` returns `hr_pms_review` instead of the NEXT stage | `self_hr_pms`, `self_l1_hr_pms`, `self_l1_l2_hr_pms` (DEFAULT), `self_l1_hr_pms_audit`, `self_l1_l2_hr_pms_audit`, `self_l1_l2_hr_pms_audit_mgmt` | hr_pms users | CRITICAL |
| 2 | `resolveForwardStatus('skip_level')` hardcoded to `skip_level_check` — latent bug if `skip_level_check` ever precedes `approved` directly | No current template triggers this | skip_level users | Low (latent) |
| 3 | `UnifiedScorecard.tsx` line 509 has a **hardcoded** 8-stage `statusOrder` for send-back field clearing — does not use employee's actual `effectiveStages` | All custom templates shorter than 8 stages | All roles (send-back path) | Medium |
| 4 | `VIEW_LEVEL_STATIC` for `hr_pms` action label says "Forward to Audit" — but for templates where HR PMS is the last stage before `approved`, the label is wrong | `self_hr_pms`, `self_l1_hr_pms`, `self_l1_l2_hr_pms` | hr_pms users | Low (UX) |

---

## CAPA Fix Plan

### Fix 1 — Core Bug: `resolveForwardStatus` for `hr_pms`

**File:** `src/lib/workflowEngine.ts`

Change `hr_pms` to use `resolveNextStatus` — exactly like `auditor` does:

```ts
// BEFORE (broken):
case 'hr_pms':
  return 'hr_pms_review';

// AFTER (correct):
case 'hr_pms':
  return resolveNextStatus('hr_pms_review', workflowStages) || 'approved';
```

This means:
- For `[...hr_pms_review, approved]` → returns `'approved'` (KPI marked complete)
- For `[...hr_pms_review, audit, ...]` → returns `'audit'` (passed to auditor)
- For `[...hr_pms_review, management_review, ...]` → returns `'management_review'`

**Safety:** Purely a logic fix in one function. All callers (`UnifiedScorecard`, `resolveForwardStatus`) already pass `workflowStages` correctly. Zero schema changes.

### Fix 2 — Latent Bug: `resolveForwardStatus` for `skip_level`

**File:** `src/lib/workflowEngine.ts`

Apply the same pattern for consistency and future-proofing:

```ts
// BEFORE:
case 'skip_level':
  return 'skip_level_check';

// AFTER:
case 'skip_level':
  return resolveNextStatus('skip_level_check', workflowStages) || 'approved';
```

No current template triggers this bug but it's the correct pattern.

### Fix 3 — UX Label: `hr_pms` Action Label

**File:** `src/components/review/UnifiedScorecard.tsx`

The `VIEW_LEVEL_STATIC.hr_pms.actionLabel` says `"Forward to Audit"` — but for workflows where HR PMS is the last reviewer before `approved`, this is misleading. Replace with dynamic label:

```ts
// In the config useMemo (around line 171), compute dynamic action label:
const nextAfterHrPms = resolveNextStatus('hr_pms_review', effectiveStages);
const hrPmsActionLabel = nextAfterHrPms === 'approved' 
  ? 'Approve' 
  : nextAfterHrPms === 'audit' 
    ? 'Forward to Audit' 
    : 'Forward';
```

Then use `hrPmsActionLabel` as `actionLabel` in the config for `hr_pms` viewLevel.

### Fix 4 — Hardcoded Status Order in Send-Back Field Clearing

**File:** `src/components/review/UnifiedScorecard.tsx`, line 509

```ts
// BEFORE (hardcoded full 8-stage order):
const statusOrder = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

// AFTER (use the employee's effective stages):
const statusOrder = effectiveStages;
```

This ensures the send-back field-clearing logic correctly identifies which score fields to wipe based on the employee's actual pipeline, not a fixed 8-stage assumption.

### Fix 5 — Update Unit Tests

**File:** `src/lib/workflowEngine.test.ts`

The existing test at line 106-108 asserts the buggy behavior:

```ts
// CURRENT (asserts bug):
it('hr_pms forwards to hr_pms_review', () => {
  expect(resolveForwardStatus('hr_pms', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
});

// CORRECTED (asserts correct behavior):
it('hr_pms forwards to next stage after hr_pms_review', () => {
  // In 8-stage pipeline: next after hr_pms_review is 'audit'
  expect(resolveForwardStatus('hr_pms', EIGHT_STAGE_PIPELINE)).toBe('audit');
  // In terminal pipeline: next after hr_pms_review is 'approved'
  const terminalPipeline = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'approved'];
  expect(resolveForwardStatus('hr_pms', terminalPipeline)).toBe('approved');
});

// Add test for skip_level consistency:
it('skip_level forwards past skip_level_check', () => {
  expect(resolveForwardStatus('skip_level', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
});
```

### Fix 6 — DOCUMENTATION.md Update

Update to version 1.45.31 documenting the forward-status bug fix and the corrected behavior for all reviewer roles.

---

## Files to Modify

| File | Change | Risk |
|---|---|---|
| `src/lib/workflowEngine.ts` | Fix `resolveForwardStatus` for `hr_pms` and `skip_level` | Low — logic fix, no schema changes |
| `src/components/review/UnifiedScorecard.tsx` | Fix hardcoded statusOrder; add dynamic hr_pms action label | Low — purely UI/logic fix |
| `src/lib/workflowEngine.test.ts` | Update tests to assert correct (fixed) behavior | None — test-only |
| `DOCUMENTATION.md` | Version bump to 1.45.31 | None |

---

## Expected Outcome After Fix

| Template | HR PMS Approves → KPI Status Becomes |
|---|---|
| `self_hr_pms` | `approved` (was: stuck at `hr_pms_review`) |
| `self_l1_hr_pms` | `approved` (was: stuck at `hr_pms_review`) |
| `self_l1_l2_hr_pms` (DEFAULT) | `approved` (was: stuck at `hr_pms_review`) |
| `self_l1_hr_pms_audit` | `audit` (was: stuck at `hr_pms_review`) |
| `self_l1_l2_hr_pms_audit` | `audit` (was: stuck at `hr_pms_review`) |
| `self_l1_l2_hr_pms_audit_mgmt` | `audit` (was: stuck at `hr_pms_review`) |

No other role (manager, skip_level, auditor, management) is affected by these changes. The fix is scoped entirely to the `hr_pms` case in `resolveForwardStatus` and the two secondary improvements.

---

## CAPA — Preventing Future Recurrence

The pattern for `auditor` (`resolveNextStatus('audit', stages) || fallback`) is the correct one. Going forward:
1. All reviewer roles that are NOT the final stage should use `resolveNextStatus(ownStage, stages) || fallback` — never hardcode the next stage.
2. Only `management` can safely hardcode `'approved'` since it is always the terminal reviewer.
3. Add a comment block above `resolveForwardStatus` documenting this contract.
