CREATE OR REPLACE FUNCTION public.has_menu_access_override(_user_id uuid, _menu_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.menu_access_user_overrides
      WHERE user_id = _user_id AND menu_key = _menu_key
    )
    OR public.has_profile_menu_access(_user_id, _menu_key, 'view');
$function$;