

# Fix: Save & Propagate Error for Data Owner (Biswajit)

## Root Cause

Biswajit Sahoo is a **Data Owner** with role `manager`. When he clicks "Save & Propagate", the propagation code does two things for each employee KPI:

1. Updates `review_submissions` with the achieved value and score -- this **works** because there is an RLS policy "Data owners can update org-level submissions"
2. Updates `kpis` table status from `kra_set` to `self_review` -- this **fails** because there is NO RLS policy allowing data owners to update the `kpis` table

The existing `kpis` UPDATE policies are:
- Admins (universal)
- Managers (only for direct reports)
- Auditors, HR PMS, Management, Skip-level managers
- Employees (own KPIs only)

Biswajit's manager role only grants him UPDATE access to KPIs of his direct reports. But org-level KPIs span employees across the entire organization who don't report to him. Those status updates get blocked by RLS, causing errors.

## Fix

### 1. Database Migration: Add RLS Policy on `kpis` Table

Add a new UPDATE policy allowing data owners to update the status of org-level KPIs they are assigned to:

```sql
CREATE POLICY "Data owners can update org-level KPI status"
ON public.kpis
FOR UPDATE
USING (
  is_org_level = true
  AND EXISTS (
    SELECT 1
    FROM org_kpi_data_owners o
    WHERE o.category_id = kpis.category_id
      AND o.kra_name = kpis.kra_name
      AND o.kpi_name = kpis.kpi_name
      AND o.owner_id = auth.uid()
  )
);
```

This policy:
- Only applies to org-level KPIs (`is_org_level = true`)
- Only grants access if the user is a designated data owner for that specific KPI
- Follows the same pattern as the existing data owner policies on `review_submissions`

### 2. Update DOCUMENTATION.md

- Version bump to 1.45.41
- Note: Added missing RLS policy for data owner KPI status updates during propagation

## No Code Changes Needed

The propagation logic in `usePropagateOrgKpiValue.ts` is correct -- it already handles the KPI status update. The issue is purely an RLS policy gap. Once the policy is added, the existing code will work for data owners like Biswajit.

## Impact

| Scenario | Before (Bug) | After (Fix) |
|---|---|---|
| Data owner propagates org KPIs for non-direct-reports | RLS blocks KPI status update, error shown | Status update succeeds |
| Data owner propagates org KPIs for direct reports | Works (via manager policy) | Works (via both policies) |
| Admin propagates org KPIs | Works (via admin policy) | Works (unchanged) |

