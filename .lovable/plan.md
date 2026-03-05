

# Swap Bell Curve Axes (X ↔ Y)

## Change

Rotate the bell curve so rating bands run along the **Y-axis** (vertical) and employee counts run along the **X-axis** (horizontal).

### File: `src/components/management/RatingBellCurve.tsx`

- Change `AreaChart` `layout` prop to `"vertical"`
- Swap `XAxis` and `YAxis` configurations:
  - `YAxis` → `dataKey="shortName"` (category axis, type="category")
  - `XAxis` → numeric axis showing employee counts (type="number")
- Update `ReferenceLine` from `x` to `y` prop for the mean indicator
- Adjust chart margins for longer Y-axis labels

