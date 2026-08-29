CREATE OR REPLACE FUNCTION public.annual_review_kra_drifted_instances(
  p_cycle_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  instance_id uuid,
  employee_id uuid,
  employee_code text,
  full_name text,
  overall_status text,
  stored_score numeric,
  latest_score numeric,
  delta numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_review_year int;
  v_fy_start int;
  v_inst record;
  v_slot jsonb;
  v_stored numeric;
  v_new numeric;
  v_sum_stored numeric;
  v_sum_new numeric;
  v_drift boolean;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'admin or hr_pms role required';
  END IF;

  SELECT review_year INTO v_review_year FROM public.annual_review_cycles WHERE id = p_cycle_id;
  IF v_review_year IS NULL THEN RAISE EXCEPTION 'cycle % not found', p_cycle_id; END IF;
  v_fy_start := v_review_year - 1;

  FOR v_inst IN
    SELECT i.id, i.employee_id, i.overall_status,
           COALESCE(i.system_scores,'{}'::jsonb) AS system_scores,
           COALESCE(t_over.sections, t.sections) AS sections,
           p.employee_code, p.full_name
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t ON t.id = i.template_id
      LEFT JOIN public.annual_review_templates t_over ON t_over.id = i.template_override_id
      JOIN public.profiles p ON p.id = i.employee_id
     WHERE i.cycle_id = p_cycle_id
       AND i.overall_status <> 'excluded'
       AND COALESCE(t_over.sections, t.sections)->'system_scores' @> '[{"source":"carry_kra"}]'::jsonb
       AND (
         p_search IS NULL OR btrim(p_search) = ''
         OR p.full_name ILIKE '%' || btrim(p_search) || '%'
         OR p.employee_code ILIKE '%' || btrim(p_search) || '%'
       )
  LOOP
    v_drift := false;
    v_sum_stored := 0;
    v_sum_new := 0;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_inst.sections->'system_scores') LOOP
      IF (v_slot->>'source') = 'carry_kra' THEN
        v_new := ROUND(public.compute_carry_kra_contribution(
          v_inst.employee_id, v_fy_start,
          COALESCE(v_slot->'carry_config','{"aggregation":"overall_avg","excludeNa":true}'::jsonb),
          COALESCE((v_slot->>'weight')::numeric, 0)), 2);
        v_stored := NULLIF(v_inst.system_scores->>(v_slot->>'id'), '')::numeric;
        v_sum_new := v_sum_new + COALESCE(v_new, 0);
        v_sum_stored := v_sum_stored + COALESCE(v_stored, 0);
        IF v_stored IS DISTINCT FROM v_new AND ROUND(COALESCE(v_stored, -1), 2) <> v_new THEN
          v_drift := true;
        END IF;
      END IF;
    END LOOP;

    IF v_drift THEN
      v_rows := v_rows || jsonb_build_object(
        'instance_id', v_inst.id,
        'employee_id', v_inst.employee_id,
        'employee_code', v_inst.employee_code,
        'full_name', v_inst.full_name,
        'overall_status', v_inst.overall_status,
        'stored_score', ROUND(v_sum_stored, 2),
        'latest_score', ROUND(v_sum_new, 2),
        'delta', ROUND(v_sum_new - v_sum_stored, 2)
      );
    END IF;
  END LOOP;

  v_total := jsonb_array_length(v_rows);

  RETURN QUERY
  SELECT (e->>'instance_id')::uuid,
         (e->>'employee_id')::uuid,
         e->>'employee_code',
         e->>'full_name',
         e->>'overall_status',
         (e->>'stored_score')::numeric,
         (e->>'latest_score')::numeric,
         (e->>'delta')::numeric,
         v_total
    FROM jsonb_array_elements(v_rows) e
   ORDER BY (e->>'full_name')
   OFFSET GREATEST(COALESCE(p_offset,0),0)
   LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1), 200);
END;
$function$;

REVOKE ALL ON FUNCTION public.annual_review_kra_drifted_instances(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_kra_drifted_instances(uuid, text, int, int) TO authenticated;