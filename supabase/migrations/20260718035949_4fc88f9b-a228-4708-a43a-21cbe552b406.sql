
-- =========================================================================
-- Annual Review Report extensions (ADR: report-v2)
-- Three additive, read-only SECURITY DEFINER RPCs. No schema changes.
-- Scope enforcement reuses annual_review_directory_access(auth.uid()).
-- =========================================================================

-- Helper: rank of a status in the linear stage progression.
-- Higher = further along. excluded is treated as -1 (excluded from all).
CREATE OR REPLACE FUNCTION public.annual_review_status_rank(s annual_review_status)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'excluded'        THEN -1
    WHEN 'not_started'     THEN 0
    WHEN 'pending_self'    THEN 1
    WHEN 'pending_manager' THEN 2
    WHEN 'pending_skip'    THEN 3
    WHEN 'pending_dept'    THEN 4
    WHEN 'pending_bu'      THEN 5
    WHEN 'pending_hr'      THEN 6
    WHEN 'completed'       THEN 7
  END
$$;

-- Helper: instances the caller can see for a cycle. Returns setof uuid (instance_id).
CREATE OR REPLACE FUNCTION public.annual_review_accessible_instances(p_cycle_id uuid)
RETURNS TABLE(instance_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_acc   jsonb;
  v_scope text;
  v_bus   uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_acc   := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_acc->>'can_access')::boolean, false) THEN RETURN; END IF;

  v_scope := v_acc->>'scope';
  v_bus   := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_acc->'business_unit_ids','[]'::jsonb))::uuid);

  IF v_scope = 'all' THEN
    RETURN QUERY
      SELECT i.id FROM public.annual_review_instances i
      WHERE i.cycle_id = p_cycle_id;
  ELSIF v_scope = 'bu' THEN
    RETURN QUERY
      SELECT i.id
        FROM public.annual_review_instances i
        JOIN public.profiles p    ON p.id = i.employee_id
        LEFT JOIN public.departments d ON d.id = p.department_id
       WHERE i.cycle_id = p_cycle_id
         AND d.business_unit_id = ANY(v_bus);
  ELSIF v_scope = 'team' THEN
    RETURN QUERY
      SELECT i.id
        FROM public.annual_review_instances i
       WHERE i.cycle_id = p_cycle_id
         AND (
              i.employee_id IN (SELECT public.annual_review_subtree_ids(v_uid, 20))
           OR i.manager_id = v_uid
           OR i.skip_id    = v_uid
           OR i.bu_head_id = v_uid
           OR i.dept_head_id = v_uid
           OR i.hr_id      = v_uid
         );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.annual_review_status_rank(annual_review_status) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.annual_review_accessible_instances(uuid)        TO authenticated;

-- =========================================================================
-- RPC 1: Per-department submission summary
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_annual_review_dept_submission_summary(p_cycle_id uuid)
RETURNS TABLE(
  department_id     uuid,
  department_name   text,
  total             integer,
  self_submitted    integer,
  manager_done      integer,
  skip_done         integer,
  bu_done           integer,
  hr_done           integer,
  completed         integer,
  submission_pct    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH acc AS (
    SELECT instance_id FROM public.annual_review_accessible_instances(p_cycle_id)
  ),
  base AS (
    SELECT
      d.id                              AS department_id,
      COALESCE(d.name, '(Unassigned)')  AS department_name,
      i.overall_status,
      public.annual_review_status_rank(i.overall_status) AS rnk
    FROM public.annual_review_instances i
    JOIN acc a ON a.instance_id = i.id
    LEFT JOIN public.profiles p    ON p.id = i.employee_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE i.overall_status <> 'excluded'
  )
  SELECT
    department_id,
    department_name,
    COUNT(*)::int                                                 AS total,
    COUNT(*) FILTER (WHERE rnk >= 2)::int                         AS self_submitted,
    COUNT(*) FILTER (WHERE rnk >= 3)::int                         AS manager_done,
    COUNT(*) FILTER (WHERE rnk >= 4)::int                         AS skip_done,
    COUNT(*) FILTER (WHERE rnk >= 6)::int                         AS bu_done,
    COUNT(*) FILTER (WHERE rnk >= 7)::int                         AS hr_done,
    COUNT(*) FILTER (WHERE overall_status = 'completed')::int     AS completed,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE rnk >= 2)::numeric
           / NULLIF(COUNT(*), 0)::numeric,
      1
    )                                                             AS submission_pct
  FROM base
  GROUP BY department_id, department_name
  ORDER BY department_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_dept_submission_summary(uuid) TO authenticated;

-- =========================================================================
-- RPC 2: Reviewer-wise pending queues
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_annual_review_reviewer_pending_queues(p_cycle_id uuid)
RETURNS TABLE(
  reviewer_id   uuid,
  reviewer_name text,
  stage         text,
  pending_count integer,
  oldest_days   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH acc AS (
    SELECT instance_id FROM public.annual_review_accessible_instances(p_cycle_id)
  ),
  pend AS (
    SELECT
      i.updated_at,
      CASE i.overall_status
        WHEN 'pending_manager' THEN i.manager_id
        WHEN 'pending_skip'    THEN i.skip_id
        WHEN 'pending_dept'    THEN i.dept_head_id
        WHEN 'pending_bu'      THEN i.bu_head_id
        WHEN 'pending_hr'      THEN i.hr_id
      END AS reviewer_id,
      CASE i.overall_status
        WHEN 'pending_manager' THEN 'manager'
        WHEN 'pending_skip'    THEN 'skip'
        WHEN 'pending_dept'    THEN 'dept_head'
        WHEN 'pending_bu'      THEN 'bu_head'
        WHEN 'pending_hr'      THEN 'hr'
      END AS stage
    FROM public.annual_review_instances i
    JOIN acc a ON a.instance_id = i.id
    WHERE i.overall_status IN ('pending_manager','pending_skip','pending_dept','pending_bu','pending_hr')
  )
  SELECT
    p.reviewer_id,
    COALESCE(pr.full_name, '(Unassigned)')                                        AS reviewer_name,
    p.stage,
    COUNT(*)::int                                                                 AS pending_count,
    COALESCE(EXTRACT(DAY FROM (now() - MIN(p.updated_at)))::int, 0)               AS oldest_days
  FROM pend p
  LEFT JOIN public.profiles pr ON pr.id = p.reviewer_id
  WHERE p.reviewer_id IS NOT NULL
  GROUP BY p.reviewer_id, pr.full_name, p.stage
  ORDER BY pending_count DESC, reviewer_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_reviewer_pending_queues(uuid) TO authenticated;

-- =========================================================================
-- RPC 3: Drill-down of who is pending at a specific stage (paginated)
--   p_stage IN ('self','manager','skip','dept_head','bu_head','hr')
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_annual_review_pending_at_stage(
  p_cycle_id  uuid,
  p_stage     text,
  p_page      integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE(
  instance_id     uuid,
  employee_id     uuid,
  employee_code   text,
  employee_name   text,
  department_name text,
  reviewer_id     uuid,
  reviewer_name   text,
  days_pending    integer,
  updated_at      timestamptz,
  total_count     integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status annual_review_status;
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size, 50));
  v_limit  int := LEAST(GREATEST(1, COALESCE(p_page_size, 50)), 200);
BEGIN
  v_status := CASE p_stage
    WHEN 'self'      THEN 'pending_self'
    WHEN 'manager'   THEN 'pending_manager'
    WHEN 'skip'      THEN 'pending_skip'
    WHEN 'dept_head' THEN 'pending_dept'
    WHEN 'bu_head'   THEN 'pending_bu'
    WHEN 'hr'        THEN 'pending_hr'
  END::annual_review_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Invalid stage: %', p_stage;
  END IF;

  RETURN QUERY
  WITH acc AS (
    SELECT ai.instance_id FROM public.annual_review_accessible_instances(p_cycle_id) ai
  ),
  rows AS (
    SELECT
      i.id                                       AS instance_id,
      i.employee_id,
      emp.employee_code,
      emp.full_name                              AS employee_name,
      COALESCE(dep.name, '(Unassigned)')         AS department_name,
      CASE v_status
        WHEN 'pending_self'    THEN i.employee_id
        WHEN 'pending_manager' THEN i.manager_id
        WHEN 'pending_skip'    THEN i.skip_id
        WHEN 'pending_dept'    THEN i.dept_head_id
        WHEN 'pending_bu'      THEN i.bu_head_id
        WHEN 'pending_hr'      THEN i.hr_id
      END                                        AS reviewer_id,
      i.updated_at,
      EXTRACT(DAY FROM (now() - i.updated_at))::int AS days_pending
    FROM public.annual_review_instances i
    JOIN acc a          ON a.instance_id = i.id
    LEFT JOIN public.profiles emp ON emp.id = i.employee_id
    LEFT JOIN public.departments dep ON dep.id = emp.department_id
    WHERE (
      i.overall_status = v_status
      OR (v_status = 'pending_self' AND i.overall_status = 'not_started')
    )
  ),
  enriched AS (
    SELECT r.*, pr.full_name AS reviewer_name
    FROM rows r
    LEFT JOIN public.profiles pr ON pr.id = r.reviewer_id
  ),
  counted AS (
    SELECT COUNT(*)::int AS total_count FROM enriched
  )
  SELECT
    e.instance_id, e.employee_id, e.employee_code, e.employee_name,
    e.department_name, e.reviewer_id, e.reviewer_name,
    e.days_pending, e.updated_at,
    c.total_count
  FROM enriched e CROSS JOIN counted c
  ORDER BY e.days_pending DESC NULLS LAST, e.employee_name
  OFFSET v_offset LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_pending_at_stage(uuid, text, integer, integer) TO authenticated;
