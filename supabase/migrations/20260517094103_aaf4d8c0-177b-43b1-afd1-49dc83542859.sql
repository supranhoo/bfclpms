CREATE OR REPLACE FUNCTION public.has_safety_module_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.safety_module_access
     WHERE user_id = _user_id AND can_view = true
  ) OR EXISTS (
    SELECT 1 FROM public.safety_user_roles WHERE user_id = _user_id
  ) OR EXISTS (
    SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
     WHERE ura.user_id = _user_id
       AND r.is_active = true
       AND r.module = 'safety'
       AND (ura.expires_at IS NULL OR ura.expires_at > now())
  );
$function$;