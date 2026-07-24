-- ADR-162 — Hierarchy Visibility of Completed Annual Reviews
-- Adds read-only access for upline hierarchy to completed reviews of employees
-- with an auth.users row. Named-reviewer / admin / hr_pms paths unchanged.

-- 1) Extend instances SELECT policy with a hierarchy-completed branch.
DROP POLICY IF EXISTS instances_select_visible ON public.annual_review_instances;
CREATE POLICY instances_select_visible
  ON public.annual_review_instances
  FOR SELECT
  USING (
    employee_id    = auth.uid()
    OR manager_id    = auth.uid()
    OR skip_id       = auth.uid()
    OR dept_head_id  = auth.uid()
    OR bu_head_id    = auth.uid()
    OR hr_id         = auth.uid()
    OR management_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    -- ADR-162: upline hierarchy read for COMPLETED reviews of login-enabled employees
    OR (
      overall_status = 'completed'::annual_review_status
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = annual_review_instances.employee_id)
      AND EXISTS (
        SELECT 1
          FROM public.annual_review_subtree_ids(auth.uid(), 6) s
         WHERE s.employee_id = annual_review_instances.employee_id
      )
    )
  );

-- 2) Extend responses SELECT policy so the read-only detail view can hydrate.
DROP POLICY IF EXISTS responses_select_visible ON public.annual_review_responses;
CREATE POLICY responses_select_visible ON public.annual_review_responses
FOR SELECT
USING (
  (reviewer_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (
    (reviewer_role = 'self'::annual_reviewer_role)
    AND EXISTS (
      SELECT 1 FROM public.annual_review_instances i
       WHERE i.id = annual_review_responses.instance_id
         AND i.employee_id = auth.uid()
         AND i.overall_status = 'pending_self'::annual_review_status
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.id = annual_review_responses.instance_id
       AND (
         (i.employee_id = auth.uid() AND i.overall_status = 'completed'::annual_review_status)
         OR i.manager_id    = auth.uid()
         OR i.skip_id       = auth.uid()
         OR i.dept_head_id  = auth.uid()
         OR i.bu_head_id    = auth.uid()
         OR i.hr_id         = auth.uid()
         OR i.management_id = auth.uid()
       )
  )
  -- ADR-162: upline hierarchy read for COMPLETED reviews of login-enabled employees
  OR EXISTS (
    SELECT 1
      FROM public.annual_review_instances i
      JOIN public.annual_review_subtree_ids(auth.uid(), 6) s
        ON s.employee_id = i.employee_id
     WHERE i.id = annual_review_responses.instance_id
       AND i.overall_status = 'completed'::annual_review_status
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.employee_id)
  )
);

-- 3) Paginated hierarchy-completed listing RPC.
CREATE OR REPLACE FUNCTION public.get_hierarchy_completed_reviews(
  p_cycle_id uuid,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  v_is_privileged := has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'hr_pms'::app_role);
  v_offset := (v_page - 1) * v_page_size;

  WITH subtree AS (
    SELECT s.employee_id FROM public.annual_review_subtree_ids(v_uid, 6) s
  ),
  visible AS (
    SELECT
      i.id,
      i.employee_id,
      i.overall_status,
      i.total_score,
      i.updated_at,
      i.created_at,
      i.enabled_stages,
      i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id, i.management_id,
      emp.full_name        AS employee_name,
      emp.employee_code    AS employee_code,
      emp.designation      AS designation,
      dept.name            AS department_name,
      bu.name              AS business_unit_name,
      CASE
        WHEN v_is_privileged AND has_role(v_uid, 'admin'::app_role) THEN 'admin'
        WHEN v_is_privileged                                        THEN 'hr'
        WHEN i.management_id = v_uid                                THEN 'management'
        WHEN i.bu_head_id    = v_uid                                THEN 'bu_head'
        WHEN i.dept_head_id  = v_uid                                THEN 'dept_head'
        WHEN i.skip_id       = v_uid                                THEN 'skip'
        WHEN i.manager_id    = v_uid                                THEN 'manager'
        ELSE 'upline'
      END AS viewer_relationship
    FROM public.annual_review_instances i
    JOIN public.profiles emp ON emp.id = i.employee_id
    LEFT JOIN public.departments   dept ON dept.id = emp.department_id
    LEFT JOIN public.business_units bu  ON bu.id   = emp.business_unit_id
    WHERE i.cycle_id = p_cycle_id
      AND i.overall_status = 'completed'::annual_review_status
      -- login-employee gate
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.employee_id)
      AND (
        v_is_privileged
        OR i.manager_id    = v_uid
        OR i.skip_id       = v_uid
        OR i.dept_head_id  = v_uid
        OR i.bu_head_id    = v_uid
        OR i.hr_id         = v_uid
        OR i.management_id = v_uid
        OR EXISTS (SELECT 1 FROM subtree s WHERE s.employee_id = i.employee_id)
      )
      AND (
        v_search IS NULL
        OR emp.full_name     ILIKE '%' || v_search || '%'
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_hierarchy_completed_reviews(uuid, text, integer, integer) TO authenticated;
