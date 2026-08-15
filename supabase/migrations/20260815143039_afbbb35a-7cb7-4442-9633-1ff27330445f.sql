-- ============================================================
-- ADR-259 — BU Performance Console (Beta): read + queue RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.bu_console_can_read(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid,'admin')
      OR public.has_role(_uid,'auditor')
      OR public.has_role(_uid,'management')
      OR public.has_role(_uid,'hr_pms');
$$;

-- ---------- tree (counts only) ----------
CREATE OR REPLACE FUNCTION public.bu_console_tree(
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'categories', '[]'::jsonb);
  END IF;

  WITH scoped AS (
    SELECT k.id,
           k.category_id,
           k.kra_name,
           k.kpi_name,
           k.employee_id,
           k.is_org_level,
           d.business_unit_id
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
  ),
  kpi_level AS (
    SELECT category_id,
           normalize_kpi_text(kra_name) AS kra_key,
           max(kra_name) AS kra_name,
           normalize_kpi_text(kpi_name) AS kpi_key,
           max(kpi_name) AS kpi_name,
           count(*)::int AS kpi_rows,
           count(DISTINCT employee_id)::int AS employee_count,
           bool_or(COALESCE(is_org_level,false)) AS is_org_level
    FROM scoped
    GROUP BY category_id, normalize_kpi_text(kra_name), normalize_kpi_text(kpi_name)
  ),
  kra_level AS (
    SELECT category_id, kra_key, max(kra_name) AS kra_name,
           count(*)::int AS kpi_count,
           sum(employee_count)::int AS employee_rows,
           jsonb_agg(jsonb_build_object(
             'kpi_key', kpi_key,
             'kpi_name', kpi_name,
             'kpi_rows', kpi_rows,
             'employee_count', employee_count,
             'is_org_level', is_org_level
           ) ORDER BY kpi_name) AS kpis
    FROM kpi_level
    GROUP BY category_id, kra_key
  ),
  cat_level AS (
    SELECT c.id AS category_id,
           c.name AS category_name,
           count(*)::int AS kra_count,
           sum(kl.kpi_count)::int AS kpi_count,
           jsonb_agg(jsonb_build_object(
             'kra_key', kl.kra_key,
             'kra_name', kl.kra_name,
             'kpi_count', kl.kpi_count,
             'kpis', kl.kpis
           ) ORDER BY kl.kra_name) AS kras
    FROM kra_level kl
    JOIN public.kra_categories c ON c.id = kl.category_id
    GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'authorized', true,
    'period', p_period,
    'year', p_year,
    'categories', COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_name', category_name,
        'kra_count', kra_count,
        'kpi_count', kpi_count,
        'kras', kras
      ) ORDER BY category_name), '[]'::jsonb)
  )
  INTO v_result
  FROM cat_level;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_tree(text,integer,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_tree(text,integer,uuid[],uuid[]) TO authenticated, service_role;

-- ---------- kpi detail (paged employees) ----------
CREATE OR REPLACE FUNCTION public.bu_console_kpi_detail(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total integer;
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size,200),1),200);
  v_offset integer := (GREATEST(COALESCE(p_page,1),1) - 1) * v_size;
  v_meta jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bu_console_scope (LIKE public.kpis) ON COMMIT DROP;

  WITH scoped AS (
    SELECT k.*, p.full_name, p.employee_code, p.department_id, d.name AS department_name,
           d.business_unit_id, bu.name AS business_unit_name
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND normalize_kpi_text(k.kra_name) = normalize_kpi_text(p_kra_name)
      AND normalize_kpi_text(k.kpi_name) = normalize_kpi_text(p_kpi_name)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
  ),
  counted AS (SELECT count(*)::int AS total FROM scoped),
  page AS (
    SELECT s.*, rs.achieved_value, rs.self_achieved_value, rs.final_score, rs.final_rating,
           rs.self_score, rs.manager_score, rs.is_na
    FROM scoped s
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.id
    ORDER BY s.full_name
    OFFSET v_offset LIMIT v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'kpi_id', id,
            'employee_id', employee_id,
            'employee_name', full_name,
            'employee_code', employee_code,
            'department_id', department_id,
            'department_name', department_name,
            'business_unit_id', business_unit_id,
            'business_unit_name', business_unit_name,
            'weightage', weightage,
            'target_value', target_value,
            'uom', uom,
            'frequency', frequency,
            'status', status,
            'is_na', is_na,
            'achieved_value', COALESCE(achieved_value, self_achieved_value),
            'self_score', self_score,
            'manager_score', manager_score,
            'final_score', final_score,
            'final_rating', final_rating
         )) FROM page), '[]'::jsonb),
         COALESCE((SELECT jsonb_build_object(
            'criteria', max(criteria), 'uom', max(uom), 'frequency', max(frequency),
            'r0', max(r0),'r1', max(r1),'r2', max(r2),'r3', max(r3),'r4', max(r4),'r5', max(r5),
            'is_org_level', bool_or(COALESCE(is_org_level,false))
         ) FROM scoped), '{}'::jsonb)
  INTO v_total, v_rows, v_meta;

  RETURN jsonb_build_object(
    'authorized', true,
    'total', COALESCE(v_total,0),
    'page', GREATEST(COALESCE(p_page,1),1),
    'page_size', v_size,
    'definition', v_meta,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_kpi_detail(uuid,text,text,text,integer,uuid[],uuid[],integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_kpi_detail(uuid,text,text,text,integer,uuid[],uuid[],integer,integer) TO authenticated, service_role;

-- ---------- merge proposal generation ----------
CREATE OR REPLACE FUNCTION public.bu_console_generate_merge_proposals(
  p_fuzzy_threshold numeric DEFAULT 0.55
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan jsonb;
  v_inserted integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only administrators can generate merge proposals';
  END IF;

  v_scan := public.scan_kpi_duplicate_groups(false, p_fuzzy_threshold);

  WITH groups AS (
    SELECT g FROM jsonb_array_elements(COALESCE(v_scan->'groups', v_scan, '[]'::jsonb)) AS g
  ),
  variants AS (
    SELECT (g->>'category_id')::uuid AS category_id,
           v AS variant,
           row_number() OVER (PARTITION BY g->>'normalized_kpi', g->>'category_id'
                              ORDER BY (v->>'employee_count')::int DESC NULLS LAST) AS rn,
           first_value(v) OVER (PARTITION BY g->>'normalized_kpi', g->>'category_id'
                                ORDER BY (v->>'employee_count')::int DESC NULLS LAST) AS canonical
    FROM groups, jsonb_array_elements(g->'variants') AS v
  ),
  candidates AS (
    SELECT category_id,
           canonical->>'kra_name' AS canonical_kra_name,
           canonical->>'kpi_name' AS canonical_kpi_name,
           variant->>'kra_name' AS variant_kra_name,
           variant->>'kpi_name' AS variant_kpi_name,
           NULLIF(variant->>'similarity','')::numeric AS similarity,
           COALESCE(variant->>'match_type','exact') AS match_type,
           COALESCE((variant->>'row_count')::int,0) AS affected_kpi_count,
           COALESCE((variant->>'employee_count')::int,0) AS affected_employee_count
    FROM variants
    WHERE rn > 1
  )
  INSERT INTO public.kpi_merge_proposals (
    category_id, canonical_kra_name, canonical_kpi_name,
    variant_kra_name, variant_kpi_name, similarity, match_type,
    affected_kpi_count, affected_employee_count
  )
  SELECT category_id, canonical_kra_name, canonical_kpi_name,
         variant_kra_name, variant_kpi_name, similarity, match_type,
         affected_kpi_count, affected_employee_count
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kpi_merge_proposals m
    WHERE COALESCE(m.category_id,'00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(c.category_id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND normalize_kpi_text(m.canonical_kra_name) = normalize_kpi_text(c.canonical_kra_name)
      AND normalize_kpi_text(m.canonical_kpi_name) = normalize_kpi_text(c.canonical_kpi_name)
      AND normalize_kpi_text(m.variant_kra_name) = normalize_kpi_text(c.variant_kra_name)
      AND normalize_kpi_text(m.variant_kpi_name) = normalize_kpi_text(c.variant_kpi_name)
      AND m.status = 'pending'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_generate_merge_proposals(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_generate_merge_proposals(numeric) TO authenticated, service_role;

-- ---------- merge proposal decision ----------
CREATE OR REPLACE FUNCTION public.bu_console_decide_merge_proposal(
  p_proposal_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.kpi_merge_proposals;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only administrators can decide merge proposals';
  END IF;

  UPDATE public.kpi_merge_proposals
     SET status = CASE WHEN p_approve THEN 'approved'::public.kpi_merge_proposal_status
                       ELSE 'rejected'::public.kpi_merge_proposal_status END,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = p_note
   WHERE id = p_proposal_id AND status = 'pending'
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found or already decided';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_decide_merge_proposal(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_decide_merge_proposal(uuid,boolean,text) TO authenticated, service_role;
