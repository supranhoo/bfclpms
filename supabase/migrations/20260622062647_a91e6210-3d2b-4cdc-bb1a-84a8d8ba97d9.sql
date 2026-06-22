-- Ensure RLS is enabled on realtime.messages (Supabase default, but explicit is safer)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any previous Lovable-managed policies so this migration is idempotent
DROP POLICY IF EXISTS "lov_realtime_messages_authenticated_only_read" ON realtime.messages;
DROP POLICY IF EXISTS "lov_realtime_messages_authenticated_only_write" ON realtime.messages;

-- Default-deny by only permitting authenticated users to interact with
-- broadcast/presence messages. The app does not currently use broadcast
-- or presence channels (only postgres_changes / CDC, which is governed by
-- table-level RLS), so this effectively closes the channel subscription
-- surface without breaking realtime functionality.
CREATE POLICY "lov_realtime_messages_authenticated_only_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "lov_realtime_messages_authenticated_only_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);