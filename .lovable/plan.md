## 1. Assumptions
- The reported entry is the April 2026 `3 Way Matching` bulk HR PMS sign-off shown in the screenshots.
- “Supporting” means the shared evidence uploaded in the bulk approval dialog.
- “Stuck on HR PMS” means the Review Journey card still shows HR PMS as `Current` / no remark, not that the database failed to advance.

## 2. Clarifications
Not Applicable — the database facts are enough to isolate the disconnect.

## 3. RCA / Why-Why Analysis

### Observed facts
- The affected KPI for Ankit Kumar (`100636`) is not actually stuck in the database:
  - `kpis.status = approved`
  - `review_submissions.hr_pms_score = 5`
  - `review_submissions.final_score = 5`
- The bulk batch was created:
  - `stage = hr_pms`
  - `affected_count = 2`
  - `batch_reason = Approved - Subject to Audit\n(A)`
  - `skipped = 2 final_locked`
- But the affected HR PMS rows landed with:
  - `hr_pms_remarks = NULL`
  - `hr_pms_evidence_urls = NULL`

### Why chain
1. Why did HR PMS show “No remarks”?  
   Because `bulk_write_stage_scores` reads per-cell `remarks`, but the frontend sends the shared dialog remark only as `p_batch_reason`, not inside each cell.

2. Why was `p_batch_reason` not written into `hr_pms_remarks`?  
   Because the stage sign-off RPC only uses `v_cell->>'remarks'` and ignores `p_batch_reason` when stamping stage remarks.

3. Why did supporting evidence not attach?  
   Because `bulk_write_stage_scores` has no `p_attachment_urls` parameter and the frontend explicitly comments that attachments are “not consumed” for stage sign-off.

4. Why did it appear stuck on HR PMS?  
   Database status advanced to `approved`, but the detail drawer’s cached cell detail / KPI object likely was not invalidated/refetched after `bulk_review_snapshot_all`; only `bulk_review_snapshot` and `kpi_cell_detail` are invalidated. The visible drawer can therefore keep rendering stale `kpi.status = hr_pms_review` while the database is already `approved`.

5. Why did prior tests not catch this?  
   Existing tests validate role-to-action routing and remark requirement in the dialog, but do not test that stage sign-off propagates the dialog remark/evidence into the stage fields or refreshes the accumulated snapshot cache.

## 4. Risk & Impact Report
- **Data Impact:** Additive RPC signature replacement only; no table/column changes. Existing historical rows remain unchanged unless we add an optional targeted backfill for this batch.
- **Workflow Impact:** Bulk HR PMS/Manager/Skip-Level/Auditor sign-off will still inherit prior scores and advance via the reconciler; it will additionally persist the shared remark and evidence on the acted stage.
- **UI/UX Impact:** The same dialog remains; wording should become stage-neutral (`Sign off` for intermediate stages, `Approve` for Management). Drawer refresh should show Approved/current state correctly after action.
- **Regression Risk:** Medium around RPC signature/caller mismatch and storage evidence merge. Mitigation: keep backward-compatible defaults and update the single hook call site.
- **Scalability Impact:** No extra reads per cell. Evidence URLs are passed once per batch; per-row merge is bounded by the existing 5-file UI cap and a DB cap.
- **Backup/Data Integrity:** No new public tables; backup coverage unchanged. RPC changes are forward-only and reversible by restoring prior function definition.

## 5. Step-by-step Plan
1. **Database RPC fix**
   - Replace `public.bulk_write_stage_scores` with a backward-compatible v2 signature:
     `bulk_write_stage_scores(p_stage text, p_cells jsonb, p_batch_reason text default null, p_attachment_urls jsonb default '[]')`.
   - Enforce shared remark minimum for stage sign-off, matching the dialog.
   - When a cell omits `remarks`, write `p_batch_reason` into the acted stage remark column.
   - Merge shared evidence into the acted stage evidence JSON column:
     - manager → `manager_evidence_urls`
     - skip_level → `skip_level_evidence_urls`
     - hr_pms → `hr_pms_evidence_urls`
     - auditor → `auditor_evidence_urls`
   - Add audit metadata for `batch_reason` and attachment count.

2. **Frontend wiring fix**
   - Update `useBulkWriteStageScores` to accept `attachment_urls` and pass them to the RPC.
   - Update `BulkReviewDashboard.handleBulkApprove` so stage sign-off sends the dialog’s `attachmentUrls` instead of discarding them.
   - Invalidate both `bulk_review_snapshot` and `bulk_review_snapshot_all` after stage sign-off, plus `bulk_scope_preview` and `kpi_cell_detail`, so the matrix and drawer do not show stale HR PMS current state.
   - Make `BulkApproveDialog` stage-aware in labels/descriptions:
     - stage sign-off: `Bulk sign off X cells?`, button `Sign off X cells`
     - management: keep terminal approval wording.

3. **Optional targeted data repair**
   - Backfill the already-created batch `f7d3d214-5a2e-4ff2-b0cd-d33ba626baf6` so the two applied HR PMS rows receive the stored `batch_reason` in `hr_pms_remarks`.
   - Evidence cannot be backfilled for that batch because no attachment URLs were sent/stored by the stage sign-off path.

4. **Tests**
   - Add/extend unit tests for:
     - stage sign-off payload includes `attachment_urls`
     - mutation invalidates `bulk_review_snapshot_all`
     - dialog labels are stage-aware and still require a remark
   - Add SQL contract test/assertion that `bulk_write_stage_scores` writes shared remarks/evidence to the acted stage.

5. **Documentation / Policy sync**
   - Update `DOCUMENTATION.md` version history with the RCA and fix.
   - Update `POLICY.md §111.7` to state that bulk stage sign-off must persist shared remarks/evidence to the acted stage, not only batch metadata.
   - Update project memory for Bulk Review Dashboard if the memory path exists; if not, skip memory update rather than creating a duplicate.

## 6. UI Changes
- **Location:** Bulk Review confirmation dialog.
- **Visual change:** Dialog title/button text becomes action-specific for stage sign-off vs management approval.
- **Interaction impact:** Same required remark and optional evidence upload; stage sign-off now actually stores both.
- **Responsiveness:** No layout change; existing dialog sizing remains.

## 7. Implementation
Pending your approval to switch from plan mode to build mode.

## 8. Tests
Planned as above; will run targeted tests only.

## 9. DOCUMENTATION.md updates
Will add a new `2.66.13.6` entry.

## 10. POLICY.md updates
Will extend `§111.7.a` with the remark/evidence persistence requirement.

## 11. Post-implementation notes
After implementation, I will verify the specific KPI/batch again: status, final score, HR PMS remarks, evidence URL behavior, and drawer refresh path.