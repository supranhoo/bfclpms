

# Fix: Daily KPI Monthly Submission — Silent Failure and Missing Feedback

## Root Cause Analysis

After thorough code investigation, the system **does not** require all days to be submitted before allowing monthly submission. The aggregation logic (`calculateDailyAggregatedScore`) handles partial data correctly.

The actual bugs are:

1. **Silent failure in `handleSubmitMonthlyReview`** (line 374): If the aggregation returns `null`, the function does a bare `return;` with no toast or error message. The employee clicks "Confirm & Submit" and nothing happens — no feedback whatsoever.

2. **No visibility into missing days**: The monthly submission confirmation dialog shows "Total Entries" count but doesn't show how many days are *missing*, giving no context about completeness.

3. **Edge case**: If all submitted entries have `achieved_value === null` (e.g., employee opened the form but didn't enter values), the filter at line 369 produces an empty array, aggregation returns `null`, and the submit silently fails.

## Fix Plan

### File: `src/components/review/SelfReviewSheet.tsx`

**Fix 1 — Add error feedback on aggregation failure (~line 374)**
Replace the silent `if (aggregatedScore === null) return;` with a toast that tells the employee what went wrong:
```typescript
if (aggregatedScore === null) {
  toast({
    title: 'No valid entries found',
    description: 'Please enter values for at least one day before submitting the month.',
    variant: 'destructive',
  });
  setIsSubmittingMonthly(false);
  return;
}
```

Also move `setIsSubmittingMonthly(true)` before the null check so the loading state is properly cleaned up.

**Fix 2 — Show missing days info in confirmation dialog (~line 1081)**
Add a "Submitted / Total Days" line showing how many days have data vs expected, so employees understand partial submission is happening:
```
Submitted Days: 28 / 31
```
This uses the existing aggregation result which already tracks `submittedDays` and `totalDays`.

**Fix 3 — Show missing days count in the confirmation dialog**
Compute and display the aggregation result (including missed days) in the confirmation dialog so the employee sees exactly what will be submitted.

## Risk Assessment
- **Data Impact**: None — no schema changes, no saved data affected
- **Regression Risk**: Very low — only adds user-facing feedback; core submission logic unchanged
- **Workflow Impact**: None — employees who could submit before can still submit; those who couldn't now get a clear error message

