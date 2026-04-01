

## RCA: Submit Monthly Review Dialog — Wrong Submitted Days Count & Incorrect Rating

### Issues Found (from screenshots)

**Pic 1**: Submit Monthly Review shows "Submitted Days: 22/31, Missed Days: 9, Average Score: 0.00, Rating: Outstanding"
**Pic 2**: Daily Submission Summary shows "31/31 Submitted, 0 Not Submitted, 100% Completion"

### Root Cause — Two Bugs

**Bug 1: Submitted Days mismatch (22 vs 31)**

In `SelfReviewSheet.tsx` line 214-216, the aggregation filters entries with `achieved_value !== null`:
```typescript
const values = selectedKpiSubPeriods
  .filter(s => s.achieved_value !== null)
  .map(s => s.achieved_value as number);
```
Entries where the user submitted a row but the `achieved_value` is `null` (the "—" entries in pic 2) are excluded. So `submittedDays = values.length = 22`, not 31. But the Daily Submission Summary counts ALL rows as submitted regardless of value.

The confirmation dialog also uses `calculateDailyAggregatedScore` (the backwards-compatible version) which always uses **calendar days** (31 for March) as `totalDays`, ignoring the KPI's `day_count_type` and employee working days configuration.

**Bug 2: Rating shows "Outstanding" for score 0.00**

Line 1259 passes the aggregated score through `calculateScoreFromAchieved`:
```typescript
calculateScoreFromAchieved(aggregatedSubPeriodScore ?? 0, selectedKpi).rating
```

If `dailyAggregationMethod` is `missed_days_penalty`, the returned `score` is already on a 0-5 rating scale (5 = perfect, 0 = 5+ missed). This score is then **re-mapped through KPI thresholds** as if it were a raw achieved value. If the KPI has "Lower is Better" criteria or thresholds where 0 maps to outstanding, the rating becomes 5 (Outstanding) — a double-conversion error.

Even with `average` method: average of twenty-two 0-values = 0.00, passed to `calculateScoreFromAchieved(0, kpi)` — same problem if thresholds treat 0 as best.

### Fix

**1. Fix Submitted Days count** (`SelfReviewSheet.tsx` line 212-219)

Use `useDailyAggregatedScore` hook (which respects `day_count_type` and employee working days) instead of calling `calculateDailyAggregatedScore` directly. This aligns the confirmation dialog with the Daily Submission Summary.

Alternatively, keep the direct call but use `calculateDailyAggregatedScoreWithExpectedDays` with proper expected days from `useExpectedDays` hook.

**2. Fix Rating display** (`SelfReviewSheet.tsx` line 1255-1264)

For Daily/Weekly KPIs using `missed_days_penalty` method, the aggregated score IS the rating (0-5). Do NOT pass it through `calculateScoreFromAchieved` again. Display it directly:

```typescript
// For daily KPIs with missed_days_penalty, score IS the rating
const dailyRating = (selectedKpi?.frequency === 'Daily' || selectedKpi?.frequency === 'Weekly')
  && dailyAggregationMethod === 'missed_days_penalty'
  ? Math.round(aggregatedSubPeriodScore ?? 0)
  : Math.round(calculateScoreFromAchieved(aggregatedSubPeriodScore ?? 0, selectedKpi).rating);
```

**3. Fix "Average Score" label**

The label always says "Average Score" even when the method is `missed_days_penalty`. Should show the correct method label (e.g., "Missed Days Score" or use `getAggregationMethodLabel`).

**4. Align actual submission logic** (`SelfReviewSheet.tsx` line 383-386)

The same bugs exist in `handleSubmitMonthlyReview` where the achieved_value sent to the review is calculated. Ensure it also uses the correct expected days and avoids double-rating.

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/SelfReviewSheet.tsx` | Use `useDailyAggregatedScore` hook for correct expected days; fix rating double-conversion; fix score label |
| `DOCUMENTATION.md` | v2.15.42 |
| `POLICY.md` | Update daily KPI scoring policy |

### Risk Assessment
- **Regression**: Low — changes only affect the confirmation dialog display and the achieved value sent on submission for daily/weekly KPIs
- **Data**: No schema change. Existing submissions with incorrect scores may need re-submission or manual correction
- **Downstream**: Manager review will receive correctly calculated scores going forward

