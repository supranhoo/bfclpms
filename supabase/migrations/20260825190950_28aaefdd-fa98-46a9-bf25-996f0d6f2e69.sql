-- ============================================================================
-- ADR-320 — Turn on the five pending KPI scopes (flight 1: server layer)
-- POLICY §KPI-SCOPE-SINGLE-VOCABULARY (amended: a grouped scope owns a target)
-- Additive only: no DDL on tables, no historical row rewritten.
-- ============================================================================

-- 1) The one place a scope word becomes an org_kpi_values / kpis column.
CREATE OR REPLACE FUNCTION public.kpi_scope_target_column(p_scope text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_scope
    WHEN 'division'      THEN 'division_id'
    WHEN 'business_unit' THEN 'business_unit_id'
    WHEN 'department'    THEN 'department_id'
    WHEN 'location'      THEN 'location_id'
    WHEN 'pms_grade'     THEN 'pms_grade_id'
    WHEN 'level'         THEN 'level_id'
    WHEN 'employee'      THEN 'employee_id'
    ELSE NULL                       -- organization / individual carry no target
  END
$$;

-- 2) Picker source: every target a scope can address, with live reach.
CREATE OR REPLACE FUNCTION public.kpi_scope_options(p_scope text)
RETURNS TABLE(target_id uuid, label text, code text, employee_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_scope = 'division' THEN
    RETURN QUERY
      SELECT dv.id, dv.name::text, dv.code::text,
             (SELECT count(*)::int FROM public.profiles p
                JOIN public.departments d ON d.id = p.department_id
                JOIN public.business_units b ON b.id = d.business_unit_id
               WHERE p.is_active AND b.division_id = dv.id)
      FROM public.divisions dv ORDER BY dv.name;

  ELSIF p_scope = 'business_unit' THEN
    RETURN QUERY
      SELECT b.id, b.name::text, b.code::text,
             (SELECT count(*)::int FROM public.profiles p
                JOIN public.departments d ON d.id = p.department_id
               WHERE p.is_active AND d.business_unit_id = b.id)
      FROM public.business_units b ORDER BY b.name;

  ELSIF p_scope = 'department' THEN
    RETURN QUERY
      SELECT d.id, d.name::text, d.code::text,
             (SELECT count(*)::int FROM public.profiles p
               WHERE p.is_active AND p.department_id = d.id)
      FROM public.departments d ORDER BY d.name;

  ELSIF p_scope = 'location' THEN
    RETURN QUERY
      SELECT l.id, l.name::text, l.code::text,
             (SELECT count(*)::int FROM public.profiles p
               WHERE p.is_active AND p.location_id = l.id)
      FROM public.locations l WHERE COALESCE(l.is_active, true) ORDER BY l.name;

  ELSIF p_scope = 'pms_grade' THEN
    RETURN QUERY
      SELECT g.id, g.name::text, g.code::text,
             (SELECT count(*)::int FROM public.profiles p
               WHERE p.is_active AND p.pms_grade_id = g.id)
      FROM public.pms_grades g ORDER BY g.name;

  ELSIF p_scope = 'level' THEN
    RETURN QUERY
      SELECT lv.id, lv.name::text, lv.code::text,
             (SELECT count(*)::int FROM public.profiles p
               WHERE p.is_active AND p.level_id = lv.id)
      FROM public.levels lv ORDER BY lv.name;

  ELSIF p_scope = 'employee' THEN
    RETURN QUERY
      SELECT p.id, p.full_name::text, p.employee_code::text, 1
      FROM public.profiles p WHERE p.is_active ORDER BY p.full_name;

  ELSE
    RETURN;  -- organization / individual: no target to pick
  END IF;
END;
$$;

-- 3) Guardrail: how many people a chosen target reaches, and how many active
--    employees cannot be placed because the master record lacks that key.
CREATE OR REPLACE FUNCTION public.kpi_scope_population_summary(
  p_scope text,
  p_target_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reach int := 0;
  v_missing int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*) INTO v_reach
  FROM public.resolve_scope_population(
    p_scope,
    CASE WHEN p_scope = 'division'      THEN p_target_id END,
    CASE WHEN p_scope = 'business_unit' THEN p_target_id END,
    CASE WHEN p_scope = 'department'    THEN p_target_id END,
    CASE WHEN p_scope = 'location'      THEN p_target_id END,
    CASE WHEN p_scope = 'pms_grade'     THEN p_target_id END,
    CASE WHEN p_scope = 'level'         THEN p_target_id END,
    CASE WHEN p_scope = 'employee'      THEN p_target_id END
  );

  SELECT count(*) INTO v_missing
  FROM public.profiles p
  WHERE p.is_active
    AND CASE p_scope
      WHEN 'division'      THEN p.department_id IS NULL
      WHEN 'business_unit' THEN p.department_id IS NULL
      WHEN 'department'    THEN p.department_id IS NULL
      WHEN 'location'      THEN p.location_id IS NULL
      WHEN 'pms_grade'     THEN p.pms_grade_id IS NULL
      WHEN 'level'         THEN p.level_id IS NULL
      ELSE false
    END;

  RETURN jsonb_build_object(
    'scope', p_scope,
    'target_id', p_target_id,
    'needs_target', public.kpi_scope_target_column(p_scope) IS NOT NULL,
    'employees', v_reach,
    'missing_key_employees', v_missing
  );
END;
$$;

-- 4) Console creation understands every scope and stamps the target column.
CREATE OR REPLACE FUNCTION public.bu_console_kpi_create(
  p_kpi jsonb, p_period text, p_year integer,
  p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  -- ADR-319 / POLICY §KPI-SCOPE-SINGLE-VOCABULARY — one vocabulary: the scope.
  v_scope_in text := COALESCE(NULLIF(p_kpi->>'scope',''), NULLIF(p_kpi->>'kind',''), 'individual');
  v_scope text;
  -- ADR-320 — a grouped scope owns exactly one target id.
  v_target uuid := NULLIF(p_kpi->>'scope_target_id','')::uuid;
  v_target_col text;
  v_name text := btrim(COALESCE(p_kpi->>'kpi_name', ''));
  v_kra text := btrim(COALESCE(p_kpi->>'kra_name', ''));
  v_cat uuid := NULLIF(p_kpi->>'category_id','')::uuid;
  v_rec record;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_created int := 0;
  v_skip_n int := 0;
  v_reason text;
  v_population uuid[];
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
  IF v_scope NOT IN ('individual','organization','department','employee',
                     'division','business_unit','location','pms_grade','level') THEN
    v_scope := 'individual';
  END IF;

  v_target_col := public.kpi_scope_target_column(v_scope);

  -- ADR-320 guardrail: a grouped scope must name its target, and that target
  -- must reach somebody — never a silent no-op.
  IF v_target_col IS NOT NULL THEN
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'Choose which % this KPI applies to before saving.', replace(v_scope, '_', ' ');
    END IF;

    SELECT array_agg(employee_id) INTO v_population
    FROM public.resolve_scope_population(
      v_scope,
      CASE WHEN v_scope = 'division'      THEN v_target END,
      CASE WHEN v_scope = 'business_unit' THEN v_target END,
      CASE WHEN v_scope = 'department'    THEN v_target END,
      CASE WHEN v_scope = 'location'      THEN v_target END,
      CASE WHEN v_scope = 'pms_grade'     THEN v_target END,
      CASE WHEN v_scope = 'level'         THEN v_target END,
      CASE WHEN v_scope = 'employee'      THEN v_target END,
      p_period, p_year
    ) AS employee_id;

    IF v_population IS NULL OR array_length(v_population, 1) IS NULL THEN
      RAISE EXCEPTION 'That % has no active employees, so this KPI would reach nobody.', replace(v_scope, '_', ' ');
    END IF;
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
      -- ADR-320: grouped scopes narrow to their resolved population.
      AND (v_population IS NULL OR p.id = ANY(v_population))
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
        division_id, business_unit_id, location_id, pms_grade_id, level_id,
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
        CASE WHEN v_scope = 'division'      THEN v_target END,
        CASE WHEN v_scope = 'business_unit' THEN v_target END,
        CASE WHEN v_scope = 'location'      THEN v_target END,
        CASE WHEN v_scope = 'pms_grade'     THEN v_target END,
        CASE WHEN v_scope = 'level'         THEN v_target END,
        p_period, p_year, 'kra_set'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', p_dry_run,
    'scope', v_scope,
    'kind', v_scope,
    'scope_target_id', v_target,
    'scope_population', COALESCE(array_length(v_population, 1), 0),
    'will_create', v_created,
    'will_skip', v_skip_n,
    'preview', v_preview,
    'skipped', v_skipped
  );
END;
$function$;

-- 5) Propagation targets: narrow by any scope's target, not just dept/employee.
CREATE OR REPLACE FUNCTION public.resolve_org_kpi_target_kpis(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_review_period text, p_review_year integer,
  p_scope text DEFAULT 'organization'::text,
  p_department_id uuid DEFAULT NULL::uuid,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_target_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(id uuid, employee_id uuid, target_value numeric, weightage numeric, r5 text, r4 text, r3 text, r2 text, r1 text, r0 text, criteria text, uom text, uom_type text, qualitative_options jsonb, threshold_mode text, is_org_level boolean, org_level_scope text, full_name text, employee_code text, department_id uuid, department_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_pop uuid[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to propagate this org KPI';
  END IF;

  -- ADR-320: for the grouped scopes the reach is the resolved population.
  IF p_scope IN ('division','business_unit','location','pms_grade','level')
     AND p_target_id IS NOT NULL THEN
    SELECT array_agg(employee_id) INTO v_pop
    FROM public.resolve_scope_population(
      p_scope,
      CASE WHEN p_scope = 'division'      THEN p_target_id END,
      CASE WHEN p_scope = 'business_unit' THEN p_target_id END,
      NULL,
      CASE WHEN p_scope = 'location'      THEN p_target_id END,
      CASE WHEN p_scope = 'pms_grade'     THEN p_target_id END,
      CASE WHEN p_scope = 'level'         THEN p_target_id END,
      NULL, p_review_period, p_review_year
    ) AS employee_id;
  END IF;

  -- Tier 1: exact normalized match on both kra and kpi
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id)
    AND (v_pop IS NULL OR k.employee_id = ANY(v_pop));

  IF FOUND THEN RETURN; END IF;

  -- Tier 2: normalized KRA match only (kpi name drift)
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id)
    AND (v_pop IS NULL OR k.employee_id = ANY(v_pop));

  IF FOUND THEN RETURN; END IF;

  -- Tier 3: fuzzy substring on KRA
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) LIKE '%' || v_kra_norm || '%'
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id)
    AND (v_pop IS NULL OR k.employee_id = ANY(v_pop));
END;
$function$;

-- 6) Re-scoping across the new dimensions: a generic re-key that maps every
--    old row to the employees it reached, then re-aggregates onto the new key.
--    The legacy organization/department/employee paths are untouched and keep
--    running in migrate_okv_on_scope_change.
CREATE OR REPLACE FUNCTION public.migrate_okv_scope_generic(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_review_period text, p_review_year integer,
  p_old_scope text, p_new_scope text,
  p_old_target uuid DEFAULT NULL,
  p_new_target uuid DEFAULT NULL,
  p_triggered_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_col text := public.kpi_scope_target_column(p_new_scope);
  v_written int := 0;
  v_value numeric;
  v_status text;
  v_new_id uuid;
BEGIN
  IF p_old_scope = p_new_scope AND COALESCE(p_old_target::text,'') = COALESCE(p_new_target::text,'') THEN
    RETURN jsonb_build_object('action', 'noop', 'written', 0);
  END IF;

  -- Carry the old reading forward: the average of every value the KPI holds
  -- for this period, with the strongest status inherited.
  SELECT AVG(v.achieved_value),
         CASE
           WHEN bool_or(v.status = 'approved')   THEN 'approved'
           WHEN bool_or(v.status = 'propagated') THEN 'propagated'
           ELSE 'draft'
         END
    INTO v_value, v_status
  FROM public.org_kpi_values v
  WHERE v.category_id = p_category_id
    AND public.normalize_kpi_text(v.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(v.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND v.review_period = p_review_period
    AND v.review_year = p_review_year;

  INSERT INTO public.okv_migration_history
    (category_id, kra_name, kpi_name, review_period, review_year,
     action, old_scope, new_scope, triggered_by)
  VALUES
    (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
     'rekey', p_old_scope, p_new_scope, p_triggered_by);

  DELETE FROM public.org_kpi_values v
  WHERE v.category_id = p_category_id
    AND public.normalize_kpi_text(v.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(v.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND v.review_period = p_review_period
    AND v.review_year = p_review_year;

  IF v_new_col IS NULL THEN
    INSERT INTO public.org_kpi_values
      (category_id, kra_name, kpi_name, review_period, review_year,
       achieved_value, status, org_level_scope, entered_by)
    VALUES
      (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
       v_value, COALESCE(v_status, 'draft'), p_new_scope, p_triggered_by)
    RETURNING id INTO v_new_id;
  ELSE
    EXECUTE format(
      'INSERT INTO public.org_kpi_values
         (category_id, kra_name, kpi_name, review_period, review_year,
          achieved_value, status, org_level_scope, %I, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', v_new_col)
    INTO v_new_id
    USING p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
          v_value, COALESCE(v_status, 'draft'), p_new_scope, p_new_target, p_triggered_by;
  END IF;

  v_written := 1;

  RETURN jsonb_build_object(
    'action', 'rekey', 'written', v_written,
    'new_scope', p_new_scope, 'new_target', p_new_target,
    'carried_value', v_value, 'status', COALESCE(v_status, 'draft'),
    'new_okv_id', v_new_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_scope_target_column(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_scope_options(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_scope_population_summary(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_okv_scope_generic(uuid, text, text, text, integer, text, text, uuid, uuid, uuid) TO authenticated, service_role;