-- 1. Create new KPI status enum
CREATE TYPE public.kpi_status AS ENUM ('open', 'submitted', 'approved_by_manager', 'locked');

-- 2. Create query status enum
CREATE TYPE public.query_status AS ENUM ('open', 'resolved');

-- 3. Create entity type enum for queries
CREATE TYPE public.query_entity_type AS ENUM ('kra', 'kpi');

-- 4. Add kpi_status column to review_submissions table
ALTER TABLE public.review_submissions 
ADD COLUMN kpi_status public.kpi_status NOT NULL DEFAULT 'open';

-- 5. Create KPI queries table for query management
CREATE TABLE public.kpi_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  entity_type public.query_entity_type NOT NULL DEFAULT 'kpi',
  raised_by UUID NOT NULL REFERENCES public.profiles(id),
  raised_to UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT NOT NULL,
  evidence_url TEXT,
  resolution_notes TEXT,
  status public.query_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Create KPI audit logs table for immutable audit trail
CREATE TABLE public.kpi_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.review_submissions(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Enable RLS on new tables
ALTER TABLE public.kpi_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies for kpi_queries
CREATE POLICY "Admins can manage all queries"
ON public.kpi_queries FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view queries they raised or received"
ON public.kpi_queries FOR SELECT
USING (raised_by = auth.uid() OR raised_to = auth.uid());

CREATE POLICY "Users can create queries"
ON public.kpi_queries FOR INSERT
WITH CHECK (raised_by = auth.uid());

CREATE POLICY "Users can update queries they received"
ON public.kpi_queries FOR UPDATE
USING (raised_to = auth.uid());

CREATE POLICY "Managers can view queries for their reports"
ON public.kpi_queries FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) AND 
  EXISTS (
    SELECT 1 FROM kpis k
    JOIN profiles p ON k.employee_id = p.id
    WHERE k.id = kpi_queries.kpi_id AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Auditors can view all queries"
ON public.kpi_queries FOR SELECT
USING (has_role(auth.uid(), 'auditor'::app_role));

-- 9. RLS policies for kpi_audit_logs (read-only for most users)
CREATE POLICY "Admins can view all audit logs"
ON public.kpi_audit_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auditors can view all audit logs"
ON public.kpi_audit_logs FOR SELECT
USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Users can view audit logs for their KPIs"
ON public.kpi_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM kpis k
    WHERE k.id = kpi_audit_logs.kpi_id AND k.employee_id = auth.uid()
  )
);

CREATE POLICY "Managers can view audit logs for their reports"
ON public.kpi_audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) AND 
  EXISTS (
    SELECT 1 FROM kpis k
    JOIN profiles p ON k.employee_id = p.id
    WHERE k.id = kpi_audit_logs.kpi_id AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "System can insert audit logs"
ON public.kpi_audit_logs FOR INSERT
WITH CHECK (performed_by = auth.uid());

-- 10. Create trigger for updated_at on kpi_queries
CREATE TRIGGER update_kpi_queries_updated_at
BEFORE UPDATE ON public.kpi_queries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Migrate existing data - map current statuses to kpi_status
UPDATE public.review_submissions
SET kpi_status = CASE 
  WHEN EXISTS (SELECT 1 FROM kpis k WHERE k.id = review_submissions.kpi_id AND k.status = 'approved') THEN 'locked'::kpi_status
  WHEN manager_rating IS NOT NULL THEN 'approved_by_manager'::kpi_status
  WHEN self_rating IS NOT NULL THEN 'submitted'::kpi_status
  ELSE 'open'::kpi_status
END;