
# Dept Head / BU Head — Running Score + Overall Recommendation

## What the user asked for
1. When a BU Head opens a reviewee, show the **employee's final score based on all calculations to date** — i.e. the blended annual score computed from stages already submitted (Self, Manager, Skip, Dept Head), the system-score contribution, and the stage-weight config, projected to /100 using the same math as the HR final score.
2. Add an **Overall Recommendation** free-text box for Dept Head and BU Head at the end of the review form. Missing today. Visible to later reviewers (BU/HR) and to the employee at acknowledgment.

Both scopes are UI + a tiny SSOT addition. No schema migration.

## Risk & Impact Report
- **Data:** No new columns. Recommendation stored in the existing `annual_review_responses.qualitative_responses` JSONB under a reserved key `__overall_recommendation` (same pattern as `__variance` justifications — see mem: annual-review overview §variance).
- **Workflow:** No change to stage advance / send-back / lock rules. Recommendation is never required — Submit is not gated on it.
- **Score math:** Uses the existing SSOT `computeFinalScore` in `src/lib/annualReview/finalScore.ts` with `responsesByRole` populated only from `is_locked` rows. Renormalisation is already built-in, so partial chains produce a valid projected number.
- **UI:** Two additions on the reviewer detail page — one read-only card above the criteria matrix, one textarea below the criteria matrix. No layout shift on Self/Manager/Skip/HR views.
- **Regression risk:** Low. New card is additive; recommendation reuses the existing draft/flush/persist path that already handles arbitrary `qualitative_responses` keys.
- **Scalability:** Pure client-side derivation from data already fetched (`useInstanceResponses`, `useResolvedSystemScores`). No new queries.
- **Rollback:** Delete the two new components and their two mount points in `TeamReviewDetailContent.tsx`. Reserved JSONB key is ignorable.

## Design

### 1. Running blended annual score card
- New SSOT helper `src/lib/annualReview/runningFinalScore.ts` — thin wrapper around `computeFinalScore`:
  ```
  computeRunningFinalScore({ instance, template, responses, resolvedSystemScores })
    → { score_0_100, scaled_0_5, contributing: StageWeightKey[], skipped: StageWeightKey[] }
  ```
  Rules:
  - `stageWeights = resolveStageWeights(instance, template)`
  - `responsesByRole[role] = response.weighted_score` **only when** `response.is_locked === true` (drafts must not leak into the projection).
  - `systemScoreTotal = Σ resolvedSystemScores` (already sums to a /100 contribution via `computeScoreComposition` semantics).
  - `criteriaWeightedScore` — pass `instance.criteria_weighted_score` for template-legacy configs, `null` otherwise.
  - Returns `contributing` (weight buckets that fed the number) and `skipped` (configured buckets still pending) so the card can render "3 of 5 stages counted".
- New component `RunningFinalScoreCard.tsx` — muted card with:
  - Big number `XX.X / 100` and 0..5 rating.
  - Small caption: `Based on N of M stages submitted so far. Pending: Skip, HR.` (Uses stage labels already in `TeamReviewDetailContent.tsx`.)
  - Info tooltip: *"Projected using the same weights HR will apply. Pending stages are re-normalised until they're submitted."*
  - Rendered **only** when `role === 'dept_head' || role === 'bu_head'` and at least one prior stage is locked.
- Mounted in `TeamReviewDetailContent.tsx` immediately after `AppraisalCompositionCard` (line ~295), before the criteria card.

### 2. Overall Recommendation textarea
- New component `OverallRecommendationCard.tsx`:
  - Label: "Overall recommendation (optional)".
  - Helper: "Shared with the next reviewer, HR, and the employee at acknowledgment. Do not include confidential HR-only notes."
  - Backed by `draft.qualitative_responses['__overall_recommendation']` via the existing setter pattern used by variance justifications. `flush()` persists it with the rest of the draft — no new mutation.
  - Read-only (grey card, no textarea) when `locked === true` or when viewing a stage that isn't yours; still renders so downstream reviewers/employee can see prior recommendations.
- Visibility matrix:
  - **Editable** on Dept Head + BU Head detail pages while unlocked.
  - **Read-only aggregate** on Skip / BU (when Dept already locked) / HR / employee acknowledgment view — renders one row per prior recommender: `Dept Head — Priya S. · <text>`.
- Mounted in `TeamReviewDetailContent.tsx` directly below the `SelfReviewFieldsCard` block (line ~346).

### 3. Employee acknowledgment surface
- `EmployeeResultsView.tsx` — append a "Recommendations" section listing each non-empty `__overall_recommendation` from responses in stage order. No edit affordance.

## Files touched
- **New**
  - `src/lib/annualReview/runningFinalScore.ts`
  - `src/lib/annualReview/runningFinalScore.test.ts` — locked-only filter, renormalisation, empty-chain returns null, dept+bu weights combined correctly, ignores drafts.
  - `src/components/annual-review/RunningFinalScoreCard.tsx`
  - `src/components/annual-review/RunningFinalScoreCard.test.tsx` — renders only for dept_head/bu_head, shows contributing/pending counts, hidden when no locked stage.
  - `src/components/annual-review/OverallRecommendationCard.tsx`
  - `src/components/annual-review/OverallRecommendationCard.test.tsx` — editable when unlocked owner, read-only aggregate otherwise, no submit gating.
- **Edited**
  - `src/components/annual-review/TeamReviewDetailContent.tsx` — two mount points, thread `responses` + `resolvedSystemScores` into the new card.
  - `src/components/annual-review/EmployeeResultsView.tsx` — recommendations read-only list.
- **SSOT sync**
  - `DOCUMENTATION.md` — new §Annual Review — Dept/BU Reviewer Aids.
  - `POLICY.md` — new §AR-RUNNING-FINAL-SCORE ("BU/Dept reviewers may see a projected final score derived from locked prior stages; drafts must never leak.") and §AR-OVERALL-RECOMMENDATION ("Recommendation is per-reviewer, optional, visible to downstream reviewers and employee; never mandatory; never gates submit.").
  - Memory update to `mem/features/annual-review/overview.md` documenting the reserved JSONB key `__overall_recommendation`.

## Tests
Freeze `Date.now()`; use fixture responses covering (a) only Self locked, (b) Self+Mgr locked, (c) Self+Mgr+Skip+Dept locked, (d) no locks yet. Assert:
- `computeRunningFinalScore` matches `computeFinalScore` when the same buckets are supplied.
- Drafts (`is_locked=false`) are ignored.
- Card hides when zero locked stages.
- Recommendation persists via `flush`, appears read-only to later stages.

## Post-implementation verification
- Playwright: log in as a BU Head test user, open a queued instance, screenshot the new card + textarea, submit with recommendation, re-open as HR to confirm read-only display.
- Manual DB read to confirm `qualitative_responses -> '__overall_recommendation'` is set on the BU Head response row.
