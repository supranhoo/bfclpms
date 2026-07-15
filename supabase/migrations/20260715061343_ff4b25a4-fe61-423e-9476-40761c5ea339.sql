-- Tighten safety_asset_evidence SELECT to safety-role holders only
DROP POLICY IF EXISTS p_evidence_read ON public.safety_asset_evidence;
CREATE POLICY p_evidence_read ON public.safety_asset_evidence
FOR SELECT TO authenticated
USING (
  public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
  OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
  OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
);

-- Align permit_loto_write WITH CHECK with USING (requester / approver / safety roles)
DROP POLICY IF EXISTS permit_loto_write ON public.safety_permit_loto_steps;
CREATE POLICY permit_loto_write ON public.safety_permit_loto_steps
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_loto_steps.permit_id
      AND (
        p.requested_by = auth.uid()
        OR public.is_permit_approver(auth.uid(), p.id)
        OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_loto_steps.permit_id
      AND (
        p.requested_by = auth.uid()
        OR public.is_permit_approver(auth.uid(), p.id)
        OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
      )
  )
);