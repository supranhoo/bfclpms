
# Fix: Dashboard Score Badges Using DB-Stored Rating Level Instead of Numeric Score

## Root Cause

The previous refactoring fixed `ratingToLevel()` so score 4 maps to **green** (not blue). However, the Dashboard and MobileKpiCard render colors using the **DB-stored rating level** string (e.g., `ratingColors[rating]`), not the numeric score.

Old KPI submissions calculated before the fix still have `rating_level = 'blue'` for score 4 in the database. Since the Dashboard reads this stored value directly, scores 4 and 5 both display as blue.

```text
Current flow (broken for old data):
  DB stores: score=4, rating_level='blue' (old bug)
  Dashboard: ratingColors['blue'] --> #3B82F6 (blue)
  Result: Score 4 looks identical to Score 5

Fixed flow:
  DB stores: score=4, rating_level='blue' (old data, ignored)
  Dashboard: getScoreColor(4) --> #10B981 (green)
  Result: Score 4 correctly shows green
```

## Fix

Replace `ratingColors[rating]` with `getScoreColor(score)` in the Dashboard and MobileKpiCard so the color is always derived from the numeric score, not the stored rating level. This makes the display correct for both old and new data, and also applies the severity gradient (scores 0, 1, 2 show distinct red shades).

Additionally, update old DB records where score 4 has `rating_level = 'blue'` to `'green'` so the stored data is also corrected.

## Files to Modify

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Replace `ratingColors[rating]` with `getScoreColor(score)` in the KPI table badge; also use `getScoreBadgeClass(score)` for proper text contrast |
| `src/components/dashboard/MobileKpiCard.tsx` | Same change -- use `getScoreColor(score)` instead of `ratingColors[rating]`; remove `ratingColors` prop |
| Database migration | Update existing submissions: set `self_rating = 'green'` where `self_score >= 4 AND self_score < 5 AND self_rating = 'blue'` (same for manager, auditor, management, final columns) |
| `DOCUMENTATION.md` | Document the data correction |

## Technical Details

### Dashboard.tsx (line ~704-711)

Before:
```text
<Badge style={{ backgroundColor: ratingColors[rating] }} className="text-white">
  {score?.toFixed(1) || rating}
</Badge>
```

After:
```text
<Badge className={getScoreBadgeClass(score)}>
  {score != null ? score.toFixed(1) : '-'}
</Badge>
```

### MobileKpiCard.tsx (line ~73-77)

Same pattern -- replace inline `ratingColors[rating]` style with `getScoreBadgeClass(score)`.

### Database Migration

Correct historical data where score 4 was stored as 'blue' instead of 'green':

```text
UPDATE kpi_submissions
SET self_rating = 'green' WHERE self_score >= 4 AND self_score < 5 AND self_rating = 'blue';

UPDATE kpi_submissions
SET manager_rating = 'green' WHERE manager_score >= 4 AND manager_score < 5 AND manager_rating = 'blue';
-- (same for auditor, management, final, hr_pms, skip_level)
```

This ensures both new calculations and old stored data are correct going forward.
