## Fix

In `src/components/annual-review/EmployeeResultsView.tsx` line 129, change `ratingOutOf5.toFixed(1)` to `ratingOutOf5.toFixed(2)` so the "≈ 4.6 / 5" display becomes "≈ 4.58 / 5" (matches the two-decimal convention already used in `RunningFinalScoreCard`, `HrFinalizationSheet`, `AppraisalCompositionCard`, `SelfReviewSummaryDialog`, `TeamReviewDetailContent`, and `EmployeeAnnualReview`).

Presentation-only, one-line change. No logic, schema, RLS, or policy impact.