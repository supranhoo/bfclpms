

# Fix: Org KPI Propagation Not Reaching Employee Scorecards

## Root Cause (Confirmed via Database Investigation)

There are **33 KPIs** in the database where:
- `org_kpi_values` has data (`achieved_value` populated, `status = propagated/approved`)
- But the `kpis` table still shows `status = kra_set`
- And `review_submissions` has NO record (no self_score, no achieved_value)

This means the propagation RPC was **never actually called** for these employees, but their `org_kpi_values.status` was incorrectly set to `propagated`.

### The Bug (in `OrgKpiDataEntry.tsx`, lines 578-586)

After the propagation loop, the handler runs a **blanket status update**:

```javascript
await supabase
  .from('org_kpi_values')
  .update({ status: 'propagated' })
  .eq('category_id', kpi.category_id)
  .eq('kra_name', kpi.kra_name)
  .eq('kpi_name', kpi.kpi_name)
  .eq('review_period', selectedPeriod)
  .eq('review_year', selectedYear);
```

This marks ALL org_kpi_values rows as `propagated` — including employees that were **skipped** in the loop (because `sv.achievedValue === null && !sv.isNa`). Those employees never had the RPC called, so their `kpis.status` stays at `kra_set` and `review_submissions` remains empty. The UI then shows the achieved value (read from org_kpi_values) but no self score (read from review_submissions).

## Plan

### 1. Fix the blanket status update (`OrgKpiDataEntry.tsx`)

Instead of updating all rows, only update rows for employees that were actually propagated. Track which employee IDs were propagated in the loop, then update org_kpi_values only for those specific employee_ids.

### 2. Data repair: Fix 33 broken KPIs

Write a one-time repair in the `handleCardSaveAndPropagate` flow — or more practically, add a **"Re-propagate"** action that detects and fixes these orphaned entries. The approach:
- Query for org_kpi_values where `status = propagated` but the corresponding `kpis.status = kra_set` and `review_submissions` is missing
- For each, call the propagation RPC to actually push the data through

This will be implemented as a backend function that can be triggered from the Org KPI Data Entry page.

### 3. Add a "Fix Orphaned Propagations" utility

Add a button/action on the Org KPI Data Entry page (admin only) that:
- Detects the 33 broken records
- Re-runs propagation for each
- Reports results

## Files to Modify

- **`src/pages/admin/OrgKpiDataEntry.tsx`** — Fix the blanket status update to only mark actually-propagated employees; add repair utility
- **`src/hooks/usePropagateOrgKpiValue.ts`** — No changes needed (RPC logic is correct)

## Technical Details

The status update fix:
```javascript
// Track propagated employee IDs
const propagatedEmployeeIds: string[] = [];
for (const sv of values.scopedValues) {
  if (sv.achievedValue === null && !sv.isNa) continue;
  await propagate.mutateAsync({...});
  propagatedEmployeeIds.push(sv.scopeId);
}

// Only update status for actually-propagated employees
for (const empId of propagatedEmployeeIds) {
  await supabase
    .from('org_kpi_values')
    .update({ status: 'propagated', updated_at: new Date().toISOString() })
    .eq('category_id', kpi.category_id)
    .eq('kra_name', kpi.kra_name)
    .eq('kpi_name', kpi.kpi_name)
    .eq('review_period', selectedPeriod)
    .eq('review_year', selectedYear)
    .eq('employee_id', empId);
}
```

