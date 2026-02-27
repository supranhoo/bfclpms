
-- 1. Security definer function to check report access overrides
CREATE OR REPLACE FUNCTION public.has_report_access_override(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.report_access_user_overrides
    WHERE user_id = _user_id
      AND (can_view = true OR can_download = true)
  )
$$;

-- 2. KPIs: full SELECT for override users
CREATE POLICY "Report override users can view all KPIs"
  ON public.kpis FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));

-- 3. Review submissions: full SELECT for override users
CREATE POLICY "Report override users can view all submissions"
  ON public.review_submissions FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));

-- 4. Profiles: full SELECT for override users
CREATE POLICY "Report override users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));
