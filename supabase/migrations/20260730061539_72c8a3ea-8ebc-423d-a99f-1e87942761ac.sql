-- ADR-203 — Assisted (proxy) submission visibility for admins.
-- Read-only reporting layer over the existing annual_review_proxy_submissions
-- audit table. SECURITY INVOKER: the arps_select_visible RLS policy stays the
-- sole access authority; these functions only shape/paginate what the caller
-- may already read.

CREATE OR REPLACE FUNCTION public.get_annual_review_assisted_submissions(
  p_cycle_id       uuid    DEFAULT NULL,
  p_from           timestamptz DEFAULT NULL,
  p_to             timestamptz DEFAULT NULL,
  p_proxy_user_id  uuid    DEFAULT NULL,
  p_dept_id        uuid    DEFAULT NULL,
  p_bu_id          uuid    DEFAULT NULL,
  p_evidence       text    DEFAULT 'all',   -- all | has_selfie | no_selfie | has_photo | no_photo | none
  p_search         text    DEFAULT NULL,
  p_limit          integer DEFAULT 25,
  p_offset         integer DEFAULT 0
)
RETURNS TABLE (
  id                uuid,
  instance_id       uuid,
  cycle_id          uuid,
  captured_at       timestamptz,
  employee_id       uuid,
  employee_name     text,
  employee_code     text,
  department_id     uuid,
  department_name   text,
  business_unit_id  uuid,
  business_unit_name text,
  proxy_user_id     uuid,
  proxy_name        text,
  proxy_code        text,
  proxy_role        text,
  has_selfie        boolean,
  has_photo         boolean,
  selfie_path       text,
  photo_upload_path text,
  declaration_text  text,
  user_agent        text,
  ip                text,
  overall_status    text,
  total_count       bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      s.id, s.instance_id, i.cycle_id, s.captured_at,
      s.employee_user_id AS employee_id,
      ep.full_name AS employee_name, ep.employee_code,
      ep.department_id, d.name AS department_name,
      d.business_unit_id, bu.name AS business_unit_name,
      s.proxy_user_id, pp.full_name AS proxy_name, pp.employee_code AS proxy_code,
      s.proxy_role,
      (s.selfie_path IS NOT NULL)       AS has_selfie,
      (s.photo_upload_path IS NOT NULL) AS has_photo,
      s.selfie_path, s.photo_upload_path,
      s.declaration_text, s.user_agent, s.ip::text AS ip,
      i.overall_status::text AS overall_status
    FROM public.annual_review_proxy_submissions s
    JOIN public.annual_review_instances i ON i.id = s.instance_id
    LEFT JOIN public.profiles ep      ON ep.id = s.employee_user_id
    LEFT JOIN public.profiles pp      ON pp.id = s.proxy_user_id
    LEFT JOIN public.departments d    ON d.id  = ep.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  ), filtered AS (
    SELECT * FROM base b
    WHERE (p_cycle_id      IS NULL OR b.cycle_id = p_cycle_id)
      AND (p_from          IS NULL OR b.captured_at >= p_from)
      AND (p_to            IS NULL OR b.captured_at <  p_to)
      AND (p_proxy_user_id IS NULL OR b.proxy_user_id = p_proxy_user_id)
      AND (p_dept_id       IS NULL OR b.department_id = p_dept_id)
      AND (p_bu_id         IS NULL OR b.business_unit_id = p_bu_id)
      AND (
        COALESCE(p_evidence, 'all') = 'all'
        OR (p_evidence = 'has_selfie' AND b.has_selfie)
        OR (p_evidence = 'no_selfie'  AND NOT b.has_selfie)
        OR (p_evidence = 'has_photo'  AND b.has_photo)
        OR (p_evidence = 'no_photo'   AND NOT b.has_photo)
        OR (p_evidence = 'none'       AND NOT b.has_selfie AND NOT b.has_photo)
      )
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR b.employee_name ILIKE '%' || btrim(p_search) || '%'
        OR b.employee_code ILIKE '%' || btrim(p_search) || '%'
        OR b.proxy_name    ILIKE '%' || btrim(p_search) || '%'
        OR b.proxy_code    ILIKE '%' || btrim(p_search) || '%'
      )
  )
  SELECT f.id, f.instance_id, f.cycle_id, f.captured_at,
         f.employee_id, f.employee_name, f.employee_code,
         f.department_id, f.department_name,
         f.business_unit_id, f.business_unit_name,
         f.proxy_user_id, f.proxy_name, f.proxy_code, f.proxy_role,
         f.has_selfie, f.has_photo, f.selfie_path, f.photo_upload_path,
         f.declaration_text, f.user_agent, f.ip, f.overall_status,
         COUNT(*) OVER () AS total_count
  FROM filtered f
  ORDER BY f.captured_at DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 25), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.get_annual_review_assisted_submissions IS
  'ADR-203 — paginated admin view of assisted (proxy) annual-review submissions. SECURITY INVOKER: relies on annual_review_proxy_submissions RLS.';

CREATE OR REPLACE FUNCTION public.get_annual_review_assisted_summary(
  p_cycle_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_assisted     bigint,
  missing_selfie     bigint,
  missing_photo      bigint,
  missing_both       bigint,
  distinct_assistors bigint,
  total_submitted    bigint,
  assisted_pct       numeric,
  top_assistors      jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT s.*, i.cycle_id
    FROM public.annual_review_proxy_submissions s
    JOIN public.annual_review_instances i ON i.id = s.instance_id
    WHERE p_cycle_id IS NULL OR i.cycle_id = p_cycle_id
  ), agg AS (
    SELECT
      COUNT(*)                                                            AS total_assisted,
      COUNT(*) FILTER (WHERE selfie_path IS NULL)                         AS missing_selfie,
      COUNT(*) FILTER (WHERE photo_upload_path IS NULL)                   AS missing_photo,
      COUNT(*) FILTER (WHERE selfie_path IS NULL AND photo_upload_path IS NULL) AS missing_both,
      COUNT(DISTINCT proxy_user_id)                                       AS distinct_assistors
    FROM scoped
  ), submitted AS (
    SELECT COUNT(*) AS total_submitted
    FROM public.annual_review_instances i
    WHERE (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
      AND i.overall_status NOT IN ('not_started', 'pending_self', 'excluded')
  ), top AS (
    SELECT COALESCE(jsonb_agg(t ORDER BY t.cnt DESC), '[]'::jsonb) AS top_assistors
    FROM (
      SELECT s.proxy_user_id,
             COALESCE(p.full_name, 'Unknown') AS proxy_name,
             p.employee_code AS proxy_code,
             COUNT(*)        AS cnt
      FROM scoped s
      LEFT JOIN public.profiles p ON p.id = s.proxy_user_id
      GROUP BY s.proxy_user_id, p.full_name, p.employee_code
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) t
  )
  SELECT a.total_assisted, a.missing_selfie, a.missing_photo, a.missing_both,
         a.distinct_assistors, sb.total_submitted,
         CASE WHEN sb.total_submitted > 0
              THEN ROUND((a.total_assisted::numeric / sb.total_submitted) * 100, 1)
              ELSE 0 END AS assisted_pct,
         tp.top_assistors
  FROM agg a CROSS JOIN submitted sb CROSS JOIN top tp;
$$;

COMMENT ON FUNCTION public.get_annual_review_assisted_summary IS
  'ADR-203 — header aggregates for the Assisted Submissions admin console. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.get_annual_review_assisted_submissions(uuid, timestamptz, timestamptz, uuid, uuid, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_annual_review_assisted_summary(uuid) TO authenticated;

-- Supporting indexes for the console's sort and filters.
CREATE INDEX IF NOT EXISTS idx_arps_captured_at   ON public.annual_review_proxy_submissions (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_arps_instance_id   ON public.annual_review_proxy_submissions (instance_id);
CREATE INDEX IF NOT EXISTS idx_arps_proxy_user_id ON public.annual_review_proxy_submissions (proxy_user_id);