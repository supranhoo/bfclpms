

# Further Reduce Category Bar Spacing

## Change

In `src/components/dashboard/CategoryScoreChart.tsx`, push the spacing to the absolute minimum.

### File: `src/components/dashboard/CategoryScoreChart.tsx`

- Change `barCategoryGap` from `"8%"` to `"2%"` -- near-zero gap between bars
- Reduce `barSize` from `16` to `12` -- thinner bars to reclaim more vertical space

### File: `DOCUMENTATION.md`

- Update chart styling note to reflect `barCategoryGap=2%` and `barSize=12`.

