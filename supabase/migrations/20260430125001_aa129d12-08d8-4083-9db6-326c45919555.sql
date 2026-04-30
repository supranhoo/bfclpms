INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('branding_company_name', '""', 'Company name shown on the loading overlay (rocket card). Empty = hide.'),
  ('branding_loader_tagline', '""', 'Optional tagline shown beneath the company name on the loading overlay.'),
  ('branding_loader_show_logo', 'false', 'When true, render the email logo (email_company_logo_url) on the loading overlay.')
ON CONFLICT (setting_key) DO NOTHING;