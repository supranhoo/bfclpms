
-- ============================================================================
-- M2: Bulk Review Dashboard read RPCs (PRD v2.0)
-- All RPCs: SECURITY DEFINER, search_path locked, flag-gated.
-- ============================================================================

-- ---------- 1. bulk_scope_preview ----------
CREATE OR REPLACE FUNCTION public.bulk_scope_preview(
  p_period TEXT,
  p_year INTEGER,
  p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_count INTEGER := 0;
  v_kpi_count INTEGER := 0;
  v_est_kb NUMERIC := 0;
  v_dept UUID := NULLIF(p_filters->>'department_id','')::UUID;
  v_manager UUID := NULLIF(p_filters->>'manager_id','')::UUID;
  v_company UUID := NULLIF(p_filters->>'company_id','')::UUID;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: only reviewer roles + admin
  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'skip_level'::app_role)
    OR public.has_role(auth.uid(),'hr_pms'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
    OR public.has_role(auth.uid(),'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(DISTINCT k.employee_id), COUNT(*)
    INTO v_emp_count, v_kpi_count
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND COALESCE(k.frequency,'') <> 'daily'  -- E12
    AND (v_dept IS NULL OR p.department_id = v_dept)
    AND (v_manager IS NULL OR p.reporting_manager_id = v_manager)
    AND (v_company IS NULL OR p.company_id = v_company);

  -- Rough payload estimate: ~80 bytes per cell
  v_est_kb := ROUND((v_kpi_count * 80.0) / 1024.0, 1);

  RETURN jsonb_build_object(
    'emp_count', v_emp_count,
    'kpi_count', v_kpi_count,
    'cell_count', v_kpi_count,
    'est_payload_kb', v_est_kb,
    'cap_exceeded', v_kpi_count > 25000 OR v_est_kb > 5120
  );
END;
$$;

-- ---------- 2. bulk_review_snapshot ----------
CREATE OR REPLACE FUNCTION public.bulk_review_snapshot(
  p_period TEXT,
  p_year INTEGER,
  p_viewer_stage TEXT,
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER := GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1);
  v_dept UUID := NULLIF(p_filters->>'department_id','')::UUID;
  v_manager UUID := NULLIF(p_filters->>'manager_id','')::UUID;
  v_company UUID := NULLIF(p_filters->>'company_id','')::UUID;
  v_rows JSONB;
  v_total INTEGER;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'skip_level'::app_role)
    OR public.has_role(auth.uid(),'hr_pms'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
    OR public.has_role(auth.uid(),'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF p_page_size > 500 THEN
    RAISE EXCEPTION 'page_size exceeds maximum (500)' USING ERRCODE = 'P0001';
  END IF;

  WITH scoped AS (
    SELECT
      k.id AS kpi_id,
      k.employee_id,
      k.kpi_name,
      k.kra_name,
      k.weightage,
      k.status,
      k.kpi_group_type,
      k.frequency,
      p.full_name AS employee_name,
      p.employee_code,
      p.department_id,
      rs.id AS submission_id,
      rs.self_score,
      rs.manager_score,
      rs.skip_level_score,
      rs.hr_pms_score,
      rs.auditor_score,
      rs.management_score,
      rs.final_score,
      rs.is_na,
      rs.final_revision_no,
      rs.row_version
    FROM public.kpis k
    JOIN public.profiles p
      ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.review_submissions rs
      ON rs.kpi_id = k.id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND COALESCE(k.frequency,'') <> 'daily'
      AND (v_dept IS NULL OR p.department_id = v_dept)
      AND (v_manager IS NULL OR p.reporting_manager_id = v_manager)
      AND (v_company IS NULL OR p.company_id = v_company)
  )
  SELECT COUNT(*) INTO v_total FROM scoped;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT * FROM (
      SELECT
        k.id AS kpi_id,
        k.employee_id,
        k.kpi_name,
        k.kra_name,
        k.weightage,
        k.status,
        k.kpi_group_type,
        k.frequency,
        p.full_name AS employee_name,
        p.employee_code,
        rs.id AS submission_id,
        rs.self_score,
        rs.manager_score,
        rs.skip_level_score,
        rs.hr_pms_score,
        rs.auditor_score,
        rs.management_score,
        rs.final_score,
        rs.is_na,
        rs.final_revision_no,
        rs.row_version
      FROM public.kpis k
      JOIN public.profiles p
        ON p.id = k.employee_id AND p.is_active = true
      LEFT JOIN public.review_submissions rs
        ON rs.kpi_id = k.id
      WHERE k.review_period = p_period
        AND k.review_year = p_year
        AND COALESCE(k.frequency,'') <> 'daily'
        AND (v_dept IS NULL OR p.department_id = v_dept)
        AND (v_manager IS NULL OR p.reporting_manager_id = v_manager)
        AND (v_company IS NULL OR p.company_id = v_company)
      ORDER BY p.full_name, k.kra_name, k.kpi_name
      LIMIT GREATEST(p_page_size,1)
      OFFSET v_offset
    ) s
  ) s;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'viewer_stage', p_viewer_stage
  );
END;
$$;

-- ---------- 3. kpi_cell_detail ----------
CREATE OR REPLACE FUNCTION public.kpi_cell_detail(
  p_kpi_id UUID,
  p_emp_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi JSONB;
  v_sub JSONB;
  v_revisions JSONB;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'skip_level'::app_role)
    OR public.has_role(auth.uid(),'hr_pms'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
    OR public.has_role(auth.uid(),'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(k.*) INTO v_kpi
  FROM public.kpis k
  WHERE k.id = p_kpi_id AND k.employee_id = p_emp_id;

  SELECT to_jsonb(rs.*) INTO v_sub
  FROM public.review_submissions rs
  WHERE rs.kpi_id = p_kpi_id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(r.*) ORDER BY r.revision_no DESC), '[]'::jsonb)
    INTO v_revisions
  FROM public.final_score_revisions r
  JOIN public.review_submissions rs ON rs.id = r.submission_id
  WHERE rs.kpi_id = p_kpi_id;

  RETURN jsonb_build_object(
    'kpi', COALESCE(v_kpi, 'null'::jsonb),
    'submission', COALESCE(v_sub, 'null'::jsonb),
    'revisions', v_revisions
  );
END;
$$;
