

# Fix: Exclude Unsubmitted KPIs from Score Calculation

## Problem
KPIs with no `review_submissions` record (e.g., still at `kra_set` status, or Quarterly KPIs in non-terminal months) are included in the denominator but contribute 0 to the numerator, deflating overall scores. Affects 61 KPIs across 19 employees in January alone.

## Change
One-line guard addition in 4 files — add `if (!submission) return;` before the existing `is_na` check:

| File | Line | Change |
|---|---|---|
| `UnifiedScorecard.tsx` | 483 | `if (!submission \|\| submission.is_na) return;` |
| `EmployeeScorecard.tsx` | 220 | Same |
| `AuditScorecard.tsx` | 221 | Same |
| `ManagementScorecard.tsx` | 222 | Same |

No database migration needed — purely a frontend calculation fix.

