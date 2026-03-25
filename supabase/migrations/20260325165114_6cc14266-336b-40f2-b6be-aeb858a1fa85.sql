
CREATE OR REPLACE FUNCTION public.reconcile_workflow_statuses(
  p_dry_run BOOLEAN DEFAULT true,
  p_review_period TEXT DEFAULT NULL,
  p_review_year INT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical_order TEXT[] := ARRAY[
    'kra_set', 'self_review', 'manager_check', 'skip_level_check',
    'hr_pms_review', 'audit', 'admin_review', 'management_review'
  ];
  v_kpi RECORD;
  v_workflow_stages TEXT[];
  v_kpi_canonical_idx INT;
  v_best_score NUMERIC;
  v_best_rating TEXT;
  v_reconciled JSONB[] := ARRAY[]::JSONB[];
  v_count INT := 0;
  v_stage_idx INT;
  v_new_status TEXT;
  v_next_valid_stage TEXT;
  v_next_valid_idx INT;
  v_prev_stage TEXT;
  v_reason TEXT;
  v_terminal_stage TEXT;
  v_terminal_score_col TEXT;
  v_has_terminal_score BOOLEAN;
  v_non_approved_stages TEXT[];
  v_has_auditor_score BOOLEAN;
  v_has_hr_pms_score BOOLEAN;
  v_has_management_score BOOLEAN;
  v_has_skip_level_score BOOLEAN;
  v_has_manager_score BOOLEAN;
  v_correct_stage TEXT;
  v_has_current_stage_score BOOLEAN;
  v_current_stage_pos INT;
  v_next_stage TEXT;
BEGIN
  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.status::text AS current_status,
           k.kpi_name, k.kra_name, k.review_period, k.review_year,
           p.full_name AS employee_name, p.employee_code
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    WHERE k.status != 'approved'
      AND k.status != 'kra_set'
      AND (p_review_period IS NULL OR k.review_period = p_review_period)
      AND (p_review_year IS NULL OR k.review_year = p_review_year)
  LOOP
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(
        get_employee_workflow(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year)
      )
    ) INTO v_workflow_stages;

    IF v_workflow_stages IS NULL OR array_length(v_workflow_stages, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_reason := NULL;
    v_new_status := NULL;

    IF NOT (v_kpi.current_status = ANY(v_workflow_stages)) THEN
      v_kpi_canonical_idx := array_position(v_canonical_order, v_kpi.current_status);
      IF v_kpi_canonical_idx IS NULL THEN
        CONTINUE;
      END IF;

      v_next_valid_stage := NULL;
      v_next_valid_idx := NULL;
      FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
        IF v_workflow_stages[i] != 'approved' THEN
          v_stage_idx := array_position(v_canonical_order, v_workflow_stages[i]);
          IF v_stage_idx IS NOT NULL AND v_stage_idx > v_kpi_canonical_idx THEN
            IF v_next_valid_idx IS NULL OR v_stage_idx < v_next_valid_idx THEN
              v_next_valid_idx := v_stage_idx;
              v_next_valid_stage := v_workflow_stages[i];
            END IF;
          END IF;
        END IF;
      END LOOP;

      IF v_next_valid_stage IS NOT NULL THEN
        v_prev_stage := NULL;
        FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
          IF v_workflow_stages[i] = v_next_valid_stage THEN
            IF i > 1 THEN
              v_prev_stage := v_workflow_stages[i - 1];
            END IF;
            EXIT;
          END IF;
        END LOOP;
        v_new_status := COALESCE(v_prev_stage, v_next_valid_stage);
      ELSE
        v_new_status := 'approved';
      END IF;
      v_reason := 'missing_stage_orphan';

    ELSIF v_kpi.current_status = ANY(v_workflow_stages) THEN
      v_non_approved_stages := ARRAY[]::TEXT[];
      FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
        IF v_workflow_stages[i] != 'approved' THEN
          v_non_approved_stages := array_append(v_non_approved_stages, v_workflow_stages[i]);
        END IF;
      END LOOP;

      IF array_length(v_non_approved_stages, 1) > 0 
         AND v_kpi.current_status = v_non_approved_stages[array_length(v_non_approved_stages, 1)] THEN
        
        v_has_terminal_score := false;
        SELECT CASE v_kpi.current_status
          WHEN 'self_review' THEN (rs.self_score IS NOT NULL)
          WHEN 'manager_check' THEN (rs.manager_score IS NOT NULL)
          WHEN 'skip_level_check' THEN (rs.skip_level_score IS NOT NULL)
          WHEN 'hr_pms_review' THEN (rs.hr_pms_score IS NOT NULL)
          WHEN 'audit' THEN (rs.auditor_score IS NOT NULL)
          WHEN 'management_review' THEN (rs.management_score IS NOT NULL)
          ELSE false
        END INTO v_has_terminal_score
        FROM review_submissions rs
        WHERE rs.kpi_id = v_kpi.kpi_id
        ORDER BY rs.updated_at DESC
        LIMIT 1;

        v_has_terminal_score := COALESCE(v_has_terminal_score, false);

        IF v_has_terminal_score THEN
          v_new_status := 'approved';
          v_reason := 'terminal_stage_completed';
        ELSE
          FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
            IF v_workflow_stages[i] = v_kpi.current_status THEN
              IF i > 1 THEN
                v_new_status := v_workflow_stages[i - 1];
                v_reason := 'terminal_stage_unreviewed';
              END IF;
              EXIT;
            END IF;
          END LOOP;
        END IF;

      ELSE
        SELECT
          COALESCE(rs.auditor_score IS NOT NULL, false),
          COALESCE(rs.hr_pms_score IS NOT NULL, false),
          COALESCE(rs.management_score IS NOT NULL, false),
          COALESCE(rs.skip_level_score IS NOT NULL, false),
          COALESCE(rs.manager_score IS NOT NULL, false)
        INTO v_has_auditor_score, v_has_hr_pms_score, v_has_management_score, v_has_skip_level_score, v_has_manager_score
        FROM review_submissions rs
        WHERE rs.kpi_id = v_kpi.kpi_id
        ORDER BY rs.updated_at DESC
        LIMIT 1;

        v_correct_stage := NULL;
        v_kpi_canonical_idx := array_position(v_canonical_order, v_kpi.current_status);

        IF v_has_management_score AND 'management_review' = ANY(v_workflow_stages)
           AND array_position(v_canonical_order, 'management_review') > v_kpi_canonical_idx THEN
          v_correct_stage := 'management_review';
        ELSIF v_has_auditor_score AND 'audit' = ANY(v_workflow_stages)
           AND array_position(v_canonical_order, 'audit') > v_kpi_canonical_idx THEN
          v_correct_stage := 'audit';
        ELSIF v_has_hr_pms_score AND 'hr_pms_review' = ANY(v_workflow_stages)
           AND array_position(v_canonical_order, 'hr_pms_review') > v_kpi_canonical_idx THEN
          v_correct_stage := 'hr_pms_review';
        ELSIF v_has_skip_level_score AND 'skip_level_check' = ANY(v_workflow_stages)
           AND array_position(v_canonical_order, 'skip_level_check') > v_kpi_canonical_idx THEN
          v_correct_stage := 'skip_level_check';
        ELSIF v_has_manager_score AND 'manager_check' = ANY(v_workflow_stages)
           AND array_position(v_canonical_order, 'manager_check') > v_kpi_canonical_idx THEN
          v_correct_stage := 'manager_check';
        END IF;

        IF v_correct_stage IS NOT NULL THEN
          v_new_status := v_correct_stage;
          v_reason := 'review_stage_mismatch';
        ELSE
          -- CLASS 4: Current stage has score but KPI was not forwarded
          v_has_current_stage_score := false;
          SELECT CASE v_kpi.current_status
            WHEN 'self_review' THEN (rs.self_score IS NOT NULL)
            WHEN 'manager_check' THEN (rs.manager_score IS NOT NULL)
            WHEN 'skip_level_check' THEN (rs.skip_level_score IS NOT NULL)
            WHEN 'hr_pms_review' THEN (rs.hr_pms_score IS NOT NULL)
            WHEN 'audit' THEN (rs.auditor_score IS NOT NULL)
            WHEN 'management_review' THEN (rs.management_score IS NOT NULL)
            ELSE false
          END INTO v_has_current_stage_score
          FROM review_submissions rs
          WHERE rs.kpi_id = v_kpi.kpi_id
          ORDER BY rs.updated_at DESC
          LIMIT 1;

          v_has_current_stage_score := COALESCE(v_has_current_stage_score, false);

          IF v_has_current_stage_score THEN
            v_current_stage_pos := NULL;
            v_next_stage := NULL;
            FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
              IF v_workflow_stages[i] = v_kpi.current_status THEN
                v_current_stage_pos := i;
              ELSIF v_current_stage_pos IS NOT NULL AND v_next_stage IS NULL THEN
                v_next_stage := v_workflow_stages[i];
              END IF;
            END LOOP;

            IF v_next_stage IS NOT NULL THEN
              IF v_next_stage = 'approved' THEN
                v_new_status := 'approved';
              ELSE
                v_new_status := v_next_stage;
              END IF;
              v_reason := 'current_stage_scored_not_forwarded';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_new_status IS NULL THEN
      CONTINUE;
    END IF;

    v_count := v_count + 1;
    v_reconciled := array_append(v_reconciled, jsonb_build_object(
      'kpi_id', v_kpi.kpi_id,
      'employee_name', v_kpi.employee_name,
      'employee_id', v_kpi.employee_id,
      'kpi_name', v_kpi.kpi_name,
      'kra_name', v_kpi.kra_name,
      'old_status', v_kpi.current_status,
      'new_status', v_new_status,
      'reason', v_reason,
      'review_period', v_kpi.review_period,
      'review_year', v_kpi.review_year
    ));

    IF NOT p_dry_run THEN
      IF v_new_status = 'approved' THEN
        SELECT
          COALESCE(rs.final_score, rs.management_score, rs.auditor_score,
                   rs.hr_pms_score, rs.skip_level_score, rs.manager_score, rs.self_score, 0),
          COALESCE(rs.final_rating::text, rs.management_rating::text, rs.auditor_rating::text,
                   rs.hr_pms_rating::text, rs.skip_level_rating::text, rs.manager_rating::text,
                   rs.self_rating::text)
        INTO v_best_score, v_best_rating
        FROM review_submissions rs
        WHERE rs.kpi_id = v_kpi.kpi_id
        ORDER BY rs.updated_at DESC
        LIMIT 1;

        UPDATE kpis SET status = 'approved'::review_status, updated_at = now()
        WHERE id = v_kpi.kpi_id;

        IF v_best_score IS NOT NULL THEN
          UPDATE review_submissions
          SET final_score = v_best_score,
              final_rating = v_best_rating::rating_level,
              kpi_status = 'locked',
              updated_at = now()
          WHERE kpi_id = v_kpi.kpi_id;
        END IF;
      ELSE
        UPDATE kpis SET status = v_new_status::review_status, updated_at = now()
        WHERE id = v_kpi.kpi_id;
      END IF;

      INSERT INTO kpi_audit_logs (
        kpi_id, performed_by, action, old_value, new_value, metadata
      ) VALUES (
        v_kpi.kpi_id,
        COALESCE(p_performed_by, auth.uid()),
        'WORKFLOW_RECONCILED',
        jsonb_build_object('status', v_kpi.current_status),
        jsonb_build_object('status', v_new_status, 'final_score', v_best_score, 'final_rating', v_best_rating),
        jsonb_build_object(
          'reason', v_reason,
          'next_valid_stage', v_next_valid_stage,
          'review_period', v_kpi.review_period,
          'review_year', v_kpi.review_year
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'count', v_count,
    'dry_run', p_dry_run,
    'affected', to_jsonb(v_reconciled)
  );
END;
$$;
