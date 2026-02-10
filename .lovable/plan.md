

# Fix KPI Tracker Sheet Month Sequence

## Problem
The Monthly Detail Log in the KPI Tracker Sheet displays months in incorrect order because:

1. The `monthOrder` array uses **abbreviated** names: `['Jan', 'Feb', 'Mar', ...]`
2. The database `review_period` stores **full** names: `'January', 'February', 'March', ...`
3. The sort logic splits on `-` (for multi-month periods like "Jan-Mar") and tries to match the first part against `monthOrder`
4. Full month names like "January" don't match "Jan", so `indexOf` returns `-1` for every entry, resulting in an arbitrary/unstable sort

## Fix

**File:** `src/components/dashboard/KpiTrackerModal.tsx`

Replace the `monthOrder` array and sorting logic to handle both full month names and abbreviated/hyphenated period labels:

- Change `monthOrder` to use full month names: `['January', 'February', ..., 'December']`
- Add a helper that extracts the sort index from either a full month name ("January") or a hyphenated abbreviation ("Jan-Mar") by checking both arrays
- Keep the year-first, then month-index sort logic

This is a small, targeted fix -- one file, ~10 lines changed.

## Technical Details

### Current (broken)
```typescript
const monthOrder = ['Jan', 'Feb', 'Mar', ...];
// ...
const [monthA] = a.month.split('-');
return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
// "January".split('-') => ["January"] -- indexOf("January") => -1
```

### Fixed
```typescript
const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthSortIndex(period: string): number {
  const first = period.split('-')[0];
  const idx = fullMonths.indexOf(first);
  if (idx >= 0) return idx;
  return shortMonths.indexOf(first);
}
```

This handles full names ("January"), short names ("Jan"), and hyphenated ranges ("Jan-Mar").

