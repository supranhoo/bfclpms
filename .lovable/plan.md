

# Fix: Clear Stale Submission Data on Send-Back to kra_set

## Problem

6 KPIs are at `kra_set` with stale `self_rating`/`self_score` data left over from a previous self-review cycle. The database trigger `trg_sync_submission_on_kra_set` resets `kpi_status` to `open` but does not clear the actual review data fields.

This means when employees re-open these KPIs, they see old ratings pre-filled, which is confusing and can lead to incorrect submissions.

## Solution

Two changes:

### 1. Enhance the `sync_submission_on_kra_set` trigger to clear ALL review data

When a KPI is moved back to `kra_set`, all submission fields should be reset to null -- self, manager, skip-level, HR PMS, auditor, management, final rating/score.

This is the safety-net that ensures no stale data remains regardless of which code path triggered the send-back.

**Database migration:**

```sql
CREATE OR REPLACE FUNCTION public.sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.review_submissions
    SET kpi_status = 'open',
        self_rating = NULL, self_score = NULL, self_remarks = NULL,
        self_evidence_url = NULL, self_evidence_urls = NULL,
        achieved_value = NULL,
        manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
        manager_evidence_url = NULL, manager_evidence_urls = NULL,
        manager_achieved_value = NULL,
        skip_level_rating = NULL, skip_level_score = NULL, skip_level_remarks = NULL,
        skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL,
        skip_level_achieved_value = NULL,
        hr_pms_rating = NULL, hr_pms_score = NULL, hr_pms_remarks = NULL,
        hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL,
        hr_pms_achieved_value = NULL,
        auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
        auditor_evidence_url = NULL, auditor_evidence_urls = NULL,
        auditor_achieved_value = NULL,
        management_rating = NULL, management_score = NULL, management_remarks = NULL,
        management_evidence_url = NULL, management_evidence_urls = NULL,
        management_achieved_value = NULL,
        final_rating = NULL, final_score = NULL,
        is_na = false, na_marked_by_role = NULL,
        updated_at = now()
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$
LANGUAGE plpgsql;
```

### 2. Fix the 6 existing stuck KPIs (one-time data cleanup)

Clear stale self-review data from the 6 KPIs currently at `kra_set`:

```sql
UPDATE review_submissions
SET self_rating = NULL, self_score = NULL, self_remarks = NULL,
    self_evidence_url = NULL, self_evidence_urls = NULL,
    achieved_value = NULL, kpi_status = 'open',
    updated_at = now()
WHERE kpi_id IN (
  'af798f44-fa07-4fd4-9be2-53ee04d6da1e',
  '93467bf5-9a8a-48a3-a2ab-436bde8cfe76',
  'f3cccf75-fc75-4266-9197-06482db41e7e',
  '9b5c8fbd-6ced-42b8-979d-21b3f3594002',
  'a794f31e-a103-4443-af0f-87165228defa',
  'eccf68b5-1af5-4850-bc7b-e073823f46a2'
);
```

### 3. Update DOCUMENTATION.md

Document the enhanced trigger behavior.

## Files to Change

| File | Change |
|---|---|
| Database migration | Enhanced `sync_submission_on_kra_set` trigger + one-time data fix |
| `DOCUMENTATION.md` | Document the trigger enhancement |

## Impact

- **6 existing KPIs**: Stale data cleared, employees see clean forms when they re-open
- **Future send-backs**: Any KPI sent back to `kra_set` will have all review data automatically cleared by the trigger
- **No code changes needed**: The trigger is the safety net; the application code already handles cascade-clearing in most paths (UnifiedScorecard, ManagementScorecard), but this trigger catches any edge cases

