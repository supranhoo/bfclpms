DROP POLICY IF EXISTS permit_hira_write ON public.safety_permit_hira;

CREATE POLICY permit_hira_write
ON public.safety_permit_hira
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.safety_permits p
     WHERE p.id = safety_permit_hira.permit_id
       AND (
         public.has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
         OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
         OR (p.requested_by = auth.uid() AND p.status = 'draft')
       )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.safety_permits p
     WHERE p.id = safety_permit_hira.permit_id
       AND (
         public.has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
         OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
         OR (p.requested_by = auth.uid() AND p.status = 'draft')
       )
  )
);