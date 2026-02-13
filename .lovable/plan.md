
# Fix: Sync `review_submissions.kpi_status` on Status Changes

## Root Cause

Two code paths update `kpis.status` without also updating `review_submissions.kpi_status`, causing a data mismatch:

1. **`useAdminStatusStepBack`** -- Steps back `kpis.status` but leaves `review_submissions.kpi_status` as `submitted`. When stepping back to `kra_set`, the submission should be reset to `open` so the employee can resubmit.

2. **No systemic guard** -- There's no database-level trigger ensuring `review_submissions.kpi_status` stays in sync with `kpis.status`. All synchronization relies on application code doing both updates.

## Fix Strategy

### 1. Fix `useAdminStatusStepBack` in `src/hooks/useAdminDataEntry.ts`

When the admin steps a KPI back to `kra_set`, also reset `review_submissions.kpi_status` to `open` (matching the behavior of `useSendBackKpi`). For step-backs to other stages (e.g., `self_review`, `manager_check`), keep `kpi_status` as `submitted` since the employee's submission data should remain intact.

### 2. Fix the 9 stuck KPIs via a one-time data patch

Run a SQL update to fix the 9 currently stuck KPIs by setting their `kpis.status` to `self_review` (since they have valid submissions with `kpi_status = submitted`). This is a data fix, not a schema change.

### 3. Add a database trigger as a safety net

Create a trigger `sync_kpi_status_on_step_back` on the `kpis` table that automatically resets `review_submissions.kpi_status` to `open` whenever `kpis.status` transitions **back** to `kra_set`. This prevents any future code path from causing the same desync.

## Files to Modify

| Action | File |
|--------|------|
| Edit | `src/hooks/useAdminDataEntry.ts` -- reset `review_submissions.kpi_status` to `open` when stepping back to `kra_set` |
| Migration | Add trigger to sync `review_submissions.kpi_status` when `kpis.status` goes to `kra_set` |
| Migration | One-time fix for the 9 stuck KPIs |
| Edit | `DOCUMENTATION.md` -- document the sync behavior |

## Technical Details

### `useAdminStatusStepBack` change (in `src/hooks/useAdminDataEntry.ts`)

After updating `kpis.status` (existing line 380-387), add a conditional block:

```text
if target_status === 'kra_set':
  update review_submissions
    set kpi_status = 'open'
    where kpi_id = kpi_id
```

### Database trigger (new migration)

```sql
CREATE OR REPLACE FUNCTION sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status != 'kra_set' THEN
    UPDATE review_submissions
    SET kpi_status = 'open'
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_submission_on_kra_set
AFTER UPDATE OF status ON kpis
FOR EACH ROW
EXECUTE FUNCTION sync_submission_on_kra_set();
```

### One-time data fix (migration)

```sql
UPDATE kpis
SET status = 'self_review'
WHERE id IN (
  SELECT k.id FROM kpis k
  JOIN review_submissions rs ON rs.kpi_id = k.id
  WHERE k.status = 'kra_set' AND rs.kpi_status = 'submitted'
);
```
