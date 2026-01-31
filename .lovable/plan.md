
# Plan: Show All Categories with Weightage in Performance by Category Charts

## Summary

Update the "Performance by Category" chart across all dashboards to:
1. Show all KRA categories that have at least one KPI assigned to the employee (for the selected period)
2. Always display the category weightage as "Category Name (X%)"
3. Show 0% performance bar for categories with no submitted scores yet

## Current Issues Identified

| Location | Current Behavior | Issue |
|----------|-----------------|-------|
| Dashboard | Filters out categories with `count === 0` | Missing categories without KPIs |
| SelfReview | Filters out categories with `count === 0` | Same as above |
| EmployeeScorecard | Builds categories only from submitted scores | Missing categories and **no weightage** |
| ManagementScorecard | Same as EmployeeScorecard | Missing categories and **no weightage** |
| PerformanceReport | Filters out categories with `kpiCount === 0` | Missing categories |

## Solution Approach

### Logic: "Show category if employee has at least one KPI in that category"

For each dashboard/scorecard:
1. Get all unique categories from the employee's KPIs (not just scored ones)
2. Include category weightage from the `kra_categories` table
3. Calculate score percentage (0% if no scores submitted yet)
4. Pass weightage to `CategoryScoreChart` for label formatting

## Files to Modify

### 1. `src/pages/Dashboard.tsx`
**Change**: Remove the `.filter(c => c.count > 0)` filter

```tsx
// Line 133 - Before
}).filter(c => c.count > 0).sort((a, b) => b.percentage - a.percentage);

// After
}).sort((a, b) => b.percentage - a.percentage);
```

Wait, the user wants to show categories **only if any KPI is mapped**. So we should keep the filter but ensure the logic is correct. Actually, re-reading the requirement:

> "This should show category only with weightage and if any KPI is mapped with the employee"

This means: Show categories that have weightage defined AND have at least one KPI mapped. The current filter is correct, but we need to ensure all locations include the weightage.

### 2. `src/pages/SelfReview.tsx`
**Current**: Already has weightage, filters by count > 0 ✓
**Verify**: The filter logic is correct for the requirement

### 3. `src/components/review/EmployeeScorecard.tsx` (Lines 103-140)
**Issue**: Builds categories dynamically from scored KPIs only, no weightage
**Fix**: Fetch all categories, compute scores from KPIs, include weightage

Current logic:
```tsx
const categoryMap = new Map<string, { totalScore: number; totalWeight: number; color: string | null }>();

kpis.forEach(kpi => {
  // Only adds to map if score > 0 and weight > 0
});

const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
  name,
  percentage: data.totalWeight > 0 ? ((data.totalScore / data.totalWeight) / 5) * 100 : 0,
  color: data.color,
}));
```

**Updated logic**:
```tsx
// Build category map from ALL KPIs (not just scored ones)
const categoryMap = new Map<string, { 
  totalScore: number; 
  totalWeight: number; 
  color: string | null;
  weightage: number | null;
}>();

kpis.forEach(kpi => {
  const categoryName = kpi.kra_categories?.name || 'Other';
  const categoryColor = kpi.kra_categories?.color || null;
  const categoryWeightage = kpi.kra_categories?.weightage || null;
  
  const existing = categoryMap.get(categoryName) || { 
    totalScore: 0, 
    totalWeight: 0, 
    color: categoryColor,
    weightage: categoryWeightage
  };
  
  const submission = submissionMap.get(kpi.id);
  if (!submission?.is_na) {
    const score = submission?.manager_score || submission?.self_score || 0;
    const weight = kpi.weightage || 0;
    existing.totalScore += score * weight;
    existing.totalWeight += weight * 5; // Max possible
  }
  
  categoryMap.set(categoryName, existing);
});

const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
  name,
  percentage: data.totalWeight > 0 ? (data.totalScore / data.totalWeight) * 100 : 0,
  color: data.color,
  weightage: data.weightage,
}));
```

### 4. `src/components/review/ManagementScorecard.tsx` (Lines 94-131)
**Same issue as EmployeeScorecard** - apply identical fix

### 5. `src/pages/reports/PerformanceReport.tsx`
**Current**: Has weightage, filters by kpiCount > 0
**This is correct** for the requirement - keep as is

### 6. `DOCUMENTATION.md`
Update to reflect that:
- All dashboards show category weightage in charts
- Categories appear if the employee has at least one KPI mapped to that category

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

## Technical Changes Summary

| File | Change |
|------|--------|
| `src/components/review/EmployeeScorecard.tsx` | Update `scoreData` calculation to include all categories with KPIs and add weightage |
| `src/components/review/ManagementScorecard.tsx` | Same update as EmployeeScorecard |
| `DOCUMENTATION.md` | Update chart feature documentation |

Note: Dashboard, SelfReview, and PerformanceReport already have the correct logic - they already include weightage and filter to categories with KPIs.
