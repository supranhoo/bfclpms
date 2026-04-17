ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS view_mode_strip_color text NOT NULL DEFAULT '#3b82f6';