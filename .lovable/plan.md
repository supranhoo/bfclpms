

# Fix: Use 0-5 Integer Rating Scale for Bell Curve

## Problem
The bell curve currently classifies employees using decimal score ranges (4.5-5, 4-4.5, etc.). The system's canonical rating scale uses integer scores 0-5 as defined in `RATING_SCALE` from `reviewConstants.ts`. This mismatch causes inaccurate band counts — the user expects Outstanding:1, Exceeds:0, Meets:4, Needs Imp:18, Below:76 based on the standard rating logic.

## Changes

### File: `src/pages/ManagementDashboard.tsx`

**Update band classification to use integer-based rounding (lines 309-315):**
```typescript
// Round weighted average to nearest integer, then classify
const rounded = Math.round(Math.min(5, Math.max(0, avgScore)));
if (rounded >= 5) ratingCounts.band5++;      // Outstanding (5)
else if (rounded >= 4) ratingCounts.band4++;  // Exceeds (4)
else if (rounded >= 3) ratingCounts.band3++;  // Meets (3)
else if (rounded >= 2) ratingCounts.band2++;  // Needs Improvement (2)
else ratingCounts.band1++;                    // Below (0-1)
```

**Update band labels in ratingDistribution output (lines 399-404):**
```typescript
{ name: 'Outstanding (5)', value: ratingCounts.band5, ... },
{ name: 'Exceeds Expectations (4)', value: ratingCounts.band4, ... },
{ name: 'Meets Expectations (3)', value: ratingCounts.band3, ... },
{ name: 'Needs Improvement (2)', value: ratingCounts.band2, ... },
{ name: 'Below Expectations (0-1)', value: ratingCounts.band1, ... },
```

### File: `src/components/management/RatingBellCurve.tsx`

Update `SHORT_LABELS`, `BAND_ORDER`, `BAND_MIDPOINTS`, and `getMeanBandIndex` to match the new integer-based band names.

### File: `src/components/management/RatingHistogram.tsx`

Update `SHORT_LABELS` to match the new band names.

## Risk
- **Data Impact**: None — read-only display change
- **Regression Risk**: Low — only affects bell curve/histogram labels and classification thresholds
- **UI Impact**: Positive — bands now align with the canonical 0-5 rating scale used everywhere else

