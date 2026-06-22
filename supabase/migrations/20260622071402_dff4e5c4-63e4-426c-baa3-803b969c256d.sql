DROP POLICY IF EXISTS "Authenticated users can insert mention access grants" ON public.kpi_mention_access;

CREATE POLICY "Authenticated users can insert mention access grants"
  ON public.kpi_mention_access
  FOR INSERT
  TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND user_id <> auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.kpi_observations o
        WHERE o.kpi_id = kpi_mention_access.kpi_id
          AND o.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.kpi_observation_replies r
        JOIN public.kpi_observations o ON o.id = r.observation_id
        WHERE o.kpi_id = kpi_mention_access.kpi_id
          AND r.reply_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.kpis k
        WHERE k.id = kpi_mention_access.kpi_id
          AND k.employee_id = auth.uid()
      )
    )
  );