

# Update Rating Distribution: 5 Bands Based on Score Scale (5 to <3)

## Current State
The Rating Distribution uses 4 percentage-based bands (85%+, 70-84%, 50-69%, <50%). The user wants 5 bands based on the 0-5 score scale instead.

## New Bands (Top to Bottom)
| Band | Range | Label |
|------|-------|-------|
| 1 | 5 to 4.5 | Outstanding (5–4.5) |
| 2 | 4.5 to 4 | Exceeds Expectations (4.5–4) |
| 3 | 4 to 3.5 | Meets Expectations (4–3.5) |
| 4 | 3.5 to 3 | Needs Improvement (3.5–3) |
| 5 | < 3 | Below Expectations (<3) |

## Changes

### File: `src/pages/ManagementDashboard.tsx`

**1. Update `ratingCounts` object** (line 297)
- Change from `{ excellent, good, average, poor }` to `{ band5, band4, band3, band2, band1 }` — five buckets.

**2. Update bucketing logic** (lines 306-312)
- Currently computes a percentage and buckets into 4 bands.
- New logic: compute a weighted average **score** (not percentage) per employee. The `getScore` function already returns the raw 0-5 score from `review_submissions`. Divide total score by count of KPIs (not by weightage-as-percentage) to get the average score on the 0-5 scale.
- Bucket: `>=4.5` → band5, `>=4` → band4, `>=3.5` → band3, `>=3` → band2, `<3` → band1.

**3. Update `ratingDistribution` array** (lines 387-392)
- Output 5 entries with the new labels and a 5th color from `CHART_COLORS[4]`.

### File: `src/components/management/RatingHistogram.tsx`

**4. Update `SHORT_LABELS` map** (lines 21-25)
- Replace the 4 old label mappings with 5 new short labels: "Outstanding", "Exceeds", "Meets", "Needs Imp.", "Below".

**5. Adjust legend grid** (line 57)
- Change from `grid-cols-2` to accommodate 5 items cleanly (e.g., keep `grid-cols-2` with the 5th wrapping, or use a flex layout).

## Risk Assessment
- No schema or DB changes — purely UI/calculation logic.
- Low regression risk — isolated to one chart on the management dashboard.

