-- ADR-301 — Central Data Approval → Score Propagation (RPCs)

CREATE OR REPLACE FUNCTION public.org_kpi_central_config(
  p_category_id uuid, p_kra_name text, p_kpi_name text
) RETURNS public.org_kpi_central_registry
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.* FROM public.org_kpi_central_registry r
  WHERE r.category_id = p_category_id
    AND public.normalize_kpi_text(r.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(r.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND r.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_effective_chain(
  p_category_id uuid, p_kra_name text, p_kpi_name text, p_as_of date DEFAULT CURRENT_DATE
) RETURNS SETOF public.org_kpi_approval_chains
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH latest AS (
    SELECT max(c.effective_from) AS ef
    FROM public.org_kpi_approval_chains c
    WHERE c.category_id = p_category_id
      AND public.normalize_kpi_text(c.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND public.normalize_kpi_text(c.kpi_name) = public.normalize_kpi_text(p_kpi_name)
      AND c.is_active
      AND c.effective_from <= p_as_of
  )
  SELECT c.* FROM public.org_kpi_approval_chains c, latest
  WHERE c.category_id = p_category_id
    AND public.normalize_kpi_text(c.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(c.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND c.is_active
    AND c.effective_from = latest.ef
  ORDER BY c.step_no;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_can_read_central(
  p_user uuid, p_category_id uuid, p_kra_name text, p_kpi_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_user IS NOT NULL AND (
    public.bu_console_can_read(p_user)
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = p_user
        AND o.category_id = p_category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(p_kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    )
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_effective_chain(p_category_id, p_kra_name, p_kpi_name) c
      WHERE c.approver_id = p_user
         OR (c.approver_role IS NOT NULL AND public.has_role(p_user, c.approver_role))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_chain_list(
  p_category_id uuid, p_kra_name text, p_kpi_name text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_reg public.org_kpi_central_registry;
  v_steps jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.org_kpi_can_read_central(v_user, p_category_id, p_kra_name, p_kpi_name) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  v_reg := public.org_kpi_central_config(p_category_id, p_kra_name, p_kpi_name);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'step_no', c.step_no, 'step_kind', c.step_kind,
           'label', c.label, 'approver_id', c.approver_id,
           'approver_name', p.full_name,
           'approver_role', c.approver_role,
           'effective_from', c.effective_from) ORDER BY c.step_no), '[]'::jsonb)
    INTO v_steps
  FROM public.org_kpi_effective_chain(p_category_id, p_kra_name, p_kpi_name) c
  LEFT JOIN public.profiles p ON p.id = c.approver_id;

  RETURN jsonb_build_object(
    'authorized', true,
    'is_central', v_reg.id IS NOT NULL,
    'propagation_mode', COALESCE(v_reg.propagation_mode, 'central_fed'),
    'cutoff_day', v_reg.cutoff_day,
    'steps', v_steps);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_chain_upsert(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_steps jsonb,
  p_propagation_mode text DEFAULT 'central_fed',
  p_cutoff_day integer DEFAULT NULL,
  p_effective_from date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item jsonb;
  v_n int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  IF COALESCE(p_propagation_mode, 'central_fed') NOT IN ('central_fed','central_approved') THEN
    RAISE EXCEPTION 'Unsupported propagation mode: %', p_propagation_mode;
  END IF;

  INSERT INTO public.org_kpi_central_registry
    (category_id, kra_name, kpi_name, propagation_mode, cutoff_day, is_active, created_by)
  VALUES (p_category_id, p_kra_name, p_kpi_name,
          COALESCE(p_propagation_mode,'central_fed'), p_cutoff_day, true, v_user)
  ON CONFLICT (category_id, public.normalize_kpi_text(kra_name), public.normalize_kpi_text(kpi_name))
  DO UPDATE SET propagation_mode = EXCLUDED.propagation_mode,
                cutoff_day = EXCLUDED.cutoff_day,
                is_active = true,
                updated_at = now();

  DELETE FROM public.org_kpi_approval_chains c
  WHERE c.category_id = p_category_id
    AND public.normalize_kpi_text(c.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(c.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND c.effective_from = p_effective_from;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_steps, '[]'::jsonb))
  LOOP
    v_n := v_n + 1;
    INSERT INTO public.org_kpi_approval_chains
      (category_id, kra_name, kpi_name, effective_from, step_no, step_kind,
       approver_id, approver_role, label, created_by)
    VALUES (
      p_category_id, p_kra_name, p_kpi_name, p_effective_from,
      COALESCE((v_item->>'step_no')::int, v_n),
      COALESCE(v_item->>'step_kind', CASE WHEN v_n = 1 THEN 'provider' ELSE 'approver' END),
      NULLIF(v_item->>'approver_id','')::uuid,
      NULLIF(v_item->>'approver_role','')::public.app_role,
      COALESCE(NULLIF(btrim(v_item->>'label'),''), 'Step ' || v_n)
    );
  END LOOP;

  RETURN jsonb_build_object('authorized', true, 'steps_saved', v_n,
                            'effective_from', p_effective_from,
                            'propagation_mode', COALESCE(p_propagation_mode,'central_fed'));
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_step_actor_matches(
  p_user uuid, p_step public.org_kpi_approval_chains
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_user IS NOT NULL AND (
    (p_step.approver_id IS NOT NULL AND p_step.approver_id = p_user)
    OR (p_step.approver_role IS NOT NULL AND public.has_role(p_user, p_step.approver_role))
  );
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_submit_value(
  p_okv_id uuid,
  p_achieved_value numeric DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_evidence_urls jsonb DEFAULT NULL,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.org_kpi_values;
  v_reg public.org_kpi_central_registry;
  v_is_admin boolean;
  v_is_owner boolean;
  v_first_step int;
  v_value numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.org_kpi_values WHERE id = p_okv_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'value_not_found');
  END IF;

  v_reg := public.org_kpi_central_config(v_row.category_id, v_row.kra_name, v_row.kpi_name);
  IF v_reg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_central_kpi');
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::public.app_role);
  SELECT EXISTS (
    SELECT 1 FROM public.org_kpi_data_owners o
    WHERE o.owner_id = v_user
      AND o.category_id = v_row.category_id
      AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(v_row.kra_name)
      AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(v_row.kpi_name)
  ) INTO v_is_owner;

  IF NOT (v_is_admin OR v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_data_provider');
  END IF;

  IF COALESCE(v_row.workflow_stage, 'draft') IN ('in_approval','approved','propagated')
     AND NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_submitted',
                              'workflow_stage', v_row.workflow_stage);
  END IF;

  v_value := COALESCE(p_achieved_value, v_row.achieved_value);
  IF v_value IS NULL AND NOT COALESCE(v_row.is_na, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_value');
  END IF;

  SELECT min(c.step_no) INTO v_first_step
  FROM public.org_kpi_effective_chain(v_row.category_id, v_row.kra_name, v_row.kpi_name) c
  WHERE c.step_kind = 'approver';

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'okv_id', p_okv_id,
      'achieved_value', v_value, 'next_step', v_first_step,
      'propagation_mode', v_reg.propagation_mode,
      'has_chain', v_first_step IS NOT NULL);
  END IF;

  UPDATE public.org_kpi_values
     SET achieved_value = v_value,
         remarks = COALESCE(p_remarks, remarks),
         evidence_urls = COALESCE(p_evidence_urls, evidence_urls),
         entered_by = COALESCE(entered_by, v_user),
         workflow_stage = CASE WHEN v_first_step IS NULL THEN 'approved' ELSE 'in_approval' END,
         current_step = v_first_step,
         submitted_at = now(),
         propagation_mode = v_reg.propagation_mode,
         status = CASE WHEN v_first_step IS NULL THEN 'approved' ELSE 'entered' END,
         submission_count = COALESCE(submission_count, 0) + 1,
         updated_at = now()
   WHERE id = p_okv_id;

  INSERT INTO public.org_kpi_approvals
    (okv_id, step_no, step_label, decision, actor_id, comment, achieved_value_at_decision)
  VALUES (p_okv_id, 0, 'Data provider', 'submitted', v_user, p_remarks, v_value);

  IF v_first_step IS NULL THEN
    RETURN public.org_kpi_finalise(p_okv_id, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'okv_id', p_okv_id,
    'workflow_stage', 'in_approval', 'current_step', v_first_step);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_decide(
  p_okv_id uuid,
  p_decision text,
  p_comment text DEFAULT NULL,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.org_kpi_values;
  v_step public.org_kpi_approval_chains;
  v_next int;
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_decision NOT IN ('approved','sent_back') THEN
    RAISE EXCEPTION 'Unsupported decision: %', p_decision;
  END IF;

  SELECT * INTO v_row FROM public.org_kpi_values WHERE id = p_okv_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'value_not_found');
  END IF;
  IF COALESCE(v_row.workflow_stage,'draft') <> 'in_approval' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_in_approval',
                              'workflow_stage', v_row.workflow_stage);
  END IF;

  SELECT * INTO v_step
  FROM public.org_kpi_effective_chain(v_row.category_id, v_row.kra_name, v_row.kpi_name) c
  WHERE c.step_no = v_row.current_step;

  IF v_step.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'step_not_found');
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::public.app_role);
  IF NOT (v_is_admin OR public.org_kpi_step_actor_matches(v_user, v_step)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_current_approver',
                              'current_step', v_row.current_step,
                              'step_label', v_step.label);
  END IF;

  IF p_decision = 'sent_back' AND COALESCE(btrim(p_comment), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reason_required');
  END IF;

  SELECT min(c.step_no) INTO v_next
  FROM public.org_kpi_effective_chain(v_row.category_id, v_row.kra_name, v_row.kpi_name) c
  WHERE c.step_kind = 'approver' AND c.step_no > v_row.current_step;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'decision', p_decision,
      'step_label', v_step.label, 'next_step', v_next,
      'will_finalise', (p_decision = 'approved' AND v_next IS NULL));
  END IF;

  INSERT INTO public.org_kpi_approvals
    (okv_id, step_no, step_label, decision, actor_id, comment, achieved_value_at_decision)
  VALUES (p_okv_id, v_step.step_no, v_step.label, p_decision, v_user, p_comment, v_row.achieved_value);

  IF p_decision = 'sent_back' THEN
    -- Send-back always returns to the data provider (single, predictable owner
    -- of the number); the trail records which step rejected it.
    UPDATE public.org_kpi_values
       SET workflow_stage = 'sent_back', current_step = NULL,
           status = 'pending',
           sent_back_by = v_user, sent_back_at = now(), sent_back_reason = p_comment,
           updated_at = now()
     WHERE id = p_okv_id;
    RETURN jsonb_build_object('ok', true, 'dry_run', false, 'decision', 'sent_back',
                              'workflow_stage', 'sent_back');
  END IF;

  IF v_next IS NOT NULL THEN
    UPDATE public.org_kpi_values
       SET current_step = v_next, updated_at = now()
     WHERE id = p_okv_id;
    RETURN jsonb_build_object('ok', true, 'dry_run', false, 'decision', 'approved',
                              'current_step', v_next, 'workflow_stage', 'in_approval');
  END IF;

  UPDATE public.org_kpi_values
     SET workflow_stage = 'approved', current_step = NULL,
         status = 'approved', updated_at = now()
   WHERE id = p_okv_id;

  RETURN public.org_kpi_finalise(p_okv_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_finalise(
  p_okv_id uuid, p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.org_kpi_values;
  v_reg public.org_kpi_central_registry;
  v_mode text;
  v_rec record;
  v_kpi public.kpis;
  v_score numeric;
  v_rating text;
  v_stages text[];
  v_idx int;
  v_reason text;
  v_applied int := 0;
  v_skipped int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_preview jsonb := '[]'::jsonb;
  v_skipped_details jsonb := '[]'::jsonb;
  v_limit int := 500;
  v_skip_summary jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.org_kpi_values WHERE id = p_okv_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'value_not_found');
  END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR (COALESCE(v_row.workflow_stage,'draft') = 'approved'
        AND public.org_kpi_can_read_central(v_user, v_row.category_id, v_row.kra_name, v_row.kpi_name))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  v_reg := public.org_kpi_central_config(v_row.category_id, v_row.kra_name, v_row.kpi_name);
  v_mode := COALESCE(v_row.propagation_mode, v_reg.propagation_mode, 'central_fed');

  FOR v_rec IN
    SELECT k.id AS kpi_id, k.employee_id, k.status::text AS status,
           k.review_period, k.review_year,
           p.full_name, p.employee_code, d.name AS department_name,
           rs.id AS submission_id, rs.final_score, rs.is_na
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.is_org_level = true
      AND k.category_id = v_row.category_id
      AND k.review_period = v_row.review_period
      AND k.review_year = v_row.review_year
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_row.kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_row.kpi_name)
      AND (v_row.department_id IS NULL OR p.department_id = v_row.department_id)
      AND (v_row.employee_id IS NULL OR k.employee_id = v_row.employee_id)
    ORDER BY p.full_name
  LOOP
    v_reason := NULL;
    v_score := NULL;
    SELECT * INTO v_kpi FROM public.kpis WHERE id = v_rec.kpi_id;

    IF v_rec.submission_id IS NULL THEN
      v_reason := 'no_submission';
    ELSIF v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    ELSE
      -- Per-employee bands: same value, each employee's own R5..R0 row.
      v_score := public.fn_compute_rating_from_achievement(v_kpi, v_row.achieved_value, NULL);
      IF v_score IS NULL AND NOT COALESCE(v_row.is_na, false) THEN
        v_reason := 'not_scoreable';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skipped <= v_limit THEN
        v_skipped_details := v_skipped_details || jsonb_build_object(
          'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name,
          'current_status', v_rec.status, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    v_rating := CASE
      WHEN v_score >= 4.5 THEN 'blue'
      WHEN v_score >= 3.5 THEN 'green'
      WHEN v_score >= 2.5 THEN 'yellow'
      ELSE 'red' END;

    v_applied := v_applied + 1;
    IF v_applied <= v_limit THEN
      v_preview := v_preview || jsonb_build_object(
        'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name,
        'current_status', v_rec.status,
        'achieved_value', v_row.achieved_value,
        'new_score', v_score, 'new_rating', v_rating);
    END IF;

    IF p_dry_run THEN CONTINUE; END IF;

    -- Frozen snapshot (POLICY §88): the value is copied, never linked.
    UPDATE public.review_submissions rs
       SET achieved_value = v_row.achieved_value,
           self_achieved_value = v_row.achieved_value,
           self_score = v_score,
           self_rating = v_rating::public.rating_level,
           self_remarks = COALESCE(rs.self_remarks, v_row.remarks),
           self_evidence_urls = CASE
             WHEN rs.self_evidence_urls IS NULL OR jsonb_array_length(rs.self_evidence_urls) = 0
               THEN v_row.evidence_urls ELSE rs.self_evidence_urls END,
           updated_at = now()
     WHERE rs.id = v_rec.submission_id;

    IF v_mode = 'central_approved' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(public.get_employee_workflow(
               v_rec.employee_id, v_rec.review_period, v_rec.review_year)))
        INTO v_stages;

      IF v_stages IS NOT NULL AND array_length(v_stages, 1) IS NOT NULL THEN
        UPDATE public.review_submissions rs
           SET manager_score = CASE WHEN 'manager_check' = ANY(v_stages) AND rs.manager_score IS NULL
                                    THEN v_score ELSE rs.manager_score END,
               manager_rating = CASE WHEN 'manager_check' = ANY(v_stages) AND rs.manager_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.manager_rating END,
               functional_manager_score = CASE WHEN 'functional_manager_check' = ANY(v_stages) AND rs.functional_manager_score IS NULL
                                    THEN v_score ELSE rs.functional_manager_score END,
               functional_manager_rating = CASE WHEN 'functional_manager_check' = ANY(v_stages) AND rs.functional_manager_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.functional_manager_rating END,
               skip_level_score = CASE WHEN 'skip_level_check' = ANY(v_stages) AND rs.skip_level_score IS NULL
                                    THEN v_score ELSE rs.skip_level_score END,
               skip_level_rating = CASE WHEN 'skip_level_check' = ANY(v_stages) AND rs.skip_level_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.skip_level_rating END,
               auditor_score = CASE WHEN 'audit' = ANY(v_stages) AND rs.auditor_score IS NULL
                                    THEN v_score ELSE rs.auditor_score END,
               auditor_rating = CASE WHEN 'audit' = ANY(v_stages) AND rs.auditor_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.auditor_rating END,
               hr_pms_score = CASE WHEN 'hr_pms_review' = ANY(v_stages) AND rs.hr_pms_score IS NULL
                                    THEN v_score ELSE rs.hr_pms_score END,
               hr_pms_rating = CASE WHEN 'hr_pms_review' = ANY(v_stages) AND rs.hr_pms_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.hr_pms_rating END,
               management_score = CASE WHEN 'management_review' = ANY(v_stages) AND rs.management_score IS NULL
                                    THEN v_score ELSE rs.management_score END,
               management_rating = CASE WHEN 'management_review' = ANY(v_stages) AND rs.management_score IS NULL
                                    THEN v_rating::public.rating_level ELSE rs.management_rating END,
               updated_at = now()
         WHERE rs.id = v_rec.submission_id;

        v_idx := array_length(v_stages, 1);
        WHILE v_idx > 0 AND v_stages[v_idx] = 'approved' LOOP
          v_idx := v_idx - 1;
        END LOOP;
        IF v_idx > 0 THEN
          UPDATE public.kpis SET status = v_stages[v_idx]::public.review_status, updated_at = now()
           WHERE id = v_rec.kpi_id AND status::text <> 'approved';
        END IF;
      END IF;
    ELSE
      UPDATE public.kpis SET status = 'self_review'::public.review_status, updated_at = now()
       WHERE id = v_rec.kpi_id AND status::text = 'kra_set';
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'okv_id', p_okv_id,
      'propagation_mode', v_mode, 'will_apply', v_applied, 'will_skip', v_skipped,
      'detail_truncated', (v_applied > v_limit OR v_skipped > v_limit),
      'skip_summary', v_skip_summary, 'preview', v_preview,
      'skipped_details', v_skipped_details);
  END IF;

  UPDATE public.org_kpi_values
     SET workflow_stage = 'propagated', status = 'propagated', updated_at = now()
   WHERE id = p_okv_id;

  INSERT INTO public.org_kpi_approvals
    (okv_id, step_no, step_label, decision, actor_id, comment, achieved_value_at_decision)
  VALUES (p_okv_id, 999,
          CASE WHEN v_mode = 'central_approved' THEN 'Propagated (stages closed)'
               ELSE 'Propagated (value only)' END,
          CASE WHEN v_mode = 'central_approved' THEN 'auto_closed' ELSE 'finalised' END,
          v_user,
          format('applied=%s skipped=%s', v_applied, v_skipped),
          v_row.achieved_value);

  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'okv_id', p_okv_id,
    'propagation_mode', v_mode, 'applied', v_applied, 'skipped', v_skipped,
    'skip_summary', v_skip_summary, 'preview', v_preview,
    'skipped_details', v_skipped_details);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_kpi_central_config(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_effective_chain(uuid, text, text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_can_read_central(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_step_actor_matches(uuid, public.org_kpi_approval_chains) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_chain_list(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_chain_upsert(uuid, text, text, jsonb, text, integer, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_submit_value(uuid, numeric, text, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_decide(uuid, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_finalise(uuid, boolean) FROM anon;