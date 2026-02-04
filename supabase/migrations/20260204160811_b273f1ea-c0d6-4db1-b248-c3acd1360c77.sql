-- Add evidence_url column to org_kpi_values for file attachments
ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS evidence_url TEXT;