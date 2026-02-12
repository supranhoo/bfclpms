

# Fix: Data Owners Can't See Org KPIs in Data Entry

## Problem

Jaspal has been assigned as a Data Owner for the "Total Recordable Injury (LTI)" KPI, but he can't see any KPIs on the Data Entry page. This is because:

- The Data Entry page queries the `kpis` table (with `is_org_level = true`) to build its list
- Jaspal has the **manager** role, so the RLS policy only lets him see KPIs for his direct reports
- There is **no RLS policy** allowing data owners to see all org-level KPIs they're assigned to

## Root Cause

The `org_kpi_data_owners` table correctly has Jaspal assigned, and `org_kpi_values` is readable. But the `kpis` table blocks him from seeing KPIs belonging to employees outside his reporting chain.

## Fix

### Database Change: Add RLS Policy on `kpis` Table

Add a new SELECT policy that allows data owners to see org-level KPIs they are assigned to:

```sql
CREATE POLICY "Data owners can view assigned org-level KPIs"
  ON public.kpis
  FOR SELECT
  TO authenticated
  USING (
    is_org_level = true
    AND EXISTS (
      SELECT 1
      FROM org_kpi_data_owners
      WHERE org_kpi_data_owners.category_id = kpis.category_id
        AND org_kpi_data_owners.kra_name = kpis.kra_name
        AND org_kpi_data_owners.kpi_name = kpis.kpi_name
        AND org_kpi_data_owners.owner_id = auth.uid()
    )
  );
```

This policy:
- Only applies to org-level KPIs (`is_org_level = true`)
- Only grants access if the user is listed as a data owner for that specific KPI
- Does NOT grant write access (data owners edit via `org_kpi_values`, not `kpis` directly)

### No Code Changes Needed

The existing frontend logic already handles the ownership filtering correctly:
- `useOrgKpiOwnershipMap` builds the map from `org_kpi_data_owners`
- `OrgKpiDataEntry` filters by `ownership.canEdit === true` for non-admins
- The only missing piece was the RLS policy preventing the data from loading

### Files Changed

| File | Change |
|------|--------|
| Database (migration) | Add SELECT policy for data owners on `kpis` table |
| `DOCUMENTATION.md` | Document the new RLS policy |

## Expected Result

After this fix, Jaspal will:
1. Be able to access `/admin/org-kpi-data`
2. See only the KPIs he's assigned as data owner for (not all org KPIs)
3. Be able to enter/update achieved values for those KPIs

