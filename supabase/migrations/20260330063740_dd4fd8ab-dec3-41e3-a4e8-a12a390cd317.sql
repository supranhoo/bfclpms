
-- CAPA: Drop ALL known historical overloads of reconcile_workflow_statuses
-- Overload #1 (rogue): p_dry_run first
DROP FUNCTION IF EXISTS public.reconcile_workflow_statuses(boolean, text, integer, uuid[], uuid);
-- Overload #2 (canonical): p_review_period first
DROP FUNCTION IF EXISTS public.reconcile_workflow_statuses(text, integer, boolean, uuid, uuid[]);

-- Recreate single canonical function
-- CANONICAL SIGNATURE: (p_review_period text, p_review_year integer, p_dry_run boolean, p_performed_by uuid, p_kpi_ids uuid[])
-- All future migrations MUST drop ALL known historical signatures before recreating.
CREATE OR REPLACE FUNCTION public.reconcile_workflow_statuses(
  p_review_period text DEFAULT NULL,
  p_review_year integer DEFAULT NULL,
  p_dry_run boolean DEFAULT true,
  p_performed_by uuid DEFAULT NULL,
  p_kpi_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kpi RECORD;
  v_workflow RECORD;
  v_stages JSONB;
  v_stage_keys TEXT[];
  v_current_idx INTEGER;
  v_next_status TEXT;
  v_reason TEXT;
  v_affected JSONB := '[]'::jsonb;
  v_count INTEGER := 0;
  v_score_field TEXT;
  v_has_score BOOLEAN;
  v_terminal_stage TEXT;
  v_next_reviewer_exists BOOLEAN;
  v_stage_key TEXT;
  v_performer UUID;
  v_has_recent_rollback BOOLEAN;
BEGIN
  v_performer := COALESCE(p_performed_by, auth.uid());

  FOR v_kpi IN
    SELECT
      k.id AS kpi_id,
      k.status::text AS current_status,
      k.employee_id,
      k.kpi_name,
      k.kra_name,
      k.review_period,
      k.review_year,
      p.full_name AS employee_name,
      p.employee_code
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    WHERE k.status != 'approved'
      AND (p_review_period IS NULL OR k.review_period = p_review_period)
      AND (p_review_year IS NULL OR k.review_year = p_review_year)
      AND (p_kpi_ids IS NULL OR k.id = ANY(p_kpi_ids))
    ORDER BY p.full_name, k.kra_name
  LOOP
    v_next_status := NULL;
    v_reason := NULL;

    SELECT wf.stages INTO v_stages
    FROM get_employee_workflow_info(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year) wf
    LIMIT 1;

    IF v_stages IS NULL THEN CONTINUE; END IF;

    SELECT ARRAY(
      SELECT jsonb_array_elements_text(v_stages)
    ) INTO v_stage_keys;

    IF v_stage_keys IS NULL OR array_length(v_stage_keys, 1) = 0 THEN CONTINUE; END IF;

    v_current_idx := NULL;
    FOR i IN 1..array_length(v_stage_keys, 1) LOOP
      IF v_stage_keys[i] = v_kpi.current_status THEN
        v_current_idx := i;
        EXIT;
      END IF;
    END LOOP;

    -- BRANCH 1: Orphaned status (not in workflow)
    IF v_current_idx IS NULL THEN
      DECLARE
        v_canonical TEXT[] := ARRAY['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review'];
        v_orphan_pos INTEGER := 0;
        v_candidate TEXT;
        v_found BOOLEAN := false;
      BEGIN
        FOR i IN 1..array_length(v_canonical, 1) LOOP
          IF v_canonical[i] = v_kpi.current_status THEN
            v_orphan_pos := i;
            EXIT;
          END IF;
        END LOOP;

        IF v_orphan_pos > 0 THEN
          FOR i IN (v_orphan_pos + 1)..array_length(v_canonical, 1) LOOP
            v_candidate := v_canonical[i];
            IF v_candidate = ANY(v_stage_keys) THEN
              v_next_status := v_candidate;
              v_found := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF NOT v_found THEN
          v_next_status := 'approved';
        END IF;
        v_reason := 'missing_stage_orphan';
      END;
    ELSE
      -- BRANCH 2a: Terminal stage with score -> approve
      v_terminal_stage := v_stage_keys[array_length(v_stage_keys, 1)];

      IF v_kpi.current_status = v_terminal_stage THEN
        v_score_field := CASE v_terminal_stage
          WHEN 'self_review' THEN 'self_score'
          WHEN 'manager_check' THEN 'manager_score'
          WHEN 'skip_level_check' THEN 'skip_level_score'
          WHEN 'hr_pms_review' THEN 'hr_pms_score'
          WHEN 'audit' THEN 'auditor_score'
          WHEN 'management_review' THEN 'management_score'
          ELSE NULL
        END;

        IF v_score_field IS NOT NULL THEN
          EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
            v_score_field
          ) INTO v_has_score USING v_kpi.kpi_id;

          IF v_has_score THEN
            v_next_status := 'approved';
            v_reason := 'terminal_stage_completed';
          END IF;
        END IF;
      END IF;

      -- BRANCH 2b: Scored at current stage but not forwarded
      IF v_next_status IS NULL AND v_current_idx < array_length(v_stage_keys, 1) THEN
        IF v_kpi.current_status IN ('self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit') THEN
          v_next_reviewer_exists := false;
          FOR j IN (v_current_idx + 1)..array_length(v_stage_keys, 1) LOOP
            v_stage_key := v_stage_keys[j];
            IF v_stage_key IN ('manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review') THEN
              v_next_reviewer_exists := true;
              EXIT;
            END IF;
          END LOOP;

          IF v_next_reviewer_exists THEN
            CONTINUE;
          END IF;
        END IF;

        v_score_field := CASE v_kpi.current_status
          WHEN 'self_review' THEN 'self_score'
          WHEN 'manager_check' THEN 'manager_score'
          WHEN 'skip_level_check' THEN 'skip_level_score'
          WHEN 'hr_pms_review' THEN 'hr_pms_score'
          WHEN 'audit' THEN 'auditor_score'
          WHEN 'management_review' THEN 'management_score'
          ELSE NULL
        END;

        IF v_score_field IS NOT NULL THEN
          EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
            v_score_field
          ) INTO v_has_score USING v_kpi.kpi_id;

          IF v_has_score THEN
            v_next_status := v_stage_keys[v_current_idx + 1];
            v_reason := 'current_stage_scored_not_forwarded';
          END IF;
        END IF;
      END IF;

      -- BRANCH 3: Review-stage mismatch (with rollback-awareness)
      IF v_next_status IS NULL THEN
        DECLARE
          v_check_field TEXT;
          v_mismatch_found BOOLEAN := false;
        BEGIN
          FOR j IN REVERSE array_length(v_stage_keys, 1)..1 LOOP
            IF j <= v_current_idx THEN EXIT; END IF;

            v_check_field := CASE v_stage_keys[j]
              WHEN 'self_review' THEN 'self_score'
              WHEN 'manager_check' THEN 'manager_score'
              WHEN 'skip_level_check' THEN 'skip_level_score'
              WHEN 'hr_pms_review' THEN 'hr_pms_score'
              WHEN 'audit' THEN 'auditor_score'
              WHEN 'management_review' THEN 'management_score'
              ELSE NULL
            END;

            IF v_check_field IS NOT NULL THEN
              EXECUTE format(
                'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
                v_check_field
              ) INTO v_mismatch_found USING v_kpi.kpi_id;

              IF v_mismatch_found THEN
                SELECT EXISTS (
                  SELECT 1 FROM kpi_audit_logs
                  WHERE kpi_id = v_kpi.kpi_id
                    AND action IN ('ROLLBACK_APPROVED', 'STATUS_TRANSITION', 'ADMIN_STATUS_STEP_BACK')
                    AND (new_value->>'status')::text = v_kpi.current_status
                    AND created_at > (
                      SELECT COALESCE(MAX(rs.updated_at), '1970-01-01'::timestamptz)
                      FROM review_submissions rs WHERE rs.kpi_id = v_kpi.kpi_id
                    )
                ) INTO v_has_recent_rollback;

                IF v_has_recent_rollback THEN
                  v_mismatch_found := false;
                  CONTINUE;
                END IF;

                v_next_status := v_stage_keys[j];
                v_reason := 'review_stage_mismatch';
                EXIT;
              END IF;
            END IF;
          END LOOP;
        END;
      END IF;
    END IF;

    -- Record if we found something to fix
    IF v_next_status IS NOT NULL THEN
      v_count := v_count + 1;
      v_affected := v_affected || jsonb_build_object(
        'kpi_id', v_kpi.kpi_id,
        'employee_name', v_kpi.employee_name,
        'employee_id', v_kpi.employee_id,
        'employee_code', v_kpi.employee_code,
        'kpi_name', v_kpi.kpi_name,
        'kra_name', v_kpi.kra_name,
        'old_status', v_kpi.current_status,
        'new_status', v_next_status,
        'reason', v_reason,
        'review_period', v_kpi.review_period,
        'review_year', v_kpi.review_year
      );

      IF NOT p_dry_run THEN
        UPDATE kpis SET status = v_next_status::review_status WHERE id = v_kpi.kpi_id;

        IF v_next_status = 'approved' THEN
          UPDATE review_submissions
          SET final_score = CASE v_terminal_stage
                WHEN 'management_review' THEN management_score
                WHEN 'audit' THEN auditor_score
                WHEN 'hr_pms_review' THEN hr_pms_score
                WHEN 'skip_level_check' THEN skip_level_score
                WHEN 'manager_check' THEN manager_score
                WHEN 'self_review' THEN self_score
                ELSE COALESCE(management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score)
              END,
              final_rating = CASE v_terminal_stage
                WHEN 'management_review' THEN management_rating
                WHEN 'audit' THEN auditor_rating
                WHEN 'hr_pms_review' THEN hr_pms_rating
                WHEN 'skip_level_check' THEN skip_level_rating
                WHEN 'manager_check' THEN manager_rating
                WHEN 'self_review' THEN self_rating
                ELSE COALESCE(management_rating, auditor_rating, hr_pms_rating, skip_level_rating, manager_rating, self_rating)
              END
          WHERE kpi_id = v_kpi.kpi_id;
        END IF;

        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (
          v_kpi.kpi_id,
          'RECONCILE_STATUS',
          v_performer,
          jsonb_build_object('status', v_kpi.current_status),
          jsonb_build_object('status', v_next_status),
          jsonb_build_object('reason', v_reason, 'tool', 'reconcile_workflow_statuses')
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'count', v_count,
    'dry_run', p_dry_run,
    'affected', v_affected
  );
END;
$function$;
