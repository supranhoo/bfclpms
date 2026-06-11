-- Helper: does the user hold ANY responsible safety role (anything except worker)?
-- SECURITY DEFINER mirrors has_any_safety_role; excludes plain workers so the
-- org-wide employee directory is only readable by people who must assign/route.
CREATE OR REPLACE FUNCTION public.has_responsible_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.safety_user_roles
      WHERE user_id = _user_id AND role <> 'worker'
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND r.module = 'safety'
        AND r.code <> 'safety_worker'
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
    );
$function$;

-- Allow responsible safety roles (safety_head, safety_officer, bu_head,
-- manager, supervisor, auditor, admin) to read ACTIVE profiles so user
-- pickers (investigator/verifier assignment, routing rules) and routing
-- chain name display work. Workers are excluded.
DROP POLICY IF EXISTS "Safety responsible roles can view active profiles" ON public.profiles;
CREATE POLICY "Safety responsible roles can view active profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_active = true AND public.has_responsible_safety_role(auth.uid()));