

# Fix: Daily KPI Date Selector Ignoring Submission Window Setting

## Root Cause

The function `getDailySubPeriods()` in `src/lib/frequencyUtils.ts` (lines 109-138) is **hardcoded** to only return today and yesterday as selectable dates. It completely ignores the `daily_submission_window_days` setting, which is already configured to **60 days** in the database.

The `useDailySubmissionWindow()` hook exists in `useWorkflowSettings.ts` but is **never called** anywhere in the codebase.

## Fix

### 1. Update `getDailySubPeriods()` in `src/lib/frequencyUtils.ts`

Change the function to accept a `windowDays` parameter. Instead of hardcoding today+yesterday, generate all dates in the review month and enable any date that falls within `windowDays` of the current date.

```
Before: Only today + yesterday shown
After:  All dates in the review month shown; dates within the window are enabled, others are disabled
```

This means for a 60-day window, employees can submit data for any date in the current month AND the previous month.

### 2. Update `SubPeriodSelector.tsx` to pass the window setting

Import `useDailySubmissionWindow()` and pass the value to `getDailySubPeriods()`.

### 3. Update `DOCUMENTATION.md`

Document that the daily submission window setting now controls date availability.

## Files to Modify

- `src/lib/frequencyUtils.ts` -- Update `getDailySubPeriods` to use `windowDays` parameter
- `src/components/review/SubPeriodSelector.tsx` -- Pass `useDailySubmissionWindow()` value
- `src/lib/frequencyUtils.test.ts` -- Update tests for the new parameter
- `DOCUMENTATION.md` -- Document the change

## Behavior After Fix

- **Current month**: All dates up to today are enabled (within 60-day window)
- **Previous month**: All dates are enabled (within 60-day window)
- **Older months**: Dates shown but disabled (outside window)
- **Future**: Admin can reduce the window back to 2 days for restricted mode via System Settings > Controls

