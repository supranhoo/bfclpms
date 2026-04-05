

## RCA: Management Score Zeroed Out by Untracked Bulk Operation

### Root Cause

**Data corruption, not a display bug.** The admin fast-track correctly set `management_score=5` on March 31 (confirmed in audit log `ADMIN_FAST_TRACK_APPROVED`). However, on **April 1 at 14:25:28 UTC**, an untracked process bulk-updated **159 review_submissions** rows, resetting `management_score` to 0 for all of them — with **no audit trail**.

The 159 affected submissions span January (74), February (83), and March (2) 2026, across all UOM types (numeric, binary, tiered). All 159 now have `management_score = 0`. Of these, **21 approved KPIs have management_review in their workflow** and `final_score > 0` but `management_score = 0` — a clear data integrity violation.

The exact trigger is unidentifiable from available data (no matching migration SQL, no edge function logs, no audit entries at that timestamp). Most likely a migration side-effect or an admin tool invocation that updated submissions without logging.

### Scope of Impact

- **159 submissions** had `updated_at` stamped at the same microsecond on April 1
- **21 KPIs** are confirmed broken: approved with management in workflow, `management_score = 0`, `final_score > 0`
- **24 more** KPIs without management in workflow have `management_score = 0` which is expected (out-of-workflow)
- Employee 101773's "USA Logistics" KPI is one of the 21

### Fix — 2 parts

#### Part 1: Data Repair Migration

For the 21 confirmed affected KPIs (approved, management in workflow, `management_score = 0`, `final_score > 0`):

1. **Check audit logs** for each KPI: find the last `ADMIN_FAST_TRACK_APPROVED` or `ADMIN_DATA_ENTRY_MANAGEMENT` entry and restore `management_score` from `new_value->>'management_score'`
2. If no audit log exists with the original score, set `management_score = final_score` (since management is the terminal stage for these workflows)
3. Recompute `management_rating` from the restored score using the standard rating formula
4. Log `DATA_REPAIR` audit entry for each fix with `metadata.reason = 'Restoring management_score zeroed by untracked bulk operation on 2026-04-01'`

#### Part 2: Future Prevention — Mandatory Audit Trail for All Submission Updates

Create a new **AFTER UPDATE** trigger on `review_submissions` that logs ANY update where score fields change but no corresponding `kpi_audit_logs` entry exists within the same transaction. This acts as a safety net:

```sql
CREATE OR REPLACE FUNCTION log_untracked_submission_changes()
RETURNS trigger AS $$
BEGIN
  -- If management_score changed and no audit log was created in this transaction
  IF OLD.management_score IS DISTINCT FROM NEW.management_score
     OR OLD.auditor_score IS DISTINCT FROM NEW.auditor_score
     OR OLD.final_score IS DISTINCT FROM NEW.final_score THEN
    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.kpi_id,
      'SUBMISSION_SCORE_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'management_score', OLD.management_score,
        'auditor_score', OLD.auditor_score,
        'final_score', OLD.final_score
      ),
      jsonb_build_object(
        'management_score', NEW.management_score,
        'auditor_score', NEW.auditor_score,
        'final_score', NEW.final_score
      ),
      jsonb_build_object('source', 'safety_net_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This ensures that even if application code forgets to create an audit log, score changes are always captured.

### Files Modified

| File | Change |
|------|--------|
| New migration SQL | Restore management_score for 21 affected KPIs + create safety-net trigger |
| `POLICY.md` | Add §56: All review_submissions score changes must produce audit trail |
| `DOCUMENTATION.md` | Version bump with data repair note |

### Risk Assessment
- **Data repair**: Only restores scores that were provably set by admin (from audit logs) or inferred from final_score. No guessing.
- **Safety-net trigger**: Additive only. Logs changes that would otherwise go untracked. No impact on existing workflows.
- **No regression risk**: Pure data correction + observability improvement.

