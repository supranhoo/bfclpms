
-- ============================================================
-- Part 1: Step back 39 affected KPIs (approved under old workflow,
-- but new workflow requires audit stage they never went through)
-- ============================================================

-- Step back KPIs: set status to manager_check (stage before audit)
-- Clear final_score/final_rating since approval is revoked
WITH affected_kpis AS (
  SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year,
         p.full_name AS employee_name, p.employee_code
  FROM kpis k
  JOIN profiles p ON p.id = k.employee_id
  WHERE k.status = 'approved'
    AND k.review_year = 2026
    AND k.review_period = 'March'
    AND k.employee_id IN (
      SELECT DISTINCT wc.config_value::uuid
      FROM workflow_config wc
      JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
      WHERE wc.config_type = 'employee'
        AND wt.stages::jsonb @> '"audit"'::jsonb
        AND wc.config_value::uuid IN (
          SELECT k2.employee_id FROM kpis k2
          WHERE k2.status = 'approved'
            AND k2.review_year = 2026
            AND k2.review_period = 'March'
        )
    )
),
stepped_back AS (
  UPDATE kpis
  SET status = 'manager_check'
  FROM affected_kpis ak
  WHERE kpis.id = ak.kpi_id
  RETURNING kpis.id, ak.employee_name, ak.employee_code
),
scores_cleared AS (
  UPDATE review_submissions rs
  SET final_score = NULL, final_rating = NULL
  FROM stepped_back sb
  WHERE rs.kpi_id = sb.id
)
INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
SELECT sb.id, 'WORKFLOW_CHANGE_STEP_BACK', NULL,
  jsonb_build_object('status', 'approved'),
  jsonb_build_object('status', 'manager_check'),
  jsonb_build_object(
    'reason', 'Workflow changed to require audit stage after KPI was approved by HR PMS',
    'tool', 'workflow_change_step_back_migration',
    'employee_name', sb.employee_name,
    'employee_code', sb.employee_code
  )
FROM stepped_back sb;

-- ============================================================
-- Part 2: Create trigger to auto-detect & step back on future
-- workflow changes that add stages beyond old terminal
-- ============================================================

CREATE OR REPLACE FUNCTION public.workflow_change_step_back()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
DECLARE
  v_old_template_id UUID;
  v_new_template_id UUID;
  v_old_stages TEXT[];
  v_new_stages TEXT[];
  v_old_terminal TEXT;
  v_new_terminal TEXT;
  v_old_terminal_pos INTEGER;
  v_canonical TEXT[] := ARRAY['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review'];
  v_old_canonical_pos INTEGER;
  v_new_has_beyond BOOLEAN := false;
  v_step_back_to TEXT;
  v_affected_count INTEGER := 0;
  v_kpi RECORD;
  v_employee_ids UUID[];
  v_periods TEXT[];
  v_years INTEGER[];
BEGIN
  -- Only fire when template actually changes
  IF TG_OP = 'UPDATE' AND OLD.workflow_template_id = NEW.workflow_template_id THEN
    RETURN NEW;
  END IF;

  -- For UPDATE, get old template; for INSERT, there's no old template
  IF TG_OP = 'UPDATE' THEN
    v_old_template_id := OLD.workflow_template_id;
  ELSE
    -- INSERT: no old template. We need to check if there's a default/inherited one.
    -- For simplicity, get the system default template
    SELECT id INTO v_old_template_id FROM workflow_templates WHERE is_default = true AND is_active = true LIMIT 1;
  END IF;

  v_new_template_id := NEW.workflow_template_id;

  -- Get old and new stages
  IF v_old_template_id IS NOT NULL THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages::jsonb))
    INTO v_old_stages
    FROM workflow_templates wt WHERE wt.id = v_old_template_id;
  END IF;

  SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages::jsonb))
  INTO v_new_stages
  FROM workflow_templates wt WHERE wt.id = v_new_template_id;

  IF v_old_stages IS NULL OR v_new_stages IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find old terminal (last review stage, excluding 'approved' if present)
  v_old_terminal := NULL;
  FOR i IN REVERSE array_length(v_old_stages, 1)..1 LOOP
    IF v_old_stages[i] != 'approved' AND v_old_stages[i] != 'kra_set' THEN
      v_old_terminal := v_old_stages[i];
      EXIT;
    END IF;
  END LOOP;

  IF v_old_terminal IS NULL THEN RETURN NEW; END IF;

  -- Find old terminal position in canonical order
  v_old_canonical_pos := 0;
  FOR i IN 1..array_length(v_canonical, 1) LOOP
    IF v_canonical[i] = v_old_terminal THEN
      v_old_canonical_pos := i;
      EXIT;
    END IF;
  END LOOP;

  -- Check if new workflow has stages beyond old terminal in canonical order
  v_step_back_to := NULL;
  FOR i IN 1..array_length(v_new_stages, 1) LOOP
    IF v_new_stages[i] = 'approved' OR v_new_stages[i] = 'kra_set' THEN CONTINUE; END IF;
    
    -- Find this stage's canonical position
    FOR j IN 1..array_length(v_canonical, 1) LOOP
      IF v_canonical[j] = v_new_stages[i] AND j > v_old_canonical_pos THEN
        -- This is a new stage beyond old terminal. Step back to stage before it.
        -- Find the stage just before this one in the new workflow
        IF i > 1 THEN
          v_step_back_to := v_new_stages[i - 1];
          IF v_step_back_to = 'kra_set' THEN
            v_step_back_to := 'self_review'; -- Don't step back to kra_set
          END IF;
        END IF;
        v_new_has_beyond := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_new_has_beyond THEN EXIT; END IF;
  END LOOP;

  IF NOT v_new_has_beyond OR v_step_back_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine which employees and periods to check
  IF NEW.config_type = 'employee' THEN
    v_employee_ids := ARRAY[NEW.config_value::uuid];
  ELSIF NEW.config_type = 'department' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE department_id = NEW.config_value::uuid)
    INTO v_employee_ids;
  ELSIF NEW.config_type = 'pms_grade' THEN
    SELECT ARRAY(SELECT id FROM profiles WHERE pms_grade = NEW.config_value)
    INTO v_employee_ids;
  END IF;

  IF v_employee_ids IS NULL OR array_length(v_employee_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Step back approved KPIs for affected employees in the configured period
  FOR v_kpi IN
    SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year,
           p.full_name, p.employee_code
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    WHERE k.employee_id = ANY(v_employee_ids)
      AND k.status = 'approved'
      AND (NEW.review_period IS NULL OR k.review_period = NEW.review_period)
      AND (NEW.review_year IS NULL OR k.review_year = NEW.review_year)
  LOOP
    -- Step back
    UPDATE kpis SET status = v_step_back_to::review_status WHERE id = v_kpi.kpi_id;

    -- Clear final score/rating
    UPDATE review_submissions
    SET final_score = NULL, final_rating = NULL
    WHERE kpi_id = v_kpi.kpi_id;

    -- Audit log
    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_kpi.kpi_id,
      'WORKFLOW_CHANGE_STEP_BACK',
      auth.uid(),
      jsonb_build_object('status', 'approved'),
      jsonb_build_object('status', v_step_back_to),
      jsonb_build_object(
        'reason', 'Workflow template changed: new stages added beyond old terminal reviewer',
        'old_template_id', v_old_template_id,
        'new_template_id', v_new_template_id,
        'old_terminal', v_old_terminal,
        'step_back_to', v_step_back_to,
        'tool', 'trg_workflow_change_step_back'
      )
    );

    v_affected_count := v_affected_count + 1;
  END LOOP;

  RETURN NEW;
END;
$fn$;

-- Create the trigger on workflow_config
DROP TRIGGER IF EXISTS trg_workflow_change_step_back ON workflow_config;
CREATE TRIGGER trg_workflow_change_step_back
  AFTER INSERT OR UPDATE ON workflow_config
  FOR EACH ROW
  EXECUTE FUNCTION workflow_change_step_back();
