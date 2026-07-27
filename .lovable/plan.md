## Answer to "will this show all or only few?"

All of them. `formatScoreMap` iterates the template's authored order first and then appends every remaining key in the stored map, so nothing is dropped — a 15-key map renders 15 `Name: score` pairs in one cell. Two caveats worth knowing:

- If a criterion id isn't in the employee's template (e.g. after a template swap), it still appears, but labelled with its raw id (`crit_zi0lvui: 5`) rather than a name.
- "Criteria Scores (final reviewer)" is by definition only the terminal reviewer's score map, not every stage's.

## Verified current state (eligibility)

- `annual_review_templates.sections.eligibility_criteria[]` holds the questions (`id`, `name`, `type`, `operator`, `expected_value`); values live in `annual_review_instances.eligibility_inputs` (jsonb).
- `get_annual_review_comprehensive_report` does **not** return `eligibility_inputs` (confirmed by inspecting the function source), and `ComprehensiveRow` has no such field. The export's current `Eligibility` column is only the `Eligible / Excluded` flag.
- Pure formatters already exist and are reusable: `evaluateEligibility` (`src/lib/annualReview/eligibility.ts`) and `formatExpected` / `formatActual` (`src/lib/annualReview/eligibilityFormat.ts`).

## Approach — one column per eligibility question, with expected + pass/fail

1. **RPC (additive)** — new migration replacing `get_annual_review_comprehensive_report` to also return `eligibility_inputs jsonb`. No schema, RLS or grant change; column appended at the end of the return type so nothing existing shifts. Add `eligibility_inputs?: Record<string, unknown> | null` to `ComprehensiveRow`.

2. **New SSOT module** — `src/services/annualReview/eligibilityReportColumns.ts`
   - `fetchTemplateEligibilityMaps(templateIds)`: extend the existing batched `annual_review_templates` fetch (same query already used by `criteriaScoreLabels.ts`) to also build per-template ordered `EligibilityCriterion[]`.
   - `buildEligibilityColumnSet(rowsWithTemplates)`: the **union** of criteria across every template in the cycle, de-duplicated by normalised question name, in first-seen template order → stable column list.
   - `formatEligibilityCell(criterion, value)`: renders `3 (At most 5) — Pass`, using `formatActual` + `formatExpected` + `evaluate` so the pass/fail verdict is the same logic the app uses. Missing value → `— (At least 6) — Not provided`.
   - Column header = the authored question name (raw, no id).

3. **Export wiring** — `ComprehensiveExport.ts`
   - Fetch eligibility maps alongside the existing label maps in `downloadComprehensiveWorkbook` (single extra field on the same query, no extra round-trip).
   - Spread the per-question columns into each Employees-sheet row, placed immediately after the existing `Eligibility` column.
   - Keep the current `Eligibility` (Eligible/Excluded) column unchanged, and add an `Eligibility Result` column = `Pass` / `Fail (Absent Days, Tenure)` summarising the failing question names.
   - Employees whose template has no eligibility criteria get blank cells for those columns.

4. **Tests** — `src/services/annualReview/eligibilityReportColumns.test.ts`
   - Union column set across two templates with an overlapping question yields one column.
   - Value + expected + verdict string for numeric, boolean and missing values.
   - Boolean criteria render Yes/No, never `true/false` or raw operators.
   - Fail summary lists only failing question names; all-pass → `Pass`.

5. **Docs / memory** — ADR-181 in `DOCUMENTATION.md`, `POLICY §RPT-ELIGIBILITY-COLUMNS` in `POLICY.md`, and a memory entry extending `mem://features/reports/score-map-readability`.

## Technical notes

- Data impact: none — read-only; the migration only widens the RPC return set.
- Scalability: column count = distinct eligibility questions in the cycle (typically <10); one batched template query already in the export path.
- Regression risk: low. The only cross-cutting edit is the `ComprehensiveRow` type and the RPC signature; existing columns keep their positions.
- Rollback: revert the RPC to the prior definition and drop the new column block from the Employees sheet.
