

# Swap Bell Curve Axes (Back to Horizontal)

Change the bell curve from vertical layout (bands on Y-axis) to horizontal layout (bands on X-axis, employee counts on Y-axis).

## File: `src/components/management/RatingBellCurve.tsx`

- Remove `layout="vertical"` from `AreaChart`
- Swap axis configs: `XAxis` becomes category axis with `dataKey="shortName"`, `YAxis` becomes numeric
- Change `ReferenceLine` from `y` prop to `x` prop
- Adjust margins (reduce left margin since X labels are shorter)

