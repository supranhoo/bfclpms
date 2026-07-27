---
name: Annual Review report — reviewer recommendations
description: Dept Head / BU Head / Management "Overall Recommendation" surfaced in the Annual Review report and Excel export (ADR-182)
type: feature
---

POLICY §RPT-RECOMMENDATION-COLUMNS (ADR-182).

- Recommendation text = `annual_review_responses.qualitative_responses->>'__overall_recommendation'`
  (`RECOMMENDATION_KEY` in `OverallRecommendationCard.tsx`). It is NOT `notes` —
  the report's `* Comment` columns map to `notes` and are a separate field.
- Exposed by `public.get_annual_review_recommendations(p_cycle_id)`, a companion
  read-only RPC reusing the same `annual_review_directory_access` scope
  (all / bu / team) as `get_annual_review_comprehensive_report`.
- `src/services/annualReview/recommendationColumns.ts` = SSOT
  (`fetchRecommendations`, pure `indexRecommendations` / `mergeRecommendations`).
- `fetchComprehensiveReport` merges recommendations onto every row, so grid,
  RCA panel and export share one source; fetch failure degrades to blank.
- Export columns: `Dept Head Recommendation`, `BU Head Recommendation`,
  `Management Recommendation`, each beside the matching stage comment column.
- UI: "Recommendations" section in the ComprehensiveTab single-employee RCA panel.
- Tests: `src/services/annualReview/recommendationColumns.test.ts`.
