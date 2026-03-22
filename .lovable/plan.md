

## RCA: KPI Finalized Email Not Sent for Dummy (001)

### Root Cause

The KPI (id: `20afd55d`) transitioned from **`self_review` → `approved`** (admin data entry auto-advanced it). However, the `notify_on_kpi_status_change` trigger only creates a `kpi_finalized` notification for:
- `audit → approved`
- `management_review → approved`

The `self_review → approved` transition is **not covered** by any CASE in the trigger. No notification was inserted, so no email was triggered.

There's also a deliberate skip for `kra_set → approved` (system auto-score handles its own notification). But `self_review → approved` falls through silently.

### Fix

#### Migration SQL — Update `notify_on_kpi_status_change` trigger function

Expand CASE 5 condition from:
```sql
ELSIF NEW.status = 'approved' AND (OLD.status = 'audit' OR OLD.status = 'management_review') THEN
```
To:
```sql
ELSIF NEW.status = 'approved' AND OLD.status IN ('self_review', 'manager_check', 'audit', 'management_review') THEN
```

This covers all possible paths to `approved` status (except `kra_set → approved` which is intentionally skipped at line 14 for system auto-score).

### No frontend changes needed

