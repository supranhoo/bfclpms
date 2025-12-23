-- Add deny-by-default RLS policies for import_progress table
-- This prevents direct INSERT/UPDATE/DELETE from regular authenticated users
-- Edge functions use service role key which bypasses RLS

-- Only service role (edge functions) can insert import records
CREATE POLICY "Only system can create import progress"
ON public.import_progress
FOR INSERT
WITH CHECK (false);

-- Only service role can update import records  
CREATE POLICY "Only system can update import progress"
ON public.import_progress
FOR UPDATE
USING (false);

-- Prevent deletion of import history (preserve audit trail)
CREATE POLICY "Import history cannot be deleted"
ON public.import_progress
FOR DELETE
USING (false);