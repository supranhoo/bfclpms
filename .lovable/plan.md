

# Fix: Category Performance Chart Not Updating with Status Filter

## Root Cause

In the **My Dashboard**, the category chart is computed from `fullyFilteredKpis` which incorporates the `statusFilter`. When you click "KRA Set" or "Self Review" in the workflow tracker, the category chart updates accordingly.

In **all four reviewer scorecards** (UnifiedScorecard, AuditScorecard, ManagementScorecard, EmployeeScorecard), the `scoreData.categoryScores` is always computed from the **raw unfiltered `kpis` array**. The `statusFilter` is only applied to the KPI table/list -- the charts completely ignore it.

```text
My Dashboard:
  statusFilter --> fullyFilteredKpis --> categoryMetrics --> CategoryScoreChart  (WORKS)

All Scorecards:
  statusFilter --> sortedKpis (table only)
  kpis (unfiltered) --> scoreData.categoryScores --> CategoryScoreChart  (BROKEN)
```

## Fix Plan

For each scorecard, update the `scoreData` useMemo to use filtered KPIs instead of raw KPIs, and similarly update the OverallScoreChart data source.

### File 1: `src/components/review/UnifiedScorecard.tsx`

- Create a `displayKpis` variable: `statusFilter ? kpis.filter(k => k.status === statusFilter) : kpis`
- Update `scoreData` useMemo (line 316) to iterate over `displayKpis` instead of `kpis`
- Add `statusFilter` to the useMemo dependency array
- Pass `displayKpis` to `WorkflowProgressTracker` count source remains unfiltered (full `kpis`)

### File 2: `src/components/review/AuditScorecard.tsx`

Same pattern:
- Create `displayKpis` filtered by `statusFilter`
- Update `scoreData` useMemo (line 189) to use `displayKpis`
- Add `statusFilter` to dependencies

### File 3: `src/components/review/ManagementScorecard.tsx`

Same pattern:
- Create `displayKpis` filtered by `statusFilter`
- Update `scoreData` useMemo (line 189) to use `displayKpis`
- Add `statusFilter` to dependencies

### File 4: `src/components/review/EmployeeScorecard.tsx`

Same pattern:
- Create `displayKpis` filtered by `statusFilter`
- Update `scoreData` useMemo (line 192) to use `displayKpis`
- Add `statusFilter` to dependencies

### File 5: `DOCUMENTATION.md`

Document that the Performance by Category chart and Overall Score chart now respond to the workflow status filter across all dashboards.

## Technical Detail

The change in each scorecard follows this pattern:

```typescript
// NEW: filtered KPIs for charts
const displayKpis = useMemo(() => {
  if (!kpis) return [];
  return statusFilter ? kpis.filter(k => k.status === statusFilter) : kpis;
}, [kpis, statusFilter]);

// UPDATED: scoreData uses displayKpis instead of kpis
const scoreData = useMemo(() => {
  if (!displayKpis.length || !submissions) return { overallScore: 0, rating: 0, categoryScores: [] };
  
  displayKpis.forEach(kpi => {
    // ... existing scoring logic unchanged ...
  });
  
  // ...
}, [displayKpis, submissions, submissionMap]);  // kpis replaced with displayKpis
```

Important: The `WorkflowProgressTracker` must still receive the full unfiltered `kpis` array so the stage count badges remain accurate regardless of filter state.

## Summary

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Add `displayKpis` filtered by statusFilter; use in scoreData |
| `src/components/review/AuditScorecard.tsx` | Same |
| `src/components/review/ManagementScorecard.tsx` | Same |
| `src/components/review/EmployeeScorecard.tsx` | Same |
| `DOCUMENTATION.md` | Document chart-filter sync behavior |
