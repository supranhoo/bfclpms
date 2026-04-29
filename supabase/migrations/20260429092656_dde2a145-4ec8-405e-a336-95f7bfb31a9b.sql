-- ============================================================
-- Safety Module — Phase 0 Foundation
-- 1. Register Safety as a Hub module (admin can toggle is_enabled)
-- 2. Per-user access table (safety_module_access)
-- 3. Security-definer helper to check access without RLS recursion
-- 4. RLS policies (PMS admins manage; users see own grant only)
-- ============================================================

-- 1. Register Safety in the modules registry (idempotent).
--    is_enabled = false initially so the global kill-switch is OFF until
--    the admin flips it from the new /admin/modules page.
INSERT INTO public.modules (code, name, description, icon, color, route, is_enabled, display_order)
VALUES (
  'safety',
  'Safety',
  'Incident reporting, investigation, and HSE compliance tracking.',
  'ShieldAlert',
  'destructive',
  '/safety',
  false,
  2
)
ON CONFLICT (code) DO NOTHING;

-- 2. Per-user Safety access grant.
--    PK on user_id ensures one row per user. Granular per-module flags
--    (incidents/permits/training/...) come in Phase 1.A; Phase 0 only
--    needs the coarse "can this user see Safety at all" gate.
CREATE TABLE IF NOT EXISTS public.safety_module_access (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view    BOOLEAN NOT NULL DEFAULT true,
  can_edit    BOOLEAN NOT NULL DEFAULT false,
  granted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_module_access_user ON public.safety_module_access(user_id);

-- 3. Security-definer access check (no RLS recursion when policies use it).
CREATE OR REPLACE FUNCTION public.has_safety_module_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_module_access
    WHERE user_id = _user_id AND can_view = true
  )
  -- PMS admins are also Safety admins (per user decision in plan §13.2)
  OR public.has_role(_user_id, 'admin'::app_role);
$$;

COMMENT ON FUNCTION public.has_safety_module_access IS
'Returns true when a user may see the Safety module. PMS admins are auto-granted.';

-- 4. RLS — one row per user, only PMS admins manage; users read their own row.
ALTER TABLE public.safety_module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own safety access"      ON public.safety_module_access;
DROP POLICY IF EXISTS "Admins manage all safety access"   ON public.safety_module_access;

CREATE POLICY "Users read own safety access"
ON public.safety_module_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage all safety access"
ON public.safety_module_access
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. updated_at trigger (reuse existing helper).
DROP TRIGGER IF EXISTS trg_safety_module_access_updated_at ON public.safety_module_access;
CREATE TRIGGER trg_safety_module_access_updated_at
BEFORE UPDATE ON public.safety_module_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Realtime — enable so revoking access hides the Hub card within one tick.
ALTER TABLE public.safety_module_access REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_module_access;
