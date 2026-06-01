-- Phase 1: Functional Manager - schema additions
-- Adds nullable functional_manager_id to profiles + SECURITY DEFINER helper for RLS

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS functional_manager_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_functional_manager_id
  ON public.profiles(functional_manager_id)
  WHERE functional_manager_id IS NOT NULL;

-- Security definer helper: is the caller the Functional Manager of _employee_id?
-- Mirrors has_role pattern to avoid RLS recursion.
CREATE OR REPLACE FUNCTION public.is_functional_manager_of(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _employee_id
      AND p.functional_manager_id = auth.uid()
      AND p.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_functional_manager_of(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.profiles.functional_manager_id IS
  'Optional Functional Manager (peer reviewer to Reporting Manager). When workflow template includes the functional_manager_check stage, the review routes to this user. Nullable; ON DELETE SET NULL.';

COMMENT ON FUNCTION public.is_functional_manager_of(uuid) IS
  'RLS helper: true when auth.uid() is the active Functional Manager of _employee_id. Used by additive RLS policies to grant FM review access on kpi/kra tables.';