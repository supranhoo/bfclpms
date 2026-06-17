## Root Cause: Mandala's Self/Achvd is blank because the org-KPI value is "pending" (not propagated)

### What the data shows

For the May 2026 "Implement 5S practices" org KPI, the org-level value was entered with `achieved_value=2`, `remarks='2S Achieved'` for many employees, but each employee row in `org_kpi_values` has its own `status`:

- `status='propagated'` → `review_submissions.self_score` and `achieved_value` are filled (2.00) → row renders normally (Ashish, Bidroha, Deepak, etc.)
- `status='pending'` → `review_submissions.self_score = NULL`, `achieved_value = NULL`, only `self_remarks='2S Achieved'` got copied → row shows blank Self/Achvd in the bulk dialog.

Mandala Naga Raju (200570) is in the `pending` bucket. The Journey card you screenshotted reads from the OKV master (so it shows Self=2 with rating 2 via fallback), while the Bulk Sign-off dialog reads `review_submissions.self_score`, which is NULL. That mismatch is the blank cell.

A scan of all OKV rows for this KPI / May 2026 confirms 12 employees are in `pending` state — exactly the rows you noticed: Mandala, Shiv Prakash Rai, Prakash Chandra Goswami, plus 9 others (Aakash, Ajay B., Ajay Kumar, Amit, Ankit, Ashish Kataria, Ashok, Deepak Ranjan, Deepesh, Dinesh).

### Why this happened

When the OKV was entered, the per-employee propagation step did not complete for these 12 employees (RLS skip, batch interruption, or the employee/KPI pair was created after the original propagation). The manager later entered manager_score=2 directly, but Self was never back-filled.

### Two-step fix (requires-approval)

1. **Repair the data** (one migration, idempotent):
   - For every OKV row with `status='pending'` that has a matching `review_submissions` row with `self_score IS NULL` and `kpi.status IN ('self_review','manager_check')`, copy `okv.achieved_value` → `rs.achieved_value` and `rs.self_score`, set `rs.self_rating` from the rating-scale lookup, mark `okv.status='propagated'`. Scope: this specific KPI + period, then a follow-up pass for the global backlog.
   - Audit-log every write (POLICY §111.7.t.1, Submission Score Integrity memory).

2. **Prevent the blank-cell UX going forward** (UI parity):
   - In the Bulk Sign-off snapshot builder, when `self_score IS NULL` and a matching OKV row exists with `achieved_value IS NOT NULL`, hydrate Self/Achvd from OKV at display time (read-only fallback, same source the Journey card already uses). The "carry-forward" save logic remains unchanged.
   - Mark the cell with a small "OKV pending" tooltip so admins know the underlying `review_submissions` write hasn't happened yet.

### Tests
- Add a `bulkSignoffImpact.test.ts` case: OKV value present + `rs.self_score=NULL` → CellPreview.stageScores.self comes from OKV, source is unchanged ("manager" if manager_score is the carried-forward), and the row is no longer blank.
- Backfill repair: dry-run + assertion that no `kpi.status` past `manager_check` is touched.

### Risk & Impact
- **Data Impact**: Repair writes only to rows that are currently NULL/pending; nothing is overwritten. Reversible via the audit-log entries.
- **Workflow Impact**: None — same scores the org-KPI editor already shows.
- **Regression Risk**: Low; the UI fallback is display-only and gated on `self_score IS NULL`.
- **UI Impact**: The 12 blank rows in this dialog (and any similar pending OKVs) will start showing Self/Achvd consistent with the Journey card.

### Rollback
- Code: revert the snapshot-builder fallback (single function).
- Data: per-row reversal using the audit-log batch ID.