
-- =========================================================================
-- Re-percolation trigger: propagate post-approval score edits on terminal
-- months to all sibling months in the same multi-month KPI cycle.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repercolate_on_submission_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_kpi RECORD;
  v_cycle_months TEXT[];
  v_months_canonical TEXT[] := ARRAY['January','February','March','April','May','June',
                                     'July','August','September','October','November','December'];
  v_terminal_month TEXT;
  v_max_idx INTEGER;
  v_idx INTEGER;
  v_sibling RECORD;
  v_performer UUID;
  v_is_repercolation TEXT;
BEGIN
  -- Guard: skip if this update was triggered by percolation itself (avoid infinite loop)
  v_is_repercolation := current_setting('app.repercolation_active', true);
  IF v_is_repercolation = 'true' THEN
    RETURN NEW;
  END IF;

  -- Guard: skip if no score-relevant columns changed
  IF (OLD.self_score IS NOT DISTINCT FROM NEW.self_score)
    AND (OLD.self_rating IS NOT DISTINCT FROM NEW.self_rating)
    AND (OLD.manager_score IS NOT DISTINCT FROM NEW.manager_score)
    AND (OLD.manager_rating IS NOT DISTINCT FROM NEW.manager_rating)
    AND (OLD.skip_level_score IS NOT DISTINCT FROM NEW.skip_level_score)
    AND (OLD.skip_level_rating IS NOT DISTINCT FROM NEW.skip_level_rating)
    AND (OLD.hr_pms_score IS NOT DISTINCT FROM NEW.hr_pms_score)
    AND (OLD.hr_pms_rating IS NOT DISTINCT FROM NEW.hr_pms_rating)
    AND (OLD.auditor_score IS NOT DISTINCT FROM NEW.auditor_score)
    AND (OLD.auditor_rating IS NOT DISTINCT FROM NEW.auditor_rating)
    AND (OLD.management_score IS NOT DISTINCT FROM NEW.management_score)
    AND (OLD.management_rating IS NOT DISTINCT FROM NEW.management_rating)
    AND (OLD.final_score IS NOT DISTINCT FROM NEW.final_score)
    AND (OLD.final_rating IS NOT DISTINCT FROM NEW.final_rating)
    AND (OLD.achieved_value IS NOT DISTINCT FROM NEW.achieved_value)
    AND (OLD.is_na IS NOT DISTINCT FROM NEW.is_na)
    AND (OLD.manager_achieved_value IS NOT DISTINCT FROM NEW.manager_achieved_value)
    AND (OLD.auditor_achieved_value IS NOT DISTINCT FROM NEW.auditor_achieved_value)
    AND (OLD.management_achieved_value IS NOT DISTINCT FROM NEW.management_achieved_value)
    AND (OLD.skip_level_achieved_value IS NOT DISTINCT FROM NEW.skip_level_achieved_value)
    AND (OLD.hr_pms_achieved_value IS NOT DISTINCT FROM NEW.hr_pms_achieved_value)
  THEN
    RETURN NEW;
  END IF;

  -- Look up the parent KPI
  SELECT k.* INTO v_kpi
  FROM kpis k
  WHERE k.id = NEW.kpi_id;

  IF v_kpi IS NULL OR v_kpi.status != 'approved' THEN
    RETURN NEW;
  END IF;

  IF v_kpi.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  -- Determine cycle months and terminal
  v_cycle_months := get_cycle_months(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);

  IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
    RETURN NEW;
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

  -- Only re-percolate from the terminal month
  IF v_kpi.review_period != v_terminal_month THEN
    RETURN NEW;
  END IF;

  v_performer := auth.uid();

  -- Set flags to bypass frequency lock and prevent recursion
  PERFORM set_config('app.percolation_bypass', 'true', true);
  PERFORM set_config('app.repercolation_active', 'true', true);

  FOR v_sibling IN
    SELECT k.id AS kpi_id, k.review_period
    FROM kpis k
    WHERE k.employee_id = v_kpi.employee_id
      AND k.kra_name    = v_kpi.kra_name
      AND k.kpi_name    = v_kpi.kpi_name
      AND k.review_year = v_kpi.review_year
      AND k.frequency   = v_kpi.frequency
      AND k.review_period != v_kpi.review_period
      AND k.review_period = ANY(v_cycle_months)
      AND k.id != v_kpi.id
  LOOP
    -- Upsert sibling submission with latest terminal scores
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
      NEW.self_score, NEW.self_rating, NEW.manager_score, NEW.manager_rating,
      NEW.skip_level_score, NEW.skip_level_rating, NEW.hr_pms_score, NEW.hr_pms_rating,
      NEW.auditor_score, NEW.auditor_rating, NEW.management_score, NEW.management_rating,
      NEW.final_score, NEW.final_rating, NEW.achieved_value, NEW.is_na, now(),
      NEW.self_remarks, NEW.manager_remarks, NEW.skip_level_remarks,
      NEW.hr_pms_remarks, NEW.auditor_remarks, NEW.management_remarks,
      'Multi-month sibling — re-percolated from terminal month ' || v_kpi.review_period || ' ' || v_kpi.review_year,
      NEW.self_evidence_urls, NEW.manager_evidence_urls, NEW.skip_level_evidence_urls,
      NEW.hr_pms_evidence_urls, NEW.auditor_evidence_urls, NEW.management_evidence_urls,
      NEW.manager_achieved_value, NEW.auditor_achieved_value, NEW.management_achieved_value,
      NEW.skip_level_achieved_value, NEW.hr_pms_achieved_value
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
      v_sibling.kpi_id, 'SCORE_REPERCOLATED', v_performer,
      jsonb_build_object('source_kpi_id', v_kpi.id),
      jsonb_build_object(
        'final_score', NEW.final_score,
        'final_rating', NEW.final_rating,
        'management_score', NEW.management_score,
        'is_na', NEW.is_na
      ),
      jsonb_build_object(
        'source_kpi_id', v_kpi.id,
        'source_period', v_kpi.review_period,
        'frequency', v_kpi.frequency,
        'tool', 'repercolate_on_submission_update',
        'policy', 'POLICY_54_v4'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$fn$;

-- Attach the trigger
DROP TRIGGER IF EXISTS trg_repercolate_on_submission_update ON review_submissions;
CREATE TRIGGER trg_repercolate_on_submission_update
  AFTER UPDATE ON review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION repercolate_on_submission_update();
