

# Toggle-Style Sort for "Performance by Category"

## Problem
The current sort controls use four separate buttons ("Wt. High-Low", "Wt. Low-High", "Score High-Low", "Score Low-High"), which takes up space. The user wants a compact toggle pattern matching the KPI sort control (as shown in the screenshot): two buttons -- "Weightage" and "Score" -- where clicking the active one toggles direction, with an arrow indicator showing current direction.

## Solution
Replace the four buttons with two toggle buttons that show direction arrows, matching the existing `KpiSortControl` pattern:
- **Weightage** button with up/down arrow
- **Score** button with up/down arrow
- Clicking an inactive button activates it (defaults to descending)
- Clicking the active button toggles the direction

## Visual Result

```text
Sort:  [Weightage v]   Score ^v
```

Active button gets a filled/secondary style with directional arrow. Inactive button shows a neutral double-arrow icon.

## Changes

### 1. `src/components/dashboard/CategoryScoreChart.tsx`
- Replace four buttons with two toggle buttons using ArrowUp/ArrowDown/ArrowUpDown icons from lucide-react
- Add "Sort:" label prefix
- Clicking toggles direction when already active, or activates with descending default
- Keep the `CategorySortBy` type and `onSortChange` prop unchanged

### 2. `src/pages/reports/PerformanceReport.tsx`
- Update the inline sort buttons in the "Performance by Category" card to match the same two-button toggle pattern

### 3. `DOCUMENTATION.md`
- Update the sort control description

## Technical Details

| File | Change |
|---|---|
| `src/components/dashboard/CategoryScoreChart.tsx` | Replace 4 buttons with 2 toggle buttons + direction arrows |
| `src/pages/reports/PerformanceReport.tsx` | Same toggle pattern for its inline sort buttons |
| `DOCUMENTATION.md` | Update sort control docs |

