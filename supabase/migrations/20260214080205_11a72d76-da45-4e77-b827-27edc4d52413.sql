
-- Batch function to get workflow stages for multiple employees at once
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
      -- Priority 1: Employee-level config
      (SELECT wt.stages FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'employee' AND wc.config_value = e.id::text
       LIMIT 1),
      -- Priority 2: Department-level config
      (SELECT wt.stages FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'department' AND wc.config_value = e.department_id::text
       LIMIT 1),
      -- Priority 3: PMS Grade-level config
      (SELECT wt.stages FROM workflow_config wc 
       JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
       WHERE wc.config_type = 'pms_grade' AND wc.config_value = e.pms_grade
       LIMIT 1),
      -- Priority 4: Default template
      (SELECT wt.stages FROM workflow_templates wt WHERE wt.is_default = true LIMIT 1),
      -- Fallback
      ARRAY['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
    ) AS stages
  FROM unnest(employee_ids) AS eid(id)
  JOIN profiles e ON e.id = eid.id;
END;
$$;
