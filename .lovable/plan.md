

# Reduce Category Spacing in Performance by Category Chart

## Change

In `src/components/dashboard/CategoryScoreChart.tsx`, reduce the `barCategoryGap` from `"30%"` to `"15%"` to tighten the vertical spacing between bars while keeping `barSize={20}` to avoid overlapping labels.

### File: `src/components/dashboard/CategoryScoreChart.tsx`

- Change `barCategoryGap="30%"` to `barCategoryGap="15%"` on the `<BarChart>` component

### File: `DOCUMENTATION.md`

- Update the chart styling note to reflect the new `barCategoryGap` value of 15%.

