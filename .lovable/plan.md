
# Fix: Exclude Unsubmitted KPIs from Score Calculation — IMPLEMENTED ✅

## Problem
KPIs with no `review_submissions` record (e.g., still at `kra_set` status, or Quarterly KPIs in non-terminal months) were included in the denominator but contributed 0 to the numerator, deflating overall scores. Affected 61 KPIs across 19 employees in January alone.

## Fix Applied
Guard clause `if (!submission || submission.is_na) return;` added in 4 files:

| File | Line | Change |
|---|---|---|
| `UnifiedScorecard.tsx` | 483 | `if (!submission \|\| submission.is_na) return;` |
| `EmployeeScorecard.tsx` | 220 | Same |
| `AuditScorecard.tsx` | 221 | Same |
| `ManagementScorecard.tsx` | 222 | Same |

## Impact
- Biswajit's score: 382/468 → 382/443 (correct)
- 19 employees with unsubmitted KPIs now show accurate weighted scores
- Quarterly KPIs in non-terminal months are correctly excluded
- No database migration needed — frontend calculation fix only
