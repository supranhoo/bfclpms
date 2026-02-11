

# Redesign: Premium "Performance by Category" Bar Chart

## Overview

Redesign the `CategoryScoreChart` component to achieve a professional, spacious, premium look matching the reference image and specifications.

## Changes

### File: `src/components/dashboard/CategoryScoreChart.tsx`

**1. Label Area (40% width allocation)**
- Replace the fixed `width={280}` on the YAxis with a percentage-based approach. Since Recharts YAxis uses pixel widths, calculate dynamically or set a generous fixed width that approximates 40% (e.g., use a wrapper with measured width, or set ~320px for typical dashboard widths).
- Split the label rendering into two parts using a custom tick component:
  - Category name in bold/medium weight, foreground color
  - Weightage percentage `(21%)` in lighter gray (`text-muted-foreground`) and slightly smaller

**2. Bar Geometry (thinner bars, more spacing)**
- Add `barSize` prop to `<Bar>` to reduce thickness (e.g., `barSize={20}` down from the default ~30)
- Increase `barCategoryGap` on `<BarChart>` to add breathing room between categories (e.g., `barCategoryGap="30%"`)

**3. Grid Lines**
- Add `<CartesianGrid>` with subtle horizontal lines disabled and vertical dashed lines at 0/25/50/75/100 markers
- Use a light gray stroke color: `stroke="hsl(var(--border))"` with `strokeDasharray="3 3"`
- Set XAxis ticks explicitly to `[0, 25, 50, 75, 100]`

**4. Bar Styling**
- Keep existing rounded corners `radius={[0, 4, 4, 0]}` (already matches the spec)
- Keep vibrant color palette from `entry.color`

**5. Typography**
- Use the app's default font (Inter, already configured in Tailwind) for all text
- Custom YAxis tick renderer to style category name vs. weightage differently

**6. Tooltip**
- Keep existing dark-mode-aware tooltip styling

### File: `DOCUMENTATION.md`
- Update any references to the CategoryScoreChart to note the redesigned layout with 40% label area and premium styling.

## Technical Detail

The key implementation is a **custom YAxis tick component** that renders two `<tspan>` elements: one for the category name (normal weight, foreground color) and one for the weightage (lighter color, slightly de-emphasized). This replaces the current `tickFormatter` string concatenation approach, which cannot style portions of the label differently.

```typescript
const CustomYAxisTick = ({ x, y, payload, data }) => {
  const entry = data[payload.index];
  const weightage = entry?.weightage != null ? ` (${entry.weightage}%)` : '';
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="end" fill="currentColor" fontSize={12} dominantBaseline="middle">
        <tspan fontWeight={500}>{payload.value}</tspan>
        <tspan fill="#9ca3af" fontWeight={400}>{weightage}</tspan>
      </text>
    </g>
  );
};
```

