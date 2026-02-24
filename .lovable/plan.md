

# Fix: HR PMS Cannot See KPIs After Skip-Level Approval (v1.45.97)

## Problem

Vivek (HR PMS role) cannot see or act on Badal Kumar Ravi's KPIs for January 2026. Badal has 19 KPIs all at `hr_pms_review` status, but the HR PMS panel never shows them.

## Root Cause

A convention mismatch in the workflow engine between how skip-level sets the forward status and how HR PMS resolves its pending/reviewable statuses.

Badal's workflow: `kra_set -> self_review -> manager_check -> skip_level_check -> hr_pms_review -> approved`

**What happens:**
1. Skip-level approves Badal's KPIs
2. `resolveForwardStatus('skip_level')` calls `resolveNextStatus('skip_level_check')` which returns `hr_pms_review`
3. KPIs are now at status `hr_pms_review`
4. HR PMS panel calls `resolveReviewableStatuses('hr_pms')` which returns `[skip_level_check]` (the stage BEFORE `hr_pms_review`)
5. KPIs at `hr_pms_review` do not match `skip_level_check` -- Badal is invisible

The auditor role already handles this correctly by accepting BOTH the preceding stage AND its own stage: `return [preceding, 'audit']`. HR PMS does not have this dual-status handling.

## Solution

Update `resolvePendingStatuses`, `resolveReviewableStatuses`, and `canReviewKpi` for the `hr_pms` role to accept BOTH the preceding stage AND `hr_pms_review` -- matching the pattern already used by the auditor role.

## Technical Changes

### 1. `src/lib/workflowEngine.ts`

**`resolvePendingStatuses` (line 128-132)** -- change hr_pms case:

```typescript
// BEFORE:
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];
  return [workflowStages[idx - 1]];
}

// AFTER (mirrors auditor pattern):
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
  return [preceding, 'hr_pms_review'];
}
```

**`resolveReviewableStatuses` (line 205-209)** -- same fix:

```typescript
// BEFORE:
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];
  return [workflowStages[idx - 1]];
}

// AFTER:
case 'hr_pms': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return [];
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
  return [preceding, 'hr_pms_review'];
}
```

**`canReviewKpi` (line 289-293)** -- same fix:

```typescript
// BEFORE:
case 'hr-pms-review': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return false;
  return kpiStatus === workflowStages[idx - 1];
}

// AFTER:
case 'hr-pms-review': {
  const idx = workflowStages.indexOf('hr_pms_review');
  if (idx === -1) return false;
  const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
  return kpiStatus === preceding || kpiStatus === 'hr_pms_review';
}
```

### 2. `src/components/review/EmployeeSelectorGrid.tsx`

Update the HR PMS stats calculation (line ~395-401) to separate "pending" and "in review" counts, similar to how the auditor panel distinguishes pending vs in-audit:

```typescript
// HR PMS stats: pending = preceding stage, in-review = hr_pms_review
case 'hr_pms':
  relevantKpis.forEach(k => {
    const stages = getStages(k.employee_id);
    const reviewable = resolveReviewableStatuses('hr_pms', stages);
    if (reviewable.includes(k.status || '') && k.status !== 'hr_pms_review') pending++;
    else if (k.status === 'hr_pms_review') inReview++;
    // done logic remains unchanged
  });
```

Update the per-employee badge calculation (line ~452-461) to also differentiate:

```typescript
badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'hr_pms_review').length,
badge2: empKpis.filter(k => k.status === 'hr_pms_review').length,
```

### 3. `src/lib/workflowEngine.test.ts`

Update the HR PMS test (line 89-92) to expect the new dual-status behavior:

```typescript
it('hr_pms sees both skip_level_check and hr_pms_review in 8-stage', () => {
  const statuses = resolvePendingStatuses('hr_pms', EIGHT_STAGE_PIPELINE);
  expect(statuses).toContain('skip_level_check');
  expect(statuses).toContain('hr_pms_review');
});
```

### 4. `DOCUMENTATION.md`

Bump to v1.45.97. Document the HR PMS dual-status reviewable pattern and that it mirrors the auditor convention.

## Impact

- Badal Kumar Ravi (and any other employees whose KPIs are at `hr_pms_review`) will become visible to Vivek and all HR PMS users
- All 19 of Badal's January 2026 KPIs will appear as actionable in the HR PMS panel
- No data migration needed -- the fix is purely in the status-matching logic
- No change to `resolveForwardStatus` -- existing forward behavior is preserved

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data accuracy | None -- no data changes | Read-only logic fix |
| Regression | Low -- mirrors existing auditor pattern | Test coverage updated |
| Other roles | None -- only hr_pms logic changes | Manager, skip_level, auditor, management unchanged |
| Existing KPIs at skip_level_check | Still handled -- preceding status still included | Dual-status covers both cases |

