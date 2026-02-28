
DROP POLICY IF EXISTS "Users and admins can insert notifications" ON notifications;

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
