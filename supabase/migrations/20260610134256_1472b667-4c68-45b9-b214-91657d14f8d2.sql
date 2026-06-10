
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
  v_terminal_idx INTEGER;
  v_max_idx INTEGER;
  v_idx INTEGER;
  v_wraps BOOLEAN;
  v_sibling RECORD;
  v_performer UUID;
  v_is_repercolation TEXT;
BEGIN
  v_is_repercolation := current_setting('app.repercolation_active', true);
  IF v_is_repercolation = 'true' THEN
    RETURN NEW;
  END IF;

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

  SELECT k.* INTO v_kpi FROM kpis k WHERE k.id = NEW.kpi_id;
  IF v_kpi IS NULL THEN RETURN NEW; END IF;

  -- ADR-086 Defect A: accept either approved KPI OR submission with final_score
  IF v_kpi.status != 'approved' AND NEW.final_score IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_kpi.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  v_cycle_months := get_cycle_months(v_kpi.frequency, v_kpi.review_period, v_kpi.review_year, v_kpi.frequency_cycle_start);

  IF array_length(v_cycle_months, 1) IS NULL OR array_length(v_cycle_months, 1) <= 1 THEN
    RETURN NEW;
  END IF;

  v_wraps := ('December' = ANY(v_cycle_months) AND 'January' = ANY(v_cycle_months));

  IF v_wraps THEN
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
    RETURN NEW;
  END IF;

  v_terminal_idx := array_position(v_months_canonical, v_terminal_month);
  v_performer := auth.uid();

  PERFORM set_config('app.percolation_bypass', 'true', true);
  PERFORM set_config('app.repercolation_active', 'true', true);

  -- ADR-086 Defect B: resolve each sibling month's calendar year
  FOR v_sibling IN
    WITH cycle AS (
      SELECT
        m AS review_period,
        CASE
          WHEN v_wraps AND array_position(v_months_canonical, m) > v_terminal_idx
            THEN v_kpi.review_year - 1
          ELSE v_kpi.review_year
        END AS review_year
      FROM unnest(v_cycle_months) AS m
    )
    SELECT k.id AS kpi_id, k.review_period, k.review_year
    FROM kpis k
    JOIN cycle c ON c.review_period = k.review_period AND c.review_year = k.review_year
    WHERE k.employee_id = v_kpi.employee_id
      AND k.kra_name    = v_kpi.kra_name
      AND k.kpi_name    = v_kpi.kpi_name
      AND k.frequency   = v_kpi.frequency
      AND k.id          != v_kpi.id
  LOOP
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
        'source_year', v_kpi.review_year,
        'sibling_period', v_sibling.review_period,
        'sibling_year', v_sibling.review_year,
        'frequency', v_kpi.frequency,
        'tool', 'repercolate_on_submission_update',
        'policy', 'POLICY_54_v5'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$fn$;
