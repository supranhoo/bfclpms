
-- ============================================================================
-- ADR-144: Admin-managed Annual Review directory overrides & access control tab
-- ============================================================================

-- 1) Overrides table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_review_directory_overrides (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  override_type text NOT NULL CHECK (override_type IN ('grant_all','grant_bu','grant_team','deny')),
  business_unit_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  can_assist boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_directory_overrides TO authenticated;
GRANT ALL ON public.annual_review_directory_overrides TO service_role;

ALTER TABLE public.annual_review_directory_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_overrides_admin_hrpms_read"
  ON public.annual_review_directory_overrides FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "ar_overrides_admin_hrpms_write"
  ON public.annual_review_directory_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "ar_overrides_admin_hrpms_update"
  ON public.annual_review_directory_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "ar_overrides_admin_hrpms_delete"
  ON public.annual_review_directory_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE TRIGGER trg_ar_overrides_updated_at
  BEFORE UPDATE ON public.annual_review_directory_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Audit table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_review_access_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid,
  action text NOT NULL CHECK (action IN ('kill_switch_toggled','override_upserted','override_deleted')),
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.annual_review_access_audit TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.annual_review_access_audit_id_seq TO authenticated;
GRANT ALL ON public.annual_review_access_audit TO service_role;
GRANT ALL ON SEQUENCE public.annual_review_access_audit_id_seq TO service_role;

ALTER TABLE public.annual_review_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_access_audit_read"
  ON public.annual_review_access_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "ar_access_audit_insert"
  ON public.annual_review_access_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

CREATE INDEX IF NOT EXISTS idx_ar_access_audit_created_at
  ON public.annual_review_access_audit (created_at DESC);

-- 3) Resolver rewrite -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hr_bu       uuid;
  v_match       boolean;
  v_team        boolean;
  v_bu_ids      uuid[] := ARRAY[]::uuid[];
  v_home_bu     uuid;
  v_override    public.annual_review_directory_overrides%ROWTYPE;
  v_can_assist  boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false, 'can_assist', false);
  END IF;

  -- Step A: override lookup (deny wins; explicit grants short-circuit).
  SELECT * INTO v_override
  FROM public.annual_review_directory_overrides
  WHERE user_id = v_uid;

  IF FOUND THEN
    v_can_assist := v_override.can_assist;

    IF v_override.override_type = 'deny' THEN
      RETURN jsonb_build_object(
        'can_access', false,
        'can_assist', false,
        'source', 'override_deny'
      );
    ELSIF v_override.override_type = 'grant_all' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'all',
        'business_unit_id', NULL,
        'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_can_assist,
        'source', 'override_grant_all'
      );
    ELSIF v_override.override_type = 'grant_bu' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'bu',
        'business_unit_id', COALESCE(v_override.business_unit_ids[1], NULL),
        'business_unit_ids', to_jsonb(COALESCE(v_override.business_unit_ids, ARRAY[]::uuid[])),
        'can_assist', v_can_assist,
        'source', 'override_grant_bu'
      );
    ELSIF v_override.override_type = 'grant_team' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'team',
        'business_unit_id', NULL,
        'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_can_assist,
        'source', 'override_grant_team'
      );
    END IF;
  END IF;

  -- Step B: auto rules (unchanged from prior implementation).
  IF public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'hr_pms'::app_role) THEN
    RETURN jsonb_build_object(
      'can_access', true, 'scope', 'all',
      'business_unit_id', NULL,
      'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', v_can_assist,
      'source', 'role'
    );
  END IF;

  SELECT hr_business_unit_id INTO v_hr_bu
  FROM public.org_head_config
  WHERE hr_business_unit_id IS NOT NULL
  ORDER BY id
  LIMIT 1;

  IF v_hr_bu IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.departments d ON d.id = p.department_id
      WHERE p.id = v_uid AND p.is_active = true AND d.business_unit_id = v_hr_bu
    ) INTO v_match;
    IF v_match THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'all',
        'business_unit_id', NULL,
        'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_can_assist,
        'source', 'hr_bu'
      );
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT bu_id) FILTER (WHERE bu_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_bu_ids
  FROM (
    SELECT id AS bu_id FROM public.business_units WHERE head_user_id = v_uid
    UNION
    SELECT business_unit_id AS bu_id FROM public.departments
      WHERE head_user_id = v_uid AND business_unit_id IS NOT NULL
  ) s;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.reporting_manager_id = v_uid AND p.is_active = true
  ) OR EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.profiles pm ON pm.id = p.reporting_manager_id
     WHERE pm.reporting_manager_id = v_uid AND p.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.manager_id = v_uid OR i.skip_id = v_uid
  ) INTO v_team;

  IF array_length(v_bu_ids, 1) IS NOT NULL OR v_team THEN
    SELECT d.business_unit_id INTO v_home_bu
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE p.id = v_uid AND p.is_active = true;

    IF v_home_bu IS NOT NULL AND NOT (v_home_bu = ANY(v_bu_ids)) THEN
      v_bu_ids := v_bu_ids || v_home_bu;
    END IF;
  END IF;

  IF array_length(v_bu_ids, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_access', true, 'scope', 'bu',
      'business_unit_id', v_bu_ids[1],
      'business_unit_ids', to_jsonb(v_bu_ids),
      'can_assist', v_can_assist,
      'source', 'bu_or_hod'
    );
  END IF;

  IF v_team THEN
    RETURN jsonb_build_object(
      'can_access', true, 'scope', 'team',
      'business_unit_id', NULL,
      'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', v_can_assist,
      'source', 'reporting_manager'
    );
  END IF;

  RETURN jsonb_build_object('can_access', false, 'can_assist', false, 'source', 'none');
END;
$function$;

-- 4) Explain helper for admin viewer ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_annual_review_access_explain(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_access      jsonb;
  v_override    public.annual_review_directory_overrides%ROWTYPE;
  v_is_admin    boolean;
  v_is_hrpms    boolean;
  v_hr_bu_match boolean := false;
  v_bu_heads    jsonb;
  v_hods        jsonb;
  v_direct      int;
  v_skip        int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','missing user');
  END IF;

  -- Only admins/hr_pms may run explain.
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  SELECT * INTO v_override FROM public.annual_review_directory_overrides WHERE user_id = v_uid;

  v_is_admin := public.has_role(v_uid,'admin'::app_role);
  v_is_hrpms := public.has_role(v_uid,'hr_pms'::app_role);

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    JOIN public.org_head_config c ON c.hr_business_unit_id = d.business_unit_id
    WHERE p.id = v_uid AND p.is_active = true
  ) INTO v_hr_bu_match;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
    INTO v_bu_heads
  FROM public.business_units WHERE head_user_id = v_uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
    INTO v_hods
  FROM public.departments WHERE head_user_id = v_uid;

  SELECT count(*) INTO v_direct FROM public.profiles WHERE reporting_manager_id = v_uid AND is_active = true;
  SELECT count(*) INTO v_skip FROM public.profiles p
    JOIN public.profiles pm ON pm.id = p.reporting_manager_id
    WHERE pm.reporting_manager_id = v_uid AND p.is_active = true;

  RETURN jsonb_build_object(
    'access', v_access,
    'override', CASE WHEN v_override.user_id IS NULL THEN NULL ELSE to_jsonb(v_override) END,
    'auto', jsonb_build_object(
      'is_admin', v_is_admin,
      'is_hr_pms', v_is_hrpms,
      'in_hr_bu', v_hr_bu_match,
      'bu_head_of', v_bu_heads,
      'hod_of', v_hods,
      'direct_reports', v_direct,
      'skip_reports', v_skip
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_annual_review_access_explain(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_annual_review_access_explain(uuid) TO authenticated, service_role;

-- 5) Kill-switch mutator with server-side audit ----------------------------
CREATE OR REPLACE FUNCTION public.set_annual_review_access_setting(
  p_key text,
  p_value boolean,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_key NOT IN ('annual_review_directory_search_enabled','assisted_self_submission_enabled') THEN
    RAISE EXCEPTION 'invalid setting key: %', p_key;
  END IF;

  IF p_key = 'annual_review_directory_search_enabled' THEN
    SELECT annual_review_directory_search_enabled INTO v_before FROM public.app_settings LIMIT 1;
    UPDATE public.app_settings SET annual_review_directory_search_enabled = p_value, updated_at = now();
  ELSE
    SELECT assisted_self_submission_enabled INTO v_before FROM public.app_settings LIMIT 1;
    UPDATE public.app_settings SET assisted_self_submission_enabled = p_value, updated_at = now();
  END IF;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
  VALUES (
    auth.uid(), NULL, 'kill_switch_toggled',
    jsonb_build_object('key', p_key, 'value', v_before),
    jsonb_build_object('key', p_key, 'value', p_value),
    p_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_annual_review_access_setting(text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_annual_review_access_setting(text, boolean, text) TO authenticated, service_role;

-- 6) Override upsert / delete RPCs (server-side audit) ---------------------
CREATE OR REPLACE FUNCTION public.upsert_annual_review_directory_override(
  p_user_id uuid,
  p_override_type text,
  p_business_unit_ids uuid[],
  p_can_assist boolean,
  p_reason text
) RETURNS public.annual_review_directory_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before public.annual_review_directory_overrides%ROWTYPE;
  v_after  public.annual_review_directory_overrides%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_override_type NOT IN ('grant_all','grant_bu','grant_team','deny') THEN
    RAISE EXCEPTION 'invalid override_type';
  END IF;

  SELECT * INTO v_before FROM public.annual_review_directory_overrides WHERE user_id = p_user_id;

  INSERT INTO public.annual_review_directory_overrides
    (user_id, override_type, business_unit_ids, can_assist, reason, created_by)
  VALUES
    (p_user_id, p_override_type, COALESCE(p_business_unit_ids, ARRAY[]::uuid[]),
     COALESCE(p_can_assist, true), p_reason, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET override_type = EXCLUDED.override_type,
        business_unit_ids = EXCLUDED.business_unit_ids,
        can_assist = EXCLUDED.can_assist,
        reason = EXCLUDED.reason,
        updated_at = now()
  RETURNING * INTO v_after;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
  VALUES (
    auth.uid(), p_user_id, 'override_upserted',
    CASE WHEN v_before.user_id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after),
    p_reason
  );

  RETURN v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_annual_review_directory_override(uuid, text, uuid[], boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_annual_review_directory_override(uuid, text, uuid[], boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_annual_review_directory_override(
  p_user_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before public.annual_review_directory_overrides%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_before FROM public.annual_review_directory_overrides WHERE user_id = p_user_id;
  IF v_before.user_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.annual_review_directory_overrides WHERE user_id = p_user_id;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
  VALUES (auth.uid(), p_user_id, 'override_deleted', to_jsonb(v_before), NULL, p_reason);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_annual_review_directory_override(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_annual_review_directory_override(uuid, text) TO authenticated, service_role;
