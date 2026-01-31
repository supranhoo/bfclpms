-- Add resubmission configuration to KPIs
ALTER TABLE kpis 
ADD COLUMN require_resubmit_reason boolean DEFAULT true;

-- Add resubmission configuration to templates  
ALTER TABLE kpi_templates
ADD COLUMN require_resubmit_reason boolean DEFAULT true;

-- Add update reason tracking to sub-period submissions
ALTER TABLE sub_period_submissions
ADD COLUMN update_reason text;