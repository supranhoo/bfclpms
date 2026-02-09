
-- Revert app_settings to public read - needed for login page branding before authentication
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON app_settings;
CREATE POLICY "Anyone can read app_settings"
  ON app_settings FOR SELECT
  USING (true);
