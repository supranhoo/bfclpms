
# Root Cause Analysis: Daily Binary KPI Rating Shows "Not Achieved" with Score 5.00

## Issue Summary

For the Daily Binary KPI "HRMS PMS Daily Status", the system shows:
- **Total Entries:** 31 (all days submitted)
- **Average Score:** 5.00 (all "Yes" entries)
- **Rating:** Not Achieved ❌ (should be "Outstanding")

---

## Root Cause Identified

The `calculateScoreFromAchieved` function in `MyKpis.tsx` does **NOT** pass the `uomType` parameter to `calculateRating`.

### Current Code (Line 249-260):
```typescript
const calculateScoreFromAchieved = (achieved: number, kpi: KPI) => {
  const thresholds: RatingThresholds = {
    r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0
  };
  
  // ❌ BUG: Missing uomType and qualitativeOptions parameters!
  return calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);
};
```

### Database State for "HRMS PMS Daily Status":
| Field | Value |
|-------|-------|
| uom_type | binary |
| target_value | null |
| r5, r4, r3, r2, r1, r0 | ALL null |

### What Happens:

1. User submits 31 daily "Yes" entries (each stored as `achieved_value = 5`)
2. Binary aggregation: 0 missed + 0 "No" = Total No 0 → **Score 5**
3. `calculateScoreFromAchieved(5, kpi)` is called
4. Since `uomType` is not passed, `calculateRating` defaults to `'numeric'`
5. In numeric mode, it compares `achieved = 5` against **null thresholds**
6. All threshold comparisons fail → `rating = 0` → "Not Achieved"

---

## The Fix

For Daily Binary KPIs, the aggregated score (0-5) from `calculateBinaryDailyScore` **IS already the final rating**. The system should directly use this score rather than re-running threshold comparison.

### Solution: Update `calculateScoreFromAchieved` 

Pass the `uomType` and `qualitativeOptions` to `calculateRating`:

```typescript
const calculateScoreFromAchieved = (achieved: number, kpi: KPI) => {
  const thresholds: RatingThresholds = {
    r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0
  };
  
  // For binary/tiered KPIs where the achieved value is already a rating score (0-5),
  // we should use it directly as the rating
  const uomType = kpi.uom_type || 'numeric';
  const isQualitative = uomType === 'binary' || uomType === 'tiered';
  
  // For daily binary KPIs, the aggregated score IS the final rating
  if (isQualitative && (kpi.frequency === 'Daily' || kpi.frequency === 'Weekly')) {
    // Direct score-to-rating mapping: score 5 → rating 5 (Outstanding)
    const rating = Math.min(5, Math.max(0, Math.round(achieved)));
    const ratingLevel = ratingToLevel(rating);
    return {
      rating,
      ratingLevel,
      weightedScore: (kpi.weightage || 0) * rating,
      percentage: (rating / 5) * 100,
      achievedWeight: rating / 5,
    };
  }
  
  return calculateRating(
    achieved, 
    kpi.target_value, 
    thresholds, 
    kpi.criteria || 'Higher is Better', 
    kpi.weightage || 0,
    uomType as UomType,
    kpi.qualitative_options
  );
};
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Update `calculateScoreFromAchieved` to handle binary/tiered daily KPIs correctly |
| `src/pages/SelfReview.tsx` | Apply same fix to its `calculateScoreFromAchieved` function |
| `DOCUMENTATION.md` | Add note about daily binary score interpretation |

---

## Expected Result After Fix

| Metric | Before | After |
|--------|--------|-------|
| Average Score | 5.00 | 5.00 |
| Rating | Not Achieved ❌ | Outstanding ✓ |
| Badge Color | Dark Red | Blue |

---

## Technical Details

### Why This Works:

For Daily Binary KPIs:
- `calculateBinaryDailyScore` returns a score 0-5 based on "Total No" count
- This score **IS** the rating (not a raw value needing threshold comparison)
- Score 5 = 0 "No" = Outstanding
- Score 0 = >4 "No" = Not Achieved

### Scoring Logic Recap:
| Total No | Score | Rating |
|----------|-------|--------|
| 0 | 5 | Outstanding |
| 1 | 4 | Exceeds |
| 2 | 3 | Meets |
| 3 | 2 | Below |
| 4 | 1 | Needs Improvement |
| >4 | 0 | Not Achieved |

---

## Testing After Fix

1. Open "HRMS PMS Daily Status" KPI with 31 "Yes" entries
2. Click "Submit Monthly Review"
3. Verify dialog shows:
   - Total Entries: 31
   - Average Score: 5.00
   - Rating: **Outstanding** (blue badge)
4. Submit and verify the rating is correctly saved as "Outstanding"
