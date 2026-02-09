
-- 1a. kra_rollover_logs: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert rollover logs" ON kra_rollover_logs;
CREATE POLICY "Admins can insert rollover logs"
  ON kra_rollover_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 1b. notifications: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "Users and admins can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- 1c. pip_audit_logs: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert audit logs" ON pip_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON pip_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2a. app_settings: restrict to authenticated
DROP POLICY IF EXISTS "Anyone can read app_settings" ON app_settings;
CREATE POLICY "Authenticated users can read app_settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- 2b. workflow_settings: restrict to authenticated
DROP POLICY IF EXISTS "Anyone can view workflow settings" ON workflow_settings;
CREATE POLICY "Authenticated users can view workflow settings"
  ON workflow_settings FOR SELECT
  TO authenticated
  USING (true);

-- 3. profiles: tighten Management SELECT from public to authenticated
DROP POLICY IF EXISTS "Management can view all profiles" ON profiles;
CREATE POLICY "Management can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'management'));
