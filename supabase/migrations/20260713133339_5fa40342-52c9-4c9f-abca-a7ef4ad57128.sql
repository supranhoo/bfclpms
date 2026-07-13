-- §AR-PILOT-ALLOWLIST-SSOT: instance assignment implies pilot access.
CREATE OR REPLACE FUNCTION public.is_feature_flag_enabled_for_me(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_value          boolean;
  v_target_roles   public.app_role[];
  v_target_users   uuid[];
  v_uid            uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'boolean' THEN (value)::text::boolean
      WHEN jsonb_typeof(value) = 'string'  THEN ((value #>> '{}') = 'true')
      ELSE false
    END,
    target_roles,
    target_user_ids
  INTO v_value, v_target_roles, v_target_users
  FROM public.admin_feature_flags
  WHERE key = p_key;

  IF NOT FOUND OR NOT v_value THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF coalesce(array_length(v_target_roles,1),0) = 0
     AND coalesce(array_length(v_target_users,1),0) = 0 THEN
    RETURN true;
  END IF;

  IF v_uid = ANY(v_target_users) THEN
    RETURN true;
  END IF;

  IF coalesce(array_length(v_target_roles,1),0) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.role = ANY(v_target_roles)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- §AR-PILOT-ALLOWLIST-SSOT (2026-07):
  -- For the Annual Review pilot flag, any user already assigned to a
  -- non-excluded instance in the current active cycle (as reviewee or any
  -- reviewer) implicitly passes. Prevents the silent drift where a seeded
  -- reviewee is missing from target_user_ids and cannot open self-review.
  IF p_key = 'annual_review_enabled' THEN
    IF EXISTS (
      SELECT 1
      FROM public.annual_review_instances i
      JOIN public.annual_review_cycles c ON c.id = i.cycle_id
      WHERE c.status = 'active'
        AND i.overall_status <> 'excluded'
        AND (
          i.employee_id  = v_uid OR
          i.manager_id   = v_uid OR
          i.skip_id      = v_uid OR
          i.dept_head_id = v_uid OR
          i.bu_head_id   = v_uid OR
          i.hr_id        = v_uid
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;