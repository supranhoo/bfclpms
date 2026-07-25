-- Harden INSERT policy on safety_permit_evidence to mirror SELECT scope.
-- Prevents any authenticated user from attaching evidence to arbitrary permits.
DROP POLICY IF EXISTS permit_evidence_insert ON public.safety_permit_evidence;
CREATE POLICY permit_evidence_insert
ON public.safety_permit_evidence
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_evidence.permit_id
      AND (
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
        OR p.requested_by = auth.uid()
        OR public.is_permit_approver(auth.uid(), p.id)
        OR public.has_safety_role(auth.uid(), 'manager'::public.safety_app_role, p.business_unit_id)
        OR public.has_safety_role(auth.uid(), 'bu_head'::public.safety_app_role, p.business_unit_id)
      )
  )
);