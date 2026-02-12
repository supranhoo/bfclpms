

# Fix: Impact Analysis Shows 0 Employees for Data Owners

## Root Cause Analysis (RCA)

Jaspal is assigned as a Data Owner for the LTI KPI. He has the **manager** role with only 2 direct reports. When he opens Impact Analysis:

1. The `useOrgKpiImpact` hook queries the `kpis` table for all 122 employee records with `is_org_level = true` matching "Total Recordable Injury (LTI)"
2. The KPIs are visible thanks to the data owner RLS policy we added earlier
3. **However**, the query joins `profiles` to get employee names/departments
4. The `profiles` table RLS for managers only returns their direct reports (2 employees)
5. For the other 120 employees, the profile join returns `null`
6. The code skips records where `profile` is null: `if (!profile) continue;`
7. Result: **0 affected employees shown**

## Corrective Action (CAPA)

### Database Change: Add RLS Policy on `profiles` Table

Add a new SELECT policy allowing data owners to see profiles of employees who have org-level KPIs they manage:

```sql
CREATE POLICY "Data owners can view org kpi employee profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.employee_id = profiles.id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );
```

This policy:
- Only grants visibility to profiles of employees who have org-level KPIs the current user owns
- Does not grant UPDATE or DELETE access
- Is scoped narrowly -- a data owner for "LTI" only sees employees assigned to LTI, not all employees

### No Frontend Code Changes Needed

The `useOrgKpiImpact` hook logic is correct. The profiles join will automatically return data once the RLS policy allows access.

### Files Changed

| File | Change |
|------|--------|
| Database (migration) | Add SELECT policy for data owners on `profiles` table |
| `DOCUMENTATION.md` | Document the new RLS policy |

## Expected Result

After this fix, when Jaspal opens Impact Analysis for LTI, he will see all 122 affected employees with their names, departments, and simulated score changes.

