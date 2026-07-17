DROP POLICY IF EXISTS permit_hira_select ON public.safety_permit_hira;
CREATE POLICY permit_hira_select ON public.safety_permit_hira
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_hira.permit_id
      AND (
        has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
        OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
        OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role, NULL::uuid)
        OR p.requested_by = auth.uid()
        OR is_permit_approver(auth.uid(), p.id)
        OR has_safety_role(auth.uid(), 'manager'::safety_app_role, p.business_unit_id)
        OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role, p.business_unit_id)
      )
  )
);

DROP POLICY IF EXISTS permit_loto_select ON public.safety_permit_loto_steps;
CREATE POLICY permit_loto_select ON public.safety_permit_loto_steps
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_loto_steps.permit_id
      AND (
        has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
        OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
        OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role, NULL::uuid)
        OR p.requested_by = auth.uid()
        OR is_permit_approver(auth.uid(), p.id)
        OR has_safety_role(auth.uid(), 'manager'::safety_app_role, p.business_unit_id)
        OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role, p.business_unit_id)
      )
  )
);