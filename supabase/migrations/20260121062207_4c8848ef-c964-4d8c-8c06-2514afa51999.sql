-- Add qualitative UOM support columns to kpis table
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS uom_type text DEFAULT 'numeric';
-- Values: 'numeric' | 'binary' | 'tiered'

ALTER TABLE kpis ADD COLUMN IF NOT EXISTS qualitative_options jsonb;
-- Structure: [{ "label": "Compliant", "rating": 5, "definition": "..." }, ...]

-- Add same columns to kpi_templates table
ALTER TABLE kpi_templates ADD COLUMN IF NOT EXISTS uom_type text DEFAULT 'numeric';
ALTER TABLE kpi_templates ADD COLUMN IF NOT EXISTS qualitative_options jsonb;

-- Add same columns to org_kpi_values table
ALTER TABLE org_kpi_values ADD COLUMN IF NOT EXISTS uom_type text DEFAULT 'numeric';
ALTER TABLE org_kpi_values ADD COLUMN IF NOT EXISTS qualitative_options jsonb;

-- Add comment for documentation
COMMENT ON COLUMN kpis.uom_type IS 'Type of unit of measure: numeric, binary, or tiered';
COMMENT ON COLUMN kpis.qualitative_options IS 'For tiered UOM: array of {label, rating (0-5), definition} objects';
COMMENT ON COLUMN kpi_templates.uom_type IS 'Type of unit of measure: numeric, binary, or tiered';
COMMENT ON COLUMN kpi_templates.qualitative_options IS 'For tiered UOM: array of {label, rating (0-5), definition} objects';
COMMENT ON COLUMN org_kpi_values.uom_type IS 'Type of unit of measure: numeric, binary, or tiered';
COMMENT ON COLUMN org_kpi_values.qualitative_options IS 'For tiered UOM: array of {label, rating (0-5), definition} objects';