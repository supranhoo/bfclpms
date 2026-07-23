
CREATE TABLE IF NOT EXISTS public.incentive_stale_zero_cleanup_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  employee_id UUID,
  program_id UUID,
  review_period TEXT,
  review_year INTEGER,
  payment_period TEXT,
  old_production_value NUMERIC,
  old_incentive_amount NUMERIC,
  old_status TEXT,
  old_incentive_status TEXT,
  reason TEXT,
  cleaned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.incentive_stale_zero_cleanup_audit TO authenticated;
GRANT ALL ON public.incentive_stale_zero_cleanup_audit TO service_role;

ALTER TABLE public.incentive_stale_zero_cleanup_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stale zero cleanup audit"
  ON public.incentive_stale_zero_cleanup_audit
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

CREATE POLICY "Service role manages stale zero cleanup audit"
  ON public.incentive_stale_zero_cleanup_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
