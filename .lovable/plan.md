

## Make Push Forward Workflow-Aware (Employee-Level)

### Key Insight
Workflow is **per-employee**, not per-KPI. All KPIs for the same employee share the same workflow stages. This simplifies the validation — we fetch the workflow once per unique employee, not per KPI.

### Changes

#### 1. `src/hooks/usePendingSelfReviews.ts` — `useBulkPushForward`

Update the mutation to:
- Group incoming KPI IDs by `employeeId` (requires passing employee info)
- For each **unique employee**, call `get_employee_workflow` RPC once to get their stages
- Validate that `targetStatus` exists in that employee's workflow and is ahead of the current status
- Skip all KPIs for employees whose workflow doesn't include the target stage
- Return `{ forwarded, skipped }` counts

Change the mutation signature from:
```
{ kpiIds, targetStatus, adminId, currentStatusLabel }
```
to:
```
{ kpiItems: Array<{ kpiId: string; employeeId: string }>, targetStatus, adminId, currentStatusLabel }
```

Core logic per unique employee:
```text
1. Fetch workflow stages via RPC (once per employee)
2. Check if targetStatus exists in stages
3. Check if targetStatus is ahead of current KPI status
4. If invalid → skip all that employee's KPIs, increment skipped count
5. If valid → push all that employee's KPIs forward
```

Update toast to show: `"Pushed X KPI(s) forward. Y skipped (workflow mismatch)."`

#### 2. `src/pages/admin/PendingSelfReviews.tsx` — Handlers

Update `handlePushForwardSelected` and `handlePushForwardAll` to pass `kpiItems` (with `employeeId` from `OverdueKpi`) instead of just `kpiIds`. The `OverdueKpi` interface already has `employeeId`.

### No database changes needed

