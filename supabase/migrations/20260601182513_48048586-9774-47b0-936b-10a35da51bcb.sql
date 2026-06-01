-- Phase 5: Functional Manager bulk review wiring
-- Adds FM per-stage score/rating/remarks/evidence columns to review_submissions
-- and extends bulk_write_stage_scores + bulk_review_snapshot to handle the new stage.

-- 1) Additive columns (nullable, non-destructive)
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS functional_manager_score numeric,
  ADD COLUMN IF NOT EXISTS functional_manager_rating public.rating_level,
  ADD COLUMN IF NOT EXISTS functional_manager_remarks text,
  ADD COLUMN IF NOT EXISTS functional_manager_evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Extend bulk_review_snapshot to surface FM column
CREATE OR REPLACE FUNCTION public.bulk_review_snapshot(
  p_period text,
  p_year integer,
  p_viewer_stage text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INTEGER := GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1);
  v_dept UUID := NULLIF(p_filters->>'department_id','')::UUID;
  v_manager UUID := NULLIF(p_filters->>'manager_id','')::UUID;
  v_company UUID := NULLIF(p_filters->>'company_id','')::UUID;
  v_division UUID := NULLIF(p_filters->>'division_id','')::UUID;
  v_bu UUID := NULLIF(p_filters->>'business_unit_id','')::UUID;
  v_category UUID := NULLIF(p_filters->>'category_id','')::UUID;
  v_rows JSONB;
  v_total INTEGER;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'skip_level'::app_role)
    OR public.has_role(auth.uid(),'hr_pms'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
    OR public.has_role(auth.uid(),'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF p_page_size > 500 THEN
    RAISE EXCEPTION 'page_size exceeds maximum (500)' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND COALESCE(k.frequency,'') <> 'daily'
    AND (v_dept IS NULL OR p.department_id = v_dept)
    AND (v_manager IS NULL OR p.reporting_manager_id = v_manager)
    AND (v_company IS NULL OR p.company_id = v_company)
    AND (v_bu IS NULL OR d.business_unit_id = v_bu)
    AND (v_division IS NULL OR bu.division_id = v_division)
    AND (v_category IS NULL OR k.category_id = v_category);

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      k.id AS kpi_id,
      k.employee_id,
      k.kpi_name,
      k.kra_name,
      k.weightage,
      k.status,
      k.kpi_group_type,
      k.frequency,
      p.full_name AS employee_name,
      p.employee_code,
      rs.id AS submission_id,
      rs.self_score,
      rs.manager_score,
      rs.functional_manager_score,
      rs.skip_level_score,
      rs.hr_pms_score,
      rs.auditor_score,
      rs.management_score,
      rs.final_score,
      rs.is_na,
      rs.final_revision_no,
      rs.row_version
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND COALESCE(k.frequency,'') <> 'daily'
      AND (v_dept IS NULL OR p.department_id = v_dept)
      AND (v_manager IS NULL OR p.reporting_manager_id = v_manager)
      AND (v_company IS NULL OR p.company_id = v_company)
      AND (v_bu IS NULL OR d.business_unit_id = v_bu)
      AND (v_division IS NULL OR bu.division_id = v_division)
      AND (v_category IS NULL OR k.category_id = v_category)
    ORDER BY p.full_name, k.kra_name, k.kpi_name
    LIMIT GREATEST(p_page_size,1)
    OFFSET v_offset
  ) s;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'viewer_stage', p_viewer_stage
  );
END;
$function$;

-- 3) Patched bulk_write_stage_scores (v2 with FM branches)
CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(p_stage text, p_cells jsonb, p_batch_reason text DEFAULT NULL::text, p_attachment_urls jsonb DEFAULT '[]'::jsonb, p_manual_scores jsonb DEFAULT NULL::jsonb, p_achieved_values jsonb DEFAULT NULL::jsonb, p_is_override boolean DEFAULT false, p_evidence_urls jsonb DEFAULT NULL::jsonb, p_is_na jsonb DEFAULT NULL::jsonb, p_na_reasons jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_cell jsonb;
  v_sub_id uuid;
  v_score numeric;
  v_inherited_from text;
  v_prev_carried numeric;
  v_cell_remarks text;
  v_effective_remarks text;
  v_exp_ver int;
  v_cur record;
  v_kpi public.kpis;
  v_manual numeric;
  v_achieved_in jsonb;
  v_achieved_num numeric;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_hr_override_count int := 0;
  v_period text := NULL;
  v_year  int  := NULL;
  v_affected_kpi_ids uuid[] := ARRAY[]::uuid[];
  v_reconcile_ids uuid[]    := ARRAY[]::uuid[];
  v_reconcile_result jsonb;
  v_advanced_count int := 0;
  v_attach jsonb;
  v_attach_count int;
  v_cell_attach jsonb;
  v_cell_attach_count int;
  v_shared_remark text;
  v_is_admin boolean;
  v_manual_count int := 0;
  v_achieved_count int := 0;
  v_na_count int := 0;
  v_acted_stage_key text;
  v_non_terminal_count int := 0;
  v_relocked_count int := 0;
  v_relocked_non_terminal_count int := 0;
  v_override_approved_count int := 0;
  v_nt_row record;
  v_kpi_status text;
  v_kpi_id uuid;
  v_emp_id uuid;
  v_term_stage text;
  v_old_final numeric;
  v_new_rating public.rating_level;
  v_is_relock boolean;
  v_is_force_approve boolean;
  v_is_na_cell boolean;
  v_na_reason text;
  v_relock_log jsonb := '[]'::jsonb;
  v_relock_entry jsonb;
  v_kpi_term_period text;
  v_kpi_term_year int;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF p_stage NOT IN ('manager','functional_manager','skip_level','hr_pms','auditor') THEN
    RAISE EXCEPTION 'invalid stage: %', p_stage;
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  v_shared_remark := COALESCE(btrim(p_batch_reason), '');
  IF length(v_shared_remark) < 10 THEN
    RAISE EXCEPTION 'remark required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  v_attach := COALESCE(p_attachment_urls, '[]'::jsonb);
  IF jsonb_typeof(v_attach) <> 'array' THEN
    RAISE EXCEPTION 'p_attachment_urls must be a json array of urls';
  END IF;
  v_attach_count := jsonb_array_length(v_attach);
  IF v_attach_count > 5 THEN
    RAISE EXCEPTION 'too many attachments (max 5)';
  END IF;

  IF p_evidence_urls IS NOT NULL AND jsonb_typeof(p_evidence_urls) <> 'object' THEN
    RAISE EXCEPTION 'p_evidence_urls must be a json object keyed by submission_id';
  END IF;
  IF p_is_na IS NOT NULL AND jsonb_typeof(p_is_na) <> 'object' THEN
    RAISE EXCEPTION 'p_is_na must be a json object keyed by submission_id';
  END IF;
  IF p_na_reasons IS NOT NULL AND jsonb_typeof(p_na_reasons) <> 'object' THEN
    RAISE EXCEPTION 'p_na_reasons must be a json object keyed by submission_id';
  END IF;

  IF p_manual_scores IS NOT NULL AND jsonb_typeof(p_manual_scores) = 'object' THEN
    SELECT count(*)::int INTO v_manual_count FROM jsonb_object_keys(p_manual_scores);
  END IF;
  IF p_achieved_values IS NOT NULL AND jsonb_typeof(p_achieved_values) = 'object' THEN
    SELECT count(*)::int INTO v_achieved_count FROM jsonb_object_keys(p_achieved_values);
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin'::public.app_role);
  IF p_is_override AND NOT v_is_admin THEN
    p_is_override := false;
  END IF;

  v_acted_stage_key := CASE p_stage
    WHEN 'manager'           THEN 'manager_check'
    WHEN 'functional_manager' THEN 'functional_manager_check'
    WHEN 'skip_level'        THEN 'skip_level_check'
    WHEN 'hr_pms'     THEN 'hr_pms_review'
    WHEN 'auditor'    THEN 'audit'
  END;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_cell_remarks := v_cell->>'remarks';
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_inherited_from := NULL;
    v_score := NULL;
    v_prev_carried := NULL;
    v_is_relock := false;
    v_is_force_approve := false;
    v_old_final := NULL;
    v_is_na_cell := false;
    v_na_reason := NULL;

    -- Per-cell N/A flag
    IF p_is_na IS NOT NULL AND p_is_na ? v_sub_id::text THEN
      v_is_na_cell := COALESCE((p_is_na->>v_sub_id::text)::boolean, false);
    END IF;

    -- Resolve per-cell evidence (overrides batch attachments for this single cell when provided)
    v_cell_attach := NULL;
    IF p_evidence_urls IS NOT NULL AND p_evidence_urls ? v_sub_id::text THEN
      v_cell_attach := p_evidence_urls->v_sub_id::text;
      IF jsonb_typeof(v_cell_attach) <> 'array' THEN
        v_cell_attach := NULL;
      END IF;
    END IF;
    IF v_cell_attach IS NOT NULL THEN
      v_cell_attach_count := jsonb_array_length(v_cell_attach);
      IF v_cell_attach_count > 5 THEN
        v_skipped := v_skipped || jsonb_build_object('submission_id', v_sub_id, 'reason', 'too_many_attachments');
        CONTINUE;
      END IF;
    ELSE
      v_cell_attach := v_attach;
      v_cell_attach_count := v_attach_count;
    END IF;

    v_manual := NULL;
    IF p_manual_scores IS NOT NULL AND p_manual_scores ? v_sub_id::text THEN
      v_manual := NULLIF(p_manual_scores->>v_sub_id::text,'')::numeric;
    END IF;

    v_achieved_in := NULL;
    v_achieved_num := NULL;
    IF p_achieved_values IS NOT NULL AND p_achieved_values ? v_sub_id::text THEN
      v_achieved_in := p_achieved_values->v_sub_id::text;
      BEGIN
        v_achieved_num := NULLIF(regexp_replace(COALESCE(v_achieved_in #>> '{}', ''), '[^0-9.\-]', '', 'g'),'')::numeric;
      EXCEPTION WHEN OTHERS THEN v_achieved_num := NULL; END;
    END IF;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, functional_manager_score, manager_score, self_score, achieved_value, row_version,
           manager_evidence_urls, functional_manager_evidence_urls, skip_level_evidence_urls,
           hr_pms_evidence_urls, auditor_evidence_urls
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL AND NOT (v_is_admin AND p_is_override) THEN
      v_reason := 'final_locked';
    ELSIF NOT p_is_override AND v_cur.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    ELSIF NOT v_is_na_cell AND NOT p_is_override AND p_stage = 'hr_pms' AND v_cur.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    ELSIF NOT p_is_override AND v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    -- ============================================================
    -- BRANCH A: Mark N/A path (skips score / relock / propagation)
    -- ============================================================
    IF v_is_na_cell THEN
      v_na_reason := COALESCE(NULLIF(btrim(COALESCE(p_na_reasons->>v_sub_id::text, '')), ''),
                              NULLIF(btrim(v_cell_remarks), ''),
                              v_shared_remark);
      IF length(COALESCE(v_na_reason,'')) < 10 THEN
        v_skipped := v_skipped || jsonb_build_object('submission_id', v_sub_id, 'reason', 'na_reason_required');
        CONTINUE;
      END IF;

      IF p_stage = 'manager' THEN
        UPDATE public.review_submissions
           SET manager_score = NULL, manager_rating = NULL, manager_remarks = NULL,
               manager_evidence_urls = CASE WHEN v_cell_attach_count > 0
                                            THEN COALESCE(v_cur.manager_evidence_urls,'[]'::jsonb) || v_cell_attach
                                            ELSE manager_evidence_urls END,
               is_na = true, na_marked_by_role = 'manager', na_reason = v_na_reason,
               group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
         WHERE id = v_sub_id;
      ELSIF p_stage = 'skip_level' THEN
        UPDATE public.review_submissions
           SET skip_level_score = NULL, skip_level_rating = NULL, skip_level_remarks = NULL,
               skip_level_evidence_urls = CASE WHEN v_cell_attach_count > 0
                                               THEN COALESCE(v_cur.skip_level_evidence_urls,'[]'::jsonb) || v_cell_attach
                                               ELSE skip_level_evidence_urls END,
               is_na = true, na_marked_by_role = 'skip_level', na_reason = v_na_reason,
               group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
         WHERE id = v_sub_id;
      ELSIF p_stage = 'hr_pms' THEN
        UPDATE public.review_submissions
           SET hr_pms_score = NULL, hr_pms_rating = NULL, hr_pms_remarks = NULL,
               hr_pms_evidence_urls = CASE WHEN v_cell_attach_count > 0
                                           THEN COALESCE(v_cur.hr_pms_evidence_urls,'[]'::jsonb) || v_cell_attach
                                           ELSE hr_pms_evidence_urls END,
               is_na = true, na_marked_by_role = 'hr_pms', na_reason = v_na_reason,
               group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
         WHERE id = v_sub_id;
      ELSIF p_stage = 'auditor' THEN
        UPDATE public.review_submissions
           SET auditor_score = NULL, auditor_rating = NULL, auditor_remarks = NULL,
               auditor_evidence_urls = CASE WHEN v_cell_attach_count > 0
                                            THEN COALESCE(v_cur.auditor_evidence_urls,'[]'::jsonb) || v_cell_attach
                                            ELSE auditor_evidence_urls END,
               is_na = true, na_marked_by_role = 'auditor', na_reason = v_na_reason,
               group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
         WHERE id = v_sub_id;
      ELSIF p_stage = 'functional_manager' THEN
        UPDATE public.review_submissions
           SET functional_manager_score = NULL, functional_manager_rating = NULL, functional_manager_remarks = NULL,
               functional_manager_evidence_urls = CASE WHEN v_cell_attach_count > 0
                                                       THEN COALESCE(v_cur.functional_manager_evidence_urls,'[]'::jsonb) || v_cell_attach
                                                       ELSE functional_manager_evidence_urls END,
               is_na = true, na_marked_by_role = 'functional_manager', na_reason = v_na_reason,
               group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
         WHERE id = v_sub_id;
      END IF;

      BEGIN
        INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, new_value, metadata)
        VALUES (v_cur.kpi_id, 'BULK_NA_MARK_' || upper(p_stage), v_actor,
          jsonb_build_object('stage', p_stage, 'na_reason', v_na_reason),
          jsonb_build_object('batch_id', v_batch_id, 'submission_id', v_sub_id,
            'attachment_count', v_cell_attach_count, 'batch_reason', v_shared_remark));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      v_affected_kpi_ids := v_affected_kpi_ids || v_cur.kpi_id;
      v_reconcile_ids := v_reconcile_ids || v_cur.kpi_id;
      v_na_count := v_na_count + 1;
      v_applied := v_applied + 1;
      CONTINUE;
    END IF;

    -- ============================================================
    -- BRANCH B: Normal score path (existing behaviour, unchanged)
    -- ============================================================
    IF v_cur.final_score IS NOT NULL AND v_is_admin AND p_is_override THEN
      v_is_relock := true;
      v_old_final := v_cur.final_score;
    END IF;

    IF v_achieved_num IS NOT NULL THEN
      UPDATE public.review_submissions
         SET achieved_value = v_achieved_num
       WHERE id = v_sub_id;
      v_cur.achieved_value := v_achieved_num;
    END IF;

    v_prev_carried := CASE p_stage
      WHEN 'manager'           THEN v_cur.self_score
      WHEN 'functional_manager' THEN COALESCE(v_cur.manager_score, v_cur.self_score)
      WHEN 'skip_level'        THEN COALESCE(v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score)
      WHEN 'hr_pms'            THEN COALESCE(v_cur.skip_level_score, v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score)
      WHEN 'auditor'           THEN COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score)
    END;

    IF v_manual IS NOT NULL THEN
      v_score := GREATEST(0, LEAST(5, v_manual));
      v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'manual' END;
    ELSIF v_achieved_num IS NOT NULL THEN
      SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
      IF FOUND THEN
        v_score := public.fn_compute_rating_from_achievement(v_kpi, v_achieved_num, NULL);
      END IF;
      IF v_score IS NULL THEN
        v_reason := 'no_prior_score';
      ELSE
        v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'computed_from_achievement' END;
      END IF;
    ELSIF p_is_override THEN
      v_reason := 'override_requires_input';
    ELSE
      IF p_stage = 'manager' THEN
        v_score := v_cur.self_score;
        v_inherited_from := 'self';
      ELSIF p_stage = 'functional_manager' THEN
        v_score := COALESCE(v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE WHEN v_cur.manager_score IS NOT NULL THEN 'manager' ELSE 'self' END;
      ELSIF p_stage = 'skip_level' THEN
        v_score := COALESCE(v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE
          WHEN v_cur.functional_manager_score IS NOT NULL THEN 'functional_manager'
          WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
          ELSE 'self' END;
      ELSIF p_stage = 'hr_pms' THEN
        v_score := COALESCE(v_cur.skip_level_score, v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE
          WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
          WHEN v_cur.functional_manager_score IS NOT NULL THEN 'functional_manager'
          WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
          ELSE 'self' END;
      ELSIF p_stage = 'auditor' THEN
        v_score := COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.functional_manager_score, v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE
          WHEN v_cur.hr_pms_score IS NOT NULL THEN 'hr_pms'
          WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
          WHEN v_cur.functional_manager_score IS NOT NULL THEN 'functional_manager'
          WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
          ELSE 'self' END;
      END IF;

      IF v_score IS NULL THEN
        SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
        IF FOUND THEN
          v_score := public.fn_compute_rating_from_achievement(v_kpi, v_cur.achieved_value, NULL);
          IF v_score IS NOT NULL THEN
            v_inherited_from := 'computed_from_achievement';
          END IF;
        END IF;
      END IF;

      IF v_score IS NULL THEN
        v_reason := 'no_prior_score';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    v_effective_remarks := COALESCE(NULLIF(btrim(v_cell_remarks), ''), v_shared_remark);

    IF p_stage = 'auditor' AND v_cur.hr_pms_score IS NOT NULL THEN
      v_hr_override_count := v_hr_override_count + 1;
    END IF;

    v_new_rating := CASE
      WHEN v_score >= 4.5 THEN 'blue'::public.rating_level
      WHEN v_score >= 3.5 THEN 'green'::public.rating_level
      WHEN v_score >= 2.5 THEN 'yellow'::public.rating_level
      ELSE 'red'::public.rating_level
    END;

    IF p_stage = 'manager' THEN
      UPDATE public.review_submissions
         SET manager_score = v_score, manager_rating = v_new_rating,
             manager_remarks = v_effective_remarks,
             manager_evidence_urls = CASE WHEN v_cell_attach_count > 0 THEN COALESCE(v_cur.manager_evidence_urls, '[]'::jsonb) || v_cell_attach ELSE manager_evidence_urls END,
             group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'skip_level' THEN
      UPDATE public.review_submissions
         SET skip_level_score = v_score, skip_level_rating = v_new_rating,
             skip_level_remarks = v_effective_remarks,
             skip_level_evidence_urls = CASE WHEN v_cell_attach_count > 0 THEN COALESCE(v_cur.skip_level_evidence_urls, '[]'::jsonb) || v_cell_attach ELSE skip_level_evidence_urls END,
             group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'hr_pms' THEN
      UPDATE public.review_submissions
         SET hr_pms_score = v_score, hr_pms_rating = v_new_rating,
             hr_pms_remarks = v_effective_remarks,
             hr_pms_evidence_urls = CASE WHEN v_cell_attach_count > 0 THEN COALESCE(v_cur.hr_pms_evidence_urls, '[]'::jsonb) || v_cell_attach ELSE hr_pms_evidence_urls END,
             group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'auditor' THEN
      UPDATE public.review_submissions
         SET auditor_score = v_score, auditor_rating = v_new_rating,
             auditor_remarks = v_effective_remarks,
             auditor_evidence_urls = CASE WHEN v_cell_attach_count > 0 THEN COALESCE(v_cur.auditor_evidence_urls, '[]'::jsonb) || v_cell_attach ELSE auditor_evidence_urls END,
             group_write_batch_id = v_batch_id,
             is_auditor_override_of_hr = (v_cur.hr_pms_score IS NOT NULL),
             row_version = row_version + 1, updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'functional_manager' THEN
      UPDATE public.review_submissions
         SET functional_manager_score = v_score, functional_manager_rating = v_new_rating,
             functional_manager_remarks = v_effective_remarks,
             functional_manager_evidence_urls = CASE WHEN v_cell_attach_count > 0 THEN COALESCE(v_cur.functional_manager_evidence_urls, '[]'::jsonb) || v_cell_attach ELSE functional_manager_evidence_urls END,
             group_write_batch_id = v_batch_id, row_version = row_version + 1, updated_at = now()
       WHERE id = v_sub_id;
    END IF;

    SELECT k.id, k.status::text, k.employee_id, k.review_period, k.review_year
      INTO v_kpi_id, v_kpi_status, v_emp_id, v_kpi_term_period, v_kpi_term_year
      FROM public.kpis k WHERE k.id = v_cur.kpi_id;

    SELECT (
      SELECT s FROM jsonb_array_elements_text(wf.stages) WITH ORDINALITY AS t(s, ord)
      WHERE s <> 'approved' ORDER BY ord DESC LIMIT 1
    ) INTO v_term_stage
    FROM get_employee_workflow_info(v_emp_id, v_kpi_term_period, v_kpi_term_year) wf;

    IF v_is_relock THEN
      IF v_term_stage = v_acted_stage_key THEN
        UPDATE public.review_submissions
           SET final_score  = v_score, final_rating = v_new_rating, updated_at = now()
         WHERE id = v_sub_id;
        INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (v_cur.kpi_id, 'ADMIN_BULK_OVERRIDE_FINAL_UNLOCK', v_actor,
          jsonb_build_object('final_score', v_old_final),
          jsonb_build_object('final_score', v_score, 'final_rating', v_new_rating),
          jsonb_build_object('batch_id', v_batch_id, 'submission_id', v_sub_id,
            'acted_stage', v_acted_stage_key, 'terminal_stage', v_term_stage,
            'batch_reason', v_shared_remark, 'policy', '§88.1.a'));
        v_relocked_count := v_relocked_count + 1;
        v_relock_log := v_relock_log || jsonb_build_object(
          'kpi_id', v_kpi_id, 'employee_id', v_emp_id,
          'old_final', v_old_final, 'new_final', v_score,
          'period', v_kpi_term_period, 'year', v_kpi_term_year);
      ELSE
        v_relocked_non_terminal_count := v_relocked_non_terminal_count + 1;
        INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, new_value, metadata)
        VALUES (v_cur.kpi_id, 'ADMIN_BULK_OVERRIDE_COLUMN_ONLY', v_actor,
          jsonb_build_object('stage', p_stage, 'score', v_score),
          jsonb_build_object('batch_id', v_batch_id, 'submission_id', v_sub_id,
            'acted_stage', v_acted_stage_key, 'terminal_stage', v_term_stage,
            'reason', 'approved_non_terminal_no_final_change', 'policy', '§88.1.c'));
      END IF;
    END IF;

    IF NOT v_is_relock
       AND v_is_admin AND p_is_override
       AND v_kpi_status IS DISTINCT FROM 'approved'
       AND v_term_stage = v_acted_stage_key THEN
      UPDATE public.kpis SET status = 'approved'::public.review_status WHERE id = v_kpi_id;
      UPDATE public.review_submissions
         SET final_score = v_score, final_rating = v_new_rating, updated_at = now()
       WHERE id = v_sub_id;
      INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, old_value, new_value, metadata)
      VALUES (v_cur.kpi_id, 'ADMIN_BULK_OVERRIDE_FORCE_APPROVE', v_actor,
        jsonb_build_object('status', v_kpi_status, 'final_score', NULL),
        jsonb_build_object('status', 'approved', 'final_score', v_score, 'final_rating', v_new_rating),
        jsonb_build_object('batch_id', v_batch_id, 'submission_id', v_sub_id,
          'acted_stage', v_acted_stage_key, 'terminal_stage', v_term_stage,
          'previous_status', v_kpi_status,
          'batch_reason', v_shared_remark, 'policy', '§88.1.d'));
      v_override_approved_count := v_override_approved_count + 1;
      v_is_force_approve := true;
      v_relock_log := v_relock_log || jsonb_build_object(
        'kpi_id', v_kpi_id, 'employee_id', v_emp_id,
        'old_final', NULL, 'new_final', v_score,
        'period', v_kpi_term_period, 'year', v_kpi_term_year,
        'force_approve', true);
    END IF;

    BEGIN
      INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, new_value, metadata)
      VALUES (v_cur.kpi_id, 'BULK_STAGE_SIGNOFF_' || upper(p_stage), v_actor,
        jsonb_build_object('stage', p_stage, 'score', v_score,
          'inherited_from', v_inherited_from, 'remarks', v_effective_remarks,
          'prev_carried', v_prev_carried, 'achieved_in', v_achieved_in,
          'manual_in', v_manual, 'is_override', p_is_override,
          'is_relock', v_is_relock, 'is_force_approve', v_is_force_approve),
        jsonb_build_object('batch_id', v_batch_id, 'submission_id', v_sub_id,
          'attachment_count', v_cell_attach_count, 'batch_reason', v_shared_remark));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_affected_kpi_ids := v_affected_kpi_ids || v_cur.kpi_id;
    IF NOT v_is_relock AND NOT v_is_force_approve THEN
      v_reconcile_ids := v_reconcile_ids || v_cur.kpi_id;
    END IF;
    v_applied := v_applied + 1;
  END LOOP;

  IF array_length(v_reconcile_ids, 1) > 0 THEN
    BEGIN
      v_reconcile_result := public.reconcile_workflow_statuses(
        p_review_period := NULL, p_review_year := NULL,
        p_dry_run := false, p_performed_by := v_actor,
        p_kpi_ids := v_reconcile_ids);
      v_advanced_count := COALESCE((v_reconcile_result->>'count')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_advanced_count := -1;
    END;
  END IF;

  IF array_length(v_reconcile_ids, 1) > 0 THEN
    FOR v_nt_row IN
      SELECT k.id AS kpi_id, rs.id AS submission_id,
             (SELECT s FROM jsonb_array_elements_text(wf.stages) WITH ORDINALITY AS t(s, ord)
               WHERE s <> 'approved' ORDER BY ord DESC LIMIT 1) AS terminal_stage,
             k.status::text AS final_status
        FROM unnest(v_reconcile_ids) AS akpi(id)
        JOIN public.kpis k ON k.id = akpi.id
        JOIN public.review_submissions rs ON rs.kpi_id = k.id
        CROSS JOIN LATERAL get_employee_workflow_info(k.employee_id, k.review_period, k.review_year) wf
    LOOP
      IF v_nt_row.final_status <> 'approved'
         AND v_nt_row.terminal_stage IS NOT NULL
         AND v_nt_row.terminal_stage <> v_acted_stage_key THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_nt_row.submission_id,
          'reason', 'not_terminal_for_template',
          'terminal_stage', v_nt_row.terminal_stage,
          'acted_stage', v_acted_stage_key);
        v_non_terminal_count := v_non_terminal_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_relocked_count > 0 OR v_override_approved_count > 0 THEN
    FOR v_relock_entry IN SELECT * FROM jsonb_array_elements(v_relock_log)
    LOOP
      DECLARE
        v_rl_kpi   uuid := (v_relock_entry->>'kpi_id')::uuid;
        v_rl_emp   uuid := (v_relock_entry->>'employee_id')::uuid;
        v_rl_old   text := v_relock_entry->>'old_final';
        v_rl_new   numeric := (v_relock_entry->>'new_final')::numeric;
        v_rl_per   text    := v_relock_entry->>'period';
        v_rl_yr    text    := v_relock_entry->>'year';
        v_rl_force boolean := COALESCE((v_relock_entry->>'force_approve')::boolean, false);
        v_rl_mgr   uuid;
        v_kpi_label text;
      BEGIN
        SELECT reporting_manager_id INTO v_rl_mgr FROM public.profiles WHERE id = v_rl_emp;
        SELECT kpi_name INTO v_kpi_label FROM public.kpis WHERE id = v_rl_kpi;
        BEGIN
          INSERT INTO public.notifications (user_id, type, title, message, metadata)
          SELECT DISTINCT u.uid,
                 CASE WHEN v_rl_force THEN 'admin_override_force_approve' ELSE 'admin_override_of_final_score' END,
                 CASE WHEN v_rl_force THEN 'KPI approved by admin override' ELSE 'Final score updated by admin override' END,
                 CASE WHEN v_rl_force
                   THEN format('%s for %s %s: approved by admin override at final score %s.',
                          COALESCE(v_kpi_label,'KPI'), COALESCE(v_rl_per,''), COALESCE(v_rl_yr,''), v_rl_new::text)
                   ELSE format('%s for %s %s: final score re-stamped from %s to %s.',
                          COALESCE(v_kpi_label,'KPI'), COALESCE(v_rl_per,''), COALESCE(v_rl_yr,''),
                          COALESCE(v_rl_old,'(none)'), v_rl_new::text)
                 END,
                 jsonb_build_object('kpi_id', v_rl_kpi, 'old_final', v_rl_old, 'new_final', v_rl_new,
                   'batch_id', v_batch_id, 'performed_by', v_actor,
                   'force_approve', v_rl_force, 'policy', '§88.1')
            FROM (
              SELECT v_rl_emp AS uid
              UNION SELECT v_rl_mgr WHERE v_rl_mgr IS NOT NULL
              UNION SELECT ur.user_id FROM public.user_roles ur
                JOIN public.profiles p ON p.id = ur.user_id
               WHERE ur.role = 'hr_pms' AND COALESCE(p.is_active, true) = true
            ) AS u
           WHERE u.uid IS NOT NULL;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END;
    END LOOP;
  END IF;

  INSERT INTO public.bulk_review_batches(id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason)
  VALUES (v_batch_id, v_actor, p_stage,
    jsonb_build_object(
      'affected_kpi_ids', to_jsonb(v_affected_kpi_ids),
      'reconcile_advanced_count', v_advanced_count,
      'attachment_count', v_attach_count, 'attachment_urls', v_attach,
      'is_override', p_is_override,
      'manual_count', v_manual_count, 'achieved_count', v_achieved_count,
      'na_count', v_na_count,
      'non_terminal_count', v_non_terminal_count,
      'relocked_count', v_relocked_count,
      'relocked_non_terminal_count', v_relocked_non_terminal_count,
      'override_approved_count', v_override_approved_count,
      'acted_stage_key', v_acted_stage_key),
    v_applied, v_skipped, p_batch_reason);

  IF p_stage = 'auditor' AND v_hr_override_count > 0 THEN
    BEGIN
      SELECT k.review_period, k.review_year INTO v_period, v_year
        FROM public.review_submissions rs JOIN public.kpis k ON k.id = rs.kpi_id
       WHERE rs.group_write_batch_id = v_batch_id LIMIT 1;
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      SELECT DISTINCT ur.user_id, 'auditor_override_of_hr',
             'Auditor overrode HR PMS scores',
             format('Auditor updated %s HR PMS-scored cell(s) in %s %s. Tap to review.',
                    v_hr_override_count, COALESCE(v_period,''), COALESCE(v_year::text,'')),
             jsonb_build_object('batch_id', v_batch_id, 'affected_count', v_hr_override_count,
               'period', v_period, 'year', v_year,
               'deep_link', '/review/bulk-scoring?batch=' || v_batch_id::text)
        FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.role = 'hr_pms' AND COALESCE(p.is_active, true) = true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id, 'applied', v_applied, 'advanced', v_advanced_count,
    'skipped', v_skipped, 'hr_override_count', v_hr_override_count,
    'attachment_count', v_attach_count, 'is_override', p_is_override,
    'na_count', v_na_count,
    'non_terminal_count', v_non_terminal_count,
    'relocked', v_relocked_count,
    'relocked_non_terminal', v_relocked_non_terminal_count,
    'override_approved', v_override_approved_count,
    'acted_stage_key', v_acted_stage_key);
END;
$function$;