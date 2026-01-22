
-- Create enums for TNI and PIP
CREATE TYPE public.tni_gap_type AS ENUM ('skill', 'knowledge', 'behavior');
CREATE TYPE public.tni_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.tni_status AS ENUM ('identified', 'training_planned', 'in_progress', 'completed');
CREATE TYPE public.pip_status AS ENUM ('draft', 'pending_hr_approval', 'active', 'completed', 'extended', 'terminated');
CREATE TYPE public.pip_outcome AS ENUM ('improved', 'not_improved', 'escalated');
CREATE TYPE public.pip_milestone_status AS ENUM ('pending', 'met', 'partially_met', 'not_met');

-- Training Needs Identification table
CREATE TABLE public.training_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES public.kpis(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  score NUMERIC(4,2),
  gap_type public.tni_gap_type NOT NULL DEFAULT 'skill',
  training_recommendation TEXT,
  priority public.tni_priority NOT NULL DEFAULT 'medium',
  status public.tni_status NOT NULL DEFAULT 'identified',
  identified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Performance Improvement Plans table
CREATE TABLE public.performance_improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  hr_reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.pip_status NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  extended_end_date DATE,
  reason TEXT NOT NULL,
  improvement_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_criteria TEXT NOT NULL,
  hr_remarks TEXT,
  hr_approved_at TIMESTAMP WITH TIME ZONE,
  completion_remarks TEXT,
  outcome public.pip_outcome,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- PIP Milestones table
CREATE TABLE public.pip_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pip_id UUID NOT NULL REFERENCES public.performance_improvement_plans(id) ON DELETE CASCADE,
  milestone_date DATE NOT NULL,
  description TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  actual_outcome TEXT,
  status public.pip_milestone_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- PIP Audit Logs table
CREATE TABLE public.pip_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pip_id UUID NOT NULL REFERENCES public.performance_improvement_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_training_needs_employee ON public.training_needs(employee_id);
CREATE INDEX idx_training_needs_period ON public.training_needs(review_period, review_year);
CREATE INDEX idx_training_needs_status ON public.training_needs(status);
CREATE INDEX idx_training_needs_priority ON public.training_needs(priority);
CREATE INDEX idx_pip_employee ON public.performance_improvement_plans(employee_id);
CREATE INDEX idx_pip_status ON public.performance_improvement_plans(status);
CREATE INDEX idx_pip_initiated_by ON public.performance_improvement_plans(initiated_by);
CREATE INDEX idx_pip_milestones_pip ON public.pip_milestones(pip_id);
CREATE INDEX idx_pip_milestones_date ON public.pip_milestones(milestone_date);
CREATE INDEX idx_pip_audit_pip ON public.pip_audit_logs(pip_id);

-- Enable RLS on all tables
ALTER TABLE public.training_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_improvement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pip_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pip_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_needs
CREATE POLICY "Employees can view their own training needs"
ON public.training_needs FOR SELECT
USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team training needs"
ON public.training_needs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = training_needs.employee_id 
    AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Admin and HR can view all training needs"
ON public.training_needs FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'management')
);

CREATE POLICY "Managers can create training needs for team"
ON public.training_needs FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'manager') OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = training_needs.employee_id 
    AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Authorized users can update training needs"
ON public.training_needs FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = training_needs.employee_id 
    AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Admin can delete training needs"
ON public.training_needs FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for performance_improvement_plans
CREATE POLICY "Employees can view their own PIPs"
ON public.performance_improvement_plans FOR SELECT
USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view PIPs they initiated"
ON public.performance_improvement_plans FOR SELECT
USING (auth.uid() = initiated_by);

CREATE POLICY "Managers can view team PIPs"
ON public.performance_improvement_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = performance_improvement_plans.employee_id 
    AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Admin and Management can view all PIPs"
ON public.performance_improvement_plans FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'management')
);

CREATE POLICY "Managers can create PIPs for team"
ON public.performance_improvement_plans FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = performance_improvement_plans.employee_id 
      AND p.reporting_manager_id = auth.uid()
    )
  )
);

CREATE POLICY "Authorized users can update PIPs"
ON public.performance_improvement_plans FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  auth.uid() = initiated_by
);

CREATE POLICY "Admin can delete PIPs"
ON public.performance_improvement_plans FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pip_milestones
CREATE POLICY "Users can view milestones of accessible PIPs"
ON public.pip_milestones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.performance_improvement_plans pip
    WHERE pip.id = pip_milestones.pip_id
    AND (
      pip.employee_id = auth.uid() OR
      pip.initiated_by = auth.uid() OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'management') OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = pip.employee_id 
        AND p.reporting_manager_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Managers can manage milestones"
ON public.pip_milestones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.performance_improvement_plans pip
    WHERE pip.id = pip_milestones.pip_id
    AND (
      pip.initiated_by = auth.uid() OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'management')
    )
  )
);

CREATE POLICY "Managers can update milestones"
ON public.pip_milestones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.performance_improvement_plans pip
    WHERE pip.id = pip_milestones.pip_id
    AND (
      pip.initiated_by = auth.uid() OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'management')
    )
  )
);

CREATE POLICY "Admin can delete milestones"
ON public.pip_milestones FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pip_audit_logs (read-only for authorized users)
CREATE POLICY "Users can view audit logs of accessible PIPs"
ON public.pip_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.performance_improvement_plans pip
    WHERE pip.id = pip_audit_logs.pip_id
    AND (
      pip.employee_id = auth.uid() OR
      pip.initiated_by = auth.uid() OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'management') OR
      public.has_role(auth.uid(), 'auditor')
    )
  )
);

CREATE POLICY "System can insert audit logs"
ON public.pip_audit_logs FOR INSERT
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_training_needs_updated_at
  BEFORE UPDATE ON public.training_needs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pip_updated_at
  BEFORE UPDATE ON public.performance_improvement_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pip_milestones_updated_at
  BEFORE UPDATE ON public.pip_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log PIP status changes
CREATE OR REPLACE FUNCTION public.log_pip_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.pip_audit_logs (pip_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.id,
      'STATUS_CHANGE',
      auth.uid(),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('changed_at', now())
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for PIP status changes
CREATE TRIGGER log_pip_status_changes
  AFTER UPDATE ON public.performance_improvement_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pip_status_change();

-- Function to auto-detect training needs from low scores
CREATE OR REPLACE FUNCTION public.detect_training_needs_for_period(
  p_review_period TEXT,
  p_review_year INTEGER,
  p_threshold NUMERIC DEFAULT 3.0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Insert training needs for KPIs with scores below threshold
  INSERT INTO public.training_needs (
    employee_id,
    kpi_id,
    category_id,
    review_period,
    review_year,
    score,
    gap_type,
    priority,
    status,
    identified_by
  )
  SELECT 
    k.employee_id,
    k.id,
    k.category_id,
    k.review_period,
    k.review_year,
    rs.final_score,
    'skill'::public.tni_gap_type,
    CASE 
      WHEN rs.final_score < 2.0 THEN 'high'::public.tni_priority
      WHEN rs.final_score < 2.5 THEN 'medium'::public.tni_priority
      ELSE 'low'::public.tni_priority
    END,
    'identified'::public.tni_status,
    auth.uid()
  FROM public.kpis k
  JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND rs.final_score IS NOT NULL
    AND rs.final_score < p_threshold
    AND k.status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.training_needs tn
      WHERE tn.kpi_id = k.id
    );
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
