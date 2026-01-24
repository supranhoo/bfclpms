-- Add login page hero text columns to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS login_hero_headline text DEFAULT 'Manage performance with clarity.',
ADD COLUMN IF NOT EXISTS login_hero_description text DEFAULT 'Track KPIs, conduct reviews, and drive organizational growth.';