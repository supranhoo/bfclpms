CREATE TABLE IF NOT EXISTS public.kra_period_issuance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  review_year integer NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','open')),
  source text NOT NULL DEFAULT 'manual_rollover',
  note text,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kra_period_issuance_unique UNIQUE (employee_id, review_period, review_year)
);

CREATE INDEX IF NOT EXISTS idx_kra_period_issuance_period
  ON public.kra_period_issuance (review_year, review_period, status);

GRANT SELECT ON public.kra_period_issuance TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kra_period_issuance TO authenticated;
GRANT ALL ON public.kra_period_issuance TO service_role;

ALTER TABLE public.kra_period_issuance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kra_period_issuance_admin_all"
  ON public.kra_period_issuance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE POLICY "kra_period_issuance_read_own"
  ON public.kra_period_issuance FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

CREATE TRIGGER trg_kra_period_issuance_updated_at
  BEFORE UPDATE ON public.kra_period_issuance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();