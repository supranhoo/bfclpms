

## Fix: Missing Notification Coverage for skip_level_check → approved and hr_pms_review → approved

### Problem
The `notify_on_kpi_status_change` trigger's CASE 5 currently covers:
```sql
OLD.status IN ('kra_set', 'self_review', 'manager_check', 'audit', 'management_review')
```

Two valid preceding statuses are missing: **`skip_level_check`** and **`hr_pms_review`**.

These transitions are possible when:
- Skip-level is the terminal reviewer (workflow: `kra_set → self_review → skip_level_check → approved`)
- HR PMS is the terminal reviewer (workflow: `kra_set → self_review → hr_pms_review → approved`)
- Admin fast-tracks from either stage

In all these cases, the employee would **not** receive the "KPI Finalized" email.

### Fix

#### Migration: Update `notify_on_kpi_status_change` trigger

Expand CASE 5 condition to include all possible preceding statuses:

```sql
ELSIF NEW.status = 'approved' AND OLD.status IN (
  'kra_set', 'self_review', 'manager_check',
  'skip_level_check', 'hr_pms_review',
  'audit', 'management_review'
) THEN
```

This is a single-line change in the trigger function. No frontend changes needed.

### No other gaps
After this fix, every possible status that can precede `approved` in any workflow configuration will be covered. The full set of 7 statuses matches all possible workflow stages before `approved`.

