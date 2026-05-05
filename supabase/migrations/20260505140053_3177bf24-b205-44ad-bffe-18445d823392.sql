
-- 1) kpi_observation_replies: replace overly broad SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view observation replies" ON public.kpi_observation_replies;

CREATE POLICY "Users can view replies for accessible observations"
  ON public.kpi_observation_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.kpi_observations o
      JOIN public.kpis k ON k.id = o.kpi_id
      LEFT JOIN public.profiles p ON p.id = k.employee_id
      WHERE o.id = kpi_observation_replies.observation_id
        AND (
          k.employee_id = auth.uid()
          OR p.reporting_manager_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'auditor'::public.app_role)
          OR public.has_role(auth.uid(), 'management'::public.app_role)
          OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
          OR public.has_role(auth.uid(), 'skip_level'::public.app_role)
        )
    )
  );

-- 2) menu_access_user_overrides: restrict SELECT to self + admin
DROP POLICY IF EXISTS "Anyone authenticated can read menu user overrides" ON public.menu_access_user_overrides;

CREATE POLICY "Users see own menu overrides; admins see all"
  ON public.menu_access_user_overrides
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 3) incentive_program_custom_tabs: split blanket ALL policy into scoped ones
DROP POLICY IF EXISTS "Auth users manage custom tabs" ON public.incentive_program_custom_tabs;

CREATE POLICY "Authenticated users can read custom tabs"
  ON public.incentive_program_custom_tabs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert custom tabs"
  ON public.incentive_program_custom_tabs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update custom tabs"
  ON public.incentive_program_custom_tabs
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete custom tabs"
  ON public.incentive_program_custom_tabs
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
