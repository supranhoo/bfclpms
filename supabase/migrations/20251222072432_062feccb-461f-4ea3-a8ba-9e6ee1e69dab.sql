-- Add rating threshold columns to kpis table for rating calculation
ALTER TABLE public.kpis 
ADD COLUMN IF NOT EXISTS r5 text,
ADD COLUMN IF NOT EXISTS r4 text,
ADD COLUMN IF NOT EXISTS r3 text,
ADD COLUMN IF NOT EXISTS r2 text,
ADD COLUMN IF NOT EXISTS r1 text,
ADD COLUMN IF NOT EXISTS r0 text,
ADD COLUMN IF NOT EXISTS frequency text,
ADD COLUMN IF NOT EXISTS source_of_data text;

-- Add comments to explain the rating thresholds
COMMENT ON COLUMN public.kpis.r5 IS 'Target value for rating 5 (Exceptional)';
COMMENT ON COLUMN public.kpis.r4 IS 'Target value for rating 4 (Exceeds Expectations)';
COMMENT ON COLUMN public.kpis.r3 IS 'Target value for rating 3 (Meets Expectations)';
COMMENT ON COLUMN public.kpis.r2 IS 'Target value for rating 2 (Below Expectations)';
COMMENT ON COLUMN public.kpis.r1 IS 'Target value for rating 1 (Needs Improvement)';
COMMENT ON COLUMN public.kpis.r0 IS 'Target value for rating 0 (Not Achieved)';