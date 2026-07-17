CREATE OR REPLACE FUNCTION public.set_functional_role(p_user_id uuid, p_new_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_existing_functional public.app_role[];
  v_old_role public.app_role;
  v_has_login boolean;
BEGIN
  -- Authorization: admin only (service_role bypasses)
  SELECT public.has_role(v_caller, 'admin'::public.app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Only admins can change user roles' USING ERRCODE = '42501';
  END IF;

  -- Guard: only functional roles are managed here.
  IF p_new_role NOT IN (
    'admin'::public.app_role, 'manager'::public.app_role, 'employee'::public.app_role,
    'auditor'::public.app_role, 'management'::public.app_role, 'hr_pms'::public.app_role,
    'skip_level'::public.app_role
  ) THEN
    RAISE EXCEPTION 'set_functional_role only manages functional roles, got %', p_new_role
      USING ERRCODE = '22023';
  END IF;

  -- Non-Login User guard (POLICY §113a): user_roles.user_id FK -> auth.users(id).
  -- Backfilled employees without an auth.users row cannot hold roles.
  -- Silently no-op so profile edits on non-login employees succeed.
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_has_login;
  IF NOT v_has_login THEN
    BEGIN
      INSERT INTO public.system_audit_logs (action, performed_by, details)
      VALUES (
        'functional_role_skipped_non_login',
        v_caller,
        jsonb_build_object(
          'target_user_id', p_user_id,
          'attempted_role', p_new_role,
          'reason', 'no auth.users row (non-login employee)'
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN;
  END IF;

  -- Snapshot current functional roles for audit + idempotency.
  SELECT array_agg(role) INTO v_existing_functional
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND role IN (
      'admin'::public.app_role, 'manager'::public.app_role, 'employee'::public.app_role,
      'auditor'::public.app_role, 'management'::public.app_role, 'hr_pms'::public.app_role,
      'skip_level'::public.app_role
    );

  IF v_existing_functional IS NOT NULL
     AND array_length(v_existing_functional, 1) = 1
     AND v_existing_functional[1] = p_new_role THEN
    RETURN;
  END IF;

  v_old_role := CASE
    WHEN v_existing_functional IS NULL OR array_length(v_existing_functional, 1) = 0 THEN NULL
    ELSE v_existing_functional[1]
  END;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role IN (
      'admin'::public.app_role, 'manager'::public.app_role, 'employee'::public.app_role,
      'auditor'::public.app_role, 'management'::public.app_role, 'hr_pms'::public.app_role,
      'skip_level'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.system_audit_logs (action, performed_by, details)
    VALUES (
      'functional_role_changed',
      v_caller,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'old_role', v_old_role,
        'new_role', p_new_role,
        'preserved_roles', (
          SELECT COALESCE(jsonb_agg(role), '[]'::jsonb)
          FROM public.user_roles
          WHERE user_id = p_user_id
            AND role IN ('platform_owner'::public.app_role, 'implementation_admin'::public.app_role)
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$function$;