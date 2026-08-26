-- ADR-327 — Employee scoring profiles are separate from shared KPI wording.

CREATE OR REPLACE FUNCTION public.bu_console_descriptive_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['kpi_title','kpi_description','criteria','source_of_data','kpi_formula','uom']::text[]
$$;

CREATE OR REPLACE FUNCTION public.bu_console_scoring_profiles_page(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL::uuid[],
  p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[],
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset integer;
  v_total integer;
  v_profiles jsonb;
  v_employees jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'total', 0, 'profiles', '[]'::jsonb, 'employees', '[]'::jsonb);
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  CREATE TEMP TABLE _scoring_profile_rows ON COMMIT DROP AS
  SELECT
    k.id AS kpi_id,
    k.employee_id,
    p.full_name AS employee_name,
    p.employee_code,
    d.name AS department_name,
    k.target_value,
    k.weightage,
    k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
    k.kpi_scoring_logic,
    rs.final_score IS NOT NULL AS is_locked,
    EXISTS (
      SELECT 1 FROM public.bu_console_kpi_overrides o
      WHERE o.kpi_id = k.id
        AND o.field = ANY (ARRAY['target_value','weightage','r5','r4','r3','r2','r1','r0','kpi_scoring_logic'])
    ) AS has_override,
    md5(concat_ws('|',
      COALESCE(k.target_value::text,''), COALESCE(k.weightage::text,''),
      COALESCE(k.r5,''), COALESCE(k.r4,''), COALESCE(k.r3,''),
      COALESCE(k.r2,''), COALESCE(k.r1,''), COALESCE(k.r0,''),
      lower(regexp_replace(btrim(COALESCE(k.kpi_scoring_logic,'')), '\s+', ' ', 'g'))
    )) AS profile_key
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND (p_category_id IS NULL OR k.category_id = p_category_id)
    AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title),''), k.kpi_name)) = public.normalize_kpi_text(p_kpi_name)
    AND (p_bu_ids IS NULL OR cardinality(p_bu_ids) = 0 OR d.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR cardinality(p_dept_ids) = 0 OR p.department_id = ANY(p_dept_ids))
    AND (p_division_ids IS NULL OR cardinality(p_division_ids) = 0 OR d.business_unit_id IN (
      SELECT b.id FROM public.business_units b WHERE b.division_id = ANY(p_division_ids)
    ))
    AND (p_manager_ids IS NULL OR cardinality(p_manager_ids) = 0 OR p.reporting_manager_id = ANY(p_manager_ids))
    AND (NULLIF(btrim(p_search),'') IS NULL OR p.full_name ILIKE '%' || btrim(p_search) || '%'
      OR p.employee_code ILIKE '%' || btrim(p_search) || '%'
      OR d.name ILIKE '%' || btrim(p_search) || '%');

  SELECT count(*) INTO v_total FROM _scoring_profile_rows;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.employee_count DESC, x.profile_label), '[]'::jsonb)
  INTO v_profiles
  FROM (
    SELECT
      profile_key,
      'Profile ' || row_number() OVER (ORDER BY count(*) DESC, profile_key) AS profile_label,
      count(*)::integer AS employee_count,
      count(*) FILTER (WHERE is_locked)::integer AS locked_count,
      count(*) FILTER (WHERE has_override)::integer AS override_count,
      min(target_value) AS target_value,
      min(weightage) AS weightage,
      min(r5) AS r5, min(r4) AS r4, min(r3) AS r3,
      min(r2) AS r2, min(r1) AS r1, min(r0) AS r0,
      min(kpi_scoring_logic) AS kpi_scoring_logic
    FROM _scoring_profile_rows
    GROUP BY profile_key
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.employee_name, x.employee_code), '[]'::jsonb)
  INTO v_employees
  FROM (
    SELECT * FROM _scoring_profile_rows
    ORDER BY employee_name, employee_code
    LIMIT v_page_size OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'authorized', true,
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'profiles', v_profiles,
    'employees', v_employees
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_scoring_profiles_page(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_scoring_profiles_page(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],integer,integer,text) TO authenticated, service_role;