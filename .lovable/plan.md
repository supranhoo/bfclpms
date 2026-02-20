

# RCA: Monthly Scorecard Report — Jitendra Bharti Incorrect Data

## Database Verification

Jitendra Bharti has 13 December KPIs, all in `approved` status. His workflow is: Self -> Manager -> Auditor -> Approved (no Skip-Level, no HR PMS, no Management).

| KPI | Weight | Self | Manager | Auditor | Final |
|---|---|---|---|---|---|
| CLMS Implementation | 25% | 3.00 | 3.00 | 3.00 | 3.00 |
| All other 12 KPIs | 75% total | 5.00 | 5.00 | 5.00 | 5.00 |

Correct weighted average: (25x3 + 75x5) / 100 = **4.50 / 5.00 = 90%**

The database data is correct. The bugs are all in the report rendering.

## Bugs Found (5 issues)

### Bug 1 (Critical) — PDF "Total Score" shows nonsense point values

In `drawScoreSummaryBox` (pdfExport.ts lines 354-356):
```
maxScore = totalKpis * 5         // 13 * 5 = 65
earnedScore = avgFinalScore * totalKpis  // 4.5 * 13 = 58.5
```

Displays **"58.5 / 65.0 pts"** which is meaningless. The correct display should be the **weighted total score** (4.50 / 5.00) or the weighted percentage breakdown.

**Fix**: Change to show `(avgFinalScore / 5) * 100`% with the actual weighted score `avgFinalScore` out of `5.00`.

### Bug 2 (Critical) — PDF table missing "Self Score" column

The PDF KPI Performance Details table has columns:
`KPI Name | W | Target | Self Ach. | Mgr | Skip-L | HR PMS | Auditor | Final`

The "Self Ach." column shows **raw achieved values** (25, 0, 89, 100) while all other columns show **scores** (5.00, 3.00). This is extremely confusing — the user sees "100" under Self but "3.00" under Manager for the same KPI (CLMS).

**Fix**: Replace "Self Ach." with "Self" showing self_score. Add a separate "Achieved" column showing the achieved value, or move achieved to the "Target" column as "Target / Achieved".

### Bug 3 (Medium) — Score of 0 displays as dash (truthy check bug)

Both the UI table and PDF use truthy checks for score display:
```js
scorecard.avgSelfScore ? scorecard.avgSelfScore.toFixed(2) : '-'
kpi.managerScore ? formatScore(kpi.managerScore) : '-'
```

A score of `0` is falsy, so it renders as `-` instead of `0.00`. Per the architecture, **zero is valid data** and must be preserved.

**Fix**: Change all truthy checks to null checks: `scorecard.avgSelfScore != null ? ... : '-'` and `kpi.managerScore != null ? ... : '-'`

### Bug 4 (Low) — Bulk PDF forces 0.00 for missing workflow stages

In `generateBulkScorecardPdf` (line 1474):
```js
formatScore(sc.avgSkipLevelScore ?? 0)  // Shows "0.00" instead of "-"
```

For employees without Skip-Level in their workflow, this shows `0.00` instead of `-`, implying they were scored zero when the stage doesn't exist.

**Fix**: Use null check: `sc.avgSkipLevelScore != null ? formatScore(sc.avgSkipLevelScore) : '-'`

### Bug 5 (Maintenance) — Entire PDF generation duplicated

`generateDetailedScorecardPdf` (lines 858-1139) and `generateDetailedScorecardPdfBlob` (lines 1145-1395) are 100% copy-pasted with only the final line different (save vs return blob). Any bug fix must be applied twice.

**Fix**: Extract shared logic into a private `buildDetailedScorecardDoc` function that returns the jsPDF doc. Both public functions call it, then either save or return blob.

## Files to Modify (3 files)

| File | Changes | Risk |
|---|---|---|
| `src/lib/pdfExport.ts` | Fix Total Score calculation; add Self Score column to PDF table; fix truthy checks; fix bulk PDF null handling; eliminate code duplication | Medium |
| `src/pages/reports/MonthlyScorecardReport.tsx` | Fix truthy checks in UI table for score display (0 shows as `-`) | Low |
| `DOCUMENTATION.md` | Version bump to 1.45.36 | None |

## Detailed Changes

### pdfExport.ts

1. **Create `buildDetailedScorecardDoc` private function** — move the shared PDF generation logic (pages 1-3+) into one function returning `jsPDF`. Both `generateDetailedScorecardPdf` and `generateDetailedScorecardPdfBlob` become 3-line wrappers.

2. **Fix `drawScoreSummaryBox`** — replace misleading point values:
   - Change `earnedScore` display from `avgFinalScore * totalKpis` to just `avgFinalScore`
   - Change `maxScore` from `totalKpis * 5` to `5.00`
   - Display as: `"4.50 / 5.00"` with percentage `90%`

3. **Fix PDF table columns** — restructure the 10-column table:
   - Column 3: Change from "Self Ach." (achieved value) to "Self" (self score)
   - Column layout: `KPI Name | W | Target | Self | Mgr | Skip-L | HR PMS | Auditor | Final | *`
   - Move achieved value display into the Target column as "Target / Achieved" format

4. **Fix all truthy score checks** — replace `kpi.managerScore ?` with `kpi.managerScore != null ?` across all score columns in both table builders

5. **Fix bulk PDF null handling** — change `formatScore(sc.avgSkipLevelScore ?? 0)` to use null check for `-` display

### MonthlyScorecardReport.tsx

Fix all 7 score column displays in the UI table from truthy to null check:
```
// Before (bug):
{scorecard.avgSelfScore ? scorecard.avgSelfScore.toFixed(2) : '-'}

// After (fix):
{scorecard.avgSelfScore != null && scorecard.avgSelfScore !== 0 
  ? scorecard.avgSelfScore.toFixed(2) 
  : scorecard.avgSelfScore === 0 ? '0.00' : '-'}
```

Simplified pattern for all 7 columns:
```
{scorecard.avgSelfScore != null ? scorecard.avgSelfScore.toFixed(2) : '-'}
```

Wait — this would show `0.00` for employees where the stage doesn't exist (e.g., Skip-Level score is 0 because no skip-level data, not because score was 0). The correct approach is to check if any KPI actually has data for that stage. But since `weightedSkipLevelScore` only accumulates when `skip_level_score != null` (line 225-227), if no KPIs have skip-level data, `weightedSkipLevelScore = 0` and `avgSkipLevel = 0`. We cannot distinguish "no data" from "all zeros".

**Better fix**: Track whether ANY KPI had data for each stage. Add boolean flags like `hasSkipLevelData` and `hasHrPmsData`. Display `-` only when no data exists for that stage, and `0.00` when data exists but is zero.

### DOCUMENTATION.md

- Version bump to 1.45.36
- Note: PDF Total Score display corrected from misleading point values to proper weighted average
- Note: Self Score column added to PDF KPI table (was showing achieved value)
- Note: Zero-score display bug fixed across all report tables

## Expected Outcome

| Element | Before (Bug) | After (Fix) |
|---|---|---|
| PDF Total Score box | "58.5 / 65.0 pts" (meaningless) | "4.50 / 5.00" with 90% bar |
| PDF table "Self" column | Shows "100" (achieved value for CLMS) | Shows "3.00" (self score) |
| Score of 0 in UI/PDF | Displays as `-` | Displays as `0.00` |
| Skip-Level for Jitendra (no workflow stage) | Shows `0.00` in bulk PDF | Shows `-` |
| Code duplication | 250 lines duplicated | Single shared function |

