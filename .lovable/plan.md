

# RCA: Workflow Config Change Not Reflected on Dashboard

## Root Cause

The dashboard resolves each employee's workflow stages via the `get_employee_workflow` (single) and `get_bulk_employee_workflows` (bulk) RPCs. These RPCs support **period-aware resolution** — they accept optional `p_review_period` and `p_review_year` parameters. When provided, they check period-specific overrides first before falling back to global config.

**The bug: neither call passes the period parameters.**

| Component | Hook call | Period params passed? |
|---|---|---|
| `UnifiedScorecard.tsx` line 193 | `useEmployeeWorkflowStages(employee.id)` | **No** — missing `selectedPeriod`, `selectedYear` |
| `EmployeeSelectorGrid.tsx` line 173 | `useBulkEmployeeWorkflows(allEmployeeIds)` | **No** — missing period params |

Because the period parameters are omitted, the RPC always resolves the **global** workflow config and ignores any period-specific override set for Bhoopendra (101131). The admin set the workflow override with a specific period scope, but the dashboard fetches the global fallback — hence the old workflow still appears.

## CAPA (Corrective and Preventive Action)

### Corrective Fix (2 files)

**1. `src/components/review/UnifiedScorecard.tsx`** — Pass period to `useEmployeeWorkflowStages`:

```diff
- const { data: workflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(employee.id);
+ const { data: workflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
```

`selectedPeriod` and `selectedYear` are already available (lines 173-174).

**2. `src/components/review/EmployeeSelectorGrid.tsx`** — Pass period to `useBulkEmployeeWorkflows`:

```diff
- const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds);
+ const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds, periodSelection.selectedMonth, periodSelection.selectedYear);
```

`periodSelection` is already a prop of this component.

### Preventive: Cache key alignment

The hooks already include period params in their query keys (lines 102-103, 430), so once we pass the params, the cache will correctly differentiate between periods. No additional cache invalidation work needed.

### Impact

- Dashboard will immediately resolve the correct period-specific workflow for any employee
- Switching periods in the selector will correctly show different workflows if configured per-period
- No database changes required — the RPCs already support this; the frontend simply wasn't using the feature

