
CREATE TABLE IF NOT EXISTS public.annual_review_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.annual_review_settings TO authenticated;
GRANT ALL ON public.annual_review_settings TO service_role;

ALTER TABLE public.annual_review_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_settings_read_authenticated"
  ON public.annual_review_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "ar_settings_admin_write"
  ON public.annual_review_settings FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ar_settings_admin_update"
  ON public.annual_review_settings FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ar_settings_admin_delete"
  ON public.annual_review_settings FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ar_settings_updated_at
  BEFORE UPDATE ON public.annual_review_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.annual_review_settings (key, value)
VALUES ('show_reviewer_names_in_stepper', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
