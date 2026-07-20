# Fix: Projected Final Score > 100

## Root cause (to confirm in Step 1, high confidence)

`computeFinalScore` (SSOT used by both the projection card and the ADR-124 server-side finalizer) assumes every `reviewer_role → weighted_score` value is already on a **0..100** scale. In practice, `annual_review_responses.weighted_score` is stored as the **raw weighted point sum** out of the template's criteria maximum (e.g. 225 / 45, 229 / 88). Blending raw sums with a percentage-based system score produces the `269.6 / 100` and `13.48 / 5` shown in the screenshot — and, worse, the same math ran server-side during the ADR-124 backfill for 768 completed instances, so their `total_score` and `final_rating` are likely wrong too.

## Step 1 — Confirm before fixing (read-only)

Query the affected instance + a spread of ADR-124 backfilled rows:

- Identify the instance behind the screenshot (Dept stage locked, BU pending, System 6/12, Criteria pool max 88).
- For that instance and 20 sampled ADR-124-completed instances, pull:
  - `template.sections.criteria_max` (or per-section max), resolved `stage_weights`
  - each locked response's `weighted_score`, `criteria_scores` sum, `is_locked`
  - persisted `criteria_weighted_score`, `total_score`, `final_rating`
- Confirm `weighted_score` is raw points (not /100). If some templates persist it as /100 and others as raw, capture both shapes — the fix must handle whichever is truth.

**Do not proceed past Step 1 until this is verified.** If the assumption is wrong, re-plan.

## Step 2 — Normalize at the SSOT boundary (TS)

In `src/lib/annualReview/finalScore.ts` / `runningFinalScore.ts`:

- Add a single normalization helper `toPercent(rawWeighted, criteriaMax)` used at the point where reviewer scores enter `computeFinalScore`.
- Change `RunningFinalScoreInput` to also take `criteriaMax` (resolved from template).
- `criteria_weighted_score` on the instance gets the same treatment (it's persisted with the same raw-points convention).
- Guard: if `criteriaMax` is missing or 0, drop the bucket (mark pending) instead of dividing by 0 or emitting raw values.
- Clamp the final blended score to `[0, 100]` and `[0, 5]` defensively; log a console warning when a clamp fires so future drift is visible.

## Step 3 — Mirror the fix server-side

Migration updates `public.annual_review_compute_final_summary` (ADR-124) to apply the same `raw / criteria_max * 100` conversion before blending. Keep the RPC signature stable. Add a Postgres-side clamp + `RAISE WARNING` when a pre-clamp value exceeds 100 so we catch future template misconfig.

## Step 4 — Re-run the ADR-124 backfill correctly

- One-shot: recompute `criteria_weighted_score` (percent-scale), `total_score`, `final_rating` for every instance previously touched by category `ADR_124_TERMINAL_COMPLETION_V1` (~768 rows).
- Log old→new values in `system_audit_logs` under `ADR_126_PROJECTED_SCORE_NORMALIZATION_V1` for full reversibility.
- Re-verify Mithu Kumar Mahto (200141) and 4 other spot samples before/after.

## Step 5 — Card UI polish

`RunningFinalScoreCard`:
- Keep the current copy; add a `criteriaMax` prop plumbed from the parent so the projection uses the correct denominator.
- If `score_0_100 > 100` after math (should never happen post-fix), render `—` and a "Score temporarily unavailable" line instead of a nonsense number — belt-and-braces guard.

**Visual change**: numbers in the "Projected final score to date" card become sane (`≤ 100 / 100`, `≤ 5 / 5`). No layout, color, spacing, or component changes. No other screens change visually.

## Step 6 — Tests (mandatory)

- New unit tests in `runningFinalScore.test.ts`:
  - Raw-points input with `criteriaMax=45` → correct /100 projection
  - Missing `criteriaMax` → bucket dropped, marked pending
  - Pre-clamp overflow → clamped + warned
- PL/pgSQL regression test: two fixture instances (one raw, one already-normalised template) both produce the same `total_score` after Step 3.
- Snapshot the pre/post values for Mithu 200141 and the screenshot instance.

## Step 7 — Docs & policy

- `DOCUMENTATION.md` v2.66.119 entry: ADR-126 (Weighted-score normalization).
- `POLICY.md` §AR-WEIGHTED-SCORE-SCALE: `annual_review_responses.weighted_score` and `annual_review_instances.criteria_weighted_score` are **raw weighted point sums** on the template's criteria max; all downstream blending must normalise to /100 at the SSOT boundary.

## Rollback

Every mutated row is captured pre-image in `system_audit_logs`; a single `UPDATE ... FROM system_audit_logs WHERE category='ADR_126_PROJECTED_SCORE_NORMALIZATION_V1'` reverts Step 4. TS/PL/pgSQL SSOT changes revert by reverting the migration + commit.

## Out of scope

- No changes to how reviewers enter scores.
- No template weight edits.
- No changes to system-score storage (already on /100).
