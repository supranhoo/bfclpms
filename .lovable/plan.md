

# Fix Missing Categories and Adjust Label Width

## Problems Identified

1. **Missing categories**: The chart container height is too small (28px per row) causing categories to be clipped/hidden when there are many categories. The `ResponsiveContainer` tries to fit all bars into limited vertical space and some get cut off.

2. **Label area too wide**: The Y-axis currently uses 40% of the chart width for category names, leaving only 60% for bars. User wants 30%/70% split instead.

## Changes

### File: `src/components/dashboard/CategoryScoreChart.tsx`

- Change the Y-axis width multiplier from `0.4` (40%) to `0.3` (30%) on line 29
- Change the initial `yAxisWidth` state from `280` to `210` on line 23

### File: `src/pages/Dashboard.tsx`

- Increase per-category row height from `28` to `36` on line 471 to prevent clipping when many categories exist

### File: `src/components/review/UnifiedScorecard.tsx`

- Increase per-category row height from `28` to `36` on line 752 to match

### File: `DOCUMENTATION.md`

- Update chart styling notes to reflect 30% label area and 36px per-category row height

