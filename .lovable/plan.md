

# Fix: Inconsistent Rating Display in Review Journey

## Problem

The Review Journey in `KpiJourneySection` shows **Self: Rating 5** and **Manager: Rating 0** for the same achieved value (5) on a "Lower is Better" KPI with Target=0, R5=0.

**Root Cause**: `KpiJourneySection` reads `self_score` and `manager_score` directly from the stored `review_submissions` record without recalculating. The Self score (5) was stored at a time when the scoring logic was different or buggy. The Manager score (0) was stored later with corrected logic. The display layer blindly trusts stale stored values.

## Solution

Recalculate ratings from achieved values in `KpiJourneySection` using the KPI's current thresholds, instead of displaying raw stored scores. This aligns with the existing "score-calculation-initialization" pattern already used in UnifiedScorecard and AuditScorecard.

## Changes

### File: `src/components/review/KpiJourneySection.tsx`

1. Import `calculateRating` and `RatingThresholds` from `@/lib/ratingCalculation`.
2. Add a helper function `recalcScore(achievedValue, kpi)` that runs the achieved value through `calculateRating` with the KPI's current thresholds, criteria, UOM, and threshold_mode.
3. For each stage in `stageData`, if `achievedValue` is not null, replace the stored `score` with the recalculated rating. Keep the stored score as a fallback when no achieved value exists.
4. Derive the `rating` (color level) from the recalculated score using `ratingToLevel`.

This ensures both Self and Manager stages show consistent ratings when their achieved values are evaluated against the same current thresholds.

### Impact Assessment
- **Data Impact**: None - read-only display change, no DB modifications.
- **Workflow Impact**: None - submission logic unchanged.
- **UI/UX**: Ratings will now be consistent across all stages for identical values.
- **Regression Risk**: Low - only affects the read-only Review Journey display. The recalculation uses the same `calculateRating` function already used everywhere else.

