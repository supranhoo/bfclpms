CREATE OR REPLACE FUNCTION public.workflow_change_step_back()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_template_id UUID;
  v_new_template_id UUID;
  v_old_stages TEXT[];
  v_new_stages TEXT[];
  v_old_terminal TEXT;
  v_new_terminal TEXT;
  v_first_new_stage TEXT := NULL;
  v_first_new_ord INTEGER := NULL;
  v_step_back_to TEXT := NULL;
  v_kpi RECORD;
  v_employee_ids UUID[];
  v_terminal_month TEXT;
  v_sibling RECORD;
  v_sub RECORD;
  i INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.workflow_template_id = NEW.workflow_template_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_template_id := OLD.workflow_template_id;
  ELSE
    SELECT id INTO v_old_template_id FROM workflow_templates WHERE is_default = true AND is_active = true LIMIT 1;
  END IF;
  v_new_template_id := NEW.workflow_template_id;

  IF v_old_template_id IS NOT NULL THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages::jsonb))
    INTO v_old_stages FROM workflow_templates wt WHERE wt.id = v_old_template_id;
  END IF;
  SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages::jsonb))
  INTO v_new_stages FROM workflow_templates wt WHERE wt.id = v_new_template_id;
  IF v_old_stages IS NULL OR v_new_stages IS NULL THEN RETURN NEW; END IF;

  -- terminal (last actionable stage) of each template
  v_old_terminal := NULL;
  FOR i IN REVERSE array_length(v_old_stages, 1)..1 LOOP
    IF v_old_stages[i] NOT IN ('approved','kra_set') THEN v_old_terminal := v_old_stages[i]; EXIT; END IF;
  END LOOP;
  v_new_terminal := NULL;
  FOR i IN REVERSE array_length(v_new_stages, 1)..1 LOOP
    IF v_new_stages[i] NOT IN ('approved','kra_set') THEN v_new_terminal := v_new_stages[i]; EXIT; END IF;
  END LOOP;
  IF v_old_terminal IS NULL OR v_new_terminal IS NULL THEN RETURN NEW; END IF;

  -- Resolve the affected employees once.
  IF NEW.config_type = 'employee' THEN
    v_employee_ids := ARRAY[NEW.config_value::uuid];
  ELSIF NEW.config_type = 'department' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE department_id = NEW.config_value::uuid) INTO v_employee_ids;
  ELSIF NEW.config_type = 'pms_grade' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE pms_grade = NEW.config_value) INTO v_employee_ids;
  END IF;
  IF v_employee_ids IS NULL OR array_length(v_employee_ids, 1) = 0 THEN RETURN NEW; END IF;

  -- ADR-193 §WF-CHANGE-NO-RATING-LOSS (restore branch):
  -- If a snapshot exists and the new terminal is already satisfied by the
  -- stage the KPI has reached, re-promote instead of forcing a re-review.
  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.status::text AS status
    FROM kpis k
    JOIN review_submissions rs ON rs.kpi_id = k.id
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status <> 'approved'
      AND rs.prior_final_score IS NOT NULL
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    IF canonical_stage_order(v_kpi.status) >= canonical_stage_order(v_new_terminal) THEN
      PERFORM set_config('app.percolation_bypass','true',true);
      UPDATE review_submissions rs
      SET final_score = rs.prior_final_score,
          final_rating = rs.prior_final_rating::rating_level,
          prior_final_score = NULL,
          prior_final_rating = NULL
      WHERE rs.kpi_id = v_kpi.kpi_id;
      UPDATE kpis SET status = 'approved'::review_status WHERE id = v_kpi.kpi_id;

      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
      VALUES (v_kpi.kpi_id, 'WORKFLOW_CHANGE_FINAL_SCORE_RESTORED', auth.uid(),
        jsonb_build_object('status', v_kpi.status),
        jsonb_build_object('status', 'approved'),
        jsonb_build_object('reason','New workflow terminal already satisfied; prior final score restored',
          'old_template_id', v_old_template_id, 'new_template_id', v_new_template_id,
          'new_terminal', v_new_terminal,
          'tool','trg_workflow_change_step_back', 'policy','ADR-193'));
    END IF;
  END LOOP;

  -- Additive diff: find the FIRST genuinely-new stage that sits AFTER the old
  -- terminal. Stages that merely got removed, or new stages that sit before
  -- the work already done, must never cause a step-back.
  FOR i IN 1..array_length(v_new_stages, 1) LOOP
    IF v_new_stages[i] IN ('approved','kra_set') THEN CONTINUE; END IF;
    IF v_new_stages[i] = ANY(v_old_stages) THEN CONTINUE; END IF;
    IF canonical_stage_order(v_new_stages[i]) > canonical_stage_order(v_old_terminal) THEN
      v_first_new_stage := v_new_stages[i];
      v_first_new_ord := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_first_new_stage IS NULL THEN
    -- Nothing new downstream -> no step-back, no score clearing.
    RETURN NEW;
  END IF;

  IF v_first_new_ord > 1 THEN
    v_step_back_to := v_new_stages[v_first_new_ord - 1];
    IF v_step_back_to = 'kra_set' THEN v_step_back_to := 'self_review'; END IF;
  END IF;
  IF v_step_back_to IS NULL THEN RETURN NEW; END IF;

  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year,
           k.frequency, k.frequency_cycle_start, k.kra_name, k.kpi_name
    FROM kpis k
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status = 'approved'
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    IF v_kpi.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
      v_terminal_month := get_cycle_terminal_month(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);
      IF v_kpi.review_period != v_terminal_month THEN CONTINUE; END IF;
    END IF;

    SELECT rs.final_score, rs.final_rating INTO v_sub
    FROM review_submissions rs WHERE rs.kpi_id = v_kpi.kpi_id LIMIT 1;

    UPDATE kpis SET status = v_step_back_to::review_status WHERE id = v_kpi.kpi_id;

    -- Snapshot instead of destroy. Stage scores are never touched.
    -- ADR-311: prior_final_rating is TEXT while final_rating is the
    -- rating_level enum, so the enum MUST be cast before COALESCE.
    UPDATE review_submissions rs
    SET prior_final_score  = COALESCE(rs.prior_final_score, rs.final_score),
        prior_final_rating = COALESCE(rs.prior_final_rating, rs.final_rating::text),
        final_score = NULL,
        final_rating = NULL
    WHERE rs.kpi_id = v_kpi.kpi_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (v_kpi.kpi_id, 'WORKFLOW_CHANGE_STEP_BACK', auth.uid(),
      jsonb_build_object('status', 'approved',
                         'final_score', v_sub.final_score,
                         'final_rating', v_sub.final_rating),
      jsonb_build_object('status', v_step_back_to),
      jsonb_build_object('reason','Workflow template changed: new stage added beyond old terminal reviewer',
        'old_template_id', v_old_template_id, 'new_template_id', v_new_template_id,
        'old_terminal', v_old_terminal, 'first_new_stage', v_first_new_stage,
        'step_back_to', v_step_back_to, 'final_score_snapshotted', true,
        'tool','trg_workflow_change_step_back', 'policy','ADR-193'));

    IF v_kpi.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
      FOR v_sibling IN
        SELECT k.id AS kpi_id
        FROM kpis k
        WHERE k.employee_id = v_kpi.employee_id
          AND k.kra_name = v_kpi.kra_name
          AND k.kpi_name = v_kpi.kpi_name
          AND k.review_year = v_kpi.review_year
          AND k.frequency = v_kpi.frequency
          AND k.review_period = ANY(get_cycle_months(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start))
          AND k.id != v_kpi.kpi_id
          AND k.status = 'approved'
      LOOP
        PERFORM set_config('app.percolation_bypass','true',true);
        UPDATE kpis SET status = v_step_back_to::review_status WHERE id = v_sibling.kpi_id;
        UPDATE review_submissions rs
        SET prior_final_score  = COALESCE(rs.prior_final_score, rs.final_score),
            prior_final_rating = COALESCE(rs.prior_final_rating, rs.final_rating::text),
            final_score = NULL,
            final_rating = NULL
        WHERE rs.kpi_id = v_sibling.kpi_id;
        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (v_sibling.kpi_id, 'WORKFLOW_CHANGE_STEP_BACK_SIBLING', auth.uid(),
          jsonb_build_object('status','approved'),
          jsonb_build_object('status', v_step_back_to),
          jsonb_build_object('reason','Cascaded from terminal step-back',
            'terminal_kpi_id', v_kpi.kpi_id,
            'old_template_id', v_old_template_id, 'new_template_id', v_new_template_id,
            'final_score_snapshotted', true,
            'tool','trg_workflow_change_step_back', 'policy','ADR-193'));
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;