

# RCA: Send Back KPI Still Failing for Tanaaz's KPI

## Root Cause: Code Not Published to Live Site

The fix to `resolveSendBackStatus` is **correctly implemented in source code** but has **not been published** to the live site (`bfclpms.lovable.app`). Jaspal is using the published URL, which still runs the old (buggy) code.

### Evidence from Database

| Field | Current Value | Expected Value |
|-------|--------------|----------------|
| `kpis.status` | `manager_check` | `self_review` |
| `review_submissions.manager_score` | `5.00` | `null` (cleared) |
| `review_submissions.manager_rating` | `blue` | `null` (cleared) |
| `review_submissions.skip_level_*` | `null` | `null` (correct) |
| Audit logs | 2 entries: `SKIP_LEVEL_SENT_BACK_TO_MANAGER` | Written correctly |
| `submission.updated_at` | `14:25:47` (updated!) | -- |

### What the Old Code Did

Both attempts at 14:10 and 14:25 ran the old `resolveSendBackStatus('manager', ...)` which returned `manager_check` instead of `self_review`. This caused:

1. **KPI status**: Set to `manager_check` (same as current -- effectively a no-op)
2. **Cascading clear**: `targetIdx = 2` (manager_check), condition `2 <= 1` (self_review index) = false, so manager fields were **NOT cleared**
3. **Audit log**: Written successfully (giving the false impression of success)
4. **Toast**: Shown to user (success notification), because no error was thrown

## CAPA Plan

### Action 1: Publish the Code to Live

The source code fix is correct. It needs to be published to the live site so Jaspal's browser loads the updated logic.

### Action 2: Fix Corrupted Data via SQL

Run a one-time data correction to reset the KPI to the correct state (what the send-back should have done):

- Set `kpis.status` to `self_review` (so the manager sees it as pending)
- Clear `manager_score`, `manager_rating`, `manager_remarks`, `manager_evidence_url`, `manager_achieved_value` in `review_submissions`
- Clear `skip_level_*` fields (already null, but for safety)

### Action 3: Add Audit Trail Protection

The current code writes the audit log AFTER the KPI update but BEFORE the submission update. If the submission update fails, the audit log is already written, creating a misleading success record. Move the audit log insert to AFTER both updates succeed, so the trail is only written when the full operation completes.

## Files to Modify

| File | Change |
|---|---|
| SQL (manual correction) | Fix corrupted data for KPI `9f08d421` |
| `src/components/review/UnifiedScorecard.tsx` | Move audit log insert after submission update (minor reorder, lines 543-550 move after line 540) |
| `DOCUMENTATION.md` | Document the data correction |

## Technical Details

### Data Correction SQL

```text
-- Fix KPI status
UPDATE kpis SET status = 'self_review'
WHERE id = '9f08d421-a688-44da-acb2-2087f88ce740';

-- Clear manager fields on submission
UPDATE review_submissions SET
  manager_score = null, manager_rating = null,
  manager_remarks = null, manager_evidence_url = null,
  manager_achieved_value = null,
  skip_level_score = null, skip_level_rating = null,
  skip_level_remarks = null, skip_level_evidence_url = null,
  skip_level_achieved_value = null
WHERE kpi_id = '9f08d421-a688-44da-acb2-2087f88ce740';
```

### Audit Log Reorder (UnifiedScorecard.tsx)

Move the `kpi_audit_logs.insert(...)` call (currently at line 543) to after the submission update success check (after line 540). This ensures the audit trail is only created when the entire operation (KPI status + submission clear) succeeds.

### Risk Assessment
- **Data fix**: Targeted to one KPI only, reversible
- **Code change**: Minor line reorder, no logic change
- **Publish**: Required for all recent fixes to reach users
