

# Fix: Category Chart Y-Axis Width Truncating Long Names

## Problem
The Y-axis width for category names is calculated as `30%` of the container width (line 35). On certain screen sizes, this produces a width too narrow for long category names like "Service & Process Improvement (8.5%)", causing them to clip/break.

## Fix: `CategoryScoreChart.tsx`

Set a **minimum width of 220px** and increase the ratio slightly to **35%** so labels have enough room. Also add `overflow: visible` to the SVG text to prevent hard clipping.

**Line 35 change:**
```typescript
// Before
setYAxisWidth(Math.round(entry.contentRect.width * 0.3));

// After
setYAxisWidth(Math.max(220, Math.round(entry.contentRect.width * 0.35)));
```

**1 file, 1 line changed.**

