
CREATE OR REPLACE FUNCTION public.reconcile_workflow_statuses(
  p_review_period text DEFAULT NULL::text,
  p_review_year integer DEFAULT NULL::integer,
  p_dry_run boolean DEFAULT true,
  p_performed_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_canonical_order TEXT[] := ARRAY[
    'kra_set', 'self_review', 'manager_check', 'skip_level_check',
    'hr_pms_review', 'audit', 'admin_review', 'management_review'
  ];
  v_kpi RECORD;
  v_workflow_stages TEXT[];
  v_kpi_canonical_idx INT;
  v_terminal_stage TEXT;
  v_terminal_idx INT;
  v_best_score NUMERIC;
  v_best_rating TEXT;
  v_reconciled JSONB[] := ARRAY[]::JSONB[];
  v_count INT := 0;
  v_stage_idx INT;
  v_new_status TEXT;
  v_next_valid_stage TEXT;
  v_next_valid_idx INT;
  v_prev_stage TEXT;
BEGIN
  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.status::text AS current_status,
           k.kpi_name, k.kra_name, k.review_period, k.review_year,
           p.full_name AS employee_name
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

    -- If the status exists in the workflow, it's NOT orphaned
    IF v_kpi.current_status = ANY(v_workflow_stages) THEN
      CONTINUE;
    END IF;

    v_kpi_canonical_idx := array_position(v_canonical_order, v_kpi.current_status);
    IF v_kpi_canonical_idx IS NULL THEN
      CONTINUE;
    END IF;

    -- Find the next valid workflow stage AFTER the KPI's canonical position
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
      -- Move the KPI to the stage BEFORE the next valid stage,
      -- so the next reviewer sees it as pending
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
      -- Past all non-approved stages → move to approved
      v_new_status := 'approved';
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
      'review_period', v_kpi.review_period,
      'review_year', v_kpi.review_year
    ));

    IF NOT p_dry_run THEN
      IF v_new_status = 'approved' THEN
        -- Only sync scores when moving to approved
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

        UPDATE kpis SET status = 'approved', updated_at = now()
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
        -- Move to intermediate stage (not approved)
        UPDATE kpis SET status = v_new_status, updated_at = now()
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
          'reason', 'Orphaned status reconciled after workflow change',
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
$function$;
