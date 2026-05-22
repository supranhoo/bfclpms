-- 1. Add targeting columns (additive, safe defaults)
ALTER TABLE public.admin_feature_flags
  ADD COLUMN IF NOT EXISTS target_roles    public.app_role[] NOT NULL DEFAULT '{}'::public.app_role[],
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[]            NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.admin_feature_flags.target_roles    IS 'When non-empty, flag only applies to users having at least one of these roles. Admins always bypass.';
COMMENT ON COLUMN public.admin_feature_flags.target_user_ids IS 'When non-empty, flag also applies to users with these explicit IDs. Combined OR with target_roles. Admins always bypass.';

-- 2. SECURITY DEFINER helper: evaluates master switch + targeting for current user
CREATE OR REPLACE FUNCTION public.is_feature_flag_enabled_for_me(p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Admins always pass once master switch is ON
  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  -- No targeting = enabled for everyone
  IF coalesce(array_length(v_target_roles,1),0) = 0
     AND coalesce(array_length(v_target_users,1),0) = 0 THEN
    RETURN true;
  END IF;

  -- Explicit user list match
  IF v_uid = ANY(v_target_users) THEN
    RETURN true;
  END IF;

  -- Role match
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

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_flag_enabled_for_me(text) TO authenticated;