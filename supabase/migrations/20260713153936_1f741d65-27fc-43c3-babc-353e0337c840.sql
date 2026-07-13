
-- =====================================================================
-- 1) RPC: get_first_kra_rollout
-- Returns first-time KRA issuance per employee (paginated + filterable).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_first_kra_rollout(
  p_search text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_bu_id uuid DEFAULT NULL,
  p_dept_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_source text DEFAULT NULL,           -- 'bundle' | 'rollover' | 'manual' | null=all
  p_only_missing boolean DEFAULT false, -- true = employees with NO KPIs yet
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_name text,
  business_unit_name text,
  company_name text,
  doj date,
  first_kra_period text,
  first_kra_year int,
  first_kra_at timestamptz,
  first_kra_by uuid,
  first_kra_by_name text,
  source text,
  kpis_in_first_batch int,
  total_kpis int,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Restrict to reporting-privileged roles.
  IF NOT (
    public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'hr_pms')
    OR public.has_role(v_uid, 'management')
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH kpi_first AS (
    -- Earliest KPI creation per employee, plus that batch's period.
    SELECT DISTINCT ON (k.employee_id)
      k.employee_id,
      k.created_at         AS first_at,
      k.created_by         AS first_by,
      k.review_period      AS period,
      k.review_year        AS year
    FROM public.kpis k
    ORDER BY k.employee_id, k.created_at ASC
  ),
  kpi_totals AS (
    SELECT employee_id, COUNT(*)::int AS total_kpis
    FROM public.kpis
    GROUP BY employee_id
  ),
  kpi_batch AS (
    -- Count of KPIs that landed within 60 seconds of the first one
    -- (treat as "the first rollout batch").
    SELECT k.employee_id, COUNT(*)::int AS batch_count
    FROM public.kpis k
    JOIN kpi_first f ON f.employee_id = k.employee_id
    WHERE k.created_at BETWEEN f.first_at AND (f.first_at + interval '60 seconds')
    GROUP BY k.employee_id
  ),
  bundle_first AS (
    SELECT DISTINCT ON (b.employee_id)
      b.employee_id, b.created_at AS b_at, b.assigned_by, b.review_period, b.review_year
    FROM public.bundle_assignment_logs b
    ORDER BY b.employee_id, b.created_at ASC
  ),
  base AS (
    SELECT
      p.id            AS employee_id,
      p.full_name,
      p.employee_code,
      p.designation,
      p.department_id,
      p.company_id,
      p.doj,
      f.first_at,
      f.first_by,
      f.period,
      f.year,
      COALESCE(kb.batch_count, 0) AS batch_count,
      COALESCE(kt.total_kpis, 0)  AS total_kpis,
      bf.b_at,
      bf.assigned_by
    FROM public.profiles p
    LEFT JOIN kpi_first    f  ON f.employee_id  = p.id
    LEFT JOIN kpi_batch    kb ON kb.employee_id = p.id
    LEFT JOIN kpi_totals   kt ON kt.employee_id = p.id
    LEFT JOIN bundle_first bf ON bf.employee_id = p.id
    WHERE COALESCE(p.is_active, true) = true
      AND COALESCE(p.is_dummy_employee, false) = false
  ),
  enriched AS (
    SELECT
      b.*,
      d.name AS department_name,
      d.business_unit_id,
      c.name AS company_name,
      CASE
        WHEN b.first_at IS NULL THEN NULL
        WHEN b.b_at IS NOT NULL
             AND b.b_at BETWEEN (b.first_at - interval '5 minutes')
                            AND (b.first_at + interval '5 minutes')
          THEN 'bundle'
        WHEN EXISTS (
          SELECT 1 FROM public.kra_rollover_logs rl
          WHERE b.first_at BETWEEN rl.created_at
                                AND (rl.created_at + interval '30 minutes')
            AND rl.status = 'success'
        ) THEN 'rollover'
        ELSE 'manual'
      END AS src,
      CASE
        WHEN b.first_at IS NULL THEN NULL
        WHEN b.b_at IS NOT NULL
             AND b.b_at BETWEEN (b.first_at - interval '5 minutes')
                            AND (b.first_at + interval '5 minutes')
          THEN b.assigned_by
        ELSE b.first_by
      END AS actor_id
    FROM base b
    LEFT JOIN public.departments d ON d.id = b.department_id
    LEFT JOIN public.companies   c ON c.id = b.company_id
  ),
  filtered AS (
    SELECT e.*,
           bu.name AS business_unit_name,
           actor.full_name AS actor_name
    FROM enriched e
    LEFT JOIN public.business_units bu ON bu.id = e.business_unit_id
    LEFT JOIN public.profiles actor    ON actor.id = e.actor_id
    WHERE (p_search IS NULL OR p_search = ''
           OR e.full_name     ILIKE '%' || p_search || '%'
           OR e.employee_code ILIKE '%' || p_search || '%')
      AND (p_company_id IS NULL OR e.company_id     = p_company_id)
      AND (p_bu_id      IS NULL OR e.business_unit_id = p_bu_id)
      AND (p_dept_id    IS NULL OR e.department_id = p_dept_id)
      AND (p_from IS NULL OR e.first_at >= p_from)
      AND (p_to   IS NULL OR e.first_at <= p_to)
      AND (p_source IS NULL OR p_source = '' OR e.src = p_source)
      AND (
        (p_only_missing = true  AND e.first_at IS NULL)
        OR
        (p_only_missing = false)
      )
  )
  SELECT
    f.employee_id,
    f.full_name,
    f.employee_code,
    f.designation,
    f.department_name,
    f.business_unit_name,
    f.company_name,
    f.doj,
    f.period                  AS first_kra_period,
    f.year                    AS first_kra_year,
    f.first_at                AS first_kra_at,
    f.actor_id                AS first_kra_by,
    f.actor_name              AS first_kra_by_name,
    f.src                     AS source,
    f.batch_count             AS kpis_in_first_batch,
    f.total_kpis,
    COUNT(*) OVER ()          AS total_count
  FROM filtered f
  ORDER BY
    (f.first_at IS NULL) DESC,       -- missing-KRA employees first when included
    f.first_at DESC NULLS LAST,
    f.full_name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_first_kra_rollout(
  text, uuid, uuid, uuid, timestamptz, timestamptz, text, boolean, int, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_first_kra_rollout(
  text, uuid, uuid, uuid, timestamptz, timestamptz, text, boolean, int, int
) TO authenticated, service_role;

-- Helpful index for the KPI-first lookup (idempotent).
CREATE INDEX IF NOT EXISTS idx_kpis_emp_created
  ON public.kpis (employee_id, created_at);

-- =====================================================================
-- 2) Security fixes — safety_* SELECT policies were too broad.
-- =====================================================================

-- safety_audit_run_responses: mirror parent p_audit_runs_read scope
DROP POLICY IF EXISTS p_audit_resp_read ON public.safety_audit_run_responses;
CREATE POLICY p_audit_resp_read
ON public.safety_audit_run_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.safety_audit_runs r
    WHERE r.id = safety_audit_run_responses.run_id
      AND (
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'auditor'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'manager'::public.safety_app_role, r.business_unit_id)
        OR public.has_safety_role(auth.uid(), 'bu_head'::public.safety_app_role, r.business_unit_id)
        OR public.has_safety_role(auth.uid(), 'supervisor'::public.safety_app_role, r.business_unit_id)
        OR r.conducted_by = auth.uid()
      )
  )
);

-- safety_permit_approvals: mirror parent permits_select scope
DROP POLICY IF EXISTS permit_approvals_select ON public.safety_permit_approvals;
CREATE POLICY permit_approvals_select
ON public.safety_permit_approvals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_approvals.permit_id
      AND (
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
        OR p.requested_by = auth.uid()
        OR public.is_permit_approver(auth.uid(), p.id)
        OR public.has_safety_role(auth.uid(), 'manager'::public.safety_app_role, p.business_unit_id)
        OR public.has_safety_role(auth.uid(), 'bu_head'::public.safety_app_role, p.business_unit_id)
      )
  )
);

-- safety_permit_evidence: same scope as permit_approvals_select
DROP POLICY IF EXISTS permit_evidence_select ON public.safety_permit_evidence;
CREATE POLICY permit_evidence_select
ON public.safety_permit_evidence
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.safety_permits p
    WHERE p.id = safety_permit_evidence.permit_id
      AND (
        public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role, NULL::uuid)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role, NULL::uuid)
        OR p.requested_by = auth.uid()
        OR public.is_permit_approver(auth.uid(), p.id)
        OR public.has_safety_role(auth.uid(), 'manager'::public.safety_app_role, p.business_unit_id)
        OR public.has_safety_role(auth.uid(), 'bu_head'::public.safety_app_role, p.business_unit_id)
      )
  )
);
