

## Fix: Add `audit` to Branch 2b Normal Resting State Exclusion

### Root Cause

The previous fix (Branch 2b) excluded `manager_check`, `skip_level_check`, and `hr_pms_review` from the "scored not forwarded" detection. But it missed `audit`.

**Evidence from `AuditScorecard.tsx` line 298:**
```tsx
const newStatus = approve ? resolveForwardStatus('auditor', effectiveStages) : 'audit';
```

When an auditor scores WITHOUT approving, status = `audit` and `auditor_score` is saved. This is the normal "auditor is reviewing" state. Only when the auditor clicks Approve does the status advance to `management_review`.

Branch 2b sees `audit` + `auditor_score` and incorrectly flags it as "scored not forwarded."

### Fix

**1 file: DB migration** — In the `reconcile_workflow_statuses` function, change line:
```sql
IF v_kpi.current_status IN ('manager_check', 'skip_level_check', 'hr_pms_review') THEN
```
to:
```sql
IF v_kpi.current_status IN ('manager_check', 'skip_level_check', 'hr_pms_review', 'audit') THEN
```

This adds `audit` to the normal resting state exclusion. `management_review` does NOT need exclusion because it's always the terminal non-approved stage (caught by Branch 2a instead).

### Why Only `audit` Is Missing

| Status | Approve action sets status to | Save-without-approve sets status to | Excluded? |
|--------|------------------------------|-------------------------------------|-----------|
| `manager_check` | `manager_check` (own stage) | N/A | ✅ Already |
| `skip_level_check` | next stage | `skip_level_check` | ✅ Already |
| `hr_pms_review` | next stage | `hr_pms_review` | ✅ Already |
| `audit` | `management_review` | `audit` | ❌ **Missing** |
| `management_review` | `approved` | `management_review` | N/A (handled by Branch 2a as terminal) |

### Files Changed
1. **DB migration** — Add `'audit'` to the IN clause in Branch 2b's normal resting state check

