

# Reports Overhaul — Full Workflow Alignment

## Problem Summary

The reports were built assuming a fixed 6-stage pipeline (KRA Set, Self, Manager, Audit, Management, Approved). The system now supports 11 workflow templates with up to 8 stages, including Skip-Level and HR PMS. Several reports are missing these stages entirely, showing incomplete or misleading data.

## Audit Results — Report-by-Report

| Report | Status | Issues Found |
|---|---|---|
| KPI Detail Report | OK | Already has all 6 score columns |
| KRA Issuance | OK | Already has all 8 status counts |
| Query Report | OK | Not stage-dependent |
| TNI Report | OK | Not stage-dependent |
| Issues Report | OK | Not stage-dependent |
| Audit Trail Report | OK | Shows raw audit actions |
| Monthly Scorecard | BROKEN | Table columns hardcoded to Self/Manager/Auditor/Mgmt — missing Skip-Level and HR PMS columns entirely |
| Performance Report | BROKEN | Score fallback chain skips `skip_level_score` and `hr_pms_score` |
| Employee Performance Summary | BROKEN | Score fallback chain skips `skip_level_score` and `hr_pms_score`; Status labels/colors missing Skip-Level and HR PMS |
| Completion Report | PARTIALLY BROKEN | Stage tracking logic works but chart only shows "Self Review" / "Manager Review" / "Approved" — does not visualize intermediate stages |
| Department Report | BROKEN | Status breakdown hardcoded to 6 statuses — missing `skip_level_check` and `hr_pms_review` counts |
| PDF Export Library | BROKEN | `KpiDetail` interface has no skip_level/hr_pms fields; PDF table renders only Self/Manager/Auditor/Mgmt columns |

## Files to Modify (7 files)

| File | Change Summary | Risk |
|---|---|---|
| `src/pages/reports/MonthlyScorecardReport.tsx` | Add Skip-Level and HR PMS score columns to table and scorecard computation; fetch missing fields from `review_submissions` | Medium |
| `src/pages/reports/PerformanceReport.tsx` | Fix score fallback chain to include `skip_level_score` and `hr_pms_score` | Low |
| `src/pages/reports/EmployeePerformanceSummary.tsx` | Fix score fallback chain; add missing status labels and colors for `skip_level_check` and `hr_pms_review` | Low |
| `src/pages/reports/CompletionReport.tsx` | Add Skip-Level and HR PMS as distinct tracking stages in period data and chart bars | Low |
| `src/pages/reports/DepartmentReport.tsx` | Add `skip_level_check` and `hr_pms_review` to status breakdown object and Excel export | Low |
| `src/lib/pdfExport.ts` | Add `skipLevelScore/Rating/Remarks` and `hrPmsScore/Rating/Remarks` to `KpiDetail` interface; add columns to PDF table and detailed card pages | Medium |
| `DOCUMENTATION.md` | Version bump to 1.45.35, document report alignment | None |

## Detailed Changes Per File

### 1. MonthlyScorecardReport.tsx

**Current**: Fetches and displays only Self, Manager, Auditor, Management scores.
**Fix**:
- Add `skip_level_score`, `skip_level_rating`, `skip_level_remarks`, `hr_pms_score`, `hr_pms_rating`, `hr_pms_remarks` to the `review_submissions` select query
- Add `avgSkipLevelScore` and `avgHrPmsScore` to the scorecard computation
- Add `weightedSkipLevelScore` and `weightedHrPmsScore` accumulators
- Add "Skip-Level" and "HR PMS" columns to the table header and body (between Manager and Auditor)
- Update `EmployeeScorecard` interface in `pdfExport.ts` to include these new averages
- Update Excel export to include the new columns

### 2. PerformanceReport.tsx

**Current**: Rating distribution uses `final_rating || manager_rating || self_rating` — skips intermediate stages.
**Fix**:
- Update rating fallback chain to: `final_rating || management_rating || auditor_rating || hr_pms_rating || skip_level_rating || manager_rating || self_rating`
- Update score fallback in category performance to match the chain already used in KPI Detail Report: `final_score ?? management_score ?? auditor_score ?? hr_pms_score ?? skip_level_score ?? manager_score ?? self_score`

### 3. EmployeePerformanceSummary.tsx

**Current**: Score fallback is `final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score`. Missing two stages. Status maps have only 6 entries.
**Fix**:
- Insert `hr_pms_score` and `skip_level_score` into the fallback chain (matching the authoritative chain from architecture memory)
- Fetch `skip_level_score` and `hr_pms_score` in the review_submissions select
- Add `skip_level_check` and `hr_pms_review` to `STATUS_COLORS` and `STATUS_LABELS` maps
- Add priority values for these statuses in `getStatusPriority`

### 4. CompletionReport.tsx

**Current**: Tracks Self Review, Manager Review, and Approved. Does not distinguish intermediate stages.
**Fix**:
- Add `skipLevelReviewed` and `hrPmsReviewed` counters to period tracking
- Track KPIs at `skip_level_check` and `hr_pms_review` statuses
- Add "Skip-Level" and "HR PMS" as separate bars in the chart
- Add columns to the table

### 5. DepartmentReport.tsx

**Current**: `statusBreakdown` object has 6 keys — missing `skip_level_check` and `hr_pms_review`.
**Fix**:
- Add `skip_level_check: deptKpis.filter(...)` and `hr_pms_review: deptKpis.filter(...)` to the breakdown
- Add these to Excel export columns
- No table display change needed (table shows summary, not per-status breakdown)

### 6. pdfExport.ts (PDF Library)

**Current**: `KpiDetail` interface has Self, Manager, Auditor, Management, Final fields. PDF renders a 4+1 column KPI summary table.
**Fix**:
- Add to `KpiDetail` interface:
  - `skipLevelAchieved`, `skipLevelScore`, `skipLevelRating`, `skipLevelRemarks`, `skipLevelEvidence`
  - `hrPmsAchieved`, `hrPmsScore`, `hrPmsRating`, `hrPmsRemarks`, `hrPmsEvidence`
- Add to `EmployeeScorecard` interface:
  - `avgSkipLevelScore`, `avgHrPmsScore`
- Update KPI Summary Table (Page 2) to include Skip-Level and HR PMS columns
- Update Detailed Review Cards (Pages 3+) to show Skip-Level and HR PMS review sections in the 2x2 grid (expand to 3x2 layout)
- Update `generateBulkScorecardPdf` summary table headers

### 7. DOCUMENTATION.md

- Version bump to 1.45.35
- Add section documenting that all reports now use the full authoritative score chain: `Final > Management > Auditor > HR PMS > Skip-Level > Manager > Self`

## Standardized Score Fallback Chain

All reports will use this single consistent chain (matching the architecture memory):

```
final_score
  ?? management_score
  ?? auditor_score
  ?? hr_pms_score
  ?? skip_level_score
  ?? manager_score
  ?? self_score
```

This matches the authoritative chain already documented and used in KPI Detail Report.

## What Will NOT Change

- KPI Detail Report (already complete)
- KRA Issuance Report (already complete)
- Query Report (not stage-dependent)
- TNI Report (not stage-dependent)
- Issues Report (not stage-dependent)
- Audit Trail Report (shows raw actions)
- No database changes required
- No routing changes required

## Expected Outcome

| Report | Before | After |
|---|---|---|
| Monthly Scorecard table | 4 score columns | 6 score columns (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt) |
| Monthly Scorecard PDF | 4 review stages | 6 review stages |
| Performance Report rating dist. | Skips HR PMS/Skip-Level scores | Uses full authoritative chain |
| Employee Summary fallback | Skips 2 stages | Complete 7-stage chain |
| Employee Summary status labels | Missing 2 statuses | All 8 statuses labeled |
| Completion Report chart | 3 stage bars | 5+ stage bars |
| Department Report breakdown | 6 status counts | 8 status counts |
| Excel exports | Missing columns | All stages included |

