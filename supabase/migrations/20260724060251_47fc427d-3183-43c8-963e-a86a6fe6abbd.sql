-- ADR-149: Management scope on Team Annual Review queue
CREATE OR REPLACE FUNCTION public.get_my_annual_review_queue(
  p_cycle_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_search text DEFAULT NULL::text,
  p_status text DEFAULT 'all'::text,
  p_scope text DEFAULT 'any'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF v_scope NOT IN ('any', 'manager', 'skip', 'dept', 'bu', 'hr', 'management', 'subtree') THEN
    RAISE EXCEPTION 'Invalid reviewer scope: %', v_scope USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('all', 'not_started', 'pending_self', 'pending_manager', 'pending_skip', 'pending_dept', 'pending_bu', 'pending_hr', 'pending_management', 'completed') THEN
    RAISE EXCEPTION 'Invalid annual review status: %', v_status USING ERRCODE = '22023';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH subtree AS (
    SELECT s.employee_id FROM public.annual_review_subtree_ids(v_uid, 6) s
  ),
  visible AS (
    SELECT
      i.*,
      jsonb_build_object(
        'id', employee.id,
        'full_name', employee.full_name,
        'employee_code', employee.employee_code,
        'designation', employee.designation,
        'doj', employee.doj
      ) AS employee_json,
      (
        (i.enabled_stages ? 'manager'       AND i.manager_id     = v_uid)
        OR (i.enabled_stages ? 'skip_manager' AND i.skip_id        = v_uid)
        OR (i.enabled_stages ? 'dept_head'    AND i.dept_head_id   = v_uid)
        OR (i.enabled_stages ? 'bu_head'      AND i.bu_head_id     = v_uid)
        OR (i.enabled_stages ? 'hr'           AND i.hr_id          = v_uid)
        OR (i.enabled_stages ? 'management'   AND i.management_id  = v_uid)
      ) AS is_named,
      EXISTS (SELECT 1 FROM subtree s WHERE s.employee_id = i.employee_id) AS is_subtree
    FROM public.annual_review_instances i
    JOIN public.profiles employee ON employee.id = i.employee_id
    WHERE i.cycle_id = p_cycle_id
      AND i.overall_status <> 'excluded'::public.annual_review_status
      AND (v_status = 'all' OR i.overall_status::text = v_status)
      AND (v_search IS NULL
           OR employee.full_name    ILIKE '%' || v_search || '%'
           OR employee.employee_code ILIKE '%' || v_search || '%')
  ),
  scoped AS (
    SELECT v.* FROM visible v
    WHERE CASE v_scope
      WHEN 'manager'    THEN v.enabled_stages ? 'manager'       AND v.manager_id     = v_uid
      WHEN 'skip'       THEN v.enabled_stages ? 'skip_manager'  AND v.skip_id        = v_uid
      WHEN 'dept'       THEN v.enabled_stages ? 'dept_head'     AND v.dept_head_id   = v_uid
      WHEN 'bu'         THEN v.enabled_stages ? 'bu_head'       AND v.bu_head_id     = v_uid
      WHEN 'hr'         THEN v.enabled_stages ? 'hr'            AND v.hr_id          = v_uid
      WHEN 'management' THEN v.enabled_stages ? 'management'    AND v.management_id  = v_uid
      WHEN 'subtree'    THEN v.is_subtree
      ELSE (v.is_named OR v.is_subtree)
    END
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS c FROM scoped
  ),
  paged AS (
    SELECT s.*
    FROM scoped s
    ORDER BY s.created_at DESC, s.id
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    (SELECT c FROM counted),
    COALESCE(
      (SELECT jsonb_agg(
        to_jsonb(p) - 'employee_json' - 'is_named' - 'is_subtree'
        || jsonb_build_object(
             'employee', p.employee_json,
             'visibility_only', NOT p.is_named
           )
      ) FROM paged p),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_annual_review_role_counts(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = true) THEN
    RAISE EXCEPTION 'Active reviewer profile required' USING ERRCODE = '42501';
  END IF;

  WITH subtree AS (
    SELECT s.employee_id FROM public.annual_review_subtree_ids(v_uid, 6) s
  )
  SELECT jsonb_build_object(
    'manager',    COUNT(*) FILTER (WHERE i.enabled_stages ? 'manager'       AND i.manager_id     = v_uid),
    'skip',       COUNT(*) FILTER (WHERE i.enabled_stages ? 'skip_manager'  AND i.skip_id        = v_uid),
    'dept',       COUNT(*) FILTER (WHERE i.enabled_stages ? 'dept_head'     AND i.dept_head_id   = v_uid),
    'bu',         COUNT(*) FILTER (WHERE i.enabled_stages ? 'bu_head'       AND i.bu_head_id     = v_uid),
    'hr',         COUNT(*) FILTER (WHERE i.enabled_stages ? 'hr'            AND i.hr_id          = v_uid),
    'management', COUNT(*) FILTER (WHERE i.enabled_stages ? 'management'    AND i.management_id  = v_uid),
    'subtree',    COUNT(*) FILTER (
                    WHERE EXISTS (SELECT 1 FROM subtree s WHERE s.employee_id = i.employee_id)
                      AND NOT (
                           (i.enabled_stages ? 'manager'      AND i.manager_id     = v_uid)
                        OR (i.enabled_stages ? 'skip_manager' AND i.skip_id        = v_uid)
                        OR (i.enabled_stages ? 'dept_head'    AND i.dept_head_id   = v_uid)
                        OR (i.enabled_stages ? 'bu_head'      AND i.bu_head_id     = v_uid)
                        OR (i.enabled_stages ? 'hr'           AND i.hr_id          = v_uid)
                        OR (i.enabled_stages ? 'management'   AND i.management_id  = v_uid)
                      )
                  )
  )
  INTO v_result
  FROM public.annual_review_instances i
  WHERE i.cycle_id = p_cycle_id
    AND i.overall_status <> 'excluded'::public.annual_review_status
    AND (
      EXISTS (SELECT 1 FROM subtree s WHERE s.employee_id = i.employee_id)
      OR (i.enabled_stages ? 'manager'      AND i.manager_id     = v_uid)
      OR (i.enabled_stages ? 'skip_manager' AND i.skip_id        = v_uid)
      OR (i.enabled_stages ? 'dept_head'    AND i.dept_head_id   = v_uid)
      OR (i.enabled_stages ? 'bu_head'      AND i.bu_head_id     = v_uid)
      OR (i.enabled_stages ? 'hr'           AND i.hr_id          = v_uid)
      OR (i.enabled_stages ? 'management'   AND i.management_id  = v_uid)
    );

  RETURN COALESCE(v_result, '{"manager":0,"skip":0,"dept":0,"bu":0,"hr":0,"management":0,"subtree":0}'::jsonb);
END;
$function$;