

## RCA: Wrong Email Sent on System Auto-Score

### Root Cause

When `useBulkAutoScore` updates a KPI's status from `kra_set` → `approved`, the **database trigger** `notify_on_kpi_status_change()` fires automatically. This trigger doesn't distinguish between a normal workflow transition and a system auto-score. It sees `kra_set → self_review/manager_check` (CASE 1) or the status jump and creates a `kpi_submitted` notification with incomplete data (no `related_user_id`, no actor context).

That notification then triggers `send_email_on_notification()`, which maps `kpi_submitted` → the "New KPI Submitted for Review" template — producing the email you see with all N/A values.

**Result**: Two emails are sent — the wrong one from the trigger chain, and the correct `system_auto_scored` one from the hook's `sendConsolidatedAutoScoreEmails`.

### Fix

Update the `notify_on_kpi_status_change()` database trigger to **skip notification** when the status jumps directly from `kra_set` to `approved` (which only happens during system auto-scoring). This is a single-line guard at the top of the function.

**Database migration** — Add guard to the trigger:

```sql
-- At the very top of the function body, after variable declarations:
-- Skip notification when jumping directly to approved from kra_set 
-- (system auto-score handles its own notification)
IF OLD.status = 'kra_set' AND NEW.status = 'approved' THEN
  RETURN NEW;
END IF;
```

This prevents the spurious `kpi_submitted` notification+email while preserving all normal workflow notifications. The correct `system_auto_scored` email continues to be sent by the hook.

### Files Changed
- **1 database migration**: Update `notify_on_kpi_status_change()` trigger function
- No code file changes needed

