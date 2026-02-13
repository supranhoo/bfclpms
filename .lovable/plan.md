

# Fix: Date UOM — Allow Previous-Month Completion for "By X Day" KPIs

## Root Cause

Two bugs prevent correct scoring when an employee completes a Date-type KPI before the review month begins:

1. **DateCalendarInput** only allows selecting dates within the review month. A manager cannot select "Dec 31" for a January KPI.
2. **calculateDateRating** rejects any value less than 1, so even a stored value of "0" (meaning "before the 1st") would get Rating 0.

## Fix — 3 Changes

### 1. Expand DateCalendarInput to include the previous month

Update `src/components/review/DateCalendarInput.tsx`:
- Change `fromDate` from the 1st of the review month to the 1st of the **previous** month
- When a date from the previous month is selected, store the value as **0** (meaning "completed before the review month started")
- Update the helper text to indicate previous month dates are allowed
- Display "Before 1st {reviewMonth}" when value is 0

### 2. Fix calculateDateRating to handle value 0

Update `src/lib/ratingCalculation.ts`:
- Change the guard from `achieved < 1` to `achieved < 0` to allow value 0
- Value 0 naturally scores correctly: `0 <= R5(1)` = true = Rating 5 (best possible)

### 3. Fix AchievedValueScoreInput to handle value 0

Update `src/components/review/AchievedValueScoreInput.tsx`:
- Ensure the display logic shows "Before 1st" for day value 0 instead of treating it as empty

### 4. Update Documentation and Tests

- Update `DOCUMENTATION.md` to document previous-month date selection
- Add test case in rating calculation tests for value 0

## Expected Behavior After Fix

| Scenario | Stored Value | Rating |
|---|---|---|
| Completed on Dec 31 (before Jan review) | 0 | 5 (best) |
| Completed on Jan 1 | 1 | 5 |
| Completed on Jan 2 | 2 | 4 |
| Completed on Jan 5 | 5 | 1 |
| Completed on Jan 6+ | 6+ | 0 |

## Files to Modify

- `src/components/review/DateCalendarInput.tsx` — Expand date range to previous month, store 0 for pre-month dates
- `src/lib/ratingCalculation.ts` — Allow value 0 in calculateDateRating guard
- `src/components/review/AchievedValueScoreInput.tsx` — Handle display of value 0
- `src/lib/ratingCalculation.test.ts` — Add test for value 0
- `DOCUMENTATION.md` — Document the change

## Immediate Data Fix

The manager's current entry of "31" for January needs to be corrected to "0" once the fix is deployed, which will give the correct Rating 5.

