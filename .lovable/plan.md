

# Score Inheritance Bug in AuditScorecard and ManagementScorecard

## Problem
The same bug fixed in `UnifiedScorecard` exists in two other scorecard components:

1. **`AuditScorecard.tsx` (line 380)**: `setAuditorScore(existing?.auditor_score ?? existing?.manager_score ?? null)` — inherits manager's score blindly when auditor hasn't reviewed yet.
2. **`ManagementScorecard.tsx` (line 445)**: `setManagementScore(existing?.management_score ?? existing?.auditor_score ?? null)` — inherits auditor's score blindly when management hasn't reviewed yet.

Both ignore the achieved value and its correct rating, producing the same mismatch seen in the original bug.

## Fix

### File: `src/components/review/AuditScorecard.tsx` — `openReviewSheet` (~line 377)
1. Import `calculateRating` from `@/lib/ratingCalculation`
2. After resolving `auditorAchievedValue`, check if `existing?.auditor_score` is null
3. If null and an achieved value is available, call `calculateRating()` to compute the correct score instead of falling back to `existing?.manager_score`
4. Use the recalculated score as the initial `auditorScore`

### File: `src/components/review/ManagementScorecard.tsx` — `openReviewSheet` (~line 442)
1. Import `calculateRating` from `@/lib/ratingCalculation`
2. After resolving `managementAchievedValue`, check if `existing?.management_score` is null
3. If null and an achieved value is available, call `calculateRating()` to compute the correct score instead of falling back to `existing?.auditor_score`
4. Use the recalculated score as the initial `managementScore`

Both fixes follow the exact same pattern already applied in `UnifiedScorecard.tsx`: own score → recalculate from achieved value → legacy fallback.

## Risk Assessment
- **Data Impact**: None — only affects future score initialization, not saved data
- **Regression Risk**: Very low — uses the same `calculateRating()` function, same pattern as the already-deployed fix
- **Workflow Impact**: None — scoped to sheet open initialization only

