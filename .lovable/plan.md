# Criterion-level gap report (Excel) — column headings for review

Rebuild the blast-radius workbook so that **each criterion question is its own row**, with the rating given at each stage side by side and an explicit flag for what is missing.

## Proposed column headings (please review before I generate)

| # | Column | Meaning |
|---|--------|---------|
| 1 | Employee Code | e.g. 100652 |
| 2 | Employee Name | Ajay Bedia |
| 3 | Designation | From profile |
| 4 | Business Unit | Resolved via department |
| 5 | Department | |
| 6 | Instance ID | Annual review instance (traceability) |
| 7 | Review Status | completed / pending_* / excluded |
| 8 | Template | Effective template (override honoured) |
| 9 | Criteria Question | Criterion name, one row each |
| 10 | Weight (%) | Criterion weight |
| 11 | Self Rating | Score in the `self` response |
| 12 | HOD Rating | Score in the `dept_head` response |
| 13 | BU Rating | Score in the `bu_head` response |
| 14 | Missing Rating At | Comma list of the stages that were required but left unscored, e.g. `BU`. Blank when complete |
| 15 | Missing Count | 0–3 |
| 16 | Points At Risk | Weight x 5 for each missing stage |
| 17 | Self Reviewer / HOD Reviewer / BU Reviewer | Named person on each stage |
| 18 | Self / HOD / BU Submitted At | Submission timestamps |

Notes on the logic:
- A stage column shows a rating only when that stage is **required** for the criterion (the criterion's `reviewer_stages` includes it). If the stage is not applicable, the cell reads `n/a` and never counts as missing.
- "Missing" is only counted for **locked/submitted** stage responses — an unsubmitted stage is pending, not a gap.
- Manager / Skip / HR / Management stages are excluded from the columns per your spec, but I can add them if you want the full matrix.

## Sheets in the workbook
1. **Summary** — totals: rows, employees, instances, gaps by stage, total points at risk.
2. **Criterion Detail** — the row-per-criterion grid above (only rows for instances in the affected set).
3. **Missing Only** — filtered view containing just the rows where a required rating is absent.

## Technical approach
- Single read-only SQL over `annual_review_templates` (criteria unnested), `annual_review_instances`, `annual_review_responses`, `profiles`, `departments`, `business_units`.
- Export to `/mnt/documents/annual-review-criterion-ratings.xlsx` with openpyxl: bold white-on-navy headers, frozen header row, auto-sized columns, red fill on rows with a missing rating.
- No application code, schema, or RLS change — read-only reporting artefact only.

Confirm the headings (or tell me what to add/drop, e.g. include Manager/HR stages, or restrict to the 109 affected instances vs. all instances in the cycle) and I will generate the file.
