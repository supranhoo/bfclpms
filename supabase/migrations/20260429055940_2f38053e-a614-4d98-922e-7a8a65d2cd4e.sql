-- =========================================================================
-- 1. REWRITE percolate_multimonth_score TRIGGER (with bypass set)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_months TEXT[];
  v_months_canonical TEXT[] := ARRAY['January','February','March','April','May','June',
                                     'July','August','September','October','November','December'];
  v_terminal_month TEXT;
  v_max_idx INTEGER := 0;
  v_idx INTEGER;
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_performer UUID;
BEGIN
  IF NEW.status != 'approved' OR (OLD.status IS NOT DISTINCT FROM 'approved') THEN
    RETURN NEW;
  END IF;

  IF NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  v_performer := auth.uid();

  v_cycle_months := get_cycle_months(NEW.frequency, NEW.review_period, NEW.review_year, NEW.frequency_cycle_start);

  IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
    RETURN NEW;
  END IF;

  -- Determine chronological terminal month
  IF 'December' = ANY(v_cycle_months) AND 'January' = ANY(v_cycle_months) THEN
    v_terminal_month := v_cycle_months[array_length(v_cycle_months, 1)];
  ELSE
    v_max_idx := 0;
    FOREACH v_terminal_month IN ARRAY v_cycle_months LOOP
      v_idx := array_position(v_months_canonical, v_terminal_month);
      IF v_idx > v_max_idx THEN
        v_max_idx := v_idx;
      END IF;
    END LOOP;
    v_terminal_month := v_months_canonical[v_max_idx];
  END IF;

  IF NEW.review_period != v_terminal_month THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_terminal_submission
  FROM review_submissions WHERE kpi_id = NEW.id
  ORDER BY submitted_at DESC NULLS LAST LIMIT 1;

  IF v_terminal_submission IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bypass the frequency-lock trigger for our legitimate sibling writes
  PERFORM set_config('app.percolation_bypass', 'true', true);

  FOR v_sibling IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.review_period
    FROM kpis k
    WHERE k.employee_id = NEW.employee_id
      AND k.kra_name    = NEW.kra_name
      AND k.kpi_name    = NEW.kpi_name
      AND k.review_year = NEW.review_year
      AND k.frequency   = NEW.frequency
      AND k.review_period != NEW.review_period
      AND k.review_period = ANY(v_cycle_months)
      AND k.id != NEW.id
  LOOP
    UPDATE kpis SET status = 'approved' WHERE id = v_sibling.kpi_id;

    INSERT INTO review_submissions (
      kpi_id,
      self_score, self_rating, manager_score, manager_rating,
      skip_level_score, skip_level_rating, hr_pms_score, hr_pms_rating,
      auditor_score, auditor_rating, management_score, management_rating,
      final_score, final_rating, achieved_value, is_na, submitted_at,
      self_remarks, manager_remarks, skip_level_remarks,
      hr_pms_remarks, auditor_remarks, management_remarks,
      auto_advance_reason,
      self_evidence_urls, manager_evidence_urls, skip_level_evidence_urls,
      hr_pms_evidence_urls, auditor_evidence_urls, management_evidence_urls,
      manager_achieved_value, auditor_achieved_value, management_achieved_value,
      skip_level_achieved_value, hr_pms_achieved_value
    ) VALUES (
      v_sibling.kpi_id,
      v_terminal_submission.self_score, v_terminal_submission.self_rating,
      v_terminal_submission.manager_score, v_terminal_submission.manager_rating,
      v_terminal_submission.skip_level_score, v_terminal_submission.skip_level_rating,
      v_terminal_submission.hr_pms_score, v_terminal_submission.hr_pms_rating,
      v_terminal_submission.auditor_score, v_terminal_submission.auditor_rating,
      v_terminal_submission.management_score, v_terminal_submission.management_rating,
      v_terminal_submission.final_score, v_terminal_submission.final_rating,
      v_terminal_submission.achieved_value, v_terminal_submission.is_na, now(),
      v_terminal_submission.self_remarks, v_terminal_submission.manager_remarks,
      v_terminal_submission.skip_level_remarks,
      v_terminal_submission.hr_pms_remarks, v_terminal_submission.auditor_remarks,
      v_terminal_submission.management_remarks,
      'Multi-month sibling — auto-populated from terminal month ' || NEW.review_period || ' ' || NEW.review_year,
      v_terminal_submission.self_evidence_urls, v_terminal_submission.manager_evidence_urls,
      v_terminal_submission.skip_level_evidence_urls,
      v_terminal_submission.hr_pms_evidence_urls, v_terminal_submission.auditor_evidence_urls,
      v_terminal_submission.management_evidence_urls,
      v_terminal_submission.manager_achieved_value, v_terminal_submission.auditor_achieved_value,
      v_terminal_submission.management_achieved_value,
      v_terminal_submission.skip_level_achieved_value, v_terminal_submission.hr_pms_achieved_value
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      self_score = EXCLUDED.self_score, self_rating = EXCLUDED.self_rating,
      manager_score = EXCLUDED.manager_score, manager_rating = EXCLUDED.manager_rating,
      skip_level_score = EXCLUDED.skip_level_score, skip_level_rating = EXCLUDED.skip_level_rating,
      hr_pms_score = EXCLUDED.hr_pms_score, hr_pms_rating = EXCLUDED.hr_pms_rating,
      auditor_score = EXCLUDED.auditor_score, auditor_rating = EXCLUDED.auditor_rating,
      management_score = EXCLUDED.management_score, management_rating = EXCLUDED.management_rating,
      final_score = EXCLUDED.final_score, final_rating = EXCLUDED.final_rating,
      achieved_value = EXCLUDED.achieved_value, is_na = EXCLUDED.is_na,
      submitted_at = EXCLUDED.submitted_at,
      self_remarks = EXCLUDED.self_remarks, manager_remarks = EXCLUDED.manager_remarks,
      skip_level_remarks = EXCLUDED.skip_level_remarks,
      hr_pms_remarks = EXCLUDED.hr_pms_remarks, auditor_remarks = EXCLUDED.auditor_remarks,
      management_remarks = EXCLUDED.management_remarks,
      auto_advance_reason = EXCLUDED.auto_advance_reason,
      self_evidence_urls = EXCLUDED.self_evidence_urls, manager_evidence_urls = EXCLUDED.manager_evidence_urls,
      skip_level_evidence_urls = EXCLUDED.skip_level_evidence_urls,
      hr_pms_evidence_urls = EXCLUDED.hr_pms_evidence_urls, auditor_evidence_urls = EXCLUDED.auditor_evidence_urls,
      management_evidence_urls = EXCLUDED.management_evidence_urls,
      manager_achieved_value = EXCLUDED.manager_achieved_value, auditor_achieved_value = EXCLUDED.auditor_achieved_value,
      management_achieved_value = EXCLUDED.management_achieved_value,
      skip_level_achieved_value = EXCLUDED.skip_level_achieved_value, hr_pms_achieved_value = EXCLUDED.hr_pms_achieved_value;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_sibling.kpi_id, 'SCORE_PERCOLATED', v_performer,
      jsonb_build_object('status', v_sibling.kpi_status),
      jsonb_build_object('status', 'approved', 'final_score', v_terminal_submission.final_score),
      jsonb_build_object(
        'source_kpi_id', NEW.id,
        'source_period', NEW.review_period,
        'frequency', NEW.frequency,
        'tool', 'percolate_multimonth_score',
        'forced', true,
        'policy', 'POLICY_54_v3'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 2. EXEMPT MULTI-MONTH SIBLINGS FROM workflow_change_step_back
-- =========================================================================
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
  v_canonical TEXT[] := ARRAY['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review'];
  v_old_canonical_pos INTEGER;
  v_new_has_beyond BOOLEAN := false;
  v_step_back_to TEXT;
  v_affected_count INTEGER := 0;
  v_kpi RECORD;
  v_employee_ids UUID[];
  v_cycle_months TEXT[];
  v_months_canonical TEXT[] := ARRAY['January','February','March','April','May','June',
                                     'July','August','September','October','November','December'];
  v_terminal_month TEXT;
  v_max_idx INTEGER;
  v_idx INTEGER;
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
    INTO v_old_stages
    FROM workflow_templates wt WHERE wt.id = v_old_template_id;
  END IF;

  SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages::jsonb))
  INTO v_new_stages
  FROM workflow_templates wt WHERE wt.id = v_new_template_id;

  IF v_old_stages IS NULL OR v_new_stages IS NULL THEN
    RETURN NEW;
  END IF;

  v_old_terminal := NULL;
  FOR i IN REVERSE array_length(v_old_stages, 1)..1 LOOP
    IF v_old_stages[i] != 'approved' AND v_old_stages[i] != 'kra_set' THEN
      v_old_terminal := v_old_stages[i];
      EXIT;
    END IF;
  END LOOP;

  IF v_old_terminal IS NULL THEN RETURN NEW; END IF;

  v_old_canonical_pos := 0;
  FOR i IN 1..array_length(v_canonical, 1) LOOP
    IF v_canonical[i] = v_old_terminal THEN
      v_old_canonical_pos := i;
      EXIT;
    END IF;
  END LOOP;

  v_step_back_to := NULL;
  FOR i IN 1..array_length(v_new_stages, 1) LOOP
    IF v_new_stages[i] = 'approved' OR v_new_stages[i] = 'kra_set' THEN CONTINUE; END IF;
    FOR j IN 1..array_length(v_canonical, 1) LOOP
      IF v_canonical[j] = v_new_stages[i] AND j > v_old_canonical_pos THEN
        IF i > 1 THEN
          v_step_back_to := v_new_stages[i - 1];
          IF v_step_back_to = 'kra_set' THEN
            v_step_back_to := 'self_review';
          END IF;
        END IF;
        v_new_has_beyond := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_new_has_beyond THEN EXIT; END IF;
  END LOOP;

  IF NOT v_new_has_beyond OR v_step_back_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.config_type = 'employee' THEN
    v_employee_ids := ARRAY[NEW.config_value::uuid];
  ELSIF NEW.config_type = 'department' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE department_id = NEW.config_value::uuid)
    INTO v_employee_ids;
  ELSIF NEW.config_type = 'pms_grade' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE pms_grade = NEW.config_value)
    INTO v_employee_ids;
  END IF;

  IF v_employee_ids IS NULL OR array_length(v_employee_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year,
           k.frequency, k.frequency_cycle_start,
           p.full_name, p.employee_code
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status = 'approved'
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    -- POLICY §54 v3: skip non-terminal multi-month siblings
    IF v_kpi.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
      v_cycle_months := get_cycle_months(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);
      IF array_length(v_cycle_months, 1) > 1 THEN
        IF 'December' = ANY(v_cycle_months) AND 'January' = ANY(v_cycle_months) THEN
          v_terminal_month := v_cycle_months[array_length(v_cycle_months, 1)];
        ELSE
          v_max_idx := 0;
          FOREACH v_terminal_month IN ARRAY v_cycle_months LOOP
            v_idx := array_position(v_months_canonical, v_terminal_month);
            IF v_idx > v_max_idx THEN v_max_idx := v_idx; END IF;
          END LOOP;
          v_terminal_month := v_months_canonical[v_max_idx];
        END IF;
        IF v_kpi.review_period != v_terminal_month THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    UPDATE kpis SET status = v_step_back_to::review_status WHERE id = v_kpi.kpi_id;

    UPDATE review_submissions
    SET final_score = NULL, final_rating = NULL
    WHERE kpi_id = v_kpi.kpi_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_kpi.kpi_id,
      'WORKFLOW_CHANGE_STEP_BACK',
      auth.uid(),
      jsonb_build_object('status', 'approved'),
      jsonb_build_object('status', v_step_back_to),
      jsonb_build_object(
        'reason', 'Workflow template changed: new stages added beyond old terminal reviewer',
        'old_template_id', v_old_template_id,
        'new_template_id', v_new_template_id,
        'old_terminal', v_old_terminal,
        'step_back_to', v_step_back_to,
        'tool', 'trg_workflow_change_step_back'
      )
    );

    v_affected_count := v_affected_count + 1;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 3. ONE-SHOT BACKFILL (with bypass)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.backfill_multimonth_percolation()
RETURNS TABLE(processed_count INTEGER, sibling_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_terminal RECORD;
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_cycle_months TEXT[];
  v_months_canonical TEXT[] := ARRAY['January','February','March','April','May','June',
                                     'July','August','September','October','November','December'];
  v_terminal_month TEXT;
  v_max_idx INTEGER;
  v_idx INTEGER;
  v_processed INTEGER := 0;
  v_siblings INTEGER := 0;
BEGIN
  PERFORM set_config('app.percolation_bypass', 'true', true);

  FOR v_terminal IN
    SELECT k.id, k.employee_id, k.kra_name, k.kpi_name,
           k.review_period, k.review_year, k.frequency, k.frequency_cycle_start
    FROM kpis k
    WHERE k.status = 'approved'
      AND k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
  LOOP
    v_cycle_months := get_cycle_months(v_terminal.frequency, v_terminal.review_period, v_terminal.review_year, v_terminal.frequency_cycle_start);
    IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
      CONTINUE;
    END IF;

    IF 'December' = ANY(v_cycle_months) AND 'January' = ANY(v_cycle_months) THEN
      v_terminal_month := v_cycle_months[array_length(v_cycle_months, 1)];
    ELSE
      v_max_idx := 0;
      FOREACH v_terminal_month IN ARRAY v_cycle_months LOOP
        v_idx := array_position(v_months_canonical, v_terminal_month);
        IF v_idx > v_max_idx THEN v_max_idx := v_idx; END IF;
      END LOOP;
      v_terminal_month := v_months_canonical[v_max_idx];
    END IF;

    IF v_terminal.review_period != v_terminal_month THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_terminal_submission
    FROM review_submissions WHERE kpi_id = v_terminal.id
    ORDER BY submitted_at DESC NULLS LAST LIMIT 1;

    IF v_terminal_submission IS NULL THEN
      CONTINUE;
    END IF;

    v_processed := v_processed + 1;

    FOR v_sibling IN
      SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.review_period
      FROM kpis k
      WHERE k.employee_id = v_terminal.employee_id
        AND k.kra_name    = v_terminal.kra_name
        AND k.kpi_name    = v_terminal.kpi_name
        AND k.review_year = v_terminal.review_year
        AND k.frequency   = v_terminal.frequency
        AND k.review_period != v_terminal.review_period
        AND k.review_period = ANY(v_cycle_months)
        AND k.status != 'approved'
    LOOP
      UPDATE kpis SET status = 'approved' WHERE id = v_sibling.kpi_id;

      INSERT INTO review_submissions (
        kpi_id,
        self_score, self_rating, manager_score, manager_rating,
        skip_level_score, skip_level_rating, hr_pms_score, hr_pms_rating,
        auditor_score, auditor_rating, management_score, management_rating,
        final_score, final_rating, achieved_value, is_na, submitted_at,
        self_remarks, manager_remarks, skip_level_remarks,
        hr_pms_remarks, auditor_remarks, management_remarks,
        auto_advance_reason,
        self_evidence_urls, manager_evidence_urls, skip_level_evidence_urls,
        hr_pms_evidence_urls, auditor_evidence_urls, management_evidence_urls,
        manager_achieved_value, auditor_achieved_value, management_achieved_value,
        skip_level_achieved_value, hr_pms_achieved_value
      ) VALUES (
        v_sibling.kpi_id,
        v_terminal_submission.self_score, v_terminal_submission.self_rating,
        v_terminal_submission.manager_score, v_terminal_submission.manager_rating,
        v_terminal_submission.skip_level_score, v_terminal_submission.skip_level_rating,
        v_terminal_submission.hr_pms_score, v_terminal_submission.hr_pms_rating,
        v_terminal_submission.auditor_score, v_terminal_submission.auditor_rating,
        v_terminal_submission.management_score, v_terminal_submission.management_rating,
        v_terminal_submission.final_score, v_terminal_submission.final_rating,
        v_terminal_submission.achieved_value, v_terminal_submission.is_na, now(),
        v_terminal_submission.self_remarks, v_terminal_submission.manager_remarks,
        v_terminal_submission.skip_level_remarks,
        v_terminal_submission.hr_pms_remarks, v_terminal_submission.auditor_remarks,
        v_terminal_submission.management_remarks,
        'BACKFILL: Multi-month sibling auto-populated from terminal month ' || v_terminal.review_period || ' ' || v_terminal.review_year,
        v_terminal_submission.self_evidence_urls, v_terminal_submission.manager_evidence_urls,
        v_terminal_submission.skip_level_evidence_urls,
        v_terminal_submission.hr_pms_evidence_urls, v_terminal_submission.auditor_evidence_urls,
        v_terminal_submission.management_evidence_urls,
        v_terminal_submission.manager_achieved_value, v_terminal_submission.auditor_achieved_value,
        v_terminal_submission.management_achieved_value,
        v_terminal_submission.skip_level_achieved_value, v_terminal_submission.hr_pms_achieved_value
      )
      ON CONFLICT (kpi_id) DO UPDATE SET
        self_score = EXCLUDED.self_score, self_rating = EXCLUDED.self_rating,
        manager_score = EXCLUDED.manager_score, manager_rating = EXCLUDED.manager_rating,
        skip_level_score = EXCLUDED.skip_level_score, skip_level_rating = EXCLUDED.skip_level_rating,
        hr_pms_score = EXCLUDED.hr_pms_score, hr_pms_rating = EXCLUDED.hr_pms_rating,
        auditor_score = EXCLUDED.auditor_score, auditor_rating = EXCLUDED.auditor_rating,
        management_score = EXCLUDED.management_score, management_rating = EXCLUDED.management_rating,
        final_score = EXCLUDED.final_score, final_rating = EXCLUDED.final_rating,
        achieved_value = EXCLUDED.achieved_value, is_na = EXCLUDED.is_na,
        submitted_at = EXCLUDED.submitted_at,
        self_remarks = EXCLUDED.self_remarks, manager_remarks = EXCLUDED.manager_remarks,
        skip_level_remarks = EXCLUDED.skip_level_remarks,
        hr_pms_remarks = EXCLUDED.hr_pms_remarks, auditor_remarks = EXCLUDED.auditor_remarks,
        management_remarks = EXCLUDED.management_remarks,
        auto_advance_reason = EXCLUDED.auto_advance_reason,
        self_evidence_urls = EXCLUDED.self_evidence_urls, manager_evidence_urls = EXCLUDED.manager_evidence_urls,
        skip_level_evidence_urls = EXCLUDED.skip_level_evidence_urls,
        hr_pms_evidence_urls = EXCLUDED.hr_pms_evidence_urls, auditor_evidence_urls = EXCLUDED.auditor_evidence_urls,
        management_evidence_urls = EXCLUDED.management_evidence_urls,
        manager_achieved_value = EXCLUDED.manager_achieved_value, auditor_achieved_value = EXCLUDED.auditor_achieved_value,
        management_achieved_value = EXCLUDED.management_achieved_value,
        skip_level_achieved_value = EXCLUDED.skip_level_achieved_value, hr_pms_achieved_value = EXCLUDED.hr_pms_achieved_value;

      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
      VALUES (
        v_sibling.kpi_id, 'BACKFILL_MULTIMONTH_PERCOLATION', NULL,
        jsonb_build_object('status', v_sibling.kpi_status),
        jsonb_build_object('status', 'approved', 'final_score', v_terminal_submission.final_score),
        jsonb_build_object(
          'source_kpi_id', v_terminal.id,
          'source_period', v_terminal.review_period,
          'frequency', v_terminal.frequency,
          'tool', 'backfill_multimonth_percolation',
          'policy', 'POLICY_54_v3'
        )
      );

      v_siblings := v_siblings + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_siblings;
END;
$function$;

-- Run the one-shot backfill
SELECT * FROM public.backfill_multimonth_percolation();