-- Expand BU Head visibility: a user with the bu_head safety role scoped to a
-- business unit (or globally) can view every incident in that BU, not only
-- the ones where they are explicitly named on the routing chain.
-- Safety Head / Admin global visibility and per-incident routing visibility
-- are preserved unchanged.

CREATE OR REPLACE FUNCTION public.can_view_safety_incident(_incident_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.safety_incidents i
    WHERE i.id = _incident_id
      AND (
        -- Org-wide visibility
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
        -- BU Head: scoped to the incident's business unit
        OR (
          i.business_unit_id IS NOT NULL
          AND public.has_safety_role(auth.uid(), 'bu_head'::public.safety_app_role, i.business_unit_id)
        )
        -- Reporter sees own incident
        OR i.reporter_id = auth.uid()
        -- Anyone directly involved on this specific incident
        OR i.assigned_to = auth.uid()
        OR i.routed_bu_head_id = auth.uid()
        OR i.routed_manager_id = auth.uid()
        OR i.routed_second_manager_id = auth.uid()
        OR i.safety_head_id = auth.uid()
        OR i.verifier_id = auth.uid()
      )
  )
$function$;