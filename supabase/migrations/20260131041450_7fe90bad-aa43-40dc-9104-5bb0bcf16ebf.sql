-- Drop the existing policy that targets wrong role
DROP POLICY IF EXISTS "Modules are viewable by authenticated users" ON public.modules;

-- Create proper policy that targets authenticated role
CREATE POLICY "Modules are viewable by authenticated users"
ON public.modules FOR SELECT
TO authenticated
USING (true);