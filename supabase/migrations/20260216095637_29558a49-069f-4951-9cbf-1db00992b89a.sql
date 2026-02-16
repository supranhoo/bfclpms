
-- 1. Add is_active column to workflow_templates
ALTER TABLE public.workflow_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Update get_employee_workflow to filter by is_active = true
CREATE OR REPLACE FUNCTION public.get_employee_workflow(employee_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  emp_dept_id UUID;
  emp_pms_grade TEXT;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Priority 1: Employee-specific config
  SELECT wt.stages INTO result
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wt.is_active = true;
  IF result IS NOT NULL THEN RETURN result; END IF;
  
  -- Priority 2: Department config
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Priority 3: PMS Grade config
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
      AND wt.is_active = true;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Default
  SELECT stages INTO result FROM workflow_templates WHERE is_default = true AND is_active = true LIMIT 1;
  RETURN COALESCE(result, '["kra_set", "self_review", "manager_check", "audit", "management_review", "approved"]'::JSONB);
END;
$$;

-- 3. Update get_employee_workflow_info to filter by is_active = true
CREATE OR REPLACE FUNCTION public.get_employee_workflow_info(employee_uuid UUID)
RETURNS TABLE(template_id UUID, template_name TEXT, display_name TEXT, stages JSONB, config_source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_dept_id UUID;
  emp_pms_grade TEXT;
  found_config RECORD;
BEGIN
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Priority 1: Employee-specific config
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
  INTO found_config
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT
    AND wt.is_active = true;
  IF found_config IS NOT NULL THEN
    RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
    RETURN;
  END IF;
  
  -- Priority 2: Department config
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'department'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT
      AND wt.is_active = true;
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  -- Priority 3: PMS Grade config
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.id, wt.name, wt.display_name, wt.stages, 'pms_grade'::TEXT as source
    INTO found_config
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade
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
$$;

-- 4. Update get_bulk_employee_workflows to filter by is_active = true
CREATE OR REPLACE FUNCTION public.get_bulk_employee_workflows(employee_ids UUID[])
RETURNS TABLE(employee_id UUID, stages TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id AS employee_id,
    COALESCE(
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'department' AND wc.config_value = e.department_id::text AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade AND wt.is_active = true
       LIMIT 1),
      (SELECT ARRAY(SELECT jsonb_array_elements_text(wt.stages)) FROM workflow_templates wt WHERE wt.is_default = true AND wt.is_active = true LIMIT 1),
      ARRAY['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
    ) AS stages
  FROM unnest(employee_ids) AS eid(id)
  JOIN profiles e ON e.id = eid.id;
END;
$$;

-- 5. Create helper RPC to check if a template has active (non-approved) KPIs
CREATE OR REPLACE FUNCTION public.check_template_has_active_kpis(template_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM workflow_config wc
    JOIN profiles p ON 
      (wc.config_type = 'employee' AND wc.config_value = p.id::text)
      OR (wc.config_type = 'department' AND wc.config_value = p.department_id::text)
      OR (wc.config_type = 'pms_grade' AND wc.config_value = p.pms_grade)
    JOIN kpis k ON k.employee_id = p.id
    WHERE wc.workflow_template_id = template_uuid
      AND k.status IS NOT NULL
      AND k.status NOT IN ('approved')
    LIMIT 1
  );
END;
$$;
