## Goal

Every place that today shows a raw stage `weighted_score` on the template's own scale (e.g. `255.0` for `test003 / Self` because criteria weights sum to 85) will instead show a **rating on a 1–5 scale** derived from the template, formatted as **`3.0`** (single decimal).

Storage in `annual_review_responses.weighted_score` does NOT change — this is a pure presentation layer normalisation. Auditability of the raw number is preserved.

## Validation recap (done in previous turn)

- Template `test003` criteria weights sum to **85** (attendance 15 + safety 20 + quality 20 + teamwork 20 + tools 10); system scores sum to 15 → template grand total = 100.
- SSOT scoring formula in `src/lib/annualReview/scoring.ts::computeCriteriaScore`:
  `weighted_score = Σ(weight × selected_score)`; `max = Σ(weight × 5)`.
- Self response `{attendance:5, safety:5, quality:4}` → `15·5 + 20·5 + 20·4 = 255`. ✓ Matches DB, matches PL/pgSQL `compute_annual_review_weighted_score`. Nothing is broken in the calc or the server↔client parity.
- The confusion is purely display: `255` is on a 0–425 scale that shifts per template. A `/5` rating is template-independent.

## Rating formula (new SSOT helper)

```
rating_0_5 = weighted_score / (Σ criteria weights × 5) × 5
           = weighted_score / Σ criteria weights          // algebraic simplification
```

Restricted to criteria whose `reviewer_stages` include the row's `reviewer_role` (same filter the SQL helper uses). Returns `null` when the weight sum is 0 or the score is null. Verified example: `255 / 85 = 3.0`.

## Risk & Impact Report

- **Data:** none. No schema, no RLS, no RPC, no migration. `weighted_score` stays canonical in `annual_review_responses`.
- **Workflow:** none. Advance / send-back / final-score composition unchanged (`computeFinalScore` continues to consume the raw `weighted_score`).
- **UI/UX:** column values change from e.g. `255.0` → `3.0`. Column headers get a `/5` suffix so intent is unambiguous. Layout unchanged.
- **Regression risk:** low, contained to read-only presentation. `finalScore.ts`, `runningFinalScore.ts`, `advance_annual_review_status`, and every write path are untouched. Only 4 read sites are edited; each already has null/`—` handling.
- **Scalability:** O(1) per row; template lookup already batched via `templatesById` in Admin, hydrated from `template` join on the response elsewhere.
- **Mitigation:** unit tests around the new helper (parity with existing `computeCriteriaScore`), snapshot expectations updated in `exports.test.ts`, no changes to migration or RPC layer.
- **Rollback:** revert the presentation edits — the raw `weighted_score` is still there.

## Implementation plan

### 1. Add SSOT helper (single source of truth)

`src/lib/annualReview/scoring.ts`:

```ts
export function computeCriteriaRatingOutOf5(
  criteria: TemplateCriterion[],
  weightedScore: number | null | undefined,
  reviewerRole: AnnualReviewerRole,
): number | null;
```

- Sums the weights of criteria whose `reviewer_stages` include `reviewerRole` (matches SQL filter, matches `computeCriteriaScore`).
- Returns `weightedScore / weightSum` (equivalent to `weightedScore / (weightSum·5) · 5`).
- Returns `null` for empty inputs, weightSum ≤ 0, or non-finite score.

### 2. Update read-only presentation sites (only these four)

| File | Line region | Change |
|---|---|---|
| `src/pages/annual-review/AnnualReviewAdmin.tsx` | ~800–835 (main grid) and ~1186 (blended composition section) | For each of `Self / Manager / Skip / Dept / BU / HR` cells, format via `computeCriteriaRatingOutOf5(template.criteria, ss.<role>, <role>)`. Headers become `Self /5`, `Manager /5`, `Skip /5`, `Dept /5`, `BU /5`, `HR /5`. `fmt(v)` becomes `v.toFixed(1)` for rating values. Final and Rating columns unchanged (already /5-aware). |
| `src/components/annual-review/EmployeeResultsView.tsx` | 88, 138 | Per-stage cell (line 138) shows `/5` rating. Criteria-weighted summary (line 88) is annotated `(raw · /Σw = X.X /5)` to preserve auditability without confusion. |
| `src/services/annualReview/exports.ts` | 67, 93, 118 + per-role columns emitted around AnnualReviewAdmin lines 291–296 | Rename export columns `Self Score` → `Self Score (/5)` (same for manager/skip/dept/bu/hr) and emit the rating value. Add a companion `Self Weighted (raw)` column (optional, grouped after ratings) so the auditor's raw number is not lost. `Criteria Weighted Score` column is preserved. |
| `src/components/annual-review/TeamReviewDetailContent.tsx` | Any inline weighted_score display, if surfaced | Route through the same helper. `RunningFinalScoreCard` already uses `scaled_0_5.toFixed(2)` — no change. |

### 3. Tests + docs

- `src/test/annualReview/scoring.test.ts` — add cases:
  - Empty criteria → null.
  - `test003` fixture (weights 15/20/20/20/10, scores {a:5,s:5,q:4}) → `weighted 255`, `rating 3.0`.
  - Reviewer-role filter — criterion not visible to that role does not count in the denominator.
- `src/services/annualReview/exports.test.ts` — snapshot updated headers + values.
- `DOCUMENTATION.md` §Annual Review — document display convention (`/5 rating derived; raw weighted_score is canonical storage`).
- `POLICY.md` — new subsection §AR-STAGE-RATING-DISPLAY: reviewer stage scores are shown to users on a normalised 0–5 scale; raw weighted_score remains the immutable stored value and the sole input to `computeFinalScore`.
- `mem/features/annual-review/overview.md` — one-line note under scoring bullet.

### 4. Version log

Bump `DOCUMENTATION.md` version, add changelog entry: “Admin Progress + exports show per-stage rating as X.X / 5 instead of raw weighted sum; storage unchanged.”

## Verification checklist (post-implementation)

1. `test003 / Self` in `/annual-review/admin` shows `3.0` (was `255.0`).
2. Sort order on that column now sorts by rating (equivalent to raw for a fixed template, but consistent across mixed templates).
3. Export workbook: `Self Score (/5)` column contains `3.0`; raw column, if included, contains `255`.
4. `RunningFinalScoreCard` and `EmployeeResultsView` show consistent `/5` ratings for every stage present.
5. `computeFinalScore` outputs (Final, Rating columns) numerically unchanged before/after.
6. `pnpm vitest run` green, including new cases and `exports.test.ts` snapshot.

## Not in scope

- Any change to the SQL `compute_annual_review_weighted_score` or `advance_annual_review_status` RPC.
- Any change to `computeFinalScore` / `runningFinalScore` math.
- HR final rating column (already `/5`).
- Historical data backfill — not needed, presentation-only.
