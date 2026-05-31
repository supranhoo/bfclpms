## Goal
When an Admin uses **Bulk Approve → Override Value**, the corrected achievement (e.g. 16.66) must reflect in **every completed stage** of the Review Journey (Self / Manager / Skip-Level / HR PMS / Auditor / Management), not only in Self.

## RCA — confirmed against live data
Submission `d11f4f08…` (Mrutyunjaya Mohanty · Jan-2026 · FAD production target):
```
achieved_value             = 16.66   ← override applied (Self panel correct)
manager_achieved_value     = 35.32   ← STALE
skip_level_achieved_value  = 35.32   ← STALE
hr_pms_achieved_value      = 35.32   ← STALE
manager_score = 5, skip_level_score = 5, hr_pms_score = 4   ← STALE (recomputed from old value)
```
**Cause:** `bulk_management_approve` (override branch) only writes `review_submissions.achieved_value` (Self column) and `management_score`. The per-stage `*_achieved_value` and `*_score` columns — which `KpiJourneySection.tsx` reads directly (lines 511/518/525/532/539) — are left untouched, so completed stages keep the pre-override value & rating.

## Assumptions
- Admin override is the **authoritative correction** of the canonical achievement. For stages that were already completed, the journey should reflect *what the value should have been* — same value, recomputed rating.
- Stages that were never completed (`*_score IS NULL`) must remain NULL — we do not invent new stage entries.
- For Org KPIs, all stages observe the same canonical value (no per-reviewer disagreement on the raw number), so propagating one value across completed stages is safe.

## Risk & Impact Report
- **Data Impact:** Backfills `*_achieved_value` and `*_score` columns on `review_submissions` rows that already carry an Admin override audit log. `final_score` immutability respected (no change to existing final values; only sync underlying stage scores to match). Self stage unchanged.
- **Workflow Impact:** None — purely synchronises existing approved data; no status change, no notifications.
- **UI/UX Impact:** Journey panels now display the corrected value + correct rating for every completed stage; no UI code changes required (UI already reads these columns).
- **Regression Risk:** Low — touches only the override branch of `bulk_management_approve` and a one-shot repair scoped to rows with `ORG_KPI_VALUE_OVERWRITTEN` audit logs.
- **Scalability:** Repair scans audit logs by action + date — indexed; O(few hundred rows).

## Plan (Step → Verification)

### 1. Migration A — extend `bulk_management_approve` override branch
In the `IF p_is_override THEN` block, after the existing `UPDATE review_submissions SET achieved_value = v_ach_num`, add:
```sql
UPDATE public.review_submissions
   SET manager_achieved_value    = CASE WHEN manager_score    IS NOT NULL THEN v_ach_num ELSE manager_achieved_value    END,
       skip_level_achieved_value = CASE WHEN skip_level_score IS NOT NULL THEN v_ach_num ELSE skip_level_achieved_value END,
       hr_pms_achieved_value     = CASE WHEN hr_pms_score     IS NOT NULL THEN v_ach_num ELSE hr_pms_achieved_value     END,
       auditor_achieved_value    = CASE WHEN auditor_score    IS NOT NULL THEN v_ach_num ELSE auditor_achieved_value    END,
       management_achieved_value = CASE WHEN management_score IS NOT NULL THEN v_ach_num ELSE management_achieved_value END,
       manager_score    = CASE WHEN manager_score    IS NOT NULL THEN v_final ELSE manager_score    END,
       skip_level_score = CASE WHEN skip_level_score IS NOT NULL THEN v_final ELSE skip_level_score END,
       hr_pms_score     = CASE WHEN hr_pms_score     IS NOT NULL THEN v_final ELSE hr_pms_score     END,
       auditor_score    = CASE WHEN auditor_score    IS NOT NULL THEN v_final ELSE auditor_score    END
 WHERE id = v_sub_id;
```
Emit a single `STAGE_VALUES_OVERWRITTEN` audit log alongside the existing `ORG_KPI_VALUE_OVERWRITTEN` entry (carrying old/new per-stage values for traceability).

- **Verify:** rerun an override on a fresh test cell; query the row — all `*_achieved_value` for completed stages = override value; `*_score` recalculated; never-completed stages remain NULL.

### 2. Migration B — one-shot repair for past overrides
Idempotent UPDATE for any `review_submissions` whose latest `ORG_KPI_VALUE_OVERWRITTEN` audit log was written after `2026-05-29` (the day this feature shipped). Same column logic as Step 1, using current `achieved_value` as the source of truth, and current KPI thresholds to recompute each completed stage's score. Insert one `STAGE_VALUES_BACKFILLED` audit per row.
- **Verify:** re-run the live query on `d11f4f08…`; `manager_achieved_value = skip_level_achieved_value = hr_pms_achieved_value = 16.66`; ratings recomputed; reopen UI — all four cards in Review Journey show **Value: 16.66**.

### 3. Docs
- `docs/adr/ADR-067.md`: append "Stage value propagation" addendum noting Override now syncs all completed stage `*_achieved_value`/`*_score` columns.
- `DOCUMENTATION.md` + `POLICY.md`: one-line update under "Bulk Management Override".

### 4. Tests
Extend `src/test/bulkManagementApproveOrgKpiOverride.test.ts` (existing) with:
- Override on a submission with completed Manager/Skip/HR PMS stages — assert each `*_achieved_value` = override value, each `*_score` recomputed.
- Override on a submission with only Manager completed — assert Skip-Level/HR PMS stay NULL.

## UI Changes
None. UI already reads `*_achieved_value` and `*_score`; the bug is purely server-side data sync.

## Rollback
Drop the new UPDATE block (revert function to current definition) and reverse the one-shot repair via the `STAGE_VALUES_BACKFILLED` audit log (which captures old values).

## Files
- **2 new migrations**: (a) replace `bulk_management_approve`, (b) one-shot repair.
- **Edit**: `src/test/bulkManagementApproveOrgKpiOverride.test.ts`, `docs/adr/ADR-067.md`, `DOCUMENTATION.md`, `POLICY.md`.

Ready to implement on approval.