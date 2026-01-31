-- Add per-level approved value columns to sub_period_submissions
ALTER TABLE public.sub_period_submissions
  ADD COLUMN IF NOT EXISTS manager_achieved_value integer,
  ADD COLUMN IF NOT EXISTS auditor_achieved_value integer,
  ADD COLUMN IF NOT EXISTS management_achieved_value integer,
  ADD COLUMN IF NOT EXISTS admin_achieved_value integer;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sub_period_manager_value 
  ON public.sub_period_submissions(kpi_id, manager_achieved_value) 
  WHERE manager_achieved_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_period_auditor_value 
  ON public.sub_period_submissions(kpi_id, auditor_achieved_value) 
  WHERE auditor_achieved_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_period_management_value 
  ON public.sub_period_submissions(kpi_id, management_achieved_value) 
  WHERE management_achieved_value IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sub_period_submissions.manager_achieved_value IS 'Value approved/overridden by reporting manager';
COMMENT ON COLUMN public.sub_period_submissions.auditor_achieved_value IS 'Value approved/overridden by auditor';
COMMENT ON COLUMN public.sub_period_submissions.management_achieved_value IS 'Value approved/overridden by management';
COMMENT ON COLUMN public.sub_period_submissions.admin_achieved_value IS 'Value overridden by admin';