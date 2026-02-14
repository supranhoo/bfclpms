
-- 1. Drop the broken policy
DROP POLICY IF EXISTS "Managers can view skip-level reports" ON public.profiles;

-- 2. Create SECURITY DEFINER function to fetch direct report IDs without RLS
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

-- 3. Re-create the policy using the safe function
CREATE POLICY "Managers can view skip-level reports"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND reporting_manager_id IN (
      SELECT get_direct_report_ids(auth.uid())
    )
  );
