DROP POLICY IF EXISTS lov_realtime_messages_authenticated_only_read ON realtime.messages;
DROP POLICY IF EXISTS lov_realtime_messages_authenticated_only_write ON realtime.messages;

CREATE POLICY lov_realtime_messages_user_scoped_read
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND realtime.topic() IS NOT NULL
    AND position(auth.uid()::text in realtime.topic()) > 0
  );

CREATE POLICY lov_realtime_messages_user_scoped_write
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND realtime.topic() IS NOT NULL
    AND position(auth.uid()::text in realtime.topic()) > 0
  );