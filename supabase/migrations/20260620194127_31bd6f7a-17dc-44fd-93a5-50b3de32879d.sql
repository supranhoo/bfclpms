CREATE OR REPLACE FUNCTION public.resolve_bu_head(p_bu_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_winner uuid;
BEGIN
  WITH scope AS (
    SELECT p.id, p.reporting_manager_id, p.doj
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    WHERE d.business_unit_id = p_bu_id
      AND COALESCE(p.is_active, true) = true
  ),
  roots AS (
    SELECT s.id, s.doj
    FROM scope s
    LEFT JOIN scope mgr ON mgr.id = s.reporting_manager_id
    WHERE s.reporting_manager_id IS NULL OR mgr.id IS NULL
  )
  SELECT r.id INTO v_winner
  FROM roots r
  ORDER BY r.doj ASC NULLS LAST, r.id ASC
  LIMIT 1;
  RETURN v_winner;
END
$function$;