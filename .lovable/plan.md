# Fix: `__overall_recommendation` shown as a criterion row

## What's wrong
In the read-only review-form viewer, the reserved key `__overall_recommendation`
appears as a fake criterion row ("__overall_recommendation" with "—" scores), and the
reviewer's recommendation prose is only reachable through a small speech-bubble tooltip
that is cut off at the right edge of the dialog, so the text can't be read.

Confirmed cause: `buildStageBlocks` (`src/lib/annualReview/reviewFormView.ts`) builds
criterion ids from `criteria_scores` + `qualitative_responses` keys and only filters out
`self_review_fields`. `RECOMMENDATION_KEY` (`__overall_recommendation`) lives in the same
`qualitative_responses` map, so it leaks into the matrix as a pseudo-criterion.

## The fix
1. Filter the reserved key out of criteria in `buildStageBlocks`, and surface it as a
   first-class field on `StageBlock`: `recommendation: string | null`.
2. In `StageComparisonTable`, add an "Overall recommendation" footer row next to the
   existing "Overall remark" row — full-width wrapped text (`whitespace-pre-wrap`,
   left-aligned, top-aligned), no tooltip. Falls back to "—" when the stage gave none.
3. Also allow the criterion-remark tooltips to flip/shift so they can never render
   off-dialog (collision padding + `side="left"` where space is tight).

Result for the screenshot: the "__overall_recommendation" row disappears; the BU Head's
"I recommend him for..." text is readable in full inside the table.

## Technical notes
- `RECOMMENDATION_KEY` is re-exported for the builder from a constants-safe import so
  `reviewFormView.ts` (pure module) stays free of React imports.
- Presentation + pure-builder change only. No RPC, RLS, schema or scoring change.
- Stage score values (e.g. 325.00) are out of scope here — unchanged.

## Risk & impact
- Data: none (read-only view).
- Workflow: none.
- UI/UX: one fake row removed, one readable row added in the matrix footer.
- Regression: low; isolated to the viewer. Existing recommendation capture
  (`OverallRecommendationCard`, ADR-226 queue) untouched.
- Rollback: revert the two files.

## Tests
`src/lib/annualReview/reviewFormView.test.ts` — asserts the reserved key never appears in
`buildStageMatrix().rows`, and that `recommendation` is populated per stage (including a
stage with none).

## Docs
New `docs/adr/ADR-218j.md`; DOCUMENTATION.md + POLICY.md §AR-RECOMMENDATION-TRACKING note
that the narrative is rendered as a dedicated row, never as a criterion.
