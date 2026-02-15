CREATE POLICY "Allow anon to read settings"
  ON system_settings FOR SELECT TO anon USING (true);