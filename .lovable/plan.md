

## Root Cause Analysis (RCA)

### Issue 1: Employee visible in HR PMS panel despite workflow not including HR PMS stage

**Root Cause**: `useProfilesByWorkflowStage` in `src/hooks/useOrganization.ts` (line 293) calls `get_bulk_employee_workflows` **without passing `p_review_period` and `p_review_year`**. This means it always resolves workflows using the global/default configuration — not the period-specific one.

So if Bhoopendra's **global** (or older) workflow includes `hr_pms_review`, he appears in the HR PMS panel even though his **Feb 2026** workflow is `KRA Set → Self Review → Manager Check → Audit → Approved` (no HR PMS stage).

**Evidence**: Line 293 in `useOrganization.ts`:
```typescript
.rpc('get_bulk_employee_workflows', { employee_ids: profileIds })
// Missing: p_review_period, p_review_year
```

Meanwhile, `useBulkEmployeeWorkflows` in `useWorkflowConfig.ts` (line 432) correctly accepts and passes `reviewPeriod` and `reviewYear`, but `useProfilesByWorkflowStage` doesn't use it — it has its own direct RPC call.

### Issue 2: March 2026 showing old workflow for Bhoopendra

**Same Root Cause**: The `useProfilesByWorkflowStage` hook doesn't accept period/year params, so:
1. The employee list filtering is period-agnostic (always uses global workflow)
2. When the user switches from Feb to Mar, the employee still appears because the filter doesn't re-evaluate per-period

Additionally, the `EmployeeSelectorGrid` does call `useBulkEmployeeWorkflows` with `selectedPeriod` and `selectedYear` (line 173), which correctly resolves per-period workflows for the **scorecard columns and stage tracker**. But the **employee visibility filter** (`useProfilesByWorkflowStage`) runs separately and is period-blind.

The WorkflowProgressTracker in the second screenshot shows `HR PMS` for March because the scorecard's `useEmployeeWorkflowStages` correctly resolves March's workflow — but if March has no explicit config and the `is_ongoing` flag from an older config includes HR PMS, the ongoing resolution cascade returns the old workflow. This is expected "Effective From" behavior **if** the Feb config was not set as `is_ongoing: false`. Need to verify the DB config, but the code fix is still necessary regardless.

---

## Corrective and Preventive Action (CAPA)

### Changes Required

**1. `src/hooks/useOrganization.ts` — `useProfilesByWorkflowStage`**

- Accept `reviewPeriod` and `reviewYear` as parameters
- Pass them to the `get_bulk_employee_workflows` RPC call
- Update the query key to include period/year for correct cache invalidation

```typescript
// Before
export function useProfilesByWorkflowStage(stage: string | null)
  .rpc('get_bulk_employee_workflows', { employee_ids: profileIds })

// After
export function useProfilesByWorkflowStage(
  stage: string | null,
  reviewPeriod?: string,
  reviewYear?: number
)
  .rpc('get_bulk_employee_workflows', {
    employee_ids: profileIds,
    p_review_period: reviewPeriod,
    p_review_year: reviewYear,
  })
```

**2. `src/components/review/EmployeeSelectorGrid.tsx` — Pass period context**

- Update the call to `useProfilesByWorkflowStage` to include `selectedPeriod` and `selectedYear`

```typescript
// Before (line 137)
const { data: stageFilteredProfiles } = useProfilesByWorkflowStage(requiredStage);

// After
const { data: stageFilteredProfiles } = useProfilesByWorkflowStage(
  requiredStage, selectedPeriod, selectedYear
);
```

### Summary

| What | Where | Fix |
|------|-------|-----|
| Employee list filter ignores period | `useProfilesByWorkflowStage` | Pass `p_review_period` + `p_review_year` to RPC |
| Caller doesn't supply period | `EmployeeSelectorGrid` line 137 | Forward `selectedPeriod`, `selectedYear` |

These two changes ensure that when a reviewer switches to Feb 2026 or Mar 2026, only employees whose **period-specific** resolved workflow contains the required stage (e.g., `hr_pms_review`) are shown. No database or RPC changes needed — the RPC already supports these optional params.

