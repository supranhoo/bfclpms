## Goal
Add **Department Head** as a first-class bucket in the Final Score Weights blend so it appears alongside Self / Manager / Skip / BU / HR / System / Criteria in the editor and contributes to the blended final score.

Reason it is missing: `dept_head` already exists as a reviewer role in `AnnualReviewerRole` and the stage chain (`STAGE_ORDER = [self, manager, skip_manager, dept_head, bu_head, hr]`), but the Final Score Weights layer (`StageWeightKey`) and the matching PL/pgSQL validator were never updated when `dept_head` was inserted into the workflow.

## Risk & Impact Report
- **Data Impact:** Additive only. New optional JSON key `dept_head` on `stage_weights` / `stage_weights_override` / `workflow_final_score_rules.stage_weights`. Existing rows remain valid (key absent ⇒ treated as 0 / dropped, identical to today). No backfill required.
- **Workflow Impact:** None. Department Head reviewer flow is unchanged; we only let admins assign weight to their score.
- **UI/UX Impact:** One additional field in `StageWeightsEditor` (used in template editor, per-instance override dialog, bulk dialog, and recent overrides panel). Layout already uses a 2-column responsive grid, so the new field slots in cleanly; total-validator and presets keep working.
- **Regression Risk:** Low. The blender skips buckets with weight 0 / null, so existing templates and overrides keep producing identical numbers. Risk concentrates in the SQL validator — if the allowed-keys array is not widened in lockstep, any save that includes `dept_head` will be rejected.
- **Scalability Impact:** None — fixed-size key set grows from 7 to 8.
- **Mitigation:** TS + SQL changed in the same step; unit tests cover the new key in validator, resolver, and blender; SQL validator tested by inserting a sample override.

## Step-by-step Plan

1. **TS SSOT — `src/lib/annualReview/finalScore.ts`**
   - Extend `StageWeightKey` union with `'dept_head'`.
   - Insert `'dept_head'` into `STAGE_WEIGHT_KEYS` between `'skip_manager'` and `'bu_head'` (matches workflow order).
   - Add `case 'dept_head': return 'dept_head';` in `roleToWeightKey`.
   - `computeFinalScore` already routes non-system/criteria keys through `responsesByRole[key as AnnualReviewerRole]`, so no algorithm change needed.

2. **Editor UI — `src/components/annual-review/StageWeightsEditor.tsx`**
   - Add label `dept_head: 'Department head'` and hint `'Weight given to the Department head review.'`.
   - No layout/preset change. Existing `Use 20 / 50 / 30` preset stays as-is (it intentionally leaves `dept_head` at 0).

3. **DB validator + comment — new migration**
   - `CREATE OR REPLACE FUNCTION public.annual_review_validate_stage_weights` with `v_allowed` extended to include `'dept_head'`.
   - `CREATE OR REPLACE FUNCTION public.annual_review_compute_final_score` (the mirror): widen `v_keys` to include `'dept_head'`; route its value from the dept_head response bucket (same lookup pattern as `skip_manager`/`bu_head`).
   - Update the trigger error message and the `COMMENT ON COLUMN annual_review_instances.stage_weights_override` to list `dept_head`.
   - Also update `workflow_final_score_rules.stage_weights` validator/compute paths if a parallel function exists (will confirm during read; same one-line additions).

4. **Tests**
   - Extend `src/test/annualReview/finalScore.test.ts` and `stageWeightsOverride.test.ts` with cases:
     - `isValidStageWeights({ dept_head: 100 })` is true.
     - Blend with `{ self: 20, manager: 40, dept_head: 20, bu_head: 20 }` and a dept_head response of 80 → contributes to result.
     - Missing dept_head response renormalises away its weight.

5. **DOCUMENTATION.md + POLICY.md**
   - Bump version; under §Annual Review › Final Score Weights, list the 8 allowed keys (add `dept_head`).
   - POLICY: add to "Allowed final-score weight buckets" list with explicit ordering rule (self → manager → skip → dept → bu → hr → system → criteria).

## UI Changes (exact)
- **Where:** `Final score weights` card (template editor, per-instance override dialog, bulk dialog).
- **What:** New field "**Department head (%)**" appearing as the next cell after **Skip manager** and before **BU head** in the existing 2-column grid. Helper text: *"Weight given to the Department head review."*
- **Interaction:** Identical to other fields — number input 0–100, contributes to the Total / Valid badge, persists in `stage_weights` JSON.
- **Responsiveness:** Inherits the existing `grid-cols-1 sm:grid-cols-2` layout — no new breakpoints needed.

## Rollback
Additive: revert the migration to drop `dept_head` from `v_allowed` / `v_keys`, and revert the TS union. Any saved overrides that used `dept_head` would then fail validation on next save, so rollback should also `UPDATE ... SET stage_weights_override = stage_weights_override - 'dept_head'` (and the same for template `sections.stage_weights`) — included as a one-liner in the migration's `-- Rollback` comment block.

## Out of Scope
- Reordering existing keys, changing presets, or altering the scoring math.
- Renaming "BU head" or other labels.
- Backfilling historical instances.
