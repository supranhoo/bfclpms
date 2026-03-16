
-- Add is_ongoing column to workflow_config
ALTER TABLE public.workflow_config
  ADD COLUMN is_ongoing BOOLEAN NOT NULL DEFAULT false;

-- Helper function to convert month name to sortable integer
CREATE OR REPLACE FUNCTION public.month_name_to_index(p_month TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_month
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
    ELSE 0
  END;
$$;

-- Helper: find ongoing workflow template for a config_type/config_value at or before a given period
CREATE OR REPLACE FUNCTION public.find_ongoing_workflow(
  p_config_type TEXT,
  p_config_value TEXT,
  p_review_period TEXT,
  p_review_year INTEGER
)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wc.workflow_template_id
  FROM workflow_config wc
  JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
  WHERE wc.config_type = p_config_type
    AND wc.config_value = p_config_value
    AND wc.is_ongoing = true
    AND wc.review_period IS NOT NULL
    AND wc.review_year IS NOT NULL
    AND wt.is_active = true
    AND (wc.review_year * 100 + month_name_to_index(wc.review_period))
        <= (p_review_year * 100 + month_name_to_index(p_review_period))
  ORDER BY (wc.review_year * 100 + month_name_to_index(wc.review_period)) DESC
  LIMIT 1;
$$;

-- Update get_employee_workflow to support ongoing configs
CREATE OR REPLACE FUNCTION public.get_employee_workflow(
  employee_uuid UUID,
  p_review_period TEXT DEFAULT NULL,
  p_review_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  emp_dept_id UUID;
  emp_pms_grade TEXT;
  v_ongoing_template_id UUID;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  IF p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
    -- Priority 1: Period-specific employee config (exact match)
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
      AND wc.review_period = p_review_period AND wc.review_year = p_review_year
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;

    -- Priority 1b: Ongoing employee config
    v_ongoing_template_id := find_ongoing_workflow('employee', employee_uuid::TEXT, p_review_period, p_review_year);
    IF v_ongoing_template_id IS NOT NULL THEN
      SELECT wt.stages INTO result FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
    
    -- Priority 2: Period-specific department config (exact match)
    IF emp_dept_id IS NOT NULL THEN
      SELECT wt.stages INTO result
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF result IS NOT NULL THEN RETURN result; END IF;

      v_ongoing_template_id := find_ongoing_workflow('department', emp_dept_id::TEXT, p_review_period, p_review_year);
      IF v_ongoing_template_id IS NOT NULL THEN
        SELECT wt.stages INTO result FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
        IF result IS NOT NULL THEN RETURN result; END IF;
      END IF;
    END IF;
    
    -- Priority 3: Period-specific PMS grade config (exact match)
    IF emp_pms_grade IS NOT NULL THEN
      SELECT wt.stages INTO result
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF result IS NOT NULL THEN RETURN result; END IF;

      v_ongoing_template_id := find_ongoing_workflow('pms_grade', emp_pms_grade, p_review_period, p_review_year);
      IF v_ongoing_template_id IS NOT NULL THEN
        SELECT wt.stages INTO result FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
        IF result IS NOT NULL THEN RETURN result; END IF;
      END IF;
    END IF;
  END IF;
  
  -- Global fallbacks
  SELECT wt.stages INTO result
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wc.review_period IS NULL AND wt.is_active = true;
  IF result IS NOT NULL THEN RETURN result; END IF;
  
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wc.review_period IS NULL AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
      AND wc.review_period IS NULL AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  SELECT stages INTO result FROM workflow_templates WHERE is_default = true AND is_active = true LIMIT 1;
  RETURN COALESCE(result, '["kra_set", "self_review", "manager_check", "audit", "management_review", "approved"]'::JSONB);
END;
$$;

-- Update get_employee_workflow_info to support ongoing configs
CREATE OR REPLACE FUNCTION public.get_employee_workflow_info(
  employee_uuid UUID,
  p_review_period TEXT DEFAULT NULL,
  p_review_year INTEGER DEFAULT NULL
)
RETURNS TABLE(template_id UUID, template_name TEXT, display_name TEXT, stages JSONB, config_source TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_dept_id UUID;
  emp_pms_grade TEXT;
  found_config RECORD;
  v_ongoing_template_id UUID;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  IF p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
      AND wc.review_period = p_review_period AND wc.review_year = p_review_year
      AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;

    v_ongoing_template_id := find_ongoing_workflow('employee', employee_uuid::TEXT, p_review_period, p_review_year);
    IF v_ongoing_template_id IS NOT NULL THEN
      SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
      INTO found_config FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
      IF found_config IS NOT NULL THEN
        RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
        RETURN;
      END IF;
    END IF;
    
    IF emp_dept_id IS NOT NULL THEN
      SELECT wt.id, wt.name, wt.display_name, wt.stages, 'department'::TEXT as source
      INTO found_config
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF found_config IS NOT NULL THEN
        RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
        RETURN;
      END IF;

      v_ongoing_template_id := find_ongoing_workflow('department', emp_dept_id::TEXT, p_review_period, p_review_year);
      IF v_ongoing_template_id IS NOT NULL THEN
        SELECT wt.id, wt.name, wt.display_name, wt.stages, 'department'::TEXT as source
        INTO found_config FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
        IF found_config IS NOT NULL THEN
          RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
          RETURN;
        END IF;
      END IF;
    END IF;
    
    IF emp_pms_grade IS NOT NULL THEN
      SELECT wt.id, wt.name, wt.display_name, wt.stages, 'pms_grade'::TEXT as source
      INTO found_config
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF found_config IS NOT NULL THEN
        RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
        RETURN;
      END IF;

      v_ongoing_template_id := find_ongoing_workflow('pms_grade', emp_pms_grade, p_review_period, p_review_year);
      IF v_ongoing_template_id IS NOT NULL THEN
        SELECT wt.id, wt.name, wt.display_name, wt.stages, 'pms_grade'::TEXT as source
        INTO found_config FROM workflow_templates wt WHERE wt.id = v_ongoing_template_id;
        IF found_config IS NOT NULL THEN
          RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
          RETURN;
        END IF;
      END IF;
    END IF;
  END IF;
  
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
  INTO found_config
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wc.review_period IS NULL AND wt.is_active = true;
  IF found_config IS NOT NULL THEN
    RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
    RETURN;
  END IF;
  
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'department'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wc.review_period IS NULL AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'pms_grade'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
      AND wc.review_period IS NULL AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  RETURN QUERY 
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'default'::TEXT as source
  FROM workflow_templates wt 
  WHERE wt.is_default = true AND wt.is_active = true
  LIMIT 1;
END;
$$;

-- Update get_bulk_employee_workflows to support ongoing configs
CREATE OR REPLACE FUNCTION public.get_bulk_employee_workflows(
  employee_ids UUID[],
  p_review_period TEXT DEFAULT NULL,
  p_review_year INTEGER DEFAULT NULL
)
RETURNS TABLE(employee_id UUID, stages TEXT[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id AS employee_id,
    COALESCE(
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
         JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
         WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text 
           AND wc.review_period = p_review_period AND wc.review_year = p_review_year
           AND wt.is_active = true
         LIMIT 1)
      END,
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt
         WHERE wt.id = find_ongoing_workflow('employee', e.id::text, p_review_period, p_review_year))
      END,
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
         JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
         WHERE wc.config_type = 'department' AND wc.config_value = e.department_id::text
           AND wc.review_period = p_review_period AND wc.review_year = p_review_year
           AND wt.is_active = true
         LIMIT 1)
      END,
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt
         WHERE wt.id = find_ongoing_workflow('department', e.department_id::text, p_review_period, p_review_year))
      END,
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
         JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
         WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade
           AND wc.review_period = p_review_period AND wc.review_year = p_review_year
           AND wt.is_active = true
         LIMIT 1)
      END,
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt
         WHERE wt.id = find_ongoing_workflow('pms_grade', e.pms_grade, p_review_period, p_review_year))
      END,
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text 
         AND wc.review_period IS NULL AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'department' AND wc.config_value = e.department_id::text
         AND wc.review_period IS NULL AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade
         AND wc.review_period IS NULL AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt WHERE wt.is_default = true AND wt.is_active = true LIMIT 1),
      ARRAY['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
    ) AS stages
  FROM unnest(employee_ids) AS eid(id)
  JOIN profiles e ON e.id = eid.id;
END;
$$;
