
CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cycle_months TEXT[];
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_performer UUID;
BEGIN
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  v_performer := auth.uid();
  IF v_performer IS NULL THEN
    SELECT ur.user_id INTO v_performer FROM user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  END IF;

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
    IF v_sibling.kpi_status = 'approved' THEN
      CONTINUE;
    END IF;

    -- IMPORTANT: Set status to approved FIRST so that sync_kpi_status_from_submission
    -- won't try to move it to self_review (which triggers frequency lock)
    UPDATE kpis SET status = 'approved' WHERE id = v_sibling.kpi_id;

    -- Now upsert review_submissions (sync trigger's WHERE status='kra_set' won't match)
    INSERT INTO review_submissions (
      kpi_id, self_score, self_rating, manager_score, manager_rating,
      skip_level_score, skip_level_rating, hr_pms_score, hr_pms_rating,
      auditor_score, auditor_rating, management_score, management_rating,
      final_score, final_rating, achieved_value, is_na, submitted_at
    ) VALUES (
      v_sibling.kpi_id,
      v_terminal_submission.self_score, v_terminal_submission.self_rating,
      v_terminal_submission.manager_score, v_terminal_submission.manager_rating,
      v_terminal_submission.skip_level_score, v_terminal_submission.skip_level_rating,
      v_terminal_submission.hr_pms_score, v_terminal_submission.hr_pms_rating,
      v_terminal_submission.auditor_score, v_terminal_submission.auditor_rating,
      v_terminal_submission.management_score, v_terminal_submission.management_rating,
      v_terminal_submission.final_score, v_terminal_submission.final_rating,
      v_terminal_submission.achieved_value, v_terminal_submission.is_na, now()
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
      submitted_at = EXCLUDED.submitted_at;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_sibling.kpi_id, 'SCORE_PERCOLATED', v_performer,
      jsonb_build_object('status', v_sibling.kpi_status),
      jsonb_build_object('status', 'approved', 'final_score', v_terminal_submission.final_score),
      jsonb_build_object('source_kpi_id', NEW.id, 'source_period', NEW.review_period, 'frequency', NEW.frequency, 'tool', 'percolate_multimonth_score')
    );
  END LOOP;

  RETURN NEW;
END;
$fn$;
