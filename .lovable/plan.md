

## Add Org KPI & Bi-Monthly/Quarterly Badges to Manager and Skip-Level Review Tabs

### Problem
The Self-Review tab (`pending_self_review`) shows three badge breakdowns on employee cards: "pending self", "org KPI", and "bi-monthly/quarterly". The Manager Review (`pending_manager_review`) and Skip-Level Review (`pending_skip_review`) tabs only show a single "pending mgr" / "pending skip" badge with no org KPI or frequency breakdown.

### Changes

#### File: `src/components/review/EmployeeSelectorGrid.tsx`

1. **Per-employee stats (lines 374-383)**: Update `pending_manager_review` and `pending_skip_review` branches in `getKpiStats` to compute `orgKpiCount` and `nonMonthlyCount` on pending KPIs (same pattern as `pending_self_review`):
   - Manager: filter by `status === 'self_review'`, then split into regular / org / non-monthly
   - Skip: filter by `status === 'manager_check'`, then split similarly

2. **Aggregate stats (lines 637-642)**: Update the corresponding branches in the `useMemo` stats block to also return `stat2: orgKpiCount` and `stat3: nonMonthlyCount` (matching self-review pattern).

3. **Badge rendering (lines 974-993)**: Remove the `viewLevel === 'pending_self_review'` guard on the org KPI and bi-monthly/quarterly badges so they render for all three pending view levels. The condition becomes simply `(kpiStats as any).orgKpiCount > 0` and `(kpiStats as any).nonMonthlyCount > 0`.

4. **Badge label adjustment**: Keep the first badge label dynamic per level ("pending self" / "pending mgr" / "pending skip") and show it even when 0 if org or non-monthly counts exist (same logic already used for self-review).

### No database changes needed

