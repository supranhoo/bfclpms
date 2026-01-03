-- Create workflow_templates table to define available workflow options
CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  stages JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow_templates
CREATE POLICY "Admins can manage workflow_templates"
ON public.workflow_templates FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view workflow_templates"
ON public.workflow_templates FOR SELECT
USING (true);

-- Seed default workflows
INSERT INTO public.workflow_templates (name, display_name, description, stages, is_default) VALUES
  ('full_workflow', 'Full 6-Stage Review', 'Complete review cycle with all stages', '["kra_set", "self_review", "manager_check", "audit", "management_review", "approved"]', true),
  ('skip_audit', 'Skip Audit Review', 'Bypass auditor stage, go directly to management', '["kra_set", "self_review", "manager_check", "management_review", "approved"]', false),
  ('skip_management', 'Skip Management Review', 'Bypass management stage after audit', '["kra_set", "self_review", "manager_check", "audit", "approved"]', false),
  ('manager_only', 'Manager Only Approval', 'Direct approval after manager review', '["kra_set", "self_review", "manager_check", "approved"]', false),
  ('admin_only', 'Admin Only Approval', 'Admin reviews and approves directly', '["kra_set", "self_review", "admin_review", "approved"]', false);

-- Create workflow_config table to store workflow assignments
CREATE TABLE public.workflow_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL CHECK (config_type IN ('employee', 'department', 'pms_grade')),
  config_value TEXT NOT NULL,
  workflow_template_id UUID REFERENCES public.workflow_templates(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(config_type, config_value)
);

-- Enable RLS
ALTER TABLE public.workflow_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow_config
CREATE POLICY "Admins can manage workflow_config"
ON public.workflow_config FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view workflow_config"
ON public.workflow_config FOR SELECT
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_workflow_config_updated_at
  BEFORE UPDATE ON public.workflow_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get employee's effective workflow with priority cascade
CREATE OR REPLACE FUNCTION public.get_employee_workflow(employee_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  emp_dept_id UUID;
  emp_pms_grade TEXT;
BEGIN
  -- Get employee's department and PMS grade
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Priority 1: Employee-specific config
  SELECT wt.stages INTO result
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT;
  
  IF result IS NOT NULL THEN RETURN result; END IF;
  
  -- Priority 2: Department config
  IF emp_dept_id IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT;
    
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Priority 3: PMS Grade config
  IF emp_pms_grade IS NOT NULL THEN
    SELECT wt.stages INTO result
    FROM workflow_config wc
    JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade;
    
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;
  
  -- Default: Full workflow
  SELECT stages INTO result FROM workflow_templates WHERE is_default = true LIMIT 1;
  RETURN COALESCE(result, '["kra_set", "self_review", "manager_check", "audit", "management_review", "approved"]'::JSONB);
END;
$$;

-- Create function to get workflow template name for an employee
CREATE OR REPLACE FUNCTION public.get_employee_workflow_info(employee_uuid UUID)
RETURNS TABLE(
  template_id UUID,
  template_name TEXT,
  display_name TEXT,
  stages JSONB,
  config_source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_dept_id UUID;
  emp_pms_grade TEXT;
  found_config RECORD;
BEGIN
  -- Get employee's department and PMS grade
  SELECT department_id, pms_grade INTO emp_dept_id, emp_pms_grade
  FROM profiles WHERE id = employee_uuid;
  
  -- Priority 1: Employee-specific config
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'employee'::TEXT as source
  INTO found_config
  FROM workflow_config wc
  JOIN workflow_templates wt ON wc.workflow_template_id = wt.id
  WHERE wc.config_type = 'employee' AND wc.config_value = employee_uuid::TEXT;
  
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
    WHERE wc.config_type = 'department' AND wc.config_value = emp_dept_id::TEXT;
    
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
    WHERE wc.config_type = 'pms_grade' AND wc.config_value = emp_pms_grade;
    
    IF found_config IS NOT NULL THEN
      RETURN QUERY SELECT found_config.id, found_config.name, found_config.display_name, found_config.stages, found_config.source;
      RETURN;
    END IF;
  END IF;
  
  -- Default: Full workflow
  RETURN QUERY 
  SELECT wt.id, wt.name, wt.display_name, wt.stages, 'default'::TEXT as source
  FROM workflow_templates wt 
  WHERE wt.is_default = true 
  LIMIT 1;
END;
$$;