

# Fix: Import Treats Zero Values as N/A

## Problem

The N/A auto-detection logic in the import function uses JavaScript truthiness checks (`!value`). Since `!0` is `true` in JavaScript, any KPI row where the achieved value or ratings are explicitly **0** gets incorrectly flagged as N/A and all its data is wiped to null.

This is exactly what happened with **REF-882**: the uploaded sheet had `0` in targetAchieved, rating, employeeTargetAchieved, and employeeRating -- all legitimate zero-score data that was discarded.

## Fix

### File: `supabase/functions/import-kpis/index.ts` (line 848-849)

Replace the truthiness-based checks with explicit null/undefined/empty-string checks using a helper function:

```text
// Helper to check if a value is truly empty (not just zero)
const isEmpty = (v: any) => v === null || v === undefined || v === '';

const isNa = achievedStr === 'na' || achievedStr === 'n/a' ||
  achievedStr === 'not applicable' || achievedStr === '-' ||
  (isEmpty(achievedValue) && isEmpty(row.employeeRating) && isEmpty(row.rating) &&
   isEmpty(row.managerRating) && isEmpty(row.auditRating));
```

This ensures `0` is treated as valid data, and only truly blank cells trigger the automatic N/A detection.

### File: `DOCUMENTATION.md`

Document that the N/A auto-detection now correctly distinguishes between "no data" (blank cells) and "zero value" (explicit 0).

### Data Fix

After deploying, re-import the affected data (or manually update REF-882 for employee 100012 to set `is_na = false` and restore the correct zero values).

## Technical Detail

| Value | `!value` (old/buggy) | `isEmpty(value)` (new/correct) |
|-------|---------------------|-------------------------------|
| `null` | true | true |
| `undefined` | true | true |
| `''` | true | true |
| `0` | **true (BUG)** | **false (correct)** |
| `5` | false | false |

