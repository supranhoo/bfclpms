

# Fix: RLS Policy for Org KPI Propagation on `review_submissions`

## Root Cause Analysis (RCA)

The "Save & Propagate" action on the Org KPI Data Entry page inserts `review_submissions` records for employee KPIs. The current INSERT policy on `review_submissions` only allows:

1. **Admins** (via the ALL policy) -- works fine
2. **Employees** inserting for their own KPIs (`kpis.employee_id = auth.uid()`) -- not relevant here

**Data owners** (non-admin users assigned to manage org-level KPIs via `org_kpi_data_owners`) are NOT covered by either policy when inserting submissions for other employees' KPIs. This causes the RLS violation error.

## Corrective Action (CAPA)

Add a new INSERT policy on `review_submissions` that allows data owners to insert submissions for org-level KPIs they manage.

## Changes

### 1. Database Migration

Add a new RLS policy:

```sql
CREATE POLICY "Data owners can insert org-level submissions"
  ON public.review_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.id = review_submissions.kpi_id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );
```

Also add a matching UPDATE policy so the data owner can update existing submissions during re-propagation:

```sql
CREATE POLICY "Data owners can update org-level submissions"
  ON public.review_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.id = review_submissions.kpi_id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );
```

### 2. Documentation

Update `DOCUMENTATION.md` and `docs/rls-policies.md` to document the new policies.

## Why This Is Safe

- The policy is scoped to org-level KPIs only (`is_org_level = true`)
- It requires the user to be a registered data owner in `org_kpi_data_owners` for the specific KPI
- Data owners are explicitly assigned by admins, so this does not widen access beyond intended boundaries

