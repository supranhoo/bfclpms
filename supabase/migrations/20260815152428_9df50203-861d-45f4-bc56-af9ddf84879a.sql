-- ADR-264 — BU Console: no silent truncation.
-- Previews report true totals + reason summary; detail lists are capped and labelled.

CREATE OR REPLACE FUNCTION public.bu_console_group_write(p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer, p_achieved_value numeric DEFAULT NULL::numeric, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_is_na boolean DEFAULT false, p_remarks text DEFAULT NULL::text, p_overwrite_policy text DEFAULT 'pre_review_only'::text, p_dry_run boolean DEFAULT true)
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
  v_detail_limit int := 500;
  v_write_n int := 0;
  v_skip_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
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
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skip_n <= v_detail_limit THEN
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
      END IF;
      CONTINUE;
    END IF;

    v_write_n := v_write_n + 1;

    IF v_write_n <= v_detail_limit THEN
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
    END IF;

    -- The write set is NEVER truncated: every eligible row is committed.
    v_items := v_items || jsonb_build_object(
      'kpi_id', v_rec.id,
      'self_score', v_score,
      'achieved_value', p_achieved_value
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', true,
      'batch_id', NULL,
      'achieved_value', p_achieved_value,
      'will_write', v_write_n,
      'will_skip', v_skip_n,
      'detail_limit', v_detail_limit,
      'detail_truncated', (v_write_n > v_detail_limit OR v_skip_n > v_detail_limit),
      'skip_summary', v_skip_summary,
      'preview', v_preview,
      'skipped', v_skipped,
      'skipped_details', v_skipped
    );
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', false,
      'batch_id', v_batch,
      'propagated', 0,
      'skipped', v_skip_n,
      'detail_limit', v_detail_limit,
      'detail_truncated', (v_skip_n > v_detail_limit),
      'skip_summary', v_skip_summary,
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
    'skipped', v_skip_n + COALESCE((v_result->>'skipped')::int, 0),
    'detail_limit', v_detail_limit,
    'detail_truncated', (v_skip_n > v_detail_limit),
    'skip_summary', v_skip_summary,
    'engine_result', v_result,
    'skipped_details', v_skipped || COALESCE(v_result->'skipped_details', '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bu_console_group_advance(p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer, p_target_stage text, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_remarks text DEFAULT NULL::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_rec record;
  v_stages text[];
  v_idx int;
  v_next text;
  v_score numeric;
  v_reason text;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_scores numeric[] := ARRAY[]::numeric[];
  v_advanced int := 0;
  v_i int;
  v_detail_limit int := 500;
  v_move_n int := 0;
  v_skip_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;

  IF p_target_stage IS NULL OR p_target_stage NOT IN
     ('self_review','manager_check','functional_manager_check','audit','skip_level_check','hr_pms_review','management_review')
  THEN
    RAISE EXCEPTION 'Unsupported target stage: %', COALESCE(p_target_stage, 'null');
  END IF;

  FOR v_rec IN
    SELECT k.id, k.employee_id, k.status::text AS status, k.weightage,
           p.full_name, p.employee_code,
           d.name AS department_name, bu.name AS business_unit_name,
           rs.id AS submission_id, rs.final_score, rs.is_na,
           rs.self_score, rs.manager_score, rs.functional_manager_score,
           rs.auditor_score, rs.skip_level_score, rs.hr_pms_score, rs.management_score
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
    v_next := NULL;

    v_score := COALESCE(v_rec.management_score, v_rec.hr_pms_score, v_rec.skip_level_score,
                        v_rec.auditor_score, v_rec.functional_manager_score,
                        v_rec.manager_score, v_rec.self_score);

    SELECT ARRAY(SELECT jsonb_array_elements_text(public.get_employee_workflow(v_rec.employee_id, p_period, p_year)))
      INTO v_stages;

    IF v_stages IS NULL OR array_length(v_stages, 1) IS NULL THEN
      v_reason := 'no_workflow';
    ELSIF NOT (p_target_stage = ANY(v_stages)) THEN
      v_reason := 'stage_not_in_workflow';
    ELSE
      v_idx := array_position(v_stages, v_rec.status);
      IF v_idx IS NULL THEN
        v_reason := 'status_not_in_workflow';
      ELSIF v_idx >= array_length(v_stages, 1) THEN
        v_reason := 'terminal_stage';
      ELSE
        v_next := v_stages[v_idx + 1];
        IF v_next = 'approved' THEN
          v_reason := 'final_approval_not_supported';
        ELSIF v_next <> p_target_stage THEN
          v_reason := 'stage_mismatch';
        END IF;
      END IF;
    END IF;

    IF v_reason IS NULL AND v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    END IF;

    IF v_reason IS NULL AND v_rec.submission_id IS NULL THEN
      v_reason := 'no_submission';
    END IF;

    IF v_reason IS NULL AND COALESCE(v_rec.is_na, false) = false AND v_score IS NULL THEN
      v_reason := 'not_scored';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id,
          'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name,
          'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name,
          'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status,
          'reason', v_reason
        );
      END IF;
      CONTINUE;
    END IF;

    v_move_n := v_move_n + 1;

    IF v_move_n <= v_detail_limit THEN
      v_preview := v_preview || jsonb_build_object(
        'kpi_id', v_rec.id,
        'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name,
        'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name,
        'business_unit_name', v_rec.business_unit_name,
        'weightage', v_rec.weightage,
        'current_status', v_rec.status,
        'next_status', v_next,
        'carry_forward_score', v_score,
        'is_na', COALESCE(v_rec.is_na, false)
      );
    END IF;

    -- The advance set is NEVER truncated.
    v_ids := v_ids || v_rec.id;
    v_scores := v_scores || COALESCE(v_score, -1);
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', true,
      'batch_id', NULL,
      'target_stage', p_target_stage,
      'will_advance', v_move_n,
      'will_skip', v_skip_n,
      'detail_limit', v_detail_limit,
      'detail_truncated', (v_move_n > v_detail_limit OR v_skip_n > v_detail_limit),
      'skip_summary', v_skip_summary,
      'preview', v_preview,
      'skipped', v_skipped,
      'skipped_details', v_skipped
    );
  END IF;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'authorized', true, 'dry_run', false, 'batch_id', v_batch,
      'target_stage', p_target_stage, 'advanced', 0,
      'skipped', v_skip_n,
      'detail_limit', v_detail_limit,
      'detail_truncated', (v_skip_n > v_detail_limit),
      'skip_summary', v_skip_summary,
      'skipped_details', v_skipped
    );
  END IF;

  FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
    v_score := NULLIF(v_scores[v_i], -1);

    UPDATE public.review_submissions rs
       SET manager_score            = CASE WHEN p_target_stage = 'manager_check' AND v_score IS NOT NULL THEN v_score ELSE rs.manager_score END,
           manager_remarks          = CASE WHEN p_target_stage = 'manager_check' THEN COALESCE(p_remarks, rs.manager_remarks) ELSE rs.manager_remarks END,
           functional_manager_score = CASE WHEN p_target_stage = 'functional_manager_check' AND v_score IS NOT NULL THEN v_score ELSE rs.functional_manager_score END,
           auditor_score            = CASE WHEN p_target_stage = 'audit' AND v_score IS NOT NULL THEN v_score ELSE rs.auditor_score END,
           auditor_remarks          = CASE WHEN p_target_stage = 'audit' THEN COALESCE(p_remarks, rs.auditor_remarks) ELSE rs.auditor_remarks END,
           skip_level_score         = CASE WHEN p_target_stage = 'skip_level_check' AND v_score IS NOT NULL THEN v_score ELSE rs.skip_level_score END,
           hr_pms_score             = CASE WHEN p_target_stage = 'hr_pms_review' AND v_score IS NOT NULL THEN v_score ELSE rs.hr_pms_score END,
           management_score         = CASE WHEN p_target_stage = 'management_review' AND v_score IS NOT NULL THEN v_score ELSE rs.management_score END,
           management_remarks       = CASE WHEN p_target_stage = 'management_review' THEN COALESCE(p_remarks, rs.management_remarks) ELSE rs.management_remarks END,
           group_write_batch_id     = v_batch,
           is_group_override        = true,
           updated_at               = now()
     WHERE rs.kpi_id = v_ids[v_i]
       AND rs.final_score IS NULL;

    UPDATE public.kpis
       SET status = p_target_stage::review_status
     WHERE id = v_ids[v_i];

    IF FOUND THEN
      v_advanced := v_advanced + 1;
      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (v_ids[v_i], 'BU_CONSOLE_GROUP_ADVANCE', v_user,
        jsonb_build_object(
          'batch_id', v_batch,
          'category_id', p_category_id,
          'kra_name', p_kra_name,
          'kpi_name', p_kpi_name,
          'review_period', p_period,
          'review_year', p_year,
          'target_stage', p_target_stage,
          'carry_forward_score', v_score,
          'remarks', p_remarks
        ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', false,
    'batch_id', v_batch,
    'target_stage', p_target_stage,
    'advanced', v_advanced,
    'skipped', v_skip_n,
    'detail_limit', v_detail_limit,
    'detail_truncated', (v_skip_n > v_detail_limit),
    'skip_summary', v_skip_summary,
    'skipped_details', v_skipped
  );
END;
$function$;

-- Paged merge proposal list (replaces the client-side 500 cap).
CREATE OR REPLACE FUNCTION public.bu_console_merge_proposal_list(p_status text DEFAULT 'pending', p_page integer DEFAULT 1, p_page_size integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_size int := LEAST(GREATEST(COALESCE(p_page_size, 200), 1), 500);
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_total int;
  v_rows jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size);
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.kpi_merge_proposals mp
  WHERE p_status IS NULL OR mp.status::text = p_status;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.affected_employee_count DESC NULLS LAST, t.created_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT mp.*
    FROM public.kpi_merge_proposals mp
    WHERE p_status IS NULL OR mp.status::text = p_status
    ORDER BY mp.affected_employee_count DESC NULLS LAST, mp.created_at DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  ) t;

  RETURN jsonb_build_object(
    'authorized', true,
    'rows', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_size
  );
END;
$function$;

-- Definition picker search that reports the true match count.
CREATE OR REPLACE FUNCTION public.bu_console_definition_search(p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_total int;
  v_rows jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0, 'limit', v_limit);
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.kpi_definitions_master m
  WHERE m.is_active = true
    AND (v_search IS NULL OR m.kpi_name ILIKE '%' || v_search || '%' OR m.kra_name ILIKE '%' || v_search || '%');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'kra_name', t.kra_name, 'kpi_name', t.kpi_name, 'uom', t.uom
         ) ORDER BY t.kpi_name), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.kra_name, m.kpi_name, m.uom
    FROM public.kpi_definitions_master m
    WHERE m.is_active = true
      AND (v_search IS NULL OR m.kpi_name ILIKE '%' || v_search || '%' OR m.kra_name ILIKE '%' || v_search || '%')
    ORDER BY m.kpi_name
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('authorized', true, 'rows', v_rows, 'total', v_total, 'limit', v_limit);
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_merge_proposal_list(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bu_console_definition_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_merge_proposal_list(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_definition_search(text, integer) TO authenticated;