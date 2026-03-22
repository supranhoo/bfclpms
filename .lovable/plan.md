

## RCA: KPI Finalized Email Not Sent (kra_set → approved)

### Root Cause

The KPI transitioned from `kra_set → approved` (admin fast-tracked it). The trigger `notify_on_kpi_status_change` has an early return at line 12:

```sql
IF OLD.status = 'kra_set' AND NEW.status = 'approved' THEN
  RETURN NEW;  -- skips ALL notifications
END IF;
```

This was originally added to avoid duplicate notifications when "system auto-score" transitions `kra_set → approved` (it sends its own notification). But admin data entry fast-track also uses this same path and does NOT send its own notification — so the email is silently lost.

### Fix

#### Migration: Update `notify_on_kpi_status_change` trigger

1. **Remove the blanket early return** for `kra_set → approved`.
2. **Add `kra_set` to the CASE 5 condition** (line 128) so it becomes:
   ```sql
   ELSIF NEW.status = 'approved' AND OLD.status IN ('kra_set', 'self_review', 'manager_check', 'audit', 'management_review') THEN
   ```
3. To avoid duplicate notifications when system auto-score fires, the auto-score code path should be checked. However, looking at the data, system auto-score sets `auto_advance_reason` on the submission. We can safely include `kra_set` here — even if a duplicate notification occurs in rare auto-score cases, it's better than missing emails entirely. The system auto-score notification (if any) uses a different type (`system_auto_scored`), so there's no true duplicate.

### No frontend changes needed

