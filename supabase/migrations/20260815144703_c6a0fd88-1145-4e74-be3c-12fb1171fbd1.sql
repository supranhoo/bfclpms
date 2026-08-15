CREATE OR REPLACE FUNCTION public.bu_console_group_write(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_achieved_value numeric DEFAULT NULL,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_is_na boolean DEFAULT false,
  p_remarks text DEFAULT NULL,
  p_overwrite_policy text DEFAULT 'pre_review_only',
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_rec record;
  v_score numeric;
  v_items jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_result jsonb;
  v_locked_statuses text[] := ARRAY['manager_check','audit','skip_level_check','hr_pms_review','management_review','approved'];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped', '[]'::jsonb);
  END IF;

  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal','overwrite_and_stepback') THEN
    v_policy := 'pre_review_only';
  END IF;

  FOR v_rec IN
    SELECT k.*, p.full_name, p.employee_code, d.name AS department_name,
           bu.name AS business_unit_name,
           rs.final_score, rs.self_score AS existing_self_score,
           rs.auto_advance_reason, rs.self_evidence_url, rs.self_evidence_urls
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(p_kpi_name)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
    ORDER BY p.full_name
  LOOP
    v_reason := NULL;

    -- POLICY §88: approved final scores are immutable, always.
    IF v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    ELSIF v_rec.status::text = ANY(v_locked_statuses)
          AND NOT (v_policy IN ('force_pre_terminal','overwrite_and_stepback'))
          AND NOT (v_rec.auto_advance_reason IS NOT NULL
                   AND v_rec.self_evidence_url IS NULL
                   AND (v_rec.self_evidence_urls IS NULL OR jsonb_array_length(v_rec.self_evidence_urls) = 0))
    THEN
      v_reason := 'reviewer_locked';
    ELSIF v_policy = 'safe' AND v_rec.status::text <> 'kra_set' THEN
      v_reason := 'not_in_kra_set';
    ELSIF v_policy = 'overwrite_and_stepback' AND v_rec.status::text = 'approved' THEN
      v_reason := 'approved_immutable';
    END IF;

    IF NOT p_is_na AND v_reason IS NULL THEN
      v_score := public.fn_compute_rating_from_achievement(v_rec::public.kpis, p_achieved_value, NULL);
      IF v_score IS NULL THEN
        v_reason := 'no_scoring_bands';
      END IF;
    ELSE
      v_score := NULL;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'kpi_id', v_rec.id,
        'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name,
        'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name,
        'business_unit_name', v_rec.business_unit_name,
        'current_status', v_rec.status::text,
        'reason', v_reason
      );
      CONTINUE;
    END IF;

    v_preview := v_preview || jsonb_build_object(
      'kpi_id', v_rec.id,
      'employee_id', v_rec.employee_id,
      'employee_name', v_rec.full_name,
      'employee_code', v_rec.employee_code,
      'department_name', v_rec.department_name,
      'business_unit_name', v_rec.business_unit_name,
      'weightage', v_rec.weightage,
      'target_value', v_rec.target_value,
      'current_status', v_rec.status::text,
      'old_self_score', v_rec.existing_self_score,
      'new_self_score', v_score
    );

    v_items := v_items || jsonb_build_object(
      'kpi_id', v_rec.id,
      'self_score', v_score,
      'achieved_value', p_achieved_value
    );
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', true,
      'batch_id', NULL,
      'achieved_value', p_achieved_value,
      'will_write', jsonb_array_length(v_preview),
      'will_skip', jsonb_array_length(v_skipped),
      'preview', v_preview,
      'skipped', v_skipped
    );
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', false,
      'batch_id', v_batch,
      'propagated', 0,
      'skipped', jsonb_array_length(v_skipped),
      'preview', '[]'::jsonb,
      'skipped_details', v_skipped
    );
  END IF;

  v_result := public.propagate_org_kpi_value(v_items, p_is_na, p_remarks, v_policy);

  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
  SELECT (elem->>'kpi_id')::uuid, 'BU_CONSOLE_GROUP_WRITE', v_user,
         jsonb_build_object(
           'batch_id', v_batch,
           'category_id', p_category_id,
           'kra_name', p_kra_name,
           'kpi_name', p_kpi_name,
           'review_period', p_period,
           'review_year', p_year,
           'achieved_value', p_achieved_value,
           'is_na', p_is_na,
           'overwrite_policy', v_policy,
           'new_self_score', elem->>'self_score'
         )
  FROM jsonb_array_elements(v_items) AS elem;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', false,
    'batch_id', v_batch,
    'propagated', COALESCE((v_result->>'propagated')::int, 0),
    'skipped', jsonb_array_length(v_skipped) + COALESCE((v_result->>'skipped')::int, 0),
    'engine_result', v_result,
    'skipped_details', v_skipped || COALESCE(v_result->'skipped_details', '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_group_write(uuid, text, text, text, integer, numeric, uuid[], uuid[], boolean, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_group_write(uuid, text, text, text, integer, numeric, uuid[], uuid[], boolean, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_group_write(uuid, text, text, text, integer, numeric, uuid[], uuid[], boolean, text, text, boolean) TO service_role;