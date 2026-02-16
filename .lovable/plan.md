
# Sort Options for "Performance by Category" Chart

## Problem
The "Performance by Category" bar chart currently always sorts categories by score (descending). The user wants the ability to toggle between sorting by **Weightage** and **Score** for better analysis flexibility.

## Solution
Add a compact sort toggle (two small buttons: "Weightage" / "Score") in the chart's CardHeader, next to the title/description. This will apply across all views where the chart appears: Dashboard, UnifiedScorecard, and PerformanceReport.

## Changes

### 1. `src/components/dashboard/CategoryScoreChart.tsx`
- Add a `sortBy` prop: `'weightage' | 'score'` (default: `'score'`)
- Add an `onSortChange` callback prop
- Sort the data internally based on the selected option before rendering
- Render two compact toggle buttons ("Weightage" / "Score") at the top-right of the chart

### 2. `src/pages/Dashboard.tsx`
- Add a `categorySortBy` state
- Remove the `.sort()` from the `categoryMetrics` memo (let the chart handle it)
- Pass `sortBy` and `onSortChange` to `CategoryScoreChart`

### 3. `src/components/review/UnifiedScorecard.tsx`
- Add a `categorySortBy` state
- Pass `sortBy` and `onSortChange` to `CategoryScoreChart`

### 4. `src/pages/reports/PerformanceReport.tsx`
- Add a `categorySortBy` state and pass to the category bar chart section

### 5. `DOCUMENTATION.md`
- Document the sort toggle feature

## Visual Result
The chart header area will look like:

```text
Performance by Category
Score breakdown across KRA categories       [Weightage] [Score]
```

The active sort option will be visually highlighted. Default remains sorting by Score (current behavior).

## Technical Details

| File | Change |
|---|---|
| `src/components/dashboard/CategoryScoreChart.tsx` | Add sortBy prop, onSortChange prop, internal sorting, toggle buttons |
| `src/pages/Dashboard.tsx` | Add categorySortBy state, pass to chart |
| `src/components/review/UnifiedScorecard.tsx` | Add categorySortBy state, pass to chart |
| `src/pages/reports/PerformanceReport.tsx` | Add categorySortBy state, pass to chart |
| `DOCUMENTATION.md` | Document sort toggle |
