
# Fix: Category Chart Not Showing All Row Names

## Problem Identified
The "Performance by Category" chart has a fixed height of 220px, which is insufficient when there are many categories (5 in the screenshot: ER & IR, HR Policies & Procedures, Talent Management, Recruitment, etc.). This causes:
- Bars to be compressed
- Category names to potentially overlap or be cut off
- "HR Policies & Procedures" wrapping to 2 lines due to insufficient space

## Solution
Make the chart height dynamic based on the number of categories, ensuring each category has adequate vertical space (approximately 50px per category).

## Technical Changes

### File: `src/pages/Dashboard.tsx`

**Change the CardContent height from fixed to dynamic:**

```tsx
// Current (line 226)
<CardContent className="h-[220px]">

// Updated - Dynamic height based on category count
<CardContent style={{ height: Math.max(180, categoryMetrics.length * 50) }}>
```

This ensures:
- Minimum height of 180px (for 0-3 categories)
- 50px per category when there are more categories
- 5 categories = 250px height
- 8 categories = 400px height

### File: `src/components/dashboard/CategoryScoreChart.tsx`

**Adjust chart margins for better spacing:**

```tsx
// Current (line 24)
<BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>

// Updated - More top/bottom margin and keep Y-axis width
<BarChart data={data} layout="vertical" margin={{ top: 10, right: 40, left: 10, bottom: 10 }}>
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Dynamic chart height based on category count (min 180px, 50px per category) |
| `src/components/dashboard/CategoryScoreChart.tsx` | Adjust margins for better spacing |
| `DOCUMENTATION.md` | Update dashboard documentation |

## Result
With 5 categories, the chart will be 250px tall, giving each category row 50px of space for proper label display without overlap or truncation.
