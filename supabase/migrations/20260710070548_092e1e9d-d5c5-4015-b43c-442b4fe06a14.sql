
CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bu   uuid;
  v_hr_bu uuid;
  v_match boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false);
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'hr_pms'::app_role) THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
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
      RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
    END IF;
  END IF;

  SELECT id INTO v_bu
  FROM public.business_units
  WHERE head_user_id = v_uid
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  SELECT business_unit_id INTO v_bu
  FROM public.departments
  WHERE head_user_id = v_uid AND business_unit_id IS NOT NULL
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  RETURN jsonb_build_object('can_access', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_active_employees_for_review(p_query text, p_cycle_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(employee_id uuid, full_name text, employee_code text, designation text, department_id uuid, has_email boolean, has_signed_in boolean, instance_id uuid, overall_status text, in_my_queue boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_lim    int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off    int  := greatest(coalesce(p_offset, 0), 0);
  v_access jsonb;
  v_scope  text;
  v_bu     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RAISE EXCEPTION 'permission denied: directory access not granted'
      USING ERRCODE = '42501';
  END IF;

  v_scope := v_access->>'scope';
  v_bu    := NULLIF(v_access->>'business_unit_id','')::uuid;

  RETURN QUERY
  SELECT
    p.id                                                AS employee_id,
    p.full_name,
    p.employee_code,
    p.designation,
    p.department_id,
    (p.email IS NOT NULL AND length(trim(p.email)) > 0) AS has_email,
    (u.last_sign_in_at IS NOT NULL)                     AS has_signed_in,
    i.id                                                AS instance_id,
    i.overall_status::text                              AS overall_status,
    (i.manager_id = v_uid OR i.skip_id = v_uid
       OR i.bu_head_id = v_uid OR i.hr_id = v_uid)     AS in_my_queue
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.annual_review_instances i
         ON i.employee_id = p.id AND i.cycle_id = p_cycle_id
  WHERE p.is_active = true
    AND (v_scope = 'all' OR d.business_unit_id = v_bu)
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
