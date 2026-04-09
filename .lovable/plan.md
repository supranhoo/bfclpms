

## RCA: Unintended Bi-Monthly January Reset by April 5 Migration

### What Happened

The migration `20260405...` was intended to revert **premature reviews** for:
- Quarterly Jan/Feb (Q1 siblings — cycle ends March 31)
- Quarterly March in `self_review` (premature self-review before cycle end)
- Bi-Monthly January (Feb-Mar cycle siblings)

However, the migration filter `frequency = 'Bi-Monthly' AND review_period = 'January'` caught the **Dec-Jan cycle** KPIs. In the Bi-Monthly scheme, January is the **sibling** of the Dec-Jan cycle (December is terminal). The Dec-Jan cycle was **already complete** by April 5 — December 2025 ended on Dec 31, 2025. These 28 KPIs were legitimately approved and should NOT have been reset.

### Impact Summary

| Category | Count | Details |
|----------|-------|---------|
| Bi-Monthly Jan KPIs reset | 28 | Across 12 employees |
| Still stuck at `kra_set` | 24 | Submissions deleted, no scores |
| Re-progressed (partially recovered) | 4 | 3 re-approved (100750), 1 at self_review (100633) |
| December 2025 terminal data | Intact | Scores preserved in `review_submissions` |

### Why Submissions Are Gone

The migration ran `DELETE FROM review_submissions WHERE kpi_id IN (...)` — this destroyed all score data for those 28 KPIs. The `trg_sync_submission_on_kra_set` trigger then fired on the status reset, but by that point submissions were already deleted.

### Recovery Plan

Since December 2025 (terminal month) data is fully intact, we can **re-percolate** scores from December to January siblings. This is exactly what the `percolate_multimonth_score` trigger does when the terminal month is approved.

**Migration will:**

1. For each affected Bi-Monthly January 2026 KPI still at `kra_set`:
   - Find the matching December 2025 terminal KPI (same employee, kra_name, kpi_name)
   - Copy all submission data from December's `review_submissions`
   - Set status to `approved` (matching December)
   - Set `auto_advance_reason = 'Restored: re-percolated from Dec 2025 terminal month'`

2. Log `ADMIN_BULK_RESTORE` audit entries with full traceability

3. For the 4 already re-progressed KPIs — leave them as-is (they've been manually re-scored)

### Files to Change

| File | Change |
|------|--------|
| Database migration | Restore 24 Bi-Monthly Jan 2026 KPIs from Dec 2025 terminal data |
| `DOCUMENTATION.md` | Document the incident and restoration |
| `POLICY.md` | Add §69: migration scope guards — require explicit cycle-aware period filters |

### Risk Assessment
- **Data Impact**: Positive — restores legitimately approved data from intact terminal month records
- **Workflow Impact**: None — KPIs return to their original `approved` state
- **Regression Risk**: None — one-time corrective migration, no trigger/function changes

