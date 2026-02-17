

# Fix: Disable "Submit Month" During Active Month with Clear User Messaging

## Problem

The "Submit Month" button for Daily/Weekly KPIs is clickable during the active month. Users accidentally submit incomplete data mid-month, forcing managers to roll back KPIs -- creating unnecessary work.

## Solution

Add a date-based guard: disable "Submit Month" while the review month is still ongoing, and show a clear countdown-style message so users understand when it will unlock.

## Before / Changes / After

### Before
```text
Submit Month Button States:
1. No entries yet       --> Disabled + tooltip "Enter at least one daily value first"
2. Already submitted    --> Disabled + "Month Submitted"
3. Has entries + kra_set --> ENABLED (even mid-month!) <-- BUG
```

### Changes
- Import `endOfMonth` and `getMonthNumber` in SelfReviewSheet
- Compute `isMonthStillActive` flag comparing current date to end of review month
- Add a NEW 4th button state: month still active --> disabled with tooltip showing "Available after {Month} {Year} ends"
- Show an informational banner near the button area: "You can submit the month total once {Month} ends"

### After
```text
Submit Month Button States:
1. No entries yet            --> Disabled + tooltip "Enter at least one daily value first"
2. Already submitted         --> Disabled + "Month Submitted"
3. Month still active        --> Disabled + tooltip "Available after January 2026 ends" (NEW)
4. Month over + has entries  --> ENABLED
```

The button will show a Lock icon and muted styling when the month is active, with a clear tooltip message. Users can still save daily entries normally throughout the month.

## Technical Detail

### File 1: `src/components/review/SelfReviewSheet.tsx`

1. Add import: `endOfMonth` from `date-fns` (already uses `format` from date-fns)
2. Add import: `getMonthNumber` from `@/lib/frequencyUtils` (already imports other functions from there)
3. Compute flag near line 126:
```typescript
const isMonthStillActive = useMemo(() => {
  const monthNum = getMonthNumber(selectedPeriod);
  const monthEnd = endOfMonth(new Date(selectedYear, monthNum - 1));
  return new Date() <= monthEnd;
}, [selectedPeriod, selectedYear]);
```
4. In the Submit Month button section (line 840), insert a new condition before the enabled button case:
   - When `isMonthStillActive` is true: render disabled button with Lock icon and tooltip "Available after {selectedPeriod} {selectedYear} ends"
   - When false: render existing enabled button (current behavior)

### File 2: `DOCUMENTATION.md`

Document the month-end gate for daily KPI month submission.

## Files to Change

| File | Change |
|---|---|
| `src/components/review/SelfReviewSheet.tsx` | Add `isMonthStillActive` guard; new disabled button state with Lock icon and tooltip |
| `DOCUMENTATION.md` | Document the restriction |

