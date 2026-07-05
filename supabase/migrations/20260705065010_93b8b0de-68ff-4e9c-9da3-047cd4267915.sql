CREATE OR REPLACE FUNCTION public.compute_org_kpi_score_for_kpi(p_kpi_id uuid, p_achieved numeric)
 RETURNS TABLE(score numeric, rating text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kpi RECORD;
  v_score numeric := 0;
  v_rating text := 'red';
BEGIN
  SELECT target_value, r0, r1, r2, r3, r4, r5, threshold_mode, uom_type
  INTO v_kpi
  FROM kpis WHERE id = p_kpi_id;

  IF NOT FOUND OR p_achieved IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text;
    RETURN;
  END IF;

  IF v_kpi.target_value IS NOT NULL AND v_kpi.target_value > 0 THEN
    v_score := LEAST(5, ROUND((p_achieved / v_kpi.target_value) * 5, 2));
  ELSE
    v_score := 0;
  END IF;

  -- Rating buckets must align with public.rating_level enum:
  -- (red, yellow, green, blue). Previously emitted 'amber' which broke
  -- the auto-pull trigger's cast during KRA rollover for org-level KPIs.
  v_rating := CASE
    WHEN v_score >= 4.5 THEN 'blue'
    WHEN v_score >= 3.5 THEN 'green'
    WHEN v_score >= 2.5 THEN 'yellow'
    ELSE 'red'
  END;

  RETURN QUERY SELECT v_score, v_rating;
END;
$function$;