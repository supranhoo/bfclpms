
# Plan: Fix Daily KPI Submission Summary Table Visibility

## Summary

The Daily Submission Summary Table is not showing for user "Dummy" even though submissions exist in the database for January 30 & 31. There are two bugs causing this:

1. **Null achieved_value filtering**: The component filters out submissions where `achieved_value` is null, but the database shows all Dummy's submissions have null values
2. **Date parsing bug**: The code tries to parse `"2026-01-31"` as an integer to get the day, which yields `2026` instead of `31`

## Root Cause Analysis

| Issue | Current Code | Problem |
|-------|--------------|---------|
| Filtering | `.filter(s => s.achieved_value !== null)` | Excludes all submissions with null achieved values |
| No render | `if (sortedSubmissions.length === 0) return null` | Table doesn't show when all values are null |
| Date parsing | `parseInt(submission.sub_period_value)` | Parses "2026-01-31" as 2026, not day 31 |

## Proposed Fix

### File: `src/components/review/DailySubmissionSummary.tsx`

**Change 1: Show ALL submissions (not just ones with non-null values)**

The table should display all submissions, showing "—" for entries without achieved values. This provides visibility into submission activity even before values are entered.

```typescript
// BEFORE (line 72-80):
const sortedSubmissions = useMemo(() => {
  return [...submissions]
    .filter(s => s.achieved_value !== null)  // <-- Remove this filter
    .sort((a, b) => {
      const dateA = parseInt(a.sub_period_value);
      const dateB = parseInt(b.sub_period_value);
      return dateA - dateB;
    });
}, [submissions]);

// AFTER:
const sortedSubmissions = useMemo(() => {
  return [...submissions]
    .sort((a, b) => {
      // Parse full date strings properly
      const dateA = new Date(a.sub_period_value).getTime();
      const dateB = new Date(b.sub_period_value).getTime();
      return dateA - dateB;
    });
}, [submissions]);
```

**Change 2: Show table if ANY submissions exist (not just non-null values)**

```typescript
// BEFORE (line 82-85):
if (sortedSubmissions.length === 0) {
  return null;
}

// AFTER (no change needed - but stats calculation needs update)
```

**Change 3: Fix date extraction for display**

```typescript
// BEFORE (line 155-158):
const dayNumber = parseInt(submission.sub_period_value);
const monthNumber = getMonthNumber(reviewMonth);
const dateObj = new Date(reviewYear, monthNumber - 1, dayNumber);
const formattedDate = format(dateObj, 'dd MMM');

// AFTER:
const dateObj = new Date(submission.sub_period_value);
const formattedDate = format(dateObj, 'dd MMM');
```

**Change 4: Update statistics to count ALL submissions**

```typescript
// BEFORE (line 36):
const submittedCount = submissions.filter(s => s.achieved_value !== null).length;

// AFTER:
const submittedCount = submissions.length;  // Count all submissions
const withValueCount = submissions.filter(s => s.achieved_value !== null).length;
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/DailySubmissionSummary.tsx` | Fix filtering, date parsing, and stats |
| `DOCUMENTATION.md` | Update documentation |

## Detailed Code Changes

### DailySubmissionSummary.tsx

1. **Lines 32-46 (stats calculation)**:
   - Keep `submittedCount` as total submissions count
   - Stats should reflect entries that exist in the system

2. **Lines 72-80 (sorting)**:
   - Remove the `achieved_value !== null` filter
   - Fix date parsing to use `new Date()` instead of `parseInt()`

3. **Lines 155-158 (date display)**:
   - Use `new Date(submission.sub_period_value)` directly since values are full dates

## Testing Checklist

After implementation:
- Open Daily KPI for user "Dummy" in Team Review - verify table now appears
- Verify dates display correctly (30 Jan, 31 Jan not some year value)
- Verify null achieved values show as "—" in the table
- Verify "Submitted" stat card shows 2 (number of submissions)
- Test with a mix of null and non-null achieved values
