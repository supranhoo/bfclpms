-- Tighten app_settings SELECT to authenticated users only
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;

CREATE POLICY "Authenticated users can read app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.app_settings FROM anon;

-- Public branding RPC (safe subset for the login page)
CREATE OR REPLACE FUNCTION public.get_public_branding()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'organization_name', organization_name,
    'app_name', app_name,
    'logo_url', logo_url,
    'login_background_url', login_background_url,
    'login_wallpapers', login_wallpapers,
    'login_hero_headline', login_hero_headline,
    'login_hero_description', login_hero_description,
    'view_mode_strip_color', view_mode_strip_color
  )
  FROM public.app_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
$$;

REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;