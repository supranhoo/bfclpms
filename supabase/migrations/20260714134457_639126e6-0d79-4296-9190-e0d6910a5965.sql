CREATE OR REPLACE FUNCTION public.is_annual_review_reviewer_for_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.annual_review_instances i
    WHERE i.employee_id = p_profile_id
      AND i.overall_status <> 'excluded'
      AND auth.uid() IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
  )
$$;

DROP POLICY IF EXISTS "Annual review reviewers can view reviewee profiles" ON public.profiles;
CREATE POLICY "Annual review reviewers can view reviewee profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_annual_review_reviewer_for_profile(id));