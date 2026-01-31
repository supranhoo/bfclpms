
## Summary

Show all KRA categories with their weightage in the "Performance by Category" chart on the Dashboard, even when there are no KPIs or scores for that category. Currently, categories without any KPIs are filtered out.

## Current Behavior

The `categoryMetrics` calculation in `Dashboard.tsx` (line 133) filters out categories with no KPIs:

```tsx
.filter(c => c.count > 0)  // This removes categories without KPIs
```

This means if a category has a weightage defined but no KPIs assigned for the selected period, it won't appear in the chart.

## Proposed Change

Remove the filter so all categories appear, showing:
- Category Name (Weightage%) - for consistency
- 0% score bar when no data exists

### File: `src/pages/Dashboard.tsx`

**Line 133 - Remove the count filter:**

```tsx
// BEFORE
}).filter(c => c.count > 0).sort((a, b) => b.percentage - a.percentage);

// AFTER
}).sort((a, b) => b.percentage - a.percentage);
```

This will:
1. Show all categories from `kra_categories` table
2. Display each with its weightage (e.g., "HR Operations (30%)")
3. Show 0% bar for categories with no KPIs
4. Allow users to see the full category structure and weights at a glance

## Visual Result

```text
BEFORE (categories without KPIs hidden):
┌──────────────────────────────────────────────────┐
│ HR Operations (30%)        ████████████  75%     │
│ Compliance (25%)           █████████    60%      │
└──────────────────────────────────────────────────┘

AFTER (all categories visible):
┌──────────────────────────────────────────────────┐
│ HR Operations (30%)        ████████████  75%     │
│ Compliance (25%)           █████████    60%      │
│ Training (20%)             ░░░░░░░░░░    0%      │  ← Now visible with weightage
│ Innovation (15%)           ░░░░░░░░░░    0%      │  ← Now visible with weightage
│ Leadership (10%)           ░░░░░░░░░░    0%      │  ← Now visible with weightage
└──────────────────────────────────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Remove `.filter(c => c.count > 0)` from categoryMetrics |
| `DOCUMENTATION.md` | Update to note all categories display regardless of KPI assignment |
