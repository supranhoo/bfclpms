

# Fix: Variance Acknowledgment Blocked by Governance Trigger

## Root Cause

The database trigger `prevent_locked_period_updates` runs on every UPDATE to the `kpis` table. It checks `edit_kpi` governance permission and raises an exception if the user lacks it. When an admin tries to acknowledge a variance, the trigger blocks it because the review period has `edit_kpi` disabled — even though acknowledging a variance doesn't modify any KPI content.

## Fix

**Database migration** — Add a bypass in `prevent_locked_period_updates` for updates that only change `weightage_variance_acknowledged` (and `updated_at`). If those are the only columns changing, skip the governance check entirely (admins-only safety check still applies).

The bypass logic:
```sql
-- BYPASS: Variance acknowledgment is admin metadata, not a KPI edit
IF OLD.weightage_variance_acknowledged IS DISTINCT FROM NEW.weightage_variance_acknowledged
   AND OLD.weightage = NEW.weightage
   AND OLD.status = NEW.status
   AND OLD.kpi_name = NEW.kpi_name
   AND OLD.target = NEW.target
THEN
  RETURN NEW;
END IF;
```

This is placed **before** the governance check so it short-circuits for acknowledge-only updates while still enforcing governance for real KPI edits.

**One file changed**: A single SQL migration to update the trigger function.

