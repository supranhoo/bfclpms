
# Fix: `getRelevantScore` in UnifiedScorecard Ignores `final_score`

## Root Cause

The `getRelevantScore` function in `UnifiedScorecard.tsx` cascades through level-specific scores (`management_score`, `auditor_score`, `manager_score`, `self_score`) but **never considers `final_score`**. 

For employee 100012 (October 2025), **REF-884** has:
- `self_score: 10.00` (incorrect/legacy data)
- `final_score: 4.00` (correct imported score)
- All other level scores: null

The function picks `self_score = 10` (which exceeds the 0-5 scale), inflating the weighted score by 60 points (10x10 vs 4x10).

This is why the scorecard shows **397.5 / 363** with a rating of **5.48/5** -- impossible values.

## Fix

### File: `src/components/review/UnifiedScorecard.tsx`

Update `getRelevantScore` to use `final_score` as the **primary** source, falling back to level-specific scores only when `final_score` is null (i.e., during an in-progress review):

```text
const getRelevantScore = (submission: any) => {
  if (!submission) return 0;
  // Prefer final_score (set by import or workflow completion)
  if (submission.final_score !== null && submission.final_score !== undefined) {
    return submission.final_score;
  }
  // Fallback to level-specific scores for in-progress reviews
  if (viewLevel === 'manager') {
    return submission.manager_score ?? submission.self_score ?? 0;
  } else if (viewLevel === 'auditor') {
    return submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
  } else {
    return submission.management_score ?? submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
  }
};
```

This aligns with `Dashboard.tsx` (line 202) which already uses `final_score ?? self_score`.

### File: `DOCUMENTATION.md`

Document that `final_score` is the authoritative score source, with level-specific scores used only for in-progress reviews.

## Expected Result for Employee 100012

With the fix, REF-884 will use `final_score = 4.00` instead of `self_score = 10.00`:
- Weighted score drops by 60 points (from ~397.5 to ~337.5)
- Denominator stays at 363 (72.5 active weight x 5)
- Rating: ~4.66/5 instead of 5.48/5
- Percentage: ~93% instead of 109.7%
