-- Change default status for org_kpi_values from 'approved' to 'entered'
ALTER TABLE public.org_kpi_values ALTER COLUMN status SET DEFAULT 'entered';