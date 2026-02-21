

# Fix: "new row violates row-level security policy for table kpis" for Management Role

## Root Cause

Gaurav Budhiya has the **management** role. When he submits a review and approves a KPI, the code updates the KPI status from `management_review` to `approved`.

The RLS policy "Management can update KPI status during review" is:
```sql
USING (has_role(auth.uid(), 'management') AND status = 'management_review')
```

There is **no explicit WITH CHECK** clause. In PostgreSQL, when WITH CHECK is omitted on an UPDATE policy, it **defaults to the USING expression**. This means the updated row must also satisfy `status = 'management_review'`.

After the update changes status to `approved`, the row no longer satisfies the check (`approved != management_review`), so PostgreSQL rejects it with "new row violates row-level security policy."

This same issue affects the Send Back action, which changes status to an earlier stage (also not `management_review`).

## Fix

Add an explicit `WITH CHECK (true)` to the Management UPDATE policy. The USING clause already correctly restricts which rows Management can touch (only `management_review` KPIs). The WITH CHECK should allow the updated row to have any status (since the whole point is to advance or send back the KPI).

### Database Migration

```sql
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Management can update KPI status during review" ON public.kpis;

-- Re-create with explicit WITH CHECK allowing status transitions
CREATE POLICY "Management can update KPI status during review"
  ON public.kpis
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role)
    AND status = 'management_review'::review_status
  )
  WITH CHECK (
    has_role(auth.uid(), 'management'::app_role)
  );
```

### Documentation Update

Update `DOCUMENTATION.md` to version **1.45.48** with a note about the RLS fix for Management role KPI status transitions.

## Impact

- Management users will be able to approve KPIs (transition from `management_review` to `approved`) and send back KPIs
- No change for other roles -- their policies already work correctly or have separate handling
- Security is maintained: Management can still only update KPIs that are currently at `management_review` status (controlled by USING clause)

