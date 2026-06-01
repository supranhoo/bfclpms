ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dummy_employee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_dummy_employee
  ON public.profiles (is_dummy_employee) WHERE is_dummy_employee = true;

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('show_dummy_in_excel',    '"no"'::jsonb, 'Show dummy/system employees in Excel reports/exports'),
  ('show_dummy_in_frontend', '"no"'::jsonb, 'Show dummy/system employees in frontend business views/selectors')
ON CONFLICT (setting_key) DO NOTHING;