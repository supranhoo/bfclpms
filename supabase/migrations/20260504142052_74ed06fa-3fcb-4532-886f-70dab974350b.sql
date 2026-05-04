-- =========================================================================
-- POLICY §54 v5 — Multi-month workflow alignment
-- 1. Stamp terminal_workflow_template_id on SCORE_PERCOLATED audit metadata
-- 2. Cascade workflow_change_step_back to siblings when terminal regresses
-- 3. Re-percolate on workflow_config change for terminal of approved cycles
-- 4. Repair RPCs (dry-run by default, admin-gated)
-- =========================================================================

-- Helper: resolve terminal month of a multi-month cycle (mirrors trigger logic)
CREATE OR REPLACE FUNCTION public.get_cycle_terminal_month(
  p_frequency text,
  p_review_period text,
  p_review_year integer,
  p_frequency_cycle_start text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle_months TEXT[];
  v_canonical TEXT[] := ARRAY['January','February','March','April','May','June',
                              'July','August','September','October','November','December'];
  v_terminal TEXT;
  v_max_idx INTEGER := 0;
  v_idx INTEGER;
BEGIN
  IF p_frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN p_review_period;
  END IF;
  v_cycle_months := get_cycle_months(p_frequency, p_review_period, p_review_year, p_frequency_cycle_start);
  IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
    RETURN p_review_period;
  END IF;
  IF 'December' = ANY(v_cycle_months) AND 'January' = ANY(v_cycle_months) THEN
    RETURN v_cycle_months[array_length(v_cycle_months, 1)];
  END IF;
  FOREACH v_terminal IN ARRAY v_cycle_months LOOP
    v_idx := array_position(v_canonical, v_terminal);
    IF v_idx > v_max_idx THEN v_max_idx := v_idx; END IF;
  END LOOP;
  RETURN v_canonical[v_max_idx];
END;
$$;

-- =========================================================================
-- 1. Patch percolate_multimonth_score: stamp terminal_workflow_template_id
-- =========================================================================
CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_months TEXT[];
  v_terminal_month TEXT;
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_performer UUID;
  v_terminal_wf_id UUID;
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

  v_terminal_month := get_cycle_terminal_month(NEW.frequency, NEW.review_period, NEW.review_year, NEW.frequency_cycle_start);
  IF NEW.review_period != v_terminal_month THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_terminal_submission
  FROM review_submissions WHERE kpi_id = NEW.id
  ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
  IF v_terminal_submission IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve terminal's effective workflow_template_id for stamping
  SELECT workflow_template_id INTO v_terminal_wf_id
  FROM resolve_employee_workflow(NEW.employee_id, NEW.review_period, NEW.review_year);

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
      kpi_id, self_score, self_rating, manager_score, manager_rating,
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
        'policy', 'POLICY_54_v5',
        'terminal_workflow_template_id', v_terminal_wf_id
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 2. workflow_change_step_back: cascade to siblings when terminal regresses
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
  v_kpi RECORD;
  v_employee_ids UUID[];
  v_terminal_month TEXT;
  v_sibling RECORD;
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

  v_old_terminal := NULL;
  FOR i IN REVERSE array_length(v_old_stages, 1)..1 LOOP
    IF v_old_stages[i] != 'approved' AND v_old_stages[i] != 'kra_set' THEN
      v_old_terminal := v_old_stages[i]; EXIT;
    END IF;
  END LOOP;
  IF v_old_terminal IS NULL THEN RETURN NEW; END IF;

  v_old_canonical_pos := 0;
  FOR i IN 1..array_length(v_canonical, 1) LOOP
    IF v_canonical[i] = v_old_terminal THEN v_old_canonical_pos := i; EXIT; END IF;
  END LOOP;

  v_step_back_to := NULL;
  FOR i IN 1..array_length(v_new_stages, 1) LOOP
    IF v_new_stages[i] = 'approved' OR v_new_stages[i] = 'kra_set' THEN CONTINUE; END IF;
    FOR j IN 1..array_length(v_canonical, 1) LOOP
      IF v_canonical[j] = v_new_stages[i] AND j > v_old_canonical_pos THEN
        IF i > 1 THEN
          v_step_back_to := v_new_stages[i - 1];
          IF v_step_back_to = 'kra_set' THEN v_step_back_to := 'self_review'; END IF;
        END IF;
        v_new_has_beyond := true; EXIT;
      END IF;
    END LOOP;
    IF v_new_has_beyond THEN EXIT; END IF;
  END LOOP;
  IF NOT v_new_has_beyond OR v_step_back_to IS NULL THEN RETURN NEW; END IF;

  IF NEW.config_type = 'employee' THEN
    v_employee_ids := ARRAY[NEW.config_value::uuid];
  ELSIF NEW.config_type = 'department' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE department_id = NEW.config_value::uuid) INTO v_employee_ids;
  ELSIF NEW.config_type = 'pms_grade' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE pms_grade = NEW.config_value) INTO v_employee_ids;
  END IF;
  IF v_employee_ids IS NULL OR array_length(v_employee_ids, 1) = 0 THEN RETURN NEW; END IF;

  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year,
           k.frequency, k.frequency_cycle_start, k.kra_name, k.kpi_name
    FROM kpis k
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status = 'approved'
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    -- For multi-month: only act on the TERMINAL of the cycle.
    IF v_kpi.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
      v_terminal_month := get_cycle_terminal_month(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);
      IF v_kpi.review_period != v_terminal_month THEN CONTINUE; END IF;
    END IF;

    -- Step back terminal
    UPDATE kpis SET status = v_step_back_to::review_status WHERE id = v_kpi.kpi_id;
    UPDATE review_submissions SET final_score = NULL, final_rating = NULL WHERE kpi_id = v_kpi.kpi_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (v_kpi.kpi_id, 'WORKFLOW_CHANGE_STEP_BACK', auth.uid(),
      jsonb_build_object('status', 'approved'),
      jsonb_build_object('status', v_step_back_to),
      jsonb_build_object('reason','Workflow template changed: new stages added beyond old terminal reviewer',
        'old_template_id', v_old_template_id, 'new_template_id', v_new_template_id,
        'old_terminal', v_old_terminal, 'step_back_to', v_step_back_to,
        'tool','trg_workflow_change_step_back', 'policy','POLICY_54_v5'));

    -- POLICY §54 v5: cascade step-back to multi-month siblings of this terminal
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
        UPDATE review_submissions SET final_score = NULL, final_rating = NULL WHERE kpi_id = v_sibling.kpi_id;
        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (v_sibling.kpi_id, 'WORKFLOW_CHANGE_STEP_BACK_SIBLING', auth.uid(),
          jsonb_build_object('status','approved'),
          jsonb_build_object('status', v_step_back_to),
          jsonb_build_object('reason','Cascaded from terminal step-back',
            'terminal_kpi_id', v_kpi.kpi_id,
            'old_template_id', v_old_template_id, 'new_template_id', v_new_template_id,
            'tool','trg_workflow_change_step_back', 'policy','POLICY_54_v5'));
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 3. NEW trigger on workflow_config: re-percolate when terminal's chain
--    changes after approval (drives sibling chain re-render via stamp).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repercolate_on_workflow_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_ids UUID[];
  v_kpi RECORD;
  v_terminal_month TEXT;
  v_terminal_submission RECORD;
  v_sibling RECORD;
  v_terminal_wf_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.workflow_template_id = NEW.workflow_template_id THEN
    RETURN NEW;
  END IF;

  IF NEW.config_type = 'employee' THEN
    v_employee_ids := ARRAY[NEW.config_value::uuid];
  ELSIF NEW.config_type = 'department' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE department_id = NEW.config_value::uuid) INTO v_employee_ids;
  ELSIF NEW.config_type = 'pms_grade' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE pms_grade = NEW.config_value) INTO v_employee_ids;
  END IF;
  IF v_employee_ids IS NULL OR array_length(v_employee_ids, 1) = 0 THEN RETURN NEW; END IF;

  v_terminal_wf_id := NEW.workflow_template_id;

  FOR v_kpi IN
    SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.review_period, k.review_year, k.frequency, k.frequency_cycle_start
    FROM kpis k
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status = 'approved'
      AND k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    v_terminal_month := get_cycle_terminal_month(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);
    IF v_kpi.review_period != v_terminal_month THEN CONTINUE; END IF;

    SELECT * INTO v_terminal_submission FROM review_submissions WHERE kpi_id = v_kpi.id ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
    IF v_terminal_submission IS NULL THEN CONTINUE; END IF;

    PERFORM set_config('app.percolation_bypass','true',true);

    FOR v_sibling IN
      SELECT k.id AS kpi_id, k.review_period
      FROM kpis k
      WHERE k.employee_id = v_kpi.employee_id
        AND k.kra_name = v_kpi.kra_name
        AND k.kpi_name = v_kpi.kpi_name
        AND k.review_year = v_kpi.review_year
        AND k.frequency = v_kpi.frequency
        AND k.review_period = ANY(get_cycle_months(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start))
        AND k.id != v_kpi.id
    LOOP
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
      VALUES (v_sibling.kpi_id, 'WORKFLOW_CONFIG_REPERCOLATE', auth.uid(),
        NULL,
        jsonb_build_object('terminal_workflow_template_id', v_terminal_wf_id),
        jsonb_build_object('source_kpi_id', v_kpi.id, 'source_period', v_kpi.review_period,
          'frequency', v_kpi.frequency, 'tool','trg_repercolate_on_workflow_config_change',
          'policy','POLICY_54_v5', 'terminal_workflow_template_id', v_terminal_wf_id));
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_repercolate_on_workflow_config_change ON workflow_config;
CREATE TRIGGER trg_repercolate_on_workflow_config_change
  AFTER INSERT OR UPDATE ON workflow_config
  FOR EACH ROW
  EXECUTE FUNCTION repercolate_on_workflow_config_change();

-- =========================================================================
-- 4a. Repair RPC: workflow drift (admin, dry-run by default)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repair_multimonth_workflow_drift_v5(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_terminal RECORD;
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_terminal_wf_id UUID;
  v_terminal_month TEXT;
  v_to_repair INTEGER := 0;
  v_repaired INTEGER := 0;
  v_samples jsonb := '[]'::jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_apply THEN PERFORM set_config('app.percolation_bypass','true',true); END IF;

  FOR v_terminal IN
    SELECT k.id, k.employee_id, k.kra_name, k.kpi_name,
           k.review_period, k.review_year, k.frequency, k.frequency_cycle_start
    FROM kpis k
    WHERE k.status = 'approved'
      AND k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
  LOOP
    v_terminal_month := get_cycle_terminal_month(v_terminal.frequency, v_terminal.review_period, v_terminal.review_year, v_terminal.frequency_cycle_start);
    IF v_terminal.review_period != v_terminal_month THEN CONTINUE; END IF;

    SELECT workflow_template_id INTO v_terminal_wf_id
    FROM resolve_employee_workflow(v_terminal.employee_id, v_terminal.review_period, v_terminal.review_year);
    SELECT * INTO v_terminal_submission FROM review_submissions WHERE kpi_id = v_terminal.id ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
    IF v_terminal_submission IS NULL THEN CONTINUE; END IF;

    FOR v_sibling IN
      SELECT k.id AS kpi_id, k.review_period
      FROM kpis k
      LEFT JOIN review_submissions rs ON rs.kpi_id = k.id
      WHERE k.employee_id = v_terminal.employee_id
        AND k.kra_name = v_terminal.kra_name
        AND k.kpi_name = v_terminal.kpi_name
        AND k.review_year = v_terminal.review_year
        AND k.frequency = v_terminal.frequency
        AND k.review_period = ANY(get_cycle_months(v_terminal.frequency, v_terminal.review_period, v_terminal.review_year, v_terminal.frequency_cycle_start))
        AND k.id != v_terminal.id
        AND (
          rs.kpi_id IS NULL
          OR (rs.final_score IS DISTINCT FROM v_terminal_submission.final_score)
          OR (rs.is_na IS DISTINCT FROM v_terminal_submission.is_na)
          OR NOT EXISTS (
            SELECT 1 FROM kpi_audit_logs al
            WHERE al.kpi_id = k.id
              AND al.action IN ('SCORE_PERCOLATED','SCORE_REPERCOLATED','WORKFLOW_CONFIG_REPERCOLATE')
              AND (al.metadata->>'terminal_workflow_template_id')::uuid = v_terminal_wf_id
          )
        )
    LOOP
      v_to_repair := v_to_repair + 1;
      IF jsonb_array_length(v_samples) < 25 THEN
        v_samples := v_samples || jsonb_build_object(
          'sibling_kpi_id', v_sibling.kpi_id,
          'sibling_period', v_sibling.review_period,
          'terminal_kpi_id', v_terminal.id,
          'terminal_period', v_terminal.review_period,
          'terminal_workflow_template_id', v_terminal_wf_id,
          'terminal_final_score', v_terminal_submission.final_score
        );
      END IF;

      IF p_apply THEN
        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (v_sibling.kpi_id, 'BACKFILL_MULTIMONTH_PERCOLATION_V5', auth.uid(),
          NULL,
          jsonb_build_object('final_score', v_terminal_submission.final_score, 'status','approved'),
          jsonb_build_object('source_kpi_id', v_terminal.id, 'source_period', v_terminal.review_period,
            'frequency', v_terminal.frequency, 'tool','repair_multimonth_workflow_drift_v5',
            'policy','POLICY_54_v5', 'terminal_workflow_template_id', v_terminal_wf_id));
        v_repaired := v_repaired + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_apply THEN 'apply' ELSE 'dry_run' END,
    'detected', v_to_repair,
    'repaired', v_repaired,
    'samples', v_samples,
    'ran_at', now()
  );
END;
$$;

-- =========================================================================
-- 4b. Repair RPC: sibling frequency drift (admin, dry-run by default)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repair_sibling_frequency_drift_v5(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_drift RECORD;
  v_detected INTEGER := 0;
  v_normalized INTEGER := 0;
  v_samples jsonb := '[]'::jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  FOR v_drift IN
    SELECT employee_id, kra_name, kpi_name, review_year,
           array_agg(DISTINCT frequency::text) AS distinct_freqs,
           array_agg(id) AS kpi_ids
    FROM kpis
    GROUP BY employee_id, kra_name, kpi_name, review_year
    HAVING count(DISTINCT frequency) > 1
       AND bool_or(frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly'))
  LOOP
    v_detected := v_detected + 1;
    IF jsonb_array_length(v_samples) < 25 THEN
      v_samples := v_samples || jsonb_build_object(
        'employee_id', v_drift.employee_id,
        'kra_name', v_drift.kra_name,
        'kpi_name', v_drift.kpi_name,
        'review_year', v_drift.review_year,
        'distinct_frequencies', to_jsonb(v_drift.distinct_freqs),
        'kpi_ids', to_jsonb(v_drift.kpi_ids)
      );
    END IF;

    -- Apply path is intentionally a NO-OP for v5: changing frequency on a
    -- historical row can break period-cycle math and the
    -- duplicate KPI prevention constraint. Surfacing the drift via dry-run
    -- lets admins remediate via the existing Org KPI tooling.
    -- We never auto-flip frequency; we only audit the detection.
    IF p_apply THEN
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
      SELECT k.id, 'KPI_FREQUENCY_DRIFT_DETECTED', auth.uid(),
        jsonb_build_object('frequency', k.frequency::text),
        NULL,
        jsonb_build_object('distinct_frequencies', to_jsonb(v_drift.distinct_freqs),
          'tool','repair_sibling_frequency_drift_v5',
          'policy','POLICY_54_v5',
          'note','Detection only — manual remediation required via Org KPI tools')
      FROM kpis k WHERE k.id = ANY(v_drift.kpi_ids);
      v_normalized := v_normalized + array_length(v_drift.kpi_ids, 1);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_apply THEN 'apply_detect_only' ELSE 'dry_run' END,
    'detected_groups', v_detected,
    'audit_entries_written', v_normalized,
    'samples', v_samples,
    'ran_at', now(),
    'note', 'Detection only. Frequency on historical rows is not auto-changed.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_multimonth_workflow_drift_v5(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_sibling_frequency_drift_v5(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cycle_terminal_month(text, text, integer, text) TO authenticated;