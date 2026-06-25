
-- =====================================================================
-- Phase B: Profile Identity Integrity hardening (additive only)
-- Plan: .lovable/plan.md  (2026-06-25)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) BEFORE UPDATE trigger: audit identity changes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_profiles_identity_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.full_name      IS DISTINCT FROM OLD.full_name)
  OR (NEW.employee_code  IS DISTINCT FROM OLD.employee_code)
  OR (NEW.email          IS DISTINCT FROM OLD.email)
  OR (NEW.is_active      IS DISTINCT FROM OLD.is_active)
  THEN
    INSERT INTO public.system_audit_logs (action, performed_by, metadata)
    VALUES (
      'profile.identity_changed',
      auth.uid(),
      jsonb_build_object(
        'profile_id', OLD.id,
        'before', jsonb_build_object(
          'full_name', OLD.full_name,
          'employee_code', OLD.employee_code,
          'email', OLD.email,
          'is_active', OLD.is_active
        ),
        'after', jsonb_build_object(
          'full_name', NEW.full_name,
          'employee_code', NEW.employee_code,
          'email', NEW.email,
          'is_active', NEW.is_active
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_identity_audit ON public.profiles;
CREATE TRIGGER trg_profiles_identity_audit
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_identity_audit_fn();

-- ---------------------------------------------------------------------
-- 2) Admin-only RPC: re-identify / clear-email / inactivate an existing profile
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_profile_identity(
  p_target_id           uuid,
  p_new_employee_code   text,
  p_new_full_name       text,
  p_new_email           text,           -- pass NULL to clear
  p_clear_email         boolean DEFAULT false,
  p_set_inactive        boolean DEFAULT false,
  p_reason              text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old    public.profiles%ROWTYPE;
  v_log_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'repair_profile_identity: admin role required';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repair_profile_identity: profile % not found', p_target_id;
  END IF;

  -- Uniqueness validation (case-insensitive email; exact employee_code)
  IF p_new_employee_code IS NOT NULL
     AND p_new_employee_code <> COALESCE(v_old.employee_code, '')
     AND EXISTS (SELECT 1 FROM public.profiles
                 WHERE employee_code = p_new_employee_code AND id <> p_target_id) THEN
    RAISE EXCEPTION 'repair_profile_identity: employee_code % already in use', p_new_employee_code;
  END IF;

  IF NOT p_clear_email
     AND p_new_email IS NOT NULL
     AND lower(p_new_email) <> lower(COALESCE(v_old.email, ''))
     AND EXISTS (SELECT 1 FROM public.profiles
                 WHERE lower(email) = lower(p_new_email) AND id <> p_target_id) THEN
    RAISE EXCEPTION 'repair_profile_identity: email % already in use', p_new_email;
  END IF;

  UPDATE public.profiles SET
    employee_code  = COALESCE(p_new_employee_code, employee_code),
    full_name      = COALESCE(p_new_full_name,     full_name),
    email          = CASE WHEN p_clear_email THEN NULL ELSE COALESCE(p_new_email, email) END,
    has_real_email = CASE WHEN p_clear_email THEN false ELSE has_real_email END,
    is_active      = CASE WHEN p_set_inactive THEN false ELSE is_active END,
    deactivated_at = CASE WHEN p_set_inactive AND is_active THEN now() ELSE deactivated_at END,
    updated_at     = now()
  WHERE id = p_target_id;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'profile.identity_repaired',
    v_caller,
    jsonb_build_object(
      'profile_id', p_target_id,
      'reason', p_reason,
      'before', jsonb_build_object(
        'full_name', v_old.full_name,
        'employee_code', v_old.employee_code,
        'email', v_old.email,
        'is_active', v_old.is_active
      ),
      'inputs', jsonb_build_object(
        'new_employee_code', p_new_employee_code,
        'new_full_name', p_new_full_name,
        'new_email', p_new_email,
        'clear_email', p_clear_email,
        'set_inactive', p_set_inactive
      )
    )
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_profile_identity(uuid, text, text, text, boolean, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.repair_profile_identity(uuid, text, text, text, boolean, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Admin-only RPC: create a fresh repair profile (no email, no auth user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_repair_profile(
  p_employee_code text,
  p_full_name     text,
  p_set_inactive  boolean DEFAULT false,
  p_reason        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_id     uuid := gen_random_uuid();
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'create_repair_profile: admin role required';
  END IF;

  IF p_employee_code IS NULL OR length(trim(p_employee_code)) = 0 THEN
    RAISE EXCEPTION 'create_repair_profile: employee_code is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE employee_code = p_employee_code) THEN
    RAISE EXCEPTION 'create_repair_profile: employee_code % already exists', p_employee_code;
  END IF;

  INSERT INTO public.profiles (id, employee_code, full_name, email, has_real_email, is_active, deactivated_at, is_dummy_employee)
  VALUES (
    v_id,
    p_employee_code,
    p_full_name,
    NULL,
    false,
    NOT p_set_inactive,
    CASE WHEN p_set_inactive THEN now() ELSE NULL END,
    false
  );

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'profile.repair_created',
    v_caller,
    jsonb_build_object(
      'profile_id', v_id,
      'employee_code', p_employee_code,
      'full_name', p_full_name,
      'is_active', NOT p_set_inactive,
      'reason', p_reason
    )
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_repair_profile(text, text, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_repair_profile(text, text, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Diagnostic views (admin-only via RLS on underlying tables)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_profile_identity_drift AS
SELECT
  u.id                                              AS profile_id,
  u.email                                           AS auth_email,
  u.raw_user_meta_data->>'employee_code'            AS auth_employee_code,
  u.raw_user_meta_data->>'full_name'                AS auth_full_name,
  p.email                                           AS profile_email,
  p.employee_code                                   AS profile_employee_code,
  p.full_name                                       AS profile_full_name
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE (u.raw_user_meta_data->>'employee_code') IS NOT NULL
  AND (
        (u.raw_user_meta_data->>'employee_code') <> COALESCE(p.employee_code,'')
     OR lower(COALESCE(u.raw_user_meta_data->>'full_name','')) <> lower(COALESCE(p.full_name,''))
  );

CREATE OR REPLACE VIEW public.v_profile_email_duplicates AS
SELECT lower(email) AS email_lc, count(*) AS profile_count,
       array_agg(employee_code ORDER BY employee_code) AS employee_codes,
       array_agg(full_name     ORDER BY employee_code) AS full_names
FROM public.profiles
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING count(*) > 1;

GRANT SELECT ON public.v_profile_identity_drift   TO authenticated, service_role;
GRANT SELECT ON public.v_profile_email_duplicates TO authenticated, service_role;
