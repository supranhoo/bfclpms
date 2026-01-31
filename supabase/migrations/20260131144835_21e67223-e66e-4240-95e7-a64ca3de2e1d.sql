-- Add on-behalf tracking columns to kpi_audit_logs for admin data entry
ALTER TABLE public.kpi_audit_logs 
ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS on_behalf_role TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.kpi_audit_logs.on_behalf_of IS 'Target user whose data was modified by admin';
COMMENT ON COLUMN public.kpi_audit_logs.on_behalf_role IS 'Role level: self, manager, auditor, management, daily_submission';

-- Add index for querying on-behalf actions
CREATE INDEX IF NOT EXISTS idx_audit_logs_on_behalf 
ON public.kpi_audit_logs(on_behalf_of) 
WHERE on_behalf_of IS NOT NULL;