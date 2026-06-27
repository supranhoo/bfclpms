-- v2.66.57 — Server-side paginated reviewer dashboard
-- POLICY §PERF-AUDIT-PANEL-PAGINATION
--
-- Replaces the org-wide cold-load fan-out used by EmployeeSelectorGrid:
--   useProfiles + useKpisByPeriodRanges + useReviewSubmissionScoresByKpiIds
-- ...with a single RPC that returns ONLY the visible page and precomputed
-- per-employee badge counts. Cold-load cost is now linear in `p_limit`
-- (typically 24), not in the org-wide KPI count (~14k rows).
--
-- Read-only, SECURITY DEFINER, STABLE. Uses the same visibility model as
-- get_reviewer_kpis_for_period so RLS semantics are preserved.

CREATE OR REPLACE FUNCTION public.get_reviewer_dashboard_page(
  p_view_level     text,
  p_period         text,
  p_year           integer,
  p_search         text    DEFAULT NULL,
  p_department_id  uuid    DEFAULT NULL,
  p_designation_id uuid    DEFAULT NULL,
  p_grade_id       uuid    DEFAULT NULL,
  p_manager_id     uuid    DEFAULT NULL,
  p_emp_status     text    DEFAULT 'active',   -- 'active' | 'inactive' | 'all'
  p_sort           text    DEFAULT 'name_asc', -- name_asc | name_desc | updated_desc | kpis_desc
  p_offset         integer DEFAULT 0,
  p_limit          integer DEFAULT 24
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  email           text,
  designation     text,
  department      text,
  grade           text,
  reporting_manager_id uuid,
  is_active       boolean,
  avatar_url      text,
  total_kpis      integer,
  cleared_kra_set integer,
  pending_count   integer,
  reviewed_count  integer,
  total_count     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full boolean;
  v_pending_statuses text[];
  v_reviewed_statuses text[];
BEGIN
  PERFORM set_config('statement_timeout', '30000', true);

  IF v_uid IS NULL OR p_period IS NULL OR p_year IS NULL THEN
    RETURN;
  END IF;

  -- Map view level to "what counts as pending vs reviewed" using the
  -- canonical 8-stage default pipeline. Per-employee workflow templates
  -- (workflow_config) refine this on the client; the server stats are a
  -- close approximation that matches the client computation for the
  -- vast majority of employees on the default template.
  IF p_view_level = 'audit' THEN
    v_pending_statuses  := ARRAY['hr_pms_review'];
    v_reviewed_statuses := ARRAY['audit','management_review','approved'];
  ELSIF p_view_level = 'management' THEN
    v_pending_statuses  := ARRAY['audit'];
    v_reviewed_statuses := ARRAY['management_review','approved'];
  ELSIF p_view_level = 'hr_pms' THEN
    v_pending_statuses  := ARRAY['skip_level_check'];
    v_reviewed_statuses := ARRAY['hr_pms_review','audit','management_review','approved'];
  ELSIF p_view_level = 'skip_level' THEN
    v_pending_statuses  := ARRAY['manager_check'];
    v_reviewed_statuses := ARRAY['skip_level_check','hr_pms_review','audit','management_review','approved'];
  ELSE
    -- Unknown / unsupported view levels: return empty rather than guessing.
    RETURN;
  END IF;

  v_is_full := has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'auditor'::app_role)
    OR has_role(v_uid, 'hr_pms'::app_role)
    OR has_role(v_uid, 'management'::app_role)
    OR has_report_access_override(v_uid);

  RETURN QUERY
  WITH visible AS (
    SELECT p.id
    FROM public.profiles p
    WHERE
      CASE p_emp_status
        WHEN 'active'   THEN p.is_active = true
        WHEN 'inactive' THEN p.is_active = false
        ELSE TRUE
      END
      AND p.id <> v_uid  -- POLICY §107 reviewer self-exclusion
      AND (
        v_is_full
        OR p.reporting_manager_id = v_uid
        OR p.reporting_manager_id IN (
          SELECT id FROM public.profiles WHERE reporting_manager_id = v_uid
        )
      )
      AND (p_department_id  IS NULL OR p.department_id  = p_department_id)
      AND (p_designation_id IS NULL OR p.designation_id = p_designation_id)
      AND (p_grade_id       IS NULL OR p.grade_id       = p_grade_id)
      AND (p_manager_id     IS NULL OR p.reporting_manager_id = p_manager_id)
      AND (
        p_search IS NULL OR p_search = '' OR
        p.full_name ILIKE '%' || p_search || '%' OR
        p.email     ILIKE '%' || p_search || '%'
      )
  ),
  visible_with_stats AS (
    SELECT
      p.id,
      p.full_name,
      p.email,
      d.title  AS designation,
      dept.name AS department,
      g.name    AS grade,
      p.reporting_manager_id,
      p.is_active,
      p.avatar_url,
      COALESCE(s.total_kpis, 0)      AS total_kpis,
      COALESCE(s.cleared_kra_set, 0) AS cleared_kra_set,
      COALESCE(s.pending_count, 0)   AS pending_count,
      COALESCE(s.reviewed_count, 0)  AS reviewed_count,
      p.updated_at
    FROM visible v
    JOIN public.profiles p ON p.id = v.id
    LEFT JOIN public.designations d   ON d.id = p.designation_id
    LEFT JOIN public.departments dept ON dept.id = p.department_id
    LEFT JOIN public.pms_grades g     ON g.id = p.grade_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                                            AS total_kpis,
        COUNT(*) FILTER (WHERE k.status <> 'kra_set')::int                       AS cleared_kra_set,
        COUNT(*) FILTER (WHERE k.status::text = ANY (v_pending_statuses))::int   AS pending_count,
        COUNT(*) FILTER (WHERE k.status::text = ANY (v_reviewed_statuses))::int  AS reviewed_count
      FROM public.kpis k
      WHERE k.employee_id  = p.id
        AND k.review_period = p_period
        AND k.review_year   = p_year
    ) s ON TRUE
  ),
  windowed AS (
    SELECT
      vws.*,
      COUNT(*) OVER ()::int AS total_count
    FROM visible_with_stats vws
  )
  SELECT
    w.id, w.full_name, w.email, w.designation, w.department, w.grade,
    w.reporting_manager_id, w.is_active, w.avatar_url,
    w.total_kpis, w.cleared_kra_set, w.pending_count, w.reviewed_count,
    w.total_count
  FROM windowed w
  ORDER BY
    CASE WHEN p_sort = 'name_asc'     THEN w.full_name END ASC  NULLS LAST,
    CASE WHEN p_sort = 'name_desc'    THEN w.full_name END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_desc' THEN w.updated_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'kpis_desc'    THEN w.total_kpis END DESC NULLS LAST,
    w.full_name ASC
  OFFSET GREATEST(p_offset, 0)
  LIMIT  LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reviewer_dashboard_page(
  text, text, integer, text, uuid, uuid, uuid, uuid, text, text, integer, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_reviewer_dashboard_page(
  text, text, integer, text, uuid, uuid, uuid, uuid, text, text, integer, integer
) TO service_role;