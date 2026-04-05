
-- Part 1: Fix percolate_multimonth_score() with workflow guard + remove admin fallback
CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_months TEXT[];
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_performer UUID;
  v_sibling_stages JSONB;
  v_sibling_stage_keys TEXT[];
  v_sibling_terminal TEXT;
BEGIN
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  -- Use auth.uid() only — NULL means system action (no arbitrary admin fallback)
  v_performer := auth.uid();

  v_cycle_months := get_cycle_months(NEW.frequency, NEW.review_period, NEW.review_year);

  IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_terminal_submission
  FROM review_submissions WHERE kpi_id = NEW.id
  ORDER BY submitted_at DESC NULLS LAST LIMIT 1;

  IF v_terminal_submission IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_sibling IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.review_period
    FROM kpis k
    WHERE k.employee_id = NEW.employee_id
      AND k.kra_name = NEW.kra_name AND k.kpi_name = NEW.kpi_name
      AND k.review_year = NEW.review_year AND k.frequency = NEW.frequency
      AND k.review_period != NEW.review_period
      AND k.review_period = ANY(v_cycle_months)
      AND k.id != NEW.id
  LOOP
    -- Get sibling's workflow stages
    SELECT wf.stages INTO v_sibling_stages
    FROM get_employee_workflow_info(NEW.employee_id, v_sibling.review_period, NEW.review_year) wf
    LIMIT 1;

    IF v_sibling_stages IS NOT NULL THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(v_sibling_stages)) INTO v_sibling_stage_keys;
      IF v_sibling_stage_keys IS NOT NULL AND array_length(v_sibling_stage_keys, 1) > 0 THEN
        v_sibling_terminal := v_sibling_stage_keys[array_length(v_sibling_stage_keys, 1)];
      ELSE
        v_sibling_terminal := 'management_review';
      END IF;
    ELSE
      v_sibling_terminal := 'management_review';
    END IF;

    IF v_sibling.kpi_status = 'approved' THEN
      -- Already approved: update scores only, no status change
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
        'Score percolated from terminal month',
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
        jsonb_build_object('source_kpi_id', NEW.id, 'source_period', NEW.review_period, 'frequency', NEW.frequency, 'tool', 'percolate_multimonth_score', 'scores_only', true)
      );

    ELSIF v_sibling.kpi_status = v_sibling_terminal THEN
      -- At terminal stage: safe to approve + copy scores
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
        'Score percolated from terminal month',
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
        jsonb_build_object('source_kpi_id', NEW.id, 'source_period', NEW.review_period, 'frequency', NEW.frequency, 'tool', 'percolate_multimonth_score')
      );

    ELSE
      -- Mid-workflow: DO NOT touch status, log PERCOLATION_DEFERRED
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
      VALUES (
        v_sibling.kpi_id, 'PERCOLATION_DEFERRED', v_performer,
        jsonb_build_object('status', v_sibling.kpi_status),
        jsonb_build_object('sibling_terminal', v_sibling_terminal, 'source_period', NEW.review_period),
        jsonb_build_object('source_kpi_id', NEW.id, 'frequency', NEW.frequency, 'reason', 'Sibling has not reached terminal workflow stage')
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Part 2: Fix log_kpi_status_transition() — remove employee fallback
CREATE OR REPLACE FUNCTION public.log_kpi_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.id,
      'STATUS_TRANSITION',
      auth.uid(),  -- NULL when no session (system/migration action)
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('transition_time', now())
    );
  END IF;

  RETURN NEW;
END;
$function$;
