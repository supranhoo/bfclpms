
-- =============================================================
-- FIX 1: Make get_cycle_months cycle-start aware
-- Drop old signatures to prevent PostgREST overload
-- =============================================================
DROP FUNCTION IF EXISTS public.get_cycle_months(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_cycle_months(TEXT, TEXT, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.get_cycle_months(
  p_frequency TEXT,
  p_month TEXT,
  p_year INTEGER,
  p_cycle_start TEXT DEFAULT NULL
)
RETURNS TEXT[] AS $$
DECLARE
  v_month_num INTEGER;
  v_cycle_months TEXT[];
  v_months TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];
  v_cs_start_month TEXT;
  v_cs_start_idx INTEGER;
  v_cycle_length INTEGER;
  v_offset INTEGER;
  v_cycle_idx INTEGER;
  v_cycle_start_pos INTEGER;
BEGIN
  v_month_num := array_position(v_months, p_month);
  IF v_month_num IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- If p_cycle_start is provided, use dynamic cycle resolution
  IF p_cycle_start IS NOT NULL AND p_cycle_start != '' THEN
    -- Parse the start month from cycle_start (e.g., 'Feb-Mar' → 'February', 'Apr-Jun' → 'April', 'Jan-Dec' → 'January')
    v_cs_start_month := CASE SPLIT_PART(p_cycle_start, '-', 1)
      WHEN 'Jan' THEN 'January' WHEN 'Feb' THEN 'February' WHEN 'Mar' THEN 'March'
      WHEN 'Apr' THEN 'April' WHEN 'May' THEN 'May' WHEN 'Jun' THEN 'June'
      WHEN 'Jul' THEN 'July' WHEN 'Aug' THEN 'August' WHEN 'Sep' THEN 'September'
      WHEN 'Oct' THEN 'October' WHEN 'Nov' THEN 'November' WHEN 'Dec' THEN 'December'
      ELSE NULL
    END;

    IF v_cs_start_month IS NOT NULL THEN
      v_cs_start_idx := array_position(v_months, v_cs_start_month);  -- 1-based

      -- Determine cycle length from frequency
      v_cycle_length := CASE p_frequency
        WHEN 'Bi-Monthly' THEN 2
        WHEN 'Quarterly' THEN 3
        WHEN 'Half-Yearly' THEN 6
        WHEN 'Yearly' THEN 12
        ELSE 1
      END;

      IF v_cycle_length <= 1 THEN
        RETURN ARRAY[p_month];
      END IF;

      -- Compute offset from cycle start (wrapping around December→January)
      -- offset = (month_num - cs_start_idx) mod 12, gives 0-based position relative to cycle start
      v_offset := ((v_month_num - v_cs_start_idx) % 12 + 12) % 12;

      -- Which cycle does this month belong to? cycle_idx = floor(offset / cycle_length)
      v_cycle_idx := v_offset / v_cycle_length;  -- integer division

      -- Compute the start position of this particular cycle
      v_cycle_start_pos := ((v_cs_start_idx - 1 + v_cycle_idx * v_cycle_length) % 12);  -- 0-based

      -- Build the array of months in this cycle
      v_cycle_months := ARRAY[]::TEXT[];
      FOR i IN 0..(v_cycle_length - 1) LOOP
        v_cycle_months := v_cycle_months || v_months[((v_cycle_start_pos + i) % 12) + 1];
      END LOOP;

      RETURN v_cycle_months;
    END IF;
    -- If parsing failed, fall through to hardcoded logic
  END IF;

  -- Fallback: original hardcoded logic for backward compatibility
  CASE p_frequency
    WHEN 'Bi-Monthly' THEN
      IF v_month_num % 2 = 1 THEN
        v_cycle_months := ARRAY[v_months[v_month_num], v_months[v_month_num + 1]];
      ELSE
        v_cycle_months := ARRAY[v_months[v_month_num - 1], v_months[v_month_num]];
      END IF;
    WHEN 'Quarterly' THEN
      CASE
        WHEN v_month_num <= 3 THEN v_cycle_months := ARRAY['January', 'February', 'March'];
        WHEN v_month_num <= 6 THEN v_cycle_months := ARRAY['April', 'May', 'June'];
        WHEN v_month_num <= 9 THEN v_cycle_months := ARRAY['July', 'August', 'September'];
        ELSE v_cycle_months := ARRAY['October', 'November', 'December'];
      END CASE;
    WHEN 'Half-Yearly' THEN
      IF v_month_num <= 6 THEN
        v_cycle_months := ARRAY['January', 'February', 'March', 'April', 'May', 'June'];
      ELSE
        v_cycle_months := ARRAY['July', 'August', 'September', 'October', 'November', 'December'];
      END IF;
    WHEN 'Yearly' THEN
      v_cycle_months := v_months;
    ELSE
      v_cycle_months := ARRAY[p_month];
  END CASE;

  RETURN v_cycle_months;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;


-- =============================================================
-- FIX 2: Update percolate_multimonth_score to pass frequency_cycle_start
-- =============================================================
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

  v_performer := auth.uid();

  -- CRITICAL FIX: Pass frequency_cycle_start for cycle-aware resolution
  v_cycle_months := get_cycle_months(NEW.frequency, NEW.review_period, NEW.review_year, NEW.frequency_cycle_start);

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


-- =============================================================
-- FIX 3: Update enforce_frequency_lock to read per-KPI cycle start
-- =============================================================
CREATE OR REPLACE FUNCTION public.enforce_frequency_lock_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  locked_config jsonb;
  month_num int;
  is_admin boolean;
  v_cycle_end date;
  v_months text[] := ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'];
  v_cycle_start text;
  v_cs_start_month text;
  v_cs_start_idx int;
  v_cycle_length int;
  v_offset int;
  v_cycle_pos int;  -- position within cycle (0-based)
  v_terminal_month_idx int;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

  BEGIN
    IF current_setting('app.percolation_bypass', true) = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT public.has_role(auth.uid(), 'admin'::public.app_role) INTO is_admin;
  IF is_admin THEN RETURN NEW; END IF;

  IF NEW.frequency NOT IN ('Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly') THEN
    RETURN NEW;
  END IF;

  BEGIN
    month_num := array_position(v_months, NEW.review_period);
    IF month_num IS NULL THEN
      month_num := EXTRACT(MONTH FROM TO_DATE(NEW.review_period || ' 1 2000', 'Month DD YYYY'))::int;
    END IF;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;

  -- Read per-KPI cycle start override
  v_cycle_start := NEW.frequency_cycle_start;

  -- If per-KPI override exists, use dynamic cycle-aware locking
  IF v_cycle_start IS NOT NULL AND v_cycle_start != '' THEN
    v_cs_start_month := CASE SPLIT_PART(v_cycle_start, '-', 1)
      WHEN 'Jan' THEN 'January' WHEN 'Feb' THEN 'February' WHEN 'Mar' THEN 'March'
      WHEN 'Apr' THEN 'April' WHEN 'May' THEN 'May' WHEN 'Jun' THEN 'June'
      WHEN 'Jul' THEN 'July' WHEN 'Aug' THEN 'August' WHEN 'Sep' THEN 'September'
      WHEN 'Oct' THEN 'October' WHEN 'Nov' THEN 'November' WHEN 'Dec' THEN 'December'
      ELSE NULL
    END;

    IF v_cs_start_month IS NOT NULL THEN
      v_cs_start_idx := array_position(v_months, v_cs_start_month);  -- 1-based

      v_cycle_length := CASE NEW.frequency
        WHEN 'Bi-Monthly' THEN 2
        WHEN 'Quarterly' THEN 3
        WHEN 'Half-Yearly' THEN 6
        WHEN 'Yearly' THEN 12
        ELSE 1
      END;

      -- Position within cycle: 0-based
      v_offset := ((month_num - v_cs_start_idx) % 12 + 12) % 12;
      v_cycle_pos := v_offset % v_cycle_length;

      -- Terminal month is the LAST in the cycle (position = cycle_length - 1)
      -- If this is NOT the terminal month, block all transitions
      IF v_cycle_pos != (v_cycle_length - 1) THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
          RAISE EXCEPTION 'Submission not allowed: % KPI cannot be reviewed for %. Only the terminal month of the cycle is reviewable.',
            NEW.frequency, NEW.review_period;
        END IF;
      END IF;

      -- For terminal month, block kra_set→self_review if cycle hasn't ended
      IF TG_OP = 'UPDATE' AND OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
        v_cycle_end := (make_date(NEW.review_year, month_num, 1) + interval '1 month' - interval '1 day')::date;
        IF CURRENT_DATE <= v_cycle_end THEN
          RAISE EXCEPTION 'Cycle not yet complete: % KPI for % % can only be reviewed after %. Please wait until the cycle ends.',
            NEW.frequency, NEW.review_period, NEW.review_year, v_cycle_end;
        END IF;
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  -- Fallback: use frequency_config table (original behavior)
  SELECT locked_months INTO locked_config
  FROM public.frequency_config WHERE frequency = NEW.frequency LIMIT 1;

  IF locked_config IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(locked_config) AS e(key, val)
    WHERE jsonb_typeof(val) = 'array' AND val @> to_jsonb(month_num)
  ) THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      RAISE EXCEPTION 'Submission not allowed: % KPI cannot be reviewed for %. Only the terminal month of the cycle is reviewable.',
        NEW.frequency, NEW.review_period;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    v_cycle_end := (make_date(NEW.review_year, month_num, 1) + interval '1 month' - interval '1 day')::date;
    IF CURRENT_DATE <= v_cycle_end THEN
      RAISE EXCEPTION 'Cycle not yet complete: % KPI for % % can only be reviewed after %. Please wait until the cycle ends.',
        NEW.frequency, NEW.review_period, NEW.review_year, v_cycle_end;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
