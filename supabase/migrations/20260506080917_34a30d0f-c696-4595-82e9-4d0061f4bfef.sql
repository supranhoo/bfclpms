CREATE OR REPLACE FUNCTION public.preview_org_kpi_propagation(
  p_kpi_ids uuid[],
  p_new_value numeric DEFAULT NULL,
  p_new_self_score numeric DEFAULT NULL,
  p_overwrite_policy text DEFAULT 'pre_review_only'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_will_advance int := 0;
  v_will_skip int := 0;
  v_total int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_eligible boolean;
  v_reason text;
  rec record;
BEGIN
  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal') THEN
    v_policy := 'pre_review_only';
  END IF;

  IF p_kpi_ids IS NULL OR array_length(p_kpi_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('total',0,'will_advance',0,'will_skip',0,'breakdown','[]'::jsonb);
  END IF;

  FOR rec IN
    SELECT
      k_id AS kpi_id,
      k.status::text AS current_status,
      k.employee_id,
      p.full_name,
      p.employee_code,
      rs.achieved_value AS current_achieved,
      rs.self_score AS current_self_score
    FROM unnest(p_kpi_ids) AS k_id
    LEFT JOIN kpis k ON k.id = k_id
    LEFT JOIN profiles p ON p.id = k.employee_id
    LEFT JOIN review_submissions rs ON rs.kpi_id = k_id
  LOOP
    v_total := v_total + 1;

    IF rec.current_status IS NULL THEN
      v_eligible := false;
      v_reason := 'kpi_not_found';
    ELSE
      v_eligible := CASE v_policy
        WHEN 'safe' THEN rec.current_status = 'kra_set'
        WHEN 'pre_review_only' THEN rec.current_status IN ('kra_set','self_review')
        WHEN 'force_pre_terminal' THEN rec.current_status NOT IN
          ('manager_check','auditor_check','management_review','final','approved')
        ELSE false
      END;
      v_reason := CASE
        WHEN v_eligible THEN 'eligible'
        WHEN rec.current_status IN ('manager_check','auditor_check','management_review','final','approved')
          THEN 'reviewer_locked'
        WHEN rec.current_status = 'self_review' AND v_policy = 'safe'
          THEN 'self_review_existing'
        ELSE 'not_in_kra_set'
      END;
    END IF;

    IF v_eligible THEN
      v_will_advance := v_will_advance + 1;
    ELSE
      v_will_skip := v_will_skip + 1;
    END IF;

    v_breakdown := v_breakdown || jsonb_build_object(
      'kpi_id', rec.kpi_id,
      'employee_name', rec.full_name,
      'employee_code', rec.employee_code,
      'current_status', COALESCE(rec.current_status, 'missing'),
      'will_advance', v_eligible,
      'reason', v_reason,
      'current_achieved', rec.current_achieved,
      'current_self_score', rec.current_self_score,
      'new_achieved', p_new_value,
      'new_self_score', p_new_self_score,
      'value_changes', (rec.current_achieved IS DISTINCT FROM p_new_value)
                       OR (rec.current_self_score IS DISTINCT FROM p_new_self_score)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'will_advance', v_will_advance,
    'will_skip', v_will_skip,
    'breakdown', v_breakdown
  );
END;
$function$;