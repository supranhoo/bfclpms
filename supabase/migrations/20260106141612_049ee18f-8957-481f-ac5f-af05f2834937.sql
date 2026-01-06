-- Add is_org_level flag to kpis table for KPI-level organization control
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS is_org_level boolean DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.kpis.is_org_level IS 'When true, achieved value is centrally managed via org_kpi_values table';