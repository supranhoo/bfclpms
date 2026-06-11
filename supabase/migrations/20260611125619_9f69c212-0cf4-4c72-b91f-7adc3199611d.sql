CREATE OR REPLACE FUNCTION public.resolve_global_safety_head()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(value #>> '{}', 'null')::uuid
  FROM public.safety_settings
  WHERE key = 'global_safety_head_id'
  LIMIT 1;
$function$;