
# Plan: Show All Categories with Weightage in Performance by Category Charts

## Status: ✅ COMPLETED

## Summary

Updated the "Performance by Category" chart across all dashboards to:
1. Show all KRA categories that have at least one KPI assigned to the employee (for the selected period)
2. Always display the category weightage as "Category Name (X%)"
3. Show 0% performance bar for categories with no submitted scores yet

## Files Modified

| File | Change |
|------|--------|
| `src/components/review/EmployeeScorecard.tsx` | Updated `scoreData` calculation to include all categories with KPIs and add weightage |
| `src/components/review/ManagementScorecard.tsx` | Same update as EmployeeScorecard |
| `DOCUMENTATION.md` | Updated chart feature documentation |

## Technical Changes

### EmployeeScorecard.tsx & ManagementScorecard.tsx

Changed the category mapping logic to:
1. Always add categories to the map when iterating KPIs (not just when score > 0)
2. Track `totalWeight` per category even for unscored KPIs
3. Include `weightage` field from `kra_categories` in the returned data
4. Calculate percentage correctly when no scores exist (0%)

```tsx
// Build category map from ALL KPIs (not just scored ones)
const categoryMap = new Map<string, { 
  totalScore: number; 
  totalWeight: number; 
  color: string | null;
  weightage: number | null;
}>();

kpis.forEach(kpi => {
  // Always add to category map (even if score is 0)
  const existing = categoryMap.get(categoryName) || { 
    totalScore: 0, 
    totalWeight: 0, 
    color: categoryColor,
    weightage: categoryWeightage
  };
  
  if (weight > 0) {
    if (score > 0) {
      existing.totalScore += score * weight;
    }
    existing.totalWeight += weight;
  }
  
  categoryMap.set(categoryName, existing);
});
```

## Visual Result

```text
Employee Scorecard - BEFORE:
┌──────────────────────────────────────────────────┐
│ HR Operations              ████████████  75%     │
└──────────────────────────────────────────────────┘
(Only 1 category shown because others have no scores yet)

Employee Scorecard - AFTER:
┌──────────────────────────────────────────────────┐
│ HR Operations (30%)        ████████████  75%     │
│ Compliance (25%)           ░░░░░░░░░░    0%      │ ← Has KPIs but no scores yet
│ Training (20%)             ░░░░░░░░░░    0%      │ ← Has KPIs but no scores yet
└──────────────────────────────────────────────────┘
(All categories with KPIs mapped shown, with weightage)
```

## Notes

- Dashboard.tsx, SelfReview.tsx, and PerformanceReport.tsx already had the correct logic (filtering by count > 0, including weightage)
- The CategoryScoreChart component already supports weightage display via `tickFormatter`
