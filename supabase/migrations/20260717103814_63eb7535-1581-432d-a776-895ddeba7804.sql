CREATE OR REPLACE FUNCTION public.get_my_annual_review_queue(
  p_cycle_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_scope text DEFAULT 'any'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset integer;
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_status text := COALESCE(NULLIF(BTRIM(p_status), ''), 'all');
  v_scope text := COALESCE(NULLIF(BTRIM(p_scope), ''), 'any');
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = true) THEN
    RAISE EXCEPTION 'Active reviewer profile required' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('any', 'manager', 'skip', 'dept', 'bu', 'hr') THEN
    RAISE EXCEPTION 'Invalid reviewer scope: %', v_scope USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('all', 'not_started', 'pending_self', 'pending_manager', 'pending_skip', 'pending_dept', 'pending_bu', 'pending_hr', 'completed') THEN
    RAISE EXCEPTION 'Invalid annual review status: %', v_status USING ERRCODE = '22023';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH visible AS (
    SELECT i.id
    FROM public.annual_review_instances i
    JOIN public.profiles employee ON employee.id = i.employee_id
    WHERE i.cycle_id = p_cycle_id
      AND i.overall_status <> 'excluded'::public.annual_review_status
      AND (v_status = 'all' OR i.overall_status::text = v_status)
      AND (v_search IS NULL OR employee.full_name ILIKE '%' || v_search || '%' OR employee.employee_code ILIKE '%' || v_search || '%')
      AND CASE v_scope
        WHEN 'manager' THEN i.enabled_stages ? 'manager' AND i.manager_id = v_uid
        WHEN 'skip' THEN i.enabled_stages ? 'skip_manager' AND i.skip_id = v_uid
        WHEN 'dept' THEN i.enabled_stages ? 'dept_head' AND i.dept_head_id = v_uid
        WHEN 'bu' THEN i.enabled_stages ? 'bu_head' AND i.bu_head_id = v_uid
        WHEN 'hr' THEN i.enabled_stages ? 'hr' AND i.hr_id = v_uid
        ELSE (
          (i.enabled_stages ? 'manager' AND i.manager_id = v_uid)
          OR (i.enabled_stages ? 'skip_manager' AND i.skip_id = v_uid)
          OR (i.enabled_stages ? 'dept_head' AND i.dept_head_id = v_uid)
          OR (i.enabled_stages ? 'bu_head' AND i.bu_head_id = v_uid)
          OR (i.enabled_stages ? 'hr' AND i.hr_id = v_uid)
        )
      END
  )
  SELECT COUNT(*) INTO v_total FROM visible;

  WITH visible AS (
    SELECT
      i,
      jsonb_build_object(
        'id', employee.id,
        'full_name', employee.full_name,
        'employee_code', employee.employee_code,
        'designation', employee.designation,
        'doj', employee.doj
      ) AS employee_json
    FROM public.annual_review_instances i
    JOIN public.profiles employee ON employee.id = i.employee_id
    WHERE i.cycle_id = p_cycle_id
      AND i.overall_status <> 'excluded'::public.annual_review_status
      AND (v_status = 'all' OR i.overall_status::text = v_status)
      AND (v_search IS NULL OR employee.full_name ILIKE '%' || v_search || '%' OR employee.employee_code ILIKE '%' || v_search || '%')
      AND CASE v_scope
        WHEN 'manager' THEN i.enabled_stages ? 'manager' AND i.manager_id = v_uid
        WHEN 'skip' THEN i.enabled_stages ? 'skip_manager' AND i.skip_id = v_uid
        WHEN 'dept' THEN i.enabled_stages ? 'dept_head' AND i.dept_head_id = v_uid
        WHEN 'bu' THEN i.enabled_stages ? 'bu_head' AND i.bu_head_id = v_uid
        WHEN 'hr' THEN i.enabled_stages ? 'hr' AND i.hr_id = v_uid
        ELSE (
          (i.enabled_stages ? 'manager' AND i.manager_id = v_uid)
          OR (i.enabled_stages ? 'skip_manager' AND i.skip_id = v_uid)
          OR (i.enabled_stages ? 'dept_head' AND i.dept_head_id = v_uid)
          OR (i.enabled_stages ? 'bu_head' AND i.bu_head_id = v_uid)
          OR (i.enabled_stages ? 'hr' AND i.hr_id = v_uid)
        )
      END
    ORDER BY i.created_at DESC, i.id
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(v.i) || jsonb_build_object('employee', v.employee_json)),
    '[]'::jsonb
  )
  INTO v_rows
  FROM visible v;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_annual_review_queue(uuid, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_annual_review_queue(uuid, integer, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_annual_review_queue(uuid, integer, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_annual_review_queue(uuid, integer, integer, text, text, text) TO service_role;