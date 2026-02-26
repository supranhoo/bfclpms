
# Fix: Audit KPI Assignment Badge Not Rendering for Auditors (v1.46.28)

## Root Cause

In `UnifiedScorecard.tsx`, the `useAuditKpiAssignments` hook is called with `allKpis` (ALL KPIs across ALL periods — up to 138+ per employee), instead of `kpis` (period-filtered, typically ~23).

This creates a Supabase `.in('kpi_id', [...138 UUIDs])` query that generates a URL exceeding PostgREST's URL length limit (~4000-5000 chars). The request silently fails or returns empty data. The result: `auditKpiAssignments` is an empty Map, so no badges render.

The old `AuditScorecard` component works because it uses period-filtered `kpiIds` (line 137-141), which is only ~20-30 IDs.

## Solution

Change `auditKpiIdList` in `UnifiedScorecard.tsx` to use `kpis` (period-filtered) instead of `allKpis`. Move its declaration below the `kpis` computation (line 220).

## Changes

### `src/components/review/UnifiedScorecard.tsx`

1. **Remove** the current `auditKpiIdList` + `useAuditKpiAssignments` block at lines 173-175
2. **Add** the same logic after `kpis` is defined (after line 224), using `kpis` instead of `allKpis`:

```typescript
const auditKpiIdList = useMemo(() => (kpis || []).map(k => k.id), [kpis]);
const { data: auditKpiAssignments } = useAuditKpiAssignments(
  viewLevel === 'auditor' ? auditKpiIdList : []
);
```

This reduces the `.in()` clause from 138+ IDs to ~23, well within URL limits.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only query change |
| Regression | None | Only affects which KPI IDs are queried; badges only matter for displayed KPIs |
| Performance | Improved | Fewer IDs = smaller query = faster response |
