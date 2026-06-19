
DROP POLICY IF EXISTS "Users can upload their own evidence" ON storage.objects;

DROP POLICY IF EXISTS p_cal_read ON public.safety_asset_calibrations;
CREATE POLICY p_cal_read ON public.safety_asset_calibrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.safety_assets a
      WHERE a.id = safety_asset_calibrations.asset_id
        AND (
          public.has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
          OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role, a.business_unit_id)
          OR public.has_safety_role(auth.uid(), 'safety_officer'::safety_app_role, a.business_unit_id)
          OR public.has_safety_role(auth.uid(), 'bu_head'::safety_app_role, a.business_unit_id)
          OR public.has_safety_role(auth.uid(), 'auditor'::safety_app_role, a.business_unit_id)
        )
    )
  );

DROP POLICY IF EXISTS "System can insert org kpi value history" ON public.org_kpi_value_history;
CREATE POLICY "Admins or data owners can insert org kpi value history"
  ON public.org_kpi_value_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = org_kpi_value_history.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(org_kpi_value_history.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(org_kpi_value_history.kpi_name)
    )
  );
