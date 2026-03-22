

## Fix: Show All Categories in Bar Chart (Including 0/NA/Unscored)

### Root Cause
Line 513: `if (!submission || submission.is_na) return;` skips KPIs without submissions or marked N/A. If an entire category only has such KPIs, it never gets added to `categoryMap` and doesn't appear in the chart.

### Fix

#### File: `src/components/review/UnifiedScorecard.tsx` (lines 511-537)

**Change**: Always add every KPI's category to the map, but only contribute to score numerator/denominator for scored KPIs.

```typescript
displayKpis.forEach(kpi => {
  const submission = submissionMap.get(kpi.id);
  const categoryName = kpi.kra_categories?.name || 'Other';
  const categoryColor = kpi.kra_categories?.color || null;
  
  const existing = categoryMap.get(categoryName) || { 
    totalScore: 0, totalWeight: 0, color: categoryColor, dynamicWeightage: 0
  };
  
  const weight = kpi.weightage || 0;
  existing.dynamicWeightage += weight;
  
  // Only contribute to scores if submission exists and not NA
  if (submission && !submission.is_na) {
    const score = getRelevantScore(submission, kpi.status);
    if (weight > 0) {
      totalWeightedScore += score * weight;
      totalWeight += weight;
      existing.totalScore += score * weight;
      existing.totalWeight += weight;
    }
  }
  
  categoryMap.set(categoryName, existing);
});
```

This ensures every category appears on the Y-axis with its weightage, showing 0% if no KPIs are scored yet.

### No database changes needed

