

# Plan: Dynamic Category Weightage from KPI Weightages

## Summary

Replace the static `kra_categories.weightage` with dynamically calculated category weightage by summing the individual KPI weightages assigned to each category for the specific employee. This ensures the chart accurately reflects the actual weight distribution for each employee's scorecard.

## How It Works

```text
Example - Employee has these KPIs:

HR Operations Category:
  - KPI 1: 15% weightage
  - KPI 2: 10% weightage  
  - KPI 3: 5% weightage
  Category Total: 30%

Compliance Category:
  - KPI 4: 25% weightage
  - KPI 5: 20% weightage
  Category Total: 45%

Training Category:
  - KPI 6: 15% weightage
  - KPI 7: 10% weightage
  Category Total: 25%

Chart Display:
┌──────────────────────────────────────────────────┐
│ Compliance (45%)           █████████    60%      │
│ HR Operations (30%)        ████████████  75%     │
│ Training (25%)             ███████      50%      │
└──────────────────────────────────────────────────┘
```

## Files to Modify

### 1. Dashboard.tsx (Lines 126-131)

**Current**: Uses static `cat.weightage`
**Change**: Calculate from sum of KPI weightages

```tsx
// BEFORE
return {
  name: cat.name,
  percentage: max > 0 ? (achieved / max) * 100 : 0,
  color: cat.color,
  count: catKpis.length,
  weightage: cat.weightage,  // Static from kra_categories table
};

// AFTER
// Calculate category weightage from sum of KPI weightages
const categoryWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

return {
  name: cat.name,
  percentage: max > 0 ? (achieved / max) * 100 : 0,
  color: cat.color,
  count: catKpis.length,
  weightage: categoryWeightage,  // Dynamic from KPIs
};
```

### 2. SelfReview.tsx (Lines 234-239)

**Same change as Dashboard**

```tsx
// Calculate category weightage from sum of KPI weightages
const categoryWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

return {
  name: cat.name,
  percentage: max > 0 ? (achieved / max) * 100 : 0,
  color: cat.color,
  count: catKpis.length,
  weightage: categoryWeightage,
};
```

### 3. EmployeeScorecard.tsx (Lines 108-142)

**Current**: Stores static `categoryWeightage` from `kpi.kra_categories?.weightage`
**Change**: Accumulate KPI weightages per category

```tsx
// Update the categoryMap to track dynamic weightage
const categoryMap = new Map<string, { 
  totalScore: number; 
  totalWeight: number; 
  color: string | null;
  dynamicWeightage: number;  // CHANGED: Sum of KPI weightages
}>();

// In the forEach loop:
const existing = categoryMap.get(categoryName) || { 
  totalScore: 0, 
  totalWeight: 0, 
  color: categoryColor,
  dynamicWeightage: 0  // Start at 0
};

// Add KPI weightage to category's dynamic total
if (weight > 0) {
  existing.dynamicWeightage += weight;  // NEW: Accumulate
  if (score > 0) {
    existing.totalScore += score * weight;
  }
  existing.totalWeight += weight;
}

// In categoryScores mapping:
const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
  name,
  percentage: data.totalWeight > 0 ? ((data.totalScore / data.totalWeight) / 5) * 100 : 0,
  color: data.color,
  weightage: data.dynamicWeightage,  // Use accumulated weightage
}));
```

### 4. ManagementScorecard.tsx (Lines 99-133)

**Same change as EmployeeScorecard**

### 5. PerformanceReport.tsx (Lines 44-61)

**Change**: Calculate from sum of KPI weightages per category

```tsx
// Calculate dynamic weightage from KPIs
const dynamicWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

return {
  name: cat.name,
  avgScore: count > 0 ? Math.round(totalScore / count) : 0,
  kpiCount: catKpis.length,
  color: cat.color,
  weightage: dynamicWeightage,  // Dynamic from KPIs
};
```

### 6. pdfExport.ts

Update the `CategoryMetric` interface usage to receive dynamic weightage (already receives `weightage` field, just need to ensure callers pass dynamic value).

### 7. DOCUMENTATION.md

Update to explain that category weightage is dynamically calculated from the sum of individual KPI weightages assigned to each category.

## Technical Details

| File | Current Source | New Source |
|------|---------------|------------|
| Dashboard.tsx | `cat.weightage` | `catKpis.reduce((sum, kpi) => sum + (kpi.weightage \|\| 0), 0)` |
| SelfReview.tsx | `cat.weightage` | Same dynamic calculation |
| EmployeeScorecard.tsx | `kpi.kra_categories?.weightage` | Accumulate in loop |
| ManagementScorecard.tsx | `kpi.kra_categories?.weightage` | Accumulate in loop |
| PerformanceReport.tsx | `cat.weightage` | Same dynamic calculation |

## Benefits

1. **Accuracy**: Reflects actual weight distribution per employee
2. **Flexibility**: Automatically adjusts when KPIs are added/removed
3. **Per-Employee**: Different employees see their unique category weightage
4. **No DB Changes**: Works with existing data structure

