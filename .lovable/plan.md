
# Fix: Infinite Recursion in Skip-Level Profiles RLS Policy

## Root Cause

The skip-level RLS policy added minutes ago is causing **infinite recursion** on the `profiles` table. The database error logs show continuous `"infinite recursion detected in policy for relation 'profiles'"` errors, which is why Jaspal (and likely other managers) cannot load their profile -- the query fails silently, `profile` stays `null`, and the sidebar falls back to showing "User".

The problematic policy:

```text
CREATE POLICY "Managers can view skip-level reports"
  ON public.profiles FOR SELECT
  USING (
    ...
    AND reporting_manager_id IN (
      SELECT id FROM public.profiles       <-- self-referencing query!
      WHERE reporting_manager_id = auth.uid()
    )
  );
```

This subquery reads `profiles` from inside a policy on `profiles`, which Postgres cannot evaluate without entering an infinite loop.

## Fix

1. **Drop the broken policy** immediately to restore profile loading for all managers.
2. **Create a SECURITY DEFINER function** (`get_direct_report_ids`) that fetches direct report IDs while bypassing RLS (same pattern used by `has_role` and `is_data_owner_for_employee`).
3. **Re-create the policy** using the safe function instead of the self-referencing subquery.

### New Function

```text
CREATE OR REPLACE FUNCTION public.get_direct_report_ids(_manager_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE reporting_manager_id = _manager_id;
$$;
```

### Corrected Policy

```text
CREATE POLICY "Managers can view skip-level reports"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND reporting_manager_id IN (
      SELECT get_direct_report_ids(auth.uid())
    )
  );
```

## Files to Modify

| File | Change |
|---|---|
| Database migration | Drop broken policy, create function, re-create safe policy |
| `DOCUMENTATION.md` | Update v1.28.2 entry to note the SECURITY DEFINER pattern |

## Risk Assessment
- **Urgent**: The broken policy is actively preventing all manager-role users from loading profiles
- **Safe fix**: Uses the same proven SECURITY DEFINER pattern already in use for `has_role` and `is_data_owner_for_employee`
- **No code changes**: Only database objects are modified
