## Change

Add per-reviewer **Overall Recommendation** columns to Sheet 1 ("Status Overview") of the Operational Status Report.

## Columns to add (Sheet 1)

One text column per recommendation-capable stage, appended after the existing per-stage submitted-at/score block:

- `Dept Head Recommendation`
- `BU Head Recommendation`

(Per `RECOMMENDATION_ROLES` in `OverallRecommendationCard.tsx`, only `dept_head` and `bu_head` author recommendations. Self / Manager / Skip / HR do not — so no empty columns.)

Values pulled from `annual_review_responses.qualitative_responses[__overall_recommendation]` using the exported `RECOMMENDATION_KEY` constant. Empty string when absent (no "N/A" filler, so ops can sort/filter blanks to find "who hasn't given a recommendation yet").

## Technical details

**Edited files:**
- `src/services/annualReview/operationalReport.ts`
  - Import `RECOMMENDATION_KEY`, `RECOMMENDATION_ROLES` from `@/components/annual-review/OverallRecommendationCard`.
  - Extend the responses map already built for Sheet 2 to also index `qualitative_responses[RECOMMENDATION_KEY]` by `(instance_id, reviewer_role)`.
  - Append the two headers to the Sheet 1 header array and emit corresponding cell values per row.
- `src/services/annualReview/operationalReport.test.ts`
  - New test: Sheet 1 contains `Dept Head Recommendation` / `BU Head Recommendation` headers and populated values from a fixture with recommendations set on both stages and blank on manager/self.

**Not touched:** Sheet 2 (per-criterion responses), other exports, DB, RLS. No new query — reuses the responses batch already fetched for Sheet 2. No pagination change.

## Risk

- Data: read-only, no schema change.
- Regression: existing header-shape test updated in the same patch.
- Scale: zero extra DB calls; two extra string cells per row.
