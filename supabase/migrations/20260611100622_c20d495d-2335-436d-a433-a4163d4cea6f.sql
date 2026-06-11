-- A user is "responsible" in Safety if they hold any non-worker safety role
-- (legacy or IAC) OR they are named in an active incident routing rule OR
-- they sit on the routing/assignment chain of any incident. Routing-chain
-- users (e.g. a BU Head named only in a routing rule, never granted a role)
-- must be able to read active profiles to assign investigators/verifiers.
CREATE OR REPLACE FUNCTION public.has_responsible_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- 1) Legacy safety roles, excluding plain workers
    EXISTS (
      SELECT 1 FROM public.safety_user_roles
      WHERE user_id = _user_id AND role <> 'worker'
    )
    OR
    -- 2) IAC safety roles, excluding plain workers
    EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND r.module = 'safety'
        AND r.code <> 'safety_worker'
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
    )
    OR
    -- 3) Named in an ACTIVE incident routing rule
    EXISTS (
      SELECT 1 FROM public.safety_incident_routing_rules rr
      WHERE rr.is_active = true
        AND (rr.bu_head_id = _user_id
          OR rr.manager_id = _user_id
          OR rr.second_manager_id = _user_id)
    )
    OR
    -- 4) On the routing/assignment chain of any incident
    EXISTS (
      SELECT 1 FROM public.safety_incidents i
      WHERE i.assigned_to = _user_id
        OR i.routed_bu_head_id = _user_id
        OR i.routed_manager_id = _user_id
        OR i.routed_second_manager_id = _user_id
        OR i.safety_head_id = _user_id
        OR i.verifier_id = _user_id
    );
$function$;