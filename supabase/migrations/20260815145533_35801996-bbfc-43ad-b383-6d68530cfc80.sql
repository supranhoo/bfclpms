CREATE OR REPLACE FUNCTION public.bu_console_group_advance(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_target_stage text,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_remarks text DEFAULT NULL,
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped', '[]'::jsonb);
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

    -- Effective score cascade (POLICY: universal scoring logic, highest completed stage wins).
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

    -- POLICY §88: approved final scores are immutable.
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
      'current_status', v_rec.status,
      'next_status', v_next,
      'carry_forward_score', v_score,
      'is_na', COALESCE(v_rec.is_na, false)
    );

    v_ids := v_ids || v_rec.id;
    v_scores := v_scores || COALESCE(v_score, -1);
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'dry_run', true,
      'batch_id', NULL,
      'target_stage', p_target_stage,
      'will_advance', jsonb_array_length(v_preview),
      'will_skip', jsonb_array_length(v_skipped),
      'preview', v_preview,
      'skipped', v_skipped
    );
  END IF;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'authorized', true, 'dry_run', false, 'batch_id', v_batch,
      'target_stage', p_target_stage, 'advanced', 0,
      'skipped', jsonb_array_length(v_skipped), 'skipped_details', v_skipped
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
    'skipped', jsonb_array_length(v_skipped),
    'skipped_details', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_group_advance(uuid, text, text, text, integer, text, uuid[], uuid[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_group_advance(uuid, text, text, text, integer, text, uuid[], uuid[], text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_group_advance(uuid, text, text, text, integer, text, uuid[], uuid[], text, boolean) TO service_role;