-- ADR-163 — Annual Review protected-auth RLS repair.
-- Direct auth.users references inside client-facing RLS policies caused every
-- annual_review_instances read to fail with permission denied for schema auth.

CREATE OR REPLACE FUNCTION public.annual_review_employee_has_login(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_employee_id
  );
$$;

REVOKE ALL ON FUNCTION public.annual_review_employee_has_login(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.annual_review_employee_has_login(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.annual_review_employee_has_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_employee_has_login(uuid) TO service_role;

DROP POLICY IF EXISTS instances_select_visible ON public.annual_review_instances;
CREATE POLICY instances_select_visible
  ON public.annual_review_instances
  FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR manager_id = auth.uid()
    OR skip_id = auth.uid()
    OR dept_head_id = auth.uid()
    OR bu_head_id = auth.uid()
    OR hr_id = auth.uid()
    OR management_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR (
      overall_status = 'completed'::public.annual_review_status
      AND public.annual_review_employee_has_login(employee_id)
      AND EXISTS (
        SELECT 1
        FROM public.annual_review_subtree_ids(auth.uid(), 6) s
        WHERE s.employee_id = annual_review_instances.employee_id
      )
    )
  );

DROP POLICY IF EXISTS responses_select_visible ON public.annual_review_responses;
CREATE POLICY responses_select_visible
  ON public.annual_review_responses
  FOR SELECT
  TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR (
      reviewer_role = 'self'::public.annual_reviewer_role
      AND EXISTS (
        SELECT 1
        FROM public.annual_review_instances i
        WHERE i.id = annual_review_responses.instance_id
          AND i.employee_id = auth.uid()
          AND i.overall_status = 'pending_self'::public.annual_review_status
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.annual_review_instances i
      WHERE i.id = annual_review_responses.instance_id
        AND (
          (i.employee_id = auth.uid() AND i.overall_status = 'completed'::public.annual_review_status)
          OR i.manager_id = auth.uid()
          OR i.skip_id = auth.uid()
          OR i.dept_head_id = auth.uid()
          OR i.bu_head_id = auth.uid()
          OR i.hr_id = auth.uid()
          OR i.management_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.annual_review_instances i
      JOIN public.annual_review_subtree_ids(auth.uid(), 6) s
        ON s.employee_id = i.employee_id
      WHERE i.id = annual_review_responses.instance_id
        AND i.overall_status = 'completed'::public.annual_review_status
        AND public.annual_review_employee_has_login(i.employee_id)
    )
  );

CREATE OR REPLACE FUNCTION public.get_hierarchy_completed_reviews(
  p_cycle_id uuid,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset integer;
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = true) THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
  END IF;

  v_is_privileged := public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'hr_pms'::public.app_role);
  v_offset := (v_page - 1) * v_page_size;

  WITH subtree AS (
    SELECT s.employee_id FROM public.annual_review_subtree_ids(v_uid, 6) s
  ),
  visible AS (
    SELECT
      i.id, i.employee_id, i.overall_status, i.total_score, i.updated_at,
      i.created_at, i.enabled_stages, i.manager_id, i.skip_id,
      i.dept_head_id, i.bu_head_id, i.hr_id, i.management_id,
      emp.full_name AS employee_name,
      emp.employee_code,
      emp.designation,
      dept.name AS department_name,
      bu.name AS business_unit_name,
      CASE
        WHEN v_is_privileged AND public.has_role(v_uid, 'admin'::public.app_role) THEN 'admin'
        WHEN v_is_privileged THEN 'hr'
        WHEN i.management_id = v_uid THEN 'management'
        WHEN i.bu_head_id = v_uid THEN 'bu_head'
        WHEN i.dept_head_id = v_uid THEN 'dept_head'
        WHEN i.skip_id = v_uid THEN 'skip'
        WHEN i.manager_id = v_uid THEN 'manager'
        ELSE 'upline'
      END AS viewer_relationship
    FROM public.annual_review_instances i
    JOIN public.profiles emp ON emp.id = i.employee_id
    LEFT JOIN public.departments dept ON dept.id = emp.department_id
    LEFT JOIN public.business_units bu ON bu.id = dept.business_unit_id
    WHERE i.cycle_id = p_cycle_id
      AND i.overall_status = 'completed'::public.annual_review_status
      AND public.annual_review_employee_has_login(i.employee_id)
      AND (
        v_is_privileged
        OR i.manager_id = v_uid
        OR i.skip_id = v_uid
        OR i.dept_head_id = v_uid
        OR i.bu_head_id = v_uid
        OR i.hr_id = v_uid
        OR i.management_id = v_uid
        OR EXISTS (SELECT 1 FROM subtree s WHERE s.employee_id = i.employee_id)
      )
      AND (
        v_search IS NULL
        OR emp.full_name ILIKE '%' || v_search || '%'
        OR emp.employee_code ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (SELECT COUNT(*)::bigint AS c FROM visible),
  paged AS (
    SELECT * FROM visible
    ORDER BY updated_at DESC NULLS LAST, id
    OFFSET v_offset LIMIT v_page_size
  )
  SELECT
    (SELECT c FROM counted),
    COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb)
  INTO v_total, v_rows
  FROM paged;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.get_hierarchy_completed_reviews(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_hierarchy_completed_reviews(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_hierarchy_completed_reviews(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hierarchy_completed_reviews(uuid, text, integer, integer) TO service_role;