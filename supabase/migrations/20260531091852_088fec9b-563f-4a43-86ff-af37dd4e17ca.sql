CREATE OR REPLACE FUNCTION public.check_review_period_permission(p_user_id uuid, p_period_name text, p_review_year integer, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_id uuid;
  v_current_stage text;
  v_lock_record RECORD;
  v_permission_value boolean;
  v_user_dept_id uuid;
  v_user_roles text[];
  v_default_value boolean;
BEGIN
  -- view_only has inverted semantics: true = restrictive
  v_default_value := CASE WHEN p_action = 'view_only' THEN false ELSE true END;

  SELECT id, current_stage INTO v_period_id, v_current_stage
  FROM review_periods
  WHERE period_name = p_period_name AND review_year = p_review_year;

  IF v_period_id IS NULL THEN
    RETURN v_default_value;
  END IF;

  -- Resolve user context FIRST so admin bypass can run before any stage gate
  SELECT department_id INTO v_user_dept_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(role::text) INTO v_user_roles
  FROM user_roles WHERE user_id = p_user_id;

  -- Admin bypass: admins are exempt from the closed-stage gate, mirroring
  -- the legacy-lock behaviour in prevent_locked_*_updates triggers. Admin
  -- edits on closed periods are still captured by the audit log.
  IF 'admin' = ANY(COALESCE(v_user_roles, ARRAY[]::text[])) THEN
    RETURN v_default_value;
  END IF;

  -- Closed-stage short-circuit for everyone else
  IF v_current_stage = 'closed' THEN
    IF p_action = 'view_only' THEN
      RETURN true;
    ELSE
      RETURN false;
    END IF;
  END IF;

  -- Priority 1: Employee-specific lock
  SELECT * INTO v_lock_record
  FROM review_period_locks
  WHERE review_period_id = v_period_id
    AND lock_type = 'employee'
    AND target_id = p_user_id::text
  LIMIT 1;

  IF v_lock_record IS NOT NULL THEN
    v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, v_default_value);
    IF v_lock_record.is_locked THEN
      RETURN v_permission_value;
    ELSE
      RETURN v_default_value;
    END IF;
  END IF;

  -- Priority 2: Department lock
  IF v_user_dept_id IS NOT NULL THEN
    SELECT * INTO v_lock_record
    FROM review_period_locks
    WHERE review_period_id = v_period_id
      AND lock_type = 'department'
      AND target_id = v_user_dept_id::text
    LIMIT 1;

    IF v_lock_record IS NOT NULL AND v_lock_record.is_locked THEN
      v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, v_default_value);
      RETURN v_permission_value;
    END IF;
  END IF;

  -- Priority 3: Role locks
  IF v_user_roles IS NOT NULL THEN
    FOR v_lock_record IN
      SELECT * FROM review_period_locks
      WHERE review_period_id = v_period_id
        AND lock_type = 'role'
        AND target_id = ANY(v_user_roles)
        AND is_locked = true
      ORDER BY locked_at ASC
    LOOP
      v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, v_default_value);
      IF p_action = 'view_only' AND v_permission_value THEN
        RETURN true;
      ELSIF p_action != 'view_only' AND NOT v_permission_value THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  -- Priority 4: Global lock
  SELECT * INTO v_lock_record
  FROM review_period_locks
  WHERE review_period_id = v_period_id
    AND lock_type = 'global'
    AND is_locked = true
  LIMIT 1;

  IF v_lock_record IS NOT NULL THEN
    v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, v_default_value);
    RETURN v_permission_value;
  END IF;

  RETURN v_default_value;
END;
$function$;