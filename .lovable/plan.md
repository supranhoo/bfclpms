## Goal

On the Bulk Review dashboard, the only bulk action today is **Bulk Approve (Mgmt)** — terminal approval gated to `effectiveRole = management | admin`. An HR PMS user has no bulk action even though the backend RPC already supports it. Make the bulk-action button **role-driven**: each reviewer sees a bulk action for *their own* stage; admins (acting via the viewer-stage dropdown) can act on any stage.

## Assumptions

- `bulk_write_stage_scores(p_stage, p_cells, p_batch_reason)` already accepts `'manager' | 'skip_level' | 'hr_pms' | 'auditor'` and enforces stage precedence server-side (verified in migration `20260522172805…`). No DB change needed.
- `bulk_management_approve` remains the only path that writes `final_score` (terminal). HR PMS / Auditor / Manager / Skip-Level "bulk approve" means **bulk sign-off**: copy previous-stage score into the reviewer's stage column and let the workflow advance — same semantics as the single-cell write today.
- "Approve as HR PMS" without overriding values = accept previous-stage score for every selected cell. Per-cell score overrides stay in the existing cell drawer (out of scope here).

## Risk & Impact Report

- **Data Impact:** None new. Uses existing RPC with the same RLS/validation. No schema changes.
- **Workflow Impact:** HR PMS / Auditor / Manager / Skip-Level gain a bulk path that already exists per-cell. Server-side guards (`self_not_submitted`, `auditor_takes_precedence`, `final_locked`, `row_version_conflict`) are unchanged — skipped reasons surfaced in the toast.
- **UI/UX:** Single sticky button label changes based on effective role / viewer-stage. No layout change.
- **Regression Risk:** Low. Existing Management approval path untouched; only its visibility condition is refactored into a shared `bulkActionForStage()` helper.
- **Scalability:** Same RPC and page-size limits as today (ADR-064 lean-load).
- **Mitigation:** Unit tests for the role→action resolver; manual QA across the 5 viewer stages.

## Plan

1. **Resolver helper** — `src/lib/bulkActionForStage.ts`
   - Input: `effectiveRole`, `viewerStage`.
   - Output: `{ kind: 'mgmt' | 'stage' | null, stage?: 'manager'|'skip_level'|'hr_pms'|'auditor', label: string }`.
   - Rules:
     - `effectiveRole === 'management'` → `mgmt` (terminal). Label: `Bulk Approve (Mgmt)`.
     - `effectiveRole === 'admin'` → action follows `viewerStage`: `management` → mgmt; otherwise `stage` for that stage.
     - `effectiveRole ∈ {manager, skip_level, hr_pms, auditor}` → `stage` with their own role (viewer dropdown ignored for the action — they can only bulk-approve as themselves).
     - Anything else → `null` (no button).
   - Labels: `Bulk Sign-off (HR PMS)`, `Bulk Sign-off (Auditor)`, `Bulk Sign-off (Manager)`, `Bulk Sign-off (Skip-Level)`.

2. **Wire into `BulkReviewDashboard.tsx`**
   - Replace the hardcoded `canApprove` + button block (~lines 342, 745–753) with the resolver output.
   - Add a `useBulkWriteStageScores()` mutation alongside the existing `useBulkManagementApprove()`.
   - `openApproveDialog` and `BulkApproveDialog` reused as-is — confirmation + remark + optional attachments stay required.
   - On confirm:
     - `kind === 'mgmt'` → existing `handleBulkApprove` path (unchanged).
     - `kind === 'stage'` → call `bulk_write_stage_scores` with `p_stage = stage`, cells = `{submission_id, expected_row_version}` (no `score` → server keeps previous-stage value). Toast: `Signed off N / M · K skipped`.
   - Reuse `batchId`, attachments, and the skipped-reasons toast formatting.

3. **Tests** — `src/lib/bulkActionForStage.test.ts`
   - Matrix: 7 roles × {viewerStage = same/other/management} → asserts kind, stage, and label.
   - Edge: `employee`, `null` role → `null` action.

4. **Docs & Policy**
   - `DOCUMENTATION.md` v2.66.13.3: "Bulk Review sign-off is now role-aware; intermediate reviewers (Manager / Skip-Level / HR PMS / Auditor) can bulk-sign their own stage. Admins act according to the viewer-stage dropdown. Management retains exclusive bulk **terminal** approval."
   - `POLICY.md` §111.7: explicit role→action matrix + reminder that overrides remain per-cell.
   - Memory: extend `mem://features/review/bulk-review-dashboard` with the new resolver rule.

## Technical Details

- Files added: `src/lib/bulkActionForStage.ts`, `src/lib/bulkActionForStage.test.ts`.
- Files edited: `src/pages/review/BulkReviewDashboard.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `mem://features/review/bulk-review-dashboard`.
- No migrations, no edge-function changes, no new dependencies.
- `BulkApproveDialog` button copy stays generic ("Approve N cell(s)") so it works for both mgmt and stage flows.

## Out of Scope

- Per-cell score overrides in bulk (already possible via the cell drawer).
- New audit-log columns (existing `bulk_write_stage_scores` audit trail is sufficient).
- Skip-Level bulk approval policy — covered by the same resolver; if the org doesn't want it, we can disable that branch in a follow-up flag.

## Rollback

Pure UI/logic change. Revert the dashboard edit + delete the helper file. No data migration.
