-- 1. Safety role enum
DO $$ BEGIN
  CREATE TYPE public.safety_app_role AS ENUM (
    'admin','safety_head','safety_officer','bu_head','manager','supervisor','worker','auditor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Safety user roles table
CREATE TABLE IF NOT EXISTS public.safety_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.safety_app_role NOT NULL,
  business_unit_id uuid NULL,
  department_id uuid NULL,
  assigned_by uuid NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness across the four-tuple, treating NULLs as equal
CREATE UNIQUE INDEX IF NOT EXISTS safety_user_roles_uniq
  ON public.safety_user_roles (
    user_id,
    role,
    COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(department_id,    '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS safety_user_roles_user_idx ON public.safety_user_roles(user_id);
CREATE INDEX IF NOT EXISTS safety_user_roles_role_idx ON public.safety_user_roles(role);

ALTER TABLE public.safety_user_roles ENABLE ROW LEVEL SECURITY;

-- 3. SECURITY DEFINER helper — mirrors PMS has_role pattern, avoids RLS recursion
CREATE OR REPLACE FUNCTION public.has_safety_role(
  _user_id uuid,
  _role public.safety_app_role,
  _business_unit_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.safety_user_roles
     WHERE user_id = _user_id
       AND role = _role
       AND ( _business_unit_id IS NULL
             OR business_unit_id IS NULL
             OR business_unit_id = _business_unit_id )
  );
$$;

-- Convenience: any safety role at all (used by route guard / module access)
CREATE OR REPLACE FUNCTION public.has_any_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.safety_user_roles WHERE user_id = _user_id);
$$;

-- 4. RLS for safety_user_roles
DROP POLICY IF EXISTS "Users can view their own safety roles" ON public.safety_user_roles;
CREATE POLICY "Users can view their own safety roles"
  ON public.safety_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Safety admins and heads can view all safety roles" ON public.safety_user_roles;
CREATE POLICY "Safety admins and heads can view all safety roles"
  ON public.safety_user_roles FOR SELECT TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  );

DROP POLICY IF EXISTS "Safety admins manage safety roles" ON public.safety_user_roles;
CREATE POLICY "Safety admins manage safety roles"
  ON public.safety_user_roles FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_safety_role(auth.uid(), 'admin'));

-- 5. Safety audit log table (module-scoped)
CREATE TABLE IF NOT EXISTS public.safety_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  performed_by uuid NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_audit_log_entity_idx ON public.safety_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS safety_audit_log_created_idx ON public.safety_audit_log(created_at DESC);

ALTER TABLE public.safety_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Safety admins read audit log" ON public.safety_audit_log;
CREATE POLICY "Safety admins read audit log"
  ON public.safety_audit_log FOR SELECT TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin'));

-- Inserts only via SECURITY DEFINER trigger; no direct insert policy needed.

-- 6. Trigger: log every grant/revoke in safety_user_roles
CREATE OR REPLACE FUNCTION public.log_safety_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
    VALUES (
      'safety_role_granted',
      'safety_user_roles',
      NEW.id,
      COALESCE(NEW.assigned_by, auth.uid()),
      jsonb_build_object(
        'user_id', NEW.user_id,
        'role', NEW.role,
        'business_unit_id', NEW.business_unit_id,
        'department_id', NEW.department_id
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
    VALUES (
      'safety_role_revoked',
      'safety_user_roles',
      OLD.id,
      auth.uid(),
      jsonb_build_object(
        'user_id', OLD.user_id,
        'role', OLD.role,
        'business_unit_id', OLD.business_unit_id,
        'department_id', OLD.department_id
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_safety_role_change ON public.safety_user_roles;
CREATE TRIGGER trg_log_safety_role_change
AFTER INSERT OR DELETE ON public.safety_user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_safety_role_change();

-- 7. Update has_safety_module_access to ALSO grant access if user has any safety role
--    (so granting a role implicitly grants module visibility — Phase 1.A acceptance).
CREATE OR REPLACE FUNCTION public.has_safety_module_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.safety_module_access
     WHERE user_id = _user_id AND can_view = true
  ) OR EXISTS (
    SELECT 1 FROM public.safety_user_roles WHERE user_id = _user_id
  );
$$;
