---
name: Report Score Map Readability
description: Annual Review report renders criteria/system score maps as "Name: score | ..." via criteriaScoreLabels.ts, never raw id-keyed JSON
type: feature
---
ADR-180 / POLICY §RPT-SCORE-MAP-READABLE. `src/services/annualReview/criteriaScoreLabels.ts` is the SSOT: `fetchTemplateLabelMaps(templateIds)` batches one `annual_review_templates` query and builds ordered id→name maps from `sections.criteria[]` and `sections.system_scores[]`; `formatScoreMap(scores, labelMap)` renders `Quality: 4 | Attendance: 5`, preserves the template's authored order, appends unknown keys with their raw id (never drops scores after a template swap), returns `''` for empty input, and trims decimals to 2 dp. `ComprehensiveExport.downloadComprehensiveWorkbook` is async because of the label fetch; the sheet column `System Scores (raw)` was renamed to `System Scores`. Never emit `JSON.stringify` of an id-keyed score map in any report.
