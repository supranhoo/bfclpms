-- Add threshold_mode column to kpis table
ALTER TABLE public.kpis 
ADD COLUMN IF NOT EXISTS threshold_mode text DEFAULT 'absolute';

-- Add threshold_mode column to kpi_templates table
ALTER TABLE public.kpi_templates 
ADD COLUMN IF NOT EXISTS threshold_mode text DEFAULT 'absolute';

-- Set existing KPIs to 'ratio' for backward compatibility (preserve legacy behavior)
UPDATE public.kpis SET threshold_mode = 'ratio' WHERE threshold_mode IS NULL OR threshold_mode = 'absolute';

-- Set existing templates to 'ratio' for backward compatibility
UPDATE public.kpi_templates SET threshold_mode = 'ratio' WHERE threshold_mode IS NULL OR threshold_mode = 'absolute';

-- Add comment for documentation
COMMENT ON COLUMN public.kpis.threshold_mode IS 'Scoring mode: absolute (direct value comparison) or ratio (achieved/target percentage)';
COMMENT ON COLUMN public.kpi_templates.threshold_mode IS 'Scoring mode: absolute (direct value comparison) or ratio (achieved/target percentage)';