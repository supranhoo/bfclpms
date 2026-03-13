
-- Add period columns to workflow_config
ALTER TABLE workflow_config
  ADD COLUMN review_period TEXT,
  ADD COLUMN review_year INT;

-- Drop existing unique constraint
ALTER TABLE workflow_config DROP CONSTRAINT workflow_config_config_type_config_value_key;

-- Create partial unique index for global configs (review_period IS NULL)
CREATE UNIQUE INDEX workflow_config_global_unique 
  ON workflow_config (config_type, config_value) 
  WHERE review_period IS NULL;

-- Create partial unique index for period-specific configs
CREATE UNIQUE INDEX workflow_config_period_unique 
  ON workflow_config (config_type, config_value, review_period, review_year) 
  WHERE review_period IS NOT NULL;

-- Update get_employee_workflow with optional period params
CREATE OR REPLACE FUNCTION public.get_employee_workflow(
  employee_uuid uuid,
  p_review_period TEXT DEFAULT NULL,
  p_review_year INT DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  emp_dept_id UUID;
  emp_pms_grade TEXT;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Period-specific lookups (only when period params are provided)
  IF p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
    -- Priority 1: Period-specific employee config
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
      AND wc.review_period = p_review_period AND wc.review_year = p_review_year
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
    
    -- Priority 2: Period-specific department config
    IF emp_dept_id IS NOT NULL THEN
      SELECT wt.stages INTO result
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
    
    -- Priority 3: Period-specific PMS grade config
    IF emp_pms_grade IS NOT NULL THEN
      SELECT wt.stages INTO result
      FROM workflow_config wc
      JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
      WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
        AND wc.review_period = p_review_period AND wc.review_year = p_review_year
        AND wt.is_active = true;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
  END IF;
  
  -- Global fallback: Priority 4: Employee-specific config
  SELECT wt.stages INTO result
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wc.review_period IS NULL
    AND wt.is_active = true;
  IF result IS NOT NULL THEN RETURN result; END IF;
  
  -- Priority 5: Global department config
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wc.review_period IS NULL
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Priority 6: Global PMS grade config
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
      AND wc.review_period IS NULL
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Priority 7: Default template
  SELECT stages INTO result FROM workflow_templates WHERE is_default = true AND is_active = true LIMIT 1;
  RETURN COALESCE(result, '["kra_set", "self_review", "manager_check", "audit", "management_review", "approved"]'::JSONB);
END;
$function$;

-- Update get_employee_workflow_info with optional period params
CREATE OR REPLACE FUNCTION public.get_employee_workflow_info(
  employee_uuid uuid,
  p_review_period TEXT DEFAULT NULL,
  p_review_year INT DEFAULT NULL
)
 RETURNS TABLE(template_id uuid, template_name text, display_name text, stages jsonb, config_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_dept_id UUID;
  emp_pms_grade TEXT;
  found_config RECORD;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Period-specific lookups
  IF p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
    -- Period employee
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
    
    -- Period department
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
    END IF;
    
    -- Period PMS grade
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
    END IF;
  END IF;
  
  -- Global employee
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
  INTO found_config
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wc.review_period IS NULL
    AND wt.is_active = true;
  IF found_config IS NOT NULL THEN
    RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
    RETURN;
  END IF;
  
  -- Global department
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'department'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wc.review_period IS NULL
      AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  -- Global PMS grade
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'pms_grade'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
      AND wc.review_period IS NULL
      AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  -- Default
  RETURN QUERY 
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'default'::TEXT as source
  FROM workflow_templates wt 
  WHERE wt.is_default = true AND wt.is_active = true
  LIMIT 1;
END;
$function$;

-- Update get_bulk_employee_workflows with optional period params
CREATE OR REPLACE FUNCTION public.get_bulk_employee_workflows(
  employee_ids uuid[],
  p_review_period TEXT DEFAULT NULL,
  p_review_year INT DEFAULT NULL
)
 RETURNS TABLE(employee_id uuid, stages text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id AS employee_id,
    COALESCE(
      -- Period-specific lookups (only when period params provided)
      CASE WHEN p_review_period IS NOT NULL AND p_review_year IS NOT NULL THEN
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
         JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
         WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text 
           AND wc.review_period = p_review_period AND wc.review_year = p_review_year
           AND wt.is_active = true
         LIMIT 1)
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
        (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
         JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
         WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade
           AND wc.review_period = p_review_period AND wc.review_year = p_review_year
           AND wt.is_active = true
         LIMIT 1)
      END,
      -- Global fallbacks
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text 
         AND wc.review_period IS NULL
         AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'department' AND wc.config_value = e.department_id::text
         AND wc.review_period IS NULL
         AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade
         AND wc.review_period IS NULL
         AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt WHERE wt.is_default = true AND wt.is_active = true LIMIT 1),
      ARRAY['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
    ) AS stages
  FROM unnest(employee_ids) AS eid(id)
  JOIN profiles e ON e.id = eid.id;
END;
$function$;
