
-- ADR-145 — Split Directory Search vs Assisted Self-Submission

CREATE TABLE IF NOT EXISTS public.annual_review_role_capabilities (
  role_source   text PRIMARY KEY,
  can_search    boolean NOT NULL DEFAULT true,
  can_assist    boolean NOT NULL DEFAULT false,
  assist_scope  text    NOT NULL DEFAULT 'same_as_search',
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ar_role_capabilities_source_chk
    CHECK (role_source IN ('admin','hr_pms','hr_team','bu_head','hod','reporting_manager','skip_manager')),
  CONSTRAINT ar_role_capabilities_scope_chk
    CHECK (assist_scope IN ('same_as_search','direct_reports_only','none'))
);

GRANT SELECT ON public.annual_review_role_capabilities TO authenticated;
GRANT ALL    ON public.annual_review_role_capabilities TO service_role;

ALTER TABLE public.annual_review_role_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AR role capabilities read"  ON public.annual_review_role_capabilities;
DROP POLICY IF EXISTS "AR role capabilities admin" ON public.annual_review_role_capabilities;

CREATE POLICY "AR role capabilities read"
  ON public.annual_review_role_capabilities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "AR role capabilities admin"
  ON public.annual_review_role_capabilities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role));

INSERT INTO public.annual_review_role_capabilities (role_source, can_search, can_assist, assist_scope) VALUES
  ('admin',             true, true,  'same_as_search'),
  ('hr_pms',            true, true,  'same_as_search'),
  ('hr_team',           true, true,  'same_as_search'),
  ('bu_head',           true, false, 'same_as_search'),
  ('hod',               true, false, 'same_as_search'),
  ('reporting_manager', true, false, 'same_as_search'),
  ('skip_manager',      true, false, 'same_as_search')
ON CONFLICT (role_source) DO NOTHING;

CREATE OR REPLACE FUNCTION public._ar_role_caps_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_role_caps_touch ON public.annual_review_role_capabilities;
CREATE TRIGGER trg_ar_role_caps_touch
  BEFORE UPDATE ON public.annual_review_role_capabilities
  FOR EACH ROW EXECUTE FUNCTION public._ar_role_caps_touch();

-- Rewrite the resolver
CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_hr_bu       uuid;
  v_hr_bu_match boolean := false;
  v_bu_ids      uuid[] := ARRAY[]::uuid[];
  v_home_bu     uuid;
  v_team        boolean := false;
  v_override    public.annual_review_directory_overrides%ROWTYPE;
  v_source      text;
  v_scope       text := 'none';
  v_can_search  boolean := false;
  v_can_assist  boolean := false;
  v_assist_scope text := 'none';
  v_cap         public.annual_review_role_capabilities%ROWTYPE;
  v_assist_bu_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false, 'can_assist', false, 'source', 'none');
  END IF;

  SELECT * INTO v_override FROM public.annual_review_directory_overrides WHERE user_id = v_uid;
  IF FOUND THEN
    IF v_override.override_type = 'deny' THEN
      RETURN jsonb_build_object(
        'can_access', false, 'scope', 'none',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', false,
        'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_deny'),
        'source', 'override_deny'
      );
    ELSIF v_override.override_type = 'grant_all' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'all',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'all' ELSE 'none' END, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_grant_all'),
        'source', 'override_grant_all'
      );
    ELSIF v_override.override_type = 'grant_bu' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'bu',
        'business_unit_id', COALESCE(v_override.business_unit_ids[1], NULL),
        'business_unit_ids', to_jsonb(COALESCE(v_override.business_unit_ids, ARRAY[]::uuid[])),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'bu' ELSE 'none' END, 'business_unit_ids', to_jsonb(COALESCE(v_override.business_unit_ids, ARRAY[]::uuid[])), 'source', 'override_grant_bu'),
        'source', 'override_grant_bu'
      );
    ELSIF v_override.override_type = 'grant_team' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'team',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'team' ELSE 'none' END, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_grant_team'),
        'source', 'override_grant_team'
      );
    END IF;
  END IF;

  IF public.has_role(v_uid,'admin'::app_role) THEN
    v_source := 'admin'; v_scope := 'all';
  ELSIF public.has_role(v_uid,'hr_pms'::app_role) THEN
    v_source := 'hr_pms'; v_scope := 'all';
  ELSE
    SELECT hr_business_unit_id INTO v_hr_bu FROM public.org_head_config
     WHERE hr_business_unit_id IS NOT NULL ORDER BY id LIMIT 1;
    IF v_hr_bu IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON d.id = p.department_id
        WHERE p.id = v_uid AND p.is_active = true AND d.business_unit_id = v_hr_bu
      ) INTO v_hr_bu_match;
    END IF;

    IF v_hr_bu_match THEN
      v_source := 'hr_team'; v_scope := 'all';
    ELSE
      SELECT COALESCE(array_agg(DISTINCT bu_id) FILTER (WHERE bu_id IS NOT NULL), ARRAY[]::uuid[])
        INTO v_bu_ids
      FROM (
        SELECT id AS bu_id FROM public.business_units WHERE head_user_id = v_uid
        UNION
        SELECT business_unit_id AS bu_id FROM public.departments
          WHERE head_user_id = v_uid AND business_unit_id IS NOT NULL
      ) s;

      SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.reporting_manager_id = v_uid AND p.is_active = true
      ) OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.profiles pm ON pm.id = p.reporting_manager_id
         WHERE pm.reporting_manager_id = v_uid AND p.is_active = true
      ) OR EXISTS (
        SELECT 1 FROM public.annual_review_instances i
         WHERE i.manager_id = v_uid OR i.skip_id = v_uid
      ) INTO v_team;

      IF array_length(v_bu_ids, 1) IS NOT NULL OR v_team THEN
        SELECT d.business_unit_id INTO v_home_bu FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.id = v_uid AND p.is_active = true;
        IF v_home_bu IS NOT NULL AND NOT (v_home_bu = ANY(v_bu_ids)) THEN
          v_bu_ids := v_bu_ids || v_home_bu;
        END IF;
      END IF;

      IF array_length(v_bu_ids, 1) IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.business_units WHERE head_user_id = v_uid) THEN
          v_source := 'bu_head';
        ELSE
          v_source := 'hod';
        END IF;
        v_scope := 'bu';
      ELSIF v_team THEN
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.reporting_manager_id = v_uid AND p.is_active = true) THEN
          v_source := 'reporting_manager';
        ELSE
          v_source := 'skip_manager';
        END IF;
        v_scope := 'team';
      END IF;
    END IF;
  END IF;

  IF v_source IS NULL THEN
    RETURN jsonb_build_object(
      'can_access', false, 'scope', 'none',
      'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', false,
      'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'none'),
      'source', 'none'
    );
  END IF;

  SELECT * INTO v_cap FROM public.annual_review_role_capabilities WHERE role_source = v_source;
  v_can_search := COALESCE(v_cap.can_search, false);
  v_can_assist := COALESCE(v_cap.can_assist, false);

  IF v_can_assist THEN
    IF COALESCE(v_cap.assist_scope,'same_as_search') = 'direct_reports_only' THEN
      v_assist_scope := 'direct';
    ELSE
      v_assist_scope := v_scope;
    END IF;
  ELSE
    v_assist_scope := 'none';
  END IF;

  IF v_scope = 'bu' AND v_can_assist THEN
    v_assist_bu_ids := v_bu_ids;
  END IF;

  IF NOT v_can_search THEN
    RETURN jsonb_build_object(
      'can_access', false, 'scope', 'none',
      'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', false,
      'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'source', v_source),
      'source', v_source
    );
  END IF;

  RETURN jsonb_build_object(
    'can_access', true,
    'scope', v_scope,
    'business_unit_id', CASE WHEN v_scope = 'bu' THEN v_bu_ids[1] ELSE NULL END,
    'business_unit_ids', to_jsonb(CASE WHEN v_scope='bu' THEN v_bu_ids ELSE ARRAY[]::uuid[] END),
    'can_assist', v_can_assist,
    'assist', jsonb_build_object(
      'can_assist', v_can_assist,
      'scope', v_assist_scope,
      'business_unit_ids', to_jsonb(v_assist_bu_ids),
      'source', v_source
    ),
    'source', v_source
  );
END;
$function$;

-- Proxy submit guard
CREATE OR REPLACE FUNCTION public.can_proxy_submit_annual_review(_instance_id uuid, _proxy_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_employee_id uuid;
  v_manager_id uuid;
  v_skip_id uuid;
  v_status text;
  v_employee_email text;
  v_employee_last_signin timestamptz;
  v_designated uuid;
  v_emp_bu uuid;
  v_emp_dept uuid;
  v_access jsonb;
  v_assist jsonb;
  v_assist_scope text;
  v_assist_bu_ids uuid[];
BEGIN
  IF _proxy_user_id IS NULL OR _instance_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS DISTINCT FROM _proxy_user_id THEN RETURN false; END IF;

  SELECT assisted_self_submission_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN false; END IF;

  SELECT i.employee_id, i.manager_id, i.skip_id, i.overall_status::text, d.business_unit_id, p.department_id
    INTO v_employee_id, v_manager_id, v_skip_id, v_status, v_emp_bu, v_emp_dept
  FROM public.annual_review_instances i
  LEFT JOIN public.profiles p ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE i.id = _instance_id;

  IF v_employee_id IS NULL OR v_status <> 'pending_self' THEN RETURN false; END IF;

  SELECT p.email, u.last_sign_in_at, p.designated_proxy_user_id
    INTO v_employee_email, v_employee_last_signin, v_designated
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_employee_id;

  IF v_employee_email IS NOT NULL AND v_employee_last_signin IS NOT NULL THEN RETURN false; END IF;

  IF _proxy_user_id = v_designated THEN RETURN true; END IF;

  v_access := public.annual_review_directory_access(_proxy_user_id);
  v_assist := v_access->'assist';
  IF NOT COALESCE((v_assist->>'can_assist')::boolean, false) THEN RETURN false; END IF;

  v_assist_scope := v_assist->>'scope';
  v_assist_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'business_unit_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  IF v_assist_scope = 'all' THEN RETURN true; END IF;

  IF v_assist_scope = 'bu' THEN
    IF (v_access->>'source') = 'hod' THEN
      RETURN EXISTS (SELECT 1 FROM public.departments
                      WHERE head_user_id = _proxy_user_id AND id = v_emp_dept);
    END IF;
    RETURN v_emp_bu IS NOT NULL AND v_emp_bu = ANY(v_assist_bu_ids);
  END IF;

  IF v_assist_scope = 'team' THEN
    RETURN EXISTS (SELECT 1 FROM public.annual_review_subtree_ids(_proxy_user_id) AS s(id)
                    WHERE s.id = v_employee_id);
  END IF;

  IF v_assist_scope = 'direct' THEN
    RETURN v_manager_id = _proxy_user_id
        OR EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_employee_id AND p.reporting_manager_id = _proxy_user_id);
  END IF;

  RETURN false;
END;
$function$;

-- Drop the old signature so we can add a new output column
DROP FUNCTION IF EXISTS public.search_active_employees_for_review(text, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.search_active_employees_for_review(
  p_query text, p_cycle_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  employee_id uuid, full_name text, employee_code text, designation text,
  department_id uuid, has_email boolean, has_signed_in boolean,
  instance_id uuid, overall_status text, in_my_queue boolean,
  can_assist_this_employee boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_lim    int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off    int  := greatest(coalesce(p_offset, 0), 0);
  v_access jsonb;
  v_scope  text;
  v_bu_ids uuid[];
  v_assist jsonb;
  v_assist_scope text;
  v_assist_bu_ids uuid[];
  v_source text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RAISE EXCEPTION 'permission denied: directory access not granted' USING ERRCODE = '42501';
  END IF;

  v_scope  := v_access->>'scope';
  v_source := v_access->>'source';
  v_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'business_unit_ids'))::uuid[],
    CASE WHEN NULLIF(v_access->>'business_unit_id','') IS NOT NULL
         THEN ARRAY[(v_access->>'business_unit_id')::uuid]
         ELSE ARRAY[]::uuid[] END
  );

  v_assist := v_access->'assist';
  v_assist_scope := COALESCE(v_assist->>'scope','none');
  v_assist_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'business_unit_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.employee_code, p.designation, p.department_id,
    (p.email IS NOT NULL AND length(trim(p.email)) > 0),
    (u.last_sign_in_at IS NOT NULL),
    i.id, i.overall_status::text,
    (i.manager_id = v_uid OR i.skip_id = v_uid OR i.bu_head_id = v_uid OR i.hr_id = v_uid),
    (
      CASE v_assist_scope
        WHEN 'all'    THEN true
        WHEN 'bu'     THEN CASE
                             WHEN v_source = 'hod'
                               THEN EXISTS (SELECT 1 FROM public.departments dd
                                             WHERE dd.head_user_id = v_uid AND dd.id = p.department_id)
                             ELSE d.business_unit_id = ANY(v_assist_bu_ids)
                           END
        WHEN 'team'   THEN EXISTS (SELECT 1 FROM public.annual_review_subtree_ids(v_uid) AS s(id) WHERE s.id = p.id)
        WHEN 'direct' THEN (p.reporting_manager_id = v_uid)
        ELSE false
      END
    )
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.annual_review_instances i ON i.employee_id = p.id AND i.cycle_id = p_cycle_id
  WHERE p.is_active = true
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu'   AND d.business_unit_id = ANY(v_bu_ids))
      OR (v_scope = 'team' AND (
            p.reporting_manager_id = v_uid
            OR EXISTS (SELECT 1 FROM public.profiles pm
                        WHERE pm.id = p.reporting_manager_id AND pm.reporting_manager_id = v_uid)
            OR (i.manager_id = v_uid OR i.skip_id = v_uid)
         ))
    )
    AND (
      v_q IS NULL
      OR p.full_name     ILIKE '%' || v_q || '%'
      OR p.employee_code ILIKE '%' || v_q || '%'
    )
  ORDER BY
    (CASE WHEN v_q IS NOT NULL AND lower(p.employee_code) = lower(v_q) THEN 0 ELSE 1 END),
    (CASE WHEN v_q IS NOT NULL AND p.full_name ILIKE v_q || '%' THEN 0 ELSE 1 END),
    p.full_name ASC
  LIMIT v_lim OFFSET v_off;
END;
$function$;

-- Explain RPC extended with capability
CREATE OR REPLACE FUNCTION public.get_annual_review_access_explain(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_access jsonb;
  v_override public.annual_review_directory_overrides%ROWTYPE;
  v_is_admin boolean; v_is_hrpms boolean; v_hr_bu_match boolean := false;
  v_bu_heads jsonb; v_hods jsonb; v_direct int; v_skip int;
  v_cap public.annual_review_role_capabilities%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','missing user'); END IF;
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  SELECT * INTO v_override FROM public.annual_review_directory_overrides WHERE user_id = v_uid;

  v_is_admin := public.has_role(v_uid,'admin'::app_role);
  v_is_hrpms := public.has_role(v_uid,'hr_pms'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    JOIN public.org_head_config c ON c.hr_business_unit_id = d.business_unit_id
    WHERE p.id = v_uid AND p.is_active = true
  ) INTO v_hr_bu_match;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
    INTO v_bu_heads FROM public.business_units WHERE head_user_id = v_uid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
    INTO v_hods FROM public.departments WHERE head_user_id = v_uid;

  SELECT count(*) INTO v_direct FROM public.profiles WHERE reporting_manager_id = v_uid AND is_active = true;
  SELECT count(*) INTO v_skip FROM public.profiles p
    JOIN public.profiles pm ON pm.id = p.reporting_manager_id
    WHERE pm.reporting_manager_id = v_uid AND p.is_active = true;

  SELECT * INTO v_cap FROM public.annual_review_role_capabilities
    WHERE role_source = COALESCE(v_access->>'source','none');

  RETURN jsonb_build_object(
    'access', v_access,
    'override', CASE WHEN v_override.user_id IS NULL THEN NULL ELSE to_jsonb(v_override) END,
    'capability', CASE WHEN v_cap.role_source IS NULL THEN NULL ELSE to_jsonb(v_cap) END,
    'auto', jsonb_build_object(
      'is_admin', v_is_admin, 'is_hr_pms', v_is_hrpms, 'in_hr_bu', v_hr_bu_match,
      'bu_head_of', v_bu_heads, 'hod_of', v_hods,
      'direct_reports', v_direct, 'skip_reports', v_skip
    )
  );
END;
$function$;

-- CRUD RPCs
CREATE OR REPLACE FUNCTION public.list_annual_review_role_capabilities()
RETURNS SETOF public.annual_review_role_capabilities
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.annual_review_role_capabilities ORDER BY role_source;
$$;

CREATE OR REPLACE FUNCTION public.upsert_annual_review_role_capability(
  p_role_source text, p_can_search boolean, p_can_assist boolean, p_assist_scope text, p_reason text
)
RETURNS public.annual_review_role_capabilities
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb; v_after jsonb; v_row public.annual_review_role_capabilities;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(length(trim(p_reason)),0) < 3 THEN RAISE EXCEPTION 'reason is required'; END IF;
  IF p_role_source NOT IN ('admin','hr_pms','hr_team','bu_head','hod','reporting_manager','skip_manager') THEN
    RAISE EXCEPTION 'invalid role_source: %', p_role_source;
  END IF;
  IF p_assist_scope NOT IN ('same_as_search','direct_reports_only','none') THEN
    RAISE EXCEPTION 'invalid assist_scope: %', p_assist_scope;
  END IF;

  SELECT to_jsonb(x) INTO v_before FROM public.annual_review_role_capabilities x WHERE role_source = p_role_source;

  INSERT INTO public.annual_review_role_capabilities(role_source, can_search, can_assist, assist_scope, updated_by)
  VALUES (p_role_source, p_can_search, p_can_assist, p_assist_scope, auth.uid())
  ON CONFLICT (role_source) DO UPDATE
    SET can_search = EXCLUDED.can_search,
        can_assist = EXCLUDED.can_assist,
        assist_scope = EXCLUDED.assist_scope,
        updated_by = auth.uid(),
        updated_at = now()
  RETURNING * INTO v_row;

  v_after := to_jsonb(v_row);

  INSERT INTO public.annual_review_access_audit(actor_id, target_user_id, action, before, after, reason)
  VALUES (auth.uid(), NULL, 'override_upserted', v_before, v_after,
          format('role_capability:%s — %s', p_role_source, p_reason));

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_annual_review_role_capability(text,boolean,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_annual_review_role_capability(text,boolean,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_annual_review_role_capabilities() TO authenticated;
