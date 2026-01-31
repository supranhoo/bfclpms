
# Plan: Add Category Weightage to "Performance by Category" Charts

## Summary
Display the category weightage alongside the category name in all "Performance by Category" charts across the application. This will help users understand the relative importance of each category while viewing performance scores.

## Changes Required

### 1. Update Chart Component Interface

**File: `src/components/dashboard/CategoryScoreChart.tsx`**

- Add `weightage` to the `CategoryData` interface
- Modify the Y-axis label to include weightage display (e.g., "Category Name (25%)")

```tsx
interface CategoryData {
  name: string;
  percentage: number;
  color?: string | null;
  weightage?: number;  // NEW: Category weightage
}
```

Update the YAxis to format labels with weightage:
```tsx
<YAxis 
  type="category" 
  dataKey="name" 
  width={280}
  tickFormatter={(name, index) => {
    const entry = data[index];
    return entry?.weightage 
      ? `${name} (${entry.weightage}%)` 
      : name;
  }}
  ...
/>
```

### 2. Update Dashboard Data Source

**File: `src/pages/Dashboard.tsx`** (Lines 109-133)

Add `weightage` to the returned category metrics:

```tsx
return {
  name: cat.name,
  percentage: max > 0 ? (achieved / max) * 100 : 0,
  color: cat.color,
  count: catKpis.length,
  weightage: cat.weightage,  // NEW
};
```

### 3. Update SelfReview Data Source

**File: `src/pages/SelfReview.tsx`** (Lines 218-241)

Add `weightage` to the returned category metrics:

```tsx
return {
  name: cat.name,
  percentage: max > 0 ? (achieved / max) * 100 : 0,
  color: cat.color,
  count: catKpis.length,
  weightage: cat.weightage,  // NEW
};
```

### 4. Update Performance Report Chart

**File: `src/pages/reports/PerformanceReport.tsx`** (Lines 43-61)

This page uses its own inline `BarChart`. Add `weightage` to `categoryPerformance` and update the YAxis:

```tsx
return {
  name: cat.name,
  avgScore: count > 0 ? Math.round(totalScore / count) : 0,
  kpiCount: catKpis.length,
  color: cat.color,
  weightage: cat.weightage,  // NEW
};
```

Update the YAxis formatter:
```tsx
<YAxis 
  dataKey="name" 
  type="category" 
  width={160}
  tickFormatter={(value, index) => {
    const cat = categoryPerformance[index];
    return cat?.weightage ? `${value} (${cat.weightage}%)` : value;
  }}
/>
```

### 5. Update PDF Export

**File: `src/lib/pdfExport.ts`**

The `CategoryMetric` interface already has `weightage?: number` (line 71). Update `drawCategoryChart` function to display weightage:

```tsx
// Line 242 - Update label to include weightage
const label = cat.weightage 
  ? `${truncateText(cat.name, 18)} (${cat.weightage}%)`
  : truncateText(cat.name, 22);
doc.text(label, x, currentY + barHeight / 2 + 1);
```

Also update where `categoryMetrics` is built (lines 878-883 and 1204-1209) to include weightage from category data.

### 6. Update Documentation

**File: `DOCUMENTATION.md`**

Add note about weightage display in the dashboard charts section.

## Visual Representation

```text
BEFORE:
┌──────────────────────────────────────────────────┐
│ HR Operations              ████████████  75%     │
│ Compliance                 █████████    60%      │
│ Training                   ███████      50%      │
└──────────────────────────────────────────────────┘

AFTER:
┌──────────────────────────────────────────────────┐
│ HR Operations (30%)        ████████████  75%     │
│ Compliance (25%)           █████████    60%      │
│ Training (20%)             ███████      50%      │
└──────────────────────────────────────────────────┘
```

## Technical Notes

- The `kra_categories` table already contains the `weightage` field
- The `useKraCategories()` hook returns all category fields including `weightage`
- The `CategoryMetric` interface in pdfExport.ts already has optional `weightage` field
- Y-axis width may need slight adjustment if names are very long (280px should accommodate most cases)

## Files to Modify

| File | Change |
|------|--------|
| `src/components/dashboard/CategoryScoreChart.tsx` | Add weightage to interface, update YAxis formatter |
| `src/pages/Dashboard.tsx` | Pass weightage in categoryMetrics |
| `src/pages/SelfReview.tsx` | Pass weightage in categoryMetrics |
| `src/pages/reports/PerformanceReport.tsx` | Add weightage to data, update YAxis |
| `src/lib/pdfExport.ts` | Update drawCategoryChart to show weightage |
| `DOCUMENTATION.md` | Document the enhancement |
