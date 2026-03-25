

## RCA: Rating/Score Mismatch Bug

### Finding

**21 final_rating** and **123 self_rating** records have ratings one level too high for their score. The pattern is consistent:

| Score | Stored Rating | Expected Rating |
|-------|--------------|-----------------|
| 4     | blue         | green           |
| 3     | green        | yellow          |
| 2     | yellow       | red             |

### Root Cause

`SelfReviewSheet.tsx` (line 370) and `AdminDataEntryDialog.tsx` (line 75) both define a local `getRatingLevel` function with **wrong thresholds**:

```typescript
// WRONG (current) — shifted by 1 level
if (score >= 4) return 'blue';   // should be 'green'
if (score >= 3) return 'green';  // should be 'yellow'
if (score >= 2) return 'yellow'; // should be 'red'
return 'red';
```

The correct mapping (used everywhere else in the codebase — `reviewConstants.ts`, `ratingCalculation.ts`, `qualitativeUom.ts`):

```typescript
if (score >= 5) return 'blue';
if (score >= 4) return 'green';
if (score >= 3) return 'yellow';
return 'red';
```

The 21 final_rating mismatches are downstream — when a KPI is approved with only self-review data, the wrong self_rating gets copied to final_rating.

### Fix

#### 1. Fix `SelfReviewSheet.tsx` — Remove local function, use canonical import

- Delete the local `getRatingLevel` function (lines 370-375)
- Import `scoreToRatingLevel` from `@/lib/reviewConstants` (already used elsewhere)
- Replace all 15 call sites with `scoreToRatingLevel`

#### 2. Fix `AdminDataEntryDialog.tsx` — Same change

- Delete the local `getRatingLevel` function (lines 74-80)
- Import `scoreToRatingLevel` from `@/lib/reviewConstants`
- Replace call sites

#### 3. Fix `ImportData.tsx` — Align mapping

- The mapping here uses `>=4.5 → blue` which is different from both the wrong and correct versions
- Replace with `scoreToRatingLevel(Math.round(numScore))` to match the canonical logic

#### 4. Database repair — Fix 123 self_rating + 21 final_rating mismatches

Migration to correct existing bad data:

```sql
UPDATE review_submissions
SET self_rating = CASE
  WHEN ROUND(self_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(self_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(self_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE self_score IS NOT NULL AND self_rating IS NOT NULL
  AND self_rating != CASE
    WHEN ROUND(self_score) >= 5 THEN 'blue'::rating_level
    WHEN ROUND(self_score) >= 4 THEN 'green'::rating_level
    WHEN ROUND(self_score) >= 3 THEN 'yellow'::rating_level
    ELSE 'red'::rating_level
  END;

-- Also fix final_rating where it was copied from bad self_rating
UPDATE review_submissions
SET final_rating = CASE
  WHEN ROUND(final_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(final_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(final_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE final_score IS NOT NULL AND final_rating IS NOT NULL
  AND final_rating != CASE
    WHEN ROUND(final_score) >= 5 THEN 'blue'::rating_level
    WHEN ROUND(final_score) >= 4 THEN 'green'::rating_level
    WHEN ROUND(final_score) >= 3 THEN 'yellow'::rating_level
    ELSE 'red'::rating_level
  END;
```

### Files Modified
- `src/components/review/SelfReviewSheet.tsx` — replace local `getRatingLevel` with imported `scoreToRatingLevel`
- `src/components/admin/AdminDataEntryDialog.tsx` — same fix
- `src/pages/admin/ImportData.tsx` — align `mapScoreToRating` with canonical logic
- DB migration — repair 123 + 21 mismatched rating records

### Risk
- Low. The canonical function is already the standard used by all other components.
- The data fix only updates rating columns to match their corresponding score columns — no score values are changed.

