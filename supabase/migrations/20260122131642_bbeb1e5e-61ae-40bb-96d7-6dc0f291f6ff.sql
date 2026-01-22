-- Add login_wallpapers column to store multiple wallpaper URLs
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS login_wallpapers jsonb DEFAULT '[]'::jsonb;

-- Migrate existing single wallpaper to the new array if it exists
UPDATE public.app_settings 
SET login_wallpapers = 
  CASE 
    WHEN login_background_url IS NOT NULL AND login_background_url != ''
    THEN jsonb_build_array(login_background_url)
    ELSE '[]'::jsonb 
  END
WHERE id = '00000000-0000-0000-0000-000000000001';