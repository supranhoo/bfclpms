
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
