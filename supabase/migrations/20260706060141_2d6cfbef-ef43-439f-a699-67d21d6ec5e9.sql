-- Canonical fiscal-window helper (POLICY §90b) --------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_year_for_month(
  p_period text,
  p_fiscal_start_year integer
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_period IS NULL THEN NULL
    WHEN array_position(
           ARRAY['July','August','September','October','November','December']::text[],
           p_period
         ) IS NOT NULL THEN p_fiscal_start_year
    WHEN array_position(
           ARRAY['January','February','March','April','May','June']::text[],
           p_period
         ) IS NOT NULL THEN p_fiscal_start_year + 1
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.fiscal_year_for_month(text, integer) IS
  'Returns the calendar year that a review_period (month name) belongs to inside fiscal cycle starting Jul(p_fiscal_start_year). Ref: POLICY §90b, BUG-044/045/046.';

-- Fix percolate_multimonth_score: cross-year cycle siblings --------------------
-- BUG-046: previous WHERE clause `k.review_year = NEW.review_year` silently
-- dropped sibling months living in the other calendar year for cycles that
-- wrap January (Half-Yearly Oct-Mar, Yearly Jul-Jun, Quarterly Nov-Jan, etc.).
-- Fix derives each sibling's owning calendar year from its position within
-- the cycle: any month whose calendar index is greater than the terminal
-- month's index (i.e. earlier in a wrapping cycle) belongs to the previous
-- calendar year; the rest belong to the terminal's year.

CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_months TEXT[];
  v_terminal_month TEXT;
  v_terminal_midx INT;
  v_sibling RECORD;
  v_terminal_submission RECORD;
  v_performer UUID;
  v_terminal_wf_id UUID;
  v_all_months CONSTANT TEXT[] := ARRAY[
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
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
  v_terminal_midx := array_position(v_all_months, v_terminal_month);

  SELECT * INTO v_terminal_submission
  FROM review_submissions WHERE kpi_id = NEW.id
  ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
  IF v_terminal_submission IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT template_id INTO v_terminal_wf_id
    FROM get_employee_workflow_info(NEW.employee_id, NEW.review_period, NEW.review_year)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_terminal_wf_id := NULL;
  END;

  PERFORM set_config('app.percolation_bypass', 'true', true);

  FOR v_sibling IN
    WITH tgt AS (
      SELECT m AS period,
             CASE
               WHEN array_position(v_all_months, m) > v_terminal_midx
                 THEN NEW.review_year - 1
               ELSE NEW.review_year
             END AS ry
      FROM unnest(v_cycle_months) AS m
      WHERE m <> NEW.review_period
    )
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.review_period, k.review_year
    FROM tgt
    JOIN kpis k
      ON k.employee_id = NEW.employee_id
     AND k.kra_name    = NEW.kra_name
     AND k.kpi_name    = NEW.kpi_name
     AND k.frequency   = NEW.frequency
     AND k.review_period = tgt.period
     AND k.review_year   = tgt.ry
     AND k.id <> NEW.id
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
      v_terminal_submission.self_remarks, v_terminal_submission.manager_remarks, v_terminal_submission.skip_level_remarks,
      v_terminal_submission.hr_pms_remarks, v_terminal_submission.auditor_remarks, v_terminal_submission.management_remarks,
      'multimonth_percolation',
      v_terminal_submission.self_evidence_urls, v_terminal_submission.manager_evidence_urls, v_terminal_submission.skip_level_evidence_urls,
      v_terminal_submission.hr_pms_evidence_urls, v_terminal_submission.auditor_evidence_urls, v_terminal_submission.management_evidence_urls,
      v_terminal_submission.manager_achieved_value, v_terminal_submission.auditor_achieved_value, v_terminal_submission.management_achieved_value,
      v_terminal_submission.skip_level_achieved_value, v_terminal_submission.hr_pms_achieved_value
    );

    INSERT INTO kpi_audit_logs (
      kpi_id, action_type, performed_by,
      old_value, new_value, remarks
    ) VALUES (
      v_sibling.kpi_id, 'SCORE_PERCOLATED', v_performer,
      jsonb_build_object('status', v_sibling.kpi_status),
      jsonb_build_object(
        'status', 'approved',
        'source_kpi_id', NEW.id,
        'source_period', NEW.review_period,
        'source_year', NEW.review_year,
        'sibling_period', v_sibling.review_period,
        'sibling_year', v_sibling.review_year,
        'workflow_template_id', v_terminal_wf_id
      ),
      'Sibling scored via terminal-month percolation (POLICY_54_v5 cross-year cycle)'
    );
  END LOOP;

  PERFORM set_config('app.percolation_bypass', 'false', true);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.percolate_multimonth_score() IS
  'Multi-month terminal-month percolation. Derives sibling calendar year from cycle position so cross-January cycles (e.g. Half-Yearly Oct-Mar) propagate correctly. Ref: POLICY §54 v5 / §90b, BUG-046.';
