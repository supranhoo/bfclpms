CREATE OR REPLACE FUNCTION public.has_safety_module_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Phase 19: Org-wide rollout. Safety module visibility is universal for
  -- every authenticated user. Role-based actions inside Safety remain gated
  -- by has_safety_role() and per-table RLS policies; this function only
  -- controls Hub card visibility and the /safety/* route guard.
  SELECT _user_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.has_safety_module_access(uuid) TO authenticated;