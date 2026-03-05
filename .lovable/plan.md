

# Root Cause Analysis: Binary KPI Rating Inconsistency

## The Bug

From the screenshot: Employee selected "Yes" → Rating 5 (correct). Manager also sees Value 5 but gets Rating 0 (wrong).

## Root Cause

The issue is a **type mismatch during score initialization** in `UnifiedScorecard.tsx`.

When a manager opens a binary KPI for review:

1. The system reads `achieved_value` from the database — stored as the **numeric** value `5` (not the string "Yes")
2. Since the manager hasn't scored yet (`manager_score` is null), it recalculates from the achieved value by calling `calculateRating(5, ...)`
3. Inside `calculateRating` (ratingCalculation.ts, line 144-196), the binary/tiered branch:
   - First tries **label matching**: looks for `options.find(opt => opt.label === "5")` — fails because "5" is not "Yes"
   - Falls to **numeric fallback**: checks thresholds (r5-r1) — binary KPIs have no thresholds defined, so `hasThresholds = false`
   - Checks for target — binary KPIs have no target, so this also fails
   - **Returns rating = 0** (final fallback)

This means every binary KPI where the reviewer hasn't yet scored will initialize with **Rating 0** regardless of the achieved value. The employee's self-review works because the `QualitativeValueInput` directly passes both the label AND rating — it never goes through `calculateRating` with a numeric value.

The same bug affects ALL reviewer levels (Manager, Auditor, HR PMS, Skip-Level, Management).

## Fix

### File: `src/lib/ratingCalculation.ts` — Add numeric-to-label reverse mapping for binary/tiered KPIs

In the binary/tiered branch (around line 144), before the final fallback, add logic to reverse-map numeric values back to qualitative options:

```typescript
// After label matching fails (line 159), before the numeric fallback:
// Try reverse-mapping: numeric value → option rating match
const numericVal = typeof achievedValue === 'number'
  ? achievedValue
  : parseFloat(String(achievedValue ?? ''));
if (!isNaN(numericVal)) {
  const matchedOption = options.find(opt => opt.rating === numericVal);
  if (matchedOption) {
    const rating = matchedOption.rating;
    const ratingLevel = scoreToRatingLevel(rating);
    const percentage = (rating / 5) * 100;
    const weightedScore = weightage * rating;
    const achievedWeight = rating / 5;
    return { rating, ratingLevel, weightedScore, percentage, achievedWeight };
  }
}
```

This ensures that when the DB stores `5` for "Yes", the system correctly maps it back to the "Yes" option (rating=5) instead of falling through to the threshold-based fallback which returns 0.

### Why this is the correct fix location

Fixing it in `calculateRating` (the scoring engine) rather than in `UnifiedScorecard` initialization ensures consistency everywhere this function is called — all reviewer levels, all scorecards, all reports.

## Risk Assessment

- **Data Impact**: None — read-only scoring logic, no schema changes
- **Regression Risk**: Very low — adds a new matching path before the existing fallback; existing label-match and threshold paths are untouched
- **Workflow Impact**: None — fixes incorrect scoring without changing any business workflow

