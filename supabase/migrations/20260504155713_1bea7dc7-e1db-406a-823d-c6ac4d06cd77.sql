
-- Fix percolate_multimonth_score: use canonical get_employee_workflow_info helper
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

  -- Resolve terminal's effective workflow template via canonical helper.
  -- Defensive: never let a missing/odd workflow row abort the percolation.
  BEGIN
    SELECT template_id INTO v_terminal_wf_id
    FROM get_employee_workflow_info(NEW.employee_id, NEW.review_period, NEW.review_year)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_terminal_wf_id := NULL;
  END;

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
        'policy', 'POLICY_54_v5_1',
        'terminal_workflow_template_id', v_terminal_wf_id
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Fix repair_multimonth_workflow_drift_v5: same canonical helper swap
CREATE OR REPLACE FUNCTION public.repair_multimonth_workflow_drift_v5(p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    BEGIN
      SELECT template_id INTO v_terminal_wf_id
      FROM get_employee_workflow_info(v_terminal.employee_id, v_terminal.review_period, v_terminal.review_year)
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_terminal_wf_id := NULL;
    END;

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
            'policy','POLICY_54_v5_1', 'terminal_workflow_template_id', v_terminal_wf_id));
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
$function$;
