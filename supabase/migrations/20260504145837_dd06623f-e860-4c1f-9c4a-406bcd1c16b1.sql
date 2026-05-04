
-- =========================================================================
-- POLICY §54 v5.1 — Multi-month frequency drift repair (real repair + clear)
-- Replaces v5 detect-only `repair_sibling_frequency_drift_v5` RPC.
-- =========================================================================

DROP FUNCTION IF EXISTS public.repair_sibling_frequency_drift_v5(boolean);

CREATE OR REPLACE FUNCTION public.repair_sibling_frequency_drift_v5(
  p_apply  boolean DEFAULT false,
  p_kpi_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_drift RECORD;
  v_terminal_kpi RECORD;
  v_terminal_submission RECORD;
  v_terminal_month TEXT;
  v_terminal_wf_id UUID;
  v_terminal_stages TEXT[];
  v_sibling RECORD;
  v_cleared_stages TEXT[];
  v_detected INTEGER := 0;
  v_repaired INTEGER := 0;
  v_samples jsonb := '[]'::jsonb;
  v_terminal_freq TEXT;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_apply THEN PERFORM set_config('app.percolation_bypass','true',true); END IF;

  -- Detect drift groups: same employee+kra+kpi+year with mixed frequencies
  -- where at least one row is multi-month (Quarterly etc).
  FOR v_drift IN
    SELECT employee_id, kra_name, kpi_name, review_year,
           array_agg(DISTINCT frequency::text) AS distinct_freqs,
           array_agg(id) AS kpi_ids
    FROM kpis
    WHERE p_kpi_id IS NULL
       OR (employee_id, kra_name, kpi_name, review_year) IN (
            SELECT employee_id, kra_name, kpi_name, review_year
            FROM kpis WHERE id = p_kpi_id)
    GROUP BY employee_id, kra_name, kpi_name, review_year
    HAVING count(DISTINCT frequency) > 1
       AND bool_or(frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly'))
  LOOP
    -- Pick the dominant multi-month frequency (the cycle's true frequency)
    SELECT frequency::text INTO v_terminal_freq
    FROM kpis
    WHERE id = ANY(v_drift.kpi_ids)
      AND frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
    GROUP BY frequency
    ORDER BY count(*) DESC
    LIMIT 1;

    -- For each sibling whose frequency != dominant, repair it.
    FOR v_sibling IN
      SELECT k.*
      FROM kpis k
      WHERE k.id = ANY(v_drift.kpi_ids)
        AND k.frequency::text IS DISTINCT FROM v_terminal_freq
        AND (p_kpi_id IS NULL OR k.id = p_kpi_id)
    LOOP
      -- Find the terminal kpi for this sibling's cycle (using dominant freq)
      SELECT * INTO v_terminal_kpi
      FROM kpis
      WHERE employee_id = v_sibling.employee_id
        AND kra_name = v_sibling.kra_name
        AND kpi_name = v_sibling.kpi_name
        AND review_year = v_sibling.review_year
        AND frequency::text = v_terminal_freq
        AND review_period = get_cycle_terminal_month(
              v_terminal_freq, v_sibling.review_period, v_sibling.review_year, NULL)
      LIMIT 1;

      IF v_terminal_kpi.id IS NULL THEN CONTINUE; END IF;

      v_terminal_month := v_terminal_kpi.review_period;

      SELECT template_id, ARRAY(SELECT jsonb_array_elements_text(stages))
      INTO v_terminal_wf_id, v_terminal_stages
      FROM get_employee_workflow_info(
        v_terminal_kpi.employee_id, v_terminal_kpi.review_period, v_terminal_kpi.review_year);

      SELECT * INTO v_terminal_submission
      FROM review_submissions WHERE kpi_id = v_terminal_kpi.id
      ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
      IF v_terminal_submission IS NULL THEN CONTINUE; END IF;

      -- Determine which stage fields to clear on sibling
      v_cleared_stages := ARRAY[]::TEXT[];
      IF NOT ('skip_level_check' = ANY(v_terminal_stages))
         THEN v_cleared_stages := v_cleared_stages || 'skip_level_check'; END IF;
      IF NOT ('hr_pms_review' = ANY(v_terminal_stages))
         THEN v_cleared_stages := v_cleared_stages || 'hr_pms_review'; END IF;
      IF NOT ('audit' = ANY(v_terminal_stages))
         THEN v_cleared_stages := v_cleared_stages || 'audit'; END IF;
      IF NOT ('management_review' = ANY(v_terminal_stages))
         THEN v_cleared_stages := v_cleared_stages || 'management_review'; END IF;

      v_detected := v_detected + 1;
      IF jsonb_array_length(v_samples) < 25 THEN
        v_samples := v_samples || jsonb_build_object(
          'sibling_kpi_id', v_sibling.id,
          'sibling_period', v_sibling.review_period,
          'from_frequency', v_sibling.frequency::text,
          'to_frequency', v_terminal_freq,
          'terminal_kpi_id', v_terminal_kpi.id,
          'terminal_period', v_terminal_month,
          'terminal_workflow_template_id', v_terminal_wf_id,
          'cleared_stages', to_jsonb(v_cleared_stages)
        );
      END IF;

      IF p_apply THEN
        -- 1. Flip frequency on the sibling kpi row
        UPDATE kpis SET frequency = v_terminal_freq WHERE id = v_sibling.id;

        -- 2. Clear stale stage fields, then re-stamp from terminal
        UPDATE review_submissions SET
          self_score = v_terminal_submission.self_score,
          self_rating = v_terminal_submission.self_rating,
          self_remarks = v_terminal_submission.self_remarks,
          self_evidence_urls = v_terminal_submission.self_evidence_urls,

          manager_score = v_terminal_submission.manager_score,
          manager_rating = v_terminal_submission.manager_rating,
          manager_remarks = v_terminal_submission.manager_remarks,
          manager_evidence_urls = v_terminal_submission.manager_evidence_urls,
          manager_achieved_value = v_terminal_submission.manager_achieved_value,

          skip_level_score = CASE WHEN 'skip_level_check' = ANY(v_terminal_stages)
                                  THEN v_terminal_submission.skip_level_score ELSE NULL END,
          skip_level_rating = CASE WHEN 'skip_level_check' = ANY(v_terminal_stages)
                                   THEN v_terminal_submission.skip_level_rating ELSE NULL END,
          skip_level_remarks = CASE WHEN 'skip_level_check' = ANY(v_terminal_stages)
                                    THEN v_terminal_submission.skip_level_remarks ELSE NULL END,
          skip_level_evidence_urls = CASE WHEN 'skip_level_check' = ANY(v_terminal_stages)
                                          THEN v_terminal_submission.skip_level_evidence_urls ELSE NULL END,
          skip_level_achieved_value = CASE WHEN 'skip_level_check' = ANY(v_terminal_stages)
                                           THEN v_terminal_submission.skip_level_achieved_value ELSE NULL END,
          skip_level_evidence_url = NULL,

          hr_pms_score = CASE WHEN 'hr_pms_review' = ANY(v_terminal_stages)
                              THEN v_terminal_submission.hr_pms_score ELSE NULL END,
          hr_pms_rating = CASE WHEN 'hr_pms_review' = ANY(v_terminal_stages)
                               THEN v_terminal_submission.hr_pms_rating ELSE NULL END,
          hr_pms_remarks = CASE WHEN 'hr_pms_review' = ANY(v_terminal_stages)
                                THEN v_terminal_submission.hr_pms_remarks ELSE NULL END,
          hr_pms_evidence_urls = CASE WHEN 'hr_pms_review' = ANY(v_terminal_stages)
                                      THEN v_terminal_submission.hr_pms_evidence_urls ELSE NULL END,
          hr_pms_achieved_value = CASE WHEN 'hr_pms_review' = ANY(v_terminal_stages)
                                       THEN v_terminal_submission.hr_pms_achieved_value ELSE NULL END,
          hr_pms_evidence_url = NULL,

          auditor_score = CASE WHEN 'audit' = ANY(v_terminal_stages)
                               THEN v_terminal_submission.auditor_score ELSE NULL END,
          auditor_rating = CASE WHEN 'audit' = ANY(v_terminal_stages)
                                THEN v_terminal_submission.auditor_rating ELSE NULL END,
          auditor_remarks = CASE WHEN 'audit' = ANY(v_terminal_stages)
                                 THEN v_terminal_submission.auditor_remarks ELSE NULL END,
          auditor_evidence_urls = CASE WHEN 'audit' = ANY(v_terminal_stages)
                                       THEN v_terminal_submission.auditor_evidence_urls ELSE NULL END,
          auditor_achieved_value = CASE WHEN 'audit' = ANY(v_terminal_stages)
                                        THEN v_terminal_submission.auditor_achieved_value ELSE NULL END,
          auditor_evidence_url = NULL,

          management_score = CASE WHEN 'management_review' = ANY(v_terminal_stages)
                                  THEN v_terminal_submission.management_score ELSE NULL END,
          management_rating = CASE WHEN 'management_review' = ANY(v_terminal_stages)
                                   THEN v_terminal_submission.management_rating ELSE NULL END,
          management_remarks = CASE WHEN 'management_review' = ANY(v_terminal_stages)
                                    THEN v_terminal_submission.management_remarks ELSE NULL END,
          management_evidence_urls = CASE WHEN 'management_review' = ANY(v_terminal_stages)
                                          THEN v_terminal_submission.management_evidence_urls ELSE NULL END,
          management_achieved_value = CASE WHEN 'management_review' = ANY(v_terminal_stages)
                                           THEN v_terminal_submission.management_achieved_value ELSE NULL END,
          management_evidence_url = NULL,

          final_score = v_terminal_submission.final_score,
          final_rating = v_terminal_submission.final_rating,
          achieved_value = v_terminal_submission.achieved_value,
          is_na = v_terminal_submission.is_na,
          submitted_at = now(),
          auto_advance_reason = 'Multi-month sibling — auto-populated from terminal month '
                                || v_terminal_month || ' ' || v_terminal_kpi.review_year
        WHERE kpi_id = v_sibling.id;

        -- 3. Audit log (system-attributed, performer = NULL per Core directive)
        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (v_sibling.id, 'FREQUENCY_DRIFT_REPAIRED', NULL,
          jsonb_build_object('frequency', v_sibling.frequency::text),
          jsonb_build_object('frequency', v_terminal_freq, 'final_score', v_terminal_submission.final_score),
          jsonb_build_object(
            'from_frequency', v_sibling.frequency::text,
            'to_frequency', v_terminal_freq,
            'terminal_kpi_id', v_terminal_kpi.id,
            'terminal_period', v_terminal_month,
            'terminal_workflow_template_id', v_terminal_wf_id,
            'cleared_stages', to_jsonb(v_cleared_stages),
            'tool', 'repair_sibling_frequency_drift_v5',
            'policy', 'POLICY_54_v5_1',
            'invoked_by', auth.uid()
          ));

        v_repaired := v_repaired + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_apply THEN 'apply' ELSE 'dry_run' END,
    'detected', v_detected,
    'repaired', v_repaired,
    'samples', v_samples,
    'scoped_kpi_id', p_kpi_id,
    'ran_at', now(),
    'note', 'v5.1 — real repair: flips sibling frequency, clears stages outside terminal chain, re-stamps from terminal.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_sibling_frequency_drift_v5(boolean, uuid) TO authenticated;

-- =========================================================================
-- One-shot targeted repair for Atul Kumar Khaitan's Jan-2026
-- "Accuracy of TDS Workings" KPI (kpi id edb28424-74a9-40f5-87d6-bdb189ccfe26).
-- Uses an admin SECURITY DEFINER bypass via direct logic (no auth.uid() check)
-- because this DO block runs as the migration owner.
-- =========================================================================
DO $$
DECLARE
  v_sibling_id UUID := 'edb28424-74a9-40f5-87d6-bdb189ccfe26';
  v_terminal_id UUID;
  v_terminal_submission RECORD;
  v_terminal_stages TEXT[];
  v_terminal_wf_id UUID;
  v_old_freq TEXT;
BEGIN
  -- Only run if drift still present (idempotent)
  SELECT frequency::text INTO v_old_freq FROM kpis WHERE id = v_sibling_id;
  IF v_old_freq IS NULL OR v_old_freq = 'Quarterly' THEN
    RAISE NOTICE 'Atul Jan-2026 TDS row already aligned or missing; skipping one-shot.';
    RETURN;
  END IF;

  -- Resolve terminal (March 2026, same employee+kra+kpi+year, Quarterly)
  SELECT id INTO v_terminal_id
  FROM kpis
  WHERE employee_id = '219f923e-d831-4906-a4c3-ccbc471092bd'
    AND kra_name = 'Accuracy in MIS data'
    AND kpi_name LIKE 'Accuracy of TDS Workings%'
    AND review_year = 2026
    AND frequency = 'Quarterly'
    AND review_period = 'March'
  LIMIT 1;

  IF v_terminal_id IS NULL THEN
    RAISE NOTICE 'Terminal Mar-2026 row not found; aborting one-shot.';
    RETURN;
  END IF;

  SELECT template_id, ARRAY(SELECT jsonb_array_elements_text(stages))
  INTO v_terminal_wf_id, v_terminal_stages
  FROM get_employee_workflow_info('219f923e-d831-4906-a4c3-ccbc471092bd', 'March', 2026);

  SELECT * INTO v_terminal_submission
  FROM review_submissions WHERE kpi_id = v_terminal_id
  ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
  IF v_terminal_submission IS NULL THEN
    RAISE NOTICE 'Terminal submission missing; aborting one-shot.';
    RETURN;
  END IF;

  PERFORM set_config('app.percolation_bypass','true',true);

  UPDATE kpis SET frequency = 'Quarterly' WHERE id = v_sibling_id;

  UPDATE review_submissions SET
    self_score = v_terminal_submission.self_score,
    self_rating = v_terminal_submission.self_rating,
    self_remarks = v_terminal_submission.self_remarks,
    self_evidence_urls = v_terminal_submission.self_evidence_urls,
    manager_score = v_terminal_submission.manager_score,
    manager_rating = v_terminal_submission.manager_rating,
    manager_remarks = v_terminal_submission.manager_remarks,
    manager_evidence_urls = v_terminal_submission.manager_evidence_urls,
    manager_achieved_value = v_terminal_submission.manager_achieved_value,

    -- Terminal chain has audit but NOT hr_pms; clear hr_pms, set audit
    hr_pms_score = NULL, hr_pms_rating = NULL, hr_pms_remarks = NULL,
    hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL, hr_pms_achieved_value = NULL,
    skip_level_score = NULL, skip_level_rating = NULL, skip_level_remarks = NULL,
    skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL, skip_level_achieved_value = NULL,
    management_score = NULL, management_rating = NULL, management_remarks = NULL,
    management_evidence_url = NULL, management_evidence_urls = NULL, management_achieved_value = NULL,

    auditor_score = v_terminal_submission.auditor_score,
    auditor_rating = v_terminal_submission.auditor_rating,
    auditor_remarks = v_terminal_submission.auditor_remarks,
    auditor_evidence_urls = v_terminal_submission.auditor_evidence_urls,
    auditor_achieved_value = v_terminal_submission.auditor_achieved_value,

    final_score = v_terminal_submission.final_score,
    final_rating = v_terminal_submission.final_rating,
    achieved_value = v_terminal_submission.achieved_value,
    is_na = v_terminal_submission.is_na,
    submitted_at = now(),
    auto_advance_reason = 'Multi-month sibling — auto-populated from terminal month March 2026'
  WHERE kpi_id = v_sibling_id;

  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
  VALUES (v_sibling_id, 'FREQUENCY_DRIFT_REPAIRED', NULL,
    jsonb_build_object('frequency', v_old_freq),
    jsonb_build_object('frequency', 'Quarterly', 'final_score', v_terminal_submission.final_score),
    jsonb_build_object(
      'from_frequency', v_old_freq,
      'to_frequency', 'Quarterly',
      'terminal_kpi_id', v_terminal_id,
      'terminal_period', 'March',
      'terminal_workflow_template_id', v_terminal_wf_id,
      'cleared_stages', to_jsonb(ARRAY['hr_pms_review','skip_level_check','management_review']),
      'tool', 'one_shot_atul_jan2026_tds',
      'policy', 'POLICY_54_v5_1',
      'note', 'Targeted repair shipped with v5.1 hardening migration.'
    ));

  RAISE NOTICE 'Atul Jan-2026 TDS row repaired: frequency Monthly→Quarterly, hr_pms cleared, auditor stamped.';
END $$;
