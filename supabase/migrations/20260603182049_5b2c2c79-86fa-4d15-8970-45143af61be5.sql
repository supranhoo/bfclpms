
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_owner';

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'hub_platform_settings_enabled',
  '"false"'::jsonb,
  'Master switch for Hub-level Platform Settings shell. When false, /platform-settings is 404, hub card is hidden, and entitlement resolver returns allow-all (zero PMS behavior change).'
)
ON CONFLICT (setting_key) DO NOTHING;
