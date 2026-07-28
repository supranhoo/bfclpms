## Assumptions

- The stage strip already shows "FUNCTIONAL MGR" (ADR-194), but the **KPI Details** table below it still renders only Self / Manager / Auditor / Final — no Functional Mgr column.
- Scope of this request is the KPI Details table (and its sorting/N-A/re-review helpers), not the review dialog.

## Verified current state

- `src/components/review/KpiDetailsTable.tsx` builds its columns from `STAGE_COLUMN_MAP` (line 31), which maps `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review` — **`functional_manager_check` is absent**. Because `buildScoreColumns()` only emits columns for stages present in that map, an F1 workflow silently loses the column.
- The same omission repeats in the file's `COLUMN_TO_STAGE` reverse map (line 41), `getScoreForColumn()` (line 120), `STATUS_ORDER` used for status sorting (line 149), and `SCORE_COLS_ORDERED` used for the "Re-review" indicator (line 612).
- The score exists in the database: `review_submissions.functional_manager_score / _rating / _remarks / _evidence_urls`. There is **no** FM `achieved_value` or singular `evidence_url` column.
- `canReviewKpi()` in `src/lib/workflowEngine.ts:347` already supports a `'functional-manager-review'` view type, so the action-button path needs no change for the column to render.

## Risk & Impact Report

- **Data impact:** None. Read-only column addition; no schema or RLS change.
- **Workflow impact:** None. Column visibility is still driven by the employee's resolved workflow stages, so non-F1 employees see no new column.
- **UI/UX impact:** One extra score column between "Manager" and the next stage, only for F1 workflows. Table is already horizontally scrollable; column count is computed from `scoreColumns.length`, so the colspan stays correct.
- **Regression risk:** Low. Main risk is the `SCORE_COLS_ORDERED` array used by the re-review indicator — inserting FM in the wrong position would mis-detect downstream scores. Mitigated by inserting it immediately after `manager_score`, matching `canonical_stage_order()`.
- **Scalability:** No new queries; the FM score comes from the already-fetched submission row.

## Plan

1. **Add FM to the stage/column maps** in `KpiDetailsTable.tsx`
   - `STAGE_COLUMN_MAP`: `functional_manager_check → { key: 'functional_manager_score', label: 'Functional Mgr' }`, placed after `manager_check`.
   - `COLUMN_TO_STAGE`: `functional_manager_score → 'functional_manager_check'`.
   - Verification: an F1 employee's table renders the column; a non-F1 employee's does not.

2. **Return the score** — add a `case 'functional_manager_score'` to `getScoreForColumn()` reading `submission.functional_manager_score`.
   - Verification: a KPI with an FM score shows the digit; unscored shows `—`, and a passed stage with no score shows the existing N/A badge.

3. **Fix the ordering helpers** — insert `functional_manager_check` into `STATUS_ORDER` and `functional_manager_score` into `SCORE_COLS_ORDERED`, both right after the manager entry.
   - Verification: sorting by Status places F1 KPIs between Manager Check and Skip-Level; the "Re-review" chip appears only when a later stage holds a score.

4. **Derive from the SSOT** — reference `CANONICAL_WORKFLOW_STAGES` from `src/lib/reviewConstants.ts` for `STATUS_ORDER` so this local array can't drift again (POLICY §WF-STAGE-SSOT).

5. **Tests + docs**
   - Unit test covering `buildScoreColumns()` for an F1 workflow vs a non-F1 workflow, `getScoreForColumn('functional_manager_score')`, and the re-review downstream-score detection with FM present.
   - Extend **ADR-194** in `DOCUMENTATION.md` with the KpiDetailsTable touch point.

## UI changes

- **What changes:** a new "Functional Mgr" score column in the KPI Details table header and each KPI row.
- **Where:** Dashboard → KPI Details table, between the "Manager" and "Auditor" columns.
- **Interaction:** the header is sortable like the other score columns; cells follow the existing score / `—` / N/A / Re-review rendering rules.
- **Responsiveness:** no layout change for non-F1 employees; F1 tables gain one column within the existing horizontal scroll container.

## Out of scope (flagged)

`src/components/review/UnifiedScorecard.tsx` still has no `functional_manager` stage in its `previousScoreField` union and cascade-clear map, so the FM reviewer's *scoring dialog* may not read/write the FM fields correctly. That is a separate, larger change — tell me if you want it folded into this work or tracked as its own ADR.
