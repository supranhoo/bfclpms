-- Fix Safety incident visibility:
-- 1) View was running as owner (no security_invoker) -> bypassed RLS entirely.
-- 2) Tighten can_view_safety_incident: only admin + safety_head see all.
--    Reporters see their own; assigned/routed/verifier users see incidents
--    they are accountable for.

ALTER VIEW public.safety_incidents_with_sla SET (security_invoker = on);

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
        -- Full visibility roles
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
        -- Reporter sees own incident
        OR i.reporter_id = auth.uid()
        -- Anyone directly involved in handling this specific incident
        OR i.assigned_to = auth.uid()
        OR i.routed_bu_head_id = auth.uid()
        OR i.routed_manager_id = auth.uid()
        OR i.routed_second_manager_id = auth.uid()
        OR i.safety_head_id = auth.uid()
        OR i.verifier_id = auth.uid()
      )
  )
$function$;