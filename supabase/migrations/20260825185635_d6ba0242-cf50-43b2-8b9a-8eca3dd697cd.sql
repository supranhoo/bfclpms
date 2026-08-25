CREATE OR REPLACE FUNCTION public.bu_console_kpi_create(p_kpi jsonb, p_period text, p_year integer, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[], p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  -- ADR-319 / POLICY §KPI-SCOPE-SINGLE-VOCABULARY — one vocabulary: the scope.
  -- Legacy console words ('shared', 'department_event') stay readable.
  v_scope_in text := COALESCE(NULLIF(p_kpi->>'scope',''), NULLIF(p_kpi->>'kind',''), 'individual');
  v_scope text;
  v_name text := btrim(COALESCE(p_kpi->>'kpi_name', ''));
  v_kra text := btrim(COALESCE(p_kpi->>'kra_name', ''));
  v_cat uuid := NULLIF(p_kpi->>'category_id','')::uuid;
  v_rec record;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_created int := 0;
  v_skip_n int := 0;
  v_reason text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'admin_only');
  END IF;

  IF v_name = '' OR v_kra = '' OR v_cat IS NULL THEN
    RAISE EXCEPTION 'KPI name, KRA and category are required';
  END IF;

  v_scope := CASE v_scope_in
    WHEN 'shared' THEN 'organization'
    WHEN 'department_event' THEN 'department'
    ELSE v_scope_in
  END;
  IF v_scope NOT IN ('individual','organization','department','employee') THEN
    v_scope := 'individual';
  END IF;

  FOR v_rec IN
    SELECT p.id AS employee_id, p.full_name, p.employee_code,
           d.name AS department_name, bu.name AS business_unit_name,
           EXISTS (
             SELECT 1 FROM public.kpis k2
             WHERE k2.employee_id = p.id
               AND k2.review_period = p_period
               AND k2.review_year = p_year
               AND public.normalize_kpi_text(k2.kra_name) = public.normalize_kpi_text(v_kra)
               AND public.normalize_kpi_text(k2.kpi_name) = public.normalize_kpi_text(v_name)
           ) AS already_has
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    WHERE p.is_active = true
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
           OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
    ORDER BY p.full_name
  LOOP
    v_reason := NULL;
    IF v_rec.already_has THEN
      v_reason := 'duplicate_kpi';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      IF jsonb_array_length(v_skipped) < 200 THEN
        v_skipped := v_skipped || jsonb_build_object(
          'employee_id', v_rec.employee_id, 'full_name', v_rec.full_name,
          'employee_code', v_rec.employee_code, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    v_created := v_created + 1;
    IF jsonb_array_length(v_preview) < 200 THEN
      v_preview := v_preview || jsonb_build_object(
        'employee_id', v_rec.employee_id, 'full_name', v_rec.full_name,
        'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name,
        'business_unit_name', v_rec.business_unit_name);
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO public.kpis (
        category_id, employee_id, kra_name, kpi_name, kpi_title, kpi_description,
        criteria, uom, uom_type, target_value, weightage, frequency, frequency_cycle_start,
        source_of_data, r5, r4, r3, r2, r1, r0, qualitative_options,
        threshold_mode, is_org_level, org_level_scope,
        review_period, review_year, status
      ) VALUES (
        v_cat, v_rec.employee_id, v_kra, v_name,
        NULLIF(p_kpi->>'kpi_title',''), NULLIF(p_kpi->>'kpi_description',''),
        NULLIF(p_kpi->>'criteria',''), NULLIF(p_kpi->>'uom',''),
        COALESCE(NULLIF(p_kpi->>'uom_type',''), 'numeric'),
        NULLIF(p_kpi->>'target_value','')::numeric,
        COALESCE(NULLIF(p_kpi->>'weightage','')::numeric, 0),
        NULLIF(p_kpi->>'frequency',''), NULLIF(p_kpi->>'frequency_cycle_start',''),
        NULLIF(p_kpi->>'source_of_data',''),
        NULLIF(p_kpi->>'r5',''), NULLIF(p_kpi->>'r4',''), NULLIF(p_kpi->>'r3',''),
        NULLIF(p_kpi->>'r2',''), NULLIF(p_kpi->>'r1',''), NULLIF(p_kpi->>'r0',''),
        CASE WHEN p_kpi ? 'qualitative_options' THEN p_kpi->'qualitative_options' ELSE NULL END,
        COALESCE(NULLIF(p_kpi->>'threshold_mode',''), 'absolute'),
        v_scope <> 'individual',
        CASE WHEN v_scope = 'individual' THEN NULL ELSE v_scope END,
        p_period, p_year, 'kra_set'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', p_dry_run,
    'scope', v_scope,
    'kind', v_scope,
    'will_create', v_created,
    'will_skip', v_skip_n,
    'preview', v_preview,
    'skipped', v_skipped
  );
END;
$function$;