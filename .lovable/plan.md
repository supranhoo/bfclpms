

## Fix: DirectReporteesMonitor Includes N/A KPIs in Score Calculation

### Root Cause

The `DirectReporteesMonitor` query does **not** fetch or check `is_na` from `review_submissions`. When a KPI is marked N/A, `final_score` is set to NULL, but the fallback chain (`management_score ?? auditor_score ?? manager_score ?? self_score`) picks up a stale 0 score from a prior review stage.

**Example — Jaspal, December:**
- "Fulfillment of Vacant Positions" (weightage 14) is `is_na = true`, `final_score = NULL`, but `auditor_score = 0`
- Dashboard correctly excludes it → weighted avg = 345/81 = **4.26**
- Monitor includes it with score 0 → weighted avg = 345/95 = **3.63** (shown as 3.6)

This affects every employee who has N/A KPIs.

### Fix — `src/components/management/DirectReporteesMonitor.tsx`

#### 1. Add `is_na` to the KPI select (line 113)

```sql
review_submissions (final_score, management_score, auditor_score, manager_score, self_score, is_na)
```

#### 2. Skip N/A KPIs in the aggregation loop (line 124-134)

Add an early return when `is_na` is true:

```typescript
allKpis.forEach(kpi => {
  const s = kpi.review_submissions;
  if (s?.is_na) return;  // ← new line
  const score = ...
```

### No other changes needed

This is a 2-line fix. The dashboard's scoring engine already handles N/A exclusion correctly; only this monitor widget was missing it.

