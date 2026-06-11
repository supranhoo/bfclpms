-- Make incident-reporting universally accessible (matches Safety RBAC charter:
-- any employee may raise an incident). Per-user explicit deny overrides still win.
CREATE OR REPLACE FUNCTION public.has_safety_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_override text;
  v_any_allow boolean;
BEGIN
  IF _user_id IS NULL OR _key IS NULL THEN RETURN false; END IF;

  -- Admin bypass.
  IF public.has_safety_role(_user_id,'admin') THEN RETURN true; END IF;

  -- Per-user override wins (allow or deny).
  SELECT effect INTO v_override
    FROM public.safety_user_permission_overrides
   WHERE user_id = _user_id AND permission_key = _key;
  IF v_override = 'deny'  THEN RETURN false; END IF;
  IF v_override = 'allow' THEN RETURN true;  END IF;

  -- Universal keys — every authenticated user gets these unless explicitly denied above.
  IF _key IN ('nav.home', 'nav.incidents', 'action.incidents.create', 'action.incidents.view') THEN
    RETURN true;
  END IF;

  -- Role matrix: only explicit allow rows grant access.
  SELECT bool_or(rp.is_allowed) INTO v_any_allow
    FROM public.safety_user_roles ur
    JOIN public.safety_role_permissions rp
      ON rp.role = ur.role
     AND rp.permission_key = _key
   WHERE ur.user_id = _user_id;

  RETURN COALESCE(v_any_allow, false);
END$function$;