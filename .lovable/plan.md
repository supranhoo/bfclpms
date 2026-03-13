

# Correction: Score of 0 Is Valid — No Suppression Needed

## Understanding

You are absolutely right. For "Control Dust Emission" with 30 non-compliance days and target=0, the score **correctly** evaluates to 0. This is not a misconfiguration artifact — it is the legitimate scoring outcome.

My previous plan to suppress zero-score propagation and flag `ZERO_SCORE_FROM_MISSING_CONFIG` was **incorrect** for this case. I am withdrawing that plan.

## What Actually Happens Today

The propagation flow works correctly end-to-end:

1. Admin enters achieved value (30) in Org KPI Data Entry
2. `buildRatingsPayload` calls `calculateRating(30, 0, {all nulls}, 'Higher is Better', ...)` 
3. `calculateAbsoluteRating` finds all R1–R5 are null → no threshold matches → rating = 0
4. RPC writes `self_score = 0`, `self_rating = 'red'` to `review_submissions`
5. KPI status advances from `kra_set` to `self_review`
6. Dashboard displays "0.0" in a red badge (the `score != null` check correctly passes for 0)

**Score of 0 propagates and displays correctly.** There is no bug here.

## What Could Still Be Improved (Optional)

If you want the KPI to score differently (e.g., 0 days = 5, 1 day = 4, etc. as described in the KPI description), the fix is purely a **data configuration** task — an admin needs to:

1. Set **Criteria** to "Lower is Better"
2. Set **R5 = 0, R4 = 1, R3 = 2, R2 = 3, R1 = 4** (absolute thresholds)

With those thresholds, 30 non-compliance days would still score 0 (since 30 > R1=4), which is the correct outcome. But if the actual value were 0 days, it would correctly score 5.

The Scoring Health Check already flags this KPI for `MISSING_THRESHOLDS` — which guides admins to add the correct configuration. No code changes are needed.

## Summary

No code changes required. The previous plan to suppress zero-score propagation is withdrawn. The system handles this case correctly.

