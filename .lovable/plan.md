

# Minimize Vertical Spacing in Category Bar Chart

## Change

In `src/components/dashboard/CategoryScoreChart.tsx`, reduce the vertical spacing between category bars to the minimum possible without overlapping.

### File: `src/components/dashboard/CategoryScoreChart.tsx`

- Change `barCategoryGap` from `"15%"` to `"8%"` -- tightest gap before labels overlap
- Reduce `barSize` from `20` to `16` -- slightly thinner bars free up even more vertical room
- Reduce chart margins from `{ top: 10, right: 30, left: 0, bottom: 10 }` to `{ top: 4, right: 30, left: 0, bottom: 4 }` -- trim top/bottom padding

### File: `DOCUMENTATION.md`

- Update the chart styling note to reflect `barCategoryGap=8%` and `barSize=16`.

