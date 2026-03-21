

## Fix: "Rated by System" Badge Missing for Auto-Scored KPIs from Pending Reviews

### Root Cause

There are **three** code paths that admin/system can use to score KPIs:

1. `useAdminSubmitReviewData` — Admin Data Entry dialog (already fixed)
2. `useAdminFastTrackApprove` — Fast Track Approve (already fixed)
3. **`useBulkAutoScoreKpis`** in `src/hooks/usePendingSelfReviews.ts` — Pending Self Reviews bulk auto-score (NOT fixed)

The dummy(001) KPI was scored via path #3 (audit log shows `action: 'SYSTEM_AUTO_SCORED'`, `source: 'pending_reviews_admin'`). This path:
- Does NOT set `auto_advance_reason` → no orange badge
- Only fills `self_score`, `final_score`, `achieved_value` → manager, skip, HR, auditor columns remain null → show as N/A instead of a zero score
- Sets `self_remarks` but the table view doesn't show remarks inline (remarks are only in the review panel — this is by design)

### Database State Confirms
```
self_score: 0.00, final_score: 0.00, achieved_value: 0.00
manager_score: NULL, skip_level_score: NULL, hr_pms_score: NULL, auditor_score: NULL
auto_advance_reason: NULL
self_remarks: "Self reviewed not done by due date, score given by system."
```

### Fix — File: `src/hooks/usePendingSelfReviews.ts`

**In `useBulkAutoScoreKpis` (lines 275-300)** — Add `auto_advance_reason` to both the update and insert paths:

```typescript
auto_advance_reason: 'Auto-scored with zero by System (overdue self-review)',
```

This ensures the orange "Rated by System" badge appears for KPIs scored through the pending reviews feature.

### About N/A Columns
The N/A display for manager, skip, HR, auditor is **correct behavior** — those stages genuinely have no score because the KPI was jumped from `kra_set` directly to `approved`. Showing zero would be misleading (no reviewer actually scored zero). The self column shows 0 and final shows 0, which accurately reflects what happened.

### About Remarks
The `self_remarks` ("Self reviewed not done by due date, score given by system.") is stored correctly and visible when opening the KPI review panel. The table view intentionally doesn't show remarks inline to save space. No change needed here.

### Backfill Existing Data
A one-time database migration to set `auto_advance_reason` on submissions that were already auto-scored (before this code fix):

```sql
UPDATE review_submissions rs
SET auto_advance_reason = 'Auto-scored with zero by System (overdue self-review)'
FROM kpi_audit_logs al
WHERE al.kpi_id = rs.kpi_id
  AND al.action = 'SYSTEM_AUTO_SCORED'
  AND rs.auto_advance_reason IS NULL;
```

### Summary
- **1 code file changed**: `src/hooks/usePendingSelfReviews.ts`
- **1 database migration**: backfill existing auto-scored submissions
- N/A columns and remarks display are working as designed

