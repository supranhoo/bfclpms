

## Plan: Fix Infinite Recursion in Profiles RLS Policy

### Root Cause
The migration `20260331135141` added an RLS policy on `profiles` that queries the `kpis` table. The `kpis` table has its own RLS policies that reference `profiles`, creating a **circular dependency** → Postgres error `42P17: infinite recursion detected in policy for relation "profiles"`.

This blocks ALL profile queries (including auth login flow), which is why the entire dashboard shows only skeletons.

### Fix

**Drop the problematic policy** and replace it with a **SECURITY DEFINER function** that bypasses RLS when checking the kpis table, breaking the recursion cycle.

```sql
-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "Audit reviewers can view org kpi employee profiles" ON public.profiles;

-- 2. Create a security definer function (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_org_kpi_audit_employee(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kpis k
    WHERE k.employee_id = _profile_id
      AND k.is_org_level = true
      AND k.status IN ('audit', 'management_review', 'approved')
  )
$$;

-- 3. Re-create policy using the function (no recursion)
CREATE POLICY "Audit reviewers can view org kpi employee profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_org_kpi_audit_employee(id));
```

### Files Modified

| File | Change |
|------|--------|
| DB migration | Drop recursive policy, create SECURITY DEFINER function, re-create policy using function |
| `DOCUMENTATION.md` | v2.15.29 — fix infinite recursion |

### Risk Assessment
- **Regression**: This is a **critical fix** — the current state blocks all dashboard access
- **Security**: SECURITY DEFINER function is scoped to a single boolean check on org-level KPIs at audit+ stages
- **Data**: No schema changes

