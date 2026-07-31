CREATE TABLE public.annual_review_bell_curve_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  target_5 numeric NOT NULL DEFAULT 10,
  target_4 numeric NOT NULL DEFAULT 20,
  target_3 numeric NOT NULL DEFAULT 40,
  target_2 numeric NOT NULL DEFAULT 20,
  target_1 numeric NOT NULL DEFAULT 10,
  green_threshold numeric NOT NULL DEFAULT 5,
  amber_threshold numeric NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX annual_review_bell_curve_config_cycle_uniq
  ON public.annual_review_bell_curve_config (COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.annual_review_bell_curve_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.annual_review_bell_curve_config TO authenticated;
GRANT ALL ON public.annual_review_bell_curve_config TO service_role;

ALTER TABLE public.annual_review_bell_curve_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bell_curve_config_read"
  ON public.annual_review_bell_curve_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bell_curve_config_write"
  ON public.annual_review_bell_curve_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_bell_curve_config_updated_at
  BEFORE UPDATE ON public.annual_review_bell_curve_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.annual_review_bell_curve_config (cycle_id) VALUES (NULL);