

# Fix: Incorrect Weighted Score in UnifiedScorecard (Management View)

## Root Cause

Two bugs in `src/components/review/UnifiedScorecard.tsx` cause incorrect scoring:

### Bug 1: "Weighted Score X / Y" display ignores N/A exclusion (Lines 734-735)

The display formula sums ALL KPIs' weightages including N/A ones:

```text
// CURRENT (buggy) - sums all kpis including N/A
scoreData.rating * kpis.reduce((sum, k) => sum + (k.weightage || 0), 0)
// = 4.18 * 100 = 418.2 / 500
```

It should only sum non-N/A KPIs. The `scoreData` already computes the correct rating (4.18) by excluding N/A in the `useMemo`, but the display then multiplies by the wrong denominator.

### Bug 2: `getRelevantScore` uses `||` which treats score 0 as falsy (Lines 259-267)

```text
// CURRENT (buggy) - || treats 0 as falsy
return submission.auditor_score || submission.manager_score || submission.self_score || 0;
```

For REF-2062: `auditor_score = 0` is falsy, so it falls through to `self_score = 5`, inflating the score.

The same `||` bug exists in `Dashboard.tsx` line 202 for the self-view:
```text
const score = submission?.final_score || submission?.self_score || 0;
```

## Fix Plan

### File: `src/components/review/UnifiedScorecard.tsx`

**A. Fix `getRelevantScore` (lines 259-267)** -- Replace `||` with nullish coalescing (`??`) and explicit zero checks:

```text
const getRelevantScore = (submission: any) => {
  if (!submission) return 0;
  if (viewLevel === 'manager') {
    return submission.manager_score ?? submission.self_score ?? 0;
  } else if (viewLevel === 'auditor') {
    return submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
  } else {
    return submission.management_score ?? submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
  }
};
```

**B. Fix weighted score display (lines 731-737)** -- Return `totalWeightedScore` and `totalWeight` from `scoreData` and use them in the display instead of re-summing all KPIs:

Update the `scoreData` useMemo return to include `totalWeightedScore` and `totalWeight`:
```text
return { overallScore, rating: overallRating, categoryScores, totalWeightedScore, totalWeight };
```

Update the display to use these values:
```text
{scoreData.totalWeightedScore.toFixed(1)}
<span> / {(scoreData.totalWeight * 5).toFixed(0)}</span>
```

### File: `src/pages/Dashboard.tsx`

**C. Fix `||` bug on line 202** -- Same nullish coalescing fix:

```text
const score = submission?.final_score ?? submission?.self_score ?? 0;
```

### File: `DOCUMENTATION.md`

**D.** Note the `??` fix for zero-score handling across scoring components.

## Impact

| Metric | Before (buggy) | After (correct) |
|--------|----------------|-----------------|
| Weighted Score | 418.2 / 500 | ~345 / 412.5 |
| Percentage | 83.6% | ~83.6% (coincidence) |
| Rating | 4.18 / 5 | ~4.18 / 5 |

Note: The percentage and rating happen to look similar because the N/A KPIs have small weights, but the numerator and denominator are both wrong in the current version. The actual rating will change slightly once the `||` zero-score bug is also fixed (REF-2062 will correctly score 0 instead of 5).

With both fixes:
- Total weighted score: 320.0 (not 345)
- Total weight: 82.5 (not 100)
- Out of: 412.5 (not 500)
- Rating: 320 / 82.5 = 3.88
- Percentage: 77.6%
