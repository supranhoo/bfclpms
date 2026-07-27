## Verified current state

- Recommendations are stored in `annual_review_responses.qualitative_responses->>'__overall_recommendation'` (key `RECOMMENDATION_KEY` in `OverallRecommendationCard.tsx`). Confirmed by query: 456 dept_head, 887 bu_head, 1 management rows carry a non-empty recommendation.
- `get_annual_review_comprehensive_report` aggregates only `r.notes` per stage into `*_comment`, and never touches `qualitative_responses` — confirmed by reading the function source. So the recommendation text is genuinely absent from both the on-screen report and `ComprehensiveExport.ts`.
- Existing `*_comment` columns are stage *notes* — a different field; they must stay untouched.

## Assumptions

- "Recommendations" = the Overall Recommendation authored on the review form by Dept Head, BU Head and Management (roles in `RECOMMENDATION_ROLES`).
- Read-only reporting change; no scoring, workflow or RLS change.

## Risk & impact

- Data impact: none. Migration only widens the RPC return type (columns appended at the end, existing positions unchanged). No schema/RLS/grant change.
- Workflow/UI: three new columns in the Comprehensive export and a recommendation display in the report row detail. No layout break — columns append after the existing comment columns.
- Regression risk: low; the only cross-cutting edits are the RPC signature and the `ComprehensiveRow` type. Rollback = restore the previous RPC definition and drop the new columns.
- Scalability: same single aggregate scan; three extra `MAX(... ) FILTER` expressions on the already-grouped CTE.

## Plan

1. **Migration (additive)** — `CREATE OR REPLACE FUNCTION get_annual_review_comprehensive_report` adding three trailing return columns `dept_head_recommendation`, `bu_head_recommendation`, `management_recommendation`, each `MAX(NULLIF(btrim(r.qualitative_responses->>'__overall_recommendation'),''))  FILTER (WHERE r.reviewer_role = '<role>')` in the existing `stage_data` CTE. Everything else unchanged.

2. **Type** — add the three optional fields to `ComprehensiveRow` in `src/services/annualReview/comprehensiveReport.ts`.

3. **Export** — in `src/components/reports/annual-review/ComprehensiveExport.ts`, add `Dept Head Recommendation`, `BU Head Recommendation`, `Management Recommendation` to the Employees sheet, placed right after the corresponding `... Comments` columns so notes and recommendation sit together. Blank when absent.

4. **On-screen report** — surface the same three values in `ComprehensiveTab.tsx` (in the existing per-row detail/RCA panel rather than as three wide grid columns, to avoid squeezing the table). A short truncated preview with full text on hover/expand.

5. **Tests** — extend `src/services/annualReview/comprehensiveReportRca.test.ts` (or a new small test beside the export) covering: recommendation present → column populated; empty/whitespace → blank; role with no response → blank; existing column order preserved.

6. **Docs/memory** — ADR-182 in `DOCUMENTATION.md`, `POLICY §RPT-RECOMMENDATION-COLUMNS` in `POLICY.md`, and extend `mem://features/reports/score-map-readability` / add `mem://features/reports/recommendation-columns`.

## Open question (answer changes step 4 only)

If you'd rather see the recommendations as visible grid columns in the report table (not just in the row detail), say so and I'll make them toggleable columns instead.
