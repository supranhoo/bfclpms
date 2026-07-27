## Goal

In the Annual Review comprehensive report export, the columns **"Criteria Scores (final reviewer)"** and **"System Scores (raw)"** currently dump raw JSON keyed by internal IDs (`crit_1kh5259`, `crit_zi0lvui`, …), which is unreadable. Replace both with a single readable text column each, using the authored names from each employee's template.

## Verified current state

- `src/components/reports/annual-review/ComprehensiveExport.ts` writes both columns as `JSON.stringify(...)` of `r.terminal_criteria_scores` / `r.system_scores`.
- `ComprehensiveRow` (`src/services/annualReview/comprehensiveReport.ts`) already carries `template_id`, `system_scores`, `terminal_criteria_scores`. The RPC returns `template_id` and `template_name`.
- These columns exist only in the Excel export; `ComprehensiveTab.tsx` does not render them today.

## Approach

1. **Label resolver (new, pure + testable)** — `src/services/annualReview/criteriaScoreLabels.ts`
   - `fetchTemplateLabelMaps(templateIds: string[])`: one batched query on `annual_review_templates` (id, sections) → per-template `Map<criterionId, name>` and `Map<systemScoreId, label>` built from `sections.criteria[]` and `sections.system_scores[]`.
   - `formatScoreMap(scores, labelMap)`: pure formatter returning `"Safety: 4 | Quality: 4 | Attendance: 5 | …"`, preserving the template's authored criterion order first, then any unmatched keys appended with their raw id (so nothing is silently dropped when a template was swapped). Returns `''` for empty/null input.
   - Numbers rendered as-is (integers plain, decimals to 2 dp max).

2. **Export wiring** — `ComprehensiveExport.ts`
   - `downloadComprehensiveWorkbook` becomes async (or accepts a prefetched `labelMaps` input) so the template labels are fetched once before building the Employees sheet.
   - `'Criteria Scores (final reviewer)'` → `formatScoreMap(r.terminal_criteria_scores, criteriaLabels[r.template_id])`.
   - `'System Scores (raw)'` → renamed to `'System Scores'` and rendered via `formatScoreMap(r.system_scores, systemLabels[r.template_id])`.
   - Fallback: if a template is missing/unreadable, fall back to the raw key name (e.g. `crit_1kh5259: 4`) rather than JSON — never blank out data.
   - Update the export caller (`ComprehensiveTab.tsx`) for the async signature, with the existing loading/toast pattern and an error toast on fetch failure.

3. **Tests** — `src/services/annualReview/criteriaScoreLabels.test.ts`
   - Named criteria map to labels in template order.
   - Unknown keys fall back to the raw id and are appended, not dropped.
   - Empty / null / `{}` input yields `''`.
   - System-score labels resolve from `sections.system_scores`.

4. **Docs** — ADR entry (ADR-180 — Report score-map humanisation) in `DOCUMENTATION.md`, a `POLICY.md` note under report readability, and a memory entry.

## Technical notes

- Data impact: none — read-only presentation change, no schema/RPC/RLS change.
- Scalability: labels fetched with a single `in ('id', [...])` query over the distinct `template_id` values on the loaded rows (typically <30), memoised per export.
- Regression risk: low; only the export sheet changes. The async signature change is the only call-site edit.
- Rollback: revert the two column expressions to `JSON.stringify`.
