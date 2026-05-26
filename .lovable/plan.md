## Goal

In the Bulk Review side panel (`BulkCellDrawer`), replace the bare "Score 0–5 + Remarks" form with the same scoring experience used on the actual stage page (HR PMS / Manager / Skip-Level / Auditor) — i.e. **enter an Achievement value and let the system compute the rating** from the KPI's R0–R5 scale — and keep the **Observations** section visible/usable in the panel.

No new business logic, no schema changes. Pure UI reuse of existing components and the existing RPC.

## Assumptions

- "Actual page of scope" = the per-stage review form rendered inside `UnifiedScorecard.tsx`, which uses `AchievedValueScoreInput` for achievement→rating computation.
- The bulk write RPC already accepts `achieved_values` per submission (`useBulkWriteStageScores` → `p_achieved_values`), so no DB change is needed.
- `KpiReviewPanel` already renders `KpiObservationsSection` — observations are currently visible but not emphasized; we only ensure they remain so and that "Add Observation" works for the active viewer stage in the drawer.
- Scope stays: Manager, Skip-Level, HR PMS, Auditor write paths in the drawer. Self / Management are read-only here (unchanged).

## Risk & Impact Report

- **Data Impact:** None. Same RPC, same columns (`*_score`, `*_remarks`, `achieved_value`). Existing precedence guards (HR PMS blocked when Auditor set, final-locked, optimistic `row_version`) are preserved.
- **Workflow Impact:** None. Drawer still writes only the viewer's owned stage.
- **UI/UX Impact:** Drawer's bottom "Write as <Stage>" block changes from a 0–5 number input to the standard achievement input + auto-computed rating badge + remarks. Matches what reviewers already see on the main review page.
- **Regression Risk:** Low. Limited to `BulkCellDrawer.tsx`. Existing flows (Re-open, final lock, variance badge, KpiReviewPanel) untouched. The simple-input fallback is retained for KPIs that are not achievement-driven (e.g. missing thresholds / unsupported UoM) so we never block a save.
- **Scalability Impact:** None — single-cell write per save, identical to today.
- **Mitigation:** Reuse the already-tested `AchievedValueScoreInput` exactly as the main page does; add unit coverage for the new drawer adapter logic.

## What changes visually

Location: right-side Sheet opened from any cell in `BulkReviewMatrixGrid` (visible in the user's screenshot as the "Write as HR PMS" block).

Before → After:
- "Score (0–5)" number input → **Achievement input** (numeric / date / qualitative, driven by `kpi.uom_type`) with live rating badge (e.g. `R2 · 1`), matching the actual review page.
- Remarks input → unchanged.
- "Save <Stage> score" button → unchanged label; now sends both `score` and `achieved_value`.
- Observations: the `KpiReviewPanel`'s **Observations** card stays visible (already rendered). We surface the "Add Observation" affordance in the drawer header area when the viewer stage allows it, so it isn't lost below the fold.
- A small "Use manual 0–5" link under the achievement input lets the reviewer fall back to direct-rating entry when thresholds are missing or they want to override. Default is achievement-driven (parity with the actual page).

No layout/responsive changes outside the drawer.

## Step-by-step plan

1. **`src/components/review/BulkCellDrawer.tsx`** — replace the "Write as <Stage>" block:
   - Import `AchievedValueScoreInput` and `RatingLevel`.
   - Local state: `achieved` (number | string | null), `computedScore` (number | null), `manualMode` (boolean), `remarks` (string).
   - Seed initial `achieved` from `detail.data.submission.achieved_value ?? row.achieved_value ?? null` when the drawer opens for a new row; reset on close.
   - Render `AchievedValueScoreInput` with `kpi = detail.data.kpi` (thresholds, criteria, uom_type, qualitative_options) and `label = "Write as <Stage>"`. When `onScoreChange(score, rating)` fires, store `computedScore`. When `onAchievedValueChange(v)` fires, store `achieved`.
   - Keep the existing HR PMS-blocked-by-Auditor alert and the final-locked alert as-is.
   - "Save" button:
     - disabled until `computedScore != null` (achievement mode) or `score` entered (manual mode);
     - calls `write.mutateAsync({ stage, cells: [{ submission_id, score: computedScore, remarks, expected_row_version }], achieved_values: { [submission_id]: achieved } })`.
   - Small "Use manual 0–5" toggle reveals the existing number Input as a fallback (used when KPI has no thresholds, e.g. all R0–R5 null).
2. **Observations visibility** — keep `KpiReviewPanel` mounted (already shows `KpiObservationsSection`). Add a compact "Jump to Observations" link in the drawer's status-badge strip that scrolls the observations card into view (`scrollIntoView({ behavior: 'smooth' })`). No new component; uses an `id` anchor on the existing card wrapper.
3. **No changes** to `useBulkReview.ts`, RPCs, RLS, workflow engine, `KpiReviewPanel`, `KpiObservationsSection`, or `BulkReviewMatrixGrid`.

## Tests

- `src/components/review/BulkCellDrawer.scoring.test.tsx` (new, RTL):
  1. Numeric "Lower is Better" KPI: entering achieved value `1` against scale `R5=0, R2=1` shows badge `2`, Save sends `{ score: 2, achieved_values: { …: 1 } }`.
  2. KPI with all-null thresholds: achievement input is hidden, manual 0–5 fallback shown; Save sends `{ score: 4, achieved_values: { …: null } }`.
  3. HR PMS viewer + auditor already scored: precedence alert visible, Save disabled.
  4. Final-locked row: write block hidden, re-open block still visible.
- Re-run existing `bulkProcessedFilter.test.ts` to confirm no regressions.

## DOCUMENTATION.md / POLICY.md updates

- **DOCUMENTATION.md** → §"Bulk Review · cell drawer": note that the write form mirrors the per-stage review page (achievement-driven, with manual fallback) and observations remain inline.
- **POLICY.md** §111 (Bulk Processed Filter / Bulk Drawer): add a sub-point "Drawer writes use the same achievement→rating computation as the stage page; manual 0–5 is a fallback only when thresholds are not defined." No policy semantics changed.

## Out of scope

- Adding scoring for Self or Management from the drawer.
- Changing how observations are stored or who can add them.
- Persisting drawer state, multi-row writes from the drawer, evidence uploads in the drawer.

## Decision justification

Reusing `AchievedValueScoreInput` (the same component the stage pages use) is the smallest change that delivers "the actual page experience" without duplicating logic. Wrapping it inside `BulkCellDrawer` keeps the bulk grid's flow intact and avoids embedding the full `UnifiedScorecard` (which would re-fetch the employee's whole KPI list and break the bulk panel's compact form factor).
