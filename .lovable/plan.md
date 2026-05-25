## Problem (RCA)

The screenshot shows HR PMS bulk sign-off reported "Signed off 2 / 4 · 2 skipped" but the cells in the grid still read **PENDING** and the KPI detail still shows **HR PMS Review · Current** with an N/A chip — i.e. the workflow never advanced.

Two real bugs in `public.bulk_write_stage_scores` (migration `20260522172805_…`):

1. **Score is not inherited.** The client (`BulkReviewDashboard.tsx` line 390) omits `score` for sign-off and the comment claims "server keeps previous-stage value", but the RPC actually does:
   ```sql
   UPDATE review_submissions SET hr_pms_score = v_score …
   ```
   where `v_score := NULLIF(v_cell->>'score','')::numeric` → **NULL**. So sign-off writes `hr_pms_score = NULL`. That's why the HR PMS card in screenshot 2 renders as "N/A · No remarks".

2. **Workflow status is never advanced.** The RPC touches only `review_submissions`. It never updates `kpis.status` from `hr_pms_review` → `auditor_review` (or `approved`/next stage per the resolved workflow). The mgmt approval path (`bulk_management_approve`) does this; the stage-sign-off path does not. → cells stay PENDING in the grid.

The "2 skipped" is a secondary issue: skip reasons (`self_not_submitted`, `final_locked`, etc.) are bundled into the toast as a count only. Users have no idea which cells or why without opening the audit log.

## Risk & Impact

- **Data**: Sign-off currently writes NULLs into `hr_pms_score` / `skip_level_score` / `manager_score` / `auditor_score`. A one-time forward-only repair RPC will backfill those NULLs (only rows where `group_write_batch_id` was set by stage sign-off and the corresponding stage column is NULL) using the inheritance chain, then advance affected `kpis.status`. Final-locked rows are untouched.
- **Workflow**: After the fix, HR PMS / Manager / Skip-Level / Auditor bulk sign-off will actually advance `kpis.status` using the per-employee resolved workflow chain (already used by single-cell stage saves).
- **UI/UX**: Toast now lists skipped reasons (grouped counts) so reviewers know *why*. No layout change.
- **Regression**: Single-cell sign-off paths are untouched. Mgmt bulk approve is untouched. Re-open and management approve already advance status correctly.
- **Scalability**: RPC loop is unchanged in shape; status advancement is one extra UPDATE per cell, bounded by selection size.
- **Rollback**: New migration is additive (replaces function body, keeps signature). Previous function body kept in migration history for rollback.

## Plan

### 1. New migration: replace `bulk_write_stage_scores`

- Resolve `v_score` with **inheritance cascade** when input score is NULL:
  - `manager` → fall back to `self_score`
  - `skip_level` → `manager_score` → `self_score`
  - `hr_pms` → `skip_level_score` → `manager_score` → `self_score`
  - `auditor` → `hr_pms_score` → `skip_level_score` → `manager_score` → `self_score`
  - If the cascade still yields NULL, skip with reason `no_prior_score`.
- After the per-cell UPDATE, **advance `kpis.status`** by calling existing helper `public.advance_kpi_workflow_status(p_kpi_id, p_completed_stage)` (or, if that helper doesn't exist, inline the same logic the single-cell `save_stage_score` path uses — resolve next stage via `get_resolved_workflow_for_employee`, update `kpis.status`, write `kpi_audit_logs`).
- Keep existing skip reasons; add `no_prior_score`.
- Insert a `kpi_audit_logs` row per applied cell with action `BULK_STAGE_SIGNOFF_<STAGE>` and `batch_id`, `inherited_from` metadata.

### 2. One-time repair RPC: `repair_bulk_signoff_nulls(p_dry_run boolean)`

- Find `review_submissions` rows where `group_write_batch_id` is in a `bulk_review_batches` row with `stage IN ('manager','skip_level','hr_pms','auditor')` AND the corresponding stage column is NULL AND `final_score` IS NULL.
- For each, run the same inheritance cascade and write the score, then reconcile `kpis.status` via the existing reconciliation helper.
- Returns `{ scanned, repaired, status_advanced, still_null }`. Admin-only via existing edge function pattern (no UI in this change).

### 3. Client surface skip reasons

`BulkReviewDashboard.tsx` `handleBulkApprove` — group `res.skipped` by reason and render in toast description:
```
Signed off 2 / 4
2 skipped: self_not_submitted (2)
```
For ≥3 reason buckets, fall back to "see audit log".

### 4. Tests

- `src/test/bulkStageSignoffInheritance.test.ts` — table-driven: each stage × each "missing score, has prior" case → expected inherited value; missing all priors → `no_prior_score`.
- `src/test/bulkSignoffSkipReasonToast.test.ts` — `summariseSkipReasons(skipped)` helper → label string.
- DB-side: add an explicit `select` in migration's `DO $$` block confirming `kpis.status` advances after a `bulk_write_stage_scores('hr_pms', …)` call on a seeded row (guard: only runs if no rows touched on prod).

### 5. Docs & Policy

- `DOCUMENTATION.md` v2.66.13.4 — describe inheritance cascade, status advancement, skip-reason toast, repair RPC.
- `POLICY.md` §111.7 — add Inheritance Cascade table; codify that stage sign-off MUST advance `kpis.status` and MUST inherit prior-stage value when score omitted.
- `mem/features/review/bulk-review-dashboard` — bump to v2.66.13.4 with the cascade rules.

## Out of scope

- Re-implementing N/A as a bulk action (separate request).
- Changing the management terminal approval flow.
- Per-row override UI in the dashboard (already deferred).

## Files

- **new** `supabase/migrations/2026052511xxxx_bulk_stage_signoff_inherit_and_advance.sql`
- **new** `supabase/migrations/2026052511xxxx_repair_bulk_signoff_nulls.sql`
- **edit** `src/pages/review/BulkReviewDashboard.tsx` (toast description only)
- **new** `src/lib/summariseSkipReasons.ts` + test
- **new** `src/test/bulkStageSignoffInheritance.test.ts` (uses mocked supabase rpc; happy + skip paths)
- **edit** `DOCUMENTATION.md`, `POLICY.md`, `mem/features/review/bulk-review-dashboard`

Approve and I'll implement.