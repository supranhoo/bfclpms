
# Plan: Compact Review Status Tracker with Query Indicators

## Summary

Create a compact, reusable "Review Status Tracker" component that shows KPI workflow progress and query indicators. Add this to all scorecards (Employee, Audit, Management) with reduced height and visual indicators for which level has open queries.

---

## Current State

The Dashboard page has a "Review Status" card that shows progress across stages:

```text
+--------------------------------------------------------------+
| Review Status                                                 |
| Progress across review stages                                |
|                                                              |
| [KRA Set]    [Self Review]   [Manager]   [Audit]   [Approved]|
| =========    ============    ========    =======   =========  |
|     4              0            2           1          2      |
+--------------------------------------------------------------+
```

**Issues:**
- Takes too much vertical space
- Not reusable across scorecards
- Doesn't show query indicators

---

## Solution

Create a compact "ReviewStatusTracker" component:

```text
+------------------------------------------------------------------+
| Review Progress                                     2 open queries|
| [KRA Set: 4] [Self: 0●] [Manager: 2] [Audit: 1●] [Approved: 2]   |
+------------------------------------------------------------------+
```

Key features:
1. **Compact single-row design** - badges with counts inline
2. **Progress bar** underneath showing overall completion
3. **Query indicator (●)** - dot on stages with open queries
4. **Reusable** - works in Dashboard, EmployeeScorecard, AuditScorecard, ManagementScorecard

---

## Implementation

### 1. Create ReviewStatusTracker Component

**File:** `src/components/review/ReviewStatusTracker.tsx`

```tsx
interface ReviewStatusTrackerProps {
  kpis: KPI[];
  queries?: KpiQuery[];
  compact?: boolean;  // For scorecards: even more compact
}

export function ReviewStatusTracker({ kpis, queries = [], compact = false }: ReviewStatusTrackerProps) {
  // Calculate counts per status
  const statusCounts = useMemo(() => {
    const counts = {
      kra_set: 0,
      self_review: 0,
      manager_check: 0,
      audit: 0,
      management_review: 0,
      approved: 0,
    };
    kpis.forEach(k => {
      if (k.status && counts.hasOwnProperty(k.status)) {
        counts[k.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [kpis]);

  // Determine which levels have open queries
  // Query raiser role determines which stage badge gets the indicator
  // raised_by's role: manager → manager_check, auditor → audit, management → management_review
  const queryIndicators = useMemo(() => {
    const indicators: Record<string, number> = {};
    const openQueries = queries.filter(q => q.status === 'open');
    openQueries.forEach(q => {
      // We'll need to join with profiles to get raiser info
      // For now, we can infer from KPI status when query was raised
      // or track open query count per KPI status
    });
    return indicators;
  }, [queries]);

  // Calculate completion percentage
  const total = kpis.length;
  const approved = statusCounts.approved;
  const completionPercent = total > 0 ? (approved / total) * 100 : 0;

  return (
    <Card className={compact ? "" : ""}>
      <CardContent className="py-2 px-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">Review Progress</span>
          {openQueryCount > 0 && (
            <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px] px-1.5">
              <MessageSquare className="h-3 w-3 mr-1" />
              {openQueryCount} queries
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {stages.map(stage => (
            <Badge 
              key={stage.key} 
              variant="outline" 
              className={cn(stage.colorClass, "text-[10px] px-1.5 py-0 relative")}
            >
              {stage.shortLabel}: {statusCounts[stage.key]}
              {stage.hasQuery && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500" />
              )}
            </Badge>
          ))}
        </div>
        <Progress value={completionPercent} className="h-1" />
      </CardContent>
    </Card>
  );
}
```

### 2. Status Stage Configuration

```tsx
const stages = [
  { key: 'kra_set', shortLabel: 'KRA', colorClass: 'bg-muted text-muted-foreground' },
  { key: 'self_review', shortLabel: 'Self', colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { key: 'manager_check', shortLabel: 'Mgr', colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  { key: 'audit', shortLabel: 'Audit', colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { key: 'management_review', shortLabel: 'Mgmt', colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  { key: 'approved', shortLabel: 'Done', colorClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
];
```

### 3. Query Level Detection

To show which level raised the query, we need to look at the KPI's status at the time of query (stored in metadata) OR use the raiser's role. Since queries are raised by Manager/Auditor/Management, we can:

1. Join `kpi_queries.raised_by` with `user_roles` to get the raiser's role
2. Map role to stage: manager → manager_check, auditor → audit, management → management_review

For simplicity, we'll pass query information and compute indicators based on open query count per KPI's current status:

```tsx
// Group open queries by KPI, then by KPI's current status
const queriesByStage = useMemo(() => {
  const stageQueries: Record<string, number> = {};
  
  queries.filter(q => q.status === 'open').forEach(query => {
    const kpi = kpis.find(k => k.id === query.kpi_id);
    if (kpi) {
      // Show indicator on the previous stage (where query was raised)
      // If KPI is in self_review, query was raised by manager at manager_check
      const stage = kpi.status || 'kra_set';
      stageQueries[stage] = (stageQueries[stage] || 0) + 1;
    }
  });
  
  return stageQueries;
}, [queries, kpis]);
```

### 4. Integration Points

**Dashboard.tsx** - Replace existing Review Status card:
```tsx
// Replace lines 308-335 with:
<ReviewStatusTracker kpis={fullyFilteredKpis} queries={[]} />
```

**EmployeeScorecard.tsx** - Add after header, before stats:
```tsx
<ReviewStatusTracker kpis={kpis} queries={queries} compact />
```

**AuditScorecard.tsx** - Add after header:
```tsx
<ReviewStatusTracker kpis={kpis} queries={queries} compact />
```

**ManagementScorecard.tsx** - Add after header:
```tsx
<ReviewStatusTracker kpis={kpis} queries={queries} compact />
```

---

## Visual Design

### Regular Mode (Dashboard)
```text
+------------------------------------------------------------------+
| Review Progress                              ⚠ 2 open queries    |
| [KRA: 4] [Self: 0] [Mgr: 2●] [Audit: 1●] [Mgmt: 0] [Done: 2]    |
| ============================================                      |
+------------------------------------------------------------------+
```

### Compact Mode (Scorecards)
```text
+------------------------------------------------------+
| [KRA: 4] [Self: 0] [Mgr: 2●] [Audit: 1] [Done: 2]  ⚠2|
| =====================================================|
+------------------------------------------------------+
```

**Query indicator (●)**: Orange dot appears on badge when that stage has open queries

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/ReviewStatusTracker.tsx` | Reusable status tracker component |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Replace verbose Review Status card with compact tracker |
| `src/components/review/EmployeeScorecard.tsx` | Add ReviewStatusTracker after header |
| `src/components/review/AuditScorecard.tsx` | Add ReviewStatusTracker after header |
| `src/components/review/ManagementScorecard.tsx` | Add ReviewStatusTracker after header |
| `DOCUMENTATION.md` | Document the new component |

---

## Height Comparison

| Location | Before | After |
|----------|--------|-------|
| Dashboard | ~120px (card with 5 items, progress bars) | ~56px (single row with badges + 1 progress bar) |
| Scorecards | N/A (not present) | ~48px (compact inline badges) |

---

## Technical Notes

1. **Query Detection**: We use KPI status to determine which review stage the open query belongs to
2. **Dark Mode**: All badge colors already have dark mode variants in the existing status color maps
3. **Responsive**: Badges wrap on narrow screens, maintaining readability
4. **Performance**: Uses useMemo for count calculations, minimal re-renders

---

## Testing Checklist

- [ ] Dashboard shows compact Review Status Tracker
- [ ] Status counts are accurate for filtered KPIs
- [ ] Query indicator (●) appears on correct stage badges
- [ ] Total open queries count shown in corner
- [ ] Progress bar shows completion percentage
- [ ] EmployeeScorecard shows tracker after header
- [ ] AuditScorecard shows tracker after header
- [ ] ManagementScorecard shows tracker after header
- [ ] Dark mode renders correctly
- [ ] Mobile layout wraps badges properly
