CREATE OR REPLACE FUNCTION public.bu_console_kpi_advance(p_kpi_ids uuid[], p_target_stage text, p_remarks text DEFAULT NULL::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_batch uuid := gen_random_uuid();
  v_rec record;
  v_stages text[];
  v_idx int;
  v_tgt_idx int;
  v_next text;
  v_path text[];
  v_superseded text[];
  v_score numeric;
  v_reason text;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_scores numeric[] := ARRAY[]::numeric[];
  v_paths jsonb := '[]'::jsonb;
  v_advanced int := 0;
  v_i int;
  v_detail_limit int := 500;
  v_move_n int := 0;
  v_skip_n int := 0;
  v_supersede_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_write(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;
  IF p_target_stage IS NULL OR p_target_stage NOT IN
     ('self_review','manager_check','functional_manager_check','audit','skip_level_check','hr_pms_review','management_review')
  THEN
    RAISE EXCEPTION 'Unsupported target stage: %', COALESCE(p_target_stage, 'null');
  END IF;
  IF p_kpi_ids IS NULL OR array_length(p_kpi_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', p_dry_run, 'batch_id', NULL,
      'target_stage', p_target_stage, 'will_advance', 0, 'will_skip', 0, 'advanced', 0,
      'skipped', 0, 'will_supersede', 0, 'skip_summary', '[]'::jsonb,
      'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;
  IF array_length(p_kpi_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'Too many rows in one batch (max 5000)';
  END IF;

  FOR v_rec IN
    SELECT k.id, k.employee_id, k.status::text AS status, k.weightage,
           k.kra_name, COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name) AS kpi_name,
           k.review_period, k.review_year,
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
    WHERE k.id = ANY(p_kpi_ids)
    ORDER BY p.full_name, k.kra_name
  LOOP
    v_reason := NULL;
    v_next := NULL;
    v_path := ARRAY[]::text[];
    v_superseded := ARRAY[]::text[];
    v_score := COALESCE(v_rec.management_score, v_rec.hr_pms_score, v_rec.skip_level_score,
                        v_rec.auditor_score, v_rec.functional_manager_score,
                        v_rec.manager_score, v_rec.self_score);

    SELECT ARRAY(SELECT jsonb_array_elements_text(public.get_employee_workflow(
             v_rec.employee_id, v_rec.review_period, v_rec.review_year)))
      INTO v_stages;

    IF v_stages IS NULL OR array_length(v_stages, 1) IS NULL THEN
      v_reason := 'no_workflow';
    ELSIF NOT (p_target_stage = ANY(v_stages)) THEN
      v_reason := 'stage_not_in_workflow';
    ELSE
      v_idx := array_position(v_stages, v_rec.status);
      v_tgt_idx := array_position(v_stages, p_target_stage);
      IF v_idx IS NULL THEN
        v_reason := 'status_not_in_workflow';
      ELSIF v_idx >= array_length(v_stages, 1) THEN
        v_reason := 'terminal_stage';
      ELSIF v_tgt_idx <= v_idx THEN
        -- Backwards moves stay refused: that is what Rollback Requests are for.
        v_reason := 'stage_mismatch';
      ELSE
        -- ADR-290: a higher stage may supersede the ones below it. The path is
        -- every stage from the one after the current status up to the target.
        v_path := v_stages[v_idx + 1 : v_tgt_idx];
        v_superseded := v_stages[v_idx + 1 : v_tgt_idx - 1];
        v_next := p_target_stage;
        IF 'approved' = ANY(v_path) THEN
          v_reason := 'final_approval_not_supported';
        END IF;
      END IF;
    END IF;

    IF v_reason IS NULL AND NOT v_is_admin AND v_rec.status = 'kra_set' THEN
      v_reason := 'kra_set_admin_only';
    END IF;
    IF v_reason IS NULL AND v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    END IF;
    IF v_reason IS NULL AND v_rec.submission_id IS NULL THEN
      v_reason := 'no_submission';
    END IF;
    -- Parity with bulk review: an auditor decision is never overwritten by HR PMS.
    IF v_reason IS NULL AND p_target_stage = 'hr_pms_review' AND v_rec.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    END IF;
    -- A leap never invents the employee's own input (POLICY §111.7.a parity).
    IF v_reason IS NULL AND array_length(v_superseded, 1) IS NOT NULL
       AND COALESCE(v_rec.is_na, false) = false AND v_rec.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    END IF;
    IF v_reason IS NULL AND COALESCE(v_rec.is_na, false) = false AND v_score IS NULL THEN
      v_reason := 'not_scored';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'kra_name', v_rec.kra_name, 'kpi_name', v_rec.kpi_name,
          'current_status', v_rec.status, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    v_move_n := v_move_n + 1;
    IF array_length(v_superseded, 1) IS NOT NULL THEN
      v_supersede_n := v_supersede_n + 1;
    END IF;
    IF v_move_n <= v_detail_limit THEN
      v_preview := v_preview || jsonb_build_object(
        'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
        'kra_name', v_rec.kra_name, 'kpi_name', v_rec.kpi_name,
        'weightage', v_rec.weightage, 'current_status', v_rec.status,
        'next_status', v_next, 'carry_forward_score', v_score,
        'superseded_stages', to_jsonb(v_superseded),
        'is_na', COALESCE(v_rec.is_na, false));
    END IF;

    v_ids := v_ids || v_rec.id;
    v_scores := v_scores || COALESCE(v_score, -1);
    v_paths := v_paths || jsonb_build_array(to_jsonb(v_path));
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF p_dry_run THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', true, 'batch_id', NULL,
      'target_stage', p_target_stage, 'will_advance', v_move_n, 'will_skip', v_skip_n,
      'will_supersede', v_supersede_n,
      'detail_limit', v_detail_limit,
      'detail_truncated', (v_move_n > v_detail_limit OR v_skip_n > v_detail_limit),
      'skip_summary', v_skip_summary, 'preview', v_preview, 'skipped_details', v_skipped);
  END IF;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', false, 'batch_id', v_batch,
      'target_stage', p_target_stage, 'advanced', 0, 'skipped', v_skip_n,
      'superseded', 0, 'skip_summary', v_skip_summary, 'skipped_details', v_skipped);
  END IF;

  FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
    v_score := NULLIF(v_scores[v_i], -1);
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_paths -> (v_i - 1))) INTO v_path;
    v_superseded := v_path[1 : GREATEST(array_length(v_path, 1) - 1, 0)];

    -- Target stage is written outright; superseded stages are only filled when
    -- empty, so an existing lower-stage decision is carried, never overwritten.
    UPDATE public.review_submissions rs
       SET manager_score            = CASE
             WHEN p_target_stage = 'manager_check' AND v_score IS NOT NULL THEN v_score
             WHEN 'manager_check' = ANY(v_path) AND rs.manager_score IS NULL THEN v_score
             ELSE rs.manager_score END,
           manager_remarks          = CASE WHEN p_target_stage = 'manager_check' THEN COALESCE(p_remarks, rs.manager_remarks) ELSE rs.manager_remarks END,
           functional_manager_score = CASE
             WHEN p_target_stage = 'functional_manager_check' AND v_score IS NOT NULL THEN v_score
             WHEN 'functional_manager_check' = ANY(v_path) AND rs.functional_manager_score IS NULL THEN v_score
             ELSE rs.functional_manager_score END,
           auditor_score            = CASE
             WHEN p_target_stage = 'audit' AND v_score IS NOT NULL THEN v_score
             WHEN 'audit' = ANY(v_path) AND rs.auditor_score IS NULL THEN v_score
             ELSE rs.auditor_score END,
           auditor_remarks          = CASE WHEN p_target_stage = 'audit' THEN COALESCE(p_remarks, rs.auditor_remarks) ELSE rs.auditor_remarks END,
           skip_level_score         = CASE
             WHEN p_target_stage = 'skip_level_check' AND v_score IS NOT NULL THEN v_score
             WHEN 'skip_level_check' = ANY(v_path) AND rs.skip_level_score IS NULL THEN v_score
             ELSE rs.skip_level_score END,
           hr_pms_score             = CASE
             WHEN p_target_stage = 'hr_pms_review' AND v_score IS NOT NULL THEN v_score
             WHEN 'hr_pms_review' = ANY(v_path) AND rs.hr_pms_score IS NULL THEN v_score
             ELSE rs.hr_pms_score END,
           management_score         = CASE
             WHEN p_target_stage = 'management_review' AND v_score IS NOT NULL THEN v_score
             WHEN 'management_review' = ANY(v_path) AND rs.management_score IS NULL THEN v_score
             ELSE rs.management_score END,
           management_remarks       = CASE WHEN p_target_stage = 'management_review' THEN COALESCE(p_remarks, rs.management_remarks) ELSE rs.management_remarks END,
           group_write_batch_id     = v_batch,
           is_group_override        = true,
           updated_at               = now()
     WHERE rs.kpi_id = v_ids[v_i]
       AND rs.final_score IS NULL;

    UPDATE public.kpis SET status = p_target_stage::review_status WHERE id = v_ids[v_i];

    IF FOUND THEN
      v_advanced := v_advanced + 1;
      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (v_ids[v_i], 'BU_CONSOLE_RUN_ADVANCE', v_user,
        jsonb_build_object('batch_id', v_batch, 'target_stage', p_target_stage,
          'carry_forward_score', v_score, 'remarks', p_remarks, 'source', 'review_run',
          'stage_path', to_jsonb(v_path), 'superseded_stages', to_jsonb(v_superseded)));

      -- One audit entry per superseded stage so the timeline never collapses
      -- silently (ADR-290 / POLICY §CONSOLE-STAGE-SUPERSEDE).
      IF array_length(v_superseded, 1) IS NOT NULL THEN
        INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
        SELECT v_ids[v_i], 'BU_CONSOLE_STAGE_SUPERSEDED', v_user,
               jsonb_build_object('batch_id', v_batch, 'superseded_stage', s,
                 'by_stage', p_target_stage, 'carry_forward_score', v_score,
                 'remarks', p_remarks, 'source', 'review_run')
        FROM unnest(v_superseded) AS s;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('authorized', true, 'dry_run', false, 'batch_id', v_batch,
    'target_stage', p_target_stage, 'advanced', v_advanced, 'skipped', v_skip_n,
    'superseded', v_supersede_n,
    'skip_summary', v_skip_summary, 'skipped_details', v_skipped);
END;
$function$;