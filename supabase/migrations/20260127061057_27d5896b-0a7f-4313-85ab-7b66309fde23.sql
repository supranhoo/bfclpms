-- Add org_level_scope column to kpis table (organization, department, or employee)
ALTER TABLE public.kpis 
ADD COLUMN org_level_scope text DEFAULT 'organization';

-- Add check constraint for valid scope values
ALTER TABLE public.kpis 
ADD CONSTRAINT kpis_org_level_scope_check 
CHECK (org_level_scope IN ('organization', 'department', 'employee'));

-- Add department_id and employee_id columns to org_kpi_values table for scoped lookups
ALTER TABLE public.org_kpi_values 
ADD COLUMN department_id uuid REFERENCES departments(id),
ADD COLUMN employee_id uuid REFERENCES profiles(id);

-- Drop existing unique constraint if it exists
ALTER TABLE public.org_kpi_values DROP CONSTRAINT IF EXISTS org_kpi_values_category_id_kra_name_kpi_name_review_period_r_key;

-- Create new unique index that includes department_id and employee_id for scoped values
-- Using COALESCE with nil UUID to handle NULL values in unique constraint
CREATE UNIQUE INDEX org_kpi_values_scope_unique_idx 
ON public.org_kpi_values (
  category_id, 
  kra_name, 
  kpi_name, 
  review_period, 
  review_year, 
  COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Add index for faster lookups by department
CREATE INDEX IF NOT EXISTS idx_org_kpi_values_department ON public.org_kpi_values(department_id) WHERE department_id IS NOT NULL;

-- Add index for faster lookups by employee
CREATE INDEX IF NOT EXISTS idx_org_kpi_values_employee ON public.org_kpi_values(employee_id) WHERE employee_id IS NOT NULL;