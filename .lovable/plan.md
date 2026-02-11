

# Fix Employee Performance Summary Scoring to Match Dashboard Logic

## Problem
The report calculates scores completely differently from the Dashboard:

1. **Not weighted**: Report sums raw scores (`totalScore += score`), Dashboard multiplies by weight (`totalScore += score * weight`)
2. **Wrong denominator**: Report uses raw weightage sum, Dashboard uses `weight * 5` (max possible score)
3. **Wrong rating formula**: Report uses `percentage / 20`, Dashboard uses `totalScore / totalWeight`
4. **No N/A exclusion**: Report includes N/A KPIs in calculations; Dashboard skips them
5. **Zero-score bug**: Report uses `||` (treats 0 as missing), should use `??`

## Fix

### Changes to `src/pages/reports/EmployeePerformanceSummary.tsx`

**A. Add `is_na` to the query** (line 106):
Add `is_na` to the `review_submissions` select so we can exclude N/A KPIs.

**B. Fix the aggregation loop** (lines 152-193):
Replace the current simple summation with weighted scoring matching the Dashboard:

```text
Before:
  totalScore += finalScore
  outOfScore += weightage

After:
  // Skip N/A KPIs
  if (submission?.is_na) return;
  
  const score = submission?.final_score ?? submission?.self_score ?? 0;
  const weight = kpi.weightage || 0;
  totalScore += score * weight;     // weighted score
  totalWeight += weight;            // for rating calculation
  totalMaxScore += weight * 5;      // max possible
```

**C. Update the EmployeePerformance interface** (lines 42-55):
Add a `totalWeight` field to store the weight denominator for rating.

**D. Fix `calculateRating` function** (lines 391-395):
Replace `percentage / 20` with `totalScore / totalWeight` (the Dashboard formula).

**E. Fix the trend data calculation** (lines 244-271):
Apply the same weighted scoring logic to the comparison/trend tab.

**F. Fix all `||` to `??`** for score fallback chains to preserve zero scores.

### Update `DOCUMENTATION.md`
Note that the Employee Performance Summary report uses the same weighted scoring as the Dashboard.

